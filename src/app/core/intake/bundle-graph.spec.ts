import { describe, expect, it } from 'vitest';
import { namedBy } from '../format/format.utils';
import { entrySourceOf, readBundleGraph, readFolderGraph, resolveFrom } from './bundle-graph';
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

    it('a template written after its component is not what the chunk starts at', () => {
        // The tail of a real Angular 22 chunk, named `chunk-<hash>.js` like all of them.
        const sources = [
            'src/app/domain/company/company-marks.ts',
            'src/app/features/companies/companies.page.ts',
            'src/app/features/companies/companies.page.html',
        ];

        expect(entrySourceOf('chunk-AHP6GCD5.js', sources)).toBe('src/app/features/companies/companies.page.ts');
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
                String.raw`const LOADER=/webpackChunk\w*\s*(?:\|\|)?=|webpackJsonp\w*["']?\]?\s*=|__webpack_require__\s*\(|globalThis\.TURBOPACK/;export{LOADER};`,
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

    /** PocketBase's filter autocomplete starts a worker the way Vite writes one; missed, its chunk was unreachable. */
    it('reads a worker started from a chunk as one more chunk loaded on demand', async () => {
        const withWorker = [
            ...build().map(entry =>
                entry.path === 'assets/home-BBBBBBBB.js'
                    ? file(
                          entry.path,
                          'var w=new Worker(""+new URL("filter.worker-WWWWWWWW.js",import.meta.url).href,{type:"module"});',
                      )
                    : entry,
            ),
            file('assets/filter.worker-WWWWWWWW.js', 'self.onmessage=()=>{};'),
        ];
        const { meta } = await readBundleGraph(withWorker, entries);

        expect(meta.outputs['assets/home-BBBBBBBB.js']?.imports).toContainEqual({
            path: 'assets/filter.worker-WWWWWWWW.js',
            kind: 'dynamic-import',
        });
    });

    /**
     * `base: './'` — and Nuxt, always — writes the list relative to the chunk holding it. Read from
     * the root of the folder, `./orders.js` named nothing, the list was dropped, and every Nuxt
     * screen came out a round trip deeper than Chrome took it.
     */
    it('reads a preload list written relative to the chunk that holds it', async () => {
        const relative = build().map(entry =>
            entry.path === 'assets/index-AAAAAAAA.js'
                ? file(
                      entry.path,
                      'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./orders-CCCCCCCC.js",' +
                          '"./table-EEEEEEEE.js"])))=>i.map(i=>d[i]);' +
                          'var o={"#/home":()=>t(()=>import(`./home-BBBBBBBB.js`),[]),' +
                          '"#/orders":()=>t(()=>import(`./orders-CCCCCCCC.js`),__vite__mapDeps([0,1]))};',
                  )
                : entry,
        );
        const { parallel } = await readBundleGraph(relative, entries);

        expect(parallel.get('assets/orders-CCCCCCCC.js')).toEqual(['assets/table-EEEEEEEE.js']);
    });

    /**
     * Vite 5.0 kept the table in a function at the end of the chunk, filled on first call. Not read,
     * Excalidraw's lazy features each came out one round trip deeper than they are.
     */
    it("reads Vite 5.0's table, kept on the function rather than in a constant", async () => {
        const vite5 = build().map(entry =>
            entry.path === 'assets/index-AAAAAAAA.js'
                ? file(
                      entry.path,
                      'var o={"#/home":()=>t(()=>import("./home-BBBBBBBB.js"),__vite__mapDeps([])),' +
                          '"#/orders":()=>t(()=>import("./orders-CCCCCCCC.js"),__vite__mapDeps([0,1]))};\n' +
                          'function __vite__mapDeps(indexes) {\n  if (!__vite__mapDeps.viteFileDeps) {\n' +
                          '    __vite__mapDeps.viteFileDeps = ["assets/orders-CCCCCCCC.js","assets/table-EEEEEEEE.js"]\n' +
                          '  }\n  return indexes.map((i) => __vite__mapDeps.viteFileDeps[i])\n}',
                  )
                : entry,
        );
        const { parallel } = await readBundleGraph(vite5, entries);

        expect(parallel.get('assets/orders-CCCCCCCC.js')).toEqual(['assets/table-EEEEEEEE.js']);
    });

    /**
     * Two files of one list both lazily imported from here: nothing in the list says which it is
     * for, and it used to be dropped. The `import()` it is written next to does say.
     */
    it('ties a list to the import written next to it when two of its files are lazy targets', async () => {
        const both = build().map(entry =>
            entry.path === 'assets/index-AAAAAAAA.js'
                ? file(
                      entry.path,
                      'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/orders-CCCCCCCC.js",' +
                          '"assets/table-EEEEEEEE.js"])))=>i.map(i=>d[i]);' +
                          'var o={"#/table":()=>t(()=>import(`./table-EEEEEEEE.js`),[]),' +
                          '"#/orders":()=>t(()=>import(`./orders-CCCCCCCC.js`).then(m=>m.default),__vite__mapDeps([0,1]))};',
                  )
                : entry,
        );
        const { parallel } = await readBundleGraph(both, entries);

        expect(parallel.get('assets/orders-CCCCCCCC.js')).toEqual(['assets/table-EEEEEEEE.js']);
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

/**
 * Builds older than ES modules, or loaders that build a file name at run time: read from Polymer's,
 * Stencil's, Sapper's and Ember's real output, each of which this got wrong before.
 */
/** Polymer's page starts its AMD build from an inline `define`, not from a tag. */
const PAGE_AMD = '<script>define(["src/my-app.js"])</script>';

describe('readBundleGraph · what comes before ES modules', () => {
    it('reads AMD dependencies as static edges and a name in a string as a lazy one', async () => {
        // Polymer's es6-bundled build: the views say what they need with `define`, and the app
        // loads them with a `require([…])` the minifier renamed.
        const amd = [
            file('index.html', PAGE_AMD),
            file(
                'src/my-app.js',
                'define(["./shared-AAAAAAAA.js"],function(s){_require.default(["./my-view1.js"],r,j)});',
            ),
            file('src/shared-AAAAAAAA.js', 'define([],function(){});'),
            file('src/my-view1.js', 'define(["./my-app.js","./shared-AAAAAAAA.js"],function(){});'),
        ];

        const { meta } = await readFolderGraph(amd, PAGE_AMD);

        expect(meta.outputs['src/my-app.js']?.imports).toEqual([
            { path: 'src/shared-AAAAAAAA.js', kind: 'import-statement' },
            { path: 'src/my-view1.js', kind: 'dynamic-import' },
        ]);
        expect(meta.outputs['src/my-view1.js']?.entryPoint).toBe('src/my-view1.js');
    });

    it('takes a chunk named only by its id as loaded on demand by the chunk naming it', async () => {
        // Stencil: the entry lists its components by id and imports `./${id}.entry.js`.
        const stencil = [
            // eslint-disable-next-line no-template-curly-in-string -- Stencil's loader as it ships: the template is the point.
            file('build/app.esm.js', 'o([["p-w91mnxr1",[[1,"app-home"]]]]);const l=n=>import(`./${n}.entry.js`);'),
            file('build/p-w91mnxr1.entry.js', 'export const AppHome=1;'),
        ];

        const { meta } = await readBundleGraph(stencil, new Set(['app.esm.js']));

        expect(meta.outputs['build/app.esm.js']?.imports).toEqual([
            { path: 'build/p-w91mnxr1.entry.js', kind: 'dynamic-import' },
        ]);
    });

    /**
     * A word is never a key. `index` and `vendor` are what every bundle says in passing; matched,
     * they would tie files that have nothing to do with each other.
     */
    it('does not take a plain word for the name of a chunk', async () => {
        const worded = [file('index-AAAAAAAA.js', 'const page="vendor";'), file('vendor.js', 'export const v=1;')];

        const { meta } = await readBundleGraph(worded, new Set(['index-AAAAAAAA.js']));

        expect(meta.outputs['index-AAAAAAAA.js']?.imports).toEqual([]);
    });

    it('leaves the nomodule copy and the service worker out, and says which is which', async () => {
        const html = `<script type="module" src="/app.esm.js"></script><script nomodule src="/app.js"></script>
            <script>navigator.serviceWorker.register('/sw.js')</script>`;
        const files = [
            file('app.esm.js', 'import("./p-AAAAAAA1.entry.js");'),
            file('p-AAAAAAA1.entry.js', 'export{};'),
            // The legacy loader names the modern chunk too: what the application reaches stays in.
            file('app.js', 'System.register(["./p-BBBBBBB2.system.js"],function(){});var x="p-AAAAAAA1.entry.js";'),
            file('p-BBBBBBB2.system.js', 'System.register([],function(){});'),
            file('sw.js', 'importScripts("workbox-CCCCCCC3.js");'),
            file('workbox-CCCCCCC3.js', 'self.x=1;'),
        ];

        const { meta } = await readFolderGraph(files, html);

        expect(meta.outputs['app.js']?.offPage).toBe('legacy');
        expect(meta.outputs['p-BBBBBBB2.system.js']?.offPage).toBe('legacy');
        expect(meta.outputs['sw.js']?.offPage).toBe('service-worker');
        expect(meta.outputs['workbox-CCCCCCC3.js']?.offPage).toBe('service-worker');
        expect(meta.outputs['p-AAAAAAA1.entry.js']?.offPage).toBeUndefined();
    });

    it('starts where build.entries says and leaves out what build.ignore names', async () => {
        const files = [
            file('client/client.11806644.js', 'var p="./polyfill-dd3a1e22.js";'),
            file('client/polyfill-dd3a1e22.js', 'self.p=1;'),
        ];

        const { meta } = await readFolderGraph(files, '<p>no script here</p>', {
            entries: ['client.*.js'],
            ignore: ['polyfill-*.js'],
        });

        expect(meta.outputs['client/client.11806644.js']?.entryPoint).toBeDefined();
        expect(meta.outputs['client/polyfill-dd3a1e22.js']?.offPage).toBe('ignored');
    });

    /**
     * ember-auto-import puts webpack's runtime inside `vendor.js` with no chunk for it to load: the
     * loader with nothing to load. Refused, an Ember build read as a Next.js app.
     */
    it('reads a build whose only webpack runtime has nothing else to load', async () => {
        const ember = [
            file(
                'assets/vendor-AAAAAAAA.js',
                'window.webpackJsonp_ember_auto_import_=window.webpackJsonp_ember_auto_import_||[];',
            ),
            file('assets/app-BBBBBBBB.js', 'define("app/router",[],function(){});'),
        ];

        const { meta } = await readBundleGraph(ember, new Set(['vendor-AAAAAAAA.js', 'app-BBBBBBBB.js']));

        expect(Object.keys(meta.outputs)).toHaveLength(2);
    });

    /** ember-cli hashes each map on its own, and names it with no `./` in front. */
    it('finds a map named by its own hash, relative to the chunk', async () => {
        const code = 'var a=1;\n//# sourceMappingURL=vendor-CCCCCCCC.map';
        const files = [
            file('assets/vendor-AAAAAAAA.js', code),
            file('assets/vendor-CCCCCCCC.map', mapFor(['addon-tree-output/ember-data/-private.js'], [0])),
        ];

        const { meta } = await readBundleGraph(files, new Set(['vendor-AAAAAAAA.js']));

        // Read, and the addon is a package rather than a file of the project.
        expect(Object.keys(meta.outputs['assets/vendor-AAAAAAAA.js']?.inputs ?? {})).toEqual([
            'node_modules/ember-data/-private.js',
        ]);
    });
});

describe('namedBy', () => {
    it('matches a file name or its path, with * for the hash', () => {
        expect(namedBy('client.*.js', 'client/client.11806644.js')).toBe(true);
        expect(namedBy('build/p-*.js', 'build/p-3b66a627.js')).toBe(true);
        expect(namedBy('main.js', 'assets/main.js')).toBe(true);
        expect(namedBy('client.*.js', 'client/chunk.11806644.js')).toBe(false);
        expect(namedBy('a*a', 'a')).toBe(false);
    });
});
