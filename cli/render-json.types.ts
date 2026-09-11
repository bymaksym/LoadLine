/**
 * The machine-readable contract. It is written out as an interface rather than assembled ad hoc
 * because something else parses it: a dashboard, a bot posting on a merge request, the next job of
 * the pipeline. Adding a field is safe; renaming or removing one is not, and `version` is what says
 * so out loud.
 *
 * Every size is a number of bytes in the unit `mode` names. Ratios are fractions, not percentages.
 */

import {
    type DuplicateAsset,
    type FirstTrip,
    type FontFamily,
    type InlinedData,
    type MediaFile,
} from '../src/app/core/assets/assets.types';
import { type CachingReport } from '../src/app/core/caching/caching.types';
import { type Mode } from '../src/app/core/criteria/criteria.types';
import { type DepsReport } from '../src/app/core/deps/deps.types';
import { type Effort } from '../src/app/core/findings/effort';
import { type FindingKind, type Severity } from '../src/app/core/findings/finding.types';
import { type ScanReport } from '../src/app/core/scan/scan.types';
import { type ProfileId } from '../src/app/core/timing/timing.types';
import { type GateName } from './gates.types';

export interface JsonDelta {
    before: number;
    after: number;
    diff: number;
    ratio: number;
}

export interface JsonScreen {
    label: string;
    /** The source file of the screen: its identifier across builds, where the label is not. */
    source: string;
    files: number;
    boot: number;
    shared: number;
    own: number;
    total: number;
    verdict: 'good' | 'ok' | 'bad';
    /** Against the baseline, on the total. `null` without one, or for a screen that is new. */
    delta: JsonDelta | null;
}

/**
 * A lazy entry that is not a screen: a piece of one, or a file that only groups routes. They are
 * here for the same reason the report lists them — a screens table with entries silently left out
 * is a count nobody can check — and because this classification is asserted against a real build of
 * each framework, it being the one thing about a build that changes when a framework changes shape.
 */
export interface JsonEntry {
    label: string;
    /** The source file the entry originates from: its identifier across builds. */
    source: string;
    bytes: number;
}

export interface JsonChunk {
    file: string;
    name: string;
    bytes: number;
    /** How many screens load it. The figure no other tool gives. */
    screens: number;
    mainContent: string;
}

/**
 * One line of the ranked list: what to do, what it takes off the first load, what it costs.
 *
 * It is an order over `findings` and never a selection — the same signals are all in that array —
 * so whatever reads this can present either, and a bot that only prints the top three is making
 * that decision itself rather than inheriting it from here.
 */
export interface JsonAction {
    kind: FindingKind;
    title: string;
    /** Raw minified bytes off the first load. `0` when the signal has none that can be measured. */
    saving: number;
    effort: Effort;
}

/** One figure of the report as an estimate of milliseconds, on one connection profile. */
export interface JsonTiming {
    profile: ProfileId;
    transferMs: number;
    latencyMs: number;
    scriptMs: number;
    totalMs: number;
}

export interface JsonFinding {
    /** Which signal it is, as a key that survives a rewording and both languages. */
    kind: FindingKind;
    severity: Severity;
    chip: string;
    title: string;
    /** Without markup: the page's HTML is of no use to whatever reads this. */
    body: string;
    fix: string;
    /**
     * Raw minified bytes this signal would take off the first load. Absent when it has none that
     * can be measured, which is not the same as zero and is why the field is optional.
     */
    saving?: number;
    /** The source files that saving is about, so several signals can be combined without double counting. */
    sources?: string[];
}

export interface JsonViolation {
    gate: GateName;
    subject: string | null;
    limit: number;
    actual: number;
    message: string;
}

export interface JsonComparison {
    baseline: string;
    date: string;
    mode: Mode;
    boot: JsonDelta;
    newScreens: string[];
    goneScreens: string[];
    newBootPackages: { name: string; bytes: number }[];
}

export interface JsonReport {
    tool: 'loadline';
    /** Of this output, not of the tool. It changes when a field changes meaning. */
    version: 1;
    stats: string;
    project: string | null;
    mode: Mode;
    /** The unit in words, so a log line is readable without knowing what `mode` means. */
    unit: string;
    /** Whether the weight of each file came from the source maps or from the metafile. */
    splitSource: 'metafile' | 'sourcemap';
    /**
     * Outputs of the build left out of every figure here because the browser folder does not hold
     * them: the server side of a rendered build. `0` when there was no other side. Nothing else in
     * this payload says the report is about part of the build, and something reading it cannot ask.
     */
    serverOutputs: number;
    /**
     * Render-blocking CSS the page asks for, in the unit of `mode`, and how many files it is.
     * `null` when no build folder was read. Not part of `boot`, because `boot` is the JavaScript
     * this report can break down and this is a figure it can only total.
     */
    pageCss: { bytes: number; files: number } | null;
    /**
     * Everything the page asks for before anything appears, in the unit of `mode`, with the
     * breakdown beside the total. `boot` is the JavaScript half of it — the half this report can
     * break down — and this is the figure the person actually notices. `null` without a folder.
     */
    firstTrip: FirstTrip | null;
    /**
     * The rest of the folder. `null` without one to read. `contentCompared` and `referencesRead`
     * say when an empty list means "none found" and when it means "nobody looked", which is the
     * difference between a fact and a silence.
     */
    assets: {
        fonts: FontFamily[];
        media: MediaFile[];
        unreferenced: { path: string; name: string; bytes: number }[];
        referencesRead: boolean;
        duplicates: DuplicateAsset[];
        contentCompared: boolean;
        inlinedBytes: number;
        inlined: InlinedData[];
    } | null;
    boot: { bytes: number; rawBytes: number; files: number; verdict: 'good' | 'ok' | 'bad' };
    screens: JsonScreen[];
    /** Lazy entries that are a piece of a screen: an Angular `@defer`, a `lazy()` in a component. */
    deferred: JsonEntry[];
    /** Lazy entries holding nothing but dynamic imports: what they load are the screens. */
    groupers: JsonEntry[];
    /** Lazy entries that are data, not code: a language file, a table shipped as a module. */
    data: JsonEntry[];
    shared: JsonChunk[];
    findings: JsonFinding[];
    /** `findings` in the order somebody would act on them. Every actionable one, ranked. */
    actions: JsonAction[];
    /**
     * What acting on all of them is worth. `bytes` is one walk of the graph with every named file
     * removed at once, never a sum: two signals often name the same bytes arriving two ways.
     */
    saving: { bytes: number; before: number; after: number; counted: number };
    /**
     * The first load as an estimate of time. **A model, not a measurement** — nothing here was
     * observed — and anything presenting it has to say so, the way the report itself does.
     */
    timing: JsonTiming[];
    /**
     * The budget that would go in `angular.json`, with the block to paste. `null` unless the report
     * found something to say about the budgets, which needs `--project`. Kilobytes, and against the
     * raw figure, because that is what Angular's `initial` budget counts.
     */
    budget: { warningKb: number; errorKb: number; currentBytes: number; snippet: string } | null;
    /**
     * What an update costs rather than a first visit, which is the half of the real cost nothing
     * else reports. `update` is `null` unless the baseline carried the previous build's file names.
     */
    caching: CachingReport;
    /**
     * What reading the text of the build says: credentials left in it, development leftovers,
     * licences with conditions, whose services it carries, what its source maps give away. `null`
     * when there was no folder to read the text of — which is not "nothing was found".
     */
    scan: ScanReport | null;
    /**
     * The lock file and the audit report crossed with what ships. `lockRead` and `auditRead` say
     * whether either was given: an empty `shipped` means "no advisory ships" only when the second
     * is `true`, and "nobody ran an audit" otherwise.
     */
    deps: DepsReport;
    comparison: JsonComparison | null;
    /** `false` when a baseline in another unit made the comparison impossible. */
    comparable: boolean;
    gates: { asked: boolean; violations: JsonViolation[] };
    /** The exit code as a boolean: `true` when nothing broke a gate. */
    ok: boolean;
}
