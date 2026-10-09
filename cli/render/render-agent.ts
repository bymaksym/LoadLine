/**
 * `--format agent`: the report as a coding agent or a script wants it — what to do, in order, each
 * step with the file or package it is about, the import chain that puts it there and what doing it
 * is worth. No prose.
 *
 * The JSON holds all of this and more, but an agent reading it spends most of its context on the
 * paragraphs written for people, and still has to join three places — the action, its signal and a
 * `--why` — to know where to type. Here each action is already joined, one per few lines, in an
 * order that does not change between runs of the same build.
 *
 * It is English and its keys never change, whatever `--lang` says: it is read by programs, and a
 * program parsing `saving=` should not have to know Spanish.
 */

import { rate } from '../../src/app/core/criteria/criteria';
import { formatSaving, rankActions, unitScale } from '../../src/app/core/findings/actions';
import { plainText } from '../../src/app/core/findings/text/finding-plain';
import { formatBytes, formatDelta } from '../../src/app/core/format/format.utils';
import { blindBoot } from '../../src/app/core/whatif/defer';
import { explainWhy } from '../../src/app/core/whatif/why';
import { type Violation } from '../gates.types';
import { type CliReport } from '../report.types';

/** How many actions: enough to plan an afternoon, few enough to read before acting. */
const ACTIONS_SHOWN = 5;

/** `name=value` with no space in the value — `28kB`, not `28 kB` — so a line splits on spaces. */
const field = (name: string, value: string | number): string => `${name}=${String(value).replaceAll(/\s+/g, '')}`;

export const renderAgent = (report: CliReport, violations: Violation[], anyAsked: boolean): string => {
    const { analysis, criteria, comparison } = report;
    const scale = unitScale(analysis);
    const measurable = !blindBoot(analysis);
    const count = (severity: string): number => report.findings.filter(finding => finding.severity === severity).length;

    const head = [
        'loadline agent v1',
        [
            field('build', report.statsName),
            field('unit', report.mode),
            field('boot', formatBytes(analysis.bootBytes)),
            field('verdict', rate(analysis.bootBytes, criteria.bootOk, criteria.bootBad)),
            field('screens', analysis.screens.length),
            // Without it every saving below is "not known", not zero.
            field('measurable', measurable ? 'yes' : 'no'),
        ].join(' '),
        [
            field('signals', report.findings.length),
            field('high', count('high')),
            field('mid', count('mid')),
            field('info', count('info')),
        ].join(' '),
    ];

    const gates = anyAsked
        ? violations.length === 0
            ? ['gates: passed']
            : ['gates: failed', ...violations.map(violation => `  - ${violation.message}`)]
        : ['gates: none asked'];

    const growth = comparison
        ? [
              `baseline: ${field('name', comparison.baselineName)} ${field('boot', formatDelta(comparison.boot.diff))}`,
              ...comparison.bootCauses.slice(0, ACTIONS_SHOWN).map(cause => {
                  const figure = `${comparison.causesEstimated ? '≈' : ''}${formatDelta(Math.round(cause.diff * comparison.causesRatio))}`;
                  return `  - ${field('cause', cause.name)} ${field('change', cause.change)} ${field('diff', figure)}${cause.own ? ' own' : ''}`;
              }),
          ]
        : [];

    // The chain and the cut only where the signal is about one package or one file in the bootstrap.
    const actions = rankActions(report.findings)
        .slice(0, ACTIONS_SHOWN)
        .flatMap((action, index) => {
            const { finding } = action;
            const key = finding.target?.key ?? '';
            const why = key ? explainWhy(analysis, key) : null;
            // Not for a whole folder: its chain would be the chain to one file in it, and the cut
            // would be the saving of that file, which is not what the signal is about.
            const reached = why?.reach === 'boot' && why.defer.kind !== 'folder' ? why : null;
            return [
                `${index + 1}. ${[
                    field('kind', finding.kind),
                    ...(key ? [field('key', key)] : []),
                    field('severity', finding.severity),
                    field(
                        'saving',
                        action.saving > 0 ? formatSaving(action.saving, scale) : measurable ? '0' : 'unknown',
                    ),
                    field('effort', action.effort),
                ].join(' ')}`,
                `   title: ${plainText(finding.title)}`,
                ...(reached ? [`   chain: ${reached.steps.join(' > ')}`] : []),
                ...(reached?.cut && reached.via && reached.saves > 0
                    ? [
                          `   cut: ${field('in', reached.cut)} ${field('defer', reached.via)} ${field('saves', formatSaving(reached.saves, scale))}`,
                      ]
                    : []),
                // Imported by several files of the first load: one cut is nothing, all of them are
                // the saving. Every file is named, because an agent edits the ones it is given.
                ...(reached?.cut && reached.via && reached.alsoIn.length > 0 && reached.savesEverywhere > 0
                    ? [
                          `   cut: ${field('in', [reached.cut, ...reached.alsoIn].join(','))} ${field('defer', reached.via)} ${field('saves', formatSaving(reached.savesEverywhere, scale))}`,
                      ]
                    : []),
            ];
        });

    const asked = [
        ...report.whatIf.map(result =>
            result.measurable
                ? `what-if ${field('target', result.target)} ${field('saves', formatSaving(result.saved, scale))}`
                : `what-if ${field('target', result.target)} saves=unknown`,
        ),
        ...report.why.map(
            result =>
                `why ${field('target', result.target)} ${field('reach', result.reach)}${result.steps.length > 0 ? ` chain=${result.steps.join('>')}` : ''}${result.cut ? ` ${field('cut', result.cut)}` : ''}`,
        ),
    ];

    return [
        ...head,
        ...gates,
        ...growth,
        actions.length > 0 ? 'actions:' : 'actions: none',
        ...actions,
        ...asked,
        '',
    ].join('\n');
};
