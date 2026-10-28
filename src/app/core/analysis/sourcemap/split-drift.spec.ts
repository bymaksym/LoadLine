import { describe, expect, it } from 'vitest';
import { type Metafile } from '../metafile.types';
import { chunkScalesOf, splitDriftOf } from './split-drift';

/**
 * The two measurements of the same chunks, which are supposed to be the same number: what a file
 * weighs, and what its per-file breakdown adds up to. On Angular 17 they agree to within 1 %; on
 * Angular 22 the sum is 125 % of the file, because the metafile is written before a later pass
 * shrinks the output. Every figure the report takes from *inside* a chunk is that ratio wrong while
 * the weight printed beside it is exact, and until this was measured nothing said so.
 */
describe('splitDriftOf', () => {
    const drifting: Metafile = {
        inputs: { 'src/main.ts': { bytes: 100, format: 'esm', imports: [] } },
        outputs: {
            'dist/main.js': {
                bytes: 800,
                entryPoint: 'src/main.ts',
                inputs: { 'src/main.ts': { bytesInOutput: 1000 } },
            },
        },
    };

    it('measures how far apart they are', () => {
        const drift = splitDriftOf(drifting.outputs, null);

        expect(drift).toEqual({ file: 800, measured: 1000, ratio: 1.25, chunks: 1, angular: false });
    });

    /** Where a source map measured the generated file itself, there is nothing left to drift. */
    it('leaves out the chunks that were measured on the file', () => {
        const exact = new Map([['main.js', new Map([['src/main.ts', 800]])]]);

        expect(splitDriftOf(drifting.outputs, exact)).toBeNull();
    });

    /**
     * A chunk the metafile does not break down says nothing either way, and counting its weight
     * against a sum of zero would invent a drift of a hundred per cent on every folder read.
     */
    it('says nothing about a chunk with no breakdown at all', () => {
        const blind: Metafile = {
            inputs: { 'src/main.ts': { bytes: 100, format: 'esm', imports: [] } },
            outputs: { 'dist/main.js': { bytes: 800, entryPoint: 'src/main.ts', inputs: {} } },
        };

        expect(splitDriftOf(blind.outputs, null)).toBeNull();
    });
});

/**
 * espaciot-app without maps: "Bootstrap 117 kB" over "≈117 kB of packages against ≈30 kB of yours",
 * 147 between them. Parts over the file are scaled to it; parts short of it are left alone.
 */
describe('chunkScalesOf', () => {
    const KB = 1024;
    const outputs = (bytes: number, parts: number): Metafile['outputs'] => ({
        'dist/main.js': {
            bytes,
            inputs: { 'src/a.ts': { bytesInOutput: parts / 2 }, 'src/b.ts': { bytesInOutput: parts / 2 } },
        },
    });

    it('scales parts that add up to more than the file down to it', () => {
        expect(chunkScalesOf(outputs(117 * KB, 147 * KB), null).get('dist/main.js')).toBeCloseTo(117 / 147);
    });

    it('leaves parts short of the file alone, and a difference too small to be one', () => {
        expect(chunkScalesOf(outputs(40 * KB, 30 * KB), null).size).toBe(0);
        expect(chunkScalesOf(outputs(100 * KB, 102 * KB), null).size).toBe(0);
    });

    it('leaves a chunk a source map measured alone', () => {
        expect(chunkScalesOf(outputs(117 * KB, 147 * KB), new Map([['main.js', new Map()]])).size).toBe(0);
    });
});
