/**
 * What each signal costs to act on.
 *
 * It is a property of the **kind** of signal, not a calculation: there is nothing in a metafile
 * that says how long a refactor takes, and pretending to compute it would be inventing a figure.
 * Written once, here, so the same claim is made in the page and in the terminal.
 *
 * Why it exists: without it, ordering the signals by what they save puts the 400 kB fix that costs
 * two weeks ahead of the 90 kB one that costs ten minutes, and the person who opens the report on
 * a Monday does neither.
 */

import { type FindingKind } from './finding.types';

/**
 * `config` — a line in a configuration file, no code touched.
 * `import` — one or a handful of import statements moved.
 * `refactor` — code has to move between layers, and something else may break.
 * `none` — nothing to do: the signal is context, or its fix is not this project's.
 */
export type Effort = 'config' | 'import' | 'refactor' | 'none';

/** How the three levels order against each other when ranking what to do first. */
export const EFFORT_WEIGHT: Record<Effort, number> = { config: 1, import: 2, refactor: 5, none: 0 };

/**
 * The table. Every kind appears: a missing entry would silently rank as free, and a signal nobody
 * assigned an effort to is exactly the one that would then lead the list.
 */
export const EFFORT: Record<FindingKind, Effort> = {
    // One import moved, or one import narrowed.
    bootLazy: 'import',
    ownInBoot: 'refactor',
    mixedImport: 'import',
    ownBarrel: 'import',
    packageBarrel: 'import',
    locales: 'import',
    commonJs: 'import',
    heavy: 'import',

    // A line of configuration: a budget, an override, a preload link, a chunking rule.
    dupes: 'config',
    vulnerable: 'config',
    paidTwice: 'config',
    bootWaves: 'config',
    sourceMaps: 'config',
    sourceExposed: 'config',
    devLeftovers: 'config',
    budgetNone: 'config',
    budgetNotBuilt: 'config',
    budgetWarnOnly: 'config',
    budgetTooHigh: 'config',
    dataAsCode: 'config',
    unstableChunk: 'config',
    unhashable: 'config',
    inlinedData: 'config',
    duplicateAssets: 'config',
    unreferencedAssets: 'config',
    fonts: 'config',
    media: 'config',

    // Code has to move, and the move is not local.
    shared: 'refactor',
    bigFile: 'refactor',
    slowScreens: 'refactor',
    manyRequests: 'refactor',
    cycles: 'refactor',
    twinScreens: 'refactor',
    measuredEager: 'refactor',

    // Nothing to act on: context, a verdict, or something about the report rather than the build.
    clean: 'none',
    unreachable: 'none',
    // Context when it only means "no breakdown by package", but on a folder whose every screen row
    // is a content hash it is the one thing to do before anything else on the list can be acted on:
    // you cannot move a screen's code when you cannot tell which screen the row is. And the fix is
    // a flag — `--stats-json`, or source maps on — so it belongs with the configuration ones.
    noSourceMaps: 'config',
    // The same shape of thing and the same way out: a flag on the build, and the figures inside the
    // chunks stop reading high. It is about the report rather than the bundle, and it is still the
    // first thing to do — every saving on the list below is quoted in the unit it corrects.
    splitDrift: 'config',
    // A `preconnect` is one tag in the `<head>`, and it is the whole of what can be done about a
    // handshake short of moving the files back. When the page already warms them there is nothing
    // to do, and the signal drops to context — the effort is the same either way.
    // Compression, cache headers and the protocol are all one line in a server or CDN
    // configuration, and none of them is a change to this project's code.
    servedUncompressed: 'config',
    revalidated: 'config',
    poolExhausted: 'config',

    // Observations. Nothing to do about them: they are the frame the rest is read through, and a
    // measurement that agrees with the computation is a result, not a task.
    measuredWaves: 'none',
    thirdPartyLoad: 'none',
    swControlling: 'none',
    measuredOrigin: 'none',
    observedChannel: 'none',

    // The shape of the cascade is how the bundler emits specifiers. Breaking the hub is a line of
    // configuration, and one with a real cost on the other side, so it is never prescribed.
    cascadeShape: 'config',

    assetOrigin: 'config',

    // Turning a framework's prefetching down is a setting, and on a large route table it is the
    // difference between the first visit costing one screen and costing all of them.
    prefetched: 'config',
    zoneless: 'none',
    theirs: 'none',
    // A leaked credential is not a saving and not a refactor: it is an incident, and putting it in
    // a list ordered by kilobytes would be a category mistake. It leads the report by severity.
    secrets: 'none',
    thirdParty: 'none',
    licences: 'none',
    transitive: 'none',
    updateWeight: 'none',
    bootGrew: 'none',
    bootNewPackages: 'none',
    sharedGrew: 'none',
    signalsChanged: 'none',
    screensGrew: 'none',
    measuredExtra: 'none',
    measuredShort: 'none',
    measuredMatch: 'none',

    // What a team answered about itself. There is nothing to do about an answer — it is the frame
    // the rest is read through — with one exception that is still not a task: the card naming the
    // questions nobody has answered. Its fix is to go and answer them, which takes a minute and no
    // code, and calling that `config` would put "answer a question" in a list ordered by kilobytes.
    situationAsked: 'none',
    situationPriority: 'none',
    situationMissing: 'none',
};
