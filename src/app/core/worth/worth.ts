/**
 * What a shared chunk costs on a typical visit, and where that cost comes from.
 *
 * The report already says what is heavy. The question it did not answer is the next one: a chunk of
 * 58 kB loaded by 44 of 47 screens — how much of that does everybody really pay, and which part of
 * the chunk is it? This turns the two figures into one cost and one named origin. The decision it
 * leaves to the reader on purpose is whether to act: that depends on their project, not on the
 * metafile.
 *
 * **The fact the whole rule rests on: splitting a shared chunk saves nothing.** esbuild builds one
 * chunk per distinct set of entry points that reach a module, so every file inside a chunk is
 * reached by exactly the same screens. Cutting it in two produces two chunks that the same screens
 * load. What lowers the figure is fewer screens importing the thing, or the thing being smaller —
 * never the split. That is why the answers are about who imports what, not about how to divide it.
 */

import { type Analysis, type ChunkInfo } from '../analysis/analysis.types';
import { type Worth, type WorthInput, type WorthTop } from './worth.types';

/**
 * The lazy chunks that so many screens load that, in practice, everybody downloads them. One
 * definition, because the summary tile and this rule have to agree on what they are talking about.
 */
export const globalSharedChunks = (analysis: Analysis, ratio: number): ChunkInfo[] => {
    const total = analysis.screens.length;
    return total > 0 ? analysis.sharedChunks.filter(chunk => chunk.screens >= total * ratio) : [];
};

/** What a typical visit downloads: the declared bootstrap plus the chunks above. */
export const effectiveBootBytes = (analysis: Analysis, ratio: number): number =>
    analysis.bootBytes + globalSharedChunks(analysis, ratio).reduce((sum, chunk) => sum + chunk.bytes, 0);

const dominant = (groups: WorthInput['groups'], total: number, dominantRatio: number): WorthTop | null => {
    if (total <= 0) {
        return null;
    }

    const top = groups.toSorted((a, b) => b.bytes - a.bytes)[0];
    if (!top) {
        return null;
    }

    const share = top.bytes / total;
    return share >= dominantRatio ? { label: top.label, share, isPackage: top.isPackage } : null;
};

export const worthOfShared = (input: WorthInput): Worth => {
    const { bytes, ratio, groups, importersOf, effectiveBoot, minBytes, maxImporters, dominantRatio } = input;

    // What a typical visit really pays for it: the size everybody quotes, weighted by how many
    // screens actually pull it in.
    const typicalCost = Math.round(bytes * Math.min(1, Math.max(0, ratio)));
    const shareOfBoot = effectiveBoot > 0 ? typicalCost / effectiveBoot : 0;
    const withoutIt = Math.max(0, effectiveBoot - typicalCost);
    const groupTotal = groups.reduce((sum, group) => sum + group.bytes, 0);
    const top = dominant(groups, groupTotal, dominantRatio);
    const importers = top?.isPackage ? importersOf(top.label) : null;

    const base = { typicalCost, shareOfBoot, withoutIt, top, importers };

    // Below the threshold the origin does not matter, whatever it carries: the gain would be lost
    // between any two builds.
    if (typicalCost < minBytes) {
        return { ...base, level: 'none', origin: 'small' };
    }

    // Own code dominating is the best case: nothing to negotiate with a third party. The classic
    // one is a barrel file that re-exports everything, so importing one thing brings the rest.
    if (top && !top.isPackage) {
        return { ...base, level: 'try', origin: 'ownCode' };
    }

    // A package few project files reach has an address: there is a file to open. Reached from all
    // over, there is no single file to point at, and the chunk falls through to `common`.
    if (top && importers !== null && importers > 0 && importers <= maxImporters) {
        return { ...base, level: 'try', origin: 'package' };
    }

    return { ...base, level: 'hard', origin: 'common' };
};
