import { describe, expect, it } from 'vitest';
import { type Analysis, type ChunkInfo, type ScreenCost } from '../analysis/analysis.types';
import { RECOMMENDED } from '../criteria/criteria';
import { buildRequestFindings } from './requests';

const KB = 1024;
const criteria = RECOMMENDED.raw;

const screen = (label: string, files: number, own: string[] = [], shared: string[] = []): ScreenCost =>
    ({ label, source: `src/app/${label}.page.ts`, files, ownChunks: own, sharedChunks: shared }) as ScreenCost;

/** A build where every chunk weighs `bytes`, so a test only has to say how many there are. */
const analysis = (screens: ScreenCost[], boot: string[], sizes: Record<string, number>): Analysis =>
    ({
        screens,
        bootChunks: boot,
        chunkOf: (file: string) => ({ bytes: sizes[file] ?? 10 * KB }) as ChunkInfo,
        // The raw size per chunk, which is the unit the bundler's own merge option is written in.
        tree: Object.entries(sizes).map(([id, bytes]) => ({ id, kind: 'chunk', rawBytes: bytes, bytes })),
    }) as Analysis;

const chunks = (prefix: string, count: number, bytes: number) => {
    const names = Array.from({ length: count }, (_, i) => `${prefix}${i}.js`);
    return { names, sizes: Object.fromEntries(names.map(name => [name, bytes])) };
};

/**
 * The bootstrap's own round trips. The report has shown this in the bootstrap panel for a while;
 * what was missing was a line saying what to do about it, which is the cheapest fix on the list.
 */
describe('buildRequestFindings · the first load', () => {
    const withStartup = (waves: number, byWave: string[][], critical: string[] = []): Analysis =>
        ({
            ...analysis([], [], {}),
            startup: {
                waves,
                discovered: byWave.flat(),
                byWave,
                width: Math.max(1, ...byWave.map(wave => wave.length)),
                critical,
            },
        }) as Analysis;

    it('fires when the page does not name every chunk of the bootstrap', () => {
        const [finding] = buildRequestFindings(withStartup(2, [['assets/chunk-THEME-AAA.js']]), 'en', criteria);

        expect(finding?.kind).toBe('bootWaves');
        expect(finding?.title).toContain('2 round trips');
        // The chunk to preload is named, because the fix is about that file and no other.
        expect(finding?.body).toContain('chunk-THEME-AAA.js');
        expect(finding?.fix).toContain('modulepreload');
    });

    /**
     * The advice used to be "add a modulepreload for each one", which is how pages end up with
     * dozens of them competing with the render-blocking stylesheet. Both halves of the correction
     * are pinned here, in both languages, because the copy is the whole of this finding.
     */
    it('prices the tags instead of prescribing one per chunk', () => {
        for (const lang of ['en', 'es'] as const) {
            const [finding] = buildRequestFindings(withStartup(2, [['a.js', 'b.js', 'c.js']]), lang, criteria);

            expect(finding?.fix).toContain('stylesheet');
            expect(finding?.fix).toMatch(/worse|peor/);
        }
    });

    it('names the chain worth preloading, and says how many tags would buy nothing', () => {
        // Three chunks late; only two of them are behind each other. A tag for the third competes
        // with the render-blocking stylesheet and removes no wait, so the fix has to say so.
        const [finding] = buildRequestFindings(
            withStartup(3, [['a.js', 'other.js'], ['b.js']], ['main.js', 'a.js', 'b.js']),
            'en',
            criteria,
        );

        expect(finding?.fix).toContain('a.js');
        expect(finding?.fix).toContain('buys nothing');
    });

    /** Width and depth read the same in a flat count and are not the same problem. */
    it('tells chunks that share a trip apart from chunks queued behind each other', () => {
        const wide = buildRequestFindings(withStartup(2, [['a.js', 'b.js']]), 'en', criteria)[0];
        const deep = buildRequestFindings(withStartup(3, [['a.js'], ['b.js']]), 'en', criteria)[0];

        expect(wide?.body).toContain('one round trip, not one each');
        expect(deep?.body).toContain('that is a chain');
    });

    it('says nothing when the page names them all, which is the normal case', () => {
        expect(buildRequestFindings(withStartup(1, []), 'en', criteria)).toEqual([]);
    });

    /** No page, no second reading: guessing which chunks are announced would be worse than silence. */
    it('says nothing when the folder brought no page', () => {
        expect(buildRequestFindings(analysis([], [], {}), 'en', criteria)).toEqual([]);
    });
});

describe('buildRequestFindings', () => {
    it('fires when a screen downloads many files and several are tiny', () => {
        const big = chunks('big', 30, 20 * KB);
        const tiny = chunks('tiny', 8, 300);
        const boot = [...big.names, ...tiny.names];
        const screens = [screen('a', boot.length), screen('b', boot.length), screen('c', boot.length)];

        const [finding] = buildRequestFindings(
            analysis(screens, boot, { ...big.sizes, ...tiny.sizes }),
            'en',
            criteria,
        );

        // The headline is the granularity, not the count: under multiplexing a count cannot tell
        // sixty well-sized files from sixty crumbs, and it is context until a measurement shows the
        // connection pool running out.
        expect(finding?.chip).toBe('granularity of the split');
        expect(finding?.severity).toBe('info');
        expect(finding?.title).toContain('38 files');
        expect(finding?.title).toContain('8 of the');
        expect(finding?.title).toContain('under 3 kB');
        // The bundler option named with its own unit, and as a ceiling rather than a promise.
        expect(finding?.fix).toContain('experimentalMinChunkSize');
        expect(finding?.fix).toContain('upper bound');
    });

    it('many files that are all substantial is a big application, not a fragmented one', () => {
        const big = chunks('big', 40, 20 * KB);
        const screens = [screen('a', 40), screen('b', 40), screen('c', 40)];

        expect(buildRequestFindings(analysis(screens, big.names, big.sizes), 'en', criteria)).toEqual([]);
    });

    it('a handful of files does not fire however tiny they are', () => {
        const tiny = chunks('tiny', 6, 200);
        const screens = [screen('a', 6), screen('b', 6), screen('c', 6)];

        expect(buildRequestFindings(analysis(screens, tiny.names, tiny.sizes), 'en', criteria)).toEqual([]);
    });

    it('a tiny chunk this screen does not load is not counted: not downloading it is the point', () => {
        const big = chunks('big', 31, 20 * KB);
        const elsewhere = chunks('elsewhere', 20, 200);
        const screens = [screen('a', 31), screen('b', 31), screen('c', 31)];

        // The tiny ones belong to another screen, so they are in `sizes` but in nobody's list here.
        const result = buildRequestFindings(
            analysis(screens, big.names, { ...big.sizes, ...elsewhere.sizes }),
            'en',
            criteria,
        );

        expect(result).toEqual([]);
    });
});
