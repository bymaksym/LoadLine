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
     * The figure the decision was taken about: `"12kB"` in the file, bytes once read. When the
     * signal comes back bigger than this, the acceptance no longer covers it: what was accepted
     * was 12 kB, not 400.
     */
    bytes?: number;
}

/**
 * Something the team has decided must not ship: a package, or files of its own, anywhere in the
 * build or only in the bootstrap.
 *
 * `packages` already guards the bootstrap, but as a closed list: everything not on it fails. That
 * fits a team that reviews every package; it does not fit "anything but moment", which is the rule
 * most teams actually have and could only write down in a README. This is the open list, and it is
 * declarative on purpose — no code, so the page and the command read the same rule the same way.
 *
 * What it raises is an ordinary signal, `forbidden`. So an exception is an entry in `accepted`, with
 * a reason and a date, and failing the build on it is `failOn` or `failOnSignals`: nothing here is
 * a second way of doing what the file already does.
 */
export interface ForbiddenRule {
    /** A package name, with `*` for any text: `"moment"`, `"@aws-sdk/*"`. */
    package?: string;
    /** Files of the project, with `*` for any text: `"src/app/admin/*"`. */
    path?: string;
    /** Where it must not be. `anywhere` when the file leaves it out. */
    in: 'bootstrap' | 'anywhere';
    /** Why not. Required, and shown on the signal: it is what the person who meets it reads first. */
    why: string;
}

/**
 * The gates as read. The file writes a size as people read it — `"350kB"` — or as bytes, and by the
 * time it gets here it is bytes: the reader checked every one and named the ones it could not use.
 */
export interface ConfigGates {
    maxBoot?: number;
    maxScreen?: number;
    maxOwn?: number;
    maxGrowth?: number;
    /** A percentage as a number: `10` means ten per cent. */
    maxGrowthPct?: number;
    failOn?: 'high' | 'mid' | 'none';
    /**
     * Fail when a package enters the bootstrap that is not in `packages`. The guard people actually
     * want: bundles do not grow all at once, they grow one `npm install` at a time.
     */
    failOnNewPackage?: boolean;
    /**
     * Signals that fail the run whatever their severity: `["forbidden", "secrets"]`.
     *
     * `failOn` is a level, and a level is the wrong tool for "this one, always". A secret in the
     * bundle is the same decision at any severity, and lowering the level far enough to catch it
     * also failed the build on every medium signal nobody meant to stop a deploy for. Accepted
     * signals do not count, the same as with `failOn`.
     */
    failOnSignals?: FindingKind[];
    /**
     * A limit per screen, over `maxScreen`: `{ "rooms": "400kB" }`. Keyed by the screen as the
     * report names it, or by its source file. One heavy screen that is heavy on purpose — a map, an
     * editor — used to force a limit loose enough for it on every other screen as well.
     */
    screens?: Record<string, number>;
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
    /** Where an editor finds `loadline.schema.json`, for completion and the description of every key. */
    $schema?: string;
    tool: 'loadline';
    version: 1;
    /**
     * Other `loadline.json` files this one builds on: a path (`"./base.loadline.json"`) or a package
     * (`"@acme/loadline-config"`, which reads its `loadline.json`), resolved from the file that
     * writes it. Written as one name or a list; always a list once read. Only the command follows
     * it — the page has no disk to follow it on, and says so. See `mergeConfigs` for how they join.
     */
    extends?: string[];
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
    /** What must never ship, or never ship in the first load: see `ForbiddenRule`. */
    forbidden?: ForbiddenRule[];
    /** What the build folder does not say on its own: see `BuildHints`. */
    build?: BuildHints;
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

/**
 * The two things about a build folder that the folder cannot always say, for the build it does not.
 *
 * Every rule that reads a folder is a guess about how some tool writes one, and a tool that does
 * something new — or something old nobody wrote a rule for — will one day get past all of them.
 * These are the way through without waiting for a release: two lists of file names, read by the
 * page and the command alike.
 */
export interface BuildHints {
    /**
     * Scripts the application starts at, by file name (`client.11806644.js`) or with `*` for the
     * hash (`client.*.js`). Added to what `index.html` names, for a page that starts the
     * application in a way this does not read.
     */
    entries?: string[];
    /**
     * Files of the folder no screen downloads — a polyfill only old browsers load, a copy for
     * another target — by name or with `*`. Never taken as an entry or reached by a guess, and left
     * out of every figure when nothing the application imports reaches them.
     */
    ignore?: string[];
    /**
     * Which lazy entries are screens and which are a piece of one, by source file (or chunk, in a
     * build without maps), with `*` for any text: `{ "src/app/admin/*": "screen", "*.widget.ts":
     * "piece" }`. The same correction as the buttons of the screens table, written down once for
     * everybody instead of clicked by each person in their own browser. A click still wins.
     */
    screens?: Record<string, 'screen' | 'piece'>;
    /**
     * The page of the application, when the folder holds several and none is `index.html`, or the
     * `index.html` is not the one: `"app.html"`, `"admin/index.html"`.
     */
    page?: string;
    /**
     * Source paths that are the project's own code although they sit under `node_modules/`, with `*`
     * for a segment and `**` for any number: `["src/node_modules/**"]`. Read before the default.
     */
    own?: string[];
    /**
     * Source paths that are dependencies although they are not under `node_modules/` — a monorepo's
     * workspace packages, a vendored library — named after the folder the pattern matches:
     * `["packages/*"]` makes `packages/ui/src/x.ts` part of a package called `ui`.
     */
    dependencies?: string[];
    /**
     * Keys of a route table besides the ones every router uses (`component`, `loadComponent`,
     * `loadChildren`, `lazy`, `getComponent`, `asyncComponent`), for a router that writes
     * `{ path: '/x', page: () => import('./x.js') }`. Without its key the table is not found and every
     * lazy chunk counts as a screen.
     */
    routeKeys?: string[];
}

/** What reading the file produced, with everything wrong about it named rather than thrown. */
export interface ConfigReadResult {
    config: LoadlineConfig | null;
    /** Lines to print. An acceptance with no reason, a date that is not one, an unknown signal. */
    problems: string[];
    /**
     * The ones among `problems` that leave a gate guarding less than the file says: a size that
     * does not parse, a severity that is not one, a key that is not a gate. The command refuses to
     * run on these instead of printing them, because a gate that switched itself off passes, and a
     * typo in a committed file turned a pipeline green with nothing but a line on stderr.
     */
    gateProblems: string[];
}
