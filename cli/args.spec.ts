import { describe, expect, it } from 'vitest';
import { parseArgs } from './args';
import { type Options } from './args.types';

const KB = 1024;

/** Parses and fails the test if the arguments were rejected: most cases are about the result. */
const parse = (...argv: string[]): Options => {
    const parsed = parseArgs(argv);
    if (!parsed.ok) {
        throw new Error(parsed.message);
    }
    return parsed.options;
};

const reject = (...argv: string[]): string => {
    const parsed = parseArgs(argv);
    return parsed.ok ? '' : parsed.message;
};

describe('parseArgs', () => {
    it('takes what is being analysed as the only positional argument', () => {
        expect(parse('dist/app/stats.json').target).toBe('dist/app/stats.json');
        // A folder is just as valid a target: what it is gets decided when it is read, not here.
        expect(parse('dist/app/browser').target).toBe('dist/app/browser');
        expect(reject()).toContain('Missing the stats.json');
        expect(reject('one.json', 'two.json')).toContain('two.json');
    });

    /**
     * The other half of `--baseline`. Without it that half only worked for the builds that write a
     * `stats.json`: everything read as a folder could be compared against a baseline and had no way
     * of producing one outside the browser.
     */
    it('takes where to write this build as the next run’s baseline', () => {
        expect(parse('dist', '--export', 'loadline-baseline.json').export).toBe('loadline-baseline.json');
        expect(parse('dist').export).toBeNull();
        // A flag that takes a value and was given none is a typo, not a switch.
        expect(reject('dist', '--export')).toContain('--export');
    });

    it('reads a flag the same written with a space or with an equals sign', () => {
        expect(parse('s.json', '--dist', 'dist/browser').dist).toBe('dist/browser');
        expect(parse('s.json', '--dist=dist/browser').dist).toBe('dist/browser');
    });

    it('sizes take the units the Angular budgets are written in', () => {
        expect(parse('s.json', '--max-boot', '350kB').gates.maxBoot).toBe(350 * KB);
        expect(parse('s.json', '--max-screen', '1.5MB').gates.maxScreen).toBe(1.5 * KB * KB);
        expect(parse('s.json', '--max-own', '2048').gates.maxOwn).toBe(2048);
        expect(reject('s.json', '--max-boot', 'big')).toContain('--max-boot');
    });

    it('a percentage is kept as the fraction the code compares against', () => {
        expect(parse('s.json', '--max-growth-pct', '10').gates.maxGrowthRatio).toBeCloseTo(0.1);
        expect(parse('s.json', '--max-growth-pct', '7.5%').gates.maxGrowthRatio).toBeCloseTo(0.075);
    });

    it('rejects a value outside the list instead of falling back to the default', () => {
        expect(reject('s.json', '--mode', 'zopfli')).toContain('--mode');
        expect(reject('s.json', '--lang', 'fr')).toContain('--lang');
        expect(reject('s.json', '--format', 'xml')).toContain('--format');
        expect(reject('s.json', '--fail-on', 'low')).toContain('--fail-on');
    });

    it('a flag with no value is an error, not a flag that swallows the next one', () => {
        expect(reject('s.json', '--dist')).toContain('needs a value');
    });

    it('an unknown flag is named rather than taken as the stats.json', () => {
        expect(reject('s.json', '--max-bootstrap', '100kB')).toContain('--max-bootstrap');
    });

    it('--help and --version do not need a stats.json', () => {
        expect(parse('--help').help).toBe(true);
        expect(parse('-V').version).toBe(true);
    });

    it('no gate is asked for by default: the run reports and never fails', () => {
        const gates = parse('s.json').gates;

        expect(gates.failOn).toBe('none');
        expect([gates.maxBoot, gates.maxScreen, gates.maxOwn, gates.maxGrowth, gates.maxGrowthRatio]).toEqual([
            null,
            null,
            null,
            null,
            null,
        ]);
    });
});
