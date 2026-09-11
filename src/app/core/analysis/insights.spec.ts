import { describe, expect, it } from 'vitest';
import { analyze } from './analysis';
import { type Metafile } from './metafile.types';

/**
 * A build shaped to exercise the eight figures that come out of the graph and used to go unread.
 *
 *   main --static--> shared/index.ts (a barrel) --static--> a.ts, b.ts, c.ts, d.ts, e.ts
 *   main --static--> node_modules/util/index.js --static--> forty files of `util`
 *   main --static--> src/app/core/thing.ts --static--> src/app/feature/back.ts --static--> core/thing.ts
 *   main --dynamic--> src/app/lazy.ts, which something also imports statically
 */
const barrelImports = ['a', 'b', 'c', 'd', 'e'].map(name => ({
    path: `src/app/shared/${name}.ts`,
    kind: 'import-statement' as const,
}));

const utilFiles = Array.from({ length: 12 }, (_, index) => `node_modules/util/lib/f${index}.js`);

const meta: Metafile = {
    inputs: {
        'src/main.ts': {
            bytes: 100,
            format: 'esm',
            imports: [
                { path: 'src/app/shared/index.ts', kind: 'import-statement' },
                { path: 'node_modules/util/index.js', kind: 'import-statement' },
                { path: 'src/app/core/thing.ts', kind: 'import-statement' },
                { path: 'src/app/routes.ts', kind: 'import-statement' },
                // The static half of a mixed import: it is what keeps `lazy.ts` eager.
                { path: 'src/app/lazy.ts', kind: 'import-statement' },
            ],
        },
        'src/app/routes.ts': {
            bytes: 40,
            format: 'esm',
            imports: [{ path: 'src/app/lazy.ts', kind: 'dynamic-import' }],
        },
        // Five re-exports and 200 bytes of source: the shape of a barrel.
        'src/app/shared/index.ts': { bytes: 200, format: 'esm', imports: barrelImports },
        ...Object.fromEntries(
            ['a', 'b', 'c', 'd', 'e'].map(name => [
                `src/app/shared/${name}.ts`,
                { bytes: 300, format: 'esm', imports: [] },
            ]),
        ),
        // A cycle between two folders of the project, which is also a cycle between two files.
        'src/app/core/thing.ts': {
            bytes: 120,
            format: 'esm',
            imports: [{ path: 'src/app/feature/back.ts', kind: 'import-statement' }],
        },
        'src/app/feature/back.ts': {
            bytes: 120,
            format: 'esm',
            imports: [{ path: 'src/app/core/thing.ts', kind: 'import-statement' }],
        },
        'src/app/lazy.ts': { bytes: 90, format: 'esm', imports: [] },
        'node_modules/util/index.js': {
            bytes: 100,
            format: 'esm',
            imports: utilFiles.map(path => ({ path, kind: 'import-statement' as const })),
        },
        ...Object.fromEntries(utilFiles.map(path => [path, { bytes: 200, format: 'esm', imports: [] }])),
    },
    outputs: {
        'dist/main.js': {
            bytes: 4000,
            entryPoint: 'src/main.ts',
            inputs: {
                'src/main.ts': { bytesInOutput: 100 },
                'src/app/routes.ts': { bytesInOutput: 40 },
                'src/app/shared/index.ts': { bytesInOutput: 10 },
                'src/app/shared/a.ts': { bytesInOutput: 300 },
                'src/app/shared/b.ts': { bytesInOutput: 300 },
                'src/app/shared/c.ts': { bytesInOutput: 300 },
                'src/app/shared/d.ts': { bytesInOutput: 300 },
                'src/app/shared/e.ts': { bytesInOutput: 300 },
                'src/app/core/thing.ts': { bytesInOutput: 120 },
                'src/app/feature/back.ts': { bytesInOutput: 120 },
                'src/app/lazy.ts': { bytesInOutput: 90 },
                'node_modules/util/index.js': { bytesInOutput: 100 },
                ...Object.fromEntries(utilFiles.map(path => [path, { bytesInOutput: 200 }])),
            },
            imports: [{ path: 'dist/lazy.js', kind: 'dynamic-import' }],
        },
        // The lazy chunk exists and holds the same module the bootstrap already carries.
        'dist/lazy.js': {
            bytes: 90,
            entryPoint: 'src/app/lazy.ts',
            inputs: { 'src/app/lazy.ts': { bytesInOutput: 90 } },
        },
    },
};

const insights = analyze(meta, null).insights();

describe('graph insights · exclusive weight', () => {
    it('charges a package with everything only it brings in', () => {
        // `util` is 100 bytes of index and twelve files of 200 that nothing else reaches: 2.500.
        expect(insights.exclusive.get('util')).toBe(100 + 12 * 200);
    });

    it('charges a folder of the project with its own weight', () => {
        // `shared` is the barrel plus its five files, all of them reached only through it.
        expect(insights.exclusive.get('shared')).toBe(10 + 5 * 300);
    });
});

describe('graph insights · barrels', () => {
    it('names an own file that is a list of re-exports and says what comes in behind it', () => {
        const barrel = insights.ownBarrels.find(entry => entry.path === 'src/app/shared/index.ts');

        expect(barrel?.reexports).toBe(5);
        // Itself and the five files it names.
        expect(barrel?.pulls).toBe(6);
        expect(barrel?.exclusive).toBe(10 + 5 * 300);
        expect(barrel?.importers).toEqual(['src/main.ts']);
        expect(barrel?.inBoot).toBe(true);
    });

    it('names a package shipping far more files than anything imports from it', () => {
        const pkg = insights.packageBarrels.find(entry => entry.name === 'util');

        expect(pkg?.files).toBe(13);
        // One way in: `node_modules/util/index.js`. The other twelve are internal.
        expect(pkg?.entryPoints).toBe(1);
        expect(pkg?.importers).toEqual(['src/main.ts']);
    });
});

describe('graph insights · cycles', () => {
    it('finds the loop between two files and draws it as a circle', () => {
        const [cycle] = insights.cycles;

        expect(cycle?.size).toBe(2);
        expect(cycle?.steps.at(0)).toBe(cycle?.steps.at(-1));
        expect(cycle?.steps).toHaveLength(3);
        expect(cycle?.inBoot).toBe(true);
    });

    it('reports the same loop between the folders, which is where a rule gets written', () => {
        const [cycle] = insights.folderCycles;

        expect(cycle?.steps.slice(0, 2).toSorted((a, b) => a.localeCompare(b))).toEqual(['core', 'feature']);
    });
});

describe('graph insights · the rest of what the graph already knew', () => {
    it('names a module imported statically and dynamically at once', () => {
        const [mixed] = insights.mixedImports;

        expect(mixed?.path).toBe('src/app/lazy.ts');
        expect(mixed?.staticImporters).toEqual(['src/main.ts']);
        expect(mixed?.dynamicImporters).toEqual(['src/app/routes.ts']);
        expect(mixed?.inBoot).toBe(true);
    });

    it('adds up the bytes of a module copied into two chunks', () => {
        // `lazy.ts` is in the bootstrap and in its own chunk: the second copy is paid for nothing.
        expect(insights.paidTwiceBytes).toBe(90);
        expect(insights.paidTwice[0]?.copies).toBe(2);
    });

    it('says how much of the first load is somebody else’s code', () => {
        const { theirs, yours, theirsRatio } = insights.ownership;

        expect(theirs).toBe(100 + 12 * 200);
        expect(yours).toBe(100 + 40 + 10 + 5 * 300 + 120 + 120 + 90);
        expect(Math.round(theirsRatio * 100)).toBe(56);
    });
});
