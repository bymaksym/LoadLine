/**
 * "Why is this package in my first load, and where would I cut it out?"
 *
 * The page answers it in the search, one click at a time; a terminal, a pipeline or an agent had
 * no way to ask. Nothing here is new arithmetic: the chain is the one the analysis already walks,
 * and what cutting it would save is `simulateDefer`. What this adds is the one line in between —
 * the file of yours where the `import()` would go — because a chain of nine steps that ends in a
 * package nobody imports directly leaves that to be worked out by hand.
 */

import { type Analysis } from '../analysis/analysis.types';
import { chainSteps, packageOf } from '../format/format.utils';
import { type DeferResult, opaqueBootChunks, simulateDefer } from './defer';

/**
 * Where the name sits. `boot` is the first load; `lazy` is behind some `import()` already;
 * `unreached` is in the build with nothing from the entry importing it; `absent` is not in the
 * build at all; `unknown` is a folder read without source maps, where nothing inside a chunk has
 * a name to look for; `unchained` is in a build read from its folder, whose maps name what each
 * chunk carries and not who imports it — there it is not "unreached", it is a chain nobody wrote.
 * `sourced` is that same case answered anyway: the first load holds it, and the original sources
 * inside the maps say which files of the project import it. `deferred` is a build read from its
 * folder that holds it outside the first load: with no chain to show, that much is still known.
 */
export type WhyReach = 'boot' | 'lazy' | 'unreached' | 'absent' | 'unknown' | 'unchained' | 'sourced' | 'deferred';

export interface WhyResult {
    /** What was asked about, as it was asked. */
    target: string;
    reach: WhyReach;
    /** The import chain from the entry point as readable steps. Empty unless `boot` or `lazy`. */
    steps: string[];
    /**
     * The last file of the project's own in the chain: where an `import()` would take the target
     * out of the first load. `null` when the chain has none — the entry itself imports it.
     */
    cut: string | null;
    /**
     * What `cut` imports on the way: the thing the `import()` would be written for. The target
     * itself when your file imports it directly; the package that pulls it in when it does not —
     * `rxjs` reaches an Angular bootstrap through `@angular/common`, and no import of `rxjs` in
     * `main.ts` would move it.
     */
    via: string | null;
    /**
     * Exact bytes off the first load from deferring `via` where `cut` imports it. `0` when other
     * files of the first load import it too: then an `import()` in `cut` alone takes nothing off.
     */
    saves: number;
    /**
     * The other files of the first load that import `via` statically, which an `import()` would be
     * needed in as well. The router of Angular RealWorld is imported by six of them, and the answer
     * named one and promised ≈23 kB for it.
     */
    alsoIn: string[];
    /** What deferring `via` everywhere it is imported would take off: `saves` once all are cut. */
    savesEverywhere: number;
    /** What deferring it is worth, and who would pay for it then. The same answer as `--what-if`. */
    defer: DeferResult;
}

/** The files of the build a name stands for: a package, a project folder or one file. */
const filesOf = (analysis: Analysis, name: string): string[] =>
    analysis.modules.filter(module => module.path === name || module.pkg === name).map(module => module.path);

/** The shortest chain from the entry to any of the files, lazy boundaries included. */
const anyChain = (analysis: Analysis, files: readonly string[]): string[] | null => {
    let best: string[] | null = null;
    for (const file of files) {
        const chain = analysis.chainTo(file);
        if (chain && (!best || chain.length < best.length)) {
            best = chain;
        }
    }
    return best;
};

/**
 * The last own file before the target, read on the raw chain — after `chainSteps` a scoped package
 * and a path look alike. Packages in between are skipped: when `firebase` pulls `@firebase/app`
 * in, the `import()` goes where your code imports `firebase`, not inside `node_modules`.
 */
const cutOf = (chain: readonly string[]): string | null =>
    chain.slice(0, -1).findLast(file => !packageOf(file)) ?? null;

/** The project's own files in the first load. */
const bootOwnFiles = (analysis: Analysis): Set<string> => {
    const boot = new Set(analysis.bootChunks);
    return new Set(
        analysis.modules
            .filter(module => !module.pkg && module.places.some(place => boot.has(place.chunk)))
            .map(module => module.path),
    );
};

/**
 * @param importsKnown   whether the build says which file imports which. See `simulateDefer`.
 * @param sourceImporters for a build that does not: the files of the project whose own source
 *                       imports a name, read out of the maps. See `importersInSources`.
 */
export const explainWhy = (
    analysis: Analysis,
    name: string,
    importsKnown = true,
    sourceImporters: ((name: string) => string[]) | null = null,
): WhyResult => {
    const defer = simulateDefer(analysis, name, importsKnown);
    const result = (reach: WhyReach, chain: string[] | null): WhyResult => {
        const steps = chain ? chainSteps(chain) : [];
        const cut = chain ? cutOf(chain) : null;
        const via = cut === null ? null : (steps[steps.indexOf(cut) + 1] ?? null);
        const viaDefer = via === null ? null : via === name ? defer : simulateDefer(analysis, via);
        const bootFiles = bootOwnFiles(analysis);
        const alsoIn = cut && viaDefer ? viaDefer.importers.filter(file => file !== cut && bootFiles.has(file)) : [];
        const savesEverywhere = viaDefer?.saved ?? 0;
        const saves = alsoIn.length > 0 ? 0 : savesEverywhere;
        return { target: name, reach, steps, cut, via, saves, alsoIn, savesEverywhere, defer };
    };

    if (!importsKnown) {
        if (defer.files.length > 0 || filesOf(analysis, name).length > 0) {
            // Nothing of it in the first load: whatever the chain, it is not what anybody pays first.
            if (defer.weight === 0) {
                return result('deferred', null);
            }
            const readers = (sourceImporters?.(name) ?? []).filter(file => bootOwnFiles(analysis).has(file));
            const [first, ...rest] = readers;
            if (first) {
                // The saving cannot be walked without the edges; what it weighs in the first load is
                // the most an `import()` in every one of these could take off.
                return {
                    ...result('sourced', null),
                    cut: first,
                    alsoIn: rest,
                    via: name,
                    savesEverywhere: defer.weight,
                };
            }
            return result('unchained', null);
        }
        return result(opaqueBootChunks(analysis).length > 0 ? 'unknown' : 'absent', null);
    }

    if (!defer.measurable) {
        return result('unknown', null);
    }

    // Static imports only: the chain that makes it part of the first load, not merely one that
    // reaches it. For a package it is the walk the analysis already did.
    const boot = analysis.bootChains.get(name);
    if (boot) {
        return result('boot', boot);
    }

    const files = defer.files.length > 0 ? defer.files : filesOf(analysis, name);
    if (files.length === 0) {
        return result('absent', null);
    }

    const chain = anyChain(analysis, files);
    if (!chain) {
        return result('unreached', null);
    }
    // A file of yours, or a folder, in the bootstrap: `bootChains` only keys packages.
    return result(defer.weight > 0 ? 'boot' : 'lazy', chain);
};
