/**
 * The shape the report is worst at: an application with no lazy screens at all.
 *
 * A landing page, a one-screen internal tool, a marketing site. Half of this tool's vocabulary
 * assumes there is somewhere else for code to go — "this is in the bootstrap and only one screen
 * uses it" is not a finding when there is one screen — and the failure mode is not a wrong number,
 * it is a wall of findings nobody can act on. The framework runtime and the shared utilities
 * legitimately live in the first load, and saying so eighteen times is the same as saying nothing.
 *
 * So this pins the behaviour rather than describing it: what fires on a one-screen build, and that
 * none of it is a demand to move code that has nowhere to go.
 */

import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analysis';
import { type Metafile } from '../analysis/metafile.types';
import { RECOMMENDED } from '../criteria/criteria';
import { buildFindings } from './findings';

/** One entry, one chunk, a framework and a couple of utilities. No lazy boundary anywhere. */
const landing: Metafile = {
    inputs: {
        'src/main.ts': {
            bytes: 400,
            format: 'esm',
            imports: [
                { path: 'node_modules/framework/index.js', kind: 'import-statement' },
                { path: 'src/app/format.ts', kind: 'import-statement' },
                { path: 'src/app/hero.ts', kind: 'import-statement' },
            ],
        },
        'src/app/format.ts': { bytes: 2000, format: 'esm', imports: [] },
        'src/app/hero.ts': { bytes: 30_000, format: 'esm', imports: [] },
        'node_modules/framework/index.js': { bytes: 120_000, format: 'esm', imports: [] },
    },
    outputs: {
        'dist/main.js': {
            bytes: 152_400,
            entryPoint: 'src/main.ts',
            inputs: {
                'src/main.ts': { bytesInOutput: 400 },
                'src/app/format.ts': { bytesInOutput: 2000 },
                'src/app/hero.ts': { bytesInOutput: 30_000 },
                'node_modules/framework/index.js': { bytesInOutput: 120_000 },
            },
            imports: [],
        },
    },
};

describe('a build with one screen and no lazy boundary', () => {
    const analysis = analyze(landing, null, null, new Set(['main.js']), null, RECOMMENDED.raw);
    const findings = buildFindings(analysis, 'en', 'raw', RECOMMENDED.raw);

    it('has no screens to report, and says so by having none rather than by inventing one', () => {
        expect(analysis.screens).toEqual([]);
    });

    it('does not ask for code to be moved somewhere there is nowhere to move it to', () => {
        // Every one of these is a "this belongs in a lazy chunk" claim. With no lazy chunk in the
        // build they would each be pointing at the framework runtime and at shared utilities that
        // the first screen genuinely uses, which is a demand nobody can act on.
        const moves = new Set(['bootLazy', 'ownInBoot', 'shared', 'heavy', 'twinScreens', 'dataAsCode']);

        expect(findings.filter(finding => moves.has(finding.kind))).toEqual([]);
    });

    it('is not a wall: the whole report on a one-screen build is a handful of lines', () => {
        // Not a magic number — a ceiling. A one-screen build has one real thing to say about it
        // (how much the first load weighs), and anything past a handful of cards is the report
        // padding itself out with observations about a build with no structure to observe.
        expect(findings.length).toBeLessThanOrEqual(5);
    });

    it('still says the one thing that is true: what the first load weighs', () => {
        expect(analysis.bootBytes).toBe(152_400);
    });
});
