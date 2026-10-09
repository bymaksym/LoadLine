/**
 * The comment a bot leaves on a merge request, and edits next time instead of writing a new one.
 *
 * The marker at the top is the whole point and it is two lines of code. Without it, a branch with
 * fifteen commits ends up with fifteen comments saying much the same thing, and by the third one
 * nobody reads any of them. With it, `gh pr comment --edit-last` or any bot that greps for a
 * marker updates the one that is already there.
 *
 * What leads is what changed — the deltas, the signals that came in, the ones that went away —
 * because a merge request is about a change and not about a build. Everything else goes inside a
 * `<details>`: still there, still complete, and folded up so the comment is three lines tall until
 * somebody wants the rest.
 */

import { markdownTable } from '../../src/app/core/export/markdown-table.utils';
import { formatSaving, rankActions, savingWords, totalSaving, unitScale } from '../../src/app/core/findings/actions';
import { type FindingKind } from '../../src/app/core/findings/finding.types';
import { KIND_NAMES } from '../../src/app/core/findings/kind-names';
import { plainText } from '../../src/app/core/findings/text/finding-plain';
import { formatBytes, formatDelta } from '../../src/app/core/format/format.utils';
import { UI } from '../../src/app/core/i18n/ui';
import { violationLines } from '../gates';
import { type Violation } from '../gates.types';
import { type CliReport } from '../report.types';
import { CLI_TEXT } from '../text/text';

/**
 * What a bot looks for to find its own previous comment. It is an HTML comment, so it is invisible
 * in the rendered page and survives being edited by hand.
 */
export const PR_MARKER = '<!-- loadline-report -->';

/** Below GitHub's 65,536 characters for a comment, with room for what a bot adds around it. */
const PR_BUDGET = 60_000;
/** What is kept of each signal's text once the comment is over the budget. */
const PR_BODY_CAP = 600;

const details = (summary: string, body: string): string =>
    `<details>\n<summary>${summary}</summary>\n\n${body}\n\n</details>`;

export const renderPrComment = (report: CliReport, violations: Violation[], anyAsked: boolean): string => {
    const text = CLI_TEXT[report.lang];
    const strings = UI[report.lang];
    const { analysis, comparison } = report;

    const headline = comparison
        ? `**${formatBytes(analysis.bootBytes)}** ${text.headBoot.toLowerCase()} · ${formatDelta(comparison.boot.diff)} vs \`${comparison.baselineName}\``
        : `**${formatBytes(analysis.bootBytes)}** ${text.headBoot.toLowerCase()} · ${report.unit}`;

    const lines = [PR_MARKER, `### Loadline${report.projectName ? ` · ${report.projectName}` : ''}`, '', headline];

    // Which signals came and went. It is the line the person opening the merge request reads, and
    // the only one that makes fixing something visible.
    if (comparison?.findingsComparable) {
        // By what they say, not by their internal kind: a new one is in this report and carries
        // its chip; a fixed one is not, and is named by what that kind of signal is about.
        const names = KIND_NAMES[report.lang];
        const chipOf = (kind: FindingKind, key: string): string =>
            report.findings.find(finding => finding.kind === kind && (finding.target?.key ?? '') === key)?.chip ??
            names[kind];
        const fixed = comparison.goneFindings.map(
            finding => `${names[finding.kind]}${finding.key ? ` (\`${finding.key}\`)` : ''}`,
        );
        const added = comparison.newFindings.map(finding => chipOf(finding.kind, finding.key));
        if (fixed.length > 0 || added.length > 0) {
            lines.push(
                '',
                [
                    fixed.length > 0 ? `✅ ${text.prFixed(fixed.length)}: ${fixed.join(', ')}` : '',
                    added.length > 0 ? `⚠️ ${text.prNew(added.length)}: ${added.join(', ')}` : '',
                ]
                    .filter(Boolean)
                    .join('  \n'),
            );
        }
    }

    const actions = rankActions(report.findings);
    if (actions.length > 0) {
        const total = totalSaving(analysis, report.findings);
        const scale = unitScale(analysis);
        const rows = actions.map(
            (action, index) =>
                `| ${index + 1} | ${plainText(action.finding.title)} | ${action.saving > 0 ? formatSaving(action.saving, scale) : '—'} | ${text.effortLabel[action.effort]} |`,
        );
        lines.push(
            '',
            `#### ${text.headActions}`,
            `| # | ${text.colAction} | ${text.colSaving} | ${text.colEffort} |`,
            '| --: | --- | --: | --- |',
            ...rows,
        );
        // As in the text: a total of nothing is not a figure worth a line in somebody's review.
        if (total.counted > 0 && total.bytes > 0) {
            const words = savingWords(analysis, total);
            lines.push('', `_${text.totalSaving(words.saving, words.after, total.counted, words.estimated)}_`);
        }
    }

    if (anyAsked) {
        lines.push(
            '',
            violations.length === 0
                ? `✅ ${text.passed}`
                : [...violationLines(violations).map(line => `- ❌ ${line}`), '', text.failed(violations.length)].join(
                      '\n',
                  ),
        );
    }

    // Everything the report says, folded. Nothing is dropped: the rule is to group, never to trim —
    // until the comment would not be posted at all. GitHub refuses one over 65,536 characters, and
    // Excalidraw's came to 64,314, most of it one signal listing 702 paths. Over the budget, each
    // signal's text is cut to its first lines and says where the rest is; titles and the table stay.
    const restWith = (cap: number | null): string =>
        [
            markdownTable(analysis, comparison, strings, report.unit),
            '',
            `#### ${text.headSignals}`,
            ...report.findings.map(finding => {
                const body = plainText(finding.body);
                const shown =
                    cap !== null && body.length > cap ? `${body.slice(0, cap).trimEnd()}… ${text.prCut}` : body;
                return `- **${plainText(finding.title)}** — ${shown}\n  ${text.fix}: ${plainText(finding.fix)}`;
            }),
        ].join('\n');
    const full = restWith(null);
    const rest = lines.join('\n').length + full.length > PR_BUDGET ? restWith(PR_BODY_CAP) : full;

    lines.push('', details(text.prDetails, rest));

    return `${lines.join('\n')}\n`;
};
