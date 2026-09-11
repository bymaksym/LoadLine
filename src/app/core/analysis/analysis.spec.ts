import { describe, expect, it } from 'vitest';
import { analyze } from './analysis';
import { type Metafile } from './metafile.types';

/**
 * Minimal metafile reproducing the real breakdown of a SPA:
 *
 *   main  --static-->   vendor
 *   main  --dynamic-->  screen-a, screen-b
 *   screen-a --static--> shared, only-a
 *   screen-b --static--> shared
 *
 * `shared` is loaded by both screens: the bundler marks it lazy, but it always downloads.
 */
const meta: Metafile = {
    inputs: {
        'src/main.ts': {
            bytes: 100,
            format: 'esm',
            imports: [
                { path: 'node_modules/heavy-lib/index.js', kind: 'import-statement' },
                { path: 'src/app/app.routes.ts', kind: 'import-statement' },
            ],
        },
        // The routes file: it lazy-loads the screens, so it is where a route's providers go.
        'src/app/app.routes.ts': {
            bytes: 50,
            format: 'esm',
            imports: [
                { path: 'src/app/a.page.ts', kind: 'dynamic-import' },
                { path: 'src/app/b.page.ts', kind: 'dynamic-import' },
            ],
        },
        'src/app/a.page.ts': {
            bytes: 100,
            format: 'esm',
            imports: [{ path: 'node_modules/pdf/index.js', kind: 'import-statement' }],
        },
        'src/app/b.page.ts': { bytes: 100, format: 'esm', imports: [] },
        'node_modules/heavy-lib/index.js': {
            bytes: 500,
            format: 'esm',
            imports: [{ path: 'node_modules/tiny-cjs/index.js', kind: 'require-call' }],
        },
        'node_modules/tiny-cjs/index.js': { bytes: 40, format: 'cjs' },
        'node_modules/pdf/index.js': { bytes: 300, format: 'cjs' },
    },
    outputs: {
        'dist/main.js': {
            bytes: 1000,
            entryPoint: 'src/main.ts',
            inputs: { 'src/main.ts': { bytesInOutput: 1000 } },
            imports: [
                { path: 'dist/vendor.js', kind: 'import-statement' },
                { path: 'dist/screen-a.js', kind: 'dynamic-import' },
                { path: 'dist/screen-b.js', kind: 'dynamic-import' },
            ],
        },
        'dist/vendor.js': {
            bytes: 500,
            inputs: {
                'node_modules/heavy-lib/index.js': { bytesInOutput: 460 },
                'node_modules/tiny-cjs/index.js': { bytesInOutput: 40 },
            },
        },
        'dist/screen-a.js': {
            bytes: 200,
            entryPoint: 'src/app/a.page.ts',
            inputs: { 'src/app/a.page.ts': { bytesInOutput: 200 } },
            imports: [
                { path: 'dist/shared.js', kind: 'import-statement' },
                { path: 'dist/only-a.js', kind: 'import-statement' },
            ],
        },
        'dist/screen-b.js': {
            bytes: 200,
            entryPoint: 'src/app/b.page.ts',
            inputs: { 'src/app/b.page.ts': { bytesInOutput: 200 } },
            imports: [{ path: 'dist/shared.js', kind: 'import-statement' }],
        },
        'dist/shared.js': { bytes: 800, inputs: { 'node_modules/ui-kit/index.js': { bytesInOutput: 800 } } },
        'dist/only-a.js': { bytes: 300, inputs: { 'node_modules/pdf/index.js': { bytesInOutput: 300 } } },
    },
};

const byName = (a: string, b: string) => a.localeCompare(b);

describe('analyze', () => {
    it('the bootstrap only follows static imports', () => {
        const result = analyze(meta, null);

        // main + vendor. Screens are reached through a dynamic import, so they do not count.
        expect(result.bootBytes).toBe(1500);
        expect(result.bootFiles).toBe(2);
    });

    it('detects the screens and discards what is not one', () => {
        const result = analyze(meta, null);

        expect(result.screens.map(s => s.label).toSorted(byName)).toEqual(['a', 'b']);
    });

    it('separates own from shared', () => {
        const result = analyze(meta, null);
        const a = result.screens.find(s => s.label === 'a');
        const b = result.screens.find(s => s.label === 'b');

        // `shared` is loaded by both -> shared.
        // Own of A = its own chunk (200) + `only-a` (300), which only it reaches.
        expect(a?.shared).toBe(800);
        expect(a?.own).toBe(500);
        expect(a?.total).toBe(1500 + 500 + 800);

        // B has no exclusive dependencies, so its own is just its chunk.
        expect(b?.shared).toBe(800);
        expect(b?.own).toBe(200);
    });

    it('counts the round trips a screen takes, starting at its own chunk', () => {
        const result = analyze(meta, null);
        const a = result.screens.find(s => s.label === 'a');

        // `screen-a` is asked for when the router matches; `shared` and `only-a` are not known to
        // exist until it has arrived and been parsed, so they cost a second one.
        expect(a?.waves).toBe(2);
        expect(a?.chunkWaves.get('dist/screen-a.js')).toBe(1);
        expect(a?.chunkWaves.get('dist/shared.js')).toBe(2);
        // The bootstrap is already there when the router navigates: it is not part of the count.
        expect(a?.chunkWaves.has('dist/main.js')).toBe(false);
    });

    it('says nothing about the first load without index.html, and counts it with one', () => {
        expect(analyze(meta, null).startup).toBeNull();

        // The page names the entry but not the vendor chunk it imports: that one arrives late.
        expect(analyze(meta, null, null, new Set(['main.js']))).toMatchObject({
            startup: { waves: 2, discovered: ['dist/vendor.js'], byWave: [['dist/vendor.js']] },
        });
        expect(analyze(meta, null, null, new Set(['main.js', 'vendor.js']))).toMatchObject({
            startup: { waves: 1, discovered: [], byWave: [] },
        });
    });

    it('counts how many screens load each shared chunk', () => {
        const result = analyze(meta, null);

        expect(result.sharedChunks).toHaveLength(1);
        expect(result.sharedChunks[0]?.name).toBe('shared.js');
        expect(result.sharedChunks[0]?.screens).toBe(2);
    });

    it('knows which screens load each lazy chunk', () => {
        const result = analyze(meta, null);

        // The other side of the counter: not just how many, but which. It is what links chunk and screen.
        expect(result.chunkScreens.get('dist/shared.js')?.toSorted(byName)).toEqual([
            'src/app/a.page.ts',
            'src/app/b.page.ts',
        ]);
        expect(result.chunkScreens.get('dist/only-a.js')).toEqual(['src/app/a.page.ts']);
        // What is in the bootstrap does not count as loaded by a screen.
        expect(result.chunkScreens.has('dist/vendor.js')).toBe(false);
    });

    it('uses the compressed sizes when given', () => {
        const gzip = new Map([
            ['main.js', 100],
            ['vendor.js', 50],
        ]);
        const result = analyze(meta, gzip);

        expect(result.bootBytes).toBe(150);
    });

    it('breaks the bootstrap down by package and own folder', () => {
        const result = analyze(meta, null);
        const names = result.bootBuckets.map(b => b.name);

        expect(names).toContain('heavy-lib');
        expect(result.bootBuckets.find(b => b.name === 'heavy-lib')?.isProjectCode).toBe(false);
    });

    it('follows the import chain from the entry to each bootstrap package', () => {
        const result = analyze(meta, null);

        // The import to look at: `main.ts` imports `heavy-lib` directly.
        expect(result.bootChains.get('heavy-lib')).toEqual(['src/main.ts', 'node_modules/heavy-lib/index.js']);
        // Through another package: the `require` inside `heavy-lib` brings `tiny-cjs`.
        expect(result.bootChains.get('tiny-cjs')).toEqual([
            'src/main.ts',
            'node_modules/heavy-lib/index.js',
            'node_modules/tiny-cjs/index.js',
        ]);
        // Behind a dynamic import there is no static chain: it is not in the bootstrap.
        expect(result.bootChains.has('pdf')).toBe(false);
    });

    it('knows which file lazy-loads each screen', () => {
        const result = analyze(meta, null);

        expect(result.screenLoaders.get('src/app/a.page.ts')).toEqual(['src/app/app.routes.ts']);
        expect(result.screenLoaders.get('src/app/b.page.ts')).toEqual(['src/app/app.routes.ts']);
    });

    it('lists the CommonJS packages with where they land and who brings them', () => {
        const result = analyze(meta, null);

        // Bootstrap first, then by size.
        expect(result.commonJs.map(pkg => pkg.name)).toEqual(['tiny-cjs', 'pdf']);
        // No file of the project imports it: another package brings it in.
        expect(result.commonJs[0]).toMatchObject({
            zone: 'boot',
            bytes: 40,
            importers: [],
            viaPackages: ['heavy-lib'],
        });
        expect(result.commonJs[1]).toMatchObject({
            zone: 'own',
            screens: 1,
            bytes: 300,
            importers: ['src/app/a.page.ts'],
            viaPackages: [],
        });
    });

    it('indexes every file that ships bytes, with where it lands', () => {
        const result = analyze(meta, null);
        const uiKit = result.modules.find(module => module.path === 'node_modules/ui-kit/index.js');

        expect(uiKit).toMatchObject({ label: 'ui-kit/index.js', pkg: 'ui-kit', bytes: 800 });
        expect(uiKit?.places).toEqual([
            { chunk: 'dist/shared.js', chunkName: 'shared.js', bytes: 800, zone: 'shared', screens: 2 },
        ]);
    });

    it('follows the chain to a file behind a lazy boundary, which `bootChains` cannot', () => {
        const result = analyze(meta, null);

        // `pdf` is only inside screen A, so there is no static chain — but there is a chain.
        expect(result.chainTo('node_modules/pdf/index.js')).toEqual([
            'src/main.ts',
            'src/app/app.routes.ts',
            'src/app/a.page.ts',
            'node_modules/pdf/index.js',
        ]);
        expect(result.chainTo('node_modules/nothing/index.js')).toBeNull();
    });

    it('says where the weight of each file was measured', () => {
        expect(analyze(meta, null).splitSource).toBe('metafile');

        const exact = new Map([['vendor.js', new Map([['node_modules/heavy-lib/index.js', 120]])]]);
        const result = analyze(meta, null, exact);

        expect(result.splitSource).toBe('sourcemap');
        // The maps' figure is preferred, so the breakdown follows it.
        expect(result.bootBuckets.find(bucket => bucket.name === 'heavy-lib')?.bytes).toBe(120);
        // A file the map says nothing about keeps the metafile's figure.
        expect(result.bootBuckets.find(bucket => bucket.name === 'tiny-cjs')?.bytes).toBe(40);
    });

    it('complains when the file is not a metafile', () => {
        expect(() => analyze({ inputs: {}, outputs: {} }, null)).toThrow('NO_ENTRIES');
    });
});

/**
 * The same package resolved twice. pnpm writes the version into the path, which is the only place
 * the copy shows up: one comes in through the project, the other through a dependency.
 */
const copyOne = 'node_modules/.pnpm/dup-lib@1.0.0/node_modules/dup-lib/index.js';
const copyTwo = 'node_modules/.pnpm/dup-lib@2.0.0/node_modules/dup-lib/index.js';

const dupes: Metafile = {
    inputs: {
        'src/main.ts': {
            bytes: 100,
            format: 'esm',
            imports: [
                { path: copyOne, kind: 'import-statement' },
                { path: 'node_modules/.pnpm/vendor@1.0.0/node_modules/vendor/index.js', kind: 'import-statement' },
                { path: 'src/app/a.page.ts', kind: 'dynamic-import' },
            ],
        },
        'src/app/a.page.ts': { bytes: 100, format: 'esm', imports: [] },
        [copyOne]: { bytes: 200, format: 'esm' },
        [copyTwo]: { bytes: 200, format: 'esm' },
        'node_modules/.pnpm/vendor@1.0.0/node_modules/vendor/index.js': {
            bytes: 300,
            format: 'esm',
            imports: [{ path: copyTwo, kind: 'import-statement' }],
        },
    },
    outputs: {
        'dist/main.js': {
            bytes: 900,
            entryPoint: 'src/main.ts',
            inputs: {
                'src/main.ts': { bytesInOutput: 100 },
                [copyOne]: { bytesInOutput: 200 },
                'node_modules/.pnpm/vendor@1.0.0/node_modules/vendor/index.js': { bytesInOutput: 300 },
                [copyTwo]: { bytesInOutput: 200 },
            },
            imports: [{ path: 'dist/screen-a.js', kind: 'dynamic-import' }],
        },
        'dist/screen-a.js': {
            bytes: 100,
            entryPoint: 'src/app/a.page.ts',
            inputs: { 'src/app/a.page.ts': { bytesInOutput: 100 } },
        },
    },
};

describe('analyze · duplicate packages', () => {
    it('follows each copy separately, with the chain that brings it', () => {
        const result = analyze(dupes, null);

        expect(result.duplicates).toHaveLength(1);
        const dupe = result.duplicates[0];
        expect(dupe?.name).toBe('dup-lib');
        expect(dupe?.inBoot).toBe(true);
        expect(dupe?.bytes).toBe(400);
        expect(dupe?.copies.map(copy => copy.version ?? '').toSorted(byName)).toEqual(['1.0.0', '2.0.0']);

        // The decision changes with where each copy comes from, so each one carries its own chain.
        const first = dupe?.copies.find(copy => copy.version === '1.0.0');
        expect(first).toMatchObject({ bytes: 200, zone: 'boot', importers: ['src/main.ts'], viaPackages: [] });
        expect(first?.chain).toEqual(['src/main.ts', copyOne]);

        const second = dupe?.copies.find(copy => copy.version === '2.0.0');
        expect(second).toMatchObject({ bytes: 200, zone: 'boot', importers: [], viaPackages: ['vendor'] });
        expect(second?.chain).toEqual([
            'src/main.ts',
            'node_modules/.pnpm/vendor@1.0.0/node_modules/vendor/index.js',
            copyTwo,
        ]);
    });

    it('does not count a version that ships nothing', () => {
        const shaken: Metafile = {
            inputs: dupes.inputs,
            outputs: {
                'dist/main.js': {
                    bytes: 700,
                    entryPoint: 'src/main.ts',
                    inputs: {
                        'src/main.ts': { bytesInOutput: 100 },
                        [copyOne]: { bytesInOutput: 200 },
                        'node_modules/.pnpm/vendor@1.0.0/node_modules/vendor/index.js': { bytesInOutput: 300 },
                        [copyTwo]: { bytesInOutput: 0 },
                    },
                    imports: [{ path: 'dist/screen-a.js', kind: 'dynamic-import' }],
                },
                'dist/screen-a.js': {
                    bytes: 100,
                    entryPoint: 'src/app/a.page.ts',
                    inputs: { 'src/app/a.page.ts': { bytesInOutput: 100 } },
                },
            },
        };

        expect(analyze(shaken, null).duplicates).toEqual([]);
    });
});

/**
 * The two shapes the report has to survive as frameworks move: a build with server-side rendering,
 * which writes both sides into one metafile, and a deferred block, which looks exactly like a route
 * from the outside.
 */
describe('analyze, on builds that are not a plain SPA', () => {
    it('leaves the server side of an SSR build out', () => {
        const ssr: Metafile = {
            inputs: meta.inputs,
            outputs: {
                'dist/app/browser/main.js': {
                    bytes: 1000,
                    entryPoint: 'src/main.ts',
                    inputs: { 'src/main.ts': { bytesInOutput: 1000 } },
                    imports: [],
                },
                // The server bundle reaches more code, so without this rule it would be taken for
                // the main entry and the whole report would be about it.
                'dist/app/server/server.mjs': {
                    bytes: 9000,
                    entryPoint: 'src/main.server.ts',
                    inputs: { 'src/main.ts': { bytesInOutput: 9000 } },
                    imports: [{ path: 'dist/app/server/chunk-x.mjs', kind: 'import-statement' }],
                },
                'dist/app/server/chunk-x.mjs': { bytes: 500, inputs: {} },
            },
        };

        const result = analyze(ssr, null);

        expect(result.bootBytes).toBe(1000);
        expect(result.bootChunks).toEqual(['dist/app/browser/main.js']);
        expect(result.serverOutputs).toBe(2);
    });

    /**
     * An application does not have to have one entry chunk. Angular's polyfills are a second one
     * and SvelteKit starts two, so a bootstrap that was the reach of the main entry alone left real
     * bootstrap chunks out of the figure everybody pays — and made `--self-check` disagree with
     * itself on every such build.
     */
    it('a second entry the page also starts is bootstrap too', () => {
        const twoEntries: Metafile = {
            inputs: {
                'src/main.ts': { bytes: 1000, format: 'esm', imports: [] },
                'src/polyfills.ts': { bytes: 300, format: 'esm', imports: [] },
            },
            outputs: {
                'dist/main.js': {
                    bytes: 1000,
                    entryPoint: 'src/main.ts',
                    inputs: { 'src/main.ts': { bytesInOutput: 1000 } },
                    imports: [],
                },
                'dist/polyfills.js': {
                    bytes: 300,
                    entryPoint: 'src/polyfills.ts',
                    inputs: { 'src/polyfills.ts': { bytesInOutput: 300 } },
                    imports: [],
                },
            },
        };

        const started = analyze(twoEntries, null, null, new Set(['main.js', 'polyfills.js']));
        expect(started.bootChunks.toSorted((a, b) => a.localeCompare(b))).toEqual([
            'dist/main.js',
            'dist/polyfills.js',
        ]);
        expect(started.bootBytes).toBe(1300);

        // And a stray entry nobody announces stays out: it is not downloaded on the first load.
        const alone = analyze(twoEntries, null, null, new Set(['main.js']));
        expect(alone.bootChunks).toEqual(['dist/main.js']);
    });

    /**
     * What a folder nobody cleaned looks like: the chunks of a previous build are still there, with
     * their old hashes, importing each other. They took rows in the screens table — an esbuild
     * build came out with two screens where it has three — and none of their bytes is in any
     * figure, which is the part worth saying out loud.
     */
    it('leaves what nothing reaches out of the table, and lists it', () => {
        const leftovers: Metafile = {
            inputs: {
                'src/main.ts': { bytes: 100, format: 'esm', imports: [] },
                'src/app/old.page.ts': { bytes: 400, format: 'esm', imports: [] },
            },
            outputs: {
                'dist/main.js': {
                    bytes: 100,
                    entryPoint: 'src/main.ts',
                    inputs: { 'src/main.ts': { bytesInOutput: 100 } },
                    imports: [],
                },
                // Last build's entry, still in the folder, still importing last build's screen.
                'dist/main-OLD.js': {
                    bytes: 100,
                    inputs: {},
                    imports: [{ path: 'dist/old-OLD.js', kind: 'dynamic-import' }],
                },
                'dist/old-OLD.js': {
                    bytes: 400,
                    entryPoint: 'src/app/old.page.ts',
                    inputs: { 'src/app/old.page.ts': { bytesInOutput: 400 } },
                },
            },
        };

        const result = analyze(leftovers, null, null, new Set(['main.js']));

        expect(result.screens).toEqual([]);
        expect(result.unreachable.map(chunk => chunk.file).toSorted((a, b) => a.localeCompare(b))).toEqual([
            'dist/main-OLD.js',
            'dist/old-OLD.js',
        ]);
    });

    it('a block deferred inside a view is not a screen', () => {
        const withDefer: Metafile = {
            inputs: {
                ...meta.inputs,
                // `a.page.ts` defers a heavy chart: a lazy entry that nobody navigates to.
                'src/app/a.page.ts': {
                    bytes: 100,
                    format: 'esm',
                    imports: [{ path: 'src/app/chart.component.ts', kind: 'dynamic-import' }],
                },
                'src/app/chart.component.ts': { bytes: 400, format: 'esm', imports: [] },
            },
            outputs: {
                ...meta.outputs,
                'dist/screen-a.js': {
                    bytes: 200,
                    entryPoint: 'src/app/a.page.ts',
                    inputs: { 'src/app/a.page.ts': { bytesInOutput: 200 } },
                    imports: [
                        { path: 'dist/shared.js', kind: 'import-statement' },
                        { path: 'dist/only-a.js', kind: 'import-statement' },
                        { path: 'dist/chart.js', kind: 'dynamic-import' },
                    ],
                },
                'dist/chart.js': {
                    bytes: 400,
                    entryPoint: 'src/app/chart.component.ts',
                    inputs: { 'src/app/chart.component.ts': { bytesInOutput: 400 } },
                },
            },
        };

        const result = analyze(withDefer, null);

        expect(result.screens.map(s => s.label).toSorted(byName)).toEqual(['a', 'b']);
        expect(result.deferredBlocks.map(b => b.label)).toEqual(['chart']);
    });

    it('a lazy import from somewhere that is not a view still counts as a screen', () => {
        const fromService: Metafile = {
            inputs: {
                ...meta.inputs,
                'src/app/app.routes.ts': {
                    bytes: 50,
                    format: 'esm',
                    imports: [
                        { path: 'src/app/a.page.ts', kind: 'dynamic-import' },
                        { path: 'src/app/b.page.ts', kind: 'dynamic-import' },
                        { path: 'src/app/c.page.ts', kind: 'dynamic-import' },
                    ],
                },
                'src/app/c.page.ts': { bytes: 100, format: 'esm', imports: [] },
            },
            outputs: {
                ...meta.outputs,
                'dist/main.js': {
                    ...meta.outputs['dist/main.js']!,
                    imports: [
                        { path: 'dist/vendor.js', kind: 'import-statement' },
                        { path: 'dist/screen-a.js', kind: 'dynamic-import' },
                        { path: 'dist/screen-b.js', kind: 'dynamic-import' },
                        { path: 'dist/screen-c.js', kind: 'dynamic-import' },
                    ],
                },
                'dist/screen-c.js': {
                    bytes: 100,
                    entryPoint: 'src/app/c.page.ts',
                    inputs: { 'src/app/c.page.ts': { bytesInOutput: 100 } },
                },
            },
        };

        const result = analyze(fromService, null);

        expect(result.screens.map(s => s.label).toSorted(byName)).toEqual(['a', 'b', 'c']);
        expect(result.deferredBlocks).toEqual([]);
    });
});

/**
 * The same two copies as above, installed the way npm and yarn do it: one hoisted to the top and
 * the other nested inside whoever asked for it. Nothing in these paths carries a version.
 */
const nested = 'node_modules/vendor/node_modules/dup-lib/index.js';
const hoisted = 'node_modules/dup-lib/index.js';

const npmDupes: Metafile = {
    inputs: {
        'src/main.ts': {
            bytes: 100,
            format: 'esm',
            imports: [
                { path: hoisted, kind: 'import-statement' },
                { path: 'node_modules/vendor/index.js', kind: 'import-statement' },
            ],
        },
        [hoisted]: { bytes: 200, format: 'esm' },
        [nested]: { bytes: 200, format: 'esm' },
        'node_modules/vendor/index.js': {
            bytes: 300,
            format: 'esm',
            imports: [{ path: nested, kind: 'import-statement' }],
        },
    },
    outputs: {
        'dist/main.js': {
            bytes: 900,
            entryPoint: 'src/main.ts',
            inputs: {
                'src/main.ts': { bytesInOutput: 100 },
                [hoisted]: { bytesInOutput: 200 },
                [nested]: { bytesInOutput: 200 },
                'node_modules/vendor/index.js': { bytesInOutput: 300 },
            },
        },
    },
};

describe('analyze · duplicates outside pnpm', () => {
    it('finds the copy npm and yarn nest, which has no version in its path', () => {
        const dupe = analyze(npmDupes, null).duplicates[0];

        expect(dupe?.name).toBe('dup-lib');
        expect(dupe?.copies).toHaveLength(2);

        // The top-level copy has nothing above it; the other names who nests it. Neither says a
        // version, and saying one would be inventing it.
        const top = dupe?.copies.find(copy => copy.under === null);
        expect(top).toMatchObject({ at: '', version: null, bytes: 200, importers: ['src/main.ts'] });

        const inside = dupe?.copies.find(copy => copy.under !== null);
        expect(inside).toMatchObject({ at: 'node_modules/vendor/', under: 'vendor', version: null, bytes: 200 });
    });

    /**
     * A `file:` dependency and a package of a monorepo keep their own `node_modules` outside the
     * project's, so the path of the nested copy goes through no package name at all. That copy was
     * described as "the top-level copy", which is precisely what it is not — and it is a real npm
     * install away, which is how a real build found it.
     */
    it('names a copy nested outside node_modules by the folder it lives in', () => {
        const outside = '../vendor/legacy-ids/node_modules/dup-lib/index.js';
        const build: Metafile = {
            inputs: {
                'src/main.ts': {
                    bytes: 100,
                    format: 'esm',
                    imports: [
                        { path: hoisted, kind: 'import-statement' },
                        { path: outside, kind: 'import-statement' },
                    ],
                },
                [hoisted]: { bytes: 200, format: 'esm' },
                [outside]: { bytes: 200, format: 'esm' },
            },
            outputs: {
                'dist/main.js': {
                    bytes: 500,
                    entryPoint: 'src/main.ts',
                    inputs: {
                        'src/main.ts': { bytesInOutput: 100 },
                        [hoisted]: { bytesInOutput: 200 },
                        [outside]: { bytesInOutput: 200 },
                    },
                },
            },
        };

        const copies = analyze(build, null).duplicates[0]?.copies ?? [];

        expect(copies.map(copy => copy.under).toSorted((a, b) => String(a).localeCompare(String(b)))).toEqual([
            null,
            'vendor/legacy-ids',
        ]);
    });

    it('one copy in two chunks is still one copy', () => {
        const twice: Metafile = {
            inputs: { 'src/main.ts': npmDupes.inputs['src/main.ts']!, [hoisted]: npmDupes.inputs[hoisted]! },
            outputs: {
                'dist/main.js': {
                    bytes: 300,
                    entryPoint: 'src/main.ts',
                    inputs: { 'src/main.ts': { bytesInOutput: 100 }, [hoisted]: { bytesInOutput: 200 } },
                },
            },
        };

        expect(analyze(twice, null).duplicates).toEqual([]);
    });
});

describe('analyze · outputs that are not called .js', () => {
    it('reads a build written as .mjs, which used to come out with no entries at all', () => {
        const mjs: Metafile = {
            inputs: {
                'src/main.ts': { bytes: 100, format: 'esm', imports: [] },
            },
            outputs: {
                'dist/main.mjs': {
                    bytes: 500,
                    entryPoint: 'src/main.ts',
                    inputs: { 'src/main.ts': { bytesInOutput: 100 } },
                },
            },
        };

        expect(analyze(mjs, null).bootChunks).toEqual(['dist/main.mjs']);
    });
});
