/**
 * `--html <file>`: the page, with this build already in it.
 *
 * The page has always been the better place to *explore* a build — the treemap, the search, every
 * chunk opened — and the worse one to *get to*: it asked for the folder to be dragged in by hand,
 * which is exactly the step a script cannot do. So the command writes the same self-contained
 * `loadline.html` it ships with and puts the files it was given inside it, as they are. The page
 * reads them on start through the same door a drop goes through: the analysis runs again in the
 * browser, on the same bytes, so the two front ends cannot disagree about what they show.
 *
 * Nothing leaves the machine. The file is written where it was asked for and opened locally; a
 * report built this way can be attached to an issue and opened by anybody, offline.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { type EmbeddedBuild, type EmbeddedFile } from '../../src/app/core/intake/embedded';
import { InputError } from '../read/read-build';

/** Files read as text inside the page. Everything else is carried as bytes. */
const TEXT_FILE = /\.(?:m?js|css|html?|json|webmanifest|map|xml|txt|svg)$/i;
/** Carried for their size only: the page never reads what is inside a pre-compressed copy. */
const SIZE_ONLY = /\.(?:br|brotli|gz|zst)$/i;

/** Where `loadline.html` is: next to the package when installed, at the root of a clone otherwise. */
const pagePath = async (): Promise<string> => {
    const candidates = [
        join(__dirname, '..', '..', '..', '..', 'loadline.html'),
        join(__dirname, '..', '..', 'loadline.html'),
    ];
    for (const candidate of candidates) {
        try {
            const info = await stat(candidate);
            if (info.isFile()) {
                return candidate;
            }
        } catch {
            // The next one.
        }
    }
    throw new InputError(t => t.htmlMissing);
};

const walk = async (folder: string): Promise<string[]> => {
    const entries = await readdir(folder, { withFileTypes: true, recursive: true });
    return entries.filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name));
};

/** The build folder, file by file, the way the page's folder picker would have handed it over. */
export const embedFolder = async (folder: string): Promise<EmbeddedBuild['folder']> => {
    const files: EmbeddedFile[] = [];
    const paths = await walk(folder);
    for (const path of paths) {
        const inside = relative(folder, path).replaceAll('\\', '/');
        const { size } = await stat(path);
        if (SIZE_ONLY.test(path)) {
            files.push({ path: inside, size });
        } else if (TEXT_FILE.test(path)) {
            files.push({ path: inside, text: await readFile(path, 'utf8') });
        } else {
            // The page reads a binary only to hash it, so its hash travels instead of its bytes:
            // a report is not a backup of the build, and as base64 the fonts and pictures of one
            // build came to 18 MB of a 54 MB file.
            const sha256 = createHash('sha256')
                .update(await readFile(path))
                .digest('hex');
            files.push({ path: inside, size, sha256 });
        }
    }
    return { name: basename(folder), files };
};

export const embedText = async (path: string | null): Promise<{ name: string; text: string } | null> =>
    path ? { name: basename(path), text: await readFile(path, 'utf8') } : null;

/**
 * The page with the build inside. `</` is escaped so no file of the build can close the script tag
 * it travels in — a chunk that contains the string `</script>` is ordinary minified JavaScript.
 */
export const writeHtmlReport = async (file: string, build: EmbeddedBuild): Promise<void> => {
    const page = await readFile(await pagePath(), 'utf8');
    const json = JSON.stringify(build).replaceAll('</', String.raw`<\/`);
    const tag = `<script type="application/json" id="loadline-build">${json}</script>`;
    // The last `</body>`, not the first: the page's own inlined code mentions the tag in its strings,
    // and putting the build in front of the first one cut a script in half.
    const end = page.lastIndexOf('</body>');
    const html = end === -1 ? `${page}\n${tag}` : `${page.slice(0, end)}${tag}\n${page.slice(end)}`;
    await writeFile(file, html, 'utf8');
};

/** Opens a file with whatever the system opens HTML with. Never waits for it, never fails the run. */
export const openFile = (file: string): void => {
    const [command, args]: [string, string[]] =
        process.platform === 'win32'
            ? ['cmd', ['/c', 'start', '""', file]]
            : process.platform === 'darwin'
              ? ['open', [file]]
              : ['xdg-open', [file]];
    try {
        const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true });
        child.on('error', () => {
            // An opener that is not installed fails here, after the spawn: the file is still
            // written, and opening it was a courtesy. Listening is what keeps it from crashing.
        });
        child.unref();
    } catch {
        // No opener on this machine: the file is written and its path was printed.
    }
};
