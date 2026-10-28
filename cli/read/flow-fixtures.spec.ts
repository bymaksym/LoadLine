/**
 * The flow diagram on every real build in `fixtures/`: Vite in four shapes, Rollup's AMD, webpack 4
 * and 5. The model is tested on made-up metafiles next to it; these are the bundlers' own outputs,
 * read the way the command reads them, in raw bytes and in gzip, where a package's share of a chunk
 * is scaled by the ratio its chunk compresses by — the place a column that does not add up would
 * show first.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/app/core/analysis/analysis';
import { type Analysis } from '../../src/app/core/analysis/analysis.types';
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
    return [
        analyze(meta, null, null, dist.announced, null, undefined, dist.graph?.parallel, dist.graph?.routes),
        analyze(meta, dist.gzip, null, dist.announced, null, undefined, dist.graph?.parallel, dist.graph?.routes),
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
