/**
 * Reading and writing `loadline.json`, and applying what it says to a list of signals.
 *
 * Nothing here throws. A configuration file with a mistake in it is the worst possible thing to
 * fail a build on silently — the report is what the person came for — so every problem is collected
 * and printed, and the run carries on with whatever of the file could be understood.
 */

import { type Finding, FINDING_KINDS } from '../findings/finding.types';
import { type Lang } from '../i18n/ui-strings';
import { readSituation } from '../situation/situation';
import { CONFIG_TEXT } from './config-text';
import {
    readBuildHints,
    readCriteriaBlock,
    readExtends,
    readForbidden,
    readGatesBlock,
    readMode,
    readPackages,
    readSizeValue,
    SCHEMA_URL,
    unknownTopKeys,
} from './config-values';
import {
    type AcceptedFinding,
    type BuildHints,
    type ConfigReadResult,
    type LoadlineConfig,
} from './loadline-config.types';

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
 * report. Every other block is read by `config-values.ts`, which does the same with what it cannot
 * understand: leaves it out, and names it.
 */
export const readConfig = (value: unknown, lang: Lang = 'en'): ConfigReadResult => {
    const t = CONFIG_TEXT[lang];
    if (!isLoadlineConfig(value)) {
        return {
            config: null,
            problems: [t.notConfig],
            gateProblems: [],
        };
    }

    const file = value as unknown as Record<string, unknown>;
    const mode = readMode(file['mode'], t);
    const criteria = readCriteriaBlock(file['criteria'], t);
    const gates = readGatesBlock(file['gates'], t);
    const packages = readPackages(file['packages'], t);
    const build = readBuildHints(file['build'], t);
    const forbidden = readForbidden(file['forbidden'], t);
    const bases = readExtends(file['extends'], t);
    const problems: string[] = [
        ...build.problems,
        ...unknownTopKeys(file, t),
        ...mode.problems,
        ...criteria.problems,
        ...gates.problems,
        ...packages.problems,
        ...forbidden.problems,
        ...bases.problems,
    ];
    const accepted: AcceptedFinding[] = [];

    const listed: unknown = value.accepted;
    if (listed !== undefined && !Array.isArray(listed)) {
        problems.push(t.acceptedNotList);
    }
    const entries = (Array.isArray(listed) ? listed : []).filter(
        (entry): entry is AcceptedFinding => !!entry && typeof entry === 'object',
    );
    for (const entry of entries) {
        const where = entry.key ? `${entry.kind} · ${entry.key}` : entry.kind;
        if (!KINDS.has(entry.kind)) {
            problems.push(t.unknownAccepted(entry.kind));
            continue;
        }
        if (!entry.why || entry.why.trim().length === 0) {
            problems.push(t.noWhy(where));
            continue;
        }
        // `"12kB"` as readily as bytes, like every other size in the file. One that cannot be read
        // is dropped from the entry, which then covers the signal at any size, and says so.
        const bytes = entry.bytes === undefined ? null : readSizeValue(entry.bytes, t.bytesOf(where), t);
        const sized = bytes && 'problem' in bytes ? { ...entry, bytes: undefined } : { ...entry, bytes: bytes?.value };
        if (bytes && 'problem' in bytes) {
            problems.push(t.ignored(bytes.problem));
        }
        if (entry.until && !DATE.test(entry.until)) {
            problems.push(t.badUntil(where, entry.until));
            accepted.push({ ...sized, until: undefined });
            continue;
        }
        accepted.push(sized);
    }

    // The five answers get the same treatment as the acceptances, and for the same reason: an
    // answer nobody recognises has to become "unanswered" and a line to print, never a silent
    // nothing. An answer is the only thing in this file that can move a colour, so a typo in one
    // is the one mistake here that would change a verdict without anybody noticing.
    const { situation, problems: situationProblems } = readSituation(value.situation, lang);
    problems.push(...situationProblems);

    const read: LoadlineConfig = {
        ...(typeof file['$schema'] === 'string' && { $schema: file['$schema'] }),
        tool: 'loadline',
        version: 1,
        ...(bases.names && { extends: bases.names }),
        ...(mode.mode && { mode: mode.mode }),
        ...(criteria.criteria && { criteria: criteria.criteria }),
        ...(gates.gates && { gates: gates.gates }),
        ...(packages.packages && { packages: packages.packages }),
        ...(forbidden.forbidden && { forbidden: forbidden.forbidden }),
        ...(build.build && { build: build.build }),
        accepted,
        situation,
    };
    // A rule of `forbidden` that cannot be read is a guard that switched itself off, the same as a
    // gate that cannot be: it stops the command rather than being printed and passed.
    return { config: read, problems, gateProblems: [...gates.problems, ...forbidden.problems, ...bases.problems] };
};

/**
 * Whether two `build` blocks read a folder the same way: the same `entries`, `ignore`, `page` and
 * `routeKeys`.
 *
 * `screens`, `own` and `dependencies` are left out on purpose. They reclassify what was read as the
 * report is drawn, so they apply on their own; the other four decide which files are read, from
 * where and with which edges, and a change in them means reading the folder again.
 */
export const sameFolderReading = (a: BuildHints | undefined, b: BuildHints | undefined): boolean => {
    const reading = (hints: BuildHints | undefined): string =>
        JSON.stringify([hints?.entries ?? [], hints?.ignore ?? [], hints?.page ?? null, hints?.routeKeys ?? []]);
    return reading(a) === reading(b);
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
        const grew = entry.bytes !== undefined && (finding.size ?? finding.saving ?? 0) > entry.bytes;
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
 * exists to end — unless the file extends a base, which pins them instead (`criteriaToWrite`). `$schema` goes first, so the file opens in an editor that already knows every key.
 */
export const writeConfig = (config: Omit<LoadlineConfig, 'tool' | 'version' | '$schema'>): string =>
    `${JSON.stringify({ $schema: SCHEMA_URL, tool: 'loadline', version: 1, ...config }, null, 4)}\n`;
