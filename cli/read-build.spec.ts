/**
 * The folder reader against a real build, not a hand-written one.
 *
 * `fixtures/vite-app` is three lazy routes, a widget deferred inside one of them and a chunk two of
 * the routes share, compiled with Vite 8 and Rolldown. It is in the repository because the shapes
 * that matter here — a specifier minified into a template literal, the preload list baked into a
 * dynamic import, a chunk named after the module it starts at — are things a bundler does and
 * nobody would think to write by hand.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/app/core/analysis/analysis';
import { checkBoot, isSameBoot } from '../src/app/core/analysis/invariant';
import { resolveSplits } from '../src/app/core/analysis/sourcemap';
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

        const trips = (analysis: typeof withLists, label: string): number =>
            analysis.screens.find(screen => screen.label === label)?.waves ?? 0;

        // `orders` fetches its own chunk and the shared one at once, because Vite wrote the second
        // into the call. Reading only the graph would count them as two requests in a row.
        expect(trips(without, 'orders')).toBe(2);
        expect(trips(withLists, 'orders')).toBe(1);
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
