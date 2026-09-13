/**
 * The report as a person reads it in a terminal. Same message as the page, in the order the page
 * puts it: the headline first, then one row per screen on the same three segments, then the
 * signals with what to do about each one.
 *
 * Colour is an extra, never the message: every line says what it means in words too, because half
 * the places this runs strip the escape codes.
 */

import { rate } from '../src/app/core/criteria/criteria';
import { type Verdict } from '../src/app/core/criteria/criteria.types';
import { rankActions, totalSaving } from '../src/app/core/findings/actions';
import { type Finding, type Severity } from '../src/app/core/findings/finding.types';
import { plainText } from '../src/app/core/findings/finding-plain';
import { formatBytes, formatDelta } from '../src/app/core/format/format.utils';
import { UI } from '../src/app/core/i18n/ui';
import { budgetAdvice, screenBudgetAdvice } from '../src/app/core/project/budget-advice';
import { formatMs, timingsOf } from '../src/app/core/timing/timing';
import { violationLines } from './gates';
import { type Violation } from './gates.types';
import { type CliReport } from './report.types';
import { CLI_TEXT } from './text';

const WIDTH = 96;
const ESC = String.fromCodePoint(27);
const ANSI = new RegExp(String.raw`${ESC}\[\d+m`, 'g');

type Paint = (value: string) => string;

/** The colours used, and no others. `plain` is what `--no-color` swaps every one of them for. */
interface Palette {
    bold: Paint;
    dim: Paint;
    good: Paint;
    warn: Paint;
    bad: Paint;
}

const code =
    (open: number): Paint =>
    value =>
        `${ESC}[${open}m${value}${ESC}[0m`;
const plain: Paint = value => value;

const paletteOf = (color: boolean): Palette =>
    color
        ? { bold: code(1), dim: code(90), good: code(32), warn: code(33), bad: code(31) }
        : { bold: plain, dim: plain, good: plain, warn: plain, bad: plain };

/** Length as the terminal shows it: padding a coloured string by its raw length breaks the column. */
const visible = (value: string): number => value.replaceAll(ANSI, '').length;

const pad = (value: string, width: number, right: boolean): string => {
    const filler = ' '.repeat(Math.max(0, width - visible(value)));
    return right ? `${filler}${value}` : `${value}${filler}`;
};

const verdictPaint = (palette: Palette, verdict: Verdict): Paint =>
    verdict === 'good' ? palette.good : verdict === 'ok' ? palette.warn : palette.bad;

const severityPaint = (palette: Palette, severity: Severity): Paint =>
    severity === 'high' ? palette.bad : severity === 'mid' ? palette.warn : palette.dim;

/** Wraps at word boundaries. A signal is a sentence, and a sentence cut mid-word is harder to read. */
const wrap = (value: string, width: number): string[] => {
    const lines: string[] = [];
    const words = value.split(/\s+/).filter(Boolean);
    let current = '';

    for (const word of words) {
        if (current && current.length + word.length + 1 > width) {
            lines.push(current);
            current = word;
        } else {
            current = current ? `${current} ${word}` : word;
        }
    }
    if (current) {
        lines.push(current);
    }

    return lines;
};

interface Column {
    head: string;
    /** Numbers read as a column only when they end in the same place. */
    right: boolean;
}

/** A table sized to its own content: nothing truncated, nothing padded to a guess. */
const table = (columns: Column[], rows: string[][], palette: Palette): string[] => {
    const widths = columns.map((column, index) =>
        Math.max(column.head.length, ...rows.map(row => visible(row[index] ?? ''))),
    );
    const line = (cells: string[]): string =>
        cells.map((value, index) => pad(value, widths[index] ?? 0, columns[index]?.right ?? false)).join('  ');

    return [
        palette.dim(line(columns.map(column => column.head))),
        palette.dim(widths.map(width => '-'.repeat(width)).join('  ')),
        ...rows.map(row => line(row)),
    ];
};

/**
 * What the first load costs in round trips, under the bootstrap figure. Empty without `--dist`:
 * `index.html` is the only file that tells a preloaded chunk from one the browser has to discover
 * by parsing, and the page's "drop the folder" wording is not what a terminal should say.
 */
const startupLines = (report: CliReport, palette: Palette): string[] => {
    const startup = report.analysis.startup;
    if (!startup) {
        return [];
    }

    const note = UI[report.lang].startupNote({
        waves: startup.waves,
        late: startup.discovered.length,
        chunks: report.analysis.bootFiles,
    });
    return [palette.dim(note)];
};

/**
 * Everything the page asks for before anything appears, or — without a folder to read — just the
 * stylesheets, which is as much of it as a page alone can say.
 */
const firstTripLines = (report: CliReport, palette: Palette): string[] => {
    const text = CLI_TEXT[report.lang];
    const trip = report.assets?.firstTrip;

    if (trip && trip.total > 0) {
        const parts = [
            `${formatBytes(trip.scripts)} JS`,
            `${formatBytes(trip.styles)} CSS`,
            `${formatBytes(trip.fonts)} fonts`,
            `${formatBytes(trip.images)} images`,
        ].join(' + ');
        return [palette.warn(text.firstTrip(formatBytes(trip.total), trip.files, parts))];
    }

    if (report.pageCssBytes === null) {
        return [];
    }

    return [
        palette.warn(
            text.pageCss(
                formatBytes(report.pageCssBytes),
                report.pageCssFiles,
                formatBytes(report.analysis.bootBytes + report.pageCssBytes),
            ),
        ),
    ];
};

const screensTable = (report: CliReport, palette: Palette): string[] => {
    const strings = UI[report.lang];
    const { analysis, comparison, criteria } = report;

    const columns: Column[] = [
        { head: strings.colScreen, right: false },
        { head: strings.tabBoot, right: true },
        { head: strings.colShared, right: true },
        { head: strings.colOwn, right: true },
        { head: strings.colTotal, right: true },
        { head: strings.colWaves, right: true },
    ];
    if (comparison) {
        columns.push({ head: `${strings.colDelta} ${comparison.baselineName}`, right: true });
    }

    const rows = analysis.screens.map(screen => {
        const verdict = rate(screen.total, criteria.screenOk, criteria.screenBad);
        const cells = [
            screen.label,
            formatBytes(screen.boot),
            formatBytes(screen.shared),
            formatBytes(screen.own),
            verdictPaint(palette, verdict)(formatBytes(screen.total)),
            String(screen.waves),
        ];
        if (comparison) {
            const delta = comparison.screens.get(screen.source);
            cells.push(delta ? formatDelta(delta.total.diff) : strings.compareNew);
        }
        return cells;
    });

    return table(columns, rows, palette);
};

const signalBlock = (finding: Finding, palette: Palette, fixLabel: string): string[] => {
    const head = severityPaint(palette, finding.severity)(`${finding.severity.padEnd(4)} · ${finding.chip}`);
    const indent = (line: string): string => `      ${line}`;
    const body = wrap(plainText(finding.body), WIDTH - 6).map(element => indent(element));
    const fix = finding.fix ? wrap(`${fixLabel}: ${plainText(finding.fix)}`, WIDTH - 6).map(l => indent(l)) : [];

    return ['', `  ${head}`, `    ${palette.bold(finding.title)}`, ...body, ...(fix.length > 0 ? ['', ...fix] : [])];
};

/**
 * What to fix first: the signals ranked by bytes per unit of effort, then what doing all of it is
 * worth. It is an **order**, and the note says so: every signal is printed again below, in full.
 */
const actionsBlock = (report: CliReport, palette: Palette): string[] => {
    const text = CLI_TEXT[report.lang];
    const actions = rankActions(report.findings);
    if (actions.length === 0) {
        return [];
    }

    // Painted by severity, like the signal it points at. Without it this table reads as four
    // equal jobs, and the eye has to go down to Signals to learn that the fourth is an `info`
    // and the first is not. The saving cell stays plain on purpose: one colour per row, or the
    // colour stops meaning anything.
    const rows = actions.map((action, index) => [
        `${index + 1}.`,
        severityPaint(palette, action.finding.severity)(action.finding.title),
        text.savingCell(action.saving > 0 ? formatBytes(action.saving) : ''),
        text.effortLabel[action.effort],
    ]);

    const total = totalSaving(report.analysis, report.findings);
    const summary =
        total.counted > 0
            ? text.totalSaving(formatBytes(total.bytes), formatBytes(total.after), total.counted)
            : text.nothingToSave;

    return [
        '',
        palette.bold(text.headActions),
        palette.dim(text.actionsNote),
        ...table(
            [
                { head: '#', right: true },
                { head: text.colAction, right: false },
                { head: text.colSaving, right: true },
                { head: text.colEffort, right: false },
            ],
            rows,
            palette,
        ),
        '',
        ...wrap(summary, WIDTH).map(line => palette.dim(line)),
    ];
};

/**
 * Bytes as seconds, on three connections. Every line of this block is labelled an estimate, and the
 * note is printed before the table rather than after it: a figure read first and qualified second
 * is a figure somebody quotes without the qualification.
 */
const timeBlock = (report: CliReport, palette: Palette): string[] => {
    const text = CLI_TEXT[report.lang];
    const { analysis } = report;
    const waves = analysis.startup?.waves ?? 1;
    // The transfer half goes by what travels; the parse half by raw bytes, plus the stylesheets the
    // page asks for, because the first load is what the first load is.
    const bytes = analysis.bootBytes + (report.pageCssBytes ?? 0);
    const timings = timingsOf(bytes, analysis.bootRawBytes, waves, report.criteria.latencyMs);

    const columns = text.timeColumns;
    const rows = timings.map(timing => [
        text.profileName[timing.profile],
        formatMs(timing.transferMs, report.lang),
        formatMs(timing.latencyMs, report.lang),
        formatMs(timing.scriptMs, report.lang),
        palette.bold(formatMs(timing.totalMs, report.lang)),
    ]);

    return [
        '',
        palette.bold(text.headTime),
        ...wrap(text.timeNote, WIDTH).map(line => palette.dim(line)),
        ...table(
            [
                { head: columns.profile, right: false },
                { head: columns.transfer, right: true },
                { head: columns.latency, right: true },
                { head: columns.script, right: true },
                { head: columns.total, right: true },
            ],
            rows,
            palette,
        ),
    ];
};

/**
 * The budget that should be in `angular.json`. Only with `--project`, because without it there is
 * nothing to say a budget is missing from, and the figure is raw bytes: that is what Angular counts.
 */
const budgetBlock = (report: CliReport, palette: Palette): string[] => {
    const text = CLI_TEXT[report.lang];
    // Only when the report already said the budget is missing, unreachable or a warning: without
    // `--project` there is nothing to say a budget is missing from.
    const asking = new Set<Finding['kind']>(['budgetNone', 'budgetTooHigh', 'budgetWarnOnly']);
    const wanted = report.findings.some(finding => asking.has(finding.kind));
    const advice = wanted ? budgetAdvice(report.analysis.bootRawBytes + (report.pageCssRawBytes ?? 0)) : null;
    if (!advice) {
        return [];
    }

    // The second budget, for a build that has screens: `anyScript` applies to every emitted file,
    // which is what makes it useful when the names carry hashes and `bundle` budgets cannot.
    const heaviest = Math.max(0, ...report.analysis.screens.map(screen => screen.own));
    const perScreen = screenBudgetAdvice(heaviest);

    return [
        '',
        palette.bold(text.headBudget),
        ...wrap(
            text.budgetNote(`${advice.warningKb}kB`, `${advice.errorKb}kB`, formatBytes(advice.currentBytes)),
            WIDTH,
        ).map(line => palette.dim(line)),
        '',
        ...advice.snippet.split('\n').map(line => `  ${line}`),
        ...(perScreen
            ? [
                  '',
                  ...wrap(text.screenBudgetNote(`${perScreen.warningKb}kB`), WIDTH).map(line => palette.dim(line)),
                  ...perScreen.snippet.split('\n').map(line => `  ${line}`),
              ]
            : []),
    ];
};

/**
 * What the team decided to live with, and what happened to each of those decisions.
 *
 * It is printed rather than silent for the reason acceptances exist at all: a signal that
 * disappears without a trace is a suppression, and the next person cannot tell the difference
 * between "we looked at this" and "nobody ever saw it". An acceptance that ran out or that no
 * longer covers the figure is said out loud here, and the signal itself is back in the list above.
 */
const acceptedBlock = (report: CliReport, palette: Palette): string[] => {
    if (report.accepted.length === 0) {
        return [];
    }

    const text = CLI_TEXT[report.lang];

    const lines = report.accepted.map(item => {
        const { entry, lapse } = item;
        if (lapse === 'expired') {
            return palette.warn(`  ! ${text.acceptedExpired(entry.kind, entry.until ?? '')}`);
        }
        if (lapse === 'grew') {
            return palette.warn(
                `  ! ${text.acceptedGrew(entry.kind, formatBytes(entry.bytes ?? 0), formatBytes(item.finding.saving ?? 0))}`,
            );
        }
        return palette.dim(`  · ${text.accepted(entry.kind, entry.why, entry.who ?? null, entry.until ?? null)}`);
    });

    return ['', palette.bold(text.headAccepted), ...lines];
};

/**
 * "What would the first load weigh without this?", for each name asked about.
 *
 * The saving is exact — the graph walked without those files — and the note under it says what is
 * deliberately not recomputed, because a simulated re-chunking would produce round trips that look
 * exactly like the measured ones and are not.
 */
const whatIfBlock = (report: CliReport, palette: Palette): string[] => {
    if (report.whatIf.length === 0) {
        return [];
    }

    const text = CLI_TEXT[report.lang];

    const rows = report.whatIf.map(result => [
        result.target,
        formatBytes(result.weight),
        palette.bold(formatBytes(result.saved)),
        formatBytes(result.after),
        result.screens.length > 0 ? result.screens.join(', ') : text.whatIfNobody,
    ]);

    return [
        '',
        palette.bold(text.headWhatIf),
        ...wrap(text.whatIfNote, WIDTH).map(line => palette.dim(line)),
        ...table(
            [
                { head: text.colWhatIf, right: false },
                { head: text.colSize, right: true },
                { head: text.colSaving, right: true },
                { head: text.colAfter, right: true },
                { head: text.colWhoPays, right: false },
            ],
            rows,
            palette,
        ),
    ];
};

const gateBlock = (violations: Violation[], anyAsked: boolean, report: CliReport, palette: Palette): string[] => {
    const text = CLI_TEXT[report.lang];
    if (!anyAsked) {
        return ['', palette.dim(text.noGates)];
    }

    const head = ['', palette.bold(text.headGates)];
    if (violations.length === 0) {
        return [...head, `  ${palette.good(text.passed)}`];
    }

    return [
        ...head,
        ...violationLines(violations).map(line => `  ${palette.bad('x')} ${line}`),
        '',
        palette.bad(text.failed(violations.length)),
    ];
};

/** The lead: what was analysed, in which unit, against what, and how the weights were measured. */
const header = (report: CliReport, palette: Palette): string[] => {
    const text = CLI_TEXT[report.lang];
    const lines = [
        palette.bold(report.projectName ? `Loadline · ${report.projectName}` : 'Loadline'),
        palette.dim(text.lead(report.statsName, report.unit)),
    ];

    if (report.comparison) {
        lines.push(
            palette.dim(text.against(report.comparison.baselineName, report.comparison.baselineDate.slice(0, 10))),
        );
    }
    if (report.comparisonBlocked) {
        lines.push(palette.warn(text.blocked));
    }
    if (report.analysis.splitSource === 'sourcemap') {
        lines.push(palette.dim(text.exactSplit));
    }
    // Which file the thresholds came from. A run judged by a committed file and one judged by the
    // recommended values are different runs, and the log should not leave that to be guessed.
    if (report.configName) {
        lines.push(palette.dim(text.configRead(report.configName)));
    }
    // Dropping half a build in silence is the one thing this line stops. An SSR build writes both
    // sides into one stats file, and the page has said which half it is reading since it could.
    if (report.analysis.serverOutputs > 0) {
        lines.push(palette.dim(text.serverLeftOut(report.analysis.serverOutputs)));
    }

    return lines;
};

export const renderText = (report: CliReport, violations: Violation[], anyAsked: boolean, color: boolean): string => {
    const palette = paletteOf(color);
    const text = CLI_TEXT[report.lang];
    const strings = UI[report.lang];
    const { analysis, criteria } = report;

    const verdict = rate(analysis.bootBytes, criteria.bootOk, criteria.bootBad);
    const word = { good: strings.verdictGood, ok: strings.verdictOk, bad: strings.verdictBad }[verdict];
    const headline = verdictPaint(palette, verdict)(`${formatBytes(analysis.bootBytes)}  ${word}`);

    return [
        ...header(report, palette),
        '',
        `${palette.bold(text.headBoot)}  ${headline}`,
        palette.dim(text.bootSummary(analysis.bootFiles, analysis.screens.length)),
        // What the first load really costs. The headline above stays the JavaScript, deliberately:
        // it is the one figure the whole tool is named after and it is the one it can break down.
        // This line is the honest total next to it, with the parts spelled out so nobody has to
        // take the number on trust. The stylesheet alone is the fallback for a report that read a
        // page but no folder, and it is worth saying on its own: a render-blocking stylesheet is
        // the strictest "before anything appears" there is.
        ...firstTripLines(report, palette),
        ...startupLines(report, palette),
        '',
        palette.bold(text.headScreens),
        ...(analysis.screens.length > 0 ? screensTable(report, palette) : [palette.dim(text.noScreens)]),
        '',
        ...actionsBlock(report, palette),
        ...timeBlock(report, palette),
        ...budgetBlock(report, palette),
        '',
        palette.bold(text.headSignals),
        ...report.findings.flatMap(finding => signalBlock(finding, palette, text.fix)),
        ...whatIfBlock(report, palette),
        ...acceptedBlock(report, palette),
        ...gateBlock(violations, anyAsked, report, palette),
        '',
    ].join('\n');
};
