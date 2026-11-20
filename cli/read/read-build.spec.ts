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
import { type ModuleEntry } from '../../src/app/core/analysis/analysis.types';
import { checkBoot, isSameBoot } from '../../src/app/core/analysis/invariant';
import { resolveSplits } from '../../src/app/core/analysis/sourcemap/sourcemap';
import { readDeps } from '../../src/app/core/deps/deps';
import { scanBuild } from '../../src/app/core/scan/scan';
import { readDepsFiles, readDist } from './read-build';

const FOLDER = join(process.cwd(), 'fixtures', 'vite-app', 'dist');

const labels = (list: { label: string }[]): string[] =>
    list.map(entry => entry.label).toSorted((a, b) => a.localeCompare(b));

describe('readDist on a Vite build', () => {
    it('reads the graph out of the chunks, with no stats file anywhere', async () => {
        const dist = await readDist(FOLDER, { derive: true });
        const meta = dist.graph?.meta;

        expect(Object.keys(meta?.outputs ?? {})).toHaveLength(6);
        // Every screen is named after its source file, which only the source maps can give.
        expect(meta?.inputs['src/table.js']).toBeDefined();
    });

    it('three routes are three screens, and the deferred widget is not a fourth', async () => {
        const dist = await readDist(FOLDER, { derive: true });
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
        const dist = await readDist(FOLDER, { derive: true });
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
        const dist = await readDist(FOLDER, { derive: true });
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
        const dist = await readDist(folder, { derive: true });
        const analysis = analyze(dist.graph!.meta, null, null, dist.announced, null, undefined, dist.graph!.parallel);

        expect(labels(analysis.screens)).toEqual(['home', 'orders', 'settings']);
    });

    it('reads its preload list, so a screen and the chunk it shares arrive in one round trip', async () => {
        const dist = await readDist(folder, { derive: true });
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
        const dist = await readDist(folder, { derive: true });
        const routes = [...dist.graph!.routes].map(([chunk, list]) => [basename(chunk).split('-', 1)[0], list]);

        expect(routes).toEqual([
            ['home.page', [{ path: '/', name: 'dashboard' }]],
            ['orders.page', [{ path: '/orders', name: 'order-list' }]],
            ['settings.page', [{ path: '/settings', name: null }]],
        ]);
    });

    it('names each screen after its route and keeps the language file out of the screens', async () => {
        const dist = await readDist(folder, { derive: true });
        const graph = dist.graph!;
        const analysis = analyze(graph.meta, null, null, dist.announced, null, undefined, graph.parallel, graph.routes);

        expect(labels(analysis.screens)).toEqual(['/settings', 'dashboard', 'order-list']);
        expect(analysis.routeTable).toBe(true);
        expect(analysis.lazyOnDemand.map(entry => entry.label)).toEqual(['messages.es']);
        expect(analysis.deferredBlocks.map(entry => entry.label)).toEqual(['chart.widget']);
    });

    it('says when a folder has no table it can read', async () => {
        const dist = await readDist(FOLDER, { derive: true });
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
        await expect(
            readDist(join(process.cwd(), 'fixtures', 'webpack4-app', 'dist'), { derive: true }),
        ).rejects.toThrow('NOT_ESM_GRAPH');
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
        const dist = await readDist(join(process.cwd(), 'fixtures', 'vite-legacy-app', 'dist'), { derive: true });
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
        const dist = await readDist(join(process.cwd(), 'fixtures', 'rollup-amd-app', 'dist'), { derive: true });
        const analysis = analyze(dist.graph?.meta ?? { inputs: {}, outputs: {} }, dist.gzip);

        expect(labels(analysis.screens)).toEqual(['home.page', 'orders.page', 'settings.page']);
        expect(analysis.deferredBlocks.map(block => block.label)).toEqual(['chart.widget']);
        expect(analysis.bootFiles).toBe(1);
    });
});

/**
 * espaciot-app, installed with pnpm 9: "who brings this dependency" was empty for all nine indirect
 * dependencies, because only yarn's lock was read for what each package depends on. pnpm 9 records
 * it under `snapshots:`, at resolved versions — which is why those are names here and never pins.
 */
describe('readDepsFiles on a pnpm 9 lock file', () => {
    const LOCK = join(process.cwd(), 'fixtures', 'pnpm9-lock', 'pnpm-lock.yaml');
    const shipped = (path: string, pkg: string): ModuleEntry => ({
        path,
        label: path,
        pkg,
        bytes: 1000,
        places: [{ chunk: 'main.js', chunkName: 'main.js', bytes: 1000, zone: 'boot', screens: 0 }],
    });

    it('reads the scoped names pnpm 9 quotes, and what each package depends on', async () => {
        const { lock, lockDirect } = await readDepsFiles(LOCK, null);
        const core = lock?.find(entry => entry.name === '@angular/core');

        expect(core?.version).toBe('20.3.4');
        expect(core?.requires).toEqual(['rxjs', 'tslib', 'zone.js']);
        expect(core?.declares).toBeUndefined();
        expect(lockDirect).toContain('firebase');
    });

    it('says which package brings each indirect dependency', async () => {
        const { lock, lockDirect } = await readDepsFiles(LOCK, null);
        const report = readDeps({
            lock,
            advisories: null,
            modules: [
                shipped('node_modules/.pnpm/idb@7.1.1/node_modules/idb/build/index.js', 'idb'),
                shipped('node_modules/.pnpm/ms@2.1.3/node_modules/ms/index.js', 'ms'),
            ],
            boot: new Set(['main.js']),
            direct: new Set(lockDirect),
        });
        const chain = (name: string) => report.transitive.find(entry => entry.name === name)?.chain;

        expect(chain('idb')).toEqual(['firebase', '@firebase/app']);
        expect(chain('ms')).toEqual(['@microsoft/teams-js', 'debug']);
        expect(report.declared.size).toBe(0);
    });
});

/**
 * Zaporeak's web export, shaped after Metro: one bundle of `__d(…)` modules and an index map with a
 * section per module, nothing at its root. Read as "this folder carries no source maps" before; the
 * one `console.log` that is the project's own (`src/core/logger.ts`) could not be told from React's.
 */
describe('readDist on a Metro build with a sectioned map', () => {
    const METRO = join(process.cwd(), 'fixtures', 'metro-sectioned-map', 'dist');

    it('splits the bundle by source file through the sections', async () => {
        const dist = await readDist(METRO, { derive: true });
        const split = dist.splits?.get('entry-3f9a1c2b7d4e5f60.js');

        expect([...(split?.keys() ?? [])].toSorted((a, b) => a.localeCompare(b))).toEqual([
            'node_modules/expo-router/entry.js',
            'node_modules/react/cjs/react.production.min.js',
            'src/app/index.tsx',
            'src/core/logger.ts',
        ]);
    });

    it('counts only the console.log that is the project’s own', async () => {
        const dist = await readDist(METRO, { derive: true });
        const leftover = scanBuild({
            texts: dist.texts ?? new Map(),
            modules: [],
            boot: new Set(),
            maps: dist.maps ?? [],
        }).leftovers.find(item => item.kind === 'consoleLogs');

        expect(leftover).toMatchObject({ count: 1, attributed: true });
    });
});
