import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analysis';
import { type Metafile } from '../analysis/metafile.types';
import { type Build, compareBuilds } from './compare-builds';

/**
 * One application. `pkgPath` lets the same shape be built with two different installed layouts, so
 * the version half can be exercised: pnpm writes the version into the path, npm does not.
 */
const app = (options: {
    entry: string;
    /** A file and a package this application has and the other one does not. */
    alone?: boolean;
    angularBytes: number;
    pkgPath?: (pkg: string, file: string) => string;
}): Metafile => {
    const at = options.pkgPath ?? ((pkg, file) => `node_modules/${pkg}/${file}`);
    const angular = at('@angular/core', 'index.mjs');

    const inputs: Metafile['inputs'] = {
        [options.entry]: {
            bytes: 100,
            format: 'esm',
            imports: [
                { path: angular, kind: 'import-statement' },
                { path: 'src/shared/format.ts', kind: 'import-statement' },
            ],
        },
        [angular]: { bytes: options.angularBytes, format: 'esm' },
        'src/shared/format.ts': { bytes: 300, format: 'esm' },
    };

    const chunkInputs: Record<string, { bytesInOutput: number }> = {
        [options.entry]: { bytesInOutput: 100 },
        [angular]: { bytesInOutput: options.angularBytes },
        'src/shared/format.ts': { bytesInOutput: 300 },
    };

    if (options.alone) {
        const only = at('only-here', 'index.js');
        inputs[only] = { bytes: 200, format: 'esm' };
        inputs['src/shell-only.ts'] = { bytes: 90, format: 'esm' };
        inputs[options.entry]?.imports?.push(
            { path: only, kind: 'import-statement' },
            { path: 'src/shell-only.ts', kind: 'import-statement' },
        );
        chunkInputs[only] = { bytesInOutput: 200 };
        chunkInputs['src/shell-only.ts'] = { bytesInOutput: 90 };
    }

    return {
        inputs,
        outputs: {
            'dist/main.js': {
                bytes: Object.values(chunkInputs).reduce((sum, input) => sum + input.bytesInOutput, 0),
                entryPoint: options.entry,
                inputs: chunkInputs,
            },
        },
    };
};

const buildOf = (name: string, meta: Metafile): Build => ({ name, analysis: analyze(meta, null) });

const shell = buildOf('shell', app({ entry: 'src/shell.ts', angularBytes: 1000, alone: true }));
const remote = buildOf('remote', app({ entry: 'src/remote.ts', angularBytes: 800 }));

describe('compareBuilds', () => {
    it('is not a comparison with one application', () => {
        const report = compareBuilds([shell]);

        // The totals still come out: naming what was loaded is not the same as crossing it.
        expect(report.totals).toHaveLength(1);
        expect(report.shared).toEqual([]);
        expect(report.duplicatedBytes).toBe(0);
    });

    it('weighs each application on its own row', () => {
        expect(compareBuilds([shell, remote]).totals).toEqual([
            { name: 'shell', boot: 1690, screens: 0, total: 1690 },
            { name: 'remote', boot: 1200, screens: 0, total: 1200 },
        ]);
    });

    /**
     * The figure the whole view exists for. Everything **past the largest copy**, never the sum:
     * one copy of a dependency is not waste, it is the dependency.
     */
    it('counts the extra copies and not the total, which is what a shared package would save', () => {
        const angular = compareBuilds([shell, remote]).shared.find(entry => entry.name === '@angular/core');

        expect(angular).toMatchObject({ builds: 2, bytes: [1000, 800], inBoot: 2 });
        expect(angular?.duplicatedBytes).toBe(800);
    });

    it('leaves out what only one of them ships', () => {
        const report = compareBuilds([shell, remote]);

        expect(report.shared.map(entry => entry.name)).not.toContain('only-here');
        expect(report.ownFiles.map(entry => entry.path)).not.toContain('src/shell-only.ts');
    });

    it('names the own code both of them ship, which is the other half of the question', () => {
        expect(compareBuilds([shell, remote]).ownFiles).toEqual([
            { path: 'src/shared/format.ts', builds: 2, bytes: 300, duplicatedBytes: 300 },
        ]);
    });

    it('calls out the framework, which is the expensive case', () => {
        const report = compareBuilds([shell, remote]);

        expect(report.frameworks.map(entry => entry.name)).toEqual(['@angular/core']);
        // The ceiling: the extra copy of the framework plus the extra copy of the shared file.
        expect(report.duplicatedBytes).toBe(1100);
    });

    /**
     * An empty version column has two meanings and only one of them is a finding. Saying "they
     * agree" when nothing was read would be the dangerous one.
     */
    it('admits it could not read the versions rather than reporting agreement', () => {
        const report = compareBuilds([shell, remote]);

        expect(report.versionsKnown).toBe(false);
        expect(report.diverging).toEqual([]);
    });

    it('reads the versions from a pnpm layout and reports the ones that disagree', () => {
        const pnpm = (version: string) => (pkg: string, file: string) =>
            `node_modules/.pnpm/${pkg.replace('/', '+')}@${version}/node_modules/${pkg}/${file}`;

        const report = compareBuilds([
            buildOf('shell', app({ entry: 'src/shell.ts', angularBytes: 1000, pkgPath: pnpm('19.0.0') })),
            buildOf('remote', app({ entry: 'src/remote.ts', angularBytes: 800, pkgPath: pnpm('18.2.0') })),
        ]);

        expect(report.versionsKnown).toBe(true);
        expect(report.diverging.map(entry => entry.name)).toContain('@angular/core');
        expect(report.diverging.find(entry => entry.name === '@angular/core')?.versions).toEqual(['18.2.0', '19.0.0']);
    });
});
