/**
 * The previous run, remembered without being asked to.
 *
 * `--baseline` is the right tool for a pipeline and the wrong one for a person who has just changed
 * one import and wants to know whether the bootstrap went down: they had to export yesterday's
 * build on purpose, or compare two outputs by hand. So every run leaves its snapshot in
 * `node_modules/.cache/loadline` — where build tools keep what they can always rebuild, already
 * ignored by every repository — and the next run of the same build says what moved.
 *
 * It is a convenience, never a gate: nothing here changes the exit code, and an explicit
 * `--baseline` replaces it entirely. A machine without a `node_modules` above it simply has no
 * memory, and every failure to read or write is silent: losing the comparison is not worth an error.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { isSnapshot } from '../src/app/core/baseline/baseline';
import { type Snapshot } from '../src/app/core/baseline/baseline.types';

/** The nearest `node_modules` at or above the folder, which is where the cache belongs. */
const nodeModulesAbove = async (from: string): Promise<string | null> => {
    let folder = resolve(from);
    for (;;) {
        const candidate = join(folder, 'node_modules');
        try {
            const info = await stat(candidate);
            if (info.isDirectory()) {
                return candidate;
            }
        } catch {
            // Not here; one level up.
        }
        const parent = dirname(folder);
        if (parent === folder) {
            return null;
        }
        folder = parent;
    }
};

/** One file per build, keyed by where it is: two apps of one workspace do not overwrite each other. */
const fileFor = async (cwd: string, target: string): Promise<string | null> => {
    const modules = await nodeModulesAbove(cwd);
    if (!modules) {
        return null;
    }
    const key = createHash('sha1').update(resolve(target)).digest('hex').slice(0, 12);
    return join(modules, '.cache', 'loadline', `last-${key}.json`);
};

export const readLastRun = async (cwd: string, target: string): Promise<Snapshot | null> => {
    const file = await fileFor(cwd, target);
    if (!file) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
        return isSnapshot(parsed) ? parsed : null;
    } catch {
        return null;
    }
};

export const writeLastRun = async (cwd: string, target: string, snapshot: Snapshot): Promise<void> => {
    const file = await fileFor(cwd, target);
    if (!file) {
        return;
    }
    try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify(snapshot), 'utf8');
    } catch {
        // A read-only checkout or a full disk: the report is still right, it just will not remember.
    }
};
