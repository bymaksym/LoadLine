/**
 * The one check that can catch the tool being wrong about a build it has never seen.
 *
 * Every other test compares Loadline against a fixture somebody wrote, so it only ever catches a
 * change to Loadline. This compares Loadline against **the compiler**: the bootstrap is worked out
 * twice, by two paths that share no code, and the two answers have to be the same set.
 *
 * - One path walks the import graph out from the entry chunk (`analyze`), following static edges.
 * - The other reads what the build wrote into `index.html` — the entry script and the
 *   `modulepreload` links — and closes that set under static imports.
 *
 * Neither can be derived from the other: the first knows nothing about the page, and the page names
 * only the chunks the browser is told to fetch early, not the ones it discovers by parsing. When
 * they disagree, something about the shape of the output changed — which is exactly the failure
 * that has happened before and that shows up as a report full of confident wrong numbers rather
 * than as an error.
 *
 * It is a check, not a signal: the answer is about Loadline, not about the build, so it never
 * reaches the report. The command runs it with `--self-check` and the pipeline fails on it.
 */

import { baseName } from '../format/format.utils';
import { wavesFrom } from './delivery';
import { type Metafile } from './metafile.types';

/** Chunk names, in a fixed order: what is being read is a diff, and a diff has to be stable. */
const byName = (a: string, b: string): number => a.localeCompare(b);

export interface BootCheck {
    /** Chunks the import graph calls bootstrap that the page's own closure never reaches. */
    onlyInGraph: string[];
    /**
     * Chunks the page's closure reaches that the import graph does not call bootstrap and does not
     * give to any screen either: chunks it cannot place at all. A handful of them is a page-level
     * import the reader cannot follow; a pile of them is the build having changed shape.
     */
    onlyInPage: string[];
    /**
     * Chunks the page announces that the graph calls a screen's, rather than everybody's.
     *
     * A build that prerenders one page per route — SvelteKit with the static adapter, and every
     * static site generator — writes into each page the chunks of *that* route, so index.html is
     * the home route's page and not the shell of the application. Those chunks are a real early
     * fetch and they are not the bootstrap, so they are named on their own instead of being read
     * as the two answers disagreeing.
     */
    preloadedRoutes: string[];
    /** Chunks both paths agree on. A check that agreed on nothing is not a passing check. */
    agreed: number;
}

/**
 * How much of what the page announces may be unplaceable before the two readings are telling
 * different stories: one chunk in five of what they agreed on.
 *
 * There is a case where the page names a chunk the graph cannot place and nothing is wrong: a
 * dynamic import whose specifier is built at run time. VitePress writes one per page — the page's
 * own data — and no reader of files can follow it, so a strict check was red on every VitePress
 * site there is. A whole build changing shape does not look like that: it does not move one chunk
 * out of ten, it moves most of them.
 */
const UNPLACED_SHARE = 5;

export const isSameBoot = (check: BootCheck): boolean =>
    check.onlyInGraph.length === 0 && check.agreed > 0 && check.onlyInPage.length * UNPLACED_SHARE <= check.agreed;

/**
 * The two answers, compared.
 *
 * @param announced   file names `index.html` tells the browser to fetch, as `announcedIn` gives them
 * @param screenChunks lazy chunks the analysis attributes to screens, to tell a route chunk the
 *                     page preloads from a bootstrap chunk one of the two readers got wrong
 * @returns `null` when the page names no chunk of this build: there is no second path to compare
 *          against, and reporting agreement between one answer and nothing would be the worst
 *          possible outcome of a check.
 */
export const checkBoot = (
    outputs: Metafile['outputs'],
    bootChunks: readonly string[],
    announced: ReadonlySet<string>,
    screenChunks: ReadonlySet<string> = new Set(),
): BootCheck | null => {
    const seeds = Object.keys(outputs).filter(file => announced.has(baseName(file)));
    if (seeds.length === 0) {
        return null;
    }

    // Same walk the round trips use, run from the page instead of from the entry chunk. What comes
    // back is every chunk the browser ends up holding before it navigates anywhere: the bootstrap.
    const fromPage = new Set(wavesFrom(outputs, seeds).keys());
    const fromGraph = new Set(bootChunks);

    return {
        onlyInGraph: [...fromGraph].filter(chunk => !fromPage.has(chunk)).toSorted(byName),
        onlyInPage: [...fromPage].filter(chunk => !fromGraph.has(chunk) && !screenChunks.has(chunk)).toSorted(byName),
        preloadedRoutes: [...fromPage]
            .filter(chunk => !fromGraph.has(chunk) && screenChunks.has(chunk))
            .toSorted(byName),
        agreed: [...fromGraph].filter(chunk => fromPage.has(chunk)).length,
    };
};
