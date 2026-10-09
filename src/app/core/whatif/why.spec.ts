import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analysis';
import { type Metafile } from '../analysis/metafile.types';
import { explainWhy } from './why';

/**
 * `main` imports a service that imports `teams-js` directly, and `sdk` that pulls `inner` in on its
 * own; screen A lazily imports `pdf`. Enough for every answer: a cut on the target, a cut on the
 * package in between, a chain behind a lazy boundary, an orphan, and a name that is not there.
 */
const meta: Metafile = {
    inputs: {
        'src/main.ts': {
            bytes: 100,
            imports: [
                { path: 'src/app/teams.service.ts', kind: 'import-statement' },
                { path: 'node_modules/sdk/index.js', kind: 'import-statement' },
                { path: 'src/app/a.page.ts', kind: 'dynamic-import' },
            ],
        },
        'src/app/teams.service.ts': {
            bytes: 50,
            imports: [{ path: 'node_modules/teams-js/index.js', kind: 'import-statement' }],
        },
        'node_modules/teams-js/index.js': { bytes: 500 },
        'node_modules/sdk/index.js': {
            bytes: 200,
            imports: [{ path: 'node_modules/inner/index.js', kind: 'import-statement' }],
        },
        'node_modules/inner/index.js': { bytes: 300 },
        'src/app/a.page.ts': {
            bytes: 100,
            imports: [{ path: 'node_modules/pdf/dist/pdf.js', kind: 'import-statement' }],
        },
        'node_modules/pdf/dist/pdf.js': { bytes: 400 },
        'src/app/orphan.ts': { bytes: 70 },
    },
    outputs: {
        'dist/main.js': {
            bytes: 1150,
            entryPoint: 'src/main.ts',
            inputs: {
                'src/main.ts': { bytesInOutput: 100 },
                'src/app/teams.service.ts': { bytesInOutput: 50 },
                'node_modules/teams-js/index.js': { bytesInOutput: 500 },
                'node_modules/sdk/index.js': { bytesInOutput: 200 },
                'node_modules/inner/index.js': { bytesInOutput: 300 },
            },
            imports: [{ path: 'dist/screen-a.js', kind: 'dynamic-import' }],
        },
        'dist/screen-a.js': {
            bytes: 500,
            entryPoint: 'src/app/a.page.ts',
            inputs: {
                'src/app/a.page.ts': { bytesInOutput: 100 },
                'node_modules/pdf/dist/pdf.js': { bytesInOutput: 400 },
            },
        },
        'dist/orphan.js': { bytes: 70, inputs: { 'src/app/orphan.ts': { bytesInOutput: 70 } } },
    },
};

const analysis = analyze(meta, null);

describe('explainWhy', () => {
    it('cuts a package where your own file imports it, with the --what-if saving', () => {
        const why = explainWhy(analysis, 'teams-js');
        expect(why.reach).toBe('boot');
        expect(why.steps).toEqual(['src/main.ts', 'src/app/teams.service.ts', 'teams-js']);
        expect(why.cut).toBe('src/app/teams.service.ts');
        expect(why.via).toBe('teams-js');
        expect(why.saves).toBe(why.defer.saved);
        expect(why.saves).toBe(500);
    });

    it('names the package that pulls a transitive one in, and what deferring that saves', () => {
        // No import of `inner` in main.ts would move it: `sdk` brings it, so `sdk` is what is cut.
        const why = explainWhy(analysis, 'inner');
        expect(why.cut).toBe('src/main.ts');
        expect(why.via).toBe('sdk');
        expect(why.saves).toBe(500);
    });

    /**
     * Angular RealWorld: an `import()` of the router in `app.component.ts` was promised ≈23 kB,
     * and five more files of the first load import the router statically.
     */
    it('says a cut in one file saves nothing when other files of the first load import it too', () => {
        const shared: Metafile = {
            inputs: {
                ...meta.inputs,
                'src/main.ts': {
                    bytes: 100,
                    imports: [
                        { path: 'src/app/teams.service.ts', kind: 'import-statement' },
                        { path: 'src/app/header.ts', kind: 'import-statement' },
                    ],
                },
                'src/app/header.ts': {
                    bytes: 30,
                    imports: [{ path: 'node_modules/teams-js/index.js', kind: 'import-statement' }],
                },
            },
            outputs: {
                'dist/main.js': {
                    bytes: 680,
                    entryPoint: 'src/main.ts',
                    inputs: {
                        'src/main.ts': { bytesInOutput: 100 },
                        'src/app/teams.service.ts': { bytesInOutput: 50 },
                        'src/app/header.ts': { bytesInOutput: 30 },
                        'node_modules/teams-js/index.js': { bytesInOutput: 500 },
                    },
                },
            },
        };
        const why = explainWhy(analyze(shared, null), 'teams-js');

        expect(why.saves).toBe(0);
        expect(why.alsoIn).toEqual(['src/app/header.ts']);
        expect(why.savesEverywhere).toBe(500);
    });

    it('says a file behind an import() is already out of the first load', () => {
        const why = explainWhy(analysis, 'pdf');
        expect(why.reach).toBe('lazy');
        expect(why.steps).toEqual(['src/main.ts', 'src/app/a.page.ts', 'pdf']);
    });

    it('tells a file nothing reaches from a name that is not there', () => {
        expect(explainWhy(analysis, 'src/app/orphan.ts').reach).toBe('unreached');
        expect(explainWhy(analysis, 'left-pad').reach).toBe('absent');
    });

    it('does not answer "absent" when the chunks cannot be seen into', () => {
        const opaque = analyze(
            { inputs: {}, outputs: { 'index-A.js': { bytes: 900, entryPoint: 'index-A.js' } } },
            null,
        );
        expect(explainWhy(opaque, 'teams-js').reach).toBe('unknown');
    });

    it('does not answer "unreached" for a build that never said who imports what', () => {
        // A build folder read alone: its maps put `teams-js` in the bootstrap and say nothing of
        // the file that imports it, so neither the chain nor the saving can be worked out.
        const why = explainWhy(analysis, 'teams-js', false);
        expect(why.reach).toBe('unchained');
        expect(why.steps).toEqual([]);
        expect(why.defer.measurable).toBe(false);
        expect(why.defer.weight).toBe(500);
        expect(explainWhy(analysis, 'left-pad', false).reach).toBe('absent');
    });
});
