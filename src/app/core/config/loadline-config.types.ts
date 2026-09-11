/**
 * `loadline.json`: the thresholds, the gates and the accepted signals, kept next to the code.
 *
 * It exists because the two halves of this tool used to disagree with each other. Somebody tuned
 * the criteria on the page, and their pipeline went on judging the build by the recommended ones —
 * which is exactly the failure the tool catches in `angular.json`, sitting inside the tool itself.
 *
 * The page writes this file and the command reads it. It is meant to be committed: a threshold that
 * lives in one person's browser is a threshold the team has not agreed on.
 */

import { type Criteria, type Mode } from '../criteria/criteria.types';
import { type FindingKind } from '../findings/finding.types';
import { type Situation } from '../situation/situation.types';

/**
 * A signal the team has decided not to act on, with who decided and why.
 *
 * Without this, the first signal a team chooses to live with turns the report into noise for good,
 * and the pipeline into something people pass a flag to skip. An acceptance is the opposite of
 * that: it is written down, it names a person, and it runs out.
 *
 * **It expires on purpose.** "We will deal with it later" is the normal reason, and a decision with
 * no date is the one that is never revisited. When the date passes the signal comes back — it is
 * not an error, it is the signal, back.
 */
export interface AcceptedFinding {
    kind: FindingKind;
    /**
     * Which instance of that signal, when the signal is about a named thing: the package, the
     * chunk, the screen's source file. Empty accepts every instance of the kind, which is a bigger
     * decision and reads like one.
     */
    key?: string;
    /** Why it is being lived with. Required: an acceptance without a reason is a suppression. */
    why: string;
    /** Who decided. A name or a handle — whatever a person reading this in a year could ask. */
    who?: string;
    /** `YYYY-MM-DD`. After it, the signal is raised again. */
    until?: string;
    /**
     * The figure the decision was taken about, in bytes. When the signal comes back bigger than
     * this, the acceptance no longer covers it: what was accepted was 12 kB, not 400.
     */
    bytes?: number;
}

/** The gates as a file writes them. Sizes are strings — `350kB` — because that is how people read them. */
export interface ConfigGates {
    maxBoot?: string;
    maxScreen?: string;
    maxOwn?: string;
    maxGrowth?: string;
    /** A percentage as a number: `10` means ten per cent. */
    maxGrowthPct?: number;
    failOn?: 'high' | 'mid' | 'none';
    /**
     * Fail when a package enters the bootstrap that is not in `packages`. The guard people actually
     * want: bundles do not grow all at once, they grow one `npm install` at a time.
     */
    failOnNewPackage?: boolean;
}

/**
 * **How this file is allowed to grow.** Decided on 10/09/2026, and worth reading before adding a
 * field: every addition is an **optional block**, and `version` stays at `1`.
 *
 * The alternative was bumping the version, and it buys nothing here. Everything that would enter
 * is optional, so a file written last month is still valid word for word — and a bump would make
 * the command carry two readers to express that nothing broke. A field that ever forces the
 * command to reject an older file is a field that has to bump the version instead, and that is the
 * line: **if an old file would stop being valid, it is a new version; otherwise it is a new
 * optional block.**
 *
 * One thing that deliberately does not go in here at all: anything measured from a browser. Those
 * facts have a date and a machine attached and go stale, and a stale figure committed to a
 * repository is a false fact with the shape of a measurement. They live in the session, not here.
 */
export interface LoadlineConfig {
    tool: 'loadline';
    version: 1;
    /** The unit the thresholds are written in. A gzip threshold checked against raw bytes is not one. */
    mode?: Mode;
    /** Whatever of the thresholds the team decided to move. Anything absent keeps its recommended value. */
    criteria?: Partial<Criteria>;
    gates?: ConfigGates;
    /**
     * The packages allowed in the bootstrap. Only meaningful with `failOnNewPackage`, and it is a
     * list of names rather than a count so that adding one is a line in a review.
     */
    packages?: string[];
    accepted?: AcceptedFinding[];
    /**
     * What the team answered about the world this build ships into: the five questions.
     *
     * **Why this belongs in a committed file and a measurement does not.** The rule above says
     * nothing measured from a browser goes in here, because those facts have a machine and an
     * afternoon attached. These do not: how often you release and how many people come back are
     * properties of a team, they are the same for everybody who runs the command, and they are
     * exactly the kind of thing that should be argued about in a review rather than typed again by
     * each person who opens the report. They are also the only way the terminal and the page can
     * agree about the colour of the update-cost signal, which is the disagreement this whole file
     * exists to end.
     *
     * They still go stale, which is why `answeredAt` is part of the shape rather than optional
     * decoration: an answer about deploy cadence from before a team adopted continuous delivery is
     * a false fact with somebody's name on it, and the report says so once it is a year old.
     *
     * The type is the whole shape rather than a partial one because this is the file **as read**:
     * whatever a hand-written block leaves out, the reader fills in as unanswered, so that no code
     * downstream has to tell "absent" from "they said they do not know". A file with no block at
     * all is the state every existing `loadline.json` is in, and it stays valid word for word.
     */
    situation?: Situation;
}

/** What reading the file produced, with everything wrong about it named rather than thrown. */
export interface ConfigReadResult {
    config: LoadlineConfig | null;
    /** Lines to print. An acceptance with no reason, a date that is not one, an unknown signal. */
    problems: string[];
}
