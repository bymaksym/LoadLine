import { describe, expect, it } from 'vitest';
import { type Analysis, type BucketSlice, type ModuleEntry, type ScreenCost } from '../analysis/analysis.types';
import { type GraphInsights } from '../analysis/insights.types';
import { RECOMMENDED } from '../criteria/criteria';
import { buildOwnInBootFindings } from './own-in-boot';

const KB = 1024;
const criteria = RECOMMENDED.raw;

const module = (path: string, bytes: number, zone: 'boot' | 'own' = 'boot'): ModuleEntry => ({
    path,
    label: path,
    pkg: null,
    bytes,
    places: [{ chunk: 'dist/main.js', chunkName: 'main.js', bytes, zone, screens: 0 }],
});

const analysis = (
    modules: ModuleEntry[],
    importers: Record<string, string[]>,
    screens: string[],
    buckets: Record<string, number>,
): Analysis =>
    ({
        modules,
        ownImporters: new Map(Object.entries(importers).map(([file, list]) => [file, new Set(list)])),
        screens: screens.map(source => ({ source }) as ScreenCost),
        bootBuckets: Object.entries(buckets).map(([name, bytes]): BucketSlice => ({
            name,
            bytes,
            isProjectCode: true,
        })),
        // The signals ask the insights what taking these files out would save. What is under test
        // here is which of them get named, not the figure, so the stub answers nothing.
        insights: () => ({ exclusiveOf: () => 0, filesByBucket: new Map() }) as unknown as GraphInsights,
    }) as Analysis;

// `projectFolderOf` names a folder as the two levels under `src/app`: this is what a real path gives.
const folder = 'domain/customer';
const page = 'src/app/features/licenses/licenses-list.page.ts';
const provider = 'src/app/core/entities.provider.ts';

/** The real shape of the problem: a layer in the bootstrap across many tiny files. */
const layer = ['a', 'b', 'c', 'd'].map(name => module(`src/app/domain/customer/${name}.service.ts`, 4 * KB));
const importedByBoth = Object.fromEntries(layer.map(m => [m.path, [provider, page]]));

describe('buildOwnInBootFindings', () => {
    it('fires on a folder of yours in the bootstrap whose consumers are deferred screens', () => {
        const result = buildOwnInBootFindings(
            analysis(layer, importedByBoth, [page], { [folder]: 16 * KB }),
            'en',
            criteria,
        );

        expect(result[0]?.chip).toBe('your own code in the bootstrap for a lazy screen');
        // What holds it there is what has to be edited, and it is named.
        expect(result[0]?.body).toContain(provider);
        expect(result[0]?.body).toContain('1 lazy screen');
    });

    it('four files of 4 kB are below every per-file threshold and still count together', () => {
        // Each file is 4 kB; the package floor is 25 kB. Per file this finds nothing.
        expect(layer.every(m => m.bytes < criteria.bootPackageMinBytes)).toBe(true);
        expect(
            buildOwnInBootFindings(analysis(layer, importedByBoth, [page], { [folder]: 16 * KB }), 'en', criteria),
        ).toHaveLength(1);
    });

    it('says nothing when no deferred screen uses it', () => {
        const importers = Object.fromEntries(layer.map(m => [m.path, [provider]]));

        expect(
            buildOwnInBootFindings(analysis(layer, importers, [page], { [folder]: 16 * KB }), 'en', criteria),
        ).toEqual([]);
    });

    it('held there by many files it is infrastructure, not one import to move', () => {
        const many = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'];
        const importers = Object.fromEntries(layer.map(m => [m.path, [...many, page]]));

        expect(
            buildOwnInBootFindings(analysis(layer, importers, [page], { [folder]: 16 * KB }), 'en', criteria),
        ).toEqual([]);
    });

    it('files of the folder importing each other say nothing about who wants it', () => {
        const inside = Object.fromEntries(layer.map(m => [m.path, ['src/app/domain/customer/other.ts']]));

        expect(buildOwnInBootFindings(analysis(layer, inside, [page], { [folder]: 16 * KB }), 'en', criteria)).toEqual(
            [],
        );
    });

    it('a light folder is not worth a line', () => {
        expect(
            buildOwnInBootFindings(analysis(layer, importedByBoth, [page], { [folder]: 2 * KB }), 'en', criteria),
        ).toEqual([]);
    });

    it('a folder that is not in the bootstrap is not this signal', () => {
        const lazy = layer.map(m => module(m.path, m.bytes, 'own'));

        expect(
            buildOwnInBootFindings(analysis(lazy, importedByBoth, [page], { [folder]: 16 * KB }), 'en', criteria),
        ).toEqual([]);
    });
});
