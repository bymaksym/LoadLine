/**
 * Rating criteria: the thresholds Loadline uses to say "good", "fair" or "bad", and the ones that fire
 * the signals. The recommended values live here; the person can change them from the UI.
 */

import { type Criteria, type CriteriaField, type Mode, type Unit, type Verdict } from './criteria.types';

const KB = 1024;

/** The three units a report can be in. One list, so the page, the export and the command agree. */
export const MODES: Mode[] = ['raw', 'gzip', 'brotli'];

/** Proportions and counts: nothing about them changes when the figures are compressed. */
const SHARES = {
    sharedRatio: 0.6,
    wideRatio: 0.3,
    dominantRatio: 0.5,
    bootPackageMaxImporters: 4,
    heavyScreenFactor: 6,
    heavyScreenMinScreens: 4,
    growthRatio: 0.1,
    sharedGrowthTolerance: 0.15,
    sharedGrowthMinScreens: 3,
    budgetSlackFactor: 2,
    theirsRatio: 0.7,
    latencyMs: 150,
    manyCrumbs: 3,
    concentratedRatio: 0.6,
    heavyInZoneRatio: 0.25,
    heavyShareRatio: 0.8,
    minTinyChunks: 5,
    minLocales: 3,
    /**
     * Thirty files for one screen. Requests over HTTP/2 are cheap and not free: each one is a
     * round of headers, a cache entry and a module wrapper, and browsers schedule a handful at a
     * time. The number is a place to start looking, not a budget — the signal it fires says as
     * much, and says when to ignore it.
     */
    screenFilesMax: 30,
    /**
     * Three round trips. One is the ideal — the loader asks for everything at once — and two is
     * what a chunk importing a shared chunk costs, which is ordinary. At three there is a chain:
     * the browser cannot know about the last file until two others have arrived and been parsed,
     * and on a connection with 200 ms of latency that is half a second the size figures cannot see.
     */
    screenWavesMax: 3,
};

/**
 * Sizes measured **inside** a chunk: what one source file or one package contributes to it.
 *
 * These do not have a compressed version and cannot have one — gzip works on the whole file, so
 * there is no compressed share of a single module — so the figure they are compared against is
 * always raw minified bytes and the threshold is the same number in the three modes.
 *
 * They used to sit in the per-mode table below, which meant that loading the build folder made
 * `bootPackageMinBytes` drop from 25 kB to 8 kB while the figure it was compared against did not
 * move at all: the same build raised the bootstrap-package signal about three times more often
 * for no reason having anything to do with the build.
 */
const FILE_SIZES = {
    bootPackageMinBytes: 25 * KB,
    ownFolderMinBytes: 12 * KB,
    bigOwnFileBytes: 20 * KB,
    shippedMinBytes: 10 * KB,
    grouperMaxBytes: 1 * KB,
    barrelMinBytes: 20 * KB,
    paidTwiceMinBytes: 10 * KB,
};

/**
 * Sizes that price a **request** rather than a budget: below them, asking for a file costs about
 * what the file holds. What travels is the compressed file, so the compressed value is the one
 * that was reasoned about and the raw column is the same line in uncompressed bytes.
 */
const REQUEST_SIZES: Record<Mode, Pick<Criteria, 'crumbMaxBytes' | 'tinyChunkBytes'>> = {
    raw: { crumbMaxBytes: 15 * KB, tinyChunkBytes: 3 * KB },
    gzip: { crumbMaxBytes: 5 * KB, tinyChunkBytes: 1 * KB },
    brotli: { crumbMaxBytes: 5 * KB, tinyChunkBytes: 1 * KB },
};

/**
 * The signal thresholds that are sizes of a whole chunk, in the unit of the report.
 *
 * They used to be one set of raw figures for the three modes. That looked stable and was not: a
 * 50 kB minimum applied to gzip figures is three times stricter than the same rule applied to raw
 * ones, so on a compressed report every shared chunk fell under it and the tab said "67 below the
 * size worth bothering with" while the same build in raw would have flagged several. A threshold
 * that means something different depending on the unit is not one threshold.
 *
 * The raw column is the original set; the other two are the same budgets in their own unit, with
 * the 3:1 ratio JavaScript compresses at and brotli's extra 15 % — exactly what the size thresholds
 * above already do.
 */
const SIGNAL_SIZES: Record<Mode, Pick<Criteria, 'sharedMinBytes' | 'heavyScreenMinBytes' | 'growthMinBytes'>> = {
    raw: {
        sharedMinBytes: 50 * KB,
        heavyScreenMinBytes: 100 * KB,
        growthMinBytes: 10 * KB,
    },
    gzip: {
        sharedMinBytes: 17 * KB,
        heavyScreenMinBytes: 34 * KB,
        growthMinBytes: 3 * KB,
    },
    brotli: {
        sharedMinBytes: 14 * KB,
        heavyScreenMinBytes: 29 * KB,
        growthMinBytes: 3 * KB,
    },
};

/**
 * Recommended values.
 *
 * Compressed: ~170 kB of initial JavaScript is the usual budget for a page to become responsive
 * within a few seconds on a mid-range phone; twice that is clearly too much. Per-screen and
 * own-code values are reasonable multiples of that same budget.
 *
 * Raw: 500 kB and 1 MB are the budgets Angular CLI writes by default into `angular.json`
 * (`maximumWarning` / `maximumError` of the initial bundle). The rest scales like compressed,
 * with the typical 3:1 ratio between raw and gzip for JavaScript.
 */
export const RECOMMENDED: Record<Mode, Criteria> = {
    gzip: {
        bootOk: 170 * KB,
        bootBad: 350 * KB,
        screenOk: 300 * KB,
        screenBad: 600 * KB,
        ownOk: 50 * KB,
        ownBad: 150 * KB,
        ...SHARES,
        ...FILE_SIZES,
        ...REQUEST_SIZES.gzip,
        ...SIGNAL_SIZES.gzip,
    },
    /**
     * Brotli takes some 15 % more off minified JavaScript than gzip does. A threshold thought of
     * in gzip has to come down by the same amount, or every figure turns green at once for a
     * reason that has nothing to do with the app.
     */
    brotli: {
        bootOk: 145 * KB,
        bootBad: 300 * KB,
        screenOk: 255 * KB,
        screenBad: 510 * KB,
        ownOk: 42 * KB,
        ownBad: 128 * KB,
        ...SHARES,
        ...FILE_SIZES,
        ...REQUEST_SIZES.brotli,
        ...SIGNAL_SIZES.brotli,
    },
    raw: {
        bootOk: 500 * KB,
        bootBad: 1024 * KB,
        screenOk: 1024 * KB,
        screenBad: 2048 * KB,
        ownOk: 150 * KB,
        ownBad: 450 * KB,
        ...SHARES,
        ...FILE_SIZES,
        ...REQUEST_SIZES.raw,
        ...SIGNAL_SIZES.raw,
    },
};

/** Rating of a figure against its two thresholds. */
export const rate = (value: number, ok: number, bad: number): Verdict => {
    if (value <= ok) {
        return 'good';
    }
    return value <= bad ? 'ok' : 'bad';
};

/** The worst of several verdicts: useful to summarise a list. */
export const worst = (verdicts: Verdict[]): Verdict => {
    if (verdicts.includes('bad')) {
        return 'bad';
    }
    return verdicts.includes('ok') ? 'ok' : 'good';
};

export const CRITERIA_FIELDS: CriteriaField[] = [
    { key: 'bootOk', unit: 'kb', group: 'sizes', scale: 'chunk', pairWith: 'bootBad', from: 'external' },
    { key: 'screenOk', unit: 'kb', group: 'sizes', scale: 'chunk', pairWith: 'screenBad', from: 'derived' },
    { key: 'ownOk', unit: 'kb', group: 'sizes', scale: 'chunk', pairWith: 'ownBad', from: 'derived' },

    { key: 'sharedRatio', unit: 'pct', group: 'shared', from: 'convention' },
    { key: 'wideRatio', unit: 'pct', group: 'shared', from: 'convention' },
    { key: 'sharedMinBytes', unit: 'kb', group: 'shared', scale: 'chunk', from: 'convention' },
    { key: 'dominantRatio', unit: 'pct', group: 'shared', from: 'convention' },

    { key: 'bootPackageMinBytes', unit: 'kb', group: 'signals', scale: 'file', from: 'convention' },
    { key: 'bootPackageMaxImporters', unit: 'importers', group: 'signals', from: 'convention' },
    { key: 'ownFolderMinBytes', unit: 'kb', group: 'signals', scale: 'file', from: 'convention' },
    { key: 'bigOwnFileBytes', unit: 'kb', group: 'signals', scale: 'file', from: 'convention' },
    { key: 'heavyScreenFactor', unit: 'x', group: 'signals', from: 'convention' },
    { key: 'heavyScreenMinBytes', unit: 'kb', group: 'signals', scale: 'chunk', from: 'convention' },
    { key: 'heavyScreenMinScreens', unit: 'screens', group: 'signals', from: 'convention' },
    { key: 'screenFilesMax', unit: 'files', group: 'signals', from: 'convention' },
    { key: 'screenWavesMax', unit: 'trips', group: 'signals', from: 'convention' },
    { key: 'tinyChunkBytes', unit: 'kb', group: 'signals', scale: 'request', from: 'convention' },
    { key: 'minTinyChunks', unit: 'chunks', group: 'signals', from: 'convention' },
    { key: 'minLocales', unit: 'langs', group: 'signals', from: 'convention' },
    { key: 'shippedMinBytes', unit: 'kb', group: 'signals', scale: 'file', from: 'convention' },
    { key: 'barrelMinBytes', unit: 'kb', group: 'signals', scale: 'file', from: 'convention' },
    { key: 'paidTwiceMinBytes', unit: 'kb', group: 'signals', scale: 'file', from: 'convention' },

    { key: 'crumbMaxBytes', unit: 'kb', group: 'shape', scale: 'request', from: 'convention' },
    { key: 'manyCrumbs', unit: 'chunks', group: 'shape', from: 'convention' },
    { key: 'concentratedRatio', unit: 'pct', group: 'shape', from: 'convention' },
    { key: 'heavyInZoneRatio', unit: 'pct', group: 'shape', from: 'convention' },
    { key: 'heavyShareRatio', unit: 'pct', group: 'shape', from: 'convention' },
    { key: 'grouperMaxBytes', unit: 'kb', group: 'shape', scale: 'file', from: 'convention' },

    { key: 'growthRatio', unit: 'pct', group: 'context', from: 'convention' },
    { key: 'growthMinBytes', unit: 'kb', group: 'context', scale: 'chunk', from: 'convention' },
    { key: 'sharedGrowthTolerance', unit: 'pct', group: 'context', from: 'convention' },
    { key: 'sharedGrowthMinScreens', unit: 'screens', group: 'context', from: 'convention' },
    { key: 'budgetSlackFactor', unit: 'x', group: 'context', from: 'convention' },
    { key: 'theirsRatio', unit: 'pct', group: 'context', from: 'convention' },
    { key: 'latencyMs', unit: 'ms', group: 'context', from: 'external' },
];

/** From bytes or fraction to the number shown in the field, and back. */
export const toField = (value: number, unit: Unit): number => {
    if (unit === 'kb') {
        return Math.round(value / KB);
    }
    return unit === 'pct' ? Math.round(value * 100) : value;
};

export const fromField = (value: number, unit: Unit): number => {
    if (unit === 'kb') {
        return value * KB;
    }
    return unit === 'pct' ? value / 100 : value;
};
