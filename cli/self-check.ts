/**
 * `--self-check`: the pipeline asking whether Loadline still understands the shape of this build.
 *
 * It is not about the bundle. Everything else the command prints is a fact about the application;
 * this is a fact about the tool, so it prints on its own and decides the exit code on its own.
 *
 * What it compares is in `core/analysis/invariant.ts`. What is here is how it reads and when it
 * fails: a check that could not run is a failure too, because a green step that checked nothing is
 * the failure mode this whole thing exists to remove.
 */

import { type Analysis } from '../src/app/core/analysis/analysis.types';
import { checkBoot, isSameBoot } from '../src/app/core/analysis/invariant';
import { type Metafile } from '../src/app/core/analysis/metafile.types';
import { ERROR_TEXT, type ErrorStrings } from './text/text-errors';

export interface SelfCheckResult {
    ok: boolean;
    report: string;
    /**
     * `false` when the check could not run at all — no page to compare against. That is the files
     * not being usable, exit 2, not the two readers disagreeing, exit 1: a pipeline told "the build
     * changed shape" for a missing `--dist` goes looking in the wrong place.
     */
    ran: boolean;
}

const list = (chunks: readonly string[]): string => chunks.map(chunk => `    ${chunk}`).join('\n');

export const selfCheck = (
    meta: Metafile,
    analysis: Analysis,
    announced: ReadonlySet<string> | null,
    t: ErrorStrings = ERROR_TEXT.en,
): SelfCheckResult => {
    if (!announced) {
        return {
            ok: false,
            ran: false,
            report: t.selfNoPage,
        };
    }

    // What the analysis calls a screen's chunk, so a page that preloads its own route's chunks is
    // told apart from the two readers disagreeing about what everybody downloads.
    const screenChunks = new Set(analysis.chunkScreens.keys());
    const check = checkBoot(meta.outputs, analysis.bootChunks, announced, screenChunks);
    if (!check) {
        return {
            ok: false,
            ran: false,
            report: t.selfNoChunk,
        };
    }

    if (isSameBoot(check)) {
        const passed = t.selfPassed(check.agreed);
        if (check.onlyInPage.length > 0) {
            // Said, not swallowed: these are bytes of the first load that no figure of the report
            // accounts for, and knowing which they are is the difference between "fine" and "fine
            // as far as anything here can tell".
            return {
                ok: true,
                ran: true,
                report: [
                    passed,
                    '',
                    t.selfUnplaced(check.onlyInPage.length),
                    list(check.onlyInPage),
                    t.selfUnplacedWhy,
                ].join('\n'),
            };
        }
        if (check.preloadedRoutes.length === 0) {
            return { ok: true, ran: true, report: passed };
        }

        // Said out loud rather than dropped: these chunks really are fetched with the first load of
        // this page, and a build that prerenders one page per route is a different kind of build.
        return {
            ok: true,
            ran: true,
            report: [
                passed,
                '',
                t.selfPreloaded(check.preloadedRoutes.length),
                list(check.preloadedRoutes),
                t.selfPreloadedWhy,
            ].join('\n'),
        };
    }

    const parts = [t.selfFailed, '', t.selfAgreed(check.agreed)];
    if (check.onlyInGraph.length > 0) {
        parts.push('', t.selfOnlyGraph, list(check.onlyInGraph));
    }
    if (check.onlyInPage.length > 0) {
        parts.push('', t.selfOnlyPage, list(check.onlyInPage));
    }
    parts.push('', t.selfSuspect);

    return { ok: false, ran: true, report: parts.join('\n') };
};
