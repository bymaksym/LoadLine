/** The finished analysis, in the shape the three renderers read it from. */

import { type Analysis } from '../src/app/core/analysis/analysis.types';
import { type AssetReport } from '../src/app/core/assets/assets.types';
import { type Comparison, type Snapshot } from '../src/app/core/baseline/baseline.types';
import { type CachingReport } from '../src/app/core/caching/caching.types';
import { type AppliedAcceptance } from '../src/app/core/config/loadline-config';
import { type LoadlineConfig } from '../src/app/core/config/loadline-config.types';
import { type Criteria, type Mode } from '../src/app/core/criteria/criteria.types';
import { type DepsReport } from '../src/app/core/deps/deps.types';
import { type Finding } from '../src/app/core/findings/finding.types';
import { type Lang } from '../src/app/core/i18n/ui-strings';
import { type ScanReport } from '../src/app/core/scan/scan.types';
import { type DeferResult } from '../src/app/core/whatif/defer';

export interface CliReport {
    /** The file the figures came from, so a log says which build it is talking about. */
    statsName: string;
    /**
     * This build reduced to what a later run needs to compare against it: the bootstrap, its
     * packages, every screen, every hashed file name and the signals raised. `--export` writes it.
     */
    snapshot: Snapshot;
    /** From `package.json` or `angular.json`. `null` without `--project`. */
    projectName: string | null;
    mode: Mode;
    /** The unit as words, for the lead line: "gzip-compressed", "raw". */
    unit: string;
    lang: Lang;
    criteria: Criteria;
    analysis: Analysis;
    /**
     * The stylesheets the page asks for, already in the unit of the report. `null` when no folder
     * was read, or when its page names none. Kept beside the analysis rather than inside it: it is
     * a fact about the page and the folder, and no part of the import graph knows it exists.
     */
    pageCssBytes: number | null;
    /**
     * The same stylesheets uncompressed. Angular's `initial` budget counts raw JavaScript **and**
     * CSS whatever unit the report is shown in, so a budget suggested against a gzip figure would
     * guard about a third of what it is meant to.
     */
    pageCssRawBytes: number | null;
    pageCssFiles: number;
    /** What the folder holds besides the code. `null` without a folder to read. */
    assets: AssetReport | null;
    /**
     * What an update costs rather than a first visit: the half of the real cost nobody looks at.
     * The delta itself is `null` without a baseline that carries file names; the other two figures
     * come out of this build alone.
     */
    caching: CachingReport;
    /**
     * What reading the text of the build says: keys left in it, development leftovers, licences,
     * whose services it carries. `null` when there was no folder to read the text of.
     */
    scan: ScanReport | null;
    /** What the lock file and the audit report say, crossed with what ships. */
    deps: DepsReport;
    /** One answer per `--what-if`, in the order they were asked. Empty when none was. */
    whatIf: DeferResult[];
    comparison: Comparison | null;
    /** A baseline measured in another unit: the figures are not comparable and nothing is shown. */
    comparisonBlocked: boolean;
    /**
     * The signals, with whatever `loadline.json` accepted taken out. An acceptance that ran out or
     * that no longer covers the figure is **not** taken out: it is in here, and `accepted` says so.
     */
    findings: Finding[];
    /** What was accepted and what happened to each acceptance, so the run can print it. */
    accepted: AppliedAcceptance[];
    /** `loadline.json` as it was read. `null` when there was none. */
    config: LoadlineConfig | null;
    /** The path it came from, for the lead line. `null` when no file was read. */
    configName: string | null;
    /** What was wrong with it. Printed rather than thrown: the report is what the person came for. */
    configProblems: string[];
}
