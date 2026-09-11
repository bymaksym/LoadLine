import { describe, expect, it } from 'vitest';
import { analyze } from './analysis';
import { type Metafile } from './metafile.types';
import { whyHere } from './why-here';

/**
 * `main` statically imports `heavy-lib` through a barrel; screen A lazily imports `pdf`. Enough for
 * the three answers this has to give: a chain over static imports, a chain that crosses a lazy
 * boundary, and nothing at all for a file nothing reaches.
 */
const meta: Metafile = {
    inputs: {
        'src/main.ts': {
            bytes: 100,
            format: 'esm',
            imports: [
                { path: 'src/app/shared/index.ts', kind: 'import-statement' },
                { path: 'src/app/a.page.ts', kind: 'dynamic-import' },
            ],
        },
        'src/app/shared/index.ts': {
            bytes: 50,
            format: 'esm',
            imports: [{ path: 'node_modules/heavy-lib/index.js', kind: 'import-statement' }],
        },
        'src/app/a.page.ts': {
            bytes: 100,
            format: 'esm',
            imports: [{ path: 'node_modules/pdf/dist/pdf.js', kind: 'import-statement' }],
        },
        'node_modules/heavy-lib/index.js': { bytes: 500, format: 'esm' },
        'node_modules/pdf/dist/pdf.js': { bytes: 400, format: 'esm' },
        // In the build and imported by nothing reachable: a chunk built by a path at run time.
        'src/app/orphan.ts': { bytes: 70, format: 'esm' },
    },
    outputs: {
        'dist/main.js': {
            bytes: 650,
            entryPoint: 'src/main.ts',
            inputs: {
                'src/main.ts': { bytesInOutput: 100 },
                'src/app/shared/index.ts': { bytesInOutput: 50 },
                'node_modules/heavy-lib/index.js': { bytesInOutput: 500 },
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
        'dist/orphan.js': {
            bytes: 70,
            inputs: { 'src/app/orphan.ts': { bytesInOutput: 70 } },
        },
    },
};

const analysis = analyze(meta, null);

describe('whyHere', () => {
    it('follows the chain to a file asked for by its metafile path', () => {
        expect(whyHere(analysis, 'src/app/shared/index.ts')?.steps).toEqual(['src/main.ts', 'src/app/shared/index.ts']);
    });

    /**
     * The reason this exists at all. The tree and the folder views draw a package file by its
     * label — `heavy-lib/index.js`, with the `node_modules/` prefix stripped — and asking the graph
     * about that label finds nothing, because the graph is keyed by the metafile's input paths.
     */
    it('resolves the name a package file is drawn under, not only its real path', () => {
        const found = whyHere(analysis, 'heavy-lib/index.js');

        expect(found?.path).toBe('node_modules/heavy-lib/index.js');
        expect(found?.steps).toEqual(['src/main.ts', 'src/app/shared/index.ts', 'heavy-lib']);
    });

    it('crosses a lazy boundary, which is what makes it answerable from a screen', () => {
        expect(whyHere(analysis, 'pdf/dist/pdf.js')?.steps).toEqual(['src/main.ts', 'src/app/a.page.ts', 'pdf']);
    });

    /**
     * Two different silences, and the caller has to be able to tell them apart: this one is "it is
     * in the build and nothing reaches it", which is a finding of its own.
     */
    it('says nothing for a file nothing reachable imports', () => {
        expect(whyHere(analysis, 'src/app/orphan.ts')).toBeNull();
    });

    it('says nothing for a name that is not in this build', () => {
        expect(whyHere(analysis, 'src/app/does-not-exist.ts')).toBeNull();
    });
});
