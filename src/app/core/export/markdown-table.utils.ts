import { type Analysis } from '../analysis/analysis.types';
import { type Comparison } from '../baseline/baseline.types';
import { formatBytes, formatDelta } from '../format/format.utils';
import { type UiStrings } from '../i18n/ui-strings';

/**
 * The screens table as Markdown, to paste into a pull request or an issue. Takes the delta column
 * when there is a baseline, and says in the lead line which unit the figures are in — a table of
 * numbers with no unit is what makes a gzip figure get read as a raw one.
 */
export const markdownTable = (
    analysis: Analysis,
    comparison: Comparison | null,
    t: UiStrings,
    unit: string,
): string => {
    const head = [t.colScreen, t.legBoot.split(' · ', 1)[0] ?? '', t.colShared, t.colOwn, t.colTotal, t.colWaves];
    const align = ['---', '---:', '---:', '---:', '---:', '---:'];
    if (comparison) {
        head.push(`${t.colDelta} ${comparison.baselineName}`);
        align.push('---:');
    }

    const rows = analysis.screens.map(screen => {
        const cells = [
            screen.label,
            formatBytes(screen.boot),
            formatBytes(screen.shared),
            formatBytes(screen.own),
            formatBytes(screen.total),
            String(screen.waves),
        ];
        if (comparison) {
            const delta = comparison.screens.get(screen.source);
            cells.push(delta ? formatDelta(delta.total.diff) : t.compareNew);
        }
        return `| ${cells.join(' | ')} |`;
    });

    return [
        `**${t.tileBoot}**: ${formatBytes(analysis.bootBytes)} · ${analysis.screens.length} ${t.tabScreens.toLowerCase()} · ${unit}`,
        '',
        `| ${head.join(' | ')} |`,
        `| ${align.join(' | ')} |`,
        ...rows,
    ].join('\n');
};
