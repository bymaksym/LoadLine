import { describe, expect, it } from 'vitest';
import { type ScreenMark } from './analysis.types';
import { browserSide, classifyLazyEntries, isDeferredBlock, isRouteGrouper, lazyLoadersOf } from './entries';
import { type Metafile, type MetafileImport } from './metafile.types';

const output = (bytes: number): Metafile['outputs'][string] => ({ bytes, inputs: {} });

/** What a grouping file may weigh: the recommended kibibyte, written out so the cases below read. */
const GROUPER_MAX = 1024;

describe('browserSide', () => {
    it('drops the server half of an SSR build', () => {
        const result = browserSide({
            'dist/app/browser/main.js': output(100),
            'dist/app/server/server.mjs': output(900),
            'dist/app/server/chunk.mjs': output(50),
        });

        expect(Object.keys(result.outputs)).toEqual(['dist/app/browser/main.js']);
        expect(result.serverOutputs).toBe(2);
    });

    it('leaves a build with no server side alone', () => {
        const outputs = { 'dist/main.js': output(100), 'dist/chunk.js': output(50) };

        expect(browserSide(outputs)).toEqual({ outputs, serverOutputs: 0 });
    });

    it('a metafile of nothing but server outputs is somebody analysing their server on purpose', () => {
        const outputs = { 'dist/server/server.mjs': output(900) };

        expect(browserSide(outputs)).toEqual({ outputs, serverOutputs: 0 });
    });
});

describe('lazyLoadersOf', () => {
    it('collects the own files that lazily import each file', () => {
        const loaders = lazyLoadersOf(
            {
                'src/app/app.routes.ts': {
                    bytes: 10,
                    imports: [{ path: 'src/app/a.page.ts', kind: 'dynamic-import' }],
                },
                'src/app/a.page.ts': {
                    bytes: 10,
                    imports: [
                        { path: 'src/app/chart.component.ts', kind: 'dynamic-import' },
                        { path: 'src/app/thing.ts', kind: 'import-statement' },
                    ],
                },
                // Not the project's: what a library defers is not a decision of this project.
                'node_modules/lib/index.js': {
                    bytes: 10,
                    imports: [{ path: 'node_modules/lib/extra.js', kind: 'dynamic-import' }],
                },
            },
            path => !path.includes('node_modules'),
        );

        expect([...loaders.keys()]).toEqual(['src/app/a.page.ts', 'src/app/chart.component.ts']);
        expect(loaders.get('src/app/chart.component.ts')).toEqual(['src/app/a.page.ts']);
    });
});

describe('isDeferredBlock', () => {
    const screens = new Set(['src/app/a.page.ts']);

    it('a view deferring something is deferring a piece of itself', () => {
        expect(isDeferredBlock(['src/app/a.page.ts'], screens)).toBe(true);
        expect(isDeferredBlock(['src/app/list.component.ts'], screens)).toBe(true);
    });

    it('anything else stays a screen: the evidence has to be positive', () => {
        expect(isDeferredBlock(['src/app/app.routes.ts'], screens)).toBe(false);
        expect(isDeferredBlock(['src/app/export.service.ts'], screens)).toBe(false);
        // One route importing it is enough: it is reachable as a screen.
        expect(isDeferredBlock(['src/app/a.page.ts', 'src/app/app.routes.ts'], screens)).toBe(false);
        expect(isDeferredBlock([], screens)).toBe(false);
    });
});

describe('isRouteGrouper', () => {
    const lazy = (path: string): MetafileImport => ({ path, kind: 'dynamic-import' });
    const eager = (path: string): MetafileImport => ({ path, kind: 'import-statement' });

    const grouper = {
        source: 'src/app/nav.ts',
        ownBytes: 120,
        imports: [lazy('src/app/a.ts'), lazy('src/app/b.ts')],
        chunkImports: [lazy('dist/a.js'), lazy('dist/b.js')],
    };

    it('nothing of its own plus nothing but dynamic imports is a file that groups routes', () => {
        expect(isRouteGrouper(grouper, GROUPER_MAX)).toBe(true);
        // Whatever it is called: this is the half that does not depend on a naming convention.
        expect(isRouteGrouper({ ...grouper, source: 'src/pages/index.js' }, GROUPER_MAX)).toBe(true);
    });

    it('the name still passes, for the routes file that imports a guard', () => {
        const withGuard = {
            ...grouper,
            imports: [eager('src/app/auth.guard.ts'), lazy('src/app/a.page.ts')],
            ownBytes: 300,
        };

        expect(isRouteGrouper({ ...withGuard, source: 'src/app/admin.routes.ts' }, GROUPER_MAX)).toBe(true);
        expect(isRouteGrouper({ ...withGuard, source: 'src/app/admin.ts' }, GROUPER_MAX)).toBe(false);
    });

    it('anything carrying code of its own stays a screen', () => {
        // A screen can be nothing but a deferred widget, so weight alone is not enough…
        expect(isRouteGrouper({ ...grouper, ownBytes: 9000 }, GROUPER_MAX)).toBe(false);
        // …nor are dynamic imports alone: a static import means there is code in it…
        expect(
            isRouteGrouper({ ...grouper, imports: [eager('src/app/thing.ts'), lazy('src/app/a.ts')] }, GROUPER_MAX),
        ).toBe(false);
        // …and so does a chunk that statically imports another one, which is the same thing seen from
        // the output side. It is what tells a small screen that defers a widget from a grouper.
        expect(
            isRouteGrouper({ ...grouper, chunkImports: [eager('dist/shared.js'), lazy('dist/a.js')] }, GROUPER_MAX),
        ).toBe(false);
        // Grouping nothing is not grouping.
        expect(isRouteGrouper({ ...grouper, imports: [] }, GROUPER_MAX)).toBe(false);
    });

    /**
     * A Nuxt page that defers one widget matched every condition and left the screens table, with
     * the widget taking its row. With a single dynamic import there is nothing left to tell the two
     * apart, and a file that groups routes groups more than one.
     */
    it('one dynamic import is a screen deferring a piece of itself, not a grouping file', () => {
        const single = { ...grouper, imports: [lazy('src/app/a.ts')], chunkImports: [lazy('dist/a.js')] };

        expect(isRouteGrouper(single, GROUPER_MAX)).toBe(false);
        // The name still passes: a routes file with one route in it is still a routes file.
        expect(isRouteGrouper({ ...single, source: 'src/app/admin.routes.ts' }, GROUPER_MAX)).toBe(true);
    });

    it('an unmeasured weight is not a small weight', () => {
        // A build folder read without source maps knows what a chunk weighs and not what is inside
        // it. Reading that as "weighs nothing" would drop a small screen from the table.
        expect(isRouteGrouper({ ...grouper, ownBytes: null }, GROUPER_MAX)).toBe(false);
        // The name still passes: it is the one way in that never needed a measurement.
        expect(isRouteGrouper({ ...grouper, ownBytes: null, source: 'src/app/a.routes.ts' }, GROUPER_MAX)).toBe(true);
    });
});

describe('classifyLazyEntries', () => {
    /**
     * Four lazy entries of a build that names nothing the Angular way: `nav` holds two dynamic
     * imports and no code, `panel` and `other` are the screens behind it, `chart` is deferred
     * inside `panel`.
     */
    const entries = [
        { chunk: 'dist/nav.js', source: 'src/app/nav.ts' },
        { chunk: 'dist/panel.js', source: 'src/app/panel.ts' },
        { chunk: 'dist/other.js', source: 'src/app/other.ts' },
        { chunk: 'dist/chart.js', source: 'src/app/chart.ts' },
    ];

    const inputs: Metafile['inputs'] = {
        'src/app/nav.ts': {
            bytes: 60,
            imports: [
                { path: 'src/app/panel.ts', kind: 'dynamic-import' },
                { path: 'src/app/other.ts', kind: 'dynamic-import' },
            ],
        },
        'src/app/panel.ts': { bytes: 4000, imports: [{ path: 'src/app/chart.ts', kind: 'dynamic-import' }] },
        'src/app/other.ts': { bytes: 4000, imports: [] },
        'src/app/chart.ts': { bytes: 4000, imports: [] },
    };
    const outputs: Metafile['outputs'] = {
        'dist/nav.js': {
            bytes: 90,
            imports: [
                { path: 'dist/panel.js', kind: 'dynamic-import' },
                { path: 'dist/other.js', kind: 'dynamic-import' },
            ],
        },
        'dist/panel.js': { bytes: 4000 },
        'dist/other.js': { bytes: 4000 },
        'dist/chart.js': { bytes: 4000 },
    };
    const loaders = new Map([
        ['src/app/panel.ts', ['src/app/nav.ts']],
        ['src/app/other.ts', ['src/app/nav.ts']],
        ['src/app/chart.ts', ['src/app/panel.ts']],
    ]);

    const read = (marks: [string, ScreenMark][] = []) => ({
        inputs,
        outputs,
        ownBytesOf: (chunk: string) => (chunk === 'dist/nav.js' ? 90 : 4000),
        loaders,
        marks: new Map(marks),
        grouperMaxBytes: GROUPER_MAX,
    });

    const sources = (list: { source: string }[]) =>
        list.map(entry => entry.source).toSorted((a, b) => a.localeCompare(b));

    it('tells the three apart, and a screen behind a grouping file is still a screen', () => {
        const result = classifyLazyEntries(entries, read());

        expect(sources(result.groupers)).toEqual(['src/app/nav.ts']);
        expect(sources(result.screens)).toEqual(['src/app/other.ts', 'src/app/panel.ts']);
        expect(sources(result.blocks)).toEqual(['src/app/chart.ts']);
    });

    /**
     * Excalidraw lazy-loads fifty languages. Every one of them is a lazy entry of project code that
     * no view imports, so every one came out as a screen: sixty-one rows for an application with
     * one. A JSON chunk usually ships without a source map, so the name of the chunk is all there
     * is to go on — and it carries the original extension.
     */
    it('a language file is data, not a screen', () => {
        const withData = [
            ...entries,
            { chunk: 'dist/es.json-CCWdKmrX.js', source: 'dist/es.json-CCWdKmrX.js' },
            { chunk: 'dist/countries.js', source: 'src/data/countries.json' },
        ];

        const result = classifyLazyEntries(withData, read());

        expect(sources(result.data)).toEqual(['dist/es.json-CCWdKmrX.js', 'src/data/countries.json']);
        expect(sources(result.screens)).toEqual(['src/app/other.ts', 'src/app/panel.ts']);
    });

    /** A mark still wins: the rules are the default answer, never the last word. */
    it('a data entry somebody counts as a screen is a screen', () => {
        const withData = [...entries, { chunk: 'dist/es.json-AAA.js', source: 'dist/es.json-AAA.js' }];
        const result = classifyLazyEntries(withData, read([['dist/es.json-AAA.js', 'screen']]));

        expect(result.data).toEqual([]);
        expect(sources(result.screens)).toContain('dist/es.json-AAA.js');
    });

    it('a mark takes a row out of the table', () => {
        const result = classifyLazyEntries(entries, read([['src/app/panel.ts', 'block']]));

        expect(sources(result.screens)).toEqual(['src/app/other.ts']);
        expect(sources(result.blocks)).toEqual(['src/app/chart.ts', 'src/app/panel.ts']);
    });

    it('a mark brings back an entry the rules set aside', () => {
        const result = classifyLazyEntries(entries, read([['src/app/nav.ts', 'screen']]));

        expect(result.groupers).toEqual([]);
        // And nothing else moves: promoting a grouping file must not turn what it groups into
        // pieces of it, which is what would empty the table on one click.
        expect(sources(result.screens)).toEqual(['src/app/nav.ts', 'src/app/other.ts', 'src/app/panel.ts']);
        expect(sources(result.blocks)).toEqual(['src/app/chart.ts']);
    });
});
