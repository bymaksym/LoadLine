import { describe, expect, it } from 'vitest';
import { type AssetInput, readAssets } from './assets';

const file = (name: string, bytes: number) => ({ path: `assets/${name}`, name, bytes });

const HTML = `<!doctype html><html><head>
<link rel="stylesheet" href="/styles-A1.css">
<link rel="preload" as="font" type="font/woff2" href="/Roboto-Regular-B2.woff2" crossorigin>
<link rel="prefetch" href="/later-C3.js">
<script type="module" src="/main-D4.js"></script>
</head><body><img src="/hero-E5.avif" alt=""></body></html>`;

const input = (over: Partial<AssetInput> = {}): AssetInput => ({
    files: [
        file('main-D4.js', 100_000),
        file('styles-A1.css', 20_000),
        file('Roboto-Regular-B2.woff2', 30_000),
        file('Roboto-Bold-B3.woff2', 31_000),
        file('Roboto-Bold-B3.ttf', 60_000),
        file('hero-E5.avif', 40_000),
        file('hero-E5.png', 90_000),
        file('leftover-Z9.png', 12_000),
    ],
    html: HTML,
    texts: new Map([['main-D4.js', 'import "./styles-A1.css"; const icon = "data:image/png;base64,AAAABBBBCCCC=";']]),
    inPage: new Set(['main-D4.js', 'styles-A1.css', 'Roboto-Regular-B2.woff2', 'hero-E5.avif']),
    preloaded: new Set(['Roboto-Regular-B2.woff2']),
    bootChunks: new Set(['main-D4.js']),
    ...over,
});

describe('readAssets · fonts', () => {
    const report = readAssets(input());

    it('groups the weights of one typeface into the family they are', () => {
        const roboto = report.fonts.find(family => family.name === 'roboto');

        expect(roboto?.files).toHaveLength(3);
        expect(roboto?.formats.toSorted((a, b) => a.localeCompare(b))).toEqual(['ttf', 'woff2']);
    });

    it('names the file whose better format is already in the folder', () => {
        // Never "convert this to woff2": the .woff2 of that same face is right there, so shipping
        // the .ttf as well is a claim about the folder rather than advice about a format.
        expect(report.fonts[0]?.superseded).toEqual(['Roboto-Bold-B3.ttf']);
    });

    it('separates what the page preloads from what it merely holds', () => {
        expect(report.fonts[0]?.preloaded).toEqual(['Roboto-Regular-B2.woff2']);
    });
});

describe('readAssets · pictures', () => {
    const report = readAssets(input());

    it('points a picture at the modern version of itself sitting next to it', () => {
        const png = report.media.find(item => item.name === 'hero-E5.png');

        expect(png?.modernNeighbour).toBe('avif');
        // And says nothing at all about the ones with no neighbour: a saving nobody measured.
        expect(report.media.find(item => item.name === 'leftover-Z9.png')?.modernNeighbour).toBeNull();
    });

    it('says which of them the page asks for before anything is painted', () => {
        expect(report.media.filter(item => item.inPage).map(item => item.name)).toEqual(['hero-E5.avif']);
    });
});

describe('readAssets · what nothing names', () => {
    it('finds the leftovers and nothing else', () => {
        const report = readAssets(input());

        expect(report.unreferenced.map(item => item.name)).toEqual([
            'Roboto-Bold-B3.woff2',
            'Roboto-Bold-B3.ttf',
            'hero-E5.png',
            'leftover-Z9.png',
        ]);
        expect(report.referencesRead).toBe(true);
    });

    it('says it did not look, rather than saying there is nothing, with no text to search', () => {
        const report = readAssets(input({ html: null, texts: new Map() }));

        expect(report.referencesRead).toBe(false);
        expect(report.unreferenced).toEqual([]);
    });
});

describe('readAssets · the rest', () => {
    it('counts the bytes hiding inside a chunk as a data URI', () => {
        const report = readAssets(input());

        expect(report.inlined[0]?.count).toBe(1);
        expect(report.inlined[0]?.types).toEqual(['image/png']);
        expect(report.inlinedBytes).toBeGreaterThan(0);
    });

    it('reports duplicates only when something compared the contents', () => {
        const without = readAssets(input());
        expect(without.contentCompared).toBe(false);
        expect(without.duplicates).toEqual([]);

        const hashed = readAssets(
            input({
                hashes: new Map([
                    ['assets/hero-E5.avif', 'abc'],
                    ['assets/leftover-Z9.png', 'abc'],
                ]),
            }),
        );
        expect(hashed.contentCompared).toBe(true);
        // The path, not the name: two copies of one file live in different folders, and the report
        // has to name something the reader can go and open.
        expect(hashed.duplicates[0]?.names).toEqual(['assets/hero-E5.avif', 'assets/leftover-Z9.png']);
    });

    // Nuxt and Astro write a folder per route, so `index.html`, `orders/index.html` and
    // `settings/index.html` all exist and all hold a different page. Keyed by file name the three
    // collapsed onto one hash and came out grouped as "identical byte for byte — it was compared,
    // not assumed from the size", which is a claim, and it was false.
    it('does not call two files identical because they share a name in different folders', () => {
        const report = readAssets(
            input({
                files: [
                    { path: 'index.html', name: 'index.html', bytes: 1658 },
                    { path: 'orders/index.html', name: 'index.html', bytes: 2349 },
                    { path: 'settings/index.html', name: 'index.html', bytes: 1962 },
                ],
                hashes: new Map([
                    ['index.html', 'aaa'],
                    ['orders/index.html', 'bbb'],
                    ['settings/index.html', 'ccc'],
                ]),
            }),
        );

        expect(report.duplicates).toEqual([]);
    });

    it('adds up the whole first trip, and keeps the breakdown next to the total', () => {
        const { firstTrip } = readAssets(input());

        expect(firstTrip.scripts).toBe(100_000);
        expect(firstTrip.styles).toBe(20_000);
        // The preloaded weight only: the other two are fetched once the CSS naming them arrives.
        expect(firstTrip.fonts).toBe(30_000);
        expect(firstTrip.images).toBe(40_000);
        expect(firstTrip.total).toBe(190_000);
    });

    it('attributes a stylesheet to the chunk whose own text names it', () => {
        const [row] = readAssets(input()).stylesByChunk;

        expect(row?.chunk).toBe('main-D4.js');
        expect(row?.styles).toEqual(['styles-A1.css']);
        expect(row?.bytes).toBe(20_000);
    });
});
