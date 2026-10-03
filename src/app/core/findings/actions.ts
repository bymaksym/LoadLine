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
import { formatBytes } from '../format/format.utils';
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

/**
 * A saving in the unit the report is in.
 *
 * Every saving is computed in raw bytes, because that is the only scale a module has: gzip
 * compresses a chunk as a whole. But a report in gzip that says "takes 302 kB off" a bootstrap of
 * 258 kB has the reader comparing two units as if they were one, and the saving comes out three
 * times what it is — on the one figure somebody decides an afternoon by.
 *
 * So in a compressed report the raw saving is carried over at the ratio the bootstrap itself
 * compresses by, and marked as an estimate. Text compresses better than code and a vendor library
 * worse, so it is a figure of the right size, not an exact one, and it says so with `≈`. In a raw
 * report nothing is converted and nothing is estimated.
 */
export interface UnitScale {
    /** Bytes in the report's unit per raw byte of the bootstrap. `1` in a raw report. */
    ratio: number;
    /** `true` when the figures are converted, and therefore approximate. */
    estimated: boolean;
}

export const unitScale = (analysis: Analysis): UnitScale => {
    const estimated = analysis.bootRawBytes > 0 && analysis.bootBytes !== analysis.bootRawBytes;
    return { ratio: estimated ? analysis.bootBytes / analysis.bootRawBytes : 1, estimated };
};

/** Raw bytes in the report's unit. */
export const inUnit = (bytes: number, scale: UnitScale): number => Math.round(bytes * scale.ratio);

/** A saving as it is printed: `≈93 kB` when it is an estimate, `302 kB` when it is not. Zero is exact. */
export const formatSaving = (bytes: number, scale: UnitScale): string =>
    `${scale.estimated && bytes > 0 ? '≈' : ''}${formatBytes(inUnit(bytes, scale))}`;

/**
 * The first load a saving leaves, in the report's unit. Converted, it comes off the bootstrap the
 * report heads with — not off the raw walk, which is a different figure in a different unit.
 */
export const remainingInUnit = (analysis: Analysis, saved: number, rawAfter: number): number => {
    const scale = unitScale(analysis);
    return scale.estimated ? Math.max(0, analysis.bootBytes - inUnit(saved, scale)) : rawAfter;
};

/** That first load as it is printed, with `≈` when it is an estimate. */
export const formatRemaining = (analysis: Analysis, saved: number, rawAfter: number): string =>
    `${unitScale(analysis).estimated ? '≈' : ''}${formatBytes(remainingInUnit(analysis, saved, rawAfter))}`;

/**
 * The figures of "fixing all of it would take X off, leaving it at about Y", as text. `after`
 * carries no `≈`: the sentence it goes into already says "about".
 */
export const savingWords = (
    analysis: Analysis,
    total: TotalSaving,
): { saving: string; after: string; estimated: boolean } => {
    const scale = unitScale(analysis);
    return {
        saving: formatSaving(total.bytes, scale),
        after: formatBytes(remainingInUnit(analysis, total.bytes, total.after)),
        estimated: scale.estimated,
    };
};

/** What all of it is worth, in the report's unit: the saving and the first load it leaves. */
export const savingInUnit = (
    analysis: Analysis,
    total: TotalSaving,
): { bytes: number; after: number; estimated: boolean } => {
    const scale = unitScale(analysis);
    return {
        bytes: inUnit(total.bytes, scale),
        after: remainingInUnit(analysis, total.bytes, total.after),
        estimated: scale.estimated,
    };
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

/** Most severe first. `ok` never reaches the list: a verdict that all is well is not a task. */
const SEVERITY_RANK: Record<Finding['severity'], number> = { high: 0, mid: 1, info: 2, ok: 3 };

/**
 * The signals in the order somebody would do them.
 *
 * **Severity first, then bytes per unit of effort.** Sorting by score alone put twelve medium and
 * informative signals ahead of a high one that names no saving in kilobytes — a key leaked into the
 * bundle saves nothing and is still the first thing anybody should touch. The score orders within a
 * severity, which is where comparing kilobytes against effort makes sense.
 *
 * Only what can be acted on: a signal whose effort is `none` is context — a verdict, a note about
 * the report itself, a growth against the baseline — and putting "the bootstrap has grown" on a
 * list of things to do would be a category mistake. **A high one is the exception**: whatever its
 * effort, leaving it out of "what to fix first" is how the summary came to list three medium
 * signals and skip the one that mattered.
 */
export const rankActions = (findings: readonly Finding[]): Action[] =>
    findings
        .map((finding): Action => {
            const effort = EFFORT[finding.kind];
            const saving = finding.saving ?? 0;
            const weight = EFFORT_WEIGHT[effort];
            return { finding, saving, effort, score: weight > 0 ? saving / weight : 0 };
        })
        .filter(action => action.effort !== 'none' || action.finding.severity === 'high')
        .filter(action => action.finding.severity !== 'ok')
        .toSorted(
            (a, b) =>
                SEVERITY_RANK[a.finding.severity] - SEVERITY_RANK[b.finding.severity] ||
                b.score - a.score ||
                b.saving - a.saving,
        );
