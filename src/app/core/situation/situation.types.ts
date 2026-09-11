/**
 * The five questions, and the raw figures behind them.
 *
 * Everything here is **declared**: somebody answered. That is worth more than a guess and less
 * than a measurement, and the difference is kept visible everywhere the answers are used — they
 * are never mixed into the same sentence as something a browser reported.
 *
 * The questions exist because four of the report's claims cannot be settled from a build folder,
 * and the tool has been refusing to make them rather than guessing. The refusal is the right
 * default and it is not free: a cascade that re-downloads 87 % of the bundle stays a grey number
 * next to a paragraph explaining what would decide its colour. These answers are what decides it.
 *
 * **The rule they inherit.** A fact may raise severity with evidence and may lower it only with
 * evidence, and `unknown` is not evidence — it never softens anything. That is why every answer
 * type carries `unknown` as a real value rather than leaving the field absent: the code that reads
 * them has to handle "nobody said" on the same line as the rest, where it cannot be forgotten.
 */

/**
 * How wide a session is: whether somebody opens one screen or lives in the application.
 *
 * It is what makes a deferred chunk's coverage interpretable. A chunk reached by 60 % of screens
 * is downloaded by nearly everybody in an application people spend the day in, and by almost
 * nobody in one they enter to do a single thing.
 */
export type NavigationAnswer = 'inAndOut' | 'allDay' | 'profiles' | 'unknown';

/** How often a new version reaches production. Half of what an invalidation costs. */
export type DeployAnswer = 'daily' | 'weekly' | 'monthly' | 'unknown';

/** How much of the audience arrives with a warm cache. The other half. */
export type ReturningAnswer = 'most' | 'half' | 'few' | 'unknown';

/**
 * Where the audience is and on what.
 *
 * **This is the question that lies most**, and it is the only one that says so out loud: people
 * answer it as they would like their users to be. When there is RUM it should not be answered at
 * all — the p75 comes from there, into the report's own latency, and this stays `unknown`.
 */
export type ConnectionAnswer = 'office' | 'mobile' | 'worldwide' | 'unknown';

/**
 * Which of the two waits is worse.
 *
 * The only one of the five that no file anywhere can answer, and the one that resolves the
 * defer-versus-prefetch tension the report otherwise refuses to take a side on.
 */
export type PriorityAnswer = 'firstScreen' | 'navigation' | 'both' | 'unknown';

/**
 * What somebody said about the world this build ships into.
 *
 * The three numbers are the same three questions asked in their own units, for whoever would
 * rather type the figure than pick a band. When one is present it wins: it is the same answer with
 * less rounding, and somebody who typed 4.5 deploys a week has looked it up.
 *
 * There is deliberately no raw field for the fourth question. Its unit is round-trip time, and the
 * report already has exactly one of those — `latencyMs` in the criteria — so a second copy here
 * would be two numbers for one fact, drifting apart. The panel edits that one.
 */
export interface Situation {
    navigation: NavigationAnswer;
    deploys: DeployAnswer;
    returning: ReturningAnswer;
    connection: ConnectionAnswer;
    priority: PriorityAnswer;

    /** Median distinct screens per session. */
    screensPerSession: number | null;
    /** Releases reaching production per week. `0.25` is monthly, and monthly is a real answer. */
    deploysPerWeek: number | null;
    /** Share of a day's visitors who already opened it this week, 0-100. */
    returningPct: number | null;

    /**
     * They have real user monitoring.
     *
     * It is not a sixth question: it is the fact that changes what the fourth one is for. With RUM
     * the p75 of protocol and round trip comes from there, and a band picked from memory is worse
     * than what they already have.
     */
    rum: boolean;

    /** Who answered, so a reader in a year can ask them. */
    answeredBy: string | null;
    /** `YYYY-MM-DD`. An answer from two years ago is about a company that no longer exists. */
    answeredAt: string | null;
}

/** One of the five, as the form draws it: the question, its options and what it is really asking. */
export interface Question<T extends string = string> {
    /** The field of `Situation` it writes. */
    key: SituationKey;
    /** The values it offers, in the order they are drawn. `unknown` last, where it belongs. */
    options: readonly T[];
    /**
     * The raw field of `Situation` holding the same answer as a number, when there is one.
     * Absent on the fourth and fifth: one of them edits `latencyMs`, the other has no unit.
     */
    raw?: RawKey;
}

export type SituationKey = 'navigation' | 'deploys' | 'returning' | 'connection' | 'priority';

export type RawKey = 'screensPerSession' | 'deploysPerWeek' | 'returningPct';

/**
 * How exposed the audience is to a hash cascade, which is the thing the two questions in the
 * middle exist to decide.
 *
 * `unknown` is not a level between the others: it means the report has to go on withholding the
 * colour and saying why, exactly as it does today.
 */
export type Exposure = 'high' | 'moderate' | 'low' | 'unknown';

/**
 * How wide the sessions are, once the band and the raw figure have been reconciled.
 *
 * `mixed` is a real answer and not a shrug: "there are two or three profiles" means the median is
 * a bad summary of the audience, which is itself worth knowing and is different from nobody having
 * looked.
 */
export type Breadth = 'narrow' | 'wide' | 'mixed' | 'unknown';
