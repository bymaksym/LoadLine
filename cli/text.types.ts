/**
 * The words the command uses that the page never says: gate messages, section headings, the
 * summary line. They are here rather than in `core/i18n` because the page has no use for them,
 * and the page's vocabulary is worth keeping as the vocabulary of the page.
 *
 * The signals themselves are not here: those are already bilingual in `core/findings`, and both
 * sides read them from there.
 */

import { type Effort } from '../src/app/core/findings/effort';
import { type ProfileId } from '../src/app/core/timing/timing.types';

export interface CliStrings {
    /** The lead line: what was analysed and in which unit. */
    lead: (stats: string, unit: string) => string;
    against: (baseline: string, date: string) => string;
    /** What the page asks for besides the code, and what the first load really costs with it. */
    pageCss: (size: string, files: number, total: string) => string;
    /**
     * The whole first trip: everything `index.html` asks for before anything appears, with the
     * breakdown beside the total. It replaces the CSS line when the folder was read, because at
     * that point the report knows about more than the stylesheets.
     */
    firstTrip: (total: string, files: number, parts: string) => string;
    /** Outputs of the build the browser folder does not hold: the server side, left out. */
    serverLeftOut: (count: number) => string;
    blocked: string;
    exactSplit: string;

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
    fix: string;

    passed: string;
    failed: (count: number) => string;
    /** No gate was asked for: the run reports and never fails. */
    noGates: string;

    overBoot: (actual: string, limit: string) => string;
    overScreen: (screen: string, actual: string, limit: string) => string;
    overOwn: (screen: string, actual: string, limit: string) => string;
    growthBoot: (diff: string, limit: string) => string;
    growthScreen: (screen: string, diff: string, limit: string) => string;
    growthPctBoot: (percent: string, limit: string) => string;
    growthPctScreen: (screen: string, percent: string, limit: string) => string;
    /** `level` is the --fail-on value, so each language words the severity itself. */
    signalsRaised: (count: number, level: string) => string;

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
    totalSaving: (bytes: string, after: string, count: number) => string;
    nothingToSave: string;

    profileName: Record<ProfileId, string>;
    /** The estimate label. It is not optional anywhere this appears. */
    timeNote: string;
    timeColumns: { profile: string; transfer: string; latency: string; script: string; total: string };

    budgetNote: (warning: string, error: string, current: string) => string;
    /** The second budget, the one that guards a screen rather than the first load. */
    screenBudgetNote: (warning: string) => string;

    /** "What would the first load weigh without this?" */
    headWhatIf: string;
    whatIfNote: string;
    whatIfNobody: string;
    colWhatIf: string;
    colSize: string;
    colAfter: string;
    colWhoPays: string;

    /** The new-package gate, with every package that came in named. */
    newPackages: (names: string[]) => string;
    /** What `loadline.json` had to say for itself, and what it set aside. */
    configRead: (file: string) => string;
    configProblem: (problem: string) => string;
    accepted: (kind: string, why: string, who: string | null, until: string | null) => string;
    acceptedExpired: (kind: string, until: string) => string;
    acceptedGrew: (kind: string, was: string, now: string) => string;
    headAccepted: string;

    /** The merge-request comment. */
    prFixed: (count: number) => string;
    prNew: (count: number) => string;
    prDetails: string;
    /** The tail of a list cut short: twenty screens over the same limit is one problem, not twenty. */
}
