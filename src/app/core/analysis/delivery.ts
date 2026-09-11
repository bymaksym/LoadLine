/**
 * How each chunk reaches the browser: with the first load or only when something asks for it, and
 * in how many round trips.
 *
 * Eager and lazy come straight out of the import graph and every bundler reports them. The round
 * trips do not, and they are the half that decides when a screen finishes loading: a browser does
 * not know a chunk exists until it has downloaded and parsed the one importing it, so a screen
 * split across
 * three levels of static imports costs three sequential requests however little it weighs. On a
 * connection with 200 ms of latency that is half a second the size figures cannot see.
 */

import { baseName } from '../format/format.utils';
import { type Delivery, type Startup, type Zone } from './analysis.types';
import { type Metafile } from './metafile.types';

/** Everyone downloads the bootstrap; anything else waits for a dynamic import to ask for it. */
export const deliveryOf = (zone: Zone): Delivery => (zone === 'boot' ? 'eager' : 'lazy');

/** Edges that make the browser fetch another file as soon as it has parsed this one. */
const staticImportsOf = (outputs: Metafile['outputs'], chunk: string): string[] =>
    (outputs[chunk]?.imports ?? []).filter(imp => imp.kind === 'import-statement').map(imp => imp.path);

/**
 * Which round trip each chunk arrives in, walking out from the chunks the browser is already asking
 * for. Breadth-first, because a chunk imported from two places is fetched at the first parent that
 * reveals it, not at the deepest one.
 *
 * @param seeds chunks of the first round trip: a screen's entry, or what `index.html` names
 * @param stop  chunks that are already downloaded and end the walk — the bootstrap, seen from a screen
 */
export const wavesFrom = (
    outputs: Metafile['outputs'],
    seeds: Iterable<string>,
    stop: ReadonlySet<string> = new Set(),
): Map<string, number> => {
    const wave = new Map<string, number>();
    const queue: string[] = [];

    const reach = (chunk: string, trip: number): void => {
        if (wave.has(chunk) || stop.has(chunk) || !outputs[chunk]) {
            return;
        }

        wave.set(chunk, trip);
        queue.push(chunk);
    };

    for (const seed of seeds) {
        reach(seed, 1);
    }

    // The array iterator sees what gets pushed while iterating: this is the breadth-first queue.
    for (const chunk of queue) {
        for (const target of staticImportsOf(outputs, chunk)) {
            reach(target, (wave.get(chunk) ?? 1) + 1);
        }
    }

    return wave;
};

/** The deepest round trip of a walk, which is what the load actually takes. `0` when there is none. */
export const depthOf = (waves: ReadonlyMap<string, number>): number => Math.max(0, ...waves.values());

/**
 * How many chunks share the busiest round trip.
 *
 * Depth and width are opposite problems that the depth figure alone reports as the same one. Eight
 * chunks all found on the second trip cost **one** extra trip between them, and naming seven of
 * them in the page saves nothing; four chunks stacked one behind another cost three trips, and
 * every one named removes one. A report that only says "three trips" cannot tell the two apart,
 * and the advice that follows from each is different.
 */
export const widthOf = (waves: ReadonlyMap<string, number>): number => {
    const perWave = new Map<number, number>();
    for (const trip of waves.values()) {
        perWave.set(trip, (perWave.get(trip) ?? 0) + 1);
    }

    return Math.max(0, ...perWave.values());
};

/**
 * One deepest chain of static imports, from a chunk of the first trip down to a chunk of the last.
 *
 * This is the **critical preload set**: the chunks that are actually behind each other, and the
 * only ones where naming a file in the page removes a round trip. Everything else at the same
 * depth arrives on a trip that is being paid anyway.
 *
 * It matters because the honest version of preload advice is a short list and an explicit "not
 * these". A page carrying a tag per late chunk competes with the stylesheet that blocks rendering,
 * and has made first paint measurably worse in real projects; a page carrying two or three tags
 * that shorten the chain has not.
 *
 * @returns the chain in the order the browser discovers it. Empty when the walk has one level.
 */
export const criticalChainOf = (outputs: Metafile['outputs'], waves: ReadonlyMap<string, number>): string[] => {
    const depth = depthOf(waves);
    if (depth < 2) {
        return [];
    }

    // The deepest chunk, and among equals the heaviest: a chain is only worth naming if what sits
    // at the end of it is worth waiting for.
    const deepest = [...waves]
        .filter(([, trip]) => trip === depth)
        .toSorted((a, b) => (outputs[b[0]]?.bytes ?? 0) - (outputs[a[0]]?.bytes ?? 0))[0]?.[0];
    if (!deepest) {
        return [];
    }

    const chain = [deepest];
    let current = deepest;
    for (let trip = depth - 1; trip >= 1; trip -= 1) {
        // A parent one trip up that statically imports it: that import is the reason the browser
        // could not know about `current` any sooner.
        const parent = [...waves].find(
            ([chunk, at]) => at === trip && staticImportsOf(outputs, chunk).includes(current),
        )?.[0];
        if (!parent) {
            break;
        }

        chain.unshift(parent);
        current = parent;
    }

    return chain;
};

/**
 * The first load, measured against what `index.html` announces. Without that file the figure
 * cannot be derived — the graph alone cannot tell a preloaded chunk from one discovered by
 * parsing — so this returns `null` instead of a number.
 *
 * @param announced file names the page tells the browser to fetch, as they appear in its markup
 */
export const startupOf = (
    outputs: Metafile['outputs'],
    boot: ReadonlySet<string>,
    announced: ReadonlySet<string>,
): Startup | null => {
    const seeds = [...boot].filter(chunk => announced.has(baseName(chunk)));
    if (seeds.length === 0) {
        return null;
    }

    const waves = wavesFrom(outputs, seeds);
    const depth = Math.max(1, ...[...boot].map(chunk => waves.get(chunk) ?? 1));
    const discovered = [...boot].filter(chunk => (waves.get(chunk) ?? 1) > 1);

    // Grouped as well as listed, because "how many arrive late" is the wrong question on its own:
    // the ones sharing a trip cost that trip once between them, and the ones behind each other
    // cost one apiece. Index 0 is the second trip; nothing in the first is late.
    const byWave: string[][] = Array.from({ length: Math.max(0, depth - 1) }, () => []);
    for (const chunk of discovered) {
        byWave[(waves.get(chunk) ?? 2) - 2]?.push(chunk);
    }

    return {
        waves: depth,
        discovered,
        byWave,
        width: widthOf(waves),
        critical: criticalChainOf(outputs, waves),
    };
};
