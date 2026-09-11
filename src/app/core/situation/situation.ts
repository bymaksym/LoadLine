/**
 * What the five answers mean, once somebody has given them.
 *
 * The questions are asked in words because that is how people know the answer — "we ship most
 * days", "almost everybody is back on Monday" — and they are used as arithmetic, because the
 * thing they decide is arithmetic. The bridge between the two is this file, and it is deliberately
 * small and readable: a band becomes the middle of its range, the two numbers multiply, and the
 * product is a figure with a unit somebody can argue with.
 *
 * **The one rule everything here obeys**: `unknown` produces `unknown`. Not a default, not the
 * median of the other answers, not "assume the common case". Every function below returns its own
 * `unknown` the moment an input it needs is missing, and the callers are written so that `unknown`
 * leaves the report exactly where it was rather than softening it.
 */

import {
    type Breadth,
    type ConnectionAnswer,
    type DeployAnswer,
    type Exposure,
    type NavigationAnswer,
    type PriorityAnswer,
    type Question,
    type ReturningAnswer,
    type Situation,
    type SituationKey,
} from './situation.types';

/** Nobody has answered anything. It is also what a report with no `loadline.json` runs on. */
export const EMPTY_SITUATION: Situation = {
    navigation: 'unknown',
    deploys: 'unknown',
    returning: 'unknown',
    connection: 'unknown',
    priority: 'unknown',
    screensPerSession: null,
    deploysPerWeek: null,
    returningPct: null,
    rum: false,
    answeredBy: null,
    answeredAt: null,
};

/**
 * The form, in the order it is drawn.
 *
 * One list: the page renders it, the config reader validates against it, and the guard that says
 * every option has copy in both languages walks it. Three copies of this order would be three
 * chances for a question to exist in one of the three places only.
 */
export const QUESTIONS: readonly [
    Question<NavigationAnswer>,
    Question<DeployAnswer>,
    Question<ReturningAnswer>,
    Question<ConnectionAnswer>,
    Question<PriorityAnswer>,
] = [
    { key: 'navigation', options: ['inAndOut', 'allDay', 'profiles', 'unknown'], raw: 'screensPerSession' },
    { key: 'deploys', options: ['daily', 'weekly', 'monthly', 'unknown'], raw: 'deploysPerWeek' },
    { key: 'returning', options: ['most', 'half', 'few', 'unknown'], raw: 'returningPct' },
    { key: 'connection', options: ['office', 'mobile', 'worldwide', 'unknown'], raw: undefined },
    // The fifth offers no "I don't know" on purpose. It is not a fact to look up: it is which of
    // two waits the team would rather pay, and nobody else can hold that opinion for them. Until
    // it is picked the field is `unknown`, which is a different thing from an answer of "I don't
    // know" and reads on the page as a question nobody has been through yet.
    { key: 'priority', options: ['firstScreen', 'navigation', 'both'], raw: undefined },
] as const;

/** How many of the five have a real answer. `unknown` does not count, which is the whole point. */
export const answeredCount = (situation: Situation): number =>
    QUESTIONS.filter(question => situation[question.key] !== 'unknown').length;

/** Which of the five are still open, in the order they are asked. */
export const unanswered = (situation: Situation): SituationKey[] =>
    QUESTIONS.filter(question => situation[question.key] === 'unknown').map(question => question.key);

// --- from a band to a number ---------------------------------------------------------------------

/**
 * Releases per week, as each band is worth.
 *
 * The middle of the range somebody picking that band means, not the best case of it. "Several
 * times a day" is a team deploying on merge, which is five working days of it and not thirty-five
 * releases; "every few weeks" is treated as monthly.
 */
const DEPLOY_RATE: Record<DeployAnswer, number | null> = {
    daily: 5,
    weekly: 1,
    monthly: 0.25,
    unknown: null,
};

/** The share arriving with a warm cache, as each band is worth. */
const RETURNING_SHARE: Record<ReturningAnswer, number | null> = {
    most: 0.8,
    half: 0.5,
    few: 0.15,
    unknown: null,
};

/** Distinct screens a session touches, as each band is worth. */
const SCREENS_PER_SESSION: Record<NavigationAnswer, number | null> = {
    inAndOut: 1.5,
    allDay: 6,
    profiles: null,
    unknown: null,
};

/**
 * A raw figure if there is one, the band's value otherwise.
 *
 * The raw one wins because it is the same answer with less rounding, and because typing 4.5 into
 * a box is something only somebody who looked it up does.
 */
const resolve = (raw: number | null, band: number | null): number | null =>
    raw !== null && Number.isFinite(raw) && raw >= 0 ? raw : band;

/** Releases per week, from whichever of the two the team gave. */
export const deploysPerWeek = (situation: Situation): number | null =>
    resolve(situation.deploysPerWeek, DEPLOY_RATE[situation.deploys]);

/** The warm-cache share as a fraction, from whichever of the two the team gave. */
export const returningShare = (situation: Situation): number | null => {
    const pct = situation.returningPct;
    const raw = pct !== null && Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct / 100 : null;
    return resolve(raw, RETURNING_SHARE[situation.returning]);
};

// --- what the answers decide -----------------------------------------------------------------

/**
 * **The figure the whole middle of the questionnaire exists to produce**: how many times a week
 * one person pays the invalidation.
 *
 * `deploys per week × share arriving with a warm cache`. That is the entire model, and it is
 * written in one line on purpose — the report shows the multiplication, not the result, so that
 * anybody who disagrees can see which of the two numbers they disagree with.
 *
 * It is what turns "87 % of the build is re-downloaded" from a number to be alarmed by into a
 * cost: 87 % four times a week is the most expensive line of the report, and 87 % once a quarter
 * to an audience of first-time visitors is nothing at all. Same build, same percentage.
 *
 * `null` when either half is missing, which is most of the time and is not a failure.
 */
export const invalidationsPerWeek = (situation: Situation): number | null => {
    const rate = deploysPerWeek(situation);
    const share = returningShare(situation);
    return rate === null || share === null ? null : rate * share;
};

/**
 * Where those invalidations sit.
 *
 * The two boundaries are conventions and are labelled as such wherever they surface: **two a week**
 * is where a returning visitor notices the download as a habit rather than an event, and below
 * **0.4** — one every couple of weeks or rarer — it is not part of anybody's experience of the
 * application.
 *
 * Only `high` is allowed to raise a severity. `moderate` and `low` change what is said and leave
 * the colour where it was, because a declared answer is not a measurement and the asymmetry rule
 * says evidence this soft may widen what the report claims, never quiet it.
 */
export const HIGH_EXPOSURE = 2;
export const LOW_EXPOSURE = 0.4;

export const cascadeExposure = (situation: Situation): Exposure => {
    const perWeek = invalidationsPerWeek(situation);
    if (perWeek === null) {
        return 'unknown';
    }

    return perWeek >= HIGH_EXPOSURE ? 'high' : perWeek >= LOW_EXPOSURE ? 'moderate' : 'low';
};

/**
 * How wide a session is, which is what makes a deferred chunk's coverage mean anything.
 *
 * The band is only overridden by the raw figure when the raw figure is there; two distinct screens
 * a session is the line, and it is a convention like the two above. "There are two or three
 * profiles" stays `mixed` however many screens the median says: a median over two populations is
 * a number about neither of them.
 */
export const WIDE_SESSION_SCREENS = 2;

export const sessionBreadth = (situation: Situation): Breadth => {
    if (situation.navigation === 'profiles') {
        return 'mixed';
    }

    const screens = resolve(situation.screensPerSession, SCREENS_PER_SESSION[situation.navigation]);
    if (screens === null) {
        return 'unknown';
    }

    return screens >= WIDE_SESSION_SCREENS ? 'wide' : 'narrow';
};

/**
 * Whether the fourth question should be asked at all.
 *
 * With RUM it should not: the p75 of protocol and round trip is already being collected from real
 * sessions, and a band picked from memory is strictly worse than a figure they have. The page says
 * so instead of drawing the options, and the number goes into `latencyMs`.
 */
export const importsChannel = (situation: Situation): boolean => situation.rum;

// --- reading one out of a file ------------------------------------------------------------------

const OPTIONS = new Map<SituationKey, ReadonlySet<string>>(
    QUESTIONS.map(question => [question.key, new Set<string>([...question.options, 'unknown'])]),
);

const RAW_LIMITS: Record<string, number> = { screensPerSession: 1000, deploysPerWeek: 1000, returningPct: 100 };

const readNumber = (value: unknown, key: string): number | null => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > (RAW_LIMITS[key] ?? 0)) {
        return null;
    }
    return value;
};

const readText = (value: unknown): string | null =>
    typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What a `loadline.json` said, with everything it got wrong named rather than thrown.
 *
 * An answer nobody recognises becomes `unknown` and a line to print. It is the same choice the
 * acceptances make and for the same reason: the failure to avoid is a typo silently reading as an
 * answer, because an answer is the only thing here that can move a colour.
 */
export const readSituation = (value: unknown): { situation: Situation; problems: string[] } => {
    if (!value || typeof value !== 'object') {
        return { situation: EMPTY_SITUATION, problems: [] };
    }

    const raw = value as Record<string, unknown>;
    const problems: string[] = [];
    const situation: Situation = { ...EMPTY_SITUATION };

    for (const question of QUESTIONS) {
        const answer = raw[question.key];
        if (answer === undefined || answer === null) {
            continue;
        }
        if (typeof answer !== 'string' || !OPTIONS.get(question.key)?.has(answer)) {
            problems.push(
                `Unknown answer in "situation.${question.key}": ${JSON.stringify(answer)}. It counts as unanswered.`,
            );
            continue;
        }
        // The five fields are five different string unions and the loop knows the key only as one
        // of them, which no narrowing can express. The value was just checked against that very
        // question's own option list, so the assignment is sound and the cast says only that.
        (situation[question.key] as string) = answer;
    }

    for (const key of ['screensPerSession', 'deploysPerWeek', 'returningPct'] as const) {
        const given = raw[key];
        if (given === undefined || given === null) {
            continue;
        }
        const number = readNumber(given, key);
        if (number === null) {
            problems.push(`"situation.${key}" is not a number between 0 and ${RAW_LIMITS[key]}. It is ignored.`);
            continue;
        }
        situation[key] = number;
    }

    situation.rum = raw['rum'] === true;
    situation.answeredBy = readText(raw['answeredBy']);

    const answeredAt = readText(raw['answeredAt']);
    if (answeredAt !== null && !DATE.test(answeredAt)) {
        problems.push(`"situation.answeredAt" is not a YYYY-MM-DD date: ${answeredAt}. It is ignored.`);
    } else {
        situation.answeredAt = answeredAt;
    }

    return { situation, problems };
};

/**
 * How long an answer is taken at face value.
 *
 * A year, which is far longer than the thirty days a pasted measurement gets, and for a reason:
 * this is a fact about how a team works rather than about one connection on one afternoon. It
 * still runs out. Deploy cadence is exactly the thing that changes when a team adopts continuous
 * delivery, and an answer from before that is a false fact with a person's name on it.
 */
export const SITUATION_FRESH_DAYS = 365;

/** Whether an answer has passed its year. `false` when it never said when it was given. */
export const isStaleSituation = (situation: Situation, today: string): boolean => {
    const at = situation.answeredAt;
    if (!at) {
        return false;
    }

    const days = (Date.parse(today) - Date.parse(at)) / 86_400_000;
    return Number.isFinite(days) && days > SITUATION_FRESH_DAYS;
};

/** Whether anybody has said anything at all: five bands, three figures and the RUM flag. */
export const hasSituation = (situation: Situation): boolean =>
    answeredCount(situation) > 0 ||
    situation.rum ||
    situation.screensPerSession !== null ||
    situation.deploysPerWeek !== null ||
    situation.returningPct !== null;
