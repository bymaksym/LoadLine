import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analysis';
import { type Metafile } from '../analysis/metafile.types';
import { blindBoot, opaqueBootChunks } from './defer';

/** A bootstrap of two chunks: the entry, and the one it imports statically. */
const bootOf = (helper: Metafile['outputs'][string]): Metafile => ({
    inputs: { 'src/main.ts': { bytes: 100, format: 'esm', imports: [] } },
    outputs: {
        'main-A1.js': {
            bytes: 1000,
            entryPoint: 'src/main.ts',
            imports: [{ path: 'chunk-B2.js', kind: 'import-statement' }],
            inputs: { 'src/main.ts': { bytesInOutput: 100 } },
        },
        'chunk-B2.js': helper,
    },
});

describe('opaqueBootChunks', () => {
    it('does not call a chunk of runtime helpers unknown: the stats file says it holds none of yours', () => {
        // An Angular 21 build analysed with its stats.json: esbuild's helpers, 449 bytes, `inputs: {}`.
        const analysis = analyze(bootOf({ bytes: 449, imports: [], inputs: {} }), null);

        expect(opaqueBootChunks(analysis)).toEqual([]);
    });

    it('calls a chunk unknown when the build did not describe it: a folder read without its map', () => {
        const analysis = analyze(bootOf({ bytes: 4000, imports: [] }), null);

        expect(opaqueBootChunks(analysis)).toEqual(['chunk-B2.js']);
        // One chunk of two: a corner of the bootstrap, not a folder without maps.
        expect(blindBoot(analysis)).toBe(false);
    });

    it('calls the bootstrap blind only when no chunk of it is described', () => {
        const meta = bootOf({ bytes: 4000, imports: [] });
        delete meta.outputs['main-A1.js']?.inputs;

        expect(blindBoot(analyze(meta, null))).toBe(true);
    });
});
