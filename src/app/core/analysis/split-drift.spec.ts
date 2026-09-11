import { describe, expect, it } from 'vitest';
import { type Metafile } from './metafile.types';
import { splitDriftOf } from './split-drift';

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

        expect(drift).toEqual({ file: 800, measured: 1000, ratio: 1.25, chunks: 1 });
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
