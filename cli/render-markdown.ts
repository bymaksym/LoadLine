/**
 * The report as Markdown, to paste into a merge request. The screens table is the very same
 * `markdownTable` the page's "Export analysis" button writes, so a table posted by the pipeline and
 * one copied from the page are the same table.
 */

import { markdownTable } from '../src/app/core/export/markdown-table.utils';
import { plainText } from '../src/app/core/findings/finding-plain';
import { UI } from '../src/app/core/i18n/ui';
import { violationLines } from './gates';
import { type Violation } from './gates.types';
import { type CliReport } from './report.types';
import { CLI_TEXT } from './text';

export const renderMarkdown = (report: CliReport, violations: Violation[], anyAsked: boolean): string => {
    const text = CLI_TEXT[report.lang];
    const strings = UI[report.lang];

    const blocks = [markdownTable(report.analysis, report.comparison, strings, report.unit)];

    if (report.findings.length > 0) {
        blocks.push(
            `### ${text.headSignals}`,
            report.findings
                .map(
                    finding =>
                        `- **${finding.title}** — ${plainText(finding.body)}\n  ${text.fix}: ${plainText(finding.fix)}`,
                )
                .join('\n'),
        );
    }

    if (anyAsked) {
        blocks.push(
            `### ${text.headGates}`,
            violations.length === 0
                ? text.passed
                : [...violationLines(violations).map(line => `- ${line}`), '', text.failed(violations.length)].join(
                      '\n',
                  ),
        );
    }

    return `${blocks.join('\n\n')}\n`;
};
