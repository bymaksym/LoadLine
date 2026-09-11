/**
 * What to fix first, and what fixing all of it is worth.
 *
 * Thirty-seven signals well found and in no order are thirty-seven signals nobody reads. These two
 * figures are what turns the report from a description into a decision, and neither of them drops
 * anything: the ranking is an **order**, and every signal is still there underneath it, which is
 * the rule this project holds itself to about grouping rather than trimming.
 *
 * The total is not a sum. Two signals often name the same bytes arriving by two routes — a package
 * in the bootstrap and the barrel that imports it — and adding their savings would promise twice
 * what removing both gives. It is one walk of the graph with every named file taken out at once.
 */

import { type Analysis } from '../analysis/analysis.types';
import { EFFORT, type Effort, EFFORT_WEIGHT } from './effort';
import { type Finding } from './finding.types';

/** What the whole list of signals is worth, with the ceiling it is a fraction of. */
export interface TotalSaving {
    /** Bytes off the first load if every signal that names files were acted on. */
    bytes: number;
    /** What the bootstrap holds today, as the same walk counts it. */
    before: number;
    /** `before - bytes`. What the first load would weigh with all of it done. */
    after: number;
    /** How many signals contributed a figure. The rest have no measurable saving. */
    counted: number;
}

/**
 * Everything the signals are worth together.
 *
 * The figures are raw minified bytes inside the chunk, which is the only scale a per-module saving
 * can honestly be in: gzip compresses a chunk as a whole, so there is no compressed share of one
 * module to subtract.
 */
export const totalSaving = (analysis: Analysis, findings: readonly Finding[]): TotalSaving => {
    const insights = analysis.insights();
    const files = new Set<string>();
    let counted = 0;

    for (const finding of findings) {
        if (!finding.sources || finding.sources.length === 0) {
            continue;
        }

        counted += 1;
        for (const file of finding.sources) {
            files.add(file);
        }
    }

    const bytes = files.size > 0 ? insights.exclusiveOf(files) : 0;
    return { bytes, before: insights.bootTotal, after: Math.max(0, insights.bootTotal - bytes), counted };
};

/** One line of the "what to do first" list. */
export interface Action {
    finding: Finding;
    /** Bytes off the first load. `0` when the signal has no measurable saving. */
    saving: number;
    effort: Effort;
    /**
     * What the ranking sorts by: bytes per unit of effort. A configuration change worth 90 kB
     * beats a refactor worth 400, which is exactly the ordering a list sorted by bytes gets wrong.
     */
    score: number;
}

/**
 * The signals in the order somebody would do them.
 *
 * Only what can be acted on: a signal whose effort is `none` is context — a verdict, a note about
 * the report itself, a growth against the baseline — and putting "the bootstrap has grown" on a
 * list of things to do would be a category mistake.
 */
export const rankActions = (findings: readonly Finding[]): Action[] =>
    findings
        .map((finding): Action => {
            const effort = EFFORT[finding.kind];
            const saving = finding.saving ?? 0;
            const weight = EFFORT_WEIGHT[effort];
            return { finding, saving, effort, score: weight > 0 ? saving / weight : 0 };
        })
        .filter(action => action.effort !== 'none')
        .toSorted(
            (a, b) =>
                b.score - a.score ||
                // With nothing to weigh them by, the severity the signal already carries decides.
                Number(b.finding.severity === 'high') - Number(a.finding.severity === 'high'),
        );
