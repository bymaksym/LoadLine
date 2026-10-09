/** The shapes of a saved baseline and of the comparison against it. */

import { type Mode } from '../criteria/criteria.types';
import { type FindingKind, type Severity } from '../findings/finding.types';

/**
 * One signal as a baseline keeps it: the key that survives a rewording, and which thing it was
 * about. Enough to answer "which of these are new" without keeping the sentences, which change
 * with the language and with every edit to the wording.
 */
export interface SnapshotFinding {
    kind: FindingKind;
    /** The package, chunk or screen it named. `''` for a signal about the build as a whole. */
    key: string;
    severity: Severity;
}

/** A package or a folder of the project's own code, with what it weighs somewhere. Raw bytes. */
export interface SnapshotPart {
    name: string;
    bytes: number;
    /** A folder of the project's own code rather than a package. */
    own: boolean;
}

export interface SnapshotScreen {
    source: string;
    label: string;
    total: number;
    shared: number;
    own: number;
    /**
     * What the screen loads beyond the bootstrap, by package and own folder, biggest first: what
     * `bootPackages` and `bootOwn` are for the bootstrap, so a screen that grew can be put down to
     * what grew in it. Absent in snapshots written before it existed, and when the build did not
     * say what is inside its chunks: an empty list there would read as a screen made of nothing.
     */
    lazyParts?: SnapshotPart[];
    /** Its lazy chunks in raw bytes: what turns `lazyParts` into the unit of `shared` and `own`. */
    lazyRaw?: number;
}

export interface Snapshot {
    /** `tara` was the name of this tool before: exports written back then are still read. */
    tool: 'loadline' | 'tara';
    version: 1;
    /** The file it came from, to say where the baseline is. */
    name: string;
    date: string;
    /** Raw or compressed: two snapshots only compare in the same mode. */
    mode: Mode;
    boot: number;
    /** npm packages in the bootstrap. Project folders are left out: they always change. */
    bootPackages: { name: string; bytes: number }[];
    /**
     * The folders of the project's own code in the bootstrap, like `bootPackages` for packages.
     * With both, a growth of the bootstrap can be put down to what caused it. Absent in snapshots
     * written before it existed, which then explain growth by package only.
     */
    bootOwn?: { name: string; bytes: number }[];
    /**
     * The bootstrap in raw minified bytes. The weights of `bootPackages` and `bootOwn` are raw
     * too, and this is what turns them into the unit of `boot` when the report is compressed.
     */
    bootRaw?: number;
    screens: SnapshotScreen[];
    /**
     * The signals raised when the snapshot was taken. Optional: exports written before this field
     * existed are still read, and then the comparison simply has nothing to say about signals.
     */
    findings?: SnapshotFinding[];
    /**
     * The hashed file names of that build, with what each weighed.
     *
     * They are what makes the cost of an **update** measurable rather than guessed: a build tool
     * writes the content hash into the name, so a name that has not changed is a file the browser
     * does not ask for again. Comparing two lists of names is not an approximation of the cache
     * delta, it is the delta. Optional, like the signals, for exports written before it existed.
     */
    files?: {
        name: string;
        bytes: number;
        /**
         * The largest source file inside that chunk, when the build said what was inside it.
         *
         * It is the identity of the chunks whose whole name is a content hash — `ChDGvcpR.js`, as
         * SvelteKit, Nuxt and Rollup write them. There is nothing left of those once the hash comes
         * off, so without this the next build reads every one of them as one file gone and another
         * arrived. Optional: exports written before it existed still read, and match by name.
         */
        content?: string;
    }[];
}

export interface Delta {
    before: number;
    after: number;
    /** `after - before`. */
    diff: number;
    /** `diff / before`. `0` when there was nothing before. */
    ratio: number;
}

export interface ScreenDelta {
    source: string;
    label: string;
    total: Delta;
    /** Shared + own: what the screen adds on top of the bootstrap. */
    lazy: Delta;
    /**
     * What `lazy`'s change is made of, biggest first, by the rules of `Comparison.bootCauses`.
     * `null` when either snapshot lacks the screen's breakdown: unknown, which is not none.
     */
    causes: BootCause[] | null;
    /** Report unit per raw byte for this screen's `causes`. `1` in a raw report. */
    causesRatio: number;
    /** Whether `causesRatio` is an estimate: true in a compressed report. */
    causesEstimated: boolean;
}

/**
 * One thing that moved inside the bootstrap, or inside what a screen loads beyond it: a package or
 * a folder of the project's own code. The figures are raw minified bytes; `causesRatio`, on the
 * comparison or on the screen's delta, turns them into the report's unit.
 */
export interface BootCause {
    name: string;
    /** A folder of the project's own code rather than a package. */
    own: boolean;
    before: number;
    after: number;
    diff: number;
    /**
     * `new` and `gone` are about the part being compared: a package gone from the bootstrap may
     * still be in the build lazily, and one gone from a screen may have moved into the bootstrap.
     */
    change: 'new' | 'gone' | 'grew' | 'shrank';
}

export interface Comparison {
    mode: Mode;
    baselineName: string;
    baselineDate: string;
    boot: Delta;
    /** By screen source. Screens that exist in both. */
    screens: Map<string, ScreenDelta>;
    newScreens: SnapshotScreen[];
    goneScreens: SnapshotScreen[];
    newBootPackages: { name: string; bytes: number }[];
    goneBootPackages: { name: string; bytes: number }[];
    /**
     * Signals raised now that were not raised then, and the other way round.
     *
     * "You have fixed two and one has come in" is what a person wants to see on a merge request,
     * and it is the only thing that makes fixing something visible: a report that says the same
     * eleven things it said last week is a report nobody reads twice.
     *
     * Both are empty when the baseline predates the field: unknown is not the same as none, and
     * `findingsComparable` is what says which of the two it is.
     */
    newFindings: SnapshotFinding[];
    goneFindings: SnapshotFinding[];
    /** Whether the baseline carried its signals at all. */
    findingsComparable: boolean;
    /**
     * What the bootstrap's change is made of, biggest first: the answer to "what did I add?" that
     * the delta alone does not give. Raw bytes.
     */
    bootCauses: BootCause[];
    /** Report unit per raw byte, to print `bootCauses` next to `boot`. `1` in a raw report. */
    causesRatio: number;
    /** Whether `causesRatio` is an estimate: true in a compressed report. */
    causesEstimated: boolean;
    /** Whether the project's own folders could be compared, or packages only (an older baseline). */
    causesOwnKnown: boolean;
}
