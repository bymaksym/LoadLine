import { describe, expect, it } from 'vitest';
import { RECOMMENDED } from '../criteria/criteria';
import { buildAssetFindings } from '../findings/folder/assets';
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

    /**
     * Stencil writes its global stylesheet as `app.css` and as `p-qsbgvzk9.css` and the page asks for
     * neither; Sapper's `main.css` is linked by the page and `chunk.css` loaded by its runtime. The
     * first is a file stored twice, the second one that travels twice, and both read "a visitor
     * downloads both".
     */
    it('tells a copy that travels twice from one only stored twice', () => {
        const css = 'body{margin:0}';
        const report = (texts: Map<string, string>) =>
            readAssets(
                input({
                    files: [file('main-D4.js', 100_000), file('app.css', 154), file('p-qsbgvzk9.css', 154)],
                    texts: new Map([...texts, ['app.css', css], ['p-qsbgvzk9.css', css]]),
                    inPage: new Set(['main-D4.js']),
                    hashes: new Map([
                        ['assets/app.css', 'same'],
                        ['assets/p-qsbgvzk9.css', 'same'],
                    ]),
                }),
            );
        const stored = report(new Map([['main-D4.js', 'boot()']]));
        const travels = report(new Map([['main-D4.js', 'load("app.css");load("p-qsbgvzk9.css")']]));

        expect(stored.duplicates[0]?.named).toBe(0);
        expect(travels.duplicates[0]?.named).toBe(2);

        const onlyStored = buildAssetFindings(stored, 'en', RECOMMENDED.gzip).find(
            finding => finding.kind === 'duplicateAssets',
        );
        expect(onlyStored?.severity).toBe('info');
        expect(onlyStored?.title).toBe('154 B in a file the folder holds twice and the page downloads once at most');
        const twice = buildAssetFindings(travels, 'en', RECOMMENDED.gzip).find(
            finding => finding.kind === 'duplicateAssets',
        );
        expect(twice?.title).toBe('154 B in a file that ships twice under different names');
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

    /**
     * Nuxt's `200.html`, `404.html` and every route's shell are the same page on purpose, and two
     * routes' `_payload.json` matched because they held the same timestamp. One per navigation.
     */
    it('does not report pages and data files as shipped twice, however equal', () => {
        const report = readAssets(
            input({
                files: [
                    { path: '200.html', name: '200.html', bytes: 900 },
                    { path: '404.html', name: '404.html', bytes: 900 },
                    { path: 'tv/_payload.json', name: '_payload.json', bytes: 80 },
                    { path: 'movie/_payload.json', name: '_payload.json', bytes: 80 },
                ],
                hashes: new Map([
                    ['200.html', 'same'],
                    ['404.html', 'same'],
                    ['tv/_payload.json', 'data'],
                    ['movie/_payload.json', 'data'],
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

    /**
     * TinyMCE ships 25 `plugin.min.js`. Read by name, PocketBase's sixteen prefetched files came
     * out as five, all weighing the same.
     */
    it('counts prefetched files that share a name one by one, each with its own weight', () => {
        const { prefetched, prefetchedBytes } = readAssets(
            input({
                html: '<link rel="prefetch" href="./libs/a/plugin.min.js"><link rel="prefetch" href="./libs/b/plugin.min.js">',
                files: [
                    { path: 'libs/a/plugin.min.js', name: 'plugin.min.js', bytes: 9000 },
                    { path: 'libs/b/plugin.min.js', name: 'plugin.min.js', bytes: 4000 },
                ],
                weighPath: new Map([
                    ['libs/a/plugin.min.js', 3000],
                    ['libs/b/plugin.min.js', 1000],
                ]),
            }),
        );

        expect(prefetched.map(entry => entry.name)).toEqual(['libs/a/plugin.min.js', 'libs/b/plugin.min.js']);
        expect(prefetchedBytes).toBe(4000);
    });

    /** By name, a page naming one `plugin.min.js` asked for all of them, at one weight. */
    it('takes the one file the page names out of several sharing its name, at its own weight', () => {
        const report = readAssets(
            input({
                html: '<script src="./libs/b/plugin.min.js"></script>',
                files: [
                    { path: 'libs/a/plugin.min.js', name: 'plugin.min.js', bytes: 9000 },
                    { path: 'libs/b/plugin.min.js', name: 'plugin.min.js', bytes: 4000 },
                    { path: 'libs/c/plugin.min.js', name: 'plugin.min.js', bytes: 7000 },
                ],
                inPage: new Set(['plugin.min.js']),
                weigh: new Map([['plugin.min.js', 2500]]),
                weighPath: new Map([['libs/b/plugin.min.js', 1000]]),
            }),
        );

        expect(report.inPagePaths).toEqual(['libs/b/plugin.min.js']);
        expect(report.firstTrip.files).toBe(1);
        expect(report.firstTrip.scripts).toBe(1000);
    });

    /**
     * `inPage` comes from everything the page names, `prefetch` included, and from hosts that are
     * not this folder. PocketBase read "731 kB across 12 files" for 392 kB in 5; Nuxt counted forty
     * posters on an image CDN as files of its first trip.
     */
    it('leaves out what the page only prefetches, and what lives on another host', () => {
        const { firstTrip } = readAssets(
            input({
                files: [...input().files, file('later-C3.js', 300_000)],
                inPage: new Set([...input().inPage, 'later-C3.js', 'css2', 'poster.jpg']),
                prefetched: new Set(['later-C3.js']),
            }),
        );

        expect(firstTrip.total).toBe(190_000);
        expect(firstTrip.files).toBe(4);
    });

    it('attributes a stylesheet to the chunk whose own text names it', () => {
        const [row] = readAssets(input()).stylesByChunk;

        expect(row?.chunk).toBe('main-D4.js');
        expect(row?.styles).toEqual(['styles-A1.css']);
        expect(row?.bytes).toBe(20_000);
    });
});
