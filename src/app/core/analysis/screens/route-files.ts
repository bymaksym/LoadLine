/**
 * What a screen reached through a lazy route file pays for, and what the lazy entries that are not
 * screens add up to. Kept out of `analysis.ts`, which only calls them.
 */

import { routeLabel, type RouteRef } from '../../build-text/route-table';
import { isDependency } from '../../format/ownership';
import { type NotScreen } from '../analysis.types';
import { type Metafile } from '../metafile.types';
import { depthOf, wavesFrom } from './delivery';

/** A lazy entry as the analysis carries it: its chunk and every chunk it pulls in statically. */
interface LazyEntry {
    chunk: string;
    set: Set<string>;
}

/** Most route files nested in front of a screen that is still believed: a cycle has no end. */
const MAX_DEPTH = 8;

/**
 * The route files each screen is reached through, outermost first, and the chunks it downloads
 * with them. A lazy `profile.routes.ts` is downloaded before the screens under it, together with
 * whatever it imports statically — in Angular RealWorld, the profile header every profile screen
 * shows — and those bytes and that trip belonged to no screen: the two profile screens read 2.8 kB
 * and two trips short.
 *
 * Only when every chunk asking for the screen is one of those route files: a screen the router can
 * also reach directly does not have to wait for one.
 */
export const reachedThrough = <T extends LazyEntry>(
    screens: readonly T[],
    groupers: readonly T[],
    outputs: Metafile['outputs'],
): Map<string, { via: T[]; set: Set<string> }> => {
    const byChunk = new Map(groupers.map(grouper => [grouper.chunk, grouper]));
    const importers = new Map<string, string[]>();
    for (const [file, out] of Object.entries(outputs)) {
        const lazy = (out.imports ?? []).filter(imp => imp.kind === 'dynamic-import');
        for (const imp of lazy) {
            importers.set(imp.path, [...(importers.get(imp.path) ?? []), file]);
        }
    }

    const viaOf = (chunk: string): T[] => {
        const chain: T[] = [];
        for (let at = chunk; chain.length < MAX_DEPTH;) {
            const asking = importers.get(at) ?? [];
            const grouper = asking.length > 0 ? byChunk.get(asking[0] ?? '') : undefined;
            if (!grouper || asking.some(file => !byChunk.has(file)) || chain.includes(grouper)) {
                break;
            }
            chain.unshift(grouper);
            at = grouper.chunk;
        }
        return chain;
    };

    return new Map(
        screens.map(entry => {
            const via = viaOf(entry.chunk);
            return [entry.chunk, { via, set: new Set([...entry.set, ...via.flatMap(grouper => [...grouper.set])]) }];
        }),
    );
};

/**
 * The round trips of a screen: the route files it is reached through arrive first, one after
 * another, and its own chunks start once the last of them has been parsed. What the loader asks for
 * alongside a chunk starts in the same trip as it (`parallel`).
 */
export const wavesThrough = (
    outputs: Metafile['outputs'],
    starts: readonly string[],
    boot: ReadonlySet<string>,
    parallel: ReadonlyMap<string, readonly string[]> | null,
): Map<string, number> => {
    const waves = new Map<string, number>();
    for (const chunk of starts) {
        const offset = depthOf(waves);
        const seeds = [chunk, ...(parallel?.get(chunk) ?? [])];
        for (const [reached, trip] of wavesFrom(outputs, seeds, boot)) {
            if (!waves.has(reached)) {
                waves.set(reached, trip + offset);
            }
        }
    }
    return waves;
};

/**
 * The packages a screen pulls in with `await import()` when it needs them: mermaid's diagrams,
 * katex, a PDF reader. Not screens, and not nothing either — with source maps they appeared in no
 * figure and no list at all, 654 kB of Excalidraw among them.
 *
 * @param lazyHere a lazy target reachable from the entry and not in the first load: one asked for
 *                 lazily and statically both is in the first load, and says so there.
 */
export const packagesOnDemand = (
    entries: readonly [string, Metafile['outputs'][string]][],
    lazyHere: (chunk: string) => boolean,
): { chunk: string; source: string }[] =>
    entries
        .filter(([file, out]) => lazyHere(file) && isDependency(out.entryPoint ?? ''))
        .map(([file, out]) => ({ chunk: file, source: out.entryPoint ?? '' }));

/**
 * One row per package: mermaid writes a chunk per diagram type, and twenty-seven rows of "mermaid"
 * say less than one with all of them added up.
 */
export const byLabel = (rows: readonly NotScreen[]): NotScreen[] =>
    [
        ...rows
            .reduce((merged, row) => {
                const known = merged.get(row.label);
                merged.set(row.label, known ? { ...known, bytes: known.bytes + row.bytes } : row);
                return merged;
            }, new Map<string, NotScreen>())
            .values(),
    ].toSorted((a, b) => b.bytes - a.bytes);

/**
 * The chunks the route table sends a route to, when there is a table: two routes at least, because
 * one `{ path, component: () => import() }` can be a coincidence of naming and two are a router.
 * `null` without one, and then every lazy entry is judged the way it always was.
 */
export const routedChunks = (routes: ReadonlyMap<string, readonly RouteRef[]> | null): Set<string> | null =>
    routes && routes.size >= 2 ? new Set(routes.keys()) : null;

/**
 * What a screen is called, and the routes that open it. The label stays what the source map gave
 * it — a `gates.screens` entry is keyed on it — except when there was no map and the label would
 * be the hash in the chunk's name: then the router's name for it is the better one by far.
 */
export const routedName = (
    entry: { chunk: string; source: string },
    routes: ReadonlyMap<string, readonly RouteRef[]> | null,
    fallback: string,
): { label: string; routes: string[] } => {
    const own = routes?.get(entry.chunk) ?? [];
    // A named route first, then one with a path of its own: Angular's `path: ''` is the index of
    // wherever the routes are mounted, and three screens called "/" say nothing.
    const best = own.find(route => route.name) ?? own.find(route => route.path !== '') ?? own[0];
    const label = entry.source === entry.chunk && best ? routeLabel(best) : fallback;
    return { label, routes: own.map(route => routeLabel(route)) };
};
