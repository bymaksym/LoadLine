/**
 * "Why is this here": the import chain from the entry point to any name the report draws.
 *
 * The chain itself is `Analysis.chainTo`, which the search and the duplicates already use. What is
 * missing everywhere else is the *name*: a file inside a chunk is drawn by its label — `lodash/
 * debounce.js`, with the `node_modules/` prefix stripped — and asking the graph about that label
 * finds nothing, because the graph is keyed by the metafile's input paths.
 *
 * So this resolves the name first and follows the chain second. The index is built once per
 * analysis and held in a `WeakMap`: a tree of four thousand files asks four thousand times, and
 * rebuilding the map on each of those would be the difference between a click and a freeze.
 */

import { chainSteps } from '../format/format.utils';
import { type Analysis } from './analysis.types';

/** The chain to one name, ready to draw: the steps, and the path they were actually followed to. */
export interface WhyHere {
    /** Import chain from the entry point as readable steps. Never empty when this is not `null`. */
    steps: string[];
    /** The metafile input path the chain was resolved to, which is not always the name asked for. */
    path: string;
}

const indexes = new WeakMap<Analysis, ReadonlyMap<string, string>>();

/** Label → input path, for the names the tree and the folder views draw. */
const labelIndex = (analysis: Analysis): ReadonlyMap<string, string> => {
    const cached = indexes.get(analysis);
    if (cached) {
        return cached;
    }

    const index = new Map<string, string>();
    for (const module of analysis.modules) {
        // First one wins: with two copies of a package installed, the labels collide and the
        // heavier copy is not necessarily the first — but `modules` is one entry per input path,
        // so a collision here is genuinely two files that are drawn under the same name, and
        // either chain answers the question the reader asked.
        if (!index.has(module.label)) {
            index.set(module.label, module.path);
        }
    }

    indexes.set(analysis, index);
    return index;
};

/**
 * The chain to a name, or `null` when nothing reaches it.
 *
 * `null` means two different things and the caller has to say so: the name is not in this build at
 * all, or it is in it and nothing statically or dynamically imports it from the entry — which is a
 * finding of its own (`unreachable`) rather than a gap in this function.
 */
export const whyHere = (analysis: Analysis, name: string): WhyHere | null => {
    const path = analysis.chainTo(name) ? name : (labelIndex(analysis).get(name) ?? name);
    const chain = analysis.chainTo(path);
    return chain ? { steps: chainSteps(chain), path } : null;
};
