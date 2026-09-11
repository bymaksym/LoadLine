/**
 * The arithmetic behind the five questions, and the rule the whole thing hangs on.
 *
 * The rule is the one worth pinning: **an answer may raise a severity and may never lower one, and
 * `unknown` does nothing at all.** It is tested here as arithmetic and again in
 * `findings/situation.spec.ts` as severities, because the two are separate ways of getting it
 * wrong: a derivation that quietly turns "nobody said" into a default breaks the first, and a
 * builder that branches on `low` breaks the second.
 */

import { describe, expect, it } from 'vitest';
import {
    answeredCount,
    cascadeExposure,
    deploysPerWeek,
    EMPTY_SITUATION,
    hasSituation,
    invalidationsPerWeek,
    isStaleSituation,
    QUESTIONS,
    readSituation,
    returningShare,
    sessionBreadth,
    SITUATION_FRESH_DAYS,
    unanswered,
} from './situation';
import { type Situation } from './situation.types';

const answered = (over: Partial<Situation>): Situation => ({ ...EMPTY_SITUATION, ...over });

describe('the empty situation', () => {
    it('derives nothing at all from nobody having answered', () => {
        expect(invalidationsPerWeek(EMPTY_SITUATION)).toBeNull();
        expect(deploysPerWeek(EMPTY_SITUATION)).toBeNull();
        expect(returningShare(EMPTY_SITUATION)).toBeNull();
        expect(cascadeExposure(EMPTY_SITUATION)).toBe('unknown');
        expect(sessionBreadth(EMPTY_SITUATION)).toBe('unknown');
        expect(hasSituation(EMPTY_SITUATION)).toBe(false);
        expect(answeredCount(EMPTY_SITUATION)).toBe(0);
    });

    it('lists all five as open', () => {
        expect(unanswered(EMPTY_SITUATION)).toEqual(QUESTIONS.map(question => question.key));
    });
});

describe('“I don’t know” is not an answer', () => {
    /**
     * The failure this guards is the tempting one: half the pair answered, so a reasonable-looking
     * implementation fills the other half with a median and produces a number. That number would be
     * indistinguishable from one somebody gave, and it would be moving a colour.
     */
    it('produces no figure when only one half of the pair was given', () => {
        expect(invalidationsPerWeek(answered({ deploys: 'daily' }))).toBeNull();
        expect(invalidationsPerWeek(answered({ returning: 'most' }))).toBeNull();
        expect(cascadeExposure(answered({ deploys: 'daily' }))).toBe('unknown');
    });

    it('does not count towards the answered total', () => {
        const situation = answered({ deploys: 'unknown', returning: 'unknown' });
        expect(answeredCount(situation)).toBe(0);
    });
});

describe('invalidations per week', () => {
    it('is the two answers multiplied, and nothing else', () => {
        // Daily releases to an audience that mostly returns: 5 × 0.8.
        expect(invalidationsPerWeek(answered({ deploys: 'daily', returning: 'most' }))).toBeCloseTo(4);
        // A monthly release to first-time visitors: the same build, a hundredth of the cost.
        expect(invalidationsPerWeek(answered({ deploys: 'monthly', returning: 'few' }))).toBeCloseTo(0.0375);
    });

    it('takes the typed figure over the band, because it is the same answer with less rounding', () => {
        const situation = answered({ deploys: 'monthly', deploysPerWeek: 12, returning: 'half' });
        expect(deploysPerWeek(situation)).toBe(12);
        expect(invalidationsPerWeek(situation)).toBeCloseTo(6);
    });

    it('reads a returning share out of a percentage', () => {
        expect(returningShare(answered({ returningPct: 65 }))).toBeCloseTo(0.65);
        // Out of range is not an answer: it falls back to the band, which here is nobody having said.
        expect(returningShare(answered({ returningPct: 140 }))).toBeNull();
    });
});

describe('cascade exposure', () => {
    it('is high only where the cost is actually paid often', () => {
        expect(cascadeExposure(answered({ deploys: 'daily', returning: 'most' }))).toBe('high');
        expect(cascadeExposure(answered({ deploys: 'daily', returning: 'half' }))).toBe('high');
    });

    it('separates the two ways of being cheap', () => {
        // Deploying constantly to people who have never been before: nobody has a warm cache to
        // invalidate, so the cascade costs nothing however dramatic its topology is.
        expect(cascadeExposure(answered({ deploys: 'daily', returning: 'few' }))).toBe('moderate');
        // And returning every day to something that ships quarterly.
        expect(cascadeExposure(answered({ deploys: 'monthly', returning: 'most' }))).toBe('low');
    });
});

describe('session breadth', () => {
    it('reads the band, and the figure over it', () => {
        expect(sessionBreadth(answered({ navigation: 'inAndOut' }))).toBe('narrow');
        expect(sessionBreadth(answered({ navigation: 'allDay' }))).toBe('wide');
        expect(sessionBreadth(answered({ navigation: 'inAndOut', screensPerSession: 7 }))).toBe('wide');
    });

    /**
     * Two or three profiles is not a shrug and not a median. A median over two populations is a
     * number about neither of them, so it stays `mixed` however many screens the figure says.
     */
    it('keeps “there are several profiles” apart from both, even with a figure', () => {
        expect(sessionBreadth(answered({ navigation: 'profiles', screensPerSession: 9 }))).toBe('mixed');
    });
});

describe('reading a block out of a file', () => {
    it('takes what it recognises', () => {
        const { situation, problems } = readSituation({
            deploys: 'daily',
            returning: 'most',
            priority: 'firstScreen',
            deploysPerWeek: 7,
            rum: true,
            answeredBy: 'ana',
            answeredAt: '2026-09-01',
        });

        expect(problems).toEqual([]);
        expect(situation.deploys).toBe('daily');
        expect(situation.deploysPerWeek).toBe(7);
        expect(situation.rum).toBe(true);
        expect(situation.answeredBy).toBe('ana');
    });

    /**
     * A typo has to become "unanswered" and a line to print. It is the one mistake in this file
     * that would otherwise change a verdict silently, because an answer is the only thing here
     * that can move a colour.
     */
    it('turns an answer nobody recognises into unanswered, out loud', () => {
        const { situation, problems } = readSituation({ deploys: 'hourly', returning: 'most' });

        expect(situation.deploys).toBe('unknown');
        expect(situation.returning).toBe('most');
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain('situation.deploys');
    });

    it('drops a raw figure that is not one, and says so', () => {
        const { situation, problems } = readSituation({ returningPct: 400 });

        expect(situation.returningPct).toBeNull();
        expect(problems[0]).toContain('returningPct');
    });

    it('ignores a date that is not one', () => {
        const { situation, problems } = readSituation({ answeredAt: 'last spring' });

        expect(situation.answeredAt).toBeNull();
        expect(problems[0]).toContain('answeredAt');
    });

    it('reads a block that is not there as nobody having answered', () => {
        expect(readSituation(undefined).situation).toEqual(EMPTY_SITUATION);
        expect(readSituation('nonsense').problems).toEqual([]);
    });
});

describe('answers run out', () => {
    it('goes stale a year on, and not before', () => {
        const fresh = answered({ answeredAt: '2026-08-01' });
        expect(isStaleSituation(fresh, '2026-09-10')).toBe(false);
        expect(isStaleSituation(answered({ answeredAt: '2024-01-01' }), '2026-09-10')).toBe(true);
        expect(SITUATION_FRESH_DAYS).toBe(365);
    });

    it('cannot tell an undated answer has expired, which is why the report asks for a date', () => {
        expect(isStaleSituation(answered({ deploys: 'daily' }), '2030-01-01')).toBe(false);
    });
});
