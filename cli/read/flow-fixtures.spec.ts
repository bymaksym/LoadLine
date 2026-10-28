/**
 * The flow diagram on every build in `fixtures/` that has one: Vite in four shapes, Rollup's AMD,
 * webpack 4 and 5, and Metro's web export with its sectioned source map. `expo-native-app` is
 * refused before there is a flow, and `pnpm9-lock` is a lockfile, not a build. The model is tested
 * on made-up metafiles next to it; these are the bundlers' own outputs, read the way the command
 * reads them, in raw bytes and in gzip, where a package's share of a chunk is scaled by the ratio
 * its chunk compresses by — the place a column that does not add up would show first.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/app/core/analysis/analysis';
import { type Analysis } from '../../src/app/core/analysis/analysis.types';
import { resolveSplits } from '../../src/app/core/analysis/sourcemap/sourcemap';
import { flowOf } from '../../src/app/core/analysis/views/flow/flow';
import { EN } from '../../src/app/core/i18n/en';
import { exists, readDist, readStats } from './read-build';

const FIXTURES = [
    'vite-app',
    'vite5-app',
    'vite-relative-app',
    'vite-router-app',
    'vite-legacy-app',
    'rollup-amd-app',
    'webpack4-app',
    'webpack5-app',
    'metro-sectioned-map',
];

const analyses = async (fixture: string): Promise<Analysis[]> => {
    const root = join(process.cwd(), 'fixtures', fixture);
    const stats = join(root, 'stats.json');
    const fromStats = await exists(stats);
    // A folder with its stats.json is read for its sizes only, as the command does; without one,
    // the graph comes out of the folder itself.
    const dist = await readDist(join(root, 'dist'), !fromStats);
    const meta = fromStats ? await readStats(stats, EN) : dist.graph?.meta;
    if (!meta) {
        throw new Error(`${fixture}: no graph`);
    }
    // The packages inside a chunk from its source map, where there is one, as `buildReport` does.
    const exact = resolveSplits(dist.splits, Object.keys(meta.inputs));
    return [
        analyze(meta, null, exact, dist.announced, null, undefined, dist.graph?.parallel, dist.graph?.routes),
        analyze(meta, dist.gzip, exact, dist.announced, null, undefined, dist.graph?.parallel, dist.graph?.routes),
    ];
};

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

describe.each(FIXTURES)('the flow of %s', fixture => {
    it('adds up in raw bytes and in gzip, and gives every screen its first trip', async () => {
        const both = await analyses(fixture);
        for (const analysis of both) {
            const model = flowOf(analysis);

            expect(model.buildBytes, 'nothing drawn').toBeGreaterThan(0);
            expect(sum(model.sources.map(node => node.bytes))).toBeCloseTo(model.buildBytes, 3);
            for (const middle of model.middles) {
                const into = sum(model.inLinks.filter(link => link.to === middle.id).map(link => link.bytes));
                expect(into, `into ${middle.id}`).toBeCloseTo(middle.bytes, 3);
            }
            for (const target of model.targets) {
                const into = sum(model.outLinks.filter(link => link.to === target.id).map(link => link.bytes));
                expect(into, `into ${target.id}`).toBeCloseTo(target.total, 3);
            }
            expect(sum(model.targets.map(node => node.total))).toBe(
                analysis.screens.length > 0 ? sum(analysis.screens.map(screen => screen.total)) : analysis.bootBytes,
            );
            expect(model.takeaway, 'no sentence under the diagram').not.toBeNull();
        }
    });
});

/**
 * Metro's one bundle is split by package only through its sectioned map (an index map with nothing
 * at its root). Read as a folder without maps, the left column would be one "bundler code" bar.
 */
describe('the flow of a Metro build with a sectioned map', () => {
    it('names the packages its sections hold', async () => {
        const [raw] = await analyses('metro-sectioned-map');
        const packages = flowOf(raw!)
            .sources.filter(node => node.kind === 'package')
            .map(node => node.label);

        expect(packages).toEqual(expect.arrayContaining(['react', 'expo-router']));
    });
});
