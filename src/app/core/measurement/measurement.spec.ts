import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analysis';
import { type Metafile } from '../analysis/metafile.types';
import { contrast, readMeasurement } from './measurement';

/**
 * The same shape as `analysis.spec.ts`: a bootstrap of two chunks, two screens, one chunk shared
 * between them and one exclusive to screen A.
 */
const meta: Metafile = {
    inputs: {
        'src/main.ts': {
            bytes: 100,
            format: 'esm',
            imports: [
                { path: 'node_modules/heavy-lib/index.js', kind: 'import-statement' },
                { path: 'src/app/app.routes.ts', kind: 'import-statement' },
            ],
        },
        'src/app/app.routes.ts': {
            bytes: 50,
            format: 'esm',
            imports: [
                { path: 'src/app/a.page.ts', kind: 'dynamic-import' },
                { path: 'src/app/b.page.ts', kind: 'dynamic-import' },
            ],
        },
        'src/app/a.page.ts': { bytes: 100, format: 'esm', imports: [] },
        'src/app/b.page.ts': { bytes: 100, format: 'esm', imports: [] },
        'node_modules/heavy-lib/index.js': { bytes: 500, format: 'esm' },
    },
    outputs: {
        'dist/main.js': {
            bytes: 1000,
            entryPoint: 'src/main.ts',
            inputs: { 'src/main.ts': { bytesInOutput: 1000 } },
            imports: [
                { path: 'dist/vendor.js', kind: 'import-statement' },
                { path: 'dist/screen-a.js', kind: 'dynamic-import' },
                { path: 'dist/screen-b.js', kind: 'dynamic-import' },
            ],
        },
        'dist/vendor.js': { bytes: 500, inputs: { 'node_modules/heavy-lib/index.js': { bytesInOutput: 500 } } },
        'dist/screen-a.js': {
            bytes: 200,
            entryPoint: 'src/app/a.page.ts',
            inputs: { 'src/app/a.page.ts': { bytesInOutput: 200 } },
            imports: [
                { path: 'dist/shared.js', kind: 'import-statement' },
                { path: 'dist/only-a.js', kind: 'import-statement' },
            ],
        },
        'dist/screen-b.js': {
            bytes: 200,
            entryPoint: 'src/app/b.page.ts',
            inputs: { 'src/app/b.page.ts': { bytesInOutput: 200 } },
            imports: [{ path: 'dist/shared.js', kind: 'import-statement' }],
        },
        'dist/shared.js': { bytes: 800, inputs: { 'node_modules/ui-kit/index.js': { bytesInOutput: 800 } } },
        'dist/only-a.js': { bytes: 300, inputs: { 'node_modules/pdf/index.js': { bytesInOutput: 300 } } },
    },
};

const analysis = analyze(meta, null);

/** What the console snippet hands back, given a list of file names. */
const pasted = (files: string[], bytes = 0): string =>
    JSON.stringify({
        url: 'http://localhost:8099/',
        entries: files.map(name => ({
            name: `http://localhost:8099/${name}`,
            transferSize: bytes,
            encodedBodySize: bytes,
        })),
    });

const read = (text: string) => {
    const measurement = readMeasurement(text);
    if (typeof measurement === 'string') {
        throw new TypeError(`unexpected error: ${measurement}`);
    }
    return measurement;
};

describe('readMeasurement', () => {
    it('reads the object the snippet builds, keeping the address', () => {
        const measurement = read(pasted(['main.js', 'vendor.js']));

        expect(measurement.url).toBe('http://localhost:8099/');
        expect(measurement.entries.map(entry => entry.file)).toEqual(['main.js', 'vendor.js']);
        expect(measurement.source).toBe('json');
    });

    it('reads a bare array of resource entries, as the performance API returns it', () => {
        const measurement = read(
            JSON.stringify([{ name: 'https://app.example/assets/main-ABC.js', transferSize: 4321 }]),
        );

        expect(measurement.entries).toEqual([
            {
                file: 'main-ABC.js',
                bytes: 4321,
                url: 'https://app.example/assets/main-ABC.js',
                protocol: null,
                transferSize: 4321,
                encodedBodySize: null,
                decodedBodySize: null,
                // Four timings or none: half a timing object would be read as zeros.
                timing: null,
            },
        ]);
    });

    it('falls back to the encoded body when the transfer size is zero, which is what a cache hit reports', () => {
        const measurement = read(JSON.stringify([{ name: '/main.js', transferSize: 0, encodedBodySize: 900 }]));

        expect(measurement.entries[0]?.bytes).toBe(900);
    });

    it('scrapes file names out of anything else, so pasting the network tab also works', () => {
        const measurement = readMeasurement('main-ABC.js  200  12.3 kB\nstyles-XY.css  200  1 kB');
        if (typeof measurement === 'string') {
            throw new TypeError(measurement);
        }

        expect(measurement.source).toBe('text');
        expect(measurement.entries.map(entry => entry.file)).toEqual(['main-ABC.js', 'styles-XY.css']);
    });

    it('counts a file reported twice once: a preload and its request are one download', () => {
        const measurement = read(pasted(['main.js', 'main.js']));

        expect(measurement.entries).toHaveLength(1);
    });

    it('says which of the three things went wrong', () => {
        expect(readMeasurement(' '.repeat(3))).toBe('empty');
        expect(readMeasurement('no file names in here')).toBe('noFiles');
    });
});

describe('contrast', () => {
    it('works out which screen was measured from the chunks that came down', () => {
        const measurement = read(pasted(['main.js', 'vendor.js', 'screen-a.js', 'shared.js', 'only-a.js']));
        const report = contrast(analysis, measurement);
        if (typeof report === 'string') {
            throw new TypeError(report);
        }

        expect(report.screen?.label).toBe('a');
        expect(report.extra).toHaveLength(0);
        expect(report.missing).toHaveLength(0);
        expect(report.measured).toBe(report.computed);
    });

    it("flags a chunk of another screen as extra: the router loaded it before the guard's turn", () => {
        const measurement = read(
            pasted(['main.js', 'vendor.js', 'screen-a.js', 'shared.js', 'only-a.js', 'screen-b.js']),
        );
        const report = contrast(analysis, measurement);
        if (typeof report === 'string') {
            throw new TypeError(report);
        }

        expect(report.screen?.label).toBe('a');
        expect(report.extra.map(chunk => chunk.name)).toEqual(['screen-b.js']);
        expect(report.eager.map(screen => screen.label)).toEqual(['b']);
        // The measured figure is above the computed one by exactly that chunk.
        expect(report.measured - report.computed).toBe(200);
    });

    it('lists what was predicted and never came down', () => {
        const measurement = read(pasted(['main.js', 'vendor.js', 'screen-a.js', 'shared.js']));
        const report = contrast(analysis, measurement);
        if (typeof report === 'string') {
            throw new TypeError(report);
        }

        expect(report.missing.map(chunk => chunk.name)).toEqual(['only-a.js']);
    });

    it('attributes the measurement to the screen it is told to, over its own guess', () => {
        const measurement = read(pasted(['main.js', 'vendor.js', 'screen-a.js', 'shared.js', 'only-a.js']));
        const report = contrast(analysis, measurement, 'src/app/b.page.ts');
        if (typeof report === 'string') {
            throw new TypeError(report);
        }

        expect(report.screen?.label).toBe('b');
        expect(report.picked).toBe(true);
        expect(report.extra.map(chunk => chunk.name).toSorted((a, b) => a.localeCompare(b))).toEqual([
            'only-a.js',
            'screen-a.js',
        ]);
        expect(report.missing.map(chunk => chunk.name)).toEqual(['screen-b.js']);
    });

    it('gives no screen when only the bootstrap came down, which is the right answer', () => {
        const measurement = read(pasted(['main.js', 'vendor.js']));
        const report = contrast(analysis, measurement);
        if (typeof report === 'string') {
            throw new TypeError(report);
        }

        expect(report.screen).toBeNull();
        expect(report.computed).toBe(analysis.bootBytes);
        expect(report.extra).toHaveLength(0);
    });

    it('separates a stranger from something that is simply not counted', () => {
        const measurement = read(pasted(['main.js', 'vendor.js', 'styles.css', 'other-app.js']));
        const report = contrast(analysis, measurement);
        if (typeof report === 'string') {
            throw new TypeError(report);
        }

        expect(report.foreign).toEqual(['other-app.js']);
        expect(report.otherFiles).toBe(1);
    });

    it('refuses a measurement of a different build instead of showing an empty table', () => {
        const measurement = read(pasted(['main-OTHERHASH.js', 'vendor-OTHERHASH.js']));

        expect(contrast(analysis, measurement)).toBe('noMatch');
    });

    it('adds up what the browser said each file cost over the wire', () => {
        const measurement = read(pasted(['main.js', 'vendor.js'], 1000));
        const report = contrast(analysis, measurement);
        if (typeof report === 'string') {
            throw new TypeError(report);
        }

        expect(report.transferred).toBe(2000);
    });
});
