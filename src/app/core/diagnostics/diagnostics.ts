/**
 * What to paste into a bug report.
 *
 * The privacy that makes this tool comfortable to use is the same thing that makes its failures
 * impossible to debug: somebody says "it tells me I have 0 screens" and cannot send the file,
 * because that file is a map of their entire application — every route, every dependency, every
 * folder name.
 *
 * So this is the middle: thirty lines that describe the **shape** of the build and the **decisions**
 * Loadline took on it, with nothing in them anybody would mind pasting in public.
 *
 * The rule about names, which is the whole design:
 *
 * - npm package names stay as they are. They are public, they are in everybody's lockfile, and
 *   they are usually the answer — "0 screens" is often "everything is in one chunk because this
 *   package is imported eagerly".
 * - Every path of the project's own code becomes a hash. It is stable inside one report, so two
 *   lines mentioning the same file are visibly about the same file, and it says nothing about what
 *   that file is called.
 *
 * The counts are the other half. A classification that dropped a row is the failure this exists to
 * catch, so screens, deferred blocks and route groupers are counted separately, and the entries
 * that produced no row at all are counted too rather than quietly missing.
 */

import { type Analysis } from '../analysis/analysis.types';
import { type Metafile } from '../analysis/metafile.types';
import { type Mode } from '../criteria/criteria.types';
import { packageOf } from '../format/format.utils';

/**
 * A short stable name for a path. A polynomial hash in base 36: not a secret, and not meant to be
 * one — its job is to be the *same* string every time the same path turns up in this report, and
 * to carry nothing about what the path said.
 *
 * Written with multiplication and a modulus rather than the usual shifts and xors so it reads as
 * arithmetic; the numbers stay well inside what a double holds exactly.
 */
export const anonymise = (path: string): string => {
    const PRIME = 2_147_483_647;
    let hash = 7;
    for (const character of path) {
        hash = (hash * 31 + (character.codePointAt(0) ?? 0)) % PRIME;
    }
    return `file-${hash.toString(36).padStart(6, '0')}`;
};

/** A package keeps its name; anything of the project's own becomes its hash. */
const safeName = (path: string): string => packageOf(path) ?? anonymise(path);

export interface DiagnosticInput {
    /** `null` when nothing was loaded, or when what was loaded could not be parsed. */
    meta: Metafile | null;
    /** `null` when the analysis threw: that is the case this report matters most for. */
    analysis: Analysis | null;
    error: string | null;
    /** Whether the graph came from the chunks of a folder rather than from a `stats.json`. */
    derived: boolean;
    /** Whether `index.html` was read, and how many of its scripts it named. */
    announced: ReadonlySet<string> | null;
    mode: Mode;
    /** Source maps read from the folder, which is what makes the breakdown exact. */
    mapFiles: number | null;
}

const countEntries = (meta: Metafile): number =>
    Object.values(meta.outputs).filter(output => output.entryPoint && /\.m?js$/.test(output.entryPoint)).length;

/** The lazy entries, by what the rules decided about each. The list a wrong answer shows up in. */
const classification = (analysis: Analysis): string[] => {
    const lines = [
        `screens:          ${analysis.screens.length}`,
        `deferred blocks:  ${analysis.deferredBlocks.length}`,
        `route groupers:   ${analysis.routeGroupers.length}`,
        `marked by hand:   ${analysis.marks.size}`,
    ];

    const named = [
        ...analysis.screens.map(screen => ['screen', screen.source] as const),
        ...analysis.deferredBlocks.map(entry => ['block ', entry.source] as const),
        ...analysis.routeGroupers.map(entry => ['grouper', entry.source] as const),
    ];

    return [
        ...lines,
        '',
        'lazy entries, one per line:',
        ...named.map(
            ([kind, source]) => `  ${kind}  ${safeName(source)}${analysis.marks.has(source) ? '  (marked)' : ''}`,
        ),
    ];
};

export const diagnosticsOf = (input: DiagnosticInput): string => {
    const lines = ['loadline diagnostics', ''];

    if (!input.meta) {
        lines.push('nothing loaded.', input.error ? `error: ${input.error}` : 'no error either.');
        return lines.join('\n');
    }

    const meta = input.meta;
    lines.push(
        `read from:        ${input.derived ? 'the build folder (graph out of the chunks)' : 'a stats.json'}`,
        `outputs:          ${Object.keys(meta.outputs).length}`,
        `inputs:           ${Object.keys(meta.inputs ?? {}).length}`,
        `entry outputs:    ${countEntries(meta)}`,
        `index.html:       ${input.announced ? `read, names ${input.announced.size} script(s)` : 'not loaded'}`,
        `source maps:      ${input.mapFiles ?? 0}`,
        `figures in:       ${input.mode}`,
    );

    if (!input.analysis) {
        lines.push('', `the analysis did not produce a report: ${input.error ?? 'no message'}`);
        return lines.join('\n');
    }

    const analysis = input.analysis;
    lines.push(
        `server outputs:   ${analysis.serverOutputs} (left out)`,
        `split source:     ${analysis.splitSource}`,
        '',
        `bootstrap chunks: ${analysis.bootFiles}`,
        `bootstrap bytes:  ${analysis.bootBytes}`,
        `first load:       ${analysis.startup ? `${analysis.startup.waves} round trip(s)` : 'unknown, no index.html'}`,
        `shared chunks:    ${analysis.sharedChunks.length}`,
        `duplicates:       ${analysis.duplicates.map(dupe => dupe.name).join(', ') || 'none'}`,
        `commonjs:         ${analysis.commonJs.map(pkg => pkg.name).join(', ') || 'none'}`,
        '',
        ...classification(analysis),
        '',
        // The whole breakdown, not the top ten. This is pasted into an issue by somebody who
        // cannot send the file, so the package that explains their problem has to be in it even
        // when it is the fourteenth heaviest.
        'bootstrap, heaviest first:',
        ...analysis.bootBuckets.map(
            bucket => `  ${bucket.isProjectCode ? anonymise(bucket.name) : bucket.name}  ${bucket.bytes}`,
        ),
        '',
        'Package names are real; every path of your own code is a stable hash. Nothing else is here.',
    );

    return lines.join('\n');
};
