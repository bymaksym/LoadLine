/**
 * Five figures and three actions, as a block somebody pastes into a chat.
 *
 * The report is looked at alone; what circulates in a team is a screenshot or a paste. This is that
 * paste, and it is plain text on purpose — it survives a chat window, an issue, a commit message
 * and an email, which no image does.
 *
 * It is a **summary and says so**: the line at the end names the tool and the unit, because a
 * figure without its unit quoted three days later in a meeting is worse than no figure.
 */

import { type Analysis } from '../analysis/analysis.types';
import { type Comparison } from '../baseline/baseline.types';
import { formatRemaining, formatSaving, rankActions, totalSaving, unitScale } from '../findings/actions';
import { type Finding } from '../findings/finding.types';
import { plainText } from '../findings/finding-plain';
import { formatBytes, formatDelta } from '../format/format.utils';
import { type DeferResult } from '../whatif/defer';

export interface SummaryInput {
    analysis: Analysis;
    findings: readonly Finding[];
    comparison: Comparison | null;
    /** The unit as words, so the paste says what the numbers are in. */
    unit: string;
    /** What the build was called. */
    name: string;
    /** Everything the page asks for before anything appears, when a folder was read. */
    firstTrip: number | null;
    lang: 'es' | 'en';
    /** What moved since the previous run, as one line, when the command remembers one. */
    since?: string | null;
    /** The `--what-if` answers, when the command was asked any: one line each. */
    whatIf?: readonly DeferResult[];
}

const WORDS = {
    en: {
        boot: 'Bootstrap',
        trip: 'First trip',
        screens: 'Screens',
        worst: 'Heaviest screen',
        signals: 'Signals',
        actions: 'What to fix first',
        saving: 'All of it is worth',
        whatIf: 'What if it were deferred',
        without: (target: string, saved: string, after: string) =>
            `  without ${target}: ${saved} off the first load, which would then weigh ${after}`,
        tail: (unit: string) => `— Loadline, figures ${unit}`,
    },
    es: {
        boot: 'Bootstrap',
        trip: 'Primer viaje',
        screens: 'Pantallas',
        worst: 'Pantalla más pesada',
        signals: 'Señales',
        actions: 'Qué arreglo primero',
        saving: 'Todo junto vale',
        whatIf: 'Y si se difiriera',
        without: (target: string, saved: string, after: string) =>
            `  sin ${target}: ${saved} menos en la primera carga, que pasaría a pesar ${after}`,
        tail: (unit: string) => `— Loadline, cifras ${unit}`,
    },
};

/**
 * @returns plain text, no markup. Three actions rather than all of them: this is the thing that
 *          gets read in a chat, and the report it points at is where nothing is left out.
 */
export const summaryText = (input: SummaryInput): string => {
    const words = WORDS[input.lang];
    const { analysis, comparison } = input;
    const worst = analysis.screens[0];
    const problems = input.findings.filter(finding => finding.severity === 'high' || finding.severity === 'mid');
    const scale = unitScale(analysis);
    const total = totalSaving(analysis, input.findings);
    const actions = rankActions(input.findings).slice(0, 3);
    const whatIf = input.whatIf ?? [];

    const bootLine = comparison
        ? `${formatBytes(analysis.bootBytes)} (${formatDelta(comparison.boot.diff)} vs ${comparison.baselineName})`
        : formatBytes(analysis.bootBytes);

    const lines = [
        `Loadline · ${input.name}`,
        '',
        `${words.boot}: ${bootLine}`,
        ...(input.since ? [input.since] : []),
        ...(input.firstTrip === null ? [] : [`${words.trip}: ${formatBytes(input.firstTrip)}`]),
        `${words.screens}: ${analysis.screens.length}`,
        ...(worst ? [`${words.worst}: ${worst.label} — ${formatBytes(worst.total)}`] : []),
        `${words.signals}: ${problems.length}`,
        ...(actions.length > 0
            ? [
                  '',
                  `${words.actions}:`,
                  ...actions.map(
                      (action, index) =>
                          `  ${index + 1}. ${plainText(action.finding.title)}${action.saving > 0 ? ` — ${formatSaving(action.saving, scale)}` : ''}`,
                  ),
              ]
            : []),
        // Only when there is something to say. "All of it is worth: nothing that can be measured"
        // was a line in every paste that carried no information at all.
        ...(total.counted > 0 && total.bytes > 0 ? ['', `${words.saving}: ${formatSaving(total.bytes, scale)}`] : []),
        ...(whatIf.length > 0
            ? [
                  '',
                  `${words.whatIf}:`,
                  ...whatIf.map(result =>
                      words.without(
                          result.target,
                          formatSaving(result.saved, scale),
                          formatRemaining(analysis, result.saved, result.after),
                      ),
                  ),
              ]
            : []),
        '',
        words.tail(input.unit),
    ];

    return `${lines.join('\n')}\n`;
};
