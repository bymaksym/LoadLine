/**
 * What a change against the baseline is made of, as the growth signals print it: "`xlsx` ≈+118 kB
 * (new)". The delta alone answers "how much"; the question on a merge request is "what did I add".
 */

import { type BootCause, type Comparison, type ScreenDelta } from '../../baseline/baseline.types';
import { formatDelta } from '../../format/format.utils';
import { type Lang } from '../../i18n/ui-strings';
import { mono } from './finding-html';
import { TEXT } from './finding-text';

/** How many causes the bootstrap's growth names: the ones that explain it, not the whole tail. */
const BOOT_CAUSES_SHOWN = 5;

/**
 * The same for each screen that grew. Lower, because that signal lists several screens in one
 * sentence and each brings its own: three is enough to say where the growth is.
 */
const SCREEN_CAUSES_SHOWN = 3;

/**
 * One entry per cause: "`@microsoft/teams-js` ≈+19 kB (new)", "`src/app/rooms` ≈+2 kB (your code)".
 * In the report's unit, with `≈` when that is an estimate.
 */
const causesText = (
    causes: readonly BootCause[],
    unit: { ratio: number; estimated: boolean },
    lang: Lang,
    shown: number,
): string[] => {
    const text = TEXT[lang];
    const mark = unit.estimated ? '≈' : '';
    return causes.slice(0, shown).map(cause => {
        const notes = [text.bootCauseChange[cause.change], cause.own ? text.bootCauseOwn : ''].filter(Boolean);
        const figure = `${mark}${formatDelta(Math.round(cause.diff * unit.ratio))}`;
        return `${mono(cause.name)} ${figure}${notes.length > 0 ? ` (${notes.join(', ')})` : ''}`;
    });
};

/** What the bootstrap's change is made of, as one line. Empty when nothing moved enough to name. */
export const bootCausesText = (comparison: Comparison, lang: Lang): string =>
    causesText(
        comparison.bootCauses,
        { ratio: comparison.causesRatio, estimated: comparison.causesEstimated },
        lang,
        BOOT_CAUSES_SHOWN,
    ).join(' · ');

/**
 * What one screen's change is made of, one entry per cause. Empty when either snapshot lacked the
 * screen's breakdown, so the text claims none rather than an invented one.
 */
export const screenCausesText = (screen: ScreenDelta, lang: Lang): string[] =>
    causesText(
        screen.causes ?? [],
        { ratio: screen.causesRatio, estimated: screen.causesEstimated },
        lang,
        SCREEN_CAUSES_SHOWN,
    );
