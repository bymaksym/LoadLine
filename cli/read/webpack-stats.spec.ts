/**
 * webpack's `stats.json` against two real builds, not hand-written ones.
 *
 * `fixtures/webpack4-app` and `fixtures/webpack5-app` are the application of `vite-app` — three
 * lazy routes, a widget deferred inside one of them and a file two routes share — built by webpack
 * 4 and 5. Their folders are refused (the chunks load each other by number); their stats files are
 * read, and what comes out has to be the same application the Vite build is.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/app/core/analysis/analysis';
import { resolveSplits } from '../../src/app/core/analysis/sourcemap/sourcemap';
import { UI } from '../../src/app/core/i18n/ui';
import { readDist, readStats } from './read-build';

const APP4 = join(process.cwd(), 'fixtures', 'webpack4-app');
const APP5 = join(process.cwd(), 'fixtures', 'webpack5-app');

const labels = (list: { label: string }[]): string[] =>
    list.map(entry => entry.label).toSorted((a, b) => a.localeCompare(b));

const analysed = async (app: string) => {
    const meta = await readStats(join(app, 'stats.json'), UI.en);
    const dist = await readDist(join(app, 'dist'));
    return {
        meta,
        analysis: analyze(meta, dist.gzip, resolveSplits(dist.splits, Object.keys(meta.inputs)), dist.announced),
    };
};

describe('a webpack stats.json read as a metafile', () => {
    it('webpack 4: three screens and the widget deferred inside one, as the Vite build of the same app', async () => {
        const { analysis } = await analysed(APP4);

        expect(labels(analysis.screens)).toEqual(['home', 'orders', 'settings']);
        expect(labels(analysis.deferredBlocks)).toEqual(['chart.widget']);
        expect(analysis.bootChunks).toEqual(['main.e32fbe6a.js']);
    });

    it('webpack 5: the runtime chunk is part of the bootstrap, and the shared file is one shared chunk', async () => {
        const { analysis } = await analysed(APP5);

        expect(labels(analysis.screens)).toEqual(['home', 'orders', 'settings']);
        expect(analysis.bootChunks.toSorted((a, b) => a.localeCompare(b))).toEqual([
            'main.3d99975a.js',
            'runtime.f204f23e.js',
        ]);
        expect(analysis.sharedChunks.map(chunk => chunk.mainContent)).toEqual(['src/table.js']);
    });

    /**
     * webpack asks for every chunk of a lazy group at once (`__webpack_require__.e`), so the shared
     * chunk arrives in the same round trip as the route. Read as a plain graph it would be one more.
     */
    it('a route and the chunk it shares arrive in one round trip', async () => {
        const { analysis } = await analysed(APP5);

        expect(analysis.screens.find(screen => screen.label === 'orders')?.waves).toBe(1);
    });

    /** A module's `size` is its source; shared out over the file, the parts add up to the file. */
    it('the weight per file adds up to the file it is in', async () => {
        const { meta } = await analysed(APP5);
        const main = meta.outputs['main.3d99975a.js'];
        const sum = Object.values(main?.inputs ?? {}).reduce((total, input) => total + input.bytesInOutput, 0);

        expect(sum).toBe(main?.bytes);
        expect(Object.keys(main?.inputs ?? {}).toSorted((a, b) => a.localeCompare(b))).toEqual([
            'src/main.js',
            'src/shared.js',
        ]);
    });

    it('the edges between files come from the reasons webpack wrote', async () => {
        const { meta } = await analysed(APP4);

        expect(meta.inputs['src/main.js']?.imports).toEqual(
            expect.arrayContaining([
                { path: 'src/shared.js', kind: 'import-statement' },
                { path: 'src/home.page.js', kind: 'dynamic-import' },
            ]),
        );
    });
});
