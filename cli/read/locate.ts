/**
 * What to read when the command is pointed at the root of a build rather than at one of its files.
 *
 * `ng build` writes `dist/<app>/browser/` and, with `--stats-json`, the metafile next to it — called
 * `stats.json` up to Angular 22.1 and `browser-stats.json` from 22.2, when the server half got a file
 * of its own (`server-stats.json`). Read in @angular/build itself: 22.1.8 writes `stats.json` with or
 * without a server, 22.2.0 writes `browser-stats.json` even when there is none. Asking for both paths by hand was the first thing anybody had to get right, and the
 * README naming only the old file sent people looking for something that was not there. Pointed at
 * `dist/<app>`, the command now finds both on its own and says which it found.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { scriptsIn } from '../../src/app/core/build-text/index-html';
import { STATS_NAMES } from '../../src/app/core/intake/dist-files';
import { InputError } from './read-build';

/**
 * The stats files' names that mark a folder as a build. Vue CLI's `report.json` is looked for only
 * inside the folder that was named: a name this plain is no sign of a build anywhere else.
 */
const MARKS_A_BUILD = STATS_NAMES.filter(name => name !== 'report.json');

/**
 * Folders no build is written to, and the ones that make the walk slow. `public/` and `static/`
 * hold the files a build copies, an `index.html` template among them; `src/` holds the code.
 */
const NOT_A_BUILD = new Set(['node_modules', 'src', 'public', 'static', 'e2e', 'test', 'tests', 'coverage']);

/**
 * How deep under a project a build is looked for: `dist/<app>/browser`, `build/esm-bundled`, and a
 * workspace's `apps/admin/dist`, which at three was one level out of reach: `loadline .` at the root
 * of a monorepo said there was no build in it.
 */
const BUILD_DEPTH = 4;

/**
 * Whether a folder is walked into. Nitro's `.output/public` is a build although it is called
 * `public`: Nuxt writes the site there, and `loadline .` in a Nuxt project found nothing.
 */
const walked = (parent: string, name: string): boolean =>
    (!name.startsWith('.') || name === '.output') &&
    (!NOT_A_BUILD.has(name) || (name === 'public' && basename(parent) === '.output'));

const isFile = async (path: string): Promise<boolean> => {
    try {
        const info = await stat(path);
        return info.isFile();
    } catch {
        return false;
    }
};

const isDirectory = async (path: string): Promise<boolean> => {
    try {
        const info = await stat(path);
        return info.isDirectory();
    } catch {
        return false;
    }
};

export interface Located {
    /** What is analysed: the metafile when one was found, otherwise the folder as it was given. */
    target: string;
    /** The browser folder, when it was found rather than given. */
    dist: string | null;
    /** The files found, for the line that says so. Empty when nothing was looked up. */
    found: string[];
    /**
     * The other builds a project folder held, when it held more than one — Polymer writes three —
     * and the newest was taken. Absent when there was nothing to choose between.
     */
    others?: string[];
}

/**
 * A folder that is a build: a metafile in it, or a page naming a script that is there below it.
 *
 * The page has to name one. A folder of sources with an `index.html` template is no build — ember's
 * `app/` names `{{rootURL}}assets/vendor.js`, which nothing below it is, and Vite's root names
 * `/src/main.ts` — and taken for one it was offered as "also found".
 */
const isBuild = async (folder: string, names: readonly string[]): Promise<boolean> => {
    if (MARKS_A_BUILD.some(name => names.includes(name))) {
        return true;
    }
    const page = names.find(name => /^index(?:\.[\w-]+)?\.html$/i.test(name));
    if (!page) {
        return false;
    }
    try {
        const scripts = scriptsIn(await readFile(join(folder, page), 'utf8'));
        const named = new Set([...scripts.names, ...scripts.entries, ...scripts.legacy]);
        const below = await readdir(folder, { recursive: true });
        return below.some(path => named.has(basename(path)) && !path.includes('node_modules'));
    } catch {
        return false;
    }
};

/**
 * Whether the page of a build starts it as ES modules: the build a current browser runs, when a
 * project writes several at once — Polymer's `esm-bundled`, `es6-bundled` and `es5-bundled` come
 * out of one command within the same second, and which of them was read was down to the clock.
 */
const servesModules = async (folder: string): Promise<boolean> => {
    try {
        return /<script\s[^>]*\btype\s*=\s*["']?module/i.test(await readFile(join(folder, 'index.html'), 'utf8'));
    } catch {
        return false;
    }
};

/** Builds written this close together were written by one command: the time does not choose between them. */
const SAME_BUILD_MS = 5000;

/** When the page or the metafile of a build was last written: the newest build is the one meant. */
const writtenAt = async (folder: string, names: readonly string[]): Promise<number> => {
    const marker = [...MARKS_A_BUILD, 'index.html'].find(name => names.includes(name));
    if (!marker) {
        return 0;
    }
    try {
        const info = await stat(join(folder, marker));
        return info.mtimeMs;
    } catch {
        return 0;
    }
};

/**
 * The builds inside a project folder, newest first.
 *
 * `loadline .` in the root of a project is the first thing anybody types, and it read the project as
 * a build: a walk through `node_modules` that took 51 seconds on an Angular 8 project, then the
 * `index.html` template of the root — or none — and a message saying the folder had no page. A build
 * is wherever a page sits with scripts beside it, or a metafile, whatever the tool called the folder:
 * `dist`, `build`, `www`, `out`, `__sapper__/export`, `dist/<app>`, `build/esm-bundled`. Not a list
 * of names, so a tool that does not exist yet is found the same way.
 */
const buildsUnder = async (project: string): Promise<string[]> => {
    const found: { folder: string; at: number; modules: boolean }[] = [];
    let level = [project];

    for (let depth = 0; depth < BUILD_DEPTH && level.length > 0; depth++) {
        const next: string[] = [];
        for (const folder of level) {
            let entries;
            try {
                entries = await readdir(folder, { withFileTypes: true });
            } catch {
                continue;
            }
            const names = entries.filter(entry => entry.isFile()).map(entry => entry.name);
            if (folder !== project && (await isBuild(folder, names))) {
                found.push({ folder, at: await writtenAt(folder, names), modules: await servesModules(folder) });
                continue;
            }
            for (const entry of entries) {
                if (entry.isDirectory() && walked(folder, entry.name)) {
                    next.push(join(folder, entry.name));
                }
            }
        }
        level = next;
    }

    const newest = Math.max(...found.map(entry => entry.at));
    const recent = (entry: (typeof found)[number]): boolean => newest - entry.at < SAME_BUILD_MS;
    // The builds of the last command first, the one a current browser runs first among them, then
    // the rest by age; the path settles what is left, so the same folders always give the same answer.
    return found
        .toSorted(
            (a, b) =>
                Number(recent(b)) - Number(recent(a)) ||
                (recent(a) ? Number(b.modules) - Number(a.modules) : 0) ||
                b.at - a.at ||
                a.folder.localeCompare(b.folder),
        )
        .map(entry => entry.folder);
};

/**
 * @param target what was typed: a metafile, a browser folder or the root of a build.
 * @param dist   `--dist`, when it was given. Anything typed by hand wins: nothing is looked up then.
 */
export const locateBuild = async (target: string, dist: string | null): Promise<Located> => {
    // The page of the build named instead of its folder: what was meant is the folder it sits in,
    // and reading the HTML as a stats file answered "is not valid JSON".
    if (!dist && /\.html?$/i.test(target) && (await isFile(target))) {
        const folder = dirname(target);
        const located = await locateBuild(folder, null);
        return { ...located, found: located.found.length > 0 ? located.found : [folder] };
    }
    if (dist || !(await isDirectory(target))) {
        return { target, dist, found: [] };
    }

    const browser = join(target, 'browser');
    const hasBrowser = await isDirectory(browser);
    let stats: string | null = null;
    for (const name of STATS_NAMES) {
        const candidate = join(target, name);
        if (await isFile(candidate)) {
            stats = candidate;
            break;
        }
    }

    if (stats) {
        // webpack writes its stats inside the folder it builds — Angular 8 `dist/stats-es2015.json`,
        // Create React App `build/bundle-stats.json` — and that folder is the one to weigh. Taken
        // for a folder with nothing but the stats in it, an Angular 8 build was read in raw bytes.
        const home = (await isFile(join(target, 'index.html'))) ? target : null;
        const folder = hasBrowser ? browser : home;
        return { target: stats, dist: folder, found: folder ? [stats, folder] : [stats] };
    }
    // No metafile: the browser folder is read as a graph, the way a folder always has been.
    if (hasBrowser) {
        return { target: browser, dist: null, found: [browser] };
    }

    // The root of a project rather than of a build: the build is somewhere inside it.
    if (await isFile(join(target, 'package.json'))) {
        const [newest, ...others] = await buildsUnder(target);
        if (newest) {
            const located = await locateBuild(newest, null);
            return {
                ...located,
                found: located.found.length > 0 ? located.found : [newest],
                ...(others.length > 0 && { others }),
            };
        }
        if (!(await isFile(join(target, 'index.html'))) || (await isDirectory(join(target, 'node_modules')))) {
            throw new InputError(t => t.projectNotBuilt(target));
        }
    }
    return { target, dist, found: [] };
};
