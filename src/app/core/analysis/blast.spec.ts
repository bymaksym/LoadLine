import { describe, expect, it } from 'vitest';
import { analyze } from './analysis';
import { blastRadiusOf } from './blast';
import { type Metafile } from './metafile.types';

/**
 * The hub-and-spoke shape, which is the one real applications have:
 *
 *   main  --static-->   vendor
 *   main  --dynamic-->  screen-a, screen-b
 *   screen-a --static--> shared
 *   screen-b --static--> shared
 *
 * `shared` is the hub. Touching a file inside it moves its hash, which moves both screens, which
 * moves the entry chunk that names them — so a change to one dependency reaches the bootstrap.
 * Nothing about that is depth: it is one step out of the hub and then everything.
 */
const meta: Metafile = {
    inputs: {},
    outputs: {
        'dist/main.js': {
            bytes: 1000,
            entryPoint: 'src/main.ts',
            inputs: { 'src/main.ts': { bytesInOutput: 1000 } },
            imports: [
                { path: 'dist/vendor.js', kind: 'import-statement' },
                { path: 'dist/screen-a.js', kind: 'dynamic-import' },
                { path: 'dist/screen-b.js', kind: 'dynamic-import' },
            ],
        },
        'dist/vendor.js': { bytes: 500, inputs: { 'node_modules/heavy-lib/index.js': { bytesInOutput: 500 } } },
        'dist/screen-a.js': {
            bytes: 200,
            entryPoint: 'src/app/a.page.ts',
            inputs: { 'src/app/a.page.ts': { bytesInOutput: 200 } },
            imports: [{ path: 'dist/shared.js', kind: 'import-statement' }],
        },
        'dist/screen-b.js': {
            bytes: 200,
            entryPoint: 'src/app/b.page.ts',
            inputs: { 'src/app/b.page.ts': { bytesInOutput: 200 } },
            imports: [{ path: 'dist/shared.js', kind: 'import-statement' }],
        },
        'dist/shared.js': { bytes: 800, inputs: { 'node_modules/ui-kit/index.js': { bytesInOutput: 800 } } },
    },
};

describe('blastRadiusOf', () => {
    const analysis = analyze(meta, null);

    it('says nothing about a file that ships no bytes', () => {
        expect(blastRadiusOf(analysis, 'src/types.ts')).toBeNull();
    });

    it('counts the chunks holding the file, which is the direct half of the bill', () => {
        const radius = blastRadiusOf(analysis, 'node_modules/ui-kit/index.js');

        expect(radius?.places.map(place => place.chunk)).toEqual(['dist/shared.js']);
        expect(radius?.invalidatedBytes).toBe(800);
    });

    /**
     * The half that was missing. Without it the answer to "is this change small?" was 800 bytes
     * when the browser re-downloads 2.2 kB of a 2.7 kB build, and the difference is not a rounding
     * error: it is the entry chunk everybody pays for.
     */
    it('follows the hashed names outwards, through dynamic imports as well as static ones', () => {
        const radius = blastRadiusOf(analysis, 'node_modules/ui-kit/index.js');

        expect(radius?.cascade.chunks.toSorted((a, b) => a.localeCompare(b))).toEqual([
            'dist/main.js',
            'dist/screen-a.js',
            'dist/screen-b.js',
        ]);
        expect(radius?.cascade.bytes).toBe(1400);
        // 800 + 1400 out of 2700: the figure the report shows next to the direct one, never alone.
        expect(radius?.cascade.share).toBeCloseTo(2200 / 2700, 5);
    });

    /** A leaf nothing imports has no cascade at all, and the pair has to be able to say so. */
    it('adds nothing when no chunk carries the name', () => {
        const radius = blastRadiusOf(analysis, 'src/main.ts');

        expect(radius?.invalidatedBytes).toBe(1000);
        expect(radius?.cascade.chunks).toEqual([]);
        expect(radius?.cascade.bytes).toBe(0);
    });

    /**
     * The case that makes the vendor-chunk advice worth reading twice. Splitting dependencies into
     * their own chunk is supposed to stop them being re-downloaded — and it does, for the bytes of
     * `vendor` itself — but the entry chunk names `vendor`, so bumping a dependency still moves the
     * entry chunk's hash. It is a smaller bill, not no bill, and the pair of figures is what says so.
     */
    it('reaches the entry chunk from a vendor chunk, because the entry names it', () => {
        const vendor = blastRadiusOf(analysis, 'node_modules/heavy-lib/index.js');

        expect(vendor?.inBoot).toBe(true);
        expect(vendor?.invalidatedBytes).toBe(500);
        expect(vendor?.cascade.chunks).toEqual(['dist/main.js']);
        expect(vendor?.cascade.bytes).toBe(1000);
    });
});
