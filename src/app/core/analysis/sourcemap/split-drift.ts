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

import { baseName } from '../../format/format.utils';
import { type SplitDrift } from '../analysis.types';
import { type Metafile } from '../metafile.types';

/** `.mjs` is what esbuild writes with `--out-extension:.js=.mjs`, and what several setups ship. */
const isJs = (file: string): boolean => /\.m?js$/.test(file);

/**
 * How far a chunk's parts may be from its weight before they are scaled to it: the same 5 % and
 * kilobyte the `splitDrift` signal needs before it says anything (`shipped.ts`). Below that it is a
 * wrapper's worth of bytes, and every figure stays the metafile's own.
 */
const SCALE_FROM_RATIO = 0.05;
const SCALE_FROM_BYTES = 1024;

/**
 * The factor each chunk's per-file weights are multiplied by so they add up to the file: its weight
 * over what its parts sum to, for every chunk whose parts add up to more than it by more than the
 * margin above and no source map measured. Absent for the rest, which is a factor of one.
 *
 * Without it, an Angular 22 build without maps read "Bootstrap 117 kB" over "≈117 kB of packages
 * against ≈30 kB of your own", 147 between them, and one package was 53 kB in a card and 72 kB in
 * the next; only the card about the drift said why. Angular's optimizer shares a chunk's length out
 * in proportion before the last minification, so the proportion is right and the total is not:
 * scaled, the parts add up to the file again, and what a map would have measured (93 + 25 = 118
 * on the same build) is what comes out within a few per cent. The `splitDrift` card still says the
 * metafile was off, and by how much: these figures are a proportion, not a measurement.
 */
export const chunkScalesOf = (
    outputs: Metafile['outputs'],
    exact: ReadonlyMap<string, Map<string, number>> | null,
): Map<string, number> => {
    const scales = new Map<string, number>();
    for (const [chunk, output] of Object.entries(outputs)) {
        if (!isJs(chunk) || exact?.has(baseName(chunk))) {
            continue;
        }
        const sum = Object.values(output.inputs ?? {}).reduce((total, one) => total + one.bytesInOutput, 0);
        // Only down. Parts that add up to less than the file are the norm — a runtime, a wrapper, a
        // banner nobody's file claims — and scaling them up would hand those bytes to the modules.
        // Parts that add up to more than the file cannot all be in it.
        const over = sum - output.bytes;
        if (output.bytes > 0 && over / output.bytes >= SCALE_FROM_RATIO && over >= SCALE_FROM_BYTES) {
            scales.set(chunk, output.bytes / sum);
        }
    }
    return scales;
};

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

        const sum = Object.values(output.inputs ?? {}).reduce((total, one) => total + one.bytesInOutput, 0);
        // A chunk the metafile does not break down says nothing either way, and counting its
        // `bytes` against a sum of zero would invent a drift of 100 % on every folder read.
        if (!(sum > 0 && output.bytes > 0)) {
            continue;
        }

        file += output.bytes;
        measured += sum;
        chunks += 1;
    }

    // Why they differ is knowable for one bundler, and it is the one this was measured on: Angular's
    // chunk optimizer bundles the chunks again with Rolldown after esbuild, and rewrites every
    // per-file weight as that pass's rendered length shared out in proportion — before the final
    // minification. So the parts add up to more than the file, by the same factor in every chunk.
    const angular = Object.values(outputs).some(output =>
        Object.keys(output.inputs ?? {}).some(input => input.includes('@angular/core')),
    );

    return chunks > 0 ? { file, measured, ratio: measured / file, chunks, angular } : null;
};
