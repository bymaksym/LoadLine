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

export interface SelfCheckResult {
    ok: boolean;
    report: string;
}

const list = (chunks: readonly string[]): string => chunks.map(chunk => `    ${chunk}`).join('\n');

export const selfCheck = (
    meta: Metafile,
    analysis: Analysis,
    announced: ReadonlySet<string> | null,
): SelfCheckResult => {
    if (!announced) {
        return {
            ok: false,
            report:
                'Self-check needs the index.html of the build: it is the second, independent answer.\n' +
                'Pass the build folder as the target, or add --dist pointing at it.',
        };
    }

    // What the analysis calls a screen's chunk, so a page that preloads its own route's chunks is
    // told apart from the two readers disagreeing about what everybody downloads.
    const screenChunks = new Set(analysis.chunkScreens.keys());
    const check = checkBoot(meta.outputs, analysis.bootChunks, announced, screenChunks);
    if (!check) {
        return {
            ok: false,
            report:
                'Self-check could not run: the index.html of the build names no chunk of it.\n' +
                'Either the page belongs to another build, or the output shape changed enough that\n' +
                'nothing lines up — which is the thing this check is for.',
        };
    }

    if (isSameBoot(check)) {
        const passed = `Self-check passed: the import graph and index.html agree on all ${check.agreed} bootstrap chunks.`;
        if (check.onlyInPage.length > 0) {
            // Said, not swallowed: these are bytes of the first load that no figure of the report
            // accounts for, and knowing which they are is the difference between "fine" and "fine
            // as far as anything here can tell".
            return {
                ok: true,
                report: [
                    passed,
                    '',
                    `It also announces ${check.onlyInPage.length} chunk(s) the import graph cannot place:`,
                    list(check.onlyInPage),
                    'Usually a dynamic import whose path is built at run time — VitePress writes one per',
                    'page — which no reader of the files can follow. Too few to be the build changing shape.',
                ].join('\n'),
            };
        }
        if (check.preloadedRoutes.length === 0) {
            return { ok: true, report: passed };
        }

        // Said out loud rather than dropped: these chunks really are fetched with the first load of
        // this page, and a build that prerenders one page per route is a different kind of build.
        return {
            ok: true,
            report: [
                passed,
                '',
                `This page also announces ${check.preloadedRoutes.length} chunk(s) the graph attributes to a screen:`,
                list(check.preloadedRoutes),
                'That is a build with one page per route — index.html is the home route, not a shell —',
                'so those are preloaded route chunks and not part of what every screen pays.',
            ].join('\n'),
        };
    }

    const parts = [
        'Self-check FAILED: the two ways of working out the bootstrap disagree.',
        '',
        `Agreed on ${check.agreed} chunk(s).`,
    ];
    if (check.onlyInGraph.length > 0) {
        parts.push('', 'Called bootstrap by the import graph, never reached from index.html:', list(check.onlyInGraph));
    }
    if (check.onlyInPage.length > 0) {
        parts.push('', 'Reached from index.html, not called bootstrap by the import graph:', list(check.onlyInPage));
    }
    parts.push(
        '',
        'One of the two readers is wrong about this build. Every per-screen figure is measured',
        'against the bootstrap, so they are all suspect until this passes.',
    );

    return { ok: false, report: parts.join('\n') };
};
