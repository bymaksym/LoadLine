import { describe, expect, it } from 'vitest';
import { type Metafile } from '../src/app/core/analysis/metafile.types';
import { EMPTY_CONTEXT } from '../src/app/core/project/project-context';
import { parseArgs } from './args';
import { type Options } from './args.types';
import { anyGate, checkGates, violationLines } from './gates';
import { buildReport } from './report';
import { type CliReport } from './report.types';

/**
 * A bootstrap of 1500 bytes and two screens reached through a dynamic import, one of them with a chunk
 * only it loads. Enough for every gate to have something to bite on.
 */
const meta: Metafile = {
    inputs: {
        'src/main.ts': { bytes: 100, format: 'esm', imports: [{ path: 'src/routes.ts', kind: 'import-statement' }] },
        'src/routes.ts': {
            bytes: 50,
            format: 'esm',
            imports: [
                { path: 'src/a.page.ts', kind: 'dynamic-import' },
                { path: 'src/b.page.ts', kind: 'dynamic-import' },
            ],
        },
        'src/a.page.ts': { bytes: 100, format: 'esm', imports: [] },
        'src/b.page.ts': { bytes: 100, format: 'esm', imports: [] },
    },
    outputs: {
        'dist/main.js': {
            bytes: 1500,
            entryPoint: 'src/main.ts',
            inputs: { 'src/main.ts': { bytesInOutput: 1500 } },
            imports: [
                { path: 'dist/a.js', kind: 'dynamic-import' },
                { path: 'dist/b.js', kind: 'dynamic-import' },
            ],
        },
        'dist/a.js': {
            bytes: 400,
            entryPoint: 'src/a.page.ts',
            inputs: { 'src/a.page.ts': { bytesInOutput: 400 } },
            imports: [{ path: 'dist/only-a.js', kind: 'import-statement' }],
        },
        'dist/b.js': {
            bytes: 200,
            entryPoint: 'src/b.page.ts',
            inputs: { 'src/b.page.ts': { bytesInOutput: 200 } },
        },
        'dist/only-a.js': { bytes: 300, inputs: { 'src/a.page.ts': { bytesInOutput: 300 } } },
    },
};

const options = (...argv: string[]): Options => {
    const parsed = parseArgs(['stats.json', ...argv]);
    if (!parsed.ok) {
        throw new Error(parsed.message);
    }
    return parsed.options;
};

const reportWith = (opts: Options): CliReport =>
    buildReport(
        {
            meta,
            statsName: 'stats.json',
            gzip: null,
            brotli: null,
            splits: null,
            baseline: null,
            context: EMPTY_CONTEXT,
            criteria: null,
        },
        opts,
    );

describe('checkGates', () => {
    it('nothing is checked when nothing was asked for', () => {
        const opts = options();

        expect(anyGate(opts.gates)).toBe(false);
        expect(checkGates(reportWith(opts), opts.gates)).toEqual([]);
    });

    it('the bootstrap is checked once, on its own', () => {
        const opts = options('--max-boot', '1000');
        const violations = checkGates(reportWith(opts), opts.gates);

        expect(violations).toHaveLength(1);
        expect(violations[0]?.gate).toBe('boot');
        expect(violations[0]?.actual).toBe(1500);
        expect(violations[0]?.subject).toBeNull();
    });

    it('the threshold itself passes: a gate fires above it, not at it', () => {
        const opts = options('--max-boot', '1500');

        expect(checkGates(reportWith(opts), opts.gates)).toEqual([]);
    });

    it('a screen gate names the screen it is about', () => {
        const opts = options('--max-screen', '1800');
        const violations = checkGates(reportWith(opts), opts.gates);

        // A totals 1500 + 400 + 300, B totals 1500 + 200: only A is over.
        expect(violations.map(violation => violation.subject)).toEqual(['a']);
    });

    it('own code is checked apart from the total, because the bootstrap is not the screen fault', () => {
        const opts = options('--max-own', '500');
        const violations = checkGates(reportWith(opts), opts.gates);

        expect(violations.map(violation => violation.gate)).toEqual(['own']);
        expect(violations[0]?.actual).toBe(700);
    });

    it('--fail-on turns the signals into one gate, not one per signal', () => {
        const opts = options('--fail-on', 'mid');
        const report = reportWith(opts);
        const violations = checkGates(report, opts.gates);
        const raised = report.findings.filter(f => f.severity === 'high' || f.severity === 'mid').length;

        expect(violations.filter(violation => violation.gate === 'signals')).toHaveLength(raised > 0 ? 1 : 0);
    });

    it('growth gates stay quiet without a baseline: there is nothing to grow against', () => {
        const opts = options('--max-growth', '1');

        expect(checkGates(reportWith(opts), opts.gates)).toEqual([]);
    });
});

describe('violationLines', () => {
    /**
     * It used to print the worst three of each gate and "…and 4 more". Somebody reading a CI log to
     * find out what broke has to be able to read what broke, all of it.
     */
    it('names every screen that broke a gate, not the worst few', () => {
        const many = Array.from({ length: 7 }, (_unused, index) => ({
            gate: 'screen' as const,
            subject: `screen-${index}`,
            limit: 10,
            actual: 20,
            message: `screen-${index} is over.`,
        }));

        expect(violationLines(many)).toHaveLength(7);
    });

    it('groups by gate, so the same limit broken twenty times reads as one thing', () => {
        const lines = violationLines([
            { gate: 'boot', subject: null, limit: 1, actual: 2, message: 'boot' },
            { gate: 'signals', subject: null, limit: 0, actual: 3, message: 'signals' },
            { gate: 'boot', subject: null, limit: 1, actual: 4, message: 'boot again' },
        ]);

        expect(lines).toEqual(['boot', 'boot again', 'signals']);
    });
});
