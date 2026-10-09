/**
 * Exclusive weight: what the first load would lose if one thing were gone.
 *
 * It is the figure the rest of the report was missing, and without it half of any list of actions
 * is in the wrong order. The bootstrap breakdown says `chart.js` weighs 310 kB. If 240 of those
 * are `d3`, which three other things also pull in, then removing `chart.js` saves 70 kB and the
 * afternoon spent on it buys a fifth of what the number promised.
 *
 * How it is worked out: walk the static import graph from where the application starts, once with
 * everything and once with the candidate's files taken out. What stops arriving is what only came
 * in through it. That is the definition of a dominator, computed the direct way — one walk per
 * candidate — rather than by building a dominator tree, because a dominator tree answers the
 * question for single **nodes** and every candidate here is a **set**: a package is all its files,
 * a folder is all of them too, and the union of what several nodes dominate is not what the set
 * dominates.
 *
 * The figure is raw minified bytes inside the chunk, like every other figure measured at file
 * level: gzip compresses a chunk as a whole, so there is no compressed share of one module.
 */

import { type ModuleGraph, reachIds } from './module-graph';

export interface ExclusiveWeigher {
    /** What the bootstrap would lose without these files. Their own bytes included. */
    of: (files: Iterable<string>) => number;
    /** The bootstrap bytes of one source file, which is what `of` adds up. */
    bytesOf: (file: string) => number;
    /** Everything the bootstrap holds, as this walk sees it: the ceiling of any saving. */
    total: number;
}

/**
 * @param graph      the whole source graph.
 * @param roots      the source files the application starts at: the entry point of the main chunk
 *                   plus any other entry the page starts as well.
 * @param bootBytesOf what one source file weighs inside the bootstrap chunks. `0` for a file that
 *                   ships somewhere else, which is what makes the answer about the first load and
 *                   not about the bundle.
 */
export const exclusiveWeigher = (
    graph: ModuleGraph,
    roots: readonly string[],
    bootBytesOf: (file: string) => number,
): ExclusiveWeigher => {
    const rootIds = roots.map(file => graph.index.get(file)).filter(id => id !== undefined);
    const weights = new Float64Array(graph.nodes.length);
    for (const [id, path] of graph.nodes.entries()) {
        weights[id] = bootBytesOf(path);
    }

    const whole = reachIds(graph, rootIds, graph.statics);
    let total = 0;
    for (let id = 0; id < graph.nodes.length; id++) {
        if (whole[id] === 1) {
            total += weights[id] ?? 0;
        }
    }

    return {
        total,
        bytesOf: file => {
            const id = graph.index.get(file);
            return id === undefined ? 0 : (weights[id] ?? 0);
        },
        of: files => {
            const skip = new Set<number>();
            for (const file of files) {
                const id = graph.index.get(file);
                if (id !== undefined) {
                    skip.add(id);
                }
            }
            if (skip.size === 0) {
                return 0;
            }

            const without = reachIds(graph, rootIds, graph.statics, skip);
            let saved = 0;
            for (let id = 0; id < graph.nodes.length; id++) {
                if (whole[id] === 1 && without[id] === 0) {
                    saved += weights[id] ?? 0;
                }
            }
            return saved;
        },
    };
};

/**
 * The exclusive weight of every bucket of the bootstrap breakdown.
 *
 * One walk per bucket, and a bucket is a package or a folder of the project. On the builds this
 * has been run against — a hundred and sixty buckets over twenty thousand modules — that is a few
 * hundred milliseconds, which is why it is computed once with the analysis and not per keystroke.
 *
 * A bucket whose exclusive weight equals its total weight is the ordinary case: nothing else
 * shares it. The interesting ones are where the two figures disagree, and the report says both.
 */
export const exclusiveByBucket = (
    weigher: ExclusiveWeigher,
    filesByBucket: ReadonlyMap<string, string[]>,
): Map<string, number> => {
    const exclusive = new Map<string, number>();
    for (const [bucket, files] of filesByBucket) {
        exclusive.set(bucket, weigher.of(files));
    }
    return exclusive;
};
