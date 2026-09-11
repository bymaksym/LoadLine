/**
 * A build to look at without having to compile one.
 *
 * The highest barrier this tool has is that evaluating it starts with building an application.
 * This is that build, written out: a synthetic metafile of an Angular-shaped admin app, plus the
 * `index.html` that names what the browser asks for first.
 *
 * It is not a screenshot. It goes in through the same door a dropped `stats.json` does and comes
 * out of the same analysis, so every figure on the page is computed from what is here — and when
 * the analysis changes, this moves with it or the tests that read it go red.
 *
 * It is deliberately a **build with problems**: a chunk five of eight screens import that the
 * bundler still calls deferred, a date library in the bootstrap whose real consumer loads
 * separately, two copies of it, a table of country data travelling with the first paint, a
 * spreadsheet package that cannot be tree-shaken and two screens that cost several times what the
 * others do. A clean example would show an empty Findings tab, which is the one thing nobody needs
 * a tool for.
 *
 * Sizes are raw minified bytes, which is what a `stats.json` on its own can say. Nothing here is
 * compressed, and the report says so: only a real folder of files can answer that.
 */

import { type Metafile, type MetafileImport, type ModuleFormat } from '../analysis/metafile.types';

/** `node_modules/.pnpm/<name>@<version>/node_modules/<name>/` — the layout the duplicate check reads. */
const pnpm = (spec: string, file: string): string => {
    const at = spec.lastIndexOf('@');
    const name = spec.slice(0, at);
    return `node_modules/.pnpm/${name.replace('/', '+')}@${spec.slice(at + 1)}/node_modules/${name}/${file}`;
};

const ANGULAR_CORE = pnpm('@angular/core@22.1.4', 'fesm2022/core.mjs');
const ANGULAR_COMMON = pnpm('@angular/common@22.1.4', 'fesm2022/common.mjs');
const ANGULAR_ROUTER = pnpm('@angular/router@22.1.4', 'fesm2022/router.mjs');
const ANGULAR_CDK = pnpm('@angular/cdk@22.0.1', 'fesm2022/cdk.mjs');
const RXJS = pnpm('rxjs@7.8.2', 'dist/esm/index.js');
const ICONS = pnpm('lucide-angular@0.462.0', 'dist/index.mjs');
const CHARTS = pnpm('chart.js@4.4.7', 'dist/chart.js');
/** What chart.js imports, and the third level of the dashboard's chain of static imports. */
const COLOR = pnpm('@kurkle/color@0.3.4', 'dist/color.esm.js');
const PDF = pnpm('pdf-lib@1.17.1', 'es/index.js');
const XLSX = pnpm('xlsx@0.18.5', 'xlsx.js');
const GRID = pnpm('ag-grid-community@31.3.4', 'dist/package/main.esm.mjs');
const SCALE = pnpm('d3-scale@4.0.2', 'src/index.js');
/** The copy everyone downloads: imported eagerly by one service, and by one lazy screen. */
const DATE_FNS = pnpm('date-fns@3.6.0', 'index.js');
/** The second copy, nested inside the grid. Nobody asked for it, so no `package.json` moves it. */
const DATE_FNS_NESTED = 'node_modules/.pnpm/ag-grid-community@31.3.4/node_modules/date-fns/index.js';

/** What each source file imports, and how. Only edges the report reads are written out. */
const IMPORTS: Record<string, [path: string, kind?: MetafileImport['kind']][]> = {
    'src/main.ts': [['src/app/app.ts'], ['src/app/app.config.ts']],
    'src/app/app.ts': [
        [ANGULAR_CORE],
        ['src/app/shared/theme/theme.ts'],
        ['src/app/core/http/api.service.ts'],
        [ICONS],
    ],
    'src/app/app.config.ts': [[ANGULAR_CORE], [ANGULAR_ROUTER], ['src/app/app.routes.ts']],
    'src/app/app.routes.ts': [
        ['src/app/features/dashboard/dashboard.page.ts', 'dynamic-import'],
        ['src/app/features/orders/orders.page.ts', 'dynamic-import'],
        ['src/app/features/invoices/invoices.page.ts', 'dynamic-import'],
        ['src/app/features/customers/customers.page.ts', 'dynamic-import'],
        ['src/app/features/settings/settings.page.ts', 'dynamic-import'],
        ['src/app/features/reports/reports.page.ts', 'dynamic-import'],
        ['src/app/features/admin/admin.routes.ts', 'dynamic-import'],
    ],
    'src/app/core/http/api.service.ts': [[ANGULAR_COMMON], [RXJS], [DATE_FNS], ['src/app/core/countries.data.ts']],
    'src/app/shared/theme/theme.ts': [[ANGULAR_CDK]],
    'src/app/shared/grid/grid.ts': [[GRID]],
    'src/app/features/dashboard/dashboard.page.ts': [
        [ANGULAR_CORE],
        [CHARTS],
        ['src/app/features/dashboard/heatmap.widget.ts', 'dynamic-import'],
    ],
    'src/app/features/dashboard/heatmap.widget.ts': [[SCALE]],
    'src/app/features/orders/orders.page.ts': [[ANGULAR_CORE], ['src/app/shared/grid/grid.ts'], [DATE_FNS]],
    'src/app/features/invoices/invoices.page.ts': [['src/app/shared/grid/grid.ts'], [PDF]],
    'src/app/features/customers/customers.page.ts': [['src/app/shared/grid/grid.ts']],
    'src/app/features/settings/settings.page.ts': [[ANGULAR_CORE]],
    'src/app/features/reports/reports.page.ts': [['src/app/shared/grid/grid.ts'], [XLSX]],
    'src/app/features/admin/admin.routes.ts': [
        ['src/app/features/admin/users.page.ts', 'dynamic-import'],
        ['src/app/features/admin/audit.page.ts', 'dynamic-import'],
    ],
    'src/app/features/admin/users.page.ts': [['src/app/shared/grid/grid.ts']],
    'src/app/features/admin/audit.page.ts': [[ANGULAR_CORE]],
    [GRID]: [[DATE_FNS_NESTED]],
    [CHARTS]: [[COLOR]],
};

/** The one package esbuild reports as CommonJS: it enters whole, file by file, un-shaken. */
const FORMATS: Record<string, ModuleFormat> = { [XLSX]: 'cjs' };

interface SampleChunk {
    file: string;
    /** The source file the chunk starts at. Only entry chunks have one. */
    entry?: string;
    /** Chunks the browser fetches as soon as it has parsed this one. */
    statics?: string[];
    /** Chunks something inside asks for later: the lazy boundary. */
    lazy?: string[];
    /** Source file → bytes it contributes to this chunk. */
    holds: Record<string, number>;
}

const CHUNKS: SampleChunk[] = [
    {
        file: 'main-K7QW2X.js',
        entry: 'src/main.ts',
        statics: ['chunk-CORE-4H8BTZ.js', 'chunk-THEME-QW19MC.js'],
        lazy: [
            'chunk-DASHBOARD-2FJ7QA.js',
            'chunk-ORDERS-3KM9VB.js',
            'chunk-INVOICES-7XQ2WD.js',
            'chunk-CUSTOMERS-6BVT4S.js',
            'chunk-SETTINGS-4CZP8M.js',
            'chunk-REPORTS-2HGD5K.js',
            'chunk-ADMIN-9TYU2E.js',
        ],
        holds: {
            'src/main.ts': 420,
            'src/app/app.ts': 3480,
            'src/app/app.config.ts': 2140,
            'src/app/app.routes.ts': 880,
            'src/app/core/http/api.service.ts': 6200,
            'src/app/core/countries.data.ts': 48_600,
            [DATE_FNS]: 28_400,
        },
    },
    {
        file: 'chunk-CORE-4H8BTZ.js',
        statics: ['chunk-ICONS-8PLM3D.js'],
        holds: { [ANGULAR_CORE]: 182_000, [ANGULAR_COMMON]: 61_400, [ANGULAR_ROUTER]: 96_200, [RXJS]: 52_800 },
    },
    {
        file: 'chunk-THEME-QW19MC.js',
        holds: { 'src/app/shared/theme/theme.ts': 9300, [ANGULAR_CDK]: 44_100 },
    },
    // Not named by index.html: the browser only learns it exists after parsing the core chunk,
    // which is what makes the first load take two round trips instead of one.
    { file: 'chunk-ICONS-8PLM3D.js', holds: { [ICONS]: 31_500 } },

    {
        file: 'chunk-DASHBOARD-2FJ7QA.js',
        entry: 'src/app/features/dashboard/dashboard.page.ts',
        statics: ['chunk-CHARTS-9WD4KL.js'],
        lazy: ['chunk-HEATMAP-5RT8NC.js'],
        holds: { 'src/app/features/dashboard/dashboard.page.ts': 11_800 },
    },
    // Three levels deep: the browser only learns the colour chunk exists after parsing this one,
    // which is what makes the dashboard cost three round trips for bytes that are not the problem.
    { file: 'chunk-CHARTS-9WD4KL.js', statics: ['chunk-COLOR-3XQW9V.js'], holds: { [CHARTS]: 224_300 } },
    { file: 'chunk-COLOR-3XQW9V.js', holds: { [COLOR]: 12_700 } },
    {
        file: 'chunk-HEATMAP-5RT8NC.js',
        entry: 'src/app/features/dashboard/heatmap.widget.ts',
        holds: { 'src/app/features/dashboard/heatmap.widget.ts': 7400, [SCALE]: 18_200 },
    },
    {
        file: 'chunk-ORDERS-3KM9VB.js',
        entry: 'src/app/features/orders/orders.page.ts',
        statics: ['chunk-GRID-5NPX7J.js'],
        holds: { 'src/app/features/orders/orders.page.ts': 14_200 },
    },
    {
        file: 'chunk-INVOICES-7XQ2WD.js',
        entry: 'src/app/features/invoices/invoices.page.ts',
        statics: ['chunk-GRID-5NPX7J.js', 'chunk-PDF-1LNZ6H.js'],
        holds: { 'src/app/features/invoices/invoices.page.ts': 12_600 },
    },
    { file: 'chunk-PDF-1LNZ6H.js', holds: { [PDF]: 158_700 } },
    {
        file: 'chunk-CUSTOMERS-6BVT4S.js',
        entry: 'src/app/features/customers/customers.page.ts',
        statics: ['chunk-GRID-5NPX7J.js'],
        holds: { 'src/app/features/customers/customers.page.ts': 9900 },
    },
    {
        file: 'chunk-SETTINGS-4CZP8M.js',
        entry: 'src/app/features/settings/settings.page.ts',
        holds: { 'src/app/features/settings/settings.page.ts': 8100 },
    },
    {
        file: 'chunk-REPORTS-2HGD5K.js',
        entry: 'src/app/features/reports/reports.page.ts',
        statics: ['chunk-GRID-5NPX7J.js', 'chunk-XLSX-8QWR3T.js'],
        holds: { 'src/app/features/reports/reports.page.ts': 10_400 },
    },
    { file: 'chunk-XLSX-8QWR3T.js', holds: { [XLSX]: 428_900 } },
    // Five of the eight screens import it. The bundler calls it deferred; everybody downloads it.
    {
        file: 'chunk-GRID-5NPX7J.js',
        holds: { 'src/app/shared/grid/grid.ts': 4600, [GRID]: 142_500, [DATE_FNS_NESTED]: 23_800 },
    },
    // A list of dynamic imports and nothing else: what it loads are the screens, it is not one.
    {
        file: 'chunk-ADMIN-9TYU2E.js',
        entry: 'src/app/features/admin/admin.routes.ts',
        lazy: ['chunk-USERS-3RKQ8W.js', 'chunk-AUDIT-6MDF1P.js'],
        holds: { 'src/app/features/admin/admin.routes.ts': 640 },
    },
    {
        file: 'chunk-USERS-3RKQ8W.js',
        entry: 'src/app/features/admin/users.page.ts',
        statics: ['chunk-GRID-5NPX7J.js'],
        holds: { 'src/app/features/admin/users.page.ts': 8800 },
    },
    {
        file: 'chunk-AUDIT-6MDF1P.js',
        entry: 'src/app/features/admin/audit.page.ts',
        holds: { 'src/app/features/admin/audit.page.ts': 7200 },
    },
];

/** Chunk overhead: the module wrappers and the runtime a bundler writes around what it holds. */
const WRAPPER = 180;

const importsOf = (source: string): MetafileImport[] =>
    (IMPORTS[source] ?? []).map(([path, kind]) => ({ path, kind: kind ?? 'import-statement' }));

const buildMetafile = (): Metafile => {
    const inputs: Metafile['inputs'] = {};
    const outputs: Metafile['outputs'] = {};

    for (const chunk of CHUNKS) {
        const held = Object.entries(chunk.holds);
        for (const [source, bytes] of held) {
            const format = FORMATS[source];
            inputs[source] = { bytes, imports: importsOf(source), ...(format && { format }) };
        }

        outputs[chunk.file] = {
            bytes: held.reduce((total, [, bytes]) => total + bytes, 0) + WRAPPER,
            ...(chunk.entry && { entryPoint: chunk.entry }),
            imports: [
                ...(chunk.statics ?? []).map(path => ({ path, kind: 'import-statement' })),
                ...(chunk.lazy ?? []).map(path => ({ path, kind: 'dynamic-import' })),
            ],
            inputs: Object.fromEntries(held.map(([source, bytes]) => [source, { bytesInOutput: bytes }])),
        };
    }

    return { inputs, outputs };
};

/** The sample build as a `stats.json` would carry it. */
export const SAMPLE_STATS: Metafile = buildMetafile();

/** What it is called when the report says which build it is about. */
export const SAMPLE_NAME = 'sample-stats.json';

/**
 * The stylesheet that page asks for. It is here because the example exists to show what a real
 * report says, and what a real report says about the first load is not only JavaScript: a
 * render-blocking sheet arrives before anything is painted, and the headline figure does not
 * include it. An example without one would demonstrate a first load that no application has.
 */
export const SAMPLE_CSS = {
    files: ['styles-8KQP2M.css'],
    raw: 96_400,
    gzip: 21_300,
    brotli: null,
};

/**
 * The page of that build. Only this file distinguishes a bootstrap chunk the browser asks for
 * straight away from one it discovers a round trip later, and here it names three of the four.
 */
export const SAMPLE_PAGE = `<!doctype html>
<html lang="en">
    <head>
        <meta charset="utf-8" />
        <title>Northwind Admin</title>
        <link rel="stylesheet" href="/styles-8KQP2M.css" />
        <link rel="modulepreload" href="/chunk-CORE-4H8BTZ.js" />
        <link rel="modulepreload" href="/chunk-THEME-QW19MC.js" />
        <script src="/main-K7QW2X.js" type="module"></script>
    </head>
    <body>
        <app-root></app-root>
    </body>
</html>
`;
