/**
 * "What would the first load weigh if this were behind an `import()`?"
 *
 * It turns the report into a bench: today you know `chart.js` is in the way, and what is missing is
 * how much the bootstrap drops **before** anybody spends the afternoon.
 *
 * ---
 *
 * **What this does and does not compute, because the difference is the whole design.**
 *
 * Deferring something takes off the first load exactly what has no other way in — its exclusive
 * weight — and that figure is *exact*. It is not an estimate and not a model: the graph is walked
 * with those files removed, and what stops being reachable is what stops being downloaded.
 *
 * What it deliberately does **not** do is re-chunk the build. Which files end up in which chunk is
 * the bundler's decision, taken with rules this tool does not have and should not guess at; a
 * simulated split would produce a second set of round-trip counts and per-screen totals that look
 * exactly like the measured ones and are not. So the round trips are not re-counted, the screen
 * totals are not redrawn, and the result says so rather than showing a figure it cannot stand
 * behind. What it gives instead is the one number the decision turns on, plus who would then be
 * paying for it.
 */

import { type Analysis } from '../analysis/analysis.types';
import { packageOf, projectFolderOf } from '../format/format.utils';

/** What is being deferred: a package, a folder of the project, or one file. */
export type DeferKind = 'package' | 'folder' | 'file';

export interface DeferResult {
    /** What was named, as it was named. */
    target: string;
    kind: DeferKind;
    /** The source files it covers. Empty when nothing in the build matches the name. */
    files: string[];
    /** Raw minified bytes it holds inside the bootstrap chunks today. */
    weight: number;
    /**
     * What the first load would lose. Exact: the graph walked without those files. Lower than
     * `weight` whenever part of what it brings in also arrives through something else.
     */
    saved: number;
    /** What the bootstrap holds today, as that same walk counts it. */
    before: number;
    /** `before - saved`. */
    after: number;
    /**
     * The screens that import it, which are the ones that would pay for it after the move. Empty
     * means nothing lazy uses it, and then deferring it is not a move but a deletion.
     */
    screens: string[];
    /** Own files importing it: where the `import()` would have to be written. */
    importers: string[];
    /**
     * `false` when the name matched nothing and the bootstrap has chunks nothing names a file
     * inside — a folder read without source maps. Then `weight`, `saved` and `screens` are not
     * "none": they are "not known", and the zeros in them must not be read as an answer.
     *
     * `false` too for any build read from its folder alone, maps or not: `weight` still holds,
     * the rest does not. The maps say what each chunk carries, never which file imports which, so
     * walking the graph without a package finds nothing that depended on it. A real build got
     * "0 B off the first load, nothing lazy uses it" for `@angular/material`: 92 kB of its
     * bootstrap, and 679 kB of one of its screens.
     */
    measurable: boolean;
}

/**
 * The bootstrap chunks whose inside is not known. That is a folder read without source maps, where
 * what a chunk weighs is known and what it holds is not — and only that: a chunk holding no file of
 * the project, like esbuild's runtime helpers, is known to hold none. See `undescribedChunks`.
 */
export const opaqueBootChunks = (analysis: Analysis): string[] => {
    const undescribed = new Set(analysis.undescribedChunks);
    return analysis.bootChunks.filter(chunk => undescribed.has(chunk));
};

/**
 * No chunk of the bootstrap says what is inside it: the folder came without source maps. What is
 * said about the whole report — "no source maps here", "no saving can be measured" — is said on this,
 * not on one chunk missing its map. Vite writes no map for the 84 bytes of `plugin-vue:export-helper`,
 * and a folder with sixteen maps was announced as having none.
 */
export const blindBoot = (analysis: Analysis): boolean =>
    analysis.bootChunks.length > 0 && opaqueBootChunks(analysis).length === analysis.bootChunks.length;

/**
 * @param name         a package name, a project folder as the breakdown spells it, or a source
 *                     path. It is matched in that order, which is the order of how specific the
 *                     answer is.
 * @param importsKnown whether the build says which file imports which: a stats file does, a build
 *                     folder read on its own does not. See `measurable`.
 */
export const simulateDefer = (analysis: Analysis, name: string, importsKnown = true): DeferResult => {
    const insights = analysis.insights();
    const byBucket = insights.filesByBucket.get(name);

    const kind: DeferKind = byBucket
        ? analysis.bootBuckets.find(bucket => bucket.name === name)?.isProjectCode
            ? 'folder'
            : 'package'
        : 'file';

    // A bucket of the breakdown is the common case and the files are already known. A path that is
    // not one is matched as a file, and as a fallback as anything under that package or folder —
    // so naming a package that is nowhere near the bootstrap still answers.
    const files =
        byBucket ??
        analysis.modules
            .filter(
                module =>
                    module.path === name || packageOf(module.path) === name || projectFolderOf(module.path) === name,
            )
            .map(module => module.path);

    const weight = files.reduce((sum, file) => {
        const module = analysis.modules.find(entry => entry.path === file);
        const boot = new Set(analysis.bootChunks);
        return (
            sum + (module?.places.filter(place => boot.has(place.chunk)).reduce((n, place) => n + place.bytes, 0) ?? 0)
        );
    }, 0);

    const saved = files.length > 0 ? insights.exclusiveOf(files) : 0;
    const screenOf = new Map(analysis.screens.map(screen => [screen.source, screen.label]));
    const importers =
        kind === 'package'
            ? [...(analysis.packageImporters.get(name) ?? [])]
            : [...new Set(files.flatMap(file => [...(analysis.ownImporters.get(file) ?? [])]))];

    return {
        target: name,
        kind,
        files,
        weight,
        saved,
        before: insights.bootTotal,
        after: Math.max(0, insights.bootTotal - saved),
        screens: importers.map(file => screenOf.get(file)).filter(label => label !== undefined),
        importers,
        // Not finding the name is an answer only when every bootstrap chunk could have shown it.
        // Without source maps "0 B" read as "deferring this saves nothing", of a package that the
        // same build read with its stats.json showed inside the bootstrap.
        measurable: importsKnown && (files.length > 0 || opaqueBootChunks(analysis).length === 0),
    };
};
