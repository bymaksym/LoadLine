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
        {
            source: 'src/app/a.page.ts',
            label: 'a',
            total: 1500,
            shared: 300,
            own: 200,
            ownChunks: ['dist/a.js'],
            sharedChunks: ['dist/common.js'],
        },
        {
            source: 'src/app/b.page.ts',
            label: 'b',
            total: 1300,
            shared: 300,
            own: 0,
            ownChunks: [],
            sharedChunks: ['dist/common.js'],
        },
    ],
    // What each screen's lazy part is made of. `chart-lib` sits in both the bootstrap and `a`'s own
    // chunk: only the lazy copy belongs to the screen.
    modules: [
        {
            path: 'node_modules/chart-lib/index.js',
            pkg: 'chart-lib',
            places: [
                { chunk: 'dist/main.js', bytes: 50, zone: 'boot' },
                { chunk: 'dist/a.js', bytes: 150, zone: 'own' },
            ],
        },
        { path: 'src/app/a/page/a.page.ts', pkg: null, places: [{ chunk: 'dist/a.js', bytes: 50, zone: 'own' }] },
        {
            path: 'src/app/shared/ui/table.ts',
            pkg: null,
            places: [{ chunk: 'dist/common.js', bytes: 300, zone: 'shared' }],
        },
    ],
    tree: [
        { id: 'dist/main.js', bytes: 1000, rawBytes: 1000 },
        { id: 'dist/a.js', bytes: 200, rawBytes: 200 },
        { id: 'dist/common.js', bytes: 300, rawBytes: 300 },
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
        // Project folders are not packages: they go apart, in `bootOwn`, so a comparison against an
        // older baseline that has no such list does not read every folder as a package that entered.
        expect(snapshot.bootPackages).toEqual([{ name: 'heavy-lib', bytes: 600 }]);
        expect(snapshot.bootOwn).toEqual([{ name: 'core/services', bytes: 400 }]);
        expect(snapshot.screens).toHaveLength(2);
        expect(snapshot.date).toBe('2026-09-01T00:00:00.000Z');
    });

    it("breaks each screen's lazy part down by package and own folder, leaving the bootstrap out", () => {
        const [a, b] = snapshotOf(analysis, 'raw', 'stats.json').screens;

        expect(a?.lazyParts).toEqual([
            { name: 'shared/ui', bytes: 300, own: true },
            { name: 'chart-lib', bytes: 150, own: false },
            { name: 'a/page', bytes: 50, own: true },
        ]);
        expect(a?.lazyRaw).toBe(500);
        expect(b?.lazyParts).toEqual([{ name: 'shared/ui', bytes: 300, own: true }]);
    });

    it('records no breakdown for a screen whose chunks say nothing of what is inside them', () => {
        // A folder read without source maps: the chunks weigh something and break down into
        // nothing. `[]` would make the next build, which does say, read all of it as new.
        const blind = { ...analysis, modules: [] } as unknown as Analysis;
        const [a] = snapshotOf(blind, 'raw', 'stats.json').screens;

        expect(a?.lazyParts).toBeUndefined();
        expect(a?.lazyRaw).toBeUndefined();
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

    it('against a bootstrap that weighs something and breaks down into nothing, names no package', () => {
        // The export of a folder read without source maps: its lists are empty because it could not
        // see inside the chunks, not because nothing was there.
        const blind: Snapshot = { ...baseline, bootPackages: [], bootOwn: [] };
        const against = compare(snapshotOf(analysis, 'raw', 'now.json'), blind);

        expect(against.newBootPackages).toEqual([]);
        expect(against.bootCauses).toEqual([]);
        expect(against.boot.diff).toBe(200);
    });

    /**
     * A folder read without source maps knows a screen by its chunk, and an edit renames the chunk.
     * Matched by that name only, every screen of a Vite build came out new and gone at once, and a
     * screen that grew 14 kB passed `--max-growth 5kB` because no screen was ever compared.
     */
    it('pairs a screen known only by its hashed chunk with the same screen under its new hash', () => {
        const chunk = (source: string, own: number) => ({
            source,
            label: 'Settings',
            total: 1000 + own,
            shared: 0,
            own,
        });
        const then: Snapshot = { ...baseline, screens: [chunk('assets/Settings-AAAAAAAA.js', 1000)] };
        const now: Snapshot = { ...baseline, screens: [chunk('assets/Settings-BBBBBBBB.js', 15_000)] };
        const delta = compare(now, then);

        expect(delta.screens.get('assets/Settings-BBBBBBBB.js')?.lazy.diff).toBe(14_000);
        expect(delta.newScreens).toEqual([]);
        expect(delta.goneScreens).toEqual([]);
    });

    it('pairs nothing by a name two screens share', () => {
        const chunk = (source: string) => ({ source, label: 'index', total: 1000, shared: 0, own: 0 });
        const then: Snapshot = {
            ...baseline,
            screens: [chunk('assets/index-AAAAAAAA.js'), chunk('assets/index-CCCCCCCC.js')],
        };
        const now: Snapshot = {
            ...baseline,
            screens: [chunk('assets/index-BBBBBBBB.js'), chunk('assets/index-DDDDDDDD.js')],
        };

        expect(compare(now, then).screens.size).toBe(0);
    });
});

describe('what the bootstrap change is made of', () => {
    const before: Snapshot = {
        ...baseline,
        boot: 30_000,
        bootRaw: 100_000,
        bootPackages: [
            { name: '@angular/core', bytes: 60_000 },
            { name: 'date-fns', bytes: 10_000 },
            { name: 'left-pad', bytes: 2000 },
        ],
        bootOwn: [{ name: 'app/rooms', bytes: 28_000 }],
    };
    const after: Snapshot = {
        ...before,
        boot: 40_000,
        bootRaw: 130_000,
        bootPackages: [
            { name: '@angular/core', bytes: 60_100 },
            { name: 'date-fns', bytes: 15_000 },
            { name: '@microsoft/teams-js', bytes: 19_000 },
        ],
        bootOwn: [{ name: 'app/rooms', bytes: 36_000 }],
    };

    it('names what entered, grew and left, biggest first, and leaves out what barely moved', () => {
        const causes = compare(after, before).bootCauses;
        expect(causes.map(cause => [cause.name, cause.change, cause.diff])).toEqual([
            ['@microsoft/teams-js', 'new', 19_000],
            ['app/rooms', 'grew', 8000],
            ['date-fns', 'grew', 5000],
            ['left-pad', 'gone', -2000],
        ]);
        expect(causes[1]?.own).toBe(true);
    });

    it('carries the ratio that turns raw causes into the unit of the report', () => {
        const result = compare(after, before);
        expect(result.causesRatio).toBeCloseTo(40_000 / 130_000);
        expect(result.causesEstimated).toBe(true);
    });

    it('explains by package only against a baseline that never recorded the own folders', () => {
        const result = compare(after, { ...before, bootOwn: undefined });
        expect(result.causesOwnKnown).toBe(false);
        expect(result.bootCauses.some(cause => cause.own)).toBe(false);
    });
});

describe('what a screen change is made of', () => {
    const screen = (shared: number, lazyRaw: number, parts: Snapshot['screens'][number]['lazyParts']) => ({
        source: 'src/app/reports/reports.page.ts',
        label: 'reports',
        total: 30_000 + shared,
        shared,
        own: 0,
        lazyRaw,
        lazyParts: parts,
    });
    const before: Snapshot = {
        ...baseline,
        screens: [
            screen(10_000, 40_000, [
                { name: 'reports/table', bytes: 30_000, own: true },
                { name: 'date-fns', bytes: 10_000, own: false },
            ]),
        ],
    };
    const after: Snapshot = {
        ...before,
        screens: [
            screen(50_000, 200_000, [
                { name: 'xlsx', bytes: 158_000, own: false },
                { name: 'reports/table', bytes: 32_000, own: true },
                { name: 'date-fns', bytes: 10_200, own: false },
            ]),
        ],
    };

    it('names what entered and grew in what the screen loads lazily, by the rules of the bootstrap', () => {
        const delta = compare(after, before).screens.get('src/app/reports/reports.page.ts');

        // `date-fns` moved 200 bytes: noise, left out like it is in the bootstrap.
        expect(delta?.causes?.map(cause => [cause.name, cause.change, cause.diff, cause.own])).toEqual([
            ['xlsx', 'new', 158_000, false],
            ['reports/table', 'grew', 2000, true],
        ]);
        // The screen's own ratio, not the bootstrap's: its lazy part shows 50 000 of 200 000 raw.
        expect(delta?.causesRatio).toBeCloseTo(0.25);
        expect(delta?.causesEstimated).toBe(true);
    });

    it('gives no causes rather than wrong ones against a baseline without the breakdown', () => {
        const older: Snapshot = {
            ...before,
            screens: before.screens.map(({ lazyParts: _parts, lazyRaw: _raw, ...rest }) => rest),
        };
        expect(compare(after, older).screens.get('src/app/reports/reports.page.ts')?.causes).toBeNull();
    });
});
