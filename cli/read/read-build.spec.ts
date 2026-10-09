/**
 * The folder reader against a real build, not a hand-written one.
 *
 * `fixtures/vite-app` is three lazy routes, a widget deferred inside one of them and a chunk two of
 * the routes share, compiled with Vite 8 and Rolldown. It is in the repository because the shapes
 * that matter here — a specifier minified into a template literal, the preload list baked into a
 * dynamic import, a chunk named after the module it starts at — are things a bundler does and
 * nobody would think to write by hand.
 */

import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/app/core/analysis/analysis';
import { checkBoot, isSameBoot } from '../../src/app/core/analysis/invariant';
import { resolveSplits } from '../../src/app/core/analysis/sourcemap/sourcemap';
import { readDist } from './read-build';

const FOLDER = join(process.cwd(), 'fixtures', 'vite-app', 'dist');

const labels = (list: { label: string }[]): string[] =>
    list.map(entry => entry.label).toSorted((a, b) => a.localeCompare(b));

describe('readDist on a Vite build', () => {
    it('reads the graph out of the chunks, with no stats file anywhere', async () => {
        const dist = await readDist(FOLDER, true);
        const meta = dist.graph?.meta;

        expect(Object.keys(meta?.outputs ?? {})).toHaveLength(6);
        // Every screen is named after its source file, which only the source maps can give.
        expect(meta?.inputs['src/table.js']).toBeDefined();
    });

    it('three routes are three screens, and the deferred widget is not a fourth', async () => {
        const dist = await readDist(FOLDER, true);
        const analysis = analyze(
            dist.graph!.meta,
            dist.gzip,
            resolveSplits(dist.splits, Object.keys(dist.graph!.meta.inputs)),
            dist.announced,
            null,
            undefined,
            dist.graph!.parallel,
        );

        expect(labels(analysis.screens)).toEqual(['home', 'orders', 'settings']);
        expect(labels(analysis.deferredBlocks)).toEqual(['chart.widget']);
        // The chunk the two routes share is the one the whole report is about.
        expect(analysis.sharedChunks.map(chunk => chunk.mainContent)).toEqual(['src/table.js']);
    });

    it('the preload list is what stops a screen being counted a round trip too deep', async () => {
        const dist = await readDist(FOLDER, true);
        const withLists = analyze(dist.graph!.meta, null, null, dist.announced, null, undefined, dist.graph!.parallel);
        const without = analyze(dist.graph!.meta, null, null, dist.announced);

        const trips = (analysis: typeof withLists): number =>
            analysis.screens.find(screen => screen.label === 'orders')?.waves ?? 0;

        // `orders` fetches its own chunk and the shared one at once, because Vite wrote the second
        // into the call. Reading only the graph would count them as two requests in a row.
        expect(trips(without)).toBe(2);
        expect(trips(withLists)).toBe(1);
    });

    /**
     * The cross-check `--self-check` runs, here against a build a real bundler wrote. Its value is
     * that the two answers come from different files: one from the imports inside the chunks, the
     * other from the `<script>` of the page.
     */
    it('the graph and index.html agree on which chunks are the bootstrap', async () => {
        const dist = await readDist(FOLDER, true);
        const analysis = analyze(dist.graph!.meta, null, null, dist.announced, null, undefined, dist.graph!.parallel);
        const check = checkBoot(dist.graph!.meta.outputs, analysis.bootChunks, dist.announced!);

        expect(check).not.toBeNull();
        expect(isSameBoot(check!)).toBe(true);
    });
});

/**
 * The same application built two other ways that write the preload list differently, each of which
 * the reader once missed: every screen came out a round trip deeper than the browser takes it.
 *
 * - `vite5-app`, Vite 5.0.12: the list lives in `__vite__mapDeps.viteFileDeps`, inside a function at
 *   the end of the chunk. That is what Excalidraw ships.
 * - `vite-relative-app`, Vite 8.2.2 with `base: './'`: the list names `./orders.page-….js`, relative
 *   to the chunk holding it. That is what Nuxt always writes, and Vite for Electron, Tauri and any
 *   app deployed under a subfolder.
 */
describe.each([
    ['Vite 5.0', 'vite5-app'],
    ["Vite with base: './'", 'vite-relative-app'],
])('readDist on a %s build', (_name, fixture) => {
    const folder = join(process.cwd(), 'fixtures', fixture, 'dist');

    it('reads the same three screens', async () => {
        const dist = await readDist(folder, true);
        const analysis = analyze(dist.graph!.meta, null, null, dist.announced, null, undefined, dist.graph!.parallel);

        expect(labels(analysis.screens)).toEqual(['home', 'orders', 'settings']);
    });

    it('reads its preload list, so a screen and the chunk it shares arrive in one round trip', async () => {
        const dist = await readDist(folder, true);
        const analysis = analyze(dist.graph!.meta, null, null, dist.announced, null, undefined, dist.graph!.parallel);

        expect(analysis.screens.map(screen => screen.waves)).toEqual([1, 1, 1]);
    });
});

/**
 * The same application with its router written as a route table, built without source maps: the
 * table names the screens where the only other name is a hash, and the language file it loads with
 * `load: () => import()` is not one of them. Nuxt without maps read fourteen language files as
 * screens named after hashes.
 */
describe('readDist on a build with a route table', () => {
    const folder = join(process.cwd(), 'fixtures', 'vite-router-app', 'dist');

    it('reads the routes out of the table, path and name', async () => {
        const dist = await readDist(folder, true);
        const routes = [...dist.graph!.routes].map(([chunk, list]) => [basename(chunk).split('-', 1)[0], list]);

        expect(routes).toEqual([
            ['home.page', [{ path: '/', name: 'dashboard' }]],
            ['orders.page', [{ path: '/orders', name: 'order-list' }]],
            ['settings.page', [{ path: '/settings', name: null }]],
        ]);
    });

    it('names each screen after its route and keeps the language file out of the screens', async () => {
        const dist = await readDist(folder, true);
        const graph = dist.graph!;
        const analysis = analyze(graph.meta, null, null, dist.announced, null, undefined, graph.parallel, graph.routes);

        expect(labels(analysis.screens)).toEqual(['/settings', 'dashboard', 'order-list']);
        expect(analysis.routeTable).toBe(true);
        expect(analysis.lazyOnDemand.map(entry => entry.label)).toEqual(['messages.es']);
        expect(analysis.deferredBlocks.map(entry => entry.label)).toEqual(['chart.widget']);
    });

    it('says when a folder has no table it can read', async () => {
        const dist = await readDist(FOLDER, true);
        const graph = dist.graph!;
        const analysis = analyze(graph.meta, null, null, dist.announced, null, undefined, graph.parallel, graph.routes);

        expect(analysis.routeTable).toBe(false);
        expect(labels(analysis.screens)).toEqual(['home', 'orders', 'settings']);
    });
});

/**
 * The same application built by webpack 4, which is what Create React App 1 to 3 and Vue CLI
 * shipped. Its chunks load each other through `webpackJsonp` and a table of numbers, with no
 * `import()` anywhere, and before this was checked the folder read as one bootstrap of 1 kB, zero
 * screens, and four chunks not mentioned at all.
 */
describe('readDist on a webpack 4 build', () => {
    it('refuses the folder rather than reading three lazy routes as no screens', async () => {
        await expect(readDist(join(process.cwd(), 'fixtures', 'webpack4-app', 'dist'), true)).rejects.toThrow(
            'NOT_ESM_GRAPH',
        );
    });
});

/**
 * The same application built by Vite with `@vitejs/plugin-legacy`: a modern copy for browsers with
 * ES modules and a SystemJS copy behind `<script nomodule>` for the rest, started from `data-src`.
 * Stencil, Angular up to 13 and every legacy plugin ship the second copy, and counting it put a
 * 42 kB fallback nobody on a current browser fetches into a bootstrap of 48.
 */
describe('readDist on a build with a nomodule copy', () => {
    it('reads the modern copy and leaves the legacy one out, counted', async () => {
        const dist = await readDist(join(process.cwd(), 'fixtures', 'vite-legacy-app', 'dist'), true);
        const analysis = analyze(dist.graph?.meta ?? { inputs: {}, outputs: {} }, dist.gzip);

        expect(labels(analysis.screens)).toEqual(['home.page', 'orders.page', 'settings.page']);
        expect(analysis.offPage.legacy).toBe(7);
        expect(analysis.bootChunks.every(chunk => !chunk.includes('legacy'))).toBe(true);
        // Nor does the first trip count it: the page names it, and a current browser skips it.
        expect(dist.firstTrips?.raw?.files).toBe(1);
    });
});

/**
 * The same application as RequireJS would load it: AMD modules named without their extension, the
 * lazy routes as `require([…])`, and a page that starts it from `data-main` with the loader on a
 * CDN. Polymer's builds and every RequireJS application before ES modules have this shape.
 */
describe('readDist on an AMD build', () => {
    it('reads the dependency lists and the lazy requires, starting where data-main says', async () => {
        const dist = await readDist(join(process.cwd(), 'fixtures', 'rollup-amd-app', 'dist'), true);
        const analysis = analyze(dist.graph?.meta ?? { inputs: {}, outputs: {} }, dist.gzip);

        expect(labels(analysis.screens)).toEqual(['home.page', 'orders.page', 'settings.page']);
        expect(analysis.deferredBlocks.map(block => block.label)).toEqual(['chart.widget']);
        expect(analysis.bootFiles).toBe(1);
    });
});
