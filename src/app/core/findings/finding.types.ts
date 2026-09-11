/** `info` is context, not a problem: it does not count towards the verdict. */
export type Severity = 'high' | 'mid' | 'ok' | 'info';

/** Where in the report to see what a signal describes: tab and key of the element. */
export interface FindingTarget {
    tab: 'screens' | 'boot' | 'shared' | 'search' | 'project' | 'measured' | 'situation';
    key: string;
}

/**
 * Which signal a finding is, as a key that does not move when the wording does.
 *
 * The chip and the title are copy: they get reworded, and they exist in two languages. Anything
 * that acts on a signal — a bot on a merge request, the checks that read builds nine frameworks
 * wrote — needs to name it without depending on either, and this is that name. It is also what
 * makes "this build raises this signal" a thing a test can assert.
 */
export const FINDING_KINDS = [
    'shared',
    'bootLazy',
    'bigFile',
    'dupes',
    'heavy',
    'clean',
    'commonJs',
    'ownInBoot',
    'locales',
    'dataAsCode',
    'sourceMaps',
    'noSourceMaps',
    'splitDrift',
    'prefetched',
    'unreachable',
    'mixedImport',
    'ownBarrel',
    'packageBarrel',
    'cycles',
    'paidTwice',
    'twinScreens',
    'theirs',
    'fonts',
    'media',
    'duplicateAssets',
    'unreferencedAssets',
    'inlinedData',
    'updateWeight',
    'unstableChunk',
    'unhashable',
    'secrets',
    'devLeftovers',
    'sourceExposed',
    'thirdParty',
    'licences',
    'vulnerable',
    'transitive',
    'bootWaves',
    'slowScreens',
    'manyRequests',
    'bootGrew',
    'bootNewPackages',
    'sharedGrew',
    'signalsChanged',
    'screensGrew',
    'budgetNone',
    'budgetNotBuilt',
    'budgetWarnOnly',
    'budgetTooHigh',
    'zoneless',
    'assetOrigin',
    'cascadeShape',
    'servedUncompressed',
    'measuredWaves',
    'poolExhausted',
    'thirdPartyLoad',
    'revalidated',
    'swControlling',
    'measuredOrigin',
    'observedChannel',
    'measuredEager',
    'measuredExtra',
    'measuredShort',
    'measuredMatch',
    'situationAsked',
    'situationPriority',
    'situationMissing',
] as const;

export type FindingKind = (typeof FINDING_KINDS)[number];

export interface Finding {
    kind: FindingKind;
    severity: Severity;
    chip: string;
    title: string;
    /** HTML: they carry `<strong>` and `<span class="mono">` to highlight names and figures. */
    body: string;
    fix: string;
    target?: FindingTarget;
    /**
     * What acting on this signal would take off the **first load**, in raw minified bytes.
     *
     * Absent when the signal has no figure attached — a budget that only warns saves nothing — and
     * absent rather than zero when it could not be worked out, so the two are told apart. It is the
     * exclusive weight wherever one applies: what has no other way into the bundle.
     */
    saving?: number;
    /**
     * The source files the saving is about.
     *
     * They are kept because the savings of several signals cannot simply be added: two of them
     * often name the same bytes coming in by two routes. Adding up "what all of this is worth"
     * means taking every one of these files out of the graph **at once** and walking it again,
     * which is what `totalSaving` does.
     */
    sources?: string[];
}

/** What a `bootLazy` signal says about a package: where it enters the bootstrap and where its screen is loaded from. */
export interface BootLazyData {
    pkg: string;
    size: string;
    files: number;
    /** The lazy screens importing it, as HTML. */
    screens: string;
    /** From the entry to the package, as HTML. `null` when it could not be followed. */
    chain: string | null;
    /** The own file whose import brings the package in: the one to edit. */
    entry: string | null;
    /** The routes file(s) lazy-loading those screens: where the providers go. */
    routes: string | null;
}

/** One copy of a duplicated package: which version, how heavy, where it lands and what brings it. */
export interface DupeCopyData {
    /** `null` when the layout does not write it into the path, which is npm's and yarn's case. */
    version: string | null;
    /** The package this copy is nested inside, when it is not the one at the top level. */
    under: string | null;
    size: string;
    /** Already translated: the copy's zone as words. */
    zone: string;
    /** The import chain as HTML. `null` when it could not be followed. */
    chain: string | null;
    /** Own files importing this copy, as HTML. `null` when none does. */
    own: string | null;
    /** Packages bringing it in, as HTML, for when no own file imports it. */
    via: string | null;
}

export interface DupesData {
    count: number;
    /** Every package with each of its copies, already composed. */
    list: string;
    /** A copy nobody asked for directly: aligning the project's `package.json` will not move it. */
    viaDependency: boolean;
    inBoot: boolean;
}

/** One CommonJS package, with where it lands and who brings it. */
export interface CommonJsItem {
    name: string;
    size: string;
    zone: 'boot' | 'shared' | 'own';
    screens: number;
    importers: string[];
    via: string[];
}

/** Where the page fetches its own code from, when that is not the page's own host. */
export interface AssetOriginData {
    /** The hosts carrying JavaScript, as the page writes them. */
    origins: string[];
    /** How many script files come from them between them. */
    scripts: number;
    /** Every file on another host, scripts included: stylesheets, fonts and images count too. */
    files: number;
    /** Of those hosts, the ones the page does not warm in advance: the handshake is on the clock. */
    cold: string[];
    /** The ones it does warm with `preconnect` or `dns-prefetch`. */
    warmed: string[];
    /** A `<base href>` on another host, which moves every relative URL of the page at once. */
    base: string | null;
}

/**
 * The channel as one paste observed it, with everything needed to say how far it can be trusted.
 *
 * Every field of it is nullable because the honest answer to most of these is often "the paste did
 * not say", and turning that into an average is the one thing this block exists not to do.
 */
export interface ObservedChannelData {
    protocol: string | null;
    /** Every protocol seen, when there was more than one. A mixed deployment is a fact, not noise. */
    mixed: string | null;
    /** A measured round trip, in milliseconds. */
    rttMs: number | null;
    /** How long the document itself took: wave zero, which the round-trip count starts after. */
    ttfbMs: number | null;
    /** The latency the report's own seconds are computed with, to compare against. */
    latencyMs: number;
    takenAt: string | null;
    stale: boolean;
    freshDays: number;
    /** `modulepreload` tags in the live document: what the framework really emits. */
    modulepreloads: number | null;
    /** Whether the paste carried timings. Without them, half of the block above is `null`. */
    timed: boolean;
}

/** The gap between what was computed for a screen and what the browser actually downloaded. */
export interface MeasuredExtraData {
    screen: string;
    /** How much more came down, already formatted. */
    diff: string;
    computed: string;
    measured: string;
    computedFiles: number;
    measuredFiles: number;
    count: number;
    /** The unpredicted chunks, as HTML. */
    list: string;
}

/**
 * What somebody declared about the world this build ships into, ready to be read back to them.
 *
 * Almost every field is nullable for the same reason the observed block's are: the honest answer
 * to most of these is "nobody said", and the one thing this block exists not to do is turn that
 * into an average. `perWeek` in particular is `null` far more often than it is a number, and the
 * copy has a whole branch for that case rather than a fallback value.
 */
export interface SituationAskedData {
    answered: number;
    total: number;
    /** Who answered and when, so a reader in a year can go and ask them. */
    by: string | null;
    at: string | null;
    /** Past its year. An answer about how a team deploys is exactly the kind that stops being true. */
    stale: boolean;
    freshDays: number;
    /** They have RUM, so the fourth question is imported rather than answered. */
    rum: boolean;
    /** Releases per week and warm-cache share: the two halves of the multiplication, shown apart. */
    deploys: number | null;
    returning: number | null;
    /** Their product: how many times a week one person pays an invalidation. */
    perWeek: number | null;
    exposure: 'high' | 'moderate' | 'low' | 'unknown';
    breadth: 'narrow' | 'wide' | 'mixed' | 'unknown';
    /** The latency the report's seconds are computed with, which is where question four lands. */
    latencyMs: number;
}

/** The answer to the one question no file can hold, and what this build is allowed to do with it. */
export interface SituationPriorityData {
    priority: 'firstScreen' | 'navigation' | 'both' | 'unknown';
    breadth: 'narrow' | 'wide' | 'mixed' | 'unknown';
    /** Whether this build actually prefetches anything, so the advice is about it and not in general. */
    prefetching: boolean;
    /** Whether anything in this report is counting round trips, which is the other half of the trade. */
    waves: boolean;
}

/** The questions still open **whose answer would change this report**, never the five in general. */
export interface SituationMissingData {
    keys: readonly string[];
    /** Each one in a clause, already translated: "how often you deploy". */
    asks: readonly string[];
    /** Whether anything at all has been answered, which changes the opening sentence. */
    started: boolean;
}
