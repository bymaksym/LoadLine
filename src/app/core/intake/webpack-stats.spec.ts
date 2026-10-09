import { describe, expect, it } from 'vitest';
import { modulePath } from './webpack-modules';
import { fromWebpackStats, metafileOf } from './webpack-stats';

describe('modulePath', () => {
    it('names a module the way the rest of Loadline names a file', () => {
        expect(modulePath('./src/app/home.ts')).toBe('src/app/home.ts');
        expect(modulePath('./node_modules/babel-loader/lib??ref--4-0!./src/a.js')).toBe('src/a.js');
        expect(modulePath('css ./node_modules/css-loader/dist/cjs.js!./src/styles.css')).toBe('src/styles.css');
        // The three parts of a Vue component are one file.
        expect(modulePath('./src/App.vue?vue&type=script&lang=js&')).toBe('src/App.vue');
        expect(modulePath('./src/main.ts + 20 modules')).toBe('src/main.ts');
        expect(modulePath(String.raw`./src/locales lazy ^\.\/.*\.json$ namespace object`)).toBe('src/locales');
    });

    it("files webpack's own code under node_modules/webpack", () => {
        expect(modulePath('(webpack)/buildin/global.js')).toBe('node_modules/webpack/buildin/global.js');
        expect(modulePath('webpack/runtime/jsonp chunk loading')).toBe(
            'node_modules/webpack/runtime/jsonp chunk loading',
        );
    });

    it('drops what is no file anybody ships', () => {
        expect(modulePath('multi ./src/main.ts')).toBeNull();
        expect(modulePath('external "React"')).toBeNull();
    });
});

/** A stats file with one entry, one lazy route and the module concatenation webpack 4 writes. */
const STATS = {
    assets: [
        { name: 'main.js', size: 1000 },
        { name: 'route.js', size: 100 },
    ],
    entrypoints: { main: { chunks: [0] } },
    chunks: [
        { id: 0, names: ['main'], files: ['main.js'], initial: true, origins: [{ moduleName: '', loc: 'main' }] },
        {
            id: 1,
            names: [],
            files: ['route.js'],
            initial: false,
            origins: [{ moduleName: './src/router.ts', loc: '3:9-30', request: './route' }],
        },
    ],
    modules: [
        {
            name: './src/main.ts + 2 modules',
            chunks: [0],
            size: 3000,
            modules: [
                { name: './src/main.ts', size: 300, reasons: [{ type: 'single entry', loc: 'main' }], source: '' },
                { name: './src/app.ts', size: 2000, source: "import { a } from 'lib';" },
                { name: './src/router.ts', size: 700, source: "const r = () => import('./route');" },
            ],
        },
        {
            name: './node_modules/lib/index.js',
            chunks: [0],
            size: 4000,
            reasons: [
                { type: 'harmony import specifier', moduleName: './src/main.ts + 2 modules', userRequest: 'lib' },
            ],
            optimizationBailout: ['ModuleConcatenation bailout: Module is not an ECMAScript module'],
        },
        {
            name: './src/route.ts',
            chunks: [1],
            size: 500,
            reasons: [{ type: 'import()', moduleName: './src/router.ts', loc: '3:9-30', userRequest: './route' }],
        },
    ],
};

describe('fromWebpackStats', () => {
    it('starts the application at the module of its entry, and loads the route lazily from the file that asks', () => {
        const meta = fromWebpackStats(STATS);

        expect(meta?.outputs['main.js']?.entryPoint).toBe('src/main.ts');
        expect(meta?.outputs['main.js']?.imports).toEqual([{ path: 'route.js', kind: 'dynamic-import' }]);
        expect(meta?.outputs['route.js']?.entryPoint).toBe('src/route.ts');
    });

    /**
     * webpack 4 says "`./src/main.ts + 2 modules` imports lib", and taken at its word `main.ts` was a
     * barrel. The module that wrote the import is the one with `'lib'` in its source.
     */
    it('gives an import made inside a concatenated module to the file that wrote it', () => {
        const meta = fromWebpackStats(STATS);

        expect(meta?.inputs['src/app.ts']?.imports).toEqual([
            { path: 'node_modules/lib/index.js', kind: 'import-statement' },
        ]);
        expect(meta?.inputs['src/main.ts']?.imports).toEqual([]);
        expect(meta?.inputs['node_modules/lib/index.js']?.format).toBe('cjs');
    });

    it('shares the source sizes out over the file, so the parts add up to it', () => {
        const inputs = fromWebpackStats(STATS)?.outputs['main.js']?.inputs ?? {};

        expect(Object.values(inputs).reduce((sum, input) => sum + input.bytesInOutput, 0)).toBe(1000);
        // lib is 4000 of the 7000 bytes of source in the chunk, 571.4 of 1000: rounded down, and as
        // the largest part it takes the 2 bytes rounding lost.
        expect(inputs['node_modules/lib/index.js']?.bytesInOutput).toBe(573);
    });

    it('leaves a worker out of the screens: it runs beside the page', () => {
        const worker = structuredClone(STATS);
        const route = worker.modules[2];
        route!.reasons = [
            { type: 'new Worker()', moduleName: './src/router.ts', loc: '3:9-30', userRequest: './route' },
        ];

        expect(fromWebpackStats(worker)?.outputs['main.js']?.imports).toEqual([]);
    });

    it('reads the browser compilation of a build with several', () => {
        const meta = fromWebpackStats({
            children: [
                { name: 'server', ...STATS },
                { name: 'client', ...STATS },
            ],
        });

        expect(Object.keys(meta?.outputs ?? {})).toEqual(['main.js', 'route.js']);
    });

    it('is null for stats written without chunks: there is nothing to analyse', () => {
        expect(fromWebpackStats({ chunks: [], modules: [], assets: [] })).toBeNull();
        expect(metafileOf({ chunks: [], modules: [], assets: [] })).toBeNull();
    });

    it('lets a metafile through unchanged', () => {
        const metafile = { inputs: {}, outputs: {} };
        expect(metafileOf(metafile)).toBe(metafile);
    });
});
