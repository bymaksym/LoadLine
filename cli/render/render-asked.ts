/**
 * The answers to what the command was asked about by name: `--what-if` and `--why`. Both print
 * only when asked, both answer about a package, a folder or a file, and `--why` quotes the same
 * saving `--what-if` computes, so they live together.
 */

import { formatRemaining, formatSaving, unitScale } from '../../src/app/core/findings/actions';
import { type WhyResult } from '../../src/app/core/whatif/why';
import { type CliReport } from '../report.types';
import { CLI_TEXT } from '../text/text';
import { type Palette, table, WIDTH, wrap } from './terminal';

/**
 * "What would the first load weigh without this?", for each name asked about.
 *
 * The saving is exact — the graph walked without those files — and the note under it says what is
 * deliberately not recomputed, because a simulated re-chunking would produce round trips that look
 * exactly like the measured ones and are not.
 */
export const whatIfBlock = (report: CliReport, palette: Palette): string[] => {
    if (report.whatIf.length === 0) {
        return [];
    }

    const text = CLI_TEXT[report.lang];

    // In the report's unit, like the headline above it: see `unitScale`.
    const scale = unitScale(report.analysis);
    const rows = report.whatIf.map(result =>
        result.measurable
            ? [
                  result.target,
                  formatSaving(result.weight, scale),
                  palette.bold(formatSaving(result.saved, scale)),
                  formatRemaining(report.analysis, result.saved, result.after),
                  result.screens.length > 0 ? result.screens.join(', ') : text.whatIfNobody,
              ]
            : [
                  result.target,
                  // What it weighs in the bootstrap holds even where the saving cannot be worked out.
                  result.files.length > 0 ? formatSaving(result.weight, scale) : '—',
                  // A name nothing matches is not "cannot be measured": it is not there, and a
                  // misspelt package read like a real one that could not be weighed.
                  palette.warn(result.files.length > 0 ? text.whatIfUnknown : text.whatIfAbsent),
                  '—',
                  '—',
              ],
    );
    // "The saving is exact" over a table of nothing but "cannot be measured" said the opposite of
    // the table; why it cannot be is what is worth saying there instead.
    const measured = report.whatIf.some(result => result.measurable);
    const unknown = report.whatIf.some(result => !result.measurable && result.files.length > 0);
    const note = [
        ...(measured ? [scale.estimated ? `${text.whatIfNote} ${text.whatIfEstimated}` : text.whatIfNote] : []),
        ...(unknown ? [text.whatIfUnknownWhy] : []),
    ].join(' ');

    return [
        '',
        palette.bold(text.headWhatIf),
        ...(note ? wrap(note, WIDTH).map(line => palette.dim(line)) : []),
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

/**
 * "Why is this in the first load?", for each name asked about: the chain, then where to cut it.
 * The saving is the `--what-if` figure for the same name, so the two flags cannot disagree.
 */
export const whyBlock = (report: CliReport, palette: Palette): string[] => {
    if (report.why.length === 0) {
        return [];
    }

    const text = CLI_TEXT[report.lang];
    const scale = unitScale(report.analysis);
    const answer = (result: WhyResult): string[] => {
        // Wrapped like the prose around it, and the name bold where it starts: an answer that is a
        // whole sentence ran a hundred and thirty columns past the edge of the report.
        const [first = '', ...rest] = wrap(
            `${result.target} — ${text.whyReach[result.reach]}${result.steps.length > 0 ? ':' : ''}`,
            WIDTH,
        );
        const head = [palette.bold(result.target) + first.slice(result.target.length), ...rest];
        const chain = result.steps.map((step, index) => `    ${index === 0 ? '' : '→ '}${step}`);
        if (result.reach === 'sourced' && result.cut && result.via) {
            const files = [result.cut, ...result.alsoIn];
            const sentence = text.whyCutSourced(files, result.via, formatSaving(result.savesEverywhere, scale));
            return ['', ...head, ...wrap(sentence, WIDTH - 4).map(line => `    ${line}`)];
        }
        if (result.reach !== 'boot') {
            return ['', ...head, ...chain];
        }

        const { screens } = result.defer;
        const through = result.via !== result.target;
        const payers = !through && screens.length > 0 ? screens.join(', ') : null;
        const cut =
            result.cut && result.via
                ? result.saves > 0
                    ? text.whyCut(result.cut, result.via, formatSaving(result.saves, scale), through, payers)
                    : result.alsoIn.length > 0
                      ? text.whyCutAlso(result.cut, result.alsoIn, formatSaving(result.savesEverywhere, scale))
                      : text.whyCutShared(result.cut)
                : text.whyNoCut;
        return ['', ...head, ...chain, ...wrap(cut, WIDTH - 4).map(line => `    ${line}`)];
    };

    return ['', palette.bold(text.headWhy), ...report.why.flatMap(result => answer(result))];
};
