/** What the command was asked to do, once the arguments are read. */

import { type Mode } from '../src/app/core/criteria/criteria.types';
import { type FindingKind } from '../src/app/core/findings/finding.types';
import { type Lang } from '../src/app/core/i18n/ui-strings';

export type OutputFormat = 'text' | 'json' | 'markdown' | 'pr-comment' | 'sarif' | 'summary' | 'agent' | 'badge';

/** The severity from which a signal fails the run. `none` means signals never fail it. */
export type FailOn = 'high' | 'mid' | 'none';

/**
 * The thresholds that decide the exit code. They are deliberately separate from `Criteria`: the
 * criteria colour a report, and colouring something red is not the same decision as stopping a
 * pipeline. A build that goes red on screen still deploys; one that breaks a gate does not.
 */
export interface Gates {
    /** Bytes. `null` when the gate was not asked for. */
    maxBoot: number | null;
    maxScreen: number | null;
    /**
     * Limits for named screens, over `maxScreen`: by the screen's label or its source file. Only
     * from `loadline.json` — a map of screens is a decision to review, not a flag to type.
     */
    screenLimits: Record<string, number>;
    maxOwn: number | null;
    /** Growth against the baseline, in bytes and as a fraction (`0.1` = 10 %). */
    maxGrowth: number | null;
    maxGrowthRatio: number | null;
    failOn: FailOn;
    /**
     * Whether `--fail-on` was typed. `none` is also the default, and without this a typed
     * `--fail-on none` could not be told from no flag at all: the file's `failOn` won over it, and
     * the help says a flag wins over the file.
     */
    failOnTyped?: boolean;
    /**
     * Fail when a package enters the bootstrap that was not there before, or that `loadline.json`
     * does not list. Bundles do not grow all at once; they grow one `npm install` at a time, and
     * this is the guard for that.
     */
    failOnNewPackage: boolean;
    /**
     * Signals that fail the run whatever their severity. Only from `loadline.json`, like the screen
     * limits: which signals stop a deploy is a decision to review, not a flag to type.
     */
    failOnSignals: FindingKind[];
}

export interface Options {
    /**
     * What is being analysed: the `stats.json` of a build, or the build folder itself. A folder is
     * read as a graph — the chunks carry their own imports — which is how a build that never writes
     * a stats file gets a report.
     */
    target: string;
    /** The build output folder, for gzip, brotli and source maps. */
    dist: string | null;
    /** A previous `stats.json` or a Loadline export. */
    baseline: string | null;
    /**
     * Where to write this build's snapshot, to be the `--baseline` of the next run.
     *
     * It is the other half of `--baseline`, and without it that half only worked for the builds
     * that write a `stats.json`: everything read as a folder — Vite, Rollup, SvelteKit, Nuxt,
     * Astro, Solid — had no way at all of producing a baseline outside the browser.
     */
    export: string | null;
    /** Folder holding `angular.json`, `package.json` and the pipeline file. */
    project: string | null;
    /** `null` leaves the choice to what the folder makes available. */
    mode: Mode | null;
    /** Thresholds file overriding the recommended ones. */
    criteria: string | null;
    /**
     * `loadline.json`: the thresholds, the gates and the accepted signals, kept next to the code.
     * `null` looks for one in the working directory, which is what makes it work without a flag.
     */
    config: string | null;
    /** `pnpm-lock.yaml`, `package-lock.json` or `yarn.lock`: who brings each package in. */
    lock: string | null;
    /** The JSON output of `npm audit` or `pnpm audit`, crossed with what actually ships. */
    audit: string | null;
    /**
     * Names to answer "what would the first load weigh without this?" about: a package, a folder of
     * the project, a file. Repeatable, and it changes nothing — it reports.
     */
    whatIf: string[];
    /** Names to answer "why is this in the first load, and where would it be cut?" about. */
    why: string[];
    /**
     * Scripts the application starts at, added to `build.entries` of `loadline.json`: the same
     * way past a page this does not read, without writing a file for one run.
     */
    entries: string[];
    lang: Lang;
    format: OutputFormat;
    gates: Gates;
    color: boolean;
    help: boolean;
    version: boolean;
    /**
     * Check Loadline against the build instead of reporting on it: work the bootstrap out twice, by
     * two paths that share no code, and fail when they disagree. Prints the check and nothing else.
     */
    selfCheck: boolean;
    /**
     * Print the `loadline.json` this run would use, with what it extends joined in, and stop. Needs
     * no build: it is about the file.
     */
    printConfig: boolean;
    /** Write the page with this build already loaded into it, at this path. */
    html: string | null;
    /** Open what `--html` wrote, with whatever the system opens HTML with. */
    open: boolean;
    /**
     * Remember this run in `node_modules/.cache/loadline` and say what moved since the last one.
     * On by default: it is what answers "did that change make the bootstrap smaller?" without a
     * `--baseline`. `--no-cache` turns it off.
     */
    cache: boolean;
}

export type ParsedArgs = { ok: true; options: Options } | { ok: false; message: string; lang: Lang };
