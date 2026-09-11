import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analysis';
import { type Analysis } from '../analysis/analysis.types';
import { type Metafile } from '../analysis/metafile.types';
import { compare } from '../baseline/baseline';
import { type Snapshot } from '../baseline/baseline.types';
import { RECOMMENDED } from '../criteria/criteria';
import { readAngularJson, readPackageJson, readPipeline } from '../project/project-context';
import { FINDING_KINDS } from './finding.types';
import { TEXT } from './finding-text';
import { buildComparisonFindings, buildContextFindings, buildFindings } from './findings';

const KB = 1024;
const c = RECOMMENDED.raw;

/**
 * The real case behind signal 3.2, reduced: a sign-in library registered from `app.config.ts`
 * through `msal.config.ts`, whose real consumer is the lazy `login` screen. Optionally a CommonJS
 * package, in the bootstrap or in the login screen only.
 */
const lazyBootMeta = (cjs: 'none' | 'boot' | 'screen' = 'none'): Metafile => {
    const cjsImport = { path: 'node_modules/legacy/index.js', kind: 'import-statement' };
    return {
        inputs: {
            'src/main.ts': {
                bytes: 100,
                format: 'esm',
                imports: [
                    { path: 'src/app/app.config.ts', kind: 'import-statement' },
                    { path: 'src/app/app.routes.ts', kind: 'import-statement' },
                ],
            },
            'src/app/app.config.ts': {
                bytes: 100,
                format: 'esm',
                imports: [
                    { path: 'src/app/core/msal.config.ts', kind: 'import-statement' },
                    ...(cjs === 'boot' ? [cjsImport] : []),
                ],
            },
            'src/app/core/msal.config.ts': {
                bytes: 100,
                format: 'esm',
                imports: [{ path: 'node_modules/msal/index.js', kind: 'import-statement' }],
            },
            'src/app/app.routes.ts': {
                bytes: 100,
                format: 'esm',
                imports: [
                    { path: 'src/app/login.page.ts', kind: 'dynamic-import' },
                    { path: 'src/app/home.page.ts', kind: 'dynamic-import' },
                ],
            },
            'src/app/login.page.ts': {
                bytes: 100,
                format: 'esm',
                imports: [
                    { path: 'node_modules/msal/index.js', kind: 'import-statement' },
                    ...(cjs === 'screen' ? [cjsImport] : []),
                ],
            },
            'src/app/home.page.ts': { bytes: 100, format: 'esm', imports: [] },
            'node_modules/msal/index.js': { bytes: 30 * KB, format: 'esm', imports: [] },
            'node_modules/legacy/index.js': { bytes: 5 * KB, format: 'cjs', imports: [] },
        },
        outputs: {
            'dist/main.js': {
                bytes: 40 * KB,
                entryPoint: 'src/main.ts',
                inputs: {
                    'src/main.ts': { bytesInOutput: 100 },
                    'src/app/app.config.ts': { bytesInOutput: 100 },
                    'src/app/core/msal.config.ts': { bytesInOutput: 100 },
                    'node_modules/msal/index.js': { bytesInOutput: 30 * KB },
                    ...(cjs === 'boot' && { 'node_modules/legacy/index.js': { bytesInOutput: 5 * KB } }),
                },
                imports: [
                    { path: 'dist/login.js', kind: 'dynamic-import' },
                    { path: 'dist/home.js', kind: 'dynamic-import' },
                ],
            },
            'dist/login.js': {
                bytes: 200,
                entryPoint: 'src/app/login.page.ts',
                inputs: {
                    'src/app/login.page.ts': { bytesInOutput: 200 },
                    ...(cjs === 'screen' && { 'node_modules/legacy/index.js': { bytesInOutput: 5 * KB } }),
                },
            },
            'dist/home.js': {
                bytes: 200,
                entryPoint: 'src/app/home.page.ts',
                inputs: { 'src/app/home.page.ts': { bytesInOutput: 200 } },
            },
        },
    };
};

describe('buildFindings', () => {
    it('says which import puts a package in the bootstrap and where its screen is loaded from', () => {
        const findings = buildFindings(analyze(lazyBootMeta(), null), 'en', 'raw');
        const lazy = findings.find(finding => finding.chip === 'bootstrap for a lazy screen');

        expect(lazy?.target).toEqual({ tab: 'boot', key: 'msal' });
        // The chain, own files as paths and the package at the end.
        expect(lazy?.body).toContain(
            '<span class="mono">src/main.ts</span> › <span class="mono">src/app/app.config.ts</span> › <span class="mono">src/app/core/msal.config.ts</span> › <span class="mono">msal</span>',
        );
        // The file holding the import to move.
        expect(lazy?.body).toContain(
            'the import to look at is the one in <span class="mono">src/app/core/msal.config.ts</span>',
        );
        // And the routes file where the providers go.
        expect(lazy?.fix).toContain(
            'in <span class="mono">src/app/app.routes.ts</span>, where the screen is loaded from',
        );
    });

    it('reports a CommonJS package in the bootstrap as something to review', () => {
        const findings = buildFindings(analyze(lazyBootMeta('boot'), null), 'en', 'raw');
        const cjs = findings.find(finding => finding.chip === 'CommonJS package');

        expect(cjs?.severity).toBe('mid');
        expect(cjs?.target).toEqual({ tab: 'boot', key: 'legacy' });
        expect(cjs?.body).toContain(
            '<span class="mono">legacy</span> (5 kB, in the bootstrap; imported by <span class="mono">src/app/app.config.ts</span>)',
        );
    });

    it('reports a CommonJS package in a single screen as information only', () => {
        const findings = buildFindings(analyze(lazyBootMeta('screen'), null), 'en', 'raw');
        const cjs = findings.find(finding => finding.chip === 'CommonJS package');

        expect(cjs?.severity).toBe('info');
        expect(cjs?.target).toBeUndefined();
        expect(cjs?.body).toContain('in a single screen; imported by <span class="mono">src/app/login.page.ts</span>');
    });

    it('says nothing about CommonJS when there is none', () => {
        const findings = buildFindings(analyze(lazyBootMeta(), null), 'en', 'raw');

        expect(findings.some(finding => finding.chip === 'CommonJS package')).toBe(false);
    });
});

/**
 * The same package twice: one copy asked for by the project, the other brought in by `vendor`.
 * Which of the two it is decides the fix, so the signal has to say it.
 */
const copyOne = 'node_modules/.pnpm/dup-lib@1.0.0/node_modules/dup-lib/index.js';
const copyTwo = 'node_modules/.pnpm/dup-lib@2.0.0/node_modules/dup-lib/index.js';
const vendor = 'node_modules/.pnpm/vendor@1.0.0/node_modules/vendor/index.js';

const dupeMeta: Metafile = {
    inputs: {
        'src/main.ts': {
            bytes: 100,
            format: 'esm',
            imports: [
                { path: copyOne, kind: 'import-statement' },
                { path: vendor, kind: 'import-statement' },
                { path: 'src/app/a.page.ts', kind: 'dynamic-import' },
            ],
        },
        'src/app/a.page.ts': { bytes: 100, format: 'esm' },
        [copyOne]: { bytes: 20 * KB, format: 'esm' },
        [copyTwo]: { bytes: 20 * KB, format: 'esm' },
        [vendor]: { bytes: 10 * KB, format: 'esm', imports: [{ path: copyTwo, kind: 'import-statement' }] },
    },
    outputs: {
        'dist/main.js': {
            bytes: 50 * KB,
            entryPoint: 'src/main.ts',
            inputs: {
                'src/main.ts': { bytesInOutput: 100 },
                [copyOne]: { bytesInOutput: 20 * KB },
                [copyTwo]: { bytesInOutput: 20 * KB },
                [vendor]: { bytesInOutput: 10 * KB },
            },
            imports: [{ path: 'dist/a.js', kind: 'dynamic-import' }],
        },
        'dist/a.js': {
            bytes: 200,
            entryPoint: 'src/app/a.page.ts',
            inputs: { 'src/app/a.page.ts': { bytesInOutput: 200 } },
        },
    },
};

/**
 * The one signal that is about the report rather than about the build. The Vue documentation site
 * imports a chunk per page with a path built at run time: 233 of its 244 chunks, 9 MB, were in no
 * figure and the report said nothing about it.
 */
describe('buildFindings · what the report cannot reach', () => {
    const withLeftovers = (unreachableBytes: number): Metafile => ({
        inputs: { 'src/main.ts': { bytes: 100, format: 'esm', imports: [] } },
        outputs: {
            'dist/main.js': {
                bytes: 1000,
                entryPoint: 'src/main.ts',
                inputs: { 'src/main.ts': { bytesInOutput: 1000 } },
                imports: [],
            },
            'dist/orphan.js': { bytes: unreachableBytes, inputs: {} },
        },
    });

    it('is a problem when most of the build is out of reach, and a note when it is a corner', () => {
        const most = buildFindings(analyze(withLeftovers(9000), null, null, new Set(['main.js'])), 'en', 'raw');
        const corner = buildFindings(analyze(withLeftovers(50), null, null, new Set(['main.js'])), 'en', 'raw');

        expect(most.find(finding => finding.kind === 'unreachable')?.severity).toBe('mid');
        expect(corner.find(finding => finding.kind === 'unreachable')?.severity).toBe('info');
        // Both name the file and say what the three causes are, because the answer differs by cause.
        expect(most.find(finding => finding.kind === 'unreachable')?.body).toContain('orphan.js');
        expect(corner.find(finding => finding.kind === 'unreachable')?.fix).toContain('service workers');
    });

    it('says nothing when everything in the folder is reachable', () => {
        const clean = buildFindings(analyze(lazyBootMeta(), null), 'en', 'raw');

        expect(clean.some(finding => finding.kind === 'unreachable')).toBe(false);
    });
});

describe('buildFindings · duplicate copies', () => {
    it('gives the chain of each copy and says which one nobody asked for', () => {
        const findings = buildFindings(analyze(dupeMeta, null), 'en', 'raw');
        const dupes = findings.find(finding => finding.chip === 'duplicate copies');

        expect(dupes?.severity).toBe('mid');
        // From the signal to a place where both copies can be looked at.
        expect(dupes?.target).toEqual({ tab: 'search', key: 'dup-lib' });
        // The copy the project asks for, with the file that asks for it.
        expect(dupes?.body).toContain(
            '<strong>version 1.0.0</strong> · 20 kB · in the bootstrap. Comes in through <span class="mono">src/main.ts</span> › <span class="mono">dup-lib</span>; your own code imports it in <span class="mono">src/main.ts</span>',
        );
        // The copy it does not ask for, with what brings it in.
        expect(dupes?.body).toContain(
            '<strong>version 2.0.0</strong> · 20 kB · in the bootstrap. Comes in through <span class="mono">src/main.ts</span> › <span class="mono">vendor</span> › <span class="mono">dup-lib</span>; <span class="mono">vendor</span> imports it',
        );
        expect(dupes?.body).toContain('One of the copies is in the bootstrap');
        // And therefore the fix is to force the resolution, not to align the project package.json.
        expect(dupes?.fix).toContain('is not one you asked for');
    });
});

const snapshot = (boot: number, lazyBytes: (source: string) => number): Snapshot => ({
    tool: 'loadline',
    version: 1,
    name: 'x.json',
    date: '2026-09-01',
    mode: 'raw',
    boot,
    bootPackages: [],
    screens: ['a', 'b', 'c', 'd', 'e'].map(name => ({
        source: `src/${name}.page.ts`,
        label: name,
        total: boot + lazyBytes(name),
        shared: lazyBytes(name),
        own: 0,
    })),
});

describe('buildComparisonFindings', () => {
    it('says a shared chunk grew when nearly every screen grows by the same amount', () => {
        const before = snapshot(500 * KB, () => 200 * KB);
        const now = snapshot(500 * KB, name => (name === 'e' ? 200 * KB : 300 * KB));
        const findings = buildComparisonFindings(compare(now, before), 'en', c);

        expect(findings).toHaveLength(1);
        expect(findings[0]?.chip).toBe('shared chunk has grown');
        expect(findings[0]?.target?.tab).toBe('shared');
        expect(findings[0]?.title).toContain('4 of your 5 screens');
    });

    it('names the screen when only one grew', () => {
        const before = snapshot(500 * KB, () => 200 * KB);
        const now = snapshot(500 * KB, name => (name === 'b' ? 300 * KB : 200 * KB));
        const findings = buildComparisonFindings(compare(now, before), 'en', c);

        expect(findings.map(f => f.chip)).toEqual(['screen has grown']);
        expect(findings[0]?.target).toEqual({ tab: 'screens', key: 'src/b.page.ts' });
    });

    it('flags bootstrap growth on its own and ignores small movements', () => {
        const before = snapshot(500 * KB, () => 200 * KB);
        const bigger = buildComparisonFindings(
            compare(
                snapshot(600 * KB, () => 200 * KB),
                before,
            ),
            'en',
            c,
        );
        const tiny = buildComparisonFindings(
            compare(
                snapshot(504 * KB, () => 200 * KB),
                before,
            ),
            'en',
            c,
        );

        expect(bigger.map(f => f.chip)).toEqual(['bootstrap has grown']);
        expect(tiny).toEqual([]);
    });
});

describe('buildContextFindings', () => {
    const analysis = { bootRawBytes: 1.28 * KB * KB } as Analysis;
    const angular = readAngularJson({
        projects: {
            app: {
                projectType: 'application',
                architect: {
                    build: {
                        configurations: {
                            production: {
                                budgets: [{ type: 'initial', maximumWarning: '1MB', maximumError: '1.5MB' }],
                            },
                            preproduction: {
                                budgets: [{ type: 'initial', maximumWarning: '500kB', maximumError: '3MB' }],
                            },
                            development: {},
                        },
                        defaultConfiguration: 'production',
                    },
                },
            },
        },
    });
    const pkg = readPackageJson({
        scripts: { 'build:pre': 'ng build -c preproduction', 'build:dev': 'ng build -c development' },
    });
    const ci =
        'stages: [build]\nbuild:pre:\n  script:\n    - pnpm run build:pre\nbuild:dev:\n  script:\n    - pnpm run build:dev\n';

    it('the real case: the strictest budget lives where nobody builds, and the built one cannot fire', () => {
        const context = { angular, pkg, pipelines: [readPipeline('.gitlab-ci.yml', ci, pkg?.scripts)] };
        // The package has no zone.js: the zoneless note also comes out, as information.
        const findings = buildContextFindings(context, analysis, 'en', c).filter(f => f.severity !== 'info');

        expect(findings.map(f => f.chip)).toEqual(['budget the pipeline never applies', 'budget too high']);
        expect(findings[0]?.title).toContain('production (1.50 MB)');
        expect(findings[0]?.body).toContain('development</span> (no budget)');
        expect(findings[1]?.title).toContain('preproduction');
    });

    it('without a pipeline every budget is examined, and nothing is said about who builds', () => {
        const findings = buildContextFindings({ angular, pkg: null, pipelines: [] }, analysis, 'en', c);

        expect(findings.map(f => f.chip)).toEqual(['budget too high']);
    });

    it('two configurations with the same budget are one card, not the same sentence twice', () => {
        // The reported case: `preproduction` and `development` produced two signals that were
        // identical word for word except for the name.
        const twins = readAngularJson({
            projects: {
                app: {
                    architect: {
                        build: {
                            configurations: {
                                preproduction: { budgets: [{ type: 'initial', maximumError: '3MB' }] },
                                development: { budgets: [{ type: 'initial', maximumError: '3MB' }] },
                            },
                        },
                    },
                },
            },
        });
        const findings = buildContextFindings({ angular: twins, pkg: null, pipelines: [] }, analysis, 'en', c);

        expect(findings.map(f => f.chip)).toEqual(['budget too high']);
        expect(findings[0]?.title).toContain('preproduction');
        expect(findings[0]?.title).toContain('development');
        expect(findings[0]?.title).toContain('budgets are');
    });

    it('two configurations with different budgets stay two cards: they are two decisions', () => {
        const different = readAngularJson({
            projects: {
                app: {
                    architect: {
                        build: {
                            configurations: {
                                preproduction: { budgets: [{ type: 'initial', maximumError: '3MB' }] },
                                development: { budgets: [{ type: 'initial', maximumError: '4MB' }] },
                            },
                        },
                    },
                },
            },
        });
        const findings = buildContextFindings({ angular: different, pkg: null, pipelines: [] }, analysis, 'en', c);

        expect(findings).toHaveLength(2);
    });

    it('a budget with a warning but no error only warns', () => {
        const warnOnly = readAngularJson({
            projects: {
                app: {
                    architect: {
                        build: {
                            options: { budgets: [{ type: 'initial', maximumWarning: '1MB' }] },
                            configurations: { production: {} },
                        },
                    },
                },
            },
        });
        const findings = buildContextFindings({ angular: warnOnly, pkg: null, pipelines: [] }, analysis, 'es', c);

        expect(findings.map(f => f.chip)).toEqual(['budget que solo avisa']);
    });

    it('says the project is zoneless as information, not as a problem', () => {
        const findings = buildContextFindings({ angular: null, pkg, pipelines: [] }, analysis, 'en', c);

        expect(findings).toHaveLength(1);
        expect(findings[0]?.severity).toBe('info');
    });
});

/**
 * `kind` is what anything outside the page acts on — a bot on a merge request, the checks that read
 * builds nine frameworks wrote — so it has to name every signal that exists and nothing else. A
 * signal whose kind is missing here cannot be asserted on, and a kind with no text is a signal that
 * was deleted with its name left behind.
 */
describe('the list of signal kinds', () => {
    it('names a signal that exists, in both languages', () => {
        for (const kind of FINDING_KINDS) {
            expect(TEXT.en, `en is missing ${kind}`).toHaveProperty(kind);
            expect(TEXT.es, `es is missing ${kind}`).toHaveProperty(kind);
        }
    });

    it('leaves no signal unnamed', () => {
        // Pieces other signals are composed of, not signals: a word for the root screen, one copy
        // of a duplicated package, the zone it lands in, the line about what stays behind, and the
        // five questions named in a clause so another signal can mention them.
        const parts = new Set(['rootScreen', 'dupeCopy', 'dupeZone', 'ownInBootKept', 'situationAsks']);
        const written = Object.keys(TEXT.en).filter(key => !parts.has(key));

        const alphabetical = (a: string, b: string) => a.localeCompare(b);

        expect(written.toSorted(alphabetical)).toEqual([...FINDING_KINDS].toSorted(alphabetical));
    });
});
