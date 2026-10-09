/**
 * What one real Angular 22 application with Firebase got wrong, each case at its smallest.
 *
 * The report was read by somebody who knew the build, and every line here is a sentence it said
 * that was not true of that build: component stylesheets called "the server side", a public
 * Firebase key raised as a leaked credential, favicons counted as if all of them downloaded, a
 * package with no submodules told to import its submodules, English in a Spanish report.
 */

import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analysis';
import { type Metafile } from '../analysis/metafile.types';
import { browserSide } from '../analysis/screens/entries';
import { readAssets } from '../assets/assets';
import { assetsIn } from '../build-text/index-html';
import { RECOMMENDED } from '../criteria/criteria';
import { summaryText } from '../export/summary';
import { budgetAdvice, screenBudgetAdvice } from '../project/budget-advice';
import { readAngularJson, repoPathOf } from '../project/project-context';
import { scanBuild } from '../scan/scan';
import { simulateDefer } from '../whatif/defer';
import { rankActions } from './actions';
import { type Finding } from './finding.types';
import { buildFindings } from './findings';
import { buildAssetFindings } from './folder/assets';
import { buildScanFindings } from './folder/scan';
import { plainText } from './text/finding-plain';

const pnpm = (spec: string, file: string): string => {
    const at = spec.lastIndexOf('@');
    const name = spec.slice(0, at);
    return `node_modules/.pnpm/${name.replace('/', '+')}@${spec.slice(at + 1)}/node_modules/${name}/${file}`;
};

describe('component stylesheets are not the server side', () => {
    it('leaves them out of the browser outputs without calling them a server build', () => {
        const outputs: Metafile['outputs'] = {
            'main-A.js': { bytes: 100, entryPoint: 'src/main.ts', inputs: {} },
            'home-B.css': { bytes: 40, inputs: { 'src/app/home.scss': { bytesInOutput: 40 } }, 'ng-component': true },
            'card-C.css': { bytes: 30, inputs: { 'src/app/card.scss': { bytesInOutput: 30 } }, 'ng-component': true },
        };

        // The folder holds the script and neither stylesheet: Angular inlined both.
        const side = browserSide(outputs, new Set(['main-A.js']));
        expect(side.serverOutputs).toBe(0);
        expect(side.componentStyles).toBe(2);
        expect(Object.keys(side.outputs)).toEqual(['main-A.js']);
    });
});

describe('the budget suggested and the budget judged are the same figure', () => {
    const meta: Metafile = {
        inputs: { 'src/main.ts': { bytes: 400_000 }, 'src/styles.scss': { bytes: 150_000 } },
        outputs: {
            'main-A.js': {
                bytes: 404_000,
                entryPoint: 'src/main.ts',
                inputs: { 'src/main.ts': { bytesInOutput: 404_000 } },
            },
            'styles-B.css': {
                bytes: 147_000,
                entryPoint: 'angular:styles/global:styles',
                inputs: { 'src/styles.scss': { bytesInOutput: 147_000 } },
            },
        },
    };

    it('counts the global stylesheet into the initial figure, as Angular does', () => {
        const analysis = analyze(meta, null);
        expect(analysis.bootRawBytes).toBe(404_000);
        expect(analysis.initialRawBytes).toBe(551_000);
    });

    it('suggests a budget the "too high" signal then accepts', () => {
        const analysis = analyze(meta, null);
        const advice = budgetAdvice(analysis.initialRawBytes);
        expect(advice?.errorKb).toBeLessThan((analysis.initialRawBytes / 1024) * RECOMMENDED.raw.budgetSlackFactor);
    });

    it('puts anyScript above the largest script, bootstrap included, or it fails the next build', () => {
        const analysis = analyze(meta, null);
        const perFile = screenBudgetAdvice(analysis.largestScript?.bytes ?? 0);
        expect(perFile?.warningKb).toBeGreaterThan(404_000 / 1024);
    });
});

describe('secrets that are not', () => {
    const KEY = `AIza${'x'.repeat(35)}`;

    it('reads a Firebase web apiKey as public by design and keeps the card informative', () => {
        const texts = new Map([
            ['main.js', `const c={apiKey:"${KEY}",authDomain:"app.firebaseapp.com",projectId:"app"};`],
        ]);
        const scan = scanBuild({ texts, modules: [], boot: new Set(), maps: [] });

        expect(scan.secrets[0]?.benign).toBe('firebaseConfig');
        const [card] = buildScanFindings(scan, 'es', RECOMMENDED.gzip);
        expect(card?.severity).toBe('info');
        expect(plainText(card?.body ?? '')).toContain('pública');
    });

    it('still raises the same key on its own: a bare Google key is a credential', () => {
        const scan = scanBuild({ texts: new Map([['main.js', `k="${KEY}"`]]), modules: [], boot: new Set(), maps: [] });
        expect(buildScanFindings(scan, 'en', RECOMMENDED.gzip)[0]?.severity).toBe('high');
    });

    it('attributes process.env.DEBUG to the debug package the metafile puts in that chunk', () => {
        const DEBUG = pnpm('debug@4.3.7', 'src/browser.js');
        const analysis = analyze(
            {
                inputs: { 'src/main.ts': { bytes: 10 }, [DEBUG]: { bytes: 10 } },
                outputs: {
                    'main.js': {
                        bytes: 20,
                        entryPoint: 'src/main.ts',
                        inputs: { 'src/main.ts': { bytesInOutput: 10 }, [DEBUG]: { bytesInOutput: 10 } },
                    },
                },
            },
            null,
        );
        const scan = scanBuild({
            texts: new Map([['main.js', 'if(typeof process!=="undefined"){r=process.env.DEBUG}']]),
            modules: analysis.modules,
            boot: new Set(analysis.bootChunks),
            maps: [],
        });

        expect(scan.secrets[0]?.owner).toBe('debug');
        expect(buildScanFindings(scan, 'en', RECOMMENDED.gzip)[0]?.severity).toBe('info');
    });
});

describe('favicons are alternatives', () => {
    const HTML = `
        <link rel="icon" type="image/x-icon" href="favicon.ico">
        <link rel="icon" type="image/svg+xml" href="favicon.svg">
        <link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
        <link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png">
        <link rel="stylesheet" href="styles.css">`;

    it('counts the one icon a browser fetches, and none of the touch icons', () => {
        const named = assetsIn(HTML);
        expect(named.referenced.toSorted((a, b) => a.localeCompare(b))).toEqual(['favicon.svg', 'styles.css']);
        expect(named.alternates.toSorted((a, b) => a.localeCompare(b))).toEqual([
            'apple-touch-icon.png',
            'favicon.ico',
            'icon-192.png',
        ]);
    });

    it('does not call two icons with the same picture a file that travels twice', () => {
        const named = assetsIn(HTML);
        const files = ['icon-192.png', 'apple-touch-icon.png'].map(name => ({ path: name, name, bytes: 9000 }));
        const report = readAssets({
            files,
            html: HTML,
            texts: new Map(),
            hashes: new Map(files.map(file => [file.path, 'same'])),
            inPage: new Set(named.referenced),
            preloaded: new Set(),
            icons: new Set(named.icons),
            bootChunks: new Set(),
        });
        expect(report.duplicates).toEqual([]);
        expect(report.firstTrip.images).toBe(0);
    });
});

/** A bootstrap with Angular, three SDKs each imported by one service, and a hundred components. */
const APP: Metafile = (() => {
    const CORE = pnpm('@angular/core@22.1.6', 'fesm2022/core.mjs');
    const CORE_CHUNKS = ['_effect-chunk.mjs', '_signal-chunk.mjs', '_not_found-chunk.mjs'].map(file =>
        pnpm('@angular/core@22.1.6', `fesm2022/${file}`),
    );
    const FIREBASE = pnpm('@firebase/app@0.10.13', 'dist/esm/index.esm2017.js');
    const UA = pnpm('ua-parser-js@1.0.39', 'src/ua-parser.js');
    const comps = Array.from({ length: 100 }, (_, index) => `src/app/c${index}.component.ts`);

    const inputs: Metafile['inputs'] = {
        'src/main.ts': {
            bytes: 100,
            imports: [
                { path: 'src/app/app.config.ts', kind: 'import-statement' },
                ...comps.map(path => ({ path, kind: 'import-statement' })),
            ],
        },
        'src/app/app.config.ts': {
            bytes: 100,
            imports: [
                { path: CORE, kind: 'import-statement' },
                { path: 'src/app/firebase.service.ts', kind: 'import-statement' },
                { path: 'src/app/device.service.ts', kind: 'import-statement' },
            ],
        },
        'src/app/firebase.service.ts': { bytes: 100, imports: [{ path: FIREBASE, kind: 'import-statement' }] },
        'src/app/device.service.ts': { bytes: 100, imports: [{ path: UA, kind: 'import-statement' }] },
        [CORE]: { bytes: 100_000, imports: CORE_CHUNKS.map(path => ({ path, kind: 'import-statement' })) },
        ...Object.fromEntries(CORE_CHUNKS.map(path => [path, { bytes: 20_000 }])),
        [FIREBASE]: { bytes: 60_000 },
        [UA]: { bytes: 30_000 },
        ...Object.fromEntries(
            comps.map(path => [path, { bytes: 500, imports: [{ path: CORE, kind: 'import-statement' }] }]),
        ),
    };
    const parts: [string, number][] = [
        ['src/main.ts', 100],
        ['src/app/app.config.ts', 100],
        ['src/app/firebase.service.ts', 100],
        ['src/app/device.service.ts', 100],
        [CORE, 90_000],
        ...CORE_CHUNKS.map((path): [string, number] => [path, 18_000]),
        [FIREBASE, 60_000],
        [UA, 30_000],
        ...comps.map((path): [string, number] => [path, 400]),
    ];
    return {
        inputs,
        outputs: {
            'main.js': {
                bytes: parts.reduce((sum, [, bytes]) => sum + bytes, 0),
                entryPoint: 'src/main.ts',
                inputs: Object.fromEntries(parts.map(([path, bytes]) => [path, { bytesInOutput: bytes }])),
            },
        },
    };
})();

describe('the signals of the bootstrap', () => {
    const analysis = analyze(APP, null);
    const findings = buildFindings(analysis, 'es', 'raw');
    const kinds = findings.map(finding => finding.kind);

    it('does not tell @angular/core to import a submodule it does not have', () => {
        expect(kinds).not.toContain('packageBarrel');
    });

    it('names each package one service of yours imports, as a candidate for await import()', () => {
        const single = findings.find(finding => finding.kind === 'bootSingle');
        expect(single?.title).toContain('2 paquetes');
        expect(plainText(single?.body ?? '')).toContain('@firebase/app');
        expect(plainText(single?.body ?? '')).toContain('firebase.service.ts');
        expect(plainText(single?.fix ?? '')).toContain('await import()');
        // The framework is imported once by the entry and is never a candidate.
        expect(plainText(single?.body ?? '')).not.toContain('@angular/core');
    });

    it('writes its lists in Spanish when the report is in Spanish', () => {
        const english = /\b(?:files in|imported from outside|in the page|each\))|re-exports\b/;
        for (const finding of findings) {
            expect(plainText(finding.body), finding.kind).not.toMatch(english);
        }
    });
});

describe('what to fix first', () => {
    const finding = (kind: Finding['kind'], severity: Finding['severity'], saving = 0): Finding => ({
        kind,
        severity,
        saving,
        chip: kind,
        title: kind,
        body: '',
        fix: '',
    });

    it('puts a high signal first even when it saves no kilobyte', () => {
        const order = rankActions([
            finding('bigFile', 'mid', 280_000),
            finding('unhashable', 'mid'),
            finding('secrets', 'high'),
            finding('media', 'info'),
        ]).map(action => action.finding.kind);

        expect(order).toEqual(['secrets', 'bigFile', 'unhashable', 'media']);
    });
});

describe('files nothing names, when angular.json copies them', () => {
    it('reads the assets folders in both spellings and maps a file back to the repository', () => {
        const angular = readAngularJson({
            projects: {
                app: {
                    projectType: 'application',
                    architect: {
                        build: { options: { assets: [{ glob: '**/*', input: 'public' }, 'src/assets'] } },
                    },
                },
            },
        });
        const folders = angular?.assetFolders ?? [];

        expect(folders).toEqual([
            { input: 'public', output: '' },
            { input: 'src/assets', output: 'assets' },
        ]);
        expect(repoPathOf('old-logo.png', folders)).toBe('public/old-logo.png');
        expect(repoPathOf('assets/img/x.png', folders)).toBe('src/assets/img/x.png');
    });

    it('tells somebody to delete it from the repository, not to clean the build folder', () => {
        const report = readAssets({
            files: [{ path: 'old-logo.png', name: 'old-logo.png', bytes: 42_000 }],
            html: '<html></html>',
            texts: new Map([['main.js', 'nothing']]),
            inPage: new Set(),
            preloaded: new Set(),
            bootChunks: new Set(),
        });
        const card = buildAssetFindings(
            report,
            'es',
            RECOMMENDED.gzip,
            new Map([['old-logo.png', 'public/old-logo.png']]),
            true,
        ).find(finding => finding.kind === 'unreferencedAssets');

        expect(plainText(card?.fix ?? '')).toContain('bórralo del repositorio');
        expect(plainText(card?.body ?? '')).toContain('public/');
    });
});

describe('a saving that cannot be measured is not a saving of zero', () => {
    // A folder read without source maps: the bootstrap chunk weighs what it weighs, and nothing
    // says what is inside it. That is the shape `bundle-graph.ts` writes for such a folder.
    const opaque = analyze(
        { inputs: {}, outputs: { 'index-A.js': { bytes: 40_000, entryPoint: 'index-A.js', imports: [] } } },
        null,
    );

    it('answers a package it cannot see as unmeasurable, not as "0 B, nothing uses it"', () => {
        const result = simulateDefer(opaque, '@microsoft/teams-js');
        expect(result.measurable).toBe(false);
        const paste = summaryText({
            analysis: opaque,
            findings: [],
            comparison: null,
            unit: 'raw',
            name: 'dist',
            firstTrip: null,
            lang: 'en',
            whatIf: [result],
        });
        expect(paste).toContain('No source maps');
        expect(paste).toContain('cannot be measured');
    });

    it('names a broken gate in the summary, which a job log shows instead of the report', () => {
        const paste = (gates?: string[]): string =>
            summaryText({
                analysis: opaque,
                findings: [],
                comparison: null,
                unit: 'raw',
                name: 'dist',
                firstTrip: null,
                lang: 'en',
                ...(gates && { gates }),
            });
        expect(paste(['Bootstrap is 40 kB, over the 30 kB allowed.'])).toContain(
            'Gates: 1 broken\n  x Bootstrap is 40 kB, over the 30 kB allowed.',
        );
        expect(paste([])).toContain('Gates: all passed');
        expect(paste()).not.toContain('Gates');
    });

    it('still answers "not in this build" when every chunk could have shown it', () => {
        expect(simulateDefer(analyze(APP, null), '@microsoft/teams-js').measurable).toBe(true);
    });
});

describe('fonts on the server are not fonts on the wire', () => {
    const files = [
        { name: 'Roboto-Regular-A1.woff2', bytes: 20_000 },
        { name: 'Roboto-Regular-A1.ttf', bytes: 60_000 },
        { name: 'Roboto-Bold-B2.woff2', bytes: 21_000 },
        { name: 'Roboto-Bold-B2.ttf', bytes: 62_000 },
    ].map(file => ({ ...file, path: file.name }));
    const assets = readAssets({
        files,
        html: '',
        texts: new Map(),
        inPage: new Set(),
        preloaded: new Set(),
        bootChunks: new Set(),
    });

    it('says the second format is stored rather than downloaded, and keeps the card informative', () => {
        const card = buildAssetFindings(assets, 'es', RECOMMENDED.gzip).find(finding => finding.kind === 'fonts');
        expect(card?.severity).toBe('info');
        expect(plainText(card?.title ?? '')).toContain('servidor');
        expect(plainText(card?.title ?? '')).not.toContain('viajan');
    });
});

describe('the secrets card says what raises it', () => {
    it('names the unexplained match when a public Firebase key shares the card', () => {
        const KEY = `AIza${'x'.repeat(35)}`;
        const texts = new Map([
            ['main.js', `const c={apiKey:"${KEY}",authDomain:"a.firebaseapp.com",projectId:"a"};u=process.env.API_URL`],
        ]);
        const [card] = buildScanFindings(
            scanBuild({ texts, modules: [], boot: new Set(), maps: [] }),
            'en',
            RECOMMENDED.gzip,
        );
        expect(card?.severity).toBe('mid');
        expect(plainText(card?.title ?? '')).toContain('unsubstituted environment variable');
        expect(plainText(card?.title ?? '')).toContain('Firebase key is not what raises it');
    });
});
