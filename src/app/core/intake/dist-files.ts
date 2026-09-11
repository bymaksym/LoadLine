import { isMetafile } from '../analysis/metafile.types';
import { isSnapshot } from '../baseline/baseline';
import { isLoadlineConfig } from '../config/loadline-config';
import { type BundleFile } from './bundle-graph.types';

/** Which of the dropped files goes where. Decided by name first, by content when the name says nothing. */
export type IntakeKind = 'stats' | 'baseline' | 'context' | 'lock' | 'audit' | 'config' | 'unknown';

/** The files that make up the build output, the only ones worth compressing. */
export const isAsset = (name: string): boolean => /\.(?:m?js|css)$/i.test(name);

/**
 * Files worth reading as text, to find which names anything in the folder mentions.
 *
 * More than the code on purpose: a web app manifest names the icons and a `robots.txt` names a
 * sitemap. Reading only the chunks reported both of those as files nothing reaches — a wrong
 * answer given with exactly the same confidence as a right one.
 */
export const isSearchable = (name: string): boolean => /\.(?:m?js|css|json|webmanifest|xml|txt|svg)$/i.test(name);

/**
 * The content hash of a file, for telling "two files of the same size" from "the same file twice".
 *
 * Only worth doing on what a duplicate would be — a font, a picture — and only below a size where
 * reading the whole thing into memory is reasonable. A fifty-megabyte video is left uncompared and
 * the report says so, rather than reporting "no duplicates" and meaning "nobody looked".
 */
export const hashOf = async (file: File): Promise<string | null> => {
    if (file.size > 8 * 1024 * 1024 || typeof crypto?.subtle?.digest !== 'function') {
        return null;
    }

    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Files read for the project context: what the pipeline builds and which budgets apply.
 *
 * Any YAML is accepted, because a pipeline file can be called anything and asking somebody to
 * rename theirs would be worse. What a dropped `docker-compose.yml` gets is not a place in the
 * report: whether it actually is a pipeline is decided after reading it, by whether anything in it
 * looks like a build.
 */
export const isContextName = (name: string): boolean =>
    name === 'angular.json' || name === 'package.json' || /\.ya?ml$/i.test(name) || /^jenkinsfile$/i.test(name);

/** A lock file, in any of the three formats a package manager writes. */
export const isLockName = (name: string): boolean =>
    /^(?:package-lock|npm-shrinkwrap)\.json$/i.test(name) || /^(?:pnpm-lock\.ya?ml|yarn\.lock)$/i.test(name);

/**
 * What a file compresses to, done in the browser. Streamed rather than read whole: a build folder
 * is tens of megabytes, and nothing here needs the bytes themselves, only how many come out.
 */
export const gzipSize = async (file: File): Promise<number> => {
    const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
    const reader = stream.getReader();
    let size = 0;

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            size += value.length;
        }
    } finally {
        reader.releaseLock();
    }

    return size;
};

/** Every asset of the folder, compressed. Keyed by file name, which is how the metafile names them. */
export const gzipSizes = async (
    files: File[],
    onProgress?: (done: number, total: number) => void,
): Promise<Map<string, number>> => {
    const sizes = new Map<string, number>();
    for (const file of files) {
        sizes.set(file.name, await gzipSize(file));
        // Tens of megabytes go through here one file at a time, and the page used to say nothing
        // about it beyond one line of grey text that never changed.
        onProgress?.(sizes.size, files.length);
    }

    return sizes;
};

/**
 * Sizes of the pre-compressed files of the folder. Nothing has to be decompressed: the size of a
 * `.br` file *is* the brotli figure.
 */
export const brotliSizes = (files: File[]): Map<string, number> => {
    const sizes = new Map<string, number>();
    for (const file of files) {
        // `.br` is what every server and every plugin writes; `.brotli` turns up often enough that
        // not reading it means silently showing gzip figures on a folder that had brotli ones.
        const found = /^(.*\.(?:m?js|css))\.(?:br|brotli)$/i.exec(file.name);
        if (found?.[1]) {
            sizes.set(found[1], file.size);
        }
    }

    return sizes;
};

/**
 * The picked folder as the folder reader takes it: each file with its path **inside** the folder.
 *
 * A directory picker reports `browser/assets/main-A1B2C3.js`, which names the folder somebody
 * happened to pick; what a chunk writing `./sibling.js` means is `assets/sibling.js`, from the root
 * of the build. Dropping the first segment is what makes the two line up.
 */
export const bundleFilesOf = (files: readonly File[]): BundleFile[] =>
    files.map(file => {
        const inside = (file.webkitRelativePath || '').split('/').slice(1).join('/');
        return { path: inside || file.name, bytes: file.size, text: () => file.text() };
    });

/** What a dropped file is, without loading it. Cheap: reads the name, then the JSON if needed. */
export const sniff = async (file: File): Promise<IntakeKind> => {
    // A lock file is decided by its name, before anything is read: `pnpm-lock.yaml` would otherwise
    // be taken for a pipeline by the rule above, which accepts any YAML.
    if (isLockName(file.name)) {
        return 'lock';
    }
    if (isContextName(file.name)) {
        return 'context';
    }
    if (!/\.json$/i.test(file.name)) {
        return 'unknown';
    }

    try {
        const parsed: unknown = JSON.parse(await file.text());
        if (isSnapshot(parsed)) {
            return 'baseline';
        }
        if (isLoadlineConfig(parsed)) {
            return 'config';
        }
        if (isMetafile(parsed)) {
            return 'stats';
        }
        // An audit report has no name of its own — people redirect it to whatever they like — so it
        // is recognised by the two shapes npm and pnpm write.
        const shape = parsed as { vulnerabilities?: unknown; advisories?: unknown };
        return shape.vulnerabilities || shape.advisories ? 'audit' : 'unknown';
    } catch {
        return 'unknown';
    }
};

/**
 * What the page asks for before it can paint, besides the code.
 *
 * Three figures rather than one because the report is shown in three units, and a stylesheet
 * quoted in gzip next to a bootstrap quoted in raw bytes would be the same mistake this exists to
 * fix. `brotli` is `null` unless the folder carried the pre-compressed files.
 */
export interface PageCss {
    files: string[];
    raw: number;
    gzip: number;
    brotli: number | null;
}

/**
 * The stylesheets the page names, weighed with the same maps every other figure is weighed with.
 *
 * A name the folder does not hold is dropped rather than counted as zero: a page left over from
 * another build would otherwise add a stylesheet of no bytes to the first load and say nothing.
 */
export const pageCssOf = (
    named: readonly string[],
    sizes: { raw: ReadonlyMap<string, number>; gzip: ReadonlyMap<string, number>; brotli: ReadonlyMap<string, number> },
): PageCss | null => {
    const files = named.filter(name => sizes.raw.has(name));
    if (files.length === 0) {
        return null;
    }

    const total = (from: ReadonlyMap<string, number>) => files.reduce((sum, file) => sum + (from.get(file) ?? 0), 0);
    const brotli = files.every(file => sizes.brotli.has(file)) ? total(sizes.brotli) : null;

    return { files, raw: total(sizes.raw), gzip: total(sizes.gzip), brotli };
};
