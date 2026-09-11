import { describe, expect, it } from 'vitest';
import { entrySourceOf, readBundleGraph, resolveFrom } from './bundle-graph';
import { type BundleFile } from './bundle-graph.types';

const file = (path: string, text: string): BundleFile => ({
    path,
    bytes: text.length,
    text: () => Promise.resolve(text),
});

const VLQ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** One base64 VLQ number, which is all a hand-written map needs here. */
const vlq = (value: number): string => {
    let rest = Math.abs(value) * 2 + (value < 0 ? 1 : 0);
    let out = '';
    do {
        const digit = rest % 32;
        rest = Math.floor(rest / 32);
        out += VLQ[digit + (rest > 0 ? 32 : 0)] ?? '';
    } while (rest > 0);

    return out;
};

/** A one-line map: each source owns the generated code from its column to the next one's. */
const mapFor = (sources: string[], columns: number[]): string =>
    JSON.stringify({
        version: 3,
        sources,
        mappings: columns
            .map((column, index) =>
                [
                    vlq(index === 0 ? column : column - (columns[index - 1] ?? 0)),
                    vlq(index === 0 ? 0 : 1),
                    'A',
                    'A',
                ].join(''),
            )
            .join(','),
    });

const PAGE = '<!doctype html><script type="module" src="/assets/index-AAAAAAAA.js"></script>';

/** The shape a Vite build actually has, cut down: an entry, three screens and a shared chunk. */
const build = (): BundleFile[] => [
    file('index.html', PAGE),
    file(
        'assets/index-AAAAAAAA.js',
        'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/orders-CCCCCCCC.js",' +
            '"assets/table-EEEEEEEE.js"])))=>i.map(i=>d[i]);' +
            'var o={"#/home":()=>t(()=>import(`./home-BBBBBBBB.js`),[]),' +
            '"#/orders":()=>t(()=>import(`./orders-CCCCCCCC.js`),__vite__mapDeps([0,1]))};',
    ),
    file('assets/home-BBBBBBBB.js', 'import{r}from"./index-AAAAAAAA.js";var n=()=>import(`./chart-DDDDDDDD.js`);'),
    file('assets/orders-CCCCCCCC.js', 'import{t}from"./table-EEEEEEEE.js";export{t as render};'),
    file('assets/chart-DDDDDDDD.js', 'import{n}from"./index-AAAAAAAA.js";export{n as draw};'),
    file('assets/table-EEEEEEEE.js', 'import{n}from"./index-AAAAAAAA.js";export{n as t};'),
];

const entries = new Set(['index-AAAAAAAA.js']);

describe('resolveFrom', () => {
    it('resolves a sibling against the folder of the chunk that wrote it', () => {
        expect(resolveFrom('assets/index-AAAAAAAA.js', './table-EEEEEEEE.js')).toBe('assets/table-EEEEEEEE.js');
        expect(resolveFrom('assets/js/a.js', '../css/b.js')).toBe('assets/css/b.js');
    });

    it('a path that is not relative is read from the root of the folder, which is how Vite writes its preload lists', () => {
        expect(resolveFrom('assets/index-AAAAAAAA.js', 'assets/table-EEEEEEEE.js')).toBe('assets/table-EEEEEEEE.js');
        expect(resolveFrom('assets/index-AAAAAAAA.js', '/assets/table-EEEEEEEE.js')).toBe('assets/table-EEEEEEEE.js');
    });
});

describe('entrySourceOf', () => {
    it('one source is the whole answer', () => {
        expect(entrySourceOf('assets/orders-CCCCCCCC.js', ['src/orders.page.js'])).toBe('src/orders.page.js');
        expect(entrySourceOf('assets/orders-CCCCCCCC.js', [])).toBeNull();
    });

    it('the bundler names a chunk after the module it starts at', () => {
        const sources = ['src/shared.js', 'src/orders.page.js', 'src/format.js'];

        expect(entrySourceOf('assets/orders.page-CCCCCCCC.js', sources)).toBe('src/orders.page.js');
    });

    it('when the name settles nothing, the module the chunk exists for is the last one written', () => {
        expect(entrySourceOf('assets/index-AAAAAAAA.js', ['src/shared.js', 'src/main.js'])).toBe('src/main.js');
    });
});

describe('readBundleGraph', () => {
    it('reads the two kinds of edge out of the code that ships', async () => {
        const { meta } = await readBundleGraph(build(), entries);

        expect(meta.outputs['assets/orders-CCCCCCCC.js']?.imports).toEqual([
            { path: 'assets/table-EEEEEEEE.js', kind: 'import-statement' },
        ]);
        // Rolldown minifies the specifier of a dynamic import into a template literal.
        expect(meta.outputs['assets/home-BBBBBBBB.js']?.imports).toContainEqual({
            path: 'assets/chart-DDDDDDDD.js',
            kind: 'dynamic-import',
        });
    });

    it('a match pointing at a file that is not in the folder drops out on its own', async () => {
        const files = [
            ...build(),
            file('assets/note-FFFFFFFF.js', '/* import "./nowhere.js" */ import{r}from"./index-AAAAAAAA.js";'),
        ];

        const { meta } = await readBundleGraph(files, entries);

        expect(meta.outputs['assets/note-FFFFFFFF.js']?.imports).toEqual([
            { path: 'assets/index-AAAAAAAA.js', kind: 'import-statement' },
        ]);
    });

    it('the page says which chunk is the entry, and every lazy target is one too', async () => {
        const { meta } = await readBundleGraph(build(), entries);
        const named = Object.entries(meta.outputs)
            .filter(([, output]) => output.entryPoint)
            .map(([chunk]) => chunk);

        // The entry chunk is imported by its own children — that is where the shared code goes —
        // so nothing but the page can tell it from a shared chunk.
        expect(named).toContain('assets/index-AAAAAAAA.js');
        expect(named).not.toContain('assets/table-EEEEEEEE.js');
        expect(named).toEqual(expect.arrayContaining(['assets/home-BBBBBBBB.js', 'assets/chart-DDDDDDDD.js']));
    });

    /**
     * A webpack or Turbopack build has entry chunks and no import graph: the imports are numbers
     * the loader resolves. Read as if it were ES modules, a Next.js export came out as one
     * bootstrap, zero screens and "nothing stands out", which is worse than any error.
     */
    it('a folder of webpack chunks is refused rather than read as one big bootstrap', async () => {
        const webpack = [
            file('index.html', '<!doctype html><script src="/static/main-AAAAAAAA.js"></script>'),
            file(
                'static/main-AAAAAAAA.js',
                '(self.webpackChunk=self.webpackChunk||[]).push([[123],{456:(e,t,__webpack_require__)=>{}}]);',
            ),
            file('static/other-BBBBBBBB.js', '(self.webpackChunk=self.webpackChunk||[]).push([[7],{}]);'),
        ];

        await expect(readBundleGraph(webpack, new Set(['main-AAAAAAAA.js']))).rejects.toThrow('NOT_ESM_GRAPH');
    });

    /**
     * The same refusal, against the shape a current webpack actually writes. `react-scripts build`
     * emits the registry with logical assignment — `globalThis.webpackChunkX||=[]` — and never the
     * older `X=X||[]`, so a rule that only knew the older one read a Create React App build as a
     * good one: one bootstrap, zero screens, nothing to say. A real CRA build found it. The other marker is
     * no safety net here, because the minifier renames `__webpack_require__` to a single letter.
     */
    it('a webpack build that assigns its registry with ||= is refused too', async () => {
        const modern = [
            file('index.html', '<!doctype html><script defer src="/static/js/main.AAAAAAAA.js"></script>'),
            file(
                'static/js/main.AAAAAAAA.js',
                '(()=>{"use strict";var e={153(e,n,t){}};(globalThis.webpackChunkmy_app||=[]).push([[792],{}]);})();',
            ),
            file(
                'static/js/109.BBBBBBBB.chunk.js',
                '"use strict";(globalThis.webpackChunkmy_app||=[]).push([[109],{}]);',
            ),
        ];

        await expect(readBundleGraph(modern, new Set(['main.AAAAAAAA.js']))).rejects.toThrow('NOT_ESM_GRAPH');
    });

    /**
     * Loadline refused its own build with the first version of this rule: the file that looks for
     * webpack mentions `webpackChunk`, and that file ships in the bundle. Any application that
     * writes about bundlers would have been refused the same way.
     */
    it('an application that merely talks about webpack is not a webpack build', async () => {
        const aboutBundlers = [
            file('index.html', '<!doctype html><script type="module" src="/assets/index-AAAAAAAA.js"></script>'),
            file(
                'assets/index-AAAAAAAA.js',
                // The very line that looks for them, as it ships: a regular expression, escaped.
                String.raw`const LOADER=/webpackChunk\w*\s*(?:\|\|)?=|__webpack_require__\s*\(|globalThis\.TURBOPACK/;export{LOADER};`,
            ),
        ];

        const { meta } = await readBundleGraph(aboutBundlers, new Set(['index-AAAAAAAA.js']));
        expect(Object.keys(meta.outputs)).toHaveLength(1);
    });

    /** The two halves are both needed: an application where every route is eager is read fine. */
    it('a build with no lazy imports and no loader runtime is still read', async () => {
        const eager = [
            file('index.html', '<!doctype html><script type="module" src="/assets/index-AAAAAAAA.js"></script>'),
            file('assets/index-AAAAAAAA.js', 'import{t}from"./table-EEEEEEEE.js";t();'),
            file('assets/table-EEEEEEEE.js', 'export const t=()=>1;'),
        ];

        const { meta } = await readBundleGraph(eager, new Set(['index-AAAAAAAA.js']));
        expect(Object.keys(meta.outputs)).toHaveLength(2);
    });

    it('without that page there is nothing to read the entry from, and it says so', async () => {
        await expect(readBundleGraph(build(), new Set())).rejects.toThrow('NO_PAGE');
    });

    it("Vite's preload list puts a lazy chunk and its dependencies in the same round trip", async () => {
        const { parallel } = await readBundleGraph(build(), entries);

        expect(parallel.get('assets/orders-CCCCCCCC.js')).toEqual(['assets/table-EEEEEEEE.js']);
        // The table of preloadable files is not itself a group: it lists every one of them.
        expect(parallel.get('assets/home-BBBBBBBB.js')).toBeUndefined();
        expect(parallel.get('assets/table-EEEEEEEE.js')).toBeUndefined();
    });

    it('without source maps the graph still comes out, and every chunk answers for itself', async () => {
        const { meta } = await readBundleGraph(build(), entries);

        // Nothing measured what is inside a chunk, so nothing is claimed about it…
        expect(meta.outputs['assets/orders-CCCCCCCC.js']?.inputs).toBeUndefined();
        // …and a screen is named after the file the folder actually has.
        expect(meta.outputs['assets/orders-CCCCCCCC.js']?.entryPoint).toBe('assets/orders-CCCCCCCC.js');
        // The lazy edge survives all the same, which is what keeps the screens apart.
        expect(meta.inputs['assets/home-BBBBBBBB.js']?.imports).toEqual([
            { path: 'assets/chart-DDDDDDDD.js', kind: 'dynamic-import' },
        ]);
    });

    it('with the maps, each chunk carries its files and the dynamic import names the file that wrote it', async () => {
        const code = 'import{r}from"./index-AAAAAAAA.js";var a=1;var n=()=>import(`./chart-DDDDDDDD.js`);';
        const split = code.indexOf('var n');
        const files = [
            ...build().filter(entry => entry.path !== 'assets/home-BBBBBBBB.js'),
            file('assets/home-BBBBBBBB.js', code),
            file('assets/home-BBBBBBBB.js.map', mapFor(['../src/helper.js', '../src/home.page.js'], [0, split])),
        ];

        const { meta, splits } = await readBundleGraph(files, entries);

        expect(Object.keys(meta.outputs['assets/home-BBBBBBBB.js']?.inputs ?? {})).toEqual([
            'src/helper.js',
            'src/home.page.js',
        ]);
        // The import sits past the split, so it belongs to the second file and not to the first.
        expect(meta.inputs['src/home.page.js']?.imports).toEqual([
            { path: 'assets/chart-DDDDDDDD.js', kind: 'dynamic-import' },
        ]);
        expect(meta.inputs['src/helper.js']?.imports).toEqual([]);
        expect(splits.get('home-BBBBBBBB.js')?.size).toBe(2);
    });
});
