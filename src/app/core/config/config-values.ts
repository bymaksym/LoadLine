/**
 * The blocks of `loadline.json` other than the acceptances and the answers, read the same way they
 * are: whatever cannot be understood is named in a problem and left out, never ignored in silence.
 *
 * Silence was the failure. `"maxBot": "350kB"` switched no gate on, `"maxBoot": "big"` switched it
 * off, and a criterion with a typo in its name kept the recommended value — each one a build judged
 * by something other than what the file says, with nothing on screen to show it.
 *
 * It also lets every size be written one way. The criteria used to be bytes (`174080`) while the
 * gates were text (`"350kB"`); both are accepted everywhere now, and a share can be `"25%"` as well
 * as `0.25`. What comes out is the shape it always was — bytes and fractions — so nothing that
 * reads the file had to change.
 */

import { isRouteKey } from '../build-text/route-table';
import { CRITERIA_FIELDS, RECOMMENDED } from '../criteria/criteria';
import { type Criteria, type Mode, type Unit } from '../criteria/criteria.types';
import { FINDING_KINDS, type FindingKind } from '../findings/finding.types';
import { parseSize } from '../project/project-context';
import { CONFIG_TEXT, type ConfigText } from './config-text';
import { type BuildHints, type ConfigGates, type ForbiddenRule } from './loadline-config.types';

/**
 * Where the published schema lives: the package on npm, through a CDN that serves its files. Here
 * and not next to the schema's builder because the page writes it into every file it exports, and
 * importing it from there carried the whole generator — every signal's name — into the page.
 */
export const SCHEMA_URL = 'https://unpkg.com/@bymaksym/loadline/loadline.schema.json';

/** Every key the file may have at its top level. `$schema` is the editor's, and is read by nobody. */
export const TOP_KEYS = [
    '$schema',
    'tool',
    'version',
    'extends',
    'mode',
    'criteria',
    'gates',
    'packages',
    'accepted',
    'forbidden',
    'situation',
    'build',
] as const;

/** The gates whose value is a size. */
export const SIZE_GATE_KEYS = ['maxBoot', 'maxScreen', 'maxOwn', 'maxGrowth'] as const;

const GATE_KEYS = new Set<string>([
    ...SIZE_GATE_KEYS,
    'maxGrowthPct',
    'failOn',
    'failOnNewPackage',
    'failOnSignals',
    'screens',
]);
const KINDS = new Set<string>(FINDING_KINDS);
const MODES = new Set<string>(['raw', 'gzip', 'brotli']);
const FAIL_ON = new Set<string>(['high', 'mid', 'none']);

/** Below this a number with no unit is a size somebody meant in kilobytes: nothing is that small. */
const BARE_FLOOR = 1000;
const BARE = /^\d+(?:\.\d+)?$/;

/** The unit of every criterion, the second threshold of a pair included. */
export const UNIT_OF: ReadonlyMap<string, Unit> = new Map(
    CRITERIA_FIELDS.flatMap(field => [
        [field.key, field.unit] as const,
        ...(field.pairWith ? [[field.pairWith, field.unit] as const] : []),
    ]),
);

type Read<T> = { value: T } | { problem: string };

/**
 * A size: `"350kB"`, `"1.5MB"`, or bytes as a number. A bare figure under a thousand is refused,
 * because `350` meaning 350 bytes is never what was meant and it fails every build.
 */
export const readSizeValue = (value: unknown, where: string, t: ConfigText = CONFIG_TEXT.en): Read<number> => {
    const typed = typeof value === 'string' ? value.trim() : value;
    const bytes = parseSize(typed);
    if (bytes === null) {
        return { problem: t.notSize(where, JSON.stringify(value)) };
    }
    const bare = typeof typed === 'number' || BARE.test(String(typed));
    return bare && bytes < BARE_FLOOR ? { problem: t.bareSize(where, String(typed)) } : { value: bytes };
};

/** A share: `"25%"` or the fraction `0.25`. */
const readShare = (value: unknown, where: string, t: ConfigText): Read<number> => {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        return { value };
    }
    const match = typeof value === 'string' ? /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(value) : null;
    return match?.[1] ? { value: Number(match[1]) / 100 } : { problem: t.notShare(where, JSON.stringify(value)) };
};

const readNumber = (value: unknown, where: string, t: ConfigText): Read<number> =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0
        ? { value }
        : { problem: t.notNumber(where, JSON.stringify(value)) };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    !!value && typeof value === 'object' && !Array.isArray(value);

/** The keys at the top of the file that nothing reads, each one a problem. */
export const unknownTopKeys = (file: Record<string, unknown>, t: ConfigText = CONFIG_TEXT.en): string[] =>
    Object.keys(file)
        .filter(key => !(TOP_KEYS as readonly string[]).includes(key))
        .map(key => t.unknownTopKey(key));

/**
 * `extends`: one name or a list of them, read as a list. One it cannot read is a problem for the
 * gates, because whatever the base would have guarded is not guarded.
 */
export const readExtends = (
    value: unknown,
    t: ConfigText = CONFIG_TEXT.en,
): { names?: string[]; problems: string[] } => {
    if (value === undefined) {
        return { problems: [] };
    }
    const names = typeof value === 'string' ? [value] : value;
    return Array.isArray(names) && names.length > 0 && names.every(name => typeof name === 'string' && name !== '')
        ? { names: names as string[], problems: [] }
        : { problems: [t.badExtends] };
};

export const readMode = (value: unknown, t: ConfigText = CONFIG_TEXT.en): { mode?: Mode; problems: string[] } => {
    if (value === undefined) {
        return { problems: [] };
    }
    return typeof value === 'string' && MODES.has(value)
        ? { mode: value as Mode, problems: [] }
        : { problems: [t.badMode(JSON.stringify(value))] };
};

export const readCriteriaBlock = (
    value: unknown,
    t: ConfigText = CONFIG_TEXT.en,
): { criteria?: Partial<Criteria>; problems: string[] } => {
    if (value === undefined) {
        return { problems: [] };
    }
    if (!isRecord(value)) {
        return { problems: [t.criteriaNotObject] };
    }

    const known = new Set(Object.keys(RECOMMENDED.raw));
    const criteria: Partial<Criteria> = {};
    const problems: string[] = [];
    for (const [key, raw] of Object.entries(value)) {
        if (!known.has(key)) {
            problems.push(t.unknownCriterion(key));
            continue;
        }
        const unit = UNIT_OF.get(key);
        const where = `"criteria.${key}"`;
        const read =
            unit === 'kb'
                ? readSizeValue(raw, where, t)
                : unit === 'pct'
                  ? readShare(raw, where, t)
                  : readNumber(raw, where, t);
        if ('problem' in read) {
            problems.push(t.recommendedStays(read.problem));
            continue;
        }
        criteria[key as keyof Criteria] = read.value;
    }
    return { criteria, problems };
};

/**
 * The gates, with each size checked here rather than at the moment it is used: a size that does
 * not parse used to become "no gate", which is the quietest way a pipeline can stop guarding.
 */
export const readGatesBlock = (
    value: unknown,
    t: ConfigText = CONFIG_TEXT.en,
): { gates?: ConfigGates; problems: string[] } => {
    if (value === undefined) {
        return { problems: [] };
    }
    if (!isRecord(value)) {
        return { problems: [t.gatesNotObject] };
    }

    const gates: ConfigGates = {};
    const problems: string[] = [];
    const off = (problem: string): void => {
        problems.push(t.gateOff(problem));
    };

    for (const key of Object.keys(value)) {
        if (!GATE_KEYS.has(key)) {
            problems.push(t.unknownGate(key));
        }
    }
    for (const key of SIZE_GATE_KEYS) {
        if (value[key] === undefined) {
            continue;
        }

        const read = readSizeValue(value[key], `"gates.${key}"`, t);
        if ('problem' in read) {
            off(read.problem);
        } else {
            gates[key] = read.value;
        }
    }
    if (value['maxGrowthPct'] !== undefined) {
        const raw = value['maxGrowthPct'];
        const read =
            typeof raw === 'string'
                ? readShare(raw, '"gates.maxGrowthPct"', t)
                : readNumber(raw, '"gates.maxGrowthPct"', t);
        if ('problem' in read) {
            off(read.problem);
        } else {
            // `10` and `"10%"` both mean ten per cent here: the file has always written it as `10`.
            gates.maxGrowthPct = typeof raw === 'string' ? read.value * 100 : read.value;
        }
    }
    if (value['failOn'] !== undefined) {
        if (typeof value['failOn'] === 'string' && FAIL_ON.has(value['failOn'])) {
            gates.failOn = value['failOn'] as ConfigGates['failOn'];
        } else {
            off(t.badFailOn(JSON.stringify(value['failOn'])));
        }
    }
    if (value['failOnNewPackage'] !== undefined) {
        if (typeof value['failOnNewPackage'] === 'boolean') {
            gates.failOnNewPackage = value['failOnNewPackage'];
        } else {
            off(t.badFailOnNewPackage);
        }
    }
    // A name that is not a signal is a gate that guards nothing, so it stops the run like any other
    // unreadable gate; the names that are signals still apply.
    const signals = value['failOnSignals'];
    if (signals !== undefined) {
        if (Array.isArray(signals) && signals.every(item => typeof item === 'string')) {
            const kinds: FindingKind[] = [];
            for (const kind of signals) {
                if (KINDS.has(kind)) {
                    kinds.push(kind as FindingKind);
                } else {
                    off(t.unknownFailOnSignal(kind));
                }
            }
            gates.failOnSignals = kinds;
        } else {
            off(t.badFailOnSignals);
        }
    }

    const screens = value['screens'];
    if (screens !== undefined) {
        if (isRecord(screens)) {
            gates.screens = {};
            for (const [screen, raw] of Object.entries(screens)) {
                const read = readSizeValue(raw, `"gates.screens.${screen}"`, t);
                if ('problem' in read) {
                    off(read.problem);
                } else {
                    gates.screens[screen] = read.value;
                }
            }
        } else {
            off(t.badScreens);
        }
    }

    return { gates, problems };
};

export const readPackages = (
    value: unknown,
    t: ConfigText = CONFIG_TEXT.en,
): { packages?: string[]; problems: string[] } => {
    if (value === undefined) {
        return { problems: [] };
    }
    return Array.isArray(value) && value.every(item => typeof item === 'string')
        ? { packages: value, problems: [] }
        : { problems: [t.badPackages] };
};

const PLACES = new Set<string>(['bootstrap', 'anywhere']);

/**
 * The `forbidden` list. Every entry it cannot use is a problem **for the gates**, not a line to
 * print: a rule with a typo in it forbids nothing, and a build that ships what it was meant to stop
 * would pass with nothing but a warning in the log.
 */
export const readForbidden = (
    value: unknown,
    t: ConfigText = CONFIG_TEXT.en,
): { forbidden?: ForbiddenRule[]; problems: string[] } => {
    if (value === undefined) {
        return { problems: [] };
    }
    if (!Array.isArray(value)) {
        return { problems: [t.forbiddenNotList] };
    }

    const forbidden: ForbiddenRule[] = [];
    const problems: string[] = [];
    for (const [index, entry] of value.entries()) {
        const rule: Record<string, unknown> = isRecord(entry) ? entry : {};
        const pkg = typeof rule['package'] === 'string' && rule['package'] !== '' ? rule['package'] : undefined;
        const path = typeof rule['path'] === 'string' && rule['path'] !== '' ? rule['path'] : undefined;
        const where = pkg ?? path ?? `#${index + 1}`;
        const place = rule['in'] ?? 'anywhere';
        const why = typeof rule['why'] === 'string' ? rule['why'].trim() : '';

        if ((pkg === undefined) === (path === undefined)) {
            problems.push(t.forbiddenWhat(where));
        } else if (typeof place !== 'string' || !PLACES.has(place)) {
            problems.push(t.forbiddenIn(where, JSON.stringify(place)));
        } else if (why === '') {
            problems.push(t.forbiddenNoWhy(where));
        } else {
            forbidden.push({
                ...(pkg && { package: pkg }),
                ...(path && { path }),
                in: place as ForbiddenRule['in'],
                why,
            });
        }
    }
    return { forbidden, problems };
};

/** The `build` block: lists of file names and paths, each read on its own so one bad list keeps the others. */
export const readBuildHints = (
    value: unknown,
    t: ConfigText = CONFIG_TEXT.en,
): { build?: BuildHints; problems: string[] } => {
    if (value === undefined) {
        return { problems: [] };
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { problems: [t.badBuild] };
    }
    const block = value as Record<string, unknown>;
    const names = (key: 'entries' | 'ignore' | 'own' | 'dependencies' | 'routeKeys'): string[] | undefined => {
        const list = block[key];
        return Array.isArray(list) && list.every(item => typeof item === 'string' && item !== '') ? list : undefined;
    };
    const entries = names('entries');
    const ignore = names('ignore');
    const own = names('own');
    const dependencies = names('dependencies');
    const routeKeys = names('routeKeys');
    const problems = (['entries', 'ignore', 'own', 'dependencies', 'routeKeys'] as const)
        .filter(key => block[key] !== undefined && names(key) === undefined)
        .map(key => t.badBuildList(key));
    // A key is a property name; anything else could not be one, and would go into a pattern.
    problems.push(...(routeKeys ?? []).filter(key => !isRouteKey(key)).map(key => t.badRouteKey(key)));

    const marked = block['screens'];
    const screens: Record<string, 'screen' | 'piece'> = {};
    if (marked !== undefined && (!marked || typeof marked !== 'object' || Array.isArray(marked))) {
        problems.push(t.badBuildScreens);
    }
    const said: [string, unknown][] = Object.entries(
        marked && typeof marked === 'object' ? (marked as Record<string, unknown>) : {},
    );
    for (const [pattern, kind] of said) {
        if (kind === 'screen' || kind === 'piece') {
            screens[pattern] = kind;
        } else {
            problems.push(t.badBuildScreen(pattern));
        }
    }
    const page = block['page'];
    if (page !== undefined && (typeof page !== 'string' || page === '')) {
        problems.push(t.badBuildPage);
    }

    return {
        build: {
            ...(entries && { entries }),
            ...(ignore && { ignore }),
            ...(own && { own }),
            ...(dependencies && { dependencies }),
            ...(routeKeys && { routeKeys: routeKeys.filter(key => isRouteKey(key)) }),
            ...(Object.keys(screens).length > 0 && { screens }),
            ...(typeof page === 'string' && page !== '' && { page }),
        },
        problems,
    };
};
