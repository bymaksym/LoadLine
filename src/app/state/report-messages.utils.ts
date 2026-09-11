/**
 * The codes the core throws, as sentences a person reads.
 *
 * They are outside the store because they are a translation table and nothing else: no state, no
 * signals, one string in and one string out. The store passes the strings of the current language.
 */

import { type ForeignFormat } from '../core/analysis/metafile.types';
import { type UiStrings } from '../core/i18n/ui-strings';
import { type MeasurementError } from '../core/measurement/measurement.types';

/** Anything thrown while reading a `stats.json`, named when it is one of ours and quoted when not. */
export const errorMessage = (error: unknown, t: UiStrings): string => `${reason(error, t)} ${t.errExpected}`;

/**
 * A JSON that is not a metafile, named by the format it actually is. It lives on its own because
 * the command needs the same sentence: the page had it and the terminal printed "not an esbuild
 * metafile" for a webpack stats.json, which is the one file people most often try.
 */
export const foreignMessage = (format: ForeignFormat, t: UiStrings): string => {
    if (format === 'webpack') {
        return t.errWebpackStats;
    }
    if (format === 'viteManifest') {
        return t.errViteManifest;
    }
    if (format === 'visualizer') {
        return t.errVisualizer;
    }

    return t.errNotMetafile;
};

/**
 * Why the file did not work. Every answer is followed by what was expected instead: a JSON that is
 * not a metafile at all and a metafile missing its `outputs` used to end in the same sentence, and
 * neither of them said what a good file looks like.
 */
const reason = (error: unknown, t: UiStrings): string => {
    const code = error instanceof Error ? error.message : String(error);

    if (code === 'NO_ENTRIES') {
        return t.errNoEntries;
    }
    if (code === 'NO_MAIN') {
        return t.errNoMain;
    }
    if (code === 'NO_OUTPUTS') {
        return t.errNoOutputs;
    }
    if (code === 'NO_PAGE') {
        return t.errNoPage;
    }
    if (code === 'NOT_ESM_GRAPH') {
        return t.errNotEsmGraph;
    }
    if (code.startsWith('NOT_METAFILE:')) {
        return foreignMessage(code.slice('NOT_METAFILE:'.length) as ForeignFormat, t);
    }

    return code;
};

/** Why a pasted browser measurement could not be used. */
export const measurementMessage = (error: MeasurementError, t: UiStrings): string => {
    const messages: Record<MeasurementError, string> = {
        empty: t.measureErrEmpty,
        noFiles: t.measureErrNoFiles,
        noMatch: t.measureErrNoMatch,
    };
    return messages[error];
};
