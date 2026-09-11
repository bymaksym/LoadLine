/**
 * The report's own margin of error, measured rather than assumed.
 *
 * Every figure this report takes from *inside* a chunk — the bootstrap broken down by package, the
 * exclusive weight of a row, what a `--what-if` would save — is a sum of per-file weights. Those
 * come from the metafile, unless a source map measured the generated file itself. So there are two
 * measurements of the same chunk and they are supposed to agree: `bytes` is what the file weighs,
 * and the per-file weights are what it is made of.
 *
 * On Angular 17 they agree to within 1 %. On Angular 22 they do not: measured on three builds, the
 * per-file weights add up to **125 %** of the file, because the metafile is written before a later
 * pass shrinks the output. Nothing said so, and the consequence is that every one of those figures
 * read a quarter high while the headline weight printed next to it was exact.
 *
 * Both numbers were already in the file. Nobody had subtracted them.
 */

import { baseName } from '../format/format.utils';
import { type SplitDrift } from './analysis.types';
import { type Metafile } from './metafile.types';

/** `.mjs` is what esbuild writes with `--out-extension:.js=.mjs`, and what several setups ship. */
const isJs = (file: string): boolean => /\.m?js$/.test(file);

/**
 * @param outputs the browser side of the build, already separated from the server one.
 * @param exact   chunk name → the per-file weights a source map measured. Those chunks are left
 *                out: they were measured on the generated file, so there is nothing to drift.
 */
export const splitDriftOf = (
    outputs: Metafile['outputs'],
    exact: ReadonlyMap<string, Map<string, number>> | null,
): SplitDrift | null => {
    let file = 0;
    let measured = 0;
    let chunks = 0;

    for (const [chunk, output] of Object.entries(outputs)) {
        if (!isJs(chunk) || exact?.has(baseName(chunk))) {
            continue;
        }

        const sum = Object.values(output.inputs ?? {}).reduce((total, one) => total + (one.bytesInOutput ?? 0), 0);
        // A chunk the metafile does not break down says nothing either way, and counting its
        // `bytes` against a sum of zero would invent a drift of 100 % on every folder read.
        if (sum > 0 && output.bytes > 0) {
            file += output.bytes;
            measured += sum;
            chunks += 1;
        }
    }

    return chunks > 0 ? { file, measured, ratio: measured / file, chunks } : null;
};
