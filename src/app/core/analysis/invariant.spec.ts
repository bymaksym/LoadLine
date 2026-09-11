import { describe, expect, it } from 'vitest';
import { analyze } from './analysis';
import { checkBoot, isSameBoot } from './invariant';
import { type Metafile } from './metafile.types';

/**
 * A build with two bootstrap chunks, one of which the page names and the other of which it only
 * reaches through a static import, plus a lazy screen that neither path should ever pick up.
 */
const BUILD: Metafile = {
    inputs: {
        'src/main.ts': { bytes: 400, imports: [{ path: 'src/app/screen.page.ts', kind: 'dynamic-import' }] },
        'src/app/theme.ts': { bytes: 900 },
        'src/app/screen.page.ts': { bytes: 700 },
    },
    outputs: {
        'main-AAA.js': {
            bytes: 400,
            entryPoint: 'src/main.ts',
            imports: [
                { path: 'chunk-THEME-BBB.js', kind: 'import-statement' },
                { path: 'screen-CCC.js', kind: 'dynamic-import' },
            ],
            inputs: { 'src/main.ts': { bytesInOutput: 400 } },
        },
        'chunk-THEME-BBB.js': { bytes: 900, inputs: { 'src/app/theme.ts': { bytesInOutput: 900 } } },
        'screen-CCC.js': {
            bytes: 700,
            entryPoint: 'src/app/screen.page.ts',
            inputs: { 'src/app/screen.page.ts': { bytesInOutput: 700 } },
        },
    },
};

const bootOf = (meta: Metafile): string[] => analyze(meta, null).bootChunks;

describe('checkBoot', () => {
    it('agrees when the page and the graph describe the same build', () => {
        const check = checkBoot(BUILD.outputs, bootOf(BUILD), new Set(['main-AAA.js']));

        expect(check).toEqual({ onlyInGraph: [], onlyInPage: [], preloadedRoutes: [], agreed: 2 });
        expect(isSameBoot(check!)).toBe(true);
    });

    it('says which side is missing a chunk when the two disagree', () => {
        // The graph says three chunks are bootstrap; the page only ever leads to two of them.
        const check = checkBoot(BUILD.outputs, [...bootOf(BUILD), 'screen-CCC.js'], new Set(['main-AAA.js']));

        expect(check?.onlyInGraph).toEqual(['screen-CCC.js']);
        expect(check?.onlyInPage).toEqual([]);
        expect(isSameBoot(check!)).toBe(false);
    });

    it('catches the other direction too: a chunk the page reaches and the graph left out', () => {
        const check = checkBoot(BUILD.outputs, ['main-AAA.js'], new Set(['main-AAA.js']));

        expect(check?.onlyInPage).toEqual(['chunk-THEME-BBB.js']);
        expect(isSameBoot(check!)).toBe(false);
    });

    /**
     * A build that prerenders one page per route writes that route's chunks into its page, so
     * index.html announces more than the bootstrap. Reading that as the two answers disagreeing
     * made `--self-check` permanently red for every SvelteKit build, which is a check nobody keeps.
     */
    it('a route chunk the page preloads is named, not counted as a disagreement', () => {
        const announced = new Set(['main-AAA.js', 'screen-CCC.js']);
        const check = checkBoot(BUILD.outputs, bootOf(BUILD), announced, new Set(['screen-CCC.js']));

        expect(check?.preloadedRoutes).toEqual(['screen-CCC.js']);
        expect(check?.onlyInPage).toEqual([]);
        expect(isSameBoot(check!)).toBe(true);
    });

    /**
     * A page can name a chunk the graph cannot place and nothing be wrong: a dynamic import whose
     * path is built at run time — VitePress writes one per page — is invisible to a reader of
     * files. One of those among ten agreed chunks is not the build changing shape; the check said
     * it was, and was red on every VitePress site there is.
     */
    it('tolerates a chunk it cannot place while it is a small share of the agreement', () => {
        const wide: Metafile = { inputs: BUILD.inputs, outputs: { ...BUILD.outputs } };
        for (let index = 0; index < 10; index++) {
            wide.outputs[`extra-${index}.js`] = { bytes: 10, inputs: {} };
            wide.outputs['main-AAA.js']!.imports!.push({ path: `extra-${index}.js`, kind: 'import-statement' });
        }

        const announced = new Set(['main-AAA.js', 'screen-CCC.js']);
        const check = checkBoot(wide.outputs, bootOf(wide), announced);

        expect(check?.onlyInPage).toEqual(['screen-CCC.js']);
        expect(isSameBoot(check!)).toBe(true);
    });

    /**
     * The failure this check exists to avoid is a green step that checked nothing, so a page naming
     * no chunk of the build is not "they agree": it is no answer at all.
     */
    it('returns nothing when the page names no chunk of this build', () => {
        expect(checkBoot(BUILD.outputs, bootOf(BUILD), new Set(['main-FROM-ANOTHER-BUILD.js']))).toBeNull();
    });
});
