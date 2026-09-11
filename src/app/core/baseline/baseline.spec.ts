import { describe, expect, it } from 'vitest';
import { type Analysis } from '../analysis/analysis.types';
import { compare, isSnapshot, snapshotOf } from './baseline';
import { type Snapshot } from './baseline.types';

const analysis = {
    bootBytes: 1000,
    bootBuckets: [
        { name: 'heavy-lib', bytes: 600, isProjectCode: false },
        { name: 'core/services', bytes: 400, isProjectCode: true },
    ],
    screens: [
        { source: 'src/app/a.page.ts', label: 'a', total: 1500, shared: 300, own: 200 },
        { source: 'src/app/b.page.ts', label: 'b', total: 1300, shared: 300, own: 0 },
    ],
    // A snapshot carries the hashed names of the build, which is what lets the next one work out
    // what an update costs. What is under test here is the comparison, so two chunks are enough.
    allChunks: ['dist/main-A1B2C3D4.js', 'dist/screen-E5F6G7H8.js'],
    chunkOf: (file: string) => ({ bytes: file.includes('main') ? 1000 : 500 }),
} as unknown as Analysis;

const baseline: Snapshot = {
    tool: 'loadline',
    version: 1,
    name: 'before.json',
    date: '2026-08-01T00:00:00.000Z',
    mode: 'raw',
    boot: 800,
    bootPackages: [{ name: 'other-lib', bytes: 100 }],
    screens: [
        { source: 'src/app/a.page.ts', label: 'a', total: 1200, shared: 300, own: 100 },
        { source: 'src/app/gone.page.ts', label: 'gone', total: 900, shared: 100, own: 0 },
    ],
};

describe('snapshotOf', () => {
    it('keeps the bootstrap, its npm packages and the screens, and nothing else', () => {
        const snapshot = snapshotOf(analysis, 'raw', 'stats.json', new Date('2026-09-01'));

        expect(isSnapshot(snapshot)).toBe(true);
        expect(snapshot.boot).toBe(1000);
        // Project folders are left out: they change with every commit and would always "enter".
        expect(snapshot.bootPackages).toEqual([{ name: 'heavy-lib', bytes: 600 }]);
        expect(snapshot.screens).toHaveLength(2);
        expect(snapshot.date).toBe('2026-09-01T00:00:00.000Z');
    });

    it('tells a snapshot apart from a metafile', () => {
        expect(isSnapshot({ outputs: {}, inputs: {} })).toBe(false);
        expect(isSnapshot({ tool: 'loadline', version: 2 })).toBe(false);
        // Exports written when the tool was called `tara` still read as baselines.
        expect(isSnapshot({ ...baseline, tool: 'tara' })).toBe(true);
    });
});

describe('compare', () => {
    const result = compare(snapshotOf(analysis, 'raw', 'now.json'), baseline);

    it('measures the bootstrap movement', () => {
        expect(result.boot).toEqual({ before: 800, after: 1000, diff: 200, ratio: 0.25 });
    });

    it('compares screens by source, separating the total from what is loaded beyond the bootstrap', () => {
        const a = result.screens.get('src/app/a.page.ts');

        expect(a?.total.diff).toBe(300);
        // Shared + own: 400 before, 500 now. The bootstrap growth is not counted here.
        expect(a?.lazy).toEqual({ before: 400, after: 500, diff: 100, ratio: 0.25 });
    });

    it('lists screens that appeared and disappeared instead of guessing renames', () => {
        expect(result.newScreens.map(s => s.label)).toEqual(['b']);
        expect(result.goneScreens.map(s => s.label)).toEqual(['gone']);
    });

    it('lists packages that entered or left the bootstrap', () => {
        expect(result.newBootPackages).toEqual([{ name: 'heavy-lib', bytes: 600 }]);
        expect(result.goneBootPackages).toEqual([{ name: 'other-lib', bytes: 100 }]);
    });
});
