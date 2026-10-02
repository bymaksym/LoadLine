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

import { stat } from 'node:fs/promises';
import { join } from 'node:path';

/** The metafile's names, newest first: the first one present wins. */
const STATS_NAMES = ['browser-stats.json', 'stats.json'] as const;

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
}

/**
 * @param target what was typed: a metafile, a browser folder or the root of a build.
 * @param dist   `--dist`, when it was given. Anything typed by hand wins: nothing is looked up then.
 */
export const locateBuild = async (target: string, dist: string | null): Promise<Located> => {
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
        return { target: stats, dist: hasBrowser ? browser : null, found: hasBrowser ? [stats, browser] : [stats] };
    }
    // No metafile: the browser folder is read as a graph, the way a folder always has been.
    return hasBrowser ? { target: browser, dist: null, found: [browser] } : { target, dist, found: [] };
};
