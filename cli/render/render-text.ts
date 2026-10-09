/**
 * The report as a person reads it in a terminal. Same message as the page, in the order the page
 * puts it: the headline first, then one row per screen on the same three segments, then the
 * signals with what to do about each one.
 *
 * Colour is an extra, never the message: every line says what it means in words too, because half
 * the places this runs strip the escape codes.
 */

import { toolLabel } from '../../src/app/core/analysis/tool';
import { routeStylesOf } from '../../src/app/core/assets/assets';
import { rate } from '../../src/app/core/criteria/criteria';
import { type Verdict } from '../../src/app/core/criteria/criteria.types';
import { formatSaving, rankActions, savingWords, totalSaving, unitScale } from '../../src/app/core/findings/actions';
import { type Finding, type Severity } from '../../src/app/core/findings/finding.types';
import { plainText } from '../../src/app/core/findings/text/finding-plain';
import { baseName, formatBytes, formatDelta } from '../../src/app/core/format/format.utils';
import { UI } from '../../src/app/core/i18n/ui';
import { budgetAdvice, screenBudgetAdvice } from '../../src/app/core/project/budget-advice';
import { formatMs, timingsOf } from '../../src/app/core/timing/timing';
import { blindBoot, opaqueBootChunks } from '../../src/app/core/whatif/defer';
import { violationLines } from '../gates';
import { type Violation } from '../gates.types';
import { type CliReport } from '../report.types';
import { sinceLastLine } from '../since-last';
import { CLI_TEXT } from '../text/text';
import { whatIfBlock, whyBlock } from './render-asked';
import { type Column, type Paint, type Palette, paletteOf, table, WIDTH, wrap } from './terminal';

const verdictPaint = (palette: Palette, verdict: Verdict): Paint =>
    verdict === 'good' ? palette.good : verdict === 'ok' ? palette.warn : palette.bad;

const severityPaint = (palette: Palette, severity: Severity): Paint =>
    severity === 'high' ? palette.bad : severity === 'mid' ? palette.warn : palette.dim;

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
    return wrap(note, WIDTH).map(line => palette.dim(line));
};

/**
 * Everything the page asks for before anything appears, or — without a folder to read — just the
 * stylesheets, which is as much of it as a page alone can say.
 */
/** The heaviest few of a list, by name and weight, and how many more there are. */
const fewOf = (entries: readonly { label: string; bytes: number }[]): string => {
    const shown = entries.slice(0, 3).map(entry => `${entry.label} ${formatBytes(entry.bytes)}`);
    return entries.length > 3 ? `${shown.join(', ')}, +${entries.length - 3}` : shown.join(', ');
};

/**
 * What loads lazily and has no row in the table above, under it — where HOW-IT-WORKS always said
 * these lists were. Only the JSON carried them, so a build whose lazy parts are features rather
 * than routes read as having five screens and nothing else.
 */
const notScreenLines = (report: CliReport, palette: Palette): string[] => {
    const text = CLI_TEXT[report.lang];
    const { analysis } = report;
    const kinds = [
        ['blocks', analysis.deferredBlocks],
        ['groupers', analysis.routeGroupers],
        ['packages', analysis.lazyPackages],
        ['data', analysis.lazyData],
        ['workers', analysis.lazyWorkers],
        ['onDemand', analysis.lazyOnDemand],
    ] as const;
    const parts = kinds
        .filter(([, entries]) => entries.length > 0)
        .map(([kind, entries]) => text.notScreensPart[kind](entries.length, fewOf(entries)));
    // Said only where it could have been found: a stats file carries no code to look in.
    const untabled = analysis.routeTable === false && analysis.screens.length > 0 ? [text.noRouteTable] : [];
    return [...(parts.length > 0 ? [text.notScreens(parts)] : []), ...untabled].flatMap(line =>
        wrap(line, WIDTH).map(part => palette.dim(part)),
    );
};

/** The stylesheets of the lazy routes, named under the table: see `routeStylesOf`. */
const routeCssLines = (report: CliReport, palette: Palette): string[] => {
    const own = report.assets ? routeStylesOf(report.assets) : [];
    if (own.length === 0) {
        return [];
    }

    const list = own.length > 3 ? `${own.slice(0, 3).join(', ')}, +${own.length - 3}` : own.join(', ');
    return wrap(CLI_TEXT[report.lang].routeCss(own.length, list), WIDTH).map(line => palette.dim(line));
};

/**
 * A screen's name with the routes that open it, when they say something its name does not: `Home ·
 * global-feed, my-feed +1`. The router's name for a page is what the team calls it.
 */
const withRoutes = (label: string, routes: readonly string[]): string => {
    const other = routes.filter(route => route !== label);
    if (other.length === 0) {
        return label;
    }
    const shown = other.slice(0, 2).join(', ');
    const cell = `${label} · ${other.length > 2 ? `${shown} +${other.length - 2}` : shown}`;
    // The routes are a hint beside the name, not a column: a path that runs on is cut, never the table.
    return cell.length > ROUTES_CELL ? `${cell.slice(0, ROUTES_CELL - 1)}…` : cell;
};

/** Widest a screen's name gets with its routes beside it. */
const ROUTES_CELL = 48;

const firstTripLines = (report: CliReport, palette: Palette): string[] => {
    const text = CLI_TEXT[report.lang];
    const trip = report.assets?.firstTrip;

    if (trip && trip.total > 0) {
        // The parts that are there: "0 B fonts" is a part of nothing.
        const parts = (
            [
                [trip.scripts, trip.inline > 0 ? `JS ${text.tripInline(formatBytes(trip.inline))}` : 'JS'],
                [trip.styles, 'CSS'],
                [trip.fonts, text.tripFonts],
                [trip.images, text.tripImages],
            ] as const
        )
            .filter(([bytes]) => bytes > 0)
            .map(([bytes, label]) => `${formatBytes(bytes)} ${label}`)
            .join(' + ');
        return wrap(text.firstTrip(formatBytes(trip.total), trip.files, parts), WIDTH).map(line => palette.warn(line));
    }

    if (report.pageCssBytes === null) {
        return [];
    }

    return wrap(
        text.pageCss(
            formatBytes(report.pageCssBytes),
            report.pageCssFiles,
            formatBytes(report.analysis.bootBytes + report.pageCssBytes),
        ),
        WIDTH,
    ).map(line => palette.warn(line));
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
    // Against the explicit baseline when there is one; otherwise against the last run, so the table
    // says which screen moved without anybody having asked for a comparison.
    const against = comparison ?? report.sinceLast;
    if (against) {
        columns.push({
            head: comparison ? `${strings.colDelta} ${comparison.baselineName}` : strings.colDelta,
            right: true,
        });
    }

    const rows = analysis.screens.map(screen => {
        const verdict = rate(screen.total, criteria.screenOk, criteria.screenBad);
        const cells = [
            withRoutes(screen.label, screen.routes ?? []),
            formatBytes(screen.boot),
            formatBytes(screen.shared),
            formatBytes(screen.own),
            verdictPaint(palette, verdict)(formatBytes(screen.total)),
            String(screen.waves),
        ];
        if (against) {
            const delta = against.screens.get(screen.source);
            cells.push(delta ? formatDelta(delta.total.diff) : strings.compareNew);
        }
        return cells;
    });

    return table(columns, rows, palette);
};

const signalBlock = (
    finding: Finding,
    palette: Palette,
    fixLabel: string,
    severity: Record<Finding['severity'], string>,
): string[] => {
    // The name `accepted` in loadline.json takes, in grey after the chip: living with a signal
    // used to start with guessing its kind and key.
    const key = finding.target?.key;
    const name = palette.dim(`[${finding.kind}${key ? ` · ${key}` : ''}]`);
    const head = `${severityPaint(palette, finding.severity)(`${severity[finding.severity].padEnd(5)} · ${plainText(finding.chip)}`)} ${name}`;
    const indent = (line: string): string => `      ${line}`;
    const body = wrap(plainText(finding.body), WIDTH - 6).map(element => indent(element));
    const fix = finding.fix ? wrap(`${fixLabel}: ${plainText(finding.fix)}`, WIDTH - 6).map(l => indent(l)) : [];

    return [
        '',
        `  ${head}`,
        `    ${palette.bold(plainText(finding.title))}`,
        ...body,
        ...(fix.length > 0 ? ['', ...fix] : []),
    ];
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
    const scale = unitScale(report.analysis);
    const rows = actions.map((action, index) => [
        `${index + 1}.`,
        severityPaint(palette, action.finding.severity)(plainText(action.finding.title)),
        text.savingCell(action.saving > 0 ? formatSaving(action.saving, scale) : ''),
        text.effortLabel[action.effort],
    ]);

    const total = totalSaving(report.analysis, report.findings);
    // Said only when there is a figure. "No signal here names a saving that can be measured" under
    // a table whose saving column is all dashes repeated what the column had already said.
    const words = savingWords(report.analysis, total);
    // A column of dashes over chunks nobody can see into is "not known", and without a line saying
    // so it reads as "nothing here saves anything".
    const summary =
        total.counted > 0 && total.bytes > 0
            ? text.totalSaving(words.saving, words.after, total.counted, words.estimated)
            : blindBoot(report.analysis)
              ? text.savingUnknown
              : null;

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
        ...(summary ? ['', ...wrap(summary, WIDTH).map(line => palette.dim(line))] : []),
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
    const advice = wanted ? budgetAdvice(report.analysis.initialRawBytes) : null;
    if (!advice) {
        return [];
    }

    // The second budget, for a build that has screens: `anyScript` applies to every emitted file —
    // the bootstrap's too — which is what makes it useful when the names carry hashes and `bundle`
    // budgets cannot, and why it is set above the largest script and not above a screen.
    const largest = report.analysis.largestScript;
    const perScreen = report.analysis.screens.length > 0 && largest ? screenBudgetAdvice(largest.bytes) : null;

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
                  ...wrap(
                      text.screenBudgetNote(
                          `${perScreen.warningKb}kB`,
                          largest?.name ?? '',
                          formatBytes(perScreen.currentBytes),
                      ),
                      WIDTH,
                  ).map(line => palette.dim(line)),
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
        palette.dim(text.lead(report.statsName, report.unit, toolLabel(report.analysis.tool))),
    ];

    if (report.comparison) {
        lines.push(
            palette.dim(text.against(report.comparison.baselineName, report.comparison.baselineDate.slice(0, 10))),
        );
    }
    if (report.comparisonBlocked) {
        lines.push(palette.warn(text.blocked(report.baselineMode ?? 'raw', report.mode)));
    }
    if (report.located.length > 0) {
        lines.push(palette.dim(text.located(report.located.join(' + '))));
    }
    const since = sinceLastLine(report);
    if (since) {
        lines.push(palette.bold(since));
    }
    if (report.analysis.splitSource === 'sourcemap') {
        lines.push(palette.dim(text.exactSplit));
    }
    // In the lead and in warning colour: it changes how every figure below is read, and the signal
    // that explains it is several cards down, where it was the only place it was said.
    const unseen = opaqueBootChunks(report.analysis);
    if (blindBoot(report.analysis)) {
        lines.push(...wrap(text.opaque, WIDTH).map(line => palette.warn(line)));
    } else if (unseen.length > 0) {
        // One chunk without its map in a folder that has them: named, with its weight, so it is
        // read as the corner it is and not as the whole report going blind.
        const named = unseen.map(
            chunk => `${baseName(chunk)} (${formatBytes(report.analysis.chunkOf(chunk)?.bytes ?? 0)})`,
        );
        lines.push(...wrap(text.opaqueSome(named.join(', '), unseen.length), WIDTH).map(line => palette.dim(line)));
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
    // And the other reason the metafile names files the folder does not hold. Said once, so the
    // difference between the two is explained rather than left for somebody to count by hand.
    if (report.analysis.componentStyles > 0) {
        lines.push(palette.dim(text.componentStyles(report.analysis.componentStyles)));
    }
    // A folder holds files the page never downloads as part of a screen, and the reader found them.
    const { offPage } = report.analysis;
    if (offPage.legacy + offPage.serviceWorker + offPage.server + offPage.ignored > 0) {
        lines.push(palette.dim(text.offPageLeftOut(offPage)));
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
        ...notScreenLines(report, palette),
        ...routeCssLines(report, palette),
        '',
        ...actionsBlock(report, palette),
        ...timeBlock(report, palette),
        ...budgetBlock(report, palette),
        '',
        palette.bold(text.headSignals),
        ...report.findings.flatMap(finding => signalBlock(finding, palette, text.fix, text.severity)),
        ...whatIfBlock(report, palette),
        ...whyBlock(report, palette),
        ...acceptedBlock(report, palette),
        ...gateBlock(violations, anyAsked, report, palette),
        '',
    ].join('\n');
};
