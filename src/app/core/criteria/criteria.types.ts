/** The rating criteria and how each one is edited. */

export type Mode = 'raw' | 'gzip' | 'brotli';

export type Verdict = 'good' | 'ok' | 'bad';

export interface Criteria {
    /** Declared and effective bootstrap: good up to `bootOk`, bad above `bootBad`. */
    bootOk: number;
    bootBad: number;
    /** Total downloaded by someone landing directly on a screen. */
    screenOk: number;
    screenBad: number;
    /** A screen's own code. */
    ownOk: number;
    ownBad: number;

    // --- shared chunks -------------------------------------------------------------------------
    /** Coverage (fraction of screens) from which a lazy chunk counts as bootstrap. */
    sharedRatio: number;
    /** Coverage from which a chunk is labelled "widely shared". */
    wideRatio: number;
    /** Minimum size for a near-global shared chunk to be a signal. */
    sharedMinBytes: number;
    /** How much of a chunk one package or folder has to be for the chunk to be "that thing". */
    dominantRatio: number;

    // --- signals -------------------------------------------------------------------------------
    /** Minimum size of a bootstrap package to consider whether it is superfluous. */
    bootPackageMinBytes: number;
    /** More importers than this and it is no longer "single screen", it is infrastructure. */
    bootPackageMaxImporters: number;
    /** Minimum weight of the folders of yours held in the bootstrap by a deferred screen. */
    ownFolderMinBytes: number;
    /** From this size, an own file inside the bootstrap is named one by one. */
    bigOwnFileBytes: number;
    /** Expensive screen: this many times the median own code... */
    heavyScreenFactor: number;
    /** ...and at least this size. */
    heavyScreenMinBytes: number;
    /** Fewer screens than this and there is no median worth comparing against. */
    heavyScreenMinScreens: number;
    /**
     * From how many files a screen needs, the split is worth a look. A count, not a size: this is
     * the one figure of the report measured in requests instead of bytes.
     */
    screenFilesMax: number;
    /**
     * From how many round trips a screen's load is worth a line. Also a count, and the other half
     * of the same question: `screenFilesMax` asks how many pieces come down, this asks how many of
     * them had to wait for a previous one to arrive and be parsed. Two screens of the same weight
     * are not the same screen when one of them costs three sequential requests.
     */
    screenWavesMax: number;
    /** Under this a file is mostly the cost of asking for it. */
    tinyChunkBytes: number;
    /** How many of those have to arrive together before it reads as fragmentation. */
    minTinyChunks: number;
    /** Below this many languages it is not "every language", it is the two somebody registered. */
    minLocales: number;
    /** Under this, what ships without being code for a screen is not worth a line. */
    shippedMinBytes: number;
    /**
     * From how much **exclusive** weight a barrel file is worth a line. Exclusive, not total: a
     * barrel in front of code that arrives through five other imports as well costs nothing.
     */
    barrelMinBytes: number;
    /** Under this, the second copy of a module in another chunk is not worth naming. */
    paidTwiceMinBytes: number;

    // --- shape of the split --------------------------------------------------------------------
    /** Under this a chunk is a crumb: normal on its own, worth counting when there are many. */
    crumbMaxBytes: number;
    /** Fewer crumbs than this is not a pattern, it is two files. */
    manyCrumbs: number;
    /** From here, one chunk holds so much of its zone that the zone is really that chunk. */
    concentratedRatio: number;
    /** From this share of its zone, a chunk is marked as where the weight of that zone is. */
    heavyInZoneRatio: number;
    /** The share of a download that has to be covered before "most of it" is a fair description. */
    heavyShareRatio: number;
    /** What a file that only groups routes is allowed to weigh inside its own chunk. */
    grouperMaxBytes: number;

    // --- baseline and project context ----------------------------------------------------------
    /** Against a baseline: growth counts from this fraction... */
    growthRatio: number;
    /** ...and from this many bytes, so a 2 kB screen doubling does not fire. */
    growthMinBytes: number;
    /** How close two screens have to grow to read as one shared chunk growing under both. */
    sharedGrowthTolerance: number;
    /** Fewer screens than this growing alike is a coincidence, not a shared chunk. */
    sharedGrowthMinScreens: number;
    /** A budget error threshold this many times the current bootstrap can never fire. */
    budgetSlackFactor: number;
    /**
     * Share of the first load that can be somebody else's code before it is worth saying so. It is
     * never a fault on its own — a framework is somebody else's code — which is why the signal it
     * raises is context and not a problem.
     */
    theirsRatio: number;
    /**
     * Round-trip time, in milliseconds, used to turn bytes into an estimate of seconds.
     *
     * It is the one number of that model worth editing: throughput and parse cost are properties of
     * a device and a connection, and latency is a property of **where the users are**. An audience
     * on another continent from the server pays it on every round trip the report counts, and no
     * amount of compression touches it.
     */
    latencyMs: number;
}

export type CriteriaKey = keyof Criteria;

/**
 * The unit a criterion is edited in. `kb` and `pct` are converted on the way in and out; the rest
 * are counts shown as they are, and differ only in the word next to the field — "chunks" and
 * "screens" are not "files", and one label for all three read as a mistake.
 */
export type Unit = 'kb' | 'pct' | 'x' | 'files' | 'chunks' | 'screens' | 'langs' | 'importers' | 'trips' | 'ms';

/**
 * What a size threshold is compared against, which decides whether it moves with the unit of the
 * report.
 *
 * `chunk`: the size of a whole output file, which is compressed when the build folder is loaded.
 * A threshold for it has to be expressed in the same unit or it means something different in each.
 *
 * `file`: the weight of one source file or package **inside** a chunk. gzip compresses the chunk as
 * a whole, so there is no such thing as the compressed share of one module: these figures are
 * always raw minified bytes, and their thresholds are the same number in every mode.
 *
 * `request`: what asking for a file costs — headers, a cache entry, a module wrapper. It is thought
 * of in what actually travels, so the compressed value is the real one and the raw column is that
 * same line expressed in uncompressed bytes.
 */
export type Scale = 'chunk' | 'file' | 'request';

/**
 * Where a threshold's number comes from, which is a different question from what it is compared
 * against and deserves its own answer next to it.
 *
 * Nothing in this list was measured on anybody's build, and the honest thing is to say which of
 * the three weaker things each one is instead of dressing them all as the same. A tool that rates
 * a build against thirty-seven numbers owes the reader an account of where the numbers came from,
 * and "somebody had to draw a line" is a perfectly good account — much better than a justification
 * invented after the fact.
 *
 * `external`: a figure somebody else published, which this one copies and which can be checked
 * against its source. Angular CLI's default budgets, Lighthouse's throttling profile.
 *
 * `derived`: arithmetic on another threshold here — a multiple of the first-load budget, or the
 * same budget expressed in another unit. It moves when the one it comes from moves.
 *
 * `convention`: a line had to be somewhere and this is where it was drawn. Most of the list is
 * this, and pretending otherwise would be the only dishonest option.
 */
export type Provenance = 'external' | 'derived' | 'convention';

/**
 * Where a **figure** comes from, which is a different question from where a *threshold* comes from
 * and lives next to it so the two are never confused.
 *
 * `Provenance` is about the line: somebody had to draw it, and this says who. `DataSource` is about
 * the value being compared against that line, and there are exactly four honest answers:
 *
 * `measured`: a browser reported it. One browser, once, from one machine — which is a real
 * measurement and a narrow one, and every string about it has to keep saying so.
 *
 * `derived`: computed from the build. The import graph, the chunk sizes, the file names. Exact
 * about what was built, and silent about what is served.
 *
 * `declared`: somebody answered a question. It is worth more than a guess and less than a
 * measurement, and its value depends entirely on who answered.
 *
 * `unknown`: nobody looked. **This never becomes an average.** Turning "nobody said" into "we
 * assumed the median" is the one move that makes a report unfalsifiable, and every place that
 * could make it has to render the word instead.
 */
export type DataSource = 'measured' | 'derived' | 'declared' | 'unknown';

/** How each criterion is presented and edited: in which unit and in which group of the form. */
export interface CriteriaField {
    key: CriteriaKey;
    unit: Unit;
    group: 'sizes' | 'shared' | 'signals' | 'shape' | 'context';
    /**
     * Where the recommended number comes from. Required, so that adding a criterion means answering
     * the question rather than leaving it for whoever reads the report to assume.
     */
    from: Provenance;
    /** Only for sizes, and only to explain why some of them do not change with the unit. */
    scale?: Scale;
    /** A "good up to / bad above" pair is edited on the same row. */
    pairWith?: CriteriaKey;
}
