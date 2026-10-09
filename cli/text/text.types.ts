/**
 * The words the command uses that the page never says: gate messages, section headings, the
 * summary line. They are here rather than in `core/i18n` because the page has no use for them,
 * and the page's vocabulary is worth keeping as the vocabulary of the page.
 *
 * The signals themselves are not here: those are already bilingual in `core/findings`, and both
 * sides read them from there.
 */

import { type OffPageOutputs } from '../../src/app/core/analysis/analysis.types';
import { type Effort } from '../../src/app/core/findings/effort';
import { type ProfileId } from '../../src/app/core/timing/timing.types';
import { type WhyReach } from '../../src/app/core/whatif/why';

export interface CliStrings {
    /** The lead line: what was analysed and in which unit. */
    lead: (stats: string, unit: string, tool: string | null) => string;
    against: (baseline: string, date: string) => string;
    /** What the page asks for besides the code, and what the first load really costs with it. */
    pageCss: (size: string, files: number, total: string) => string;
    /**
     * The whole first trip: everything `index.html` asks for before anything appears, with the
     * breakdown beside the total. It replaces the CSS line when the folder was read, because at
     * that point the report knows about more than the stylesheets.
     */
    firstTrip: (total: string, files: number, parts: string) => string;
    tripInline: (size: string) => string;
    /** Outputs of the build the browser folder does not hold: the server side, left out. */
    /** Where `--html` wrote the page, on stderr so the report on stdout stays clean. */
    htmlWritten: (file: string) => string;
    /** The level in front of each signal. The `[kind · key]` after it stays as it is: it is what `accepted` takes. */
    severity: Record<'high' | 'mid' | 'ok' | 'info', string>;
    /** Said on stderr, like the page: a file written without a word is one nobody knows is there. */
    exportWritten: (file: string) => string;
    /** The `--html` page went inside the build folder, which the next build empties. */
    htmlInsideBuild: (folder: string) => string;
    /** What was found inside a build root, for the lead line. */
    located: (files: string) => string;
    /** The other builds a project folder held, when the newest was taken. */
    alsoFound: (folders: string) => string;
    /** The last run and this one are the same build, as far as the figures go. */
    lastRunUnchanged: string;
    /** The parts of the first trip that are not code, named in the report's language. */
    tripFonts: string;
    tripImages: string;
    /** Component stylesheets the metafile names apart and Angular inlines into the JavaScript. */
    componentStyles: (count: number) => string;
    /** Files of the folder no screen downloads, left out: the `nomodule` copy, the service worker. */
    offPageLeftOut: (off: OffPageOutputs) => string;
    /** The change against the previous run of the command, remembered without a `--baseline`. */
    /** `branch` only when the remembered run was made on another branch than the one checked out. */
    sinceLast: (date: string, change: string, branch: string | null) => string;
    serverLeftOut: (count: number) => string;
    /** The two units, and the `--mode` that would make them one. */
    blocked: (baseline: string, now: string) => string;
    exactSplit: string;
    /**
     * A folder read without source maps, said in the lead: it decides how every figure below is
     * read, and the signal that explains it sits several cards down.
     */
    opaque: string;
    /** Some bootstrap chunks, not all, came without a source map: named, so they are not read as all. */
    opaqueSome: (chunks: string, count: number) => string;

    headBoot: string;
    headScreens: string;
    headSignals: string;
    headGates: string;
    /** The ranked list of what to do, which is an order over the signals and never a selection. */
    headActions: string;
    /** Bytes as an estimate of seconds. Labelled an estimate everywhere it appears. */
    headTime: string;
    /** The budget that should be in `angular.json`, with the block to paste. */
    headBudget: string;

    bootSummary: (files: number, screens: number) => string;
    noScreens: string;
    /**
     * The lazy entries the screens table has no row for, kind by kind, each with its count and its
     * heaviest names. The JSON carried them and the text never said they existed.
     */
    notScreens: (parts: string[]) => string;
    notScreensPart: Record<
        'blocks' | 'groupers' | 'packages' | 'data' | 'workers' | 'onDemand',
        (count: number, list: string) => string
    >;
    /**
     * The stylesheets screens load of their own. Left out of every total — the figures are
     * JavaScript — and said under the table, where leaving them out silently read as "no CSS".
     */
    routeCss: (count: number, list: string) => string;
    /**
     * Under the table of a build read from its folder whose code has no route table this can read:
     * then every lazy chunk is a screen, and some of them are tabs or components.
     */
    noRouteTable: string;
    fix: string;

    passed: string;
    failed: (count: number) => string;
    /** No gate was asked for: the run reports and never fails. */
    noGates: string;

    overBoot: (actual: string, limit: string) => string;
    /** A screen limit of `loadline.json` that names no screen, with the names that do exist. */
    screenLimitUnmatched: (name: string, screens: string[]) => string;
    /** Added to `blocked` when a growth gate was asked for: it cannot run, so the run stops. */
    growthUnchecked: string;
    /** `--fail-on-new-package` typed with nothing to say what was there before. */
    newPackageUnchecked: string;
    /** The same two gates written in `loadline.json`, on a run with no baseline: said and skipped. */
    configGrowthSkipped: string;
    configNewPackageSkipped: string;
    overScreen: (screen: string, actual: string, limit: string) => string;
    overOwn: (screen: string, actual: string, limit: string) => string;
    growthBoot: (diff: string, limit: string) => string;
    growthScreen: (screen: string, diff: string, limit: string) => string;
    growthPctBoot: (percent: string, limit: string) => string;
    growthPctScreen: (screen: string, percent: string, limit: string) => string;
    /** `level` is the --fail-on value, so each language words the severity itself. */
    signalsRaised: (count: number, level: string) => string;
    /** A signal `gates.failOnSignals` names was raised, `count` times. */
    signalRaised: (kind: string, count: number) => string;

    /** Why the ranked list is an order and not a shortlist. */
    actionsNote: string;
    /** Column headings of that list: what it is, what it saves, what it costs to do. */
    colAction: string;
    colSaving: string;
    colEffort: string;
    /** How much work each kind of signal is, as words. `none` never appears in the list. */
    effortLabel: Record<Effort, string>;
    /** A saving cell: the figure, or a dash when the signal has none that can be measured. */
    savingCell: (saving: string) => string;
    /** `estimated`: the figures were carried from raw bytes into a compressed unit, and say so. */
    totalSaving: (bytes: string, after: string, count: number, estimated: boolean) => string;

    profileName: Record<ProfileId, string>;
    /** The estimate label. It is not optional anywhere this appears. */
    timeNote: string;
    timeColumns: { profile: string; transfer: string; latency: string; script: string; total: string };

    budgetNote: (warning: string, error: string, current: string) => string;
    /** The second budget, `anyScript`: set above the largest script, which it applies to as well. */
    screenBudgetNote: (warning: string, file: string, size: string) => string;

    /** "What would the first load weigh without this?" */
    headWhatIf: string;
    whatIfNote: string;
    whatIfNobody: string;
    /** Under the what-if table when the report is compressed: why its figures carry `≈`. */
    whatIfEstimated: string;
    /** On stderr, when `--what-if` was asked of a format that does not print it. */
    whatIfNotHere: (format: string) => string;
    colWhatIf: string;
    /** "Why is this in the first load, and where would it be cut?" */
    headWhy: string;
    /** Where the name sits, as the line after it: see `WhyReach`. */
    whyReach: Record<WhyReach, string>;
    /**
     * The file where an `import()` would go, of what, and what it saves. `through` is set when
     * that is not the target but the package that pulls it in; `payers` only when it is the target.
     */
    whyCut: (file: string, what: string, saved: string, through: boolean, payers: string | null) => string;
    /** In the first load and cutting it saves nothing: it arrives by another way as well. */
    /** Cutting in one file saves nothing because others import it too: which, and what all of them would. */
    whyCutAlso: (file: string, others: string[], everywhere: string) => string;
    /** A folder build: the files whose own source imports it, and the most a cut there could save. */
    whyCutSourced: (files: string[], what: string, upTo: string) => string;
    whyCutShared: (file: string) => string;
    /** The entry point imports it itself: there is no file of yours in between. */
    whyNoCut: string;
    /** On stderr, when `--why` was asked of a format that does not print it. */
    whyNotHere: (format: string) => string;
    /** A what-if cell the folder cannot answer: "not known", where a zero would read as "none". */
    whatIfUnknown: string;
    /** A name nothing in the build matches. */
    whatIfAbsent: string;
    /** Why a saving cannot be worked out, said once under the table. */
    whatIfUnknownWhy: string;
    /** Under the actions when no saving can be measured because the chunks are opaque. */
    savingUnknown: string;
    colSize: string;
    colAfter: string;
    colWhoPays: string;

    /** The new-package gate, with every package that came in named. */
    newPackages: (names: string[]) => string;
    /** What `loadline.json` had to say for itself, and what it set aside. */
    configRead: (file: string) => string;
    /** Prefixed with the file it is about: a `--config` named otherwise was called loadline.json. */
    configProblem: (file: string, problem: string) => string;
    accepted: (kind: string, why: string, who: string | null, until: string | null) => string;
    acceptedExpired: (kind: string, until: string) => string;
    acceptedGrew: (kind: string, was: string, now: string) => string;
    headAccepted: string;

    /** The merge-request comment. */
    prFixed: (count: number) => string;
    prNew: (count: number) => string;
    prDetails: string;
    /** After a signal's text cut to fit a comment: where the whole of it is. */
    prCut: string;
    /** The tail of a list cut short: twenty screens over the same limit is one problem, not twenty. */
}
