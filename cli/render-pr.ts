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

import { markdownTable } from '../src/app/core/export/markdown-table.utils';
import { rankActions, totalSaving } from '../src/app/core/findings/actions';
import { plainText } from '../src/app/core/findings/finding-plain';
import { formatBytes, formatDelta } from '../src/app/core/format/format.utils';
import { UI } from '../src/app/core/i18n/ui';
import { violationLines } from './gates';
import { type Violation } from './gates.types';
import { type CliReport } from './report.types';
import { CLI_TEXT } from './text';

/**
 * What a bot looks for to find its own previous comment. It is an HTML comment, so it is invisible
 * in the rendered page and survives being edited by hand.
 */
export const PR_MARKER = '<!-- loadline-report -->';

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
        const fixed = comparison.goneFindings.map(finding => `\`${finding.kind}\``);
        const added = comparison.newFindings.map(finding => `\`${finding.kind}\``);
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
        const rows = actions.map(
            (action, index) =>
                `| ${index + 1} | ${action.finding.title} | ${action.saving > 0 ? formatBytes(action.saving) : '—'} | ${text.effortLabel[action.effort]} |`,
        );
        lines.push(
            '',
            `#### ${text.headActions}`,
            `| # | ${text.colAction} | ${text.colSaving} | ${text.colEffort} |`,
            '| --: | --- | --: | --- |',
            ...rows,
        );
        if (total.counted > 0) {
            lines.push('', `_${text.totalSaving(formatBytes(total.bytes), formatBytes(total.after), total.counted)}_`);
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

    // Everything the report says, folded. Nothing is dropped: the rule is to group, never to trim.
    const rest = [
        markdownTable(analysis, comparison, strings, report.unit),
        '',
        `#### ${text.headSignals}`,
        ...report.findings.map(
            finding => `- **${finding.title}** — ${plainText(finding.body)}\n  ${text.fix}: ${plainText(finding.fix)}`,
        ),
    ].join('\n');

    lines.push('', details(text.prDetails, rest));

    return `${lines.join('\n')}\n`;
};
