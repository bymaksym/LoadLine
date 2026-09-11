/**
 * The order the signals are read in. Which signals exist is `findings.ts`; this is the separate
 * decision of what leads and what is a footnote, and it is kept apart because the page and the
 * command both make it. Two copies of this ordering would mean the terminal and the report
 * disagreeing about what the main problem is.
 */

import { type Finding } from './finding.types';

export interface FindingSources {
    /** From the analysis alone. Carries the "nothing stands out" card when there is nothing to say. */
    base: Finding[];
    /** Against the baseline. Read before the project files: a regression beats a configuration note. */
    fromComparison: Finding[];
    /** From `angular.json`, `package.json` and the pipeline. */
    fromContext: Finding[];
    /** From a browser measurement. Empty outside the page: nothing measures a browser in CI. */
    fromMeasurement: Finding[];
    /**
     * From the build folder itself rather than from the metafile — what is in it besides the code.
     * Optional: without the folder there is nothing to say.
     */
    fromBuild?: Finding[];
}

/** `info` and `ok` are context, not something to act on. */
const isProblem = (finding: Finding): boolean => finding.severity === 'high' || finding.severity === 'mid';

export const composeFindings = (sources: FindingSources): Finding[] => {
    const { base, fromComparison, fromContext, fromMeasurement, fromBuild = [] } = sources;
    const extra = [...fromComparison, ...fromContext, ...fromBuild];
    if (extra.length === 0 && fromMeasurement.length === 0) {
        return base;
    }

    // A browser measurement leads: it is the only part of the report that was measured rather than
    // computed, so what it says about that screen overrules what was worked out.
    const problems = [
        ...fromMeasurement.filter(finding => isProblem(finding)),
        ...base.filter(finding => isProblem(finding)),
        ...extra.filter(finding => isProblem(finding)),
    ];

    /**
     * The "nothing stands out" card only makes sense when nothing else is there to read, and what
     * "else" means is a **problem** — not any card at all.
     *
     * It used to mean any card, because `base` was kept whole or dropped whole on the strength of
     * anything in it that was not `ok`. Every context card in `base` therefore counted: a build with
     * no problems and one informative note lost the card that says it is fine, and read as a report
     * with a finding in it. One test build exists precisely to catch that shape — an application with
     * nothing lazy at all, which has to say "everything is in the bootstrap" and stay a report — and
     * it is what caught this.
     */
    const notes = [...base, ...fromMeasurement, ...extra]
        .filter(finding => !isProblem(finding))
        .filter(finding => problems.length === 0 || finding.kind !== 'clean');

    return [...problems, ...notes];
};
