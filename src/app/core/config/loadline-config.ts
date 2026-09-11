/**
 * Reading and writing `loadline.json`, and applying what it says to a list of signals.
 *
 * Nothing here throws. A configuration file with a mistake in it is the worst possible thing to
 * fail a build on silently — the report is what the person came for — so every problem is collected
 * and printed, and the run carries on with whatever of the file could be understood.
 */

import { type Finding, FINDING_KINDS } from '../findings/finding.types';
import { readSituation } from '../situation/situation';
import { type AcceptedFinding, type ConfigReadResult, type LoadlineConfig } from './loadline-config.types';

const KINDS = new Set<string>(FINDING_KINDS);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Tells the file apart from anything else somebody points `--config` at. */
export const isLoadlineConfig = (value: unknown): value is LoadlineConfig => {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const candidate = value as Partial<LoadlineConfig>;
    return candidate.tool === 'loadline' && candidate.version === 1;
};

/**
 * Reads the file, naming what is wrong with it instead of failing.
 *
 * An acceptance is dropped when it names a signal that does not exist or gives no reason: both are
 * ways of suppressing something by accident, and a suppression nobody meant is worse than a noisy
 * report. Everything else is kept.
 */
export const readConfig = (value: unknown): ConfigReadResult => {
    if (!isLoadlineConfig(value)) {
        return { config: null, problems: ['Not a loadline.json: it needs "tool": "loadline" and "version": 1.'] };
    }

    const problems: string[] = [];
    const accepted: AcceptedFinding[] = [];

    const entries = value.accepted ?? [];
    for (const entry of entries) {
        const where = entry.key ? `${entry.kind} · ${entry.key}` : entry.kind;
        if (!KINDS.has(entry.kind)) {
            problems.push(`Unknown signal in "accepted": ${entry.kind}. It accepts nothing.`);
            continue;
        }
        if (!entry.why || entry.why.trim().length === 0) {
            problems.push(`The acceptance of ${where} has no "why". An acceptance without a reason is a suppression.`);
            continue;
        }
        if (entry.until && !DATE.test(entry.until)) {
            problems.push(`The "until" of ${where} is not a YYYY-MM-DD date: ${entry.until}. It is ignored.`);
            accepted.push({ ...entry, until: undefined });
            continue;
        }
        accepted.push(entry);
    }

    // The five answers get the same treatment as the acceptances, and for the same reason: an
    // answer nobody recognises has to become "unanswered" and a line to print, never a silent
    // nothing. An answer is the only thing in this file that can move a colour, so a typo in one
    // is the one mistake here that would change a verdict without anybody noticing.
    const { situation, problems: situationProblems } = readSituation(value.situation);
    problems.push(...situationProblems);

    return { config: { ...value, accepted, situation }, problems };
};

/** Why an acceptance did not apply, when it did not. */
export type AcceptanceLapse = 'expired' | 'grew';

export interface AppliedAcceptance {
    finding: Finding;
    entry: AcceptedFinding;
    /** `null` when the acceptance held and the signal was set aside. */
    lapse: AcceptanceLapse | null;
}

/** Which named thing a signal is about, as an acceptance would name it. */
const keyOf = (finding: Finding): string => finding.target?.key ?? '';

/**
 * Applies the acceptances.
 *
 * Two things make an acceptance stop covering a signal, and both of them are the point rather than
 * an edge case:
 *
 * - **It ran out.** The date passed. The signal comes back, with a line saying it was accepted
 *   until then, so nobody has to remember what the decision was.
 * - **The figure moved.** What was accepted was 12 kB of duplication; the build now has 400. That
 *   is not the thing anybody agreed to live with.
 */
export const applyAcceptances = (
    findings: readonly Finding[],
    config: LoadlineConfig | null,
    today = new Date(),
): { kept: Finding[]; accepted: AppliedAcceptance[] } => {
    const entries = config?.accepted ?? [];
    if (entries.length === 0) {
        return { kept: [...findings], accepted: [] };
    }

    const kept: Finding[] = [];
    const accepted: AppliedAcceptance[] = [];
    const day = today.toISOString().slice(0, 10);

    for (const finding of findings) {
        const entry = entries.find(item => item.kind === finding.kind && (!item.key || item.key === keyOf(finding)));
        if (!entry) {
            kept.push(finding);
            continue;
        }

        const expired = !!entry.until && entry.until < day;
        const grew = entry.bytes !== undefined && (finding.saving ?? 0) > entry.bytes;
        const lapse: AcceptanceLapse | null = expired ? 'expired' : grew ? 'grew' : null;

        accepted.push({ finding, entry, lapse });
        if (lapse) {
            kept.push(finding);
        }
    }

    return { kept, accepted };
};

/**
 * The file as the page writes it.
 *
 * The whole criteria object goes in, not only what was changed: the file has to pin every threshold
 * or the next release of the tool silently moves one of them, which is the same drift this file
 * exists to end.
 */
export const writeConfig = (config: Omit<LoadlineConfig, 'tool' | 'version'>): string =>
    `${JSON.stringify({ tool: 'loadline', version: 1, ...config }, null, 4)}\n`;
