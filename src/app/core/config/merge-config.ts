/**
 * Joining a `loadline.json` with the files it `extends`: what a company writes once and twenty
 * repositories inherit.
 *
 * **One rule, so nobody has to look it up: objects join key by key, lists add up, and the file that
 * extends wins.** It is the rule Biome and webpack follow, and the opposite of `tsconfig.json`,
 * where a list in the child replaces the base's whole — the surprise that file is best known for.
 * Here the lists are things a repository wants to add to: the packages the base allows plus one,
 * the base's acceptances plus its own. What adding cannot do is take something of the base away,
 * and the file already has the way to do that with a reason attached: an entry in `accepted`.
 *
 * Two keys do not join:
 *
 * - **`situation`** is not inherited. It is a team's answers about its own releases and users,
 *   with a name and a date on them, and inheriting it would put somebody else's name on this
 *   repository's report.
 * - **`mode`** cannot change. The base wrote its sizes in its unit; a file that extends it and
 *   says another unit would have every inherited threshold read in the wrong one. That stops the
 *   command, like a gate that cannot be read.
 *
 * Nothing here reads a disk: the command finds the files, the page has none to find, and both
 * join them the same way.
 */

import { RECOMMENDED } from '../criteria/criteria';
import { type Criteria, type Mode } from '../criteria/criteria.types';
import { CONFIG_TEXT, type ConfigText } from './config-text';
import { type LoadlineConfig } from './loadline-config.types';

/** Both lists, the first one's order kept and nothing twice. */
const added = <T>(first: readonly T[] | undefined, second: readonly T[] | undefined): T[] | undefined =>
    first || second ? [...new Set([...(first ?? []), ...(second ?? [])])] : undefined;

/** Both objects, the second one's keys winning. */
const joined = <T extends object>(base: T | undefined, own: T | undefined): T | undefined =>
    base || own ? ({ ...base, ...own } as T) : undefined;

/**
 * `own` on top of `base`. `base` is what `own` extends, already joined with whatever it extends in
 * turn. `own.extends` is dropped from the result: it has been followed, and what comes out is a
 * file that says everything itself.
 *
 * The acceptances of the file that extends go **first**: the first entry that covers a signal is
 * the one applied, and the closer decision is the one that should be.
 */
export const mergeConfigs = (
    base: LoadlineConfig,
    own: LoadlineConfig,
    names: { base: string; own: string },
    t: ConfigText = CONFIG_TEXT.en,
): { config: LoadlineConfig; gateProblems: string[] } => {
    const gateProblems =
        base.mode && own.mode && base.mode !== own.mode
            ? [t.extendsMode(names.own, names.base, base.mode, own.mode)]
            : [];

    const gates = joined(base.gates, own.gates);
    const screens = joined(base.gates?.screens, own.gates?.screens);
    const failOnSignals = added(base.gates?.failOnSignals, own.gates?.failOnSignals);

    const build = joined(base.build, own.build);
    const entries = added(base.build?.entries, own.build?.entries);
    const ignore = added(base.build?.ignore, own.build?.ignore);
    const buildScreens = joined(base.build?.screens, own.build?.screens);

    const mode = own.mode ?? base.mode;
    const criteria = joined(base.criteria, own.criteria);
    const packages = added(base.packages, own.packages);
    const forbidden = added(base.forbidden, own.forbidden);
    const accepted = added(own.accepted, base.accepted);

    const config: LoadlineConfig = {
        ...(own.$schema && { $schema: own.$schema }),
        tool: 'loadline',
        version: 1,
        ...(mode && { mode }),
        ...(criteria && { criteria }),
        ...(gates && {
            gates: { ...gates, ...(screens && { screens }), ...(failOnSignals && { failOnSignals }) },
        }),
        ...(packages && { packages }),
        ...(accepted && { accepted }),
        ...(forbidden && { forbidden }),
        ...(build && {
            build: {
                ...build,
                ...(entries && { entries }),
                ...(ignore && { ignore }),
                ...(buildScreens && { screens: buildScreens }),
            },
        }),
        ...(own.situation && { situation: own.situation }),
    };
    return { config, gateProblems };
};

/**
 * The thresholds the page writes into the file it exports.
 *
 * Every one of them, normally: a file that pins all forty cannot be moved by the next release of
 * the tool. But a file that `extends` a base already has its pins there, and writing all forty into
 * it would override every one of the base's — the repository would stop following the base the
 * first time somebody exported, with nothing to show it. So then only the thresholds that differ
 * from the recommended ones go in: what was changed here, and nothing the base decides.
 */
export const criteriaToWrite = (criteria: Criteria, mode: Mode, inherits: boolean): Partial<Criteria> => {
    if (!inherits) {
        return criteria;
    }
    const recommended = RECOMMENDED[mode];
    return Object.fromEntries(
        Object.entries(criteria).filter(([key, value]) => recommended[key as keyof Criteria] !== value),
    );
};
