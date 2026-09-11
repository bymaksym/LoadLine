/**
 * What the five answers do to the report, and — the half that matters — what they cannot do.
 *
 * The guard at the bottom is the point of the file. It walks **every** combination of the five
 * answers against a build with an expensive update, and asserts that not one of them takes a
 * severity below where nobody having answered leaves it. If that ever stops holding, the cheapest
 * way to a clean report becomes answering the questions optimistically, and the questionnaire turns
 * from a source of evidence into a volume knob.
 */

import { describe, expect, it } from 'vitest';
import { type CachingReport } from '../caching/caching.types';
import { RECOMMENDED } from '../criteria/criteria';
import { EMPTY_SITUATION, QUESTIONS } from '../situation/situation';
import { type Situation } from '../situation/situation.types';
import { buildCachingFindings } from './caching';
import { type Finding, type Severity } from './finding.types';
import { buildSituationFindings } from './situation';

const criteria = RECOMMENDED.raw;

const answered = (over: Partial<Situation>): Situation => ({ ...EMPTY_SITUATION, ...over });

/** A build where a small edit re-downloaded most of the bundle: the case the questions are for. */
const caching: CachingReport = {
    update: {
        bytes: 400_000,
        fresh: 460_000,
        ratio: 0.87,
        changed: [{ name: 'main-A1.js', change: 'changed', bytes: 300_000 }],
        added: [{ name: 'chunk-B2.js', change: 'added', bytes: 100_000 }],
        removed: [],
        reused: 3,
        cascade: { roots: ['chunk-B2.js'], rootBytes: 100_000, carried: ['main-A1.js'], carriedBytes: 300_000 },
    },
    unstable: [],
    unhashable: [],
};

const find = (findings: Finding[], kind: string): Finding | undefined =>
    findings.find(finding => finding.kind === kind);

const kinds = (findings: Finding[]): string[] => findings.map(finding => finding.kind);

/** A signal of a kind, for the builder that reads the list it is given rather than a build. */
const signal = (kind: string): Finding =>
    ({ kind, severity: 'mid', chip: '', title: '', body: '', fix: '' }) as unknown as Finding;

/**
 * The split into the edit and the cascade it set off, when there is no edit to point at.
 *
 * `roots` is the changed files that name no other changed file — the ones whose hash can only have
 * moved for their own sake. On the default Vite and Rollup layout there are none: the lazy chunks
 * import back from the entry, so the naming graph among the changed files closes on itself. Eight
 * of the nineteen framework probes came out that way, and the sentence read "only 0 name no other
 * file that also changed (0 B): ." — an empty list, followed by "that is where the edit landed" and
 * a counterfactual saying the deploy would have cost nothing without the cascade.
 */
describe('the update cost, when the naming graph closes on itself', () => {
    const cyclic: CachingReport = {
        ...caching,
        update: {
            ...caching.update!,
            cascade: {
                roots: [],
                rootBytes: 0,
                carried: ['main-A1.js', 'chunk-B2.js'],
                carriedBytes: 400_000,
            },
        },
    };

    it('says the split is unavailable instead of saying the edit weighs nothing', () => {
        const body = find(buildCachingFindings(cyclic, 'en', criteria), 'updateWeight')?.body ?? '';

        expect(body).toContain('cannot be told from here');
        expect(body).toContain('not the same as the edit being nothing');
        expect(body).not.toContain('That is where the edit landed');
        expect(body).not.toContain('only 0 name');
    });

    it('says it in Spanish too, and neither says it when there is a root to name', () => {
        const es = find(buildCachingFindings(cyclic, 'es', criteria), 'updateWeight')?.body ?? '';
        const withRoot = find(buildCachingFindings(caching, 'en', criteria), 'updateWeight')?.body ?? '';

        expect(es).toContain('no se puede decir desde aquí');
        expect(withRoot).toContain('That is where the edit landed');
        expect(withRoot).not.toContain('cannot be told from here');
    });
});

describe('the update cost, before anybody answers', () => {
    it('shows the figure and withholds the colour', () => {
        const update = find(buildCachingFindings(caching, 'en', criteria), 'updateWeight');

        expect(update?.severity).toBe('info');
        expect(update?.fix).toContain('situation tab');
    });
});

describe('the update cost, once the two questions are answered', () => {
    it('takes the colour it was refusing to claim', () => {
        const update = find(
            buildCachingFindings(caching, 'en', criteria, answered({ deploys: 'daily', returning: 'most' })),
            'updateWeight',
        );

        expect(update?.severity).toBe('mid');
        // The multiplication, not only its result: the reader has to be able to see which half of
        // it they disagree with.
        expect(update?.fix).toContain('4 times a week');
    });

    it('stays informative when the answers say it is rarely paid, and says why', () => {
        const update = find(
            buildCachingFindings(caching, 'en', criteria, answered({ deploys: 'monthly', returning: 'few' })),
            'updateWeight',
        );

        expect(update?.severity).toBe('info');
        expect(update?.fix).toContain('not where your problem is');
    });

    /** Half the pair is not the pair. This is where a median would have been quietly invented. */
    it('goes on withholding the colour when only one of the two was answered', () => {
        const update = find(
            buildCachingFindings(caching, 'en', criteria, answered({ deploys: 'daily' })),
            'updateWeight',
        );

        expect(update?.severity).toBe('info');
        expect(update?.fix).toContain('stays informative on purpose');
    });
});

describe('the cards the answers themselves produce', () => {
    it('says nothing when nobody has answered and nothing on the report would change', () => {
        expect(buildSituationFindings(EMPTY_SITUATION, [], 'en', criteria)).toEqual([]);
    });

    it('reads the answers back with who gave them', () => {
        const findings = buildSituationFindings(
            answered({ deploys: 'weekly', returning: 'half', answeredBy: 'ana', answeredAt: '2026-09-01' }),
            [],
            'en',
            criteria,
            '2026-09-10',
        );

        const card = find(findings, 'situationAsked');
        expect(card?.severity).toBe('info');
        expect(card?.body).toContain('ana');
        expect(card?.title).toContain('times a week');
    });

    it('marks answers that have run out', () => {
        const findings = buildSituationFindings(
            answered({ deploys: 'daily', answeredAt: '2024-01-01' }),
            [],
            'en',
            criteria,
            '2026-09-10',
        );

        expect(find(findings, 'situationAsked')?.fix).toContain('more than 365 days old');
    });

    it('names the direction only the fifth question can settle', () => {
        const findings = buildSituationFindings(answered({ priority: 'firstScreen' }), [], 'en', criteria);

        expect(find(findings, 'situationPriority')?.fix).toContain('defer aggressively');
        expect(find(findings, 'situationPriority')?.severity).toBe('info');
    });
});

describe('which questions are worth asking', () => {
    /**
     * The card is not a form to fill in: it is a list of the questions whose answer would change
     * something on the page in front of the reader. Without that it would be five identical lines
     * on every report, which is the shape of text people learn to scroll past.
     */
    it('asks nothing when no signal on the report depends on an answer', () => {
        const findings = buildSituationFindings(EMPTY_SITUATION, [signal('dupes'), signal('locales')], 'en', criteria);

        expect(kinds(findings)).not.toContain('situationMissing');
    });

    it('asks the two cascade questions when there is a cascade to price', () => {
        const findings = buildSituationFindings(EMPTY_SITUATION, [signal('updateWeight')], 'en', criteria);
        const card = find(findings, 'situationMissing');

        expect(card?.body).toContain('how often a new version reaches production');
        expect(card?.body).toContain('had already opened it this week');
        // Nothing on this report turns on how people move around, so it is not asked.
        expect(card?.body).not.toContain('how people move around');
    });

    it('stops asking one once it is answered', () => {
        const findings = buildSituationFindings(
            answered({ deploys: 'daily', returning: 'most' }),
            [signal('updateWeight')],
            'en',
            criteria,
        );

        expect(kinds(findings)).not.toContain('situationMissing');
    });
});

// --- the guard -----------------------------------------------------------------------------------

const RANK: Record<Severity, number> = { info: 0, ok: 0, mid: 1, high: 2 };

/** Every combination of the five answers, `unknown` included: 4 × 4 × 4 × 4 × 3. */
const everyCombination = (): Situation[] => {
    let all: Situation[] = [EMPTY_SITUATION];

    for (const question of QUESTIONS) {
        const next: Situation[] = [];
        for (const situation of all) {
            for (const option of question.options) {
                next.push({ ...situation, [question.key]: option });
            }
        }
        all = next;
    }

    return all;
};

describe('the asymmetry, over every answer there is', () => {
    const combinations = everyCombination();

    it('walks all of them', () => {
        expect(combinations).toHaveLength(4 * 4 * 4 * 4 * 3);
    });

    it('never takes a severity below where nobody having answered leaves it', () => {
        const floor = find(buildCachingFindings(caching, 'en', criteria), 'updateWeight');
        expect(floor).toBeDefined();

        for (const situation of combinations) {
            const update = find(buildCachingFindings(caching, 'en', criteria, situation), 'updateWeight');
            // And it is still there. Nothing an answer says ever removes a signal from the list:
            // the report reorders and re-thresholds, and it never filters.
            expect(update).toBeDefined();
            expect(RANK[update!.severity]).toBeGreaterThanOrEqual(RANK[floor!.severity]);
        }
    });

    it('only ever raises it on the answers that say the cost is actually paid', () => {
        const raised = combinations.filter(
            situation =>
                find(buildCachingFindings(caching, 'en', criteria, situation), 'updateWeight')?.severity !== 'info',
        );

        // Every one of them answered both halves, and neither with "I don't know".
        expect(raised.length).toBeGreaterThan(0);
        for (const situation of raised) {
            expect(situation.deploys).not.toBe('unknown');
            expect(situation.returning).not.toBe('unknown');
        }
    });
});
