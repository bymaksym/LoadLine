/**
 * What a folder holds that no import reaches, and what to make of it.
 *
 * The graph read out of the chunks (`bundle-graph.ts`) has every edge an `import` writes. A build
 * also holds files no `import` names: chunks a loader older than `import()` finds by an id, the
 * copy for browsers without ES modules, a service worker, the leftovers of an old build. Each of
 * them used to land in "nothing reaches these", and the first kind cost whole applications their
 * screens. This file tells them apart, and only ever touches what the imports left over — a build
 * every chunk of which is already reached comes out exactly as it did.
 */

import { type OffPageKind } from '../analysis/metafile.types';
import { baseName } from '../format/format.utils';

const JS_FILE = /\.m?js$/i;

/** What this needs of a read chunk: its edges, and the files it names in a plain string. */
export interface ChunkEdges {
    statics: string[];
    dynamics: { target: string; from: string | null }[];
    mentions: string[];
}

/**
 * The names a string can call a chunk by, each to the files it could mean.
 *
 * The file name with and without its extension, and — when it looks like a hash rather than a word
 * — the part before the first dot: Stencil lists its components as `"p-w91mnxr1"` and loads
 * `p-w91mnxr1.entry.js`. A plain word (`index`, `polyfills`, `vendor`) is never a key: it is what
 * every bundle says in passing, and a match on it would tie two files that have nothing to do with
 * each other.
 */
export const mentionKeysOf = (paths: readonly string[]): Map<string, string[]> => {
    const keys = new Map<string, string[]>();
    const add = (key: string, path: string) => {
        const known = keys.get(key) ?? [];
        if (!known.includes(path)) {
            keys.set(key, [...known, path]);
        }
    };

    for (const path of paths) {
        const name = baseName(path);
        const bare = name.replace(JS_FILE, '');
        add(name, path);
        const stem = bare.split('.', 1)[0] ?? '';
        if (stem.length >= 8 && /[\d\-_]/.test(stem) && stem !== bare) {
            add(stem, path);
        }
        if (/[\d\-_.]/.test(bare)) {
            add(bare, path);
        }
    }

    return keys;
};

/** The file a string inside a chunk names, by the keys of `mentionKeysOf`; `null` when none or several. */
export const mentionedBy = (literal: string, keys: ReadonlyMap<string, string[]>): string | null => {
    const name = baseName(literal.replace(/[?#].*$/, ''));
    const found = keys.get(name);
    return found?.length === 1 ? (found[0] ?? null) : null;
};

/** Every chunk reachable from `seeds` over its imports, static and lazy, and over `extra` when asked. */
export const reachOver = (
    read: ReadonlyMap<string, ChunkEdges>,
    seeds: Iterable<string>,
    extra: (info: ChunkEdges) => readonly string[] = () => [],
): Set<string> => {
    const seen = new Set<string>();
    const stack = [...seeds];

    while (stack.length > 0) {
        const chunk = stack.pop() ?? '';
        const info = read.get(chunk);
        if (!info || seen.has(chunk)) {
            continue;
        }
        seen.add(chunk);
        stack.push(...info.statics, ...info.dynamics.map(entry => entry.target), ...extra(info));
    }

    return seen;
};

/**
 * The last way in: a chunk no import reaches, named in a plain string by a chunk the application
 * does reach, is taken as loaded on demand by it.
 *
 * It is what a loader older than `import()`, or one that builds the name at run time, leaves to
 * read. Stencil's entry lists its components as `["p-w91mnxr1", …]` and loads them with
 * ``import(`./${id}.entry.js`)``; Polymer's AMD build loads its views with `require(["./my-view1.js"])`
 * under a name the minifier chose. Without it a Stencil app read as zero screens with 33 of its 36
 * chunks "in no figure here", and a Polymer one as a 2 kB loader and nothing else.
 *
 * It only ever touches what nothing else reached, so a build every chunk of which is already
 * accounted for — any Vite, Rollup or esbuild build — comes out exactly as it did before. And it is
 * repeated, because a component reached this way can name the next one.
 *
 * @param held files no string may pull in: the `nomodule` copy and the service workers, which are
 *             named in the code of the page on purpose and are no part of a screen.
 * @returns the chunks it added, each now a lazy target of the chunk that named it.
 */
export const lazyByName = (
    read: Map<string, ChunkEdges>,
    roots: readonly string[],
    held: ReadonlySet<string>,
): Set<string> => {
    const added = new Set<string>();

    for (let reached = reachOver(read, roots), grew = true; grew; reached = reachOver(read, roots)) {
        grew = false;
        for (const chunk of reached) {
            const info = read.get(chunk);
            const mentioned = info?.mentions ?? [];
            for (const target of mentioned) {
                if (reached.has(target) || held.has(target) || added.has(target)) {
                    continue;
                }
                info?.dynamics.push({ target, from: null });
                added.add(target);
                grew = true;
            }
        }
    }

    return added;
};

/** A file of Ember's server-side renderer, by its name. */
const FASTBOOT = /(?:^|[-_.])fastboot[-_.]/i;

/**
 * Files of the build no screen downloads, and why: what only the `nomodule` scripts reach is the
 * copy for browsers without ES modules, and what only a service worker reaches runs beside the page.
 * Whatever the application itself reaches stays in, whoever else reaches it too.
 */
export const offPageOf = (
    read: ReadonlyMap<string, ChunkEdges>,
    roots: readonly string[],
    legacyRoots: readonly string[],
    workerRoots: ReadonlySet<string>,
): Map<string, OffPageKind> => {
    const modern = reachOver(read, roots);
    const offPage = new Map<string, OffPageKind>();
    const withMentions = (info: ChunkEdges) => info.mentions;

    for (const chunk of reachOver(read, legacyRoots, withMentions)) {
        if (!modern.has(chunk)) {
            offPage.set(chunk, 'legacy');
        }
    }
    for (const chunk of reachOver(read, workerRoots)) {
        if (!modern.has(chunk) && !offPage.has(chunk)) {
            offPage.set(chunk, 'service-worker');
        }
    }
    // Ember writes what only FastBoot runs into the folder it deploys (`fetch-fastboot-….js`,
    // `auto-import-fastboot-….js`): server code, and it was listed as what nothing reaches.
    for (const chunk of read.keys()) {
        if (!modern.has(chunk) && !offPage.has(chunk) && FASTBOOT.test(chunk.split('/').pop() ?? chunk)) {
            offPage.set(chunk, 'server');
        }
    }

    return offPage;
};
