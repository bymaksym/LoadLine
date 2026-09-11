/**
 * The signals that exist because somebody answered the five questions.
 *
 * They are the third source of facts in the report, next to what the build says and what a browser
 * measured, and they are the weakest of the three: a declared answer is worth more than a guess and
 * less than a measurement. Everything below is written to keep that ranking visible — who answered,
 * when, and which figure came from a band rather than from a query.
 *
 * **What they are for.** Four claims in this report have been grey on purpose. The update cost
 * shows its percentage and withholds its colour; the cascade names its topology and refuses to say
 * whether it matters; the granularity signal puts two magnitudes on the table and declines to
 * recommend a direction. None of that is caution for its own sake — the facts that would settle
 * them are facts about a team and its users, and no folder on disk contains them. These answers
 * are the only way they ever arrive.
 *
 * **What they must never do.** The asymmetry holds here exactly as it does for measurements, and
 * harder, because the evidence is softer: an answer may raise a severity and may not lower one.
 * `unknown` does nothing at all. The consequence worth stating is that a team cannot quiet this
 * report by answering the questions optimistically — the most an optimistic answer buys is a
 * paragraph saying the cost was priced and found small.
 */

import { type Criteria } from '../criteria/criteria.types';
import { type Lang } from '../i18n/ui-strings';
import {
    answeredCount,
    cascadeExposure,
    deploysPerWeek,
    hasSituation,
    invalidationsPerWeek,
    isStaleSituation,
    returningShare,
    sessionBreadth,
    SITUATION_FRESH_DAYS,
    unanswered,
} from '../situation/situation';
import { type Situation, type SituationKey } from '../situation/situation.types';
import { type Finding, type FindingKind } from './finding.types';
import { TEXT } from './finding-text';

/**
 * Which signal being on the report makes which question worth asking.
 *
 * Without this the missing-answers card is boilerplate: five questions listed on every report
 * whatever it found, which is the shape of text people learn to scroll past. With it the card only
 * ever names a question whose answer would change something on the page in front of them.
 *
 * The fifth question is the odd one: it is not tied to a signal that fires but to a **tension**
 * between signals, so it is asked whenever the report is both counting round trips and weighing
 * what to defer — which is when "which wait is worse" stops being academic.
 */
const ASKED_BY: Record<SituationKey, readonly FindingKind[]> = {
    navigation: ['shared', 'prefetched', 'twinScreens'],
    deploys: ['updateWeight', 'cascadeShape', 'unstableChunk'],
    returning: ['updateWeight', 'cascadeShape', 'unstableChunk'],
    connection: ['bootWaves', 'slowScreens', 'manyRequests', 'poolExhausted'],
    priority: ['manyRequests', 'bootWaves', 'prefetched', 'slowScreens'],
};

/** The questions still open whose answer would change something on this particular report. */
const missingThatMatter = (situation: Situation, kinds: ReadonlySet<FindingKind>): SituationKey[] =>
    unanswered(situation).filter(key => ASKED_BY[key].some(kind => kinds.has(kind)));

export const buildSituationFindings = (
    situation: Situation,
    findings: readonly Finding[],
    lang: Lang,
    c: Criteria,
    today: string = new Date().toISOString().slice(0, 10),
): Finding[] => {
    const text = TEXT[lang];
    const out: Finding[] = [];
    const kinds = new Set(findings.map(finding => finding.kind));

    // --- what was declared, and by whom ---------------------------------------------------------
    // First, because it is the frame the other two are read through: a figure below is only worth
    // as much as the answer it came from, and this is where the answer has its name and its date.
    if (hasSituation(situation)) {
        const perWeek = invalidationsPerWeek(situation);
        out.push({
            severity: 'info',
            target: { tab: 'situation', key: '' },
            kind: 'situationAsked',
            ...text.situationAsked({
                answered: answeredCount(situation),
                total: 5,
                by: situation.answeredBy,
                at: situation.answeredAt,
                stale: isStaleSituation(situation, today),
                freshDays: SITUATION_FRESH_DAYS,
                rum: situation.rum,
                // The multiplication rather than its result: somebody who disagrees with the number
                // needs to see which of the two halves they disagree with.
                deploys: deploysPerWeek(situation),
                returning: returningShare(situation),
                perWeek,
                exposure: cascadeExposure(situation),
                breadth: sessionBreadth(situation),
                latencyMs: c.latencyMs,
            }),
        });
    }

    // --- the one question no file can answer -----------------------------------------------------
    // The report refuses to give a direction on defer-versus-prefetch everywhere else, and it is
    // right to: the two magnitudes trade against each other and nothing in a build folder ranks
    // them. This is the answer arriving, so the direction is finally allowed to be said out loud.
    if (situation.priority !== 'unknown') {
        out.push({
            severity: 'info',
            target: { tab: 'situation', key: '' },
            kind: 'situationPriority',
            ...text.situationPriority({
                priority: situation.priority,
                breadth: sessionBreadth(situation),
                // Whether this build has anything the answer applies to. Without it the card is
                // advice about somebody else's application.
                prefetching: kinds.has('prefetched'),
                waves: kinds.has('bootWaves') || kinds.has('slowScreens'),
            }),
        });
    }

    // --- what is still missing, and only where it would matter ------------------------------------
    const missing = missingThatMatter(situation, kinds);
    if (missing.length > 0) {
        out.push({
            severity: 'info',
            target: { tab: 'situation', key: '' },
            kind: 'situationMissing',
            ...text.situationMissing({
                keys: missing,
                asks: missing.map(key => text.situationAsks[key]),
                // A report where nobody has answered anything reads differently from one where two
                // of the five are still open, and the opening sentence has to be the right one.
                started: hasSituation(situation),
            }),
        });
    }

    return out;
};
