import { computed, inject, Service, signal } from '@angular/core';
import { analyze } from '../core/analysis/analysis';
import { type Analysis, type ScreenMark } from '../core/analysis/analysis.types';
import { foreignFormat, type Metafile } from '../core/analysis/metafile.types';
import { configuredMarks } from '../core/analysis/screens/marks';
import { readSourceMaps, resolveSplits } from '../core/analysis/sourcemap/sourcemap';
import { type ChunkSplit } from '../core/analysis/sourcemap/sourcemap.types';
import { buildSearchIndex, countMatches } from '../core/analysis/views/search';
import { type SearchIndex } from '../core/analysis/views/search.types';
import { type AssetReport } from '../core/assets/assets.types';
import { compare, isSnapshot, snapshotOf } from '../core/baseline/baseline';
import { type Comparison, type Snapshot } from '../core/baseline/baseline.types';
import { announcedIn, indexHtmlOf, originsIn, stylesIn, titleIn } from '../core/build-text/index-html';
import { type CachingReport } from '../core/caching/caching.types';
import { cachingOf } from '../core/caching/from-analysis';
import { readConfig, sameFolderReading } from '../core/config/loadline-config';
import { type LoadlineConfig } from '../core/config/loadline-config.types';
import { type Criteria, type Mode } from '../core/criteria/criteria.types';
import { readAudit, readDeps, readLock } from '../core/deps/deps';
import { type Advisory, type DepsReport, type LockedPackage } from '../core/deps/deps.types';
import { unitScale } from '../core/findings/actions';
import { buildFolderFindings } from '../core/findings/bundle/shipped';
import { composeFindings } from '../core/findings/compose';
import { type Finding } from '../core/findings/finding.types';
import {
    buildComparisonFindings,
    buildContextFindings,
    buildFindings,
    buildMeasurementFindings,
} from '../core/findings/findings';
import { buildAssetFindings } from '../core/findings/folder/assets';
import { buildCachingFindings } from '../core/findings/folder/caching';
import { buildPageFindings, type PageOrigins } from '../core/findings/folder/page';
import { buildScanFindings } from '../core/findings/folder/scan';
import { buildDepsFindings } from '../core/findings/supplied/deps';
import { buildForbiddenFindings } from '../core/findings/supplied/forbidden';
import { buildObservedFindings } from '../core/findings/supplied/observed';
import { buildSituationFindings } from '../core/findings/supplied/situation';
import { baseName } from '../core/format/format.utils';
import { setOwnership } from '../core/format/ownership';
import { readFolderGraph } from '../core/intake/bundle-graph';
import { type BundleGraph } from '../core/intake/bundle-graph.types';
import {
    brotliSizes,
    bundleFilesOf,
    droppedStats,
    gzipSizes,
    type IntakeKind,
    isAsset,
    isContextName,
    type PageCss,
    pageCssOf,
    sniff,
    withGzipFallback,
} from '../core/intake/dist-files';
import { readFolderAssets } from '../core/intake/folder-assets';
import { canPickFolder, type FolderHandle, pickFolder, readFolder } from '../core/intake/folder-handle';
import { metafileOf } from '../core/intake/webpack-stats';
import { contrast, readMeasurement } from '../core/measurement/measurement';
import {
    type MeasuredReport,
    type Measurement,
    type MeasurementError,
    NO_PAGE,
} from '../core/measurement/measurement.types';
import { type Observed, observedFrom } from '../core/measurement/observed';
import {
    EMPTY_CONTEXT,
    readAngularJson,
    readPackageJson,
    readPipeline,
    repoPathsOf,
} from '../core/project/project-context';
import { type ProjectContext } from '../core/project/project-context.types';
import { projectNameOf } from '../core/project/project-name';
import { SAMPLE_CSS, SAMPLE_NAME, SAMPLE_PAGE, SAMPLE_STATS } from '../core/sample/sample-build';
import { scanBuild } from '../core/scan/scan';
import { type ScanReport } from '../core/scan/scan.types';
import { clearSession, loadSession, saveSession } from '../core/session/persistence';
import { type StoredSession } from '../core/session/persistence.types';
import { paint } from '../shared/paint.utils';
import { CriteriaService } from './criteria.service';
import { I18nService } from './i18n.service';
import { errorMessage, measurementMessage } from './report-messages.utils';
import { SituationService } from './situation.service';

interface LoadedStats {
    name: string;
    outputs: number;
}

/** Which wait the page is in: compressing the folder, or walking the import graph. */
export type WorkPhase = 'compress' | 'read';

/** What has been loaded as project context, to say so in the drop zone. */
export interface LoadedContext {
    files: string[];
    ignored: string[];
}

/** Report state: what has been loaded and what derives from it. */
@Service()
export class ReportStore {
    // * SERVICES
    private readonly i18n = inject(I18nService);
    /**
     * The five answers. Injected rather than held here for the same reason the criteria are: they
     * outlive one build, and a report is what has been loaded plus what derives from it.
     */
    private readonly situation = inject(SituationService);
    private readonly criteriaService = inject(CriteriaService);

    // * ATTRIBUTES
    readonly metafile = signal<Metafile | null>(null);
    private readonly gzip = signal<Map<string, number> | null>(null);
    /**
     * Real brotli sizes, when the folder brings the pre-compressed files. The browser cannot
     * compress in brotli — `CompressionStream` only does gzip and deflate — and a WebAssembly
     * encoder weighs a megabyte, more than the whole tool, so a `.js.br` next to the `.js` is
     * the only way to show the figure people actually download.
     */
    private readonly brotli = signal<Map<string, number> | null>(null);
    /** With both figures available, which one the report is shown in. Chosen from Criteria. */
    readonly preferBrotli = signal(true);

    /** Bytes per source inside each chunk, as the maps of the folder gave them. */
    private readonly maps = signal<Map<string, ChunkSplit> | null>(null);

    /**
     * Chunk names `index.html` tells the browser to fetch straight away. `null` while that page has
     * not been read, which is not the same as "none": one means unknown, the other means the page
     * announces nothing of this build.
     */
    readonly announced = signal<ReadonlySet<string> | null>(null);

    /**
     * The hosts that same page fetches from, when they are not its own. `null` until the page has
     * been read, for the same reason: a build with no `index.html` knows nothing about its origins,
     * and "no other host" is a different answer from "nobody looked".
     */
    readonly pageOrigins = signal<PageOrigins | null>(null);

    /** The `<title>` of the build's page: what the application calls itself, to name the report by. */
    private readonly pageTitle = signal<string | null>(null);

    /**
     * The stylesheets that same page asks for.
     *
     * They are not in the import graph and never will be — nothing imports a `<link>` — but a
     * render-blocking stylesheet is the strictest "downloaded before anything appears" there is.
     * Leaving it out understated Loadline's own first load by 31 %, while the page said "index.html
     * announces the only bootstrap chunk". `null` when no folder was loaded or its page names none.
     */
    readonly pageCss = signal<PageCss | null>(null);

    /**
     * The rest of the folder: the fonts, the pictures, what nothing names, and the bytes hiding
     * inside the chunks as `data:` URIs. `null` until a folder is dropped, which is not the same as
     * "the folder held none of it" — the report says which of the two it is.
     */
    readonly assets = signal<AssetReport | null>(null);

    /**
     * The text of the chunks and the source maps of the folder, kept for the reading that is about
     * what the build **says** rather than what it weighs: keys left in it, development leftovers,
     * licence headers, and what a published map gives away. They are already read once for the
     * reference search; holding on to them is what stops them being read twice.
     */
    private readonly buildTexts = signal<ReadonlyMap<string, string>>(new Map());
    private readonly buildMaps = signal<{ name: string; text: string }[]>([]);

    /**
     * The lock file and the audit report, when somebody drops them. `null` means nobody did — not
     * that the audit found nothing, which is a different statement and would be a dangerous one to
     * make by accident.
     */
    readonly lock = signal<LockedPackage[] | null>(null);
    readonly advisories = signal<Advisory[] | null>(null);
    /**
     * Where each file nothing names comes from in the repository, going by the `assets` entries of
     * `angular.json`. Unverified: the page has the configuration and not the repository.
     */
    private readonly assetSources = computed(() =>
        repoPathsOf(this.assets()?.unreferenced ?? [], this.context().angular?.assetFolders ?? []),
    );
    /** `loadline.json` as it was dropped, so the page can say the thresholds are not its own. */
    readonly config = signal<LoadlineConfig | null>(null);

    /**
     * Chunks the loader asks for in the same round trip as a lazy one, from the lists Vite writes
     * into each dynamic import. Empty for every esbuild build, which writes no such list.
     */
    /** What the folder reader found besides the metafile: the preload lists and the route table. */
    private readonly graphLinks = signal<Pick<BundleGraph, 'parallel' | 'routes'> | null>(null);

    /**
     * Whether the graph was read from the compiled folder rather than from a `stats.json`. It
     * changes what the report can say — a folder without source maps knows the weight of a chunk
     * and not of what is inside it — and it decides what dropping the folder takes with it.
     */
    readonly derived = signal(false);

    /**
     * Lazy entries reclassified by hand, source file to what it should be. Kept here rather than in
     * the analysis because it is a decision about the project, not about this build: the key is a
     * source path, which survives the next `stats.json`.
     */
    readonly marks = signal<ReadonlyMap<string, ScreenMark>>(new Map());
    /**
     * The marks the analysis runs with: what `build.screens` of a dropped `loadline.json` says,
     * with the clicks of this session over it — a person correcting the file wins over the file.
     */
    private readonly effectiveMarks = computed((): ReadonlyMap<string, ScreenMark> => {
        const meta = this.metafile();
        const configured = meta ? configuredMarks(this.config()?.build?.screens, meta) : new Map<string, ScreenMark>();
        return new Map([...configured, ...this.marks()]);
    });

    readonly statsInfo = signal<LoadedStats | null>(null);
    /**
     * Whether what is loaded is the built-in example rather than somebody's build. Every figure on
     * the page is real — it goes through the same analysis — but it is about an application that
     * does not exist, and a report that does not say so is a report that lies quietly.
     */
    readonly isSample = signal(false);
    readonly distFiles = signal<number | null>(null);
    /** How many source maps were read: what turns the breakdown from approximate into exact. */
    readonly mapFiles = signal<number | null>(null);
    readonly error = signal<string | null>(null);
    readonly working = signal(false);
    /** How far the folder has got through being compressed, file by file. `null` while idle. */
    readonly progress = signal<{ done: number; total: number } | null>(null);

    /**
     * Which of the two waits is happening, so neither of them is a page that has simply stopped.
     *
     * They are not the same kind of wait, and the figures say so. Compressing a folder is the long
     * one — three seconds for ninety-nine megabytes — and it never holds the thread:
     * `CompressionStream` yields between files and the progress bar moves.
     * Walking the import graph is the short one and the only one that freezes anything: a second at
     * eight thousand inputs, and a third of a second more when the signals ask for the exclusive
     * weight. A second of nothing responding, with no label on it, reads as a broken page.
     */
    readonly phase = signal<WorkPhase | null>(null);

    /** The previous measurement, reduced to what is compared. */
    readonly baseline = signal<Snapshot | null>(null);
    readonly baselineError = signal<string | null>(null);
    /** Compressing a previous build folder takes a moment; the zone says so meanwhile. */
    readonly baselineWorking = signal(false);

    /** `angular.json`, `package.json`, pipeline: what they say, and which files were loaded. */
    readonly context = signal<ProjectContext>(EMPTY_CONTEXT);
    readonly contextInfo = signal<LoadedContext | null>(null);
    /** Which application of a multi-application `angular.json` is being read. `null` = the first. */
    private readonly angularProject = signal<string | null>(null);

    /**
     * What the browser reported downloading, when somebody pasted it in. This is the only figure in
     * the whole tool that is measured rather than computed.
     */
    private readonly measurement = signal<Measurement | null>(null);
    /** The screen the measurement is attributed to, when the person picked one instead of Loadline. */
    readonly measurementPick = signal<string | null>(null);
    readonly measurementError = signal<string | null>(null);

    /** A measurement kept in this browser from a previous visit, offered until something loads. */
    readonly lastSession = signal<{ name: string; date: string } | null>(null);

    /** Raw texts of what was loaded, kept only to persist the session: they cannot be recomputed. */
    private statsText: string | null = null;
    private readonly contextTexts = new Map<string, string>();

    constructor() {
        void loadSession().then(stored => {
            if (stored && !this.metafile()) {
                this.lastSession.set({ name: stored.statsName, date: stored.date.slice(0, 10) });
            }
        });
    }

    /**
     * The exact split, matched against the metafile. A computed rather than a stored value because
     * either side can arrive first: the folder can be dropped before the `stats.json`.
     */
    private readonly exact = computed(() => resolveSplits(this.maps(), Object.keys(this.metafile()?.inputs ?? {})));

    /**
     * What the project is called, so a report names which project it is about at a glance.
     * `package.json` first because that is the name people use; `angular.json` names the project
     * inside the workspace, which is the next best thing; then what the build says of itself — the
     * page's `<title>` and the folder it came in — because without context files, which almost
     * nobody loads, almost every report was about nothing in particular. Never the example's: that
     * is not anybody's project, and the line next to it already says so.
     */
    readonly projectName = computed(() => {
        if (this.isSample()) {
            return null;
        }
        const context = this.context();
        return projectNameOf({
            packageName: context.pkg?.name,
            angularProject: context.angular?.project,
            pageTitle: this.pageTitle(),
            folder: this.statsInfo()?.name,
        });
    });

    readonly hasBrotli = computed(() => this.brotli() !== null);

    /** The sizes the figures come from: brotli when there is one and it is the one chosen. */
    private readonly sizes = computed(() => {
        const brotli = this.brotli();
        return brotli && this.preferBrotli() ? brotli : this.gzip();
    });

    readonly compressed = computed(() => this.sizes() !== null);
    readonly mode = computed<Mode>(() => {
        if (this.hasBrotli() && this.preferBrotli()) {
            return 'brotli';
        }
        return this.gzip() ? 'gzip' : 'raw';
    });

    /** The unit the figures are in, as words: it goes in the lead line and in the exported table. */
    readonly unit = computed(() => {
        const t = this.i18n.ui();
        const labels: Record<Mode, string> = { raw: t.unitRaw, gzip: t.unitGzip, brotli: t.unitBrotli };
        return labels[this.mode()];
    });

    /** The criteria that apply to the figures being shown: the raw ones or the compressed ones. */
    readonly criteria = computed<Criteria>(() => this.criteriaService.of(this.mode()));

    /**
     * The one threshold the analysis itself needs, on its own.
     *
     * Passing the whole criteria object would make the analysis depend on all thirty of them, so
     * moving the bootstrap budget by one kilobyte would walk the import graph of a two-megabyte
     * metafile again. A computed over one number only notifies when that number changes.
     */
    private readonly grouperMaxBytes = computed(() => this.criteria().grouperMaxBytes);

    /**
     * The analysis. Recomputed only when the metafile or the compressed sizes change — not with the
     * language nor the criteria — so switching language does not walk the graph again.
     */
    readonly analysis = computed<Analysis | null>(() => {
        // Yours or theirs, for this analysis and every finding read off it (`core/format/ownership.ts`):
        // `build.own` and `build.dependencies` of a dropped loadline.json, which is set once per file.
        setOwnership(this.config()?.build);
        const meta = this.metafile();
        if (!meta) {
            return null;
        }

        try {
            return analyze(
                meta,
                this.sizes(),
                this.exact(),
                this.announced(),
                this.effectiveMarks(),
                { grouperMaxBytes: this.grouperMaxBytes() },
                this.graphLinks()?.parallel ?? null,
                this.graphLinks()?.routes ?? null,
            );
        } catch (error) {
            this.error.set(errorMessage(error, this.i18n.ui()));
            return null;
        }
    });

    /**
     * The index the search looks through. Prepared once per analysis, so a keystroke only compares
     * strings instead of walking the bundle again.
     */
    readonly searchIndex = computed<SearchIndex>(() => {
        const analysis = this.analysis();
        return analysis ? buildSearchIndex(analysis) : { entries: [], total: 0 };
    });

    /**
     * The same analysis in raw bytes, for comparing against a raw baseline while showing compressed
     * figures. It is the shown analysis itself when nothing is compressed, so it costs nothing then.
     */
    private readonly rawAnalysis = computed<Analysis | null>(() => {
        const meta = this.metafile();
        if (!meta) {
            return null;
        }
        if (!this.compressed()) {
            return this.analysis();
        }

        try {
            return analyze(
                meta,
                null,
                this.exact(),
                this.announced(),
                this.effectiveMarks(),
                { grouperMaxBytes: this.grouperMaxBytes() },
                this.graphLinks()?.parallel ?? null,
                this.graphLinks()?.routes ?? null,
            );
        } catch {
            return null;
        }
    });

    /** Whether the weight of each file inside a chunk is exact or the metafile's approximation. */
    readonly splitSource = computed(() => this.analysis()?.splitSource ?? 'metafile');

    /**
     * Now against the baseline, in the baseline's mode. A compressed baseline against a raw report
     * cannot be compared: `comparisonBlocked` says so and the UI asks for the build folder.
     */
    readonly comparison = computed<Comparison | null>(() => {
        const baseline = this.baseline();
        if (!baseline) {
            return null;
        }

        // Raw compares against the raw analysis; a compressed baseline only against the same
        // compression, because gzip against brotli would read as a saving that never happened.
        const analysis =
            baseline.mode === 'raw' ? this.rawAnalysis() : baseline.mode === this.mode() ? this.analysis() : null;
        if (!analysis) {
            return null;
        }

        // The signals of this build alone go into the snapshot, so the comparison can say which of
        // them are new and which went away. It cannot be the composed list: that one already holds
        // the signals about the comparison, and a signal about a comparison is not a property of
        // the build being compared. It is also what would make this computed depend on itself.
        return compare(
            snapshotOf(analysis, baseline.mode, this.statsInfo()?.name ?? 'stats.json', new Date(), this.ownFindings()),
            baseline,
        );
    });

    readonly comparisonBlocked = computed(() => {
        const mode = this.baseline()?.mode;
        return !!mode && mode !== 'raw' && mode !== this.mode();
    });

    /**
     * The folder's figures are here and its text is not: a restored session. The text is the whole
     * build, megabytes of it, so it is not kept — and what only the text can say (secrets, leftovers,
     * readable sources) is then missing from the signals without anything on the page saying why.
     */
    readonly textUnread = computed(() => (this.distFiles() ?? 0) > 0 && this.buildTexts().size === 0);

    /**
     * What reading the text of the build says. `null` until a folder is dropped: without the text
     * there is nothing to read, which is not the same as having read it and found nothing.
     */
    readonly scan = computed<ScanReport | null>(() => {
        const analysis = this.analysis();
        const texts = this.buildTexts();
        if (!analysis || texts.size === 0) {
            return null;
        }

        return scanBuild({
            texts,
            modules: analysis.modules,
            boot: new Set(analysis.bootChunks),
            maps: this.buildMaps(),
        });
    });

    /** What the lock file and the audit report say, crossed with what actually ships. */
    readonly deps = computed<DepsReport | null>(() => {
        const analysis = this.analysis();
        if (!analysis) {
            return null;
        }

        return readDeps({
            lock: this.lock(),
            advisories: this.advisories(),
            modules: analysis.modules,
            boot: new Set(analysis.bootChunks),
            direct: new Set(this.context().pkg?.dependencies),
        });
    });

    /**
     * What an update costs rather than a first visit. It needs the baseline's file names, which only
     * a snapshot carrying them has; without one the delta is absent and the other two figures — the
     * chunks that mix what changes with what does not, and the names that cannot be cached — still
     * come out of this build alone.
     */
    readonly caching = computed<CachingReport | null>(() => {
        const analysis = this.analysis();
        return analysis
            ? cachingOf(analysis, this.baseline(), this.assets(), this.announced() ?? new Set(), [], this.sizes())
            : null;
    });

    /**
     * The signals that come from the folder rather than from the graph: source maps, assets,
     * caching, the page's origins, what the text says and the declared dependencies. Both lists of
     * signals below carry them, and they used to be written out in each, so a new source had to be
     * added twice and could be forgotten in one. The signals are read here, inside the computeds
     * that call it, so those still track every one of them.
     */
    private folderFindings(analysis: Analysis): Finding[] {
        const lang = this.i18n.lang();
        const criteria = this.criteria();
        const assets = this.assets();
        const caching = this.caching();
        const scan = this.scan();
        const deps = this.deps();

        return [
            ...buildFolderFindings(
                {
                    sourceMaps: this.mapFiles() ?? 0,
                    derived: this.derived(),
                    screens: analysis.screens.map(s => s.label),
                    drift: analysis.splitDrift,
                    tool: analysis.tool,
                },
                lang,
            ),
            ...(assets ? buildAssetFindings(assets, lang, criteria, this.assetSources()) : []),
            ...(caching
                ? buildCachingFindings(caching, lang, criteria, this.situation.situation(), analysis.tool)
                : []),
            ...buildPageFindings(this.pageOrigins(), lang),
            ...(scan ? buildScanFindings(scan, lang, criteria, unitScale(analysis), analysis.tool) : []),
            ...(deps ? buildDepsFindings(deps, lang, criteria, unitScale(analysis)) : []),
        ];
    }

    /**
     * The signals about this build alone, without the ones about a comparison.
     *
     * They are separate because the comparison needs them — a snapshot carries its signals so the
     * next one can say which are new — and a single computed holding both would depend on itself.
     */
    readonly ownFindings = computed<Finding[]>(() => {
        const analysis = this.analysis();
        if (!analysis) {
            return [];
        }

        const lang = this.i18n.lang();
        const criteria = this.criteria();
        const situation = this.situation.situation();

        return [
            ...buildFindings(analysis, lang, this.mode(), criteria, situation, this.deps()?.declared ?? null),
            ...buildContextFindings(this.context(), analysis, lang, criteria),
            ...buildForbiddenFindings(analysis, this.config()?.forbidden, lang),
            ...this.folderFindings(analysis),
        ];
    });

    /** Signals DO depend on language and criteria: their text is half of what they bring. */
    readonly findings = computed<Finding[]>(() => {
        const analysis = this.analysis();
        if (!analysis) {
            return [];
        }

        const lang = this.i18n.lang();
        const criteria = this.criteria();
        const comparison = this.comparison();
        const measured = this.measured();
        const observed = this.observed();
        const situation = this.situation.situation();

        const composed = composeFindings({
            base: buildFindings(analysis, lang, this.mode(), criteria, situation, this.deps()?.declared ?? null),
            fromComparison: comparison ? buildComparisonFindings(comparison, lang, criteria) : [],
            fromContext: [
                ...buildContextFindings(this.context(), analysis, lang, criteria),
                ...buildForbiddenFindings(analysis, this.config()?.forbidden, lang),
            ],
            fromMeasurement: measured
                ? [
                      ...buildMeasurementFindings(measured, lang, criteria),
                      ...(observed ? buildObservedFindings(observed, measured, analysis, lang, criteria) : []),
                  ]
                : [],
            fromBuild: this.folderFindings(analysis),
        });

        // Built from the composed list rather than alongside it, because what they say is about the
        // list: which of the five questions is worth asking is decided by which signals came out.
        // They are all context, so the end is where composing would have put them anyway.
        return [...composed, ...buildSituationFindings(situation, composed, lang, criteria)];
    });

    /** The address that was open when the measurement was taken, when the snippet reported it. */
    readonly measurementUrl = computed(() => this.measurement()?.url ?? null);

    private readonly measuredResult = computed<MeasuredReport | MeasurementError | null>(() => {
        const analysis = this.analysis();
        const measurement = this.measurement();
        return !analysis || !measurement ? null : contrast(analysis, measurement, this.measurementPick());
    });

    /** The measurement contrasted against the analysis: what came down against what was predicted. */
    readonly measured = computed<MeasuredReport | null>(() => {
        const result = this.measuredResult();
        return typeof result === 'string' ? null : result;
    });

    /**
     * The environment as that paste observed it: protocol, round trip, compression served, what the
     * cache did, third parties, and the trips the browser really took.
     *
     * Kept apart from `measured` because it answers a different question. That one asks whether the
     * calculation was right about this screen; this one asks what is true of the deployment, and
     * none of it moves a threshold.
     */
    readonly observed = computed<Observed | null>(() => {
        const analysis = this.analysis();
        const measurement = this.measurement();
        return !analysis || !measurement
            ? null
            : observedFrom(measurement, new Set(analysis.allChunks.map(file => baseName(file))));
    });

    /**
     * A measurement left over from another build. Happens when a newer `stats.json` is loaded on
     * top of it: the hashed names stop matching, and saying so beats showing an empty table.
     */
    readonly measurementStale = computed(() => typeof this.measuredResult() === 'string');

    /** How many names match a query. For the counter next to the results. */
    searchMatches(query: string): number {
        return countMatches(this.searchIndex(), query);
    }

    async loadStats(file: File): Promise<void> {
        this.error.set(null);

        try {
            const text = await file.text();
            const raw: unknown = JSON.parse(text);
            // webpack's stats come in through here too, translated (`metafileOf`).
            const parsed = metafileOf(raw);
            if (!parsed) {
                // Not a metafile: say which format it is instead of 'could not read it'.
                throw new Error(`NOT_METAFILE:${foreignFormat(raw)}`);
            }

            this.dropStaleSizes(parsed);
            this.metafile.set(parsed);
            // A real stats file says more than the folder ever could, so it takes over: the graph
            // read from the chunks and the preload lists that went with it are dropped together.
            this.derived.set(false);
            this.graphLinks.set(null);
            this.statsInfo.set({ name: file.name, outputs: Object.keys(parsed.outputs).length });
            this.isSample.set(false);
            this.statsText = text;
            this.lastSession.set(null);
            this.persist();

            this.working.set(true);
            try {
                await this.readGraph();
            } finally {
                this.working.set(false);
                this.phase.set(null);
            }
        } catch (error) {
            this.metafile.set(null);
            this.statsInfo.set(null);
            this.statsText = null;
            this.error.set(errorMessage(error, this.i18n.ui()));
        }
    }

    /**
     * Walks the import graph now, under a label, instead of a moment later under nothing.
     *
     * The walk is synchronous and there is no making it otherwise on this thread — and a worker is
     * not on the table, because the way this tool is mostly opened is one HTML file double-clicked
     * from `file://`, where a browser will not start one. What is on the table is not letting the
     * freeze happen silently: the phase is set, the browser is given a frame to draw it, and only
     * then is the analysis asked for. The signals are pulled in the same breath because they are
     * what calls `insights()`, which is the other third of a second.
     */
    private async readGraph(): Promise<void> {
        this.phase.set('read');
        await paint();
        if (this.analysis()) {
            this.findings();
        }
    }

    /**
     * Compresses every file of the folder in the browser itself. It is the only way to give the real
     * figure without asking for source maps or spinning anything up.
     *
     * When nothing has said what this build is, the folder says it too: the chunks carry their own
     * import graph, so a project built with anything that emits ES modules gets a report without
     * ever producing a `stats.json`.
     */
    async loadDist(files: Iterable<File>): Promise<'ok' | 'empty' | 'unsupported'> {
        const list = [...files];
        const assets = list.filter(file => isAsset(file.name));
        if (assets.length === 0) {
            return 'empty';
        }
        this.folderFiles = list;
        if (typeof CompressionStream === 'undefined') {
            return 'unsupported';
        }

        this.working.set(true);
        this.phase.set('compress');
        this.progress.set({ done: 0, total: assets.length });

        try {
            const onProgress = (done: number, total: number): void => this.progress.set({ done, total });
            const sizesByPath = new Map<string, number>();
            const sizes = await gzipSizes(assets, onProgress, sizesByPath);

            // The same folder answers three more questions: what each file weighs once minified,
            // — if the pipeline pre-compresses — what brotli really takes off, and which chunks the
            // page asks for before it has parsed anything.
            const brotli = withGzipFallback(brotliSizes(list), sizes);
            const page = indexHtmlOf(list, this.config()?.build?.page);
            const html = page ? await page.text() : null;

            // Reading the graph reads every map on the way, so the two never happen twice. A graph
            // that came from a folder is read again: it describes the folder as it was, and this one
            // may be a rebuild or the same files under a `build` block that was not there before.
            const graph = this.metafile() && !this.derived() ? null : await this.readFolderGraph(list, html);
            const splits = graph?.splits ?? (await readSourceMaps(list));

            this.gzip.set(sizes);
            this.brotli.set(brotli.size > 0 ? brotli : null);
            this.distFiles.set(assets.length);
            this.maps.set(splits.size > 0 ? splits : null);
            this.mapFiles.set(splits.size > 0 ? splits.size : null);
            this.announced.set(html ? new Set(announcedIn(html)) : null);
            this.pageOrigins.set(html ? originsIn(html) : null);
            this.pageTitle.set(html ? titleIn(html) : null);
            this.pageCss.set(
                html
                    ? pageCssOf(stylesIn(html), {
                          raw: new Map(list.filter(file => /\.css$/i.test(file.name)).map(f => [f.name, f.size])),
                          gzip: sizes,
                          brotli,
                      })
                    : null,
            );
            // Everything the folder holds that is not code. It is read last because it is the only
            // part the report survives without: a failure here would be a shame, not a broken report.
            const byPath = brotli.size > 0 ? withGzipFallback(brotliSizes(list, true), sizesByPath) : sizesByPath;
            const folder = await readFolderAssets(list, html, brotli.size > 0 ? brotli : sizes, byPath, onProgress);
            this.assets.set(folder.report);
            this.buildTexts.set(folder.texts);
            this.buildMaps.set(folder.maps);
            this.persist();
            await this.readGraph();
            return 'ok';
        } finally {
            this.working.set(false);
            this.phase.set(null);
            this.progress.set(null);
        }
    }

    /**
     * The graph read out of the chunks themselves, for a folder that came without a `stats.json`.
     *
     * It takes the place of the metafile and is named after the folder, because that is what it is
     * about. A failure here is not a failure of the folder: the compressed figures and everything
     * else it brought are kept, and only the report is missing.
     */
    private async readFolderGraph(files: readonly File[], html: string | null): Promise<BundleGraph | null> {
        const folder = files[0]?.webkitRelativePath.split('/', 1)[0] ?? '';

        try {
            const graph = await readFolderGraph(bundleFilesOf(files), html, this.config()?.build);

            this.metafile.set(graph.meta);
            this.graphLinks.set({ parallel: graph.parallel, routes: graph.routes });
            this.derived.set(true);
            this.statsInfo.set({ name: folder || 'build', outputs: Object.keys(graph.meta.outputs).length });
            this.isSample.set(false);
            this.statsText = JSON.stringify(graph.meta);
            this.lastSession.set(null);
            this.error.set(null);
            return graph;
        } catch (error) {
            this.error.set(errorMessage(error, this.i18n.ui()));
            return null;
        }
    }

    /**
     * The folder somebody picked, kept so it can be read again after the next build.
     *
     * `null` in every browser without the File System Access API and on every `file://` page, which
     * is most of them. That is why `canPickFolder` gates the control rather than the control being
     * there and failing: a re-read button that works on one machine and not the next is worse than
     * no button.
     */
    private readonly folderHandle = signal<FolderHandle | null>(null);

    /**
     * The files of the folder read last, for reading it again when `loadline.json` arrives after it.
     *
     * `build.entries`, `build.ignore` and `build.page` decide how the folder is read, not how the
     * report is drawn, so a file dropped after the folder changed nothing until the folder was
     * dropped again — and nothing on the page said so. Only references to the files: their bytes
     * are read from disk again, not kept.
     */
    private folderFiles: File[] | null = null;

    /** Whether this browser can hold on to a folder at all. Decides whether the control is drawn. */
    readonly canPickFolder = canPickFolder();

    /** Whether there is a folder to read again. */
    readonly canReread = computed(() => this.folderHandle() !== null);

    /**
     * Picks the build folder through the API that can hold on to it, and reads it.
     *
     * The same reading as a dropped folder, on the same files, through the same door: what it adds
     * is the handle, which is the only reason to have a second way in.
     */
    async pickDist(): Promise<'ok' | 'empty' | 'unsupported' | 'cancelled'> {
        const handle = await pickFolder();
        if (!handle) {
            return 'cancelled';
        }

        this.folderHandle.set(handle);
        return this.loadFolder(await readFolder(handle));
    }

    /**
     * A build folder however it came in — dropped, chosen with the button, picked or read again —
     * with the stats file inside it read first when there is one: webpack writes it inside the
     * folder it builds, Angular next to `browser/`. Only the drop looked for it, and the same webpack
     * folder chosen with the button was refused with "put the stats file in the folder", where it was.
     */
    async loadFolder(files: Iterable<File>): Promise<'ok' | 'empty' | 'unsupported'> {
        const list = [...files];
        const stats = await droppedStats(list);
        if (stats) {
            await this.loadStats(stats);
        }
        return this.loadDist(list.filter(file => file !== stats));
    }

    /**
     * A folder was dropped and the browser would not list what is in it: said, instead of nothing.
     * Without what a build is expected to be, which `errorMessage` adds: the folder was the right one.
     */
    folderUnreadable(): void {
        this.error.set(this.i18n.ui().errFolderUnreadable);
    }

    /** The same folder, read again after a rebuild. The point of having kept it. */
    async rereadDist(): Promise<'ok' | 'empty' | 'unsupported' | 'cancelled'> {
        const handle = this.folderHandle();
        if (!handle) {
            return 'cancelled';
        }

        try {
            return await this.loadFolder(await readFolder(handle));
        } catch {
            // The permission expired, or the folder is gone. The handle goes with it, so the button
            // stops being offered rather than staying there failing.
            this.folderHandle.set(null);
            return 'cancelled';
        }
    }

    /**
     * Drops the build folder: the figures go back to raw and the breakdown back to the metafile's.
     * The `stats.json` stays, so the report does not disappear — only its unit changes. When there
     * was no `stats.json` and the graph itself came from the folder, there is nothing left to keep
     * and the report goes with it.
     */
    clearDist(): void {
        this.folderHandle.set(null);
        this.forgetFolder();

        if (this.derived()) {
            this.metafile.set(null);
            this.statsInfo.set(null);
            this.statsText = null;
            this.graphLinks.set(null);
            this.derived.set(false);
        }

        this.persist();
    }

    /**
     * Drops the `stats.json` and everything tied to that build: the folder's sizes and maps are
     * keyed by hashed file names, and the browser measurement names those same files, so keeping
     * them next to a different build would be keeping figures that no longer refer to anything.
     * The baseline and the project context survive: neither belongs to this build.
     */
    clearStats(): void {
        this.metafile.set(null);
        this.statsInfo.set(null);
        this.isSample.set(false);
        this.statsText = null;
        this.error.set(null);
        this.derived.set(false);
        this.graphLinks.set(null);
        this.clearDist();
        this.measurement.set(null);
        this.measurementPick.set(null);
        this.measurementError.set(null);
        this.lastSession.set(null);
        this.marks.set(new Map());
        void clearSession();
    }

    /**
     * The built-in example, for looking at what the tool says before building anything.
     *
     * It goes in the same door a dropped `stats.json` does — same analysis, same signals, same
     * numbers — so it cannot drift into being a screenshot of an older version. The page of that
     * build comes with it, which is what lets the example show the round trips of the first load
     * instead of a gap where they go.
     *
     * It is deliberately **not** saved with the session: an example somebody looked at once should
     * not come back next week offered as their own last measurement. Loading it clears whatever
     * was there, for the same reason a new `stats.json` does.
     */
    loadSample(): void {
        this.clearStats();
        this.metafile.set(SAMPLE_STATS);
        this.announced.set(new Set(announcedIn(SAMPLE_PAGE)));
        this.pageOrigins.set(originsIn(SAMPLE_PAGE));
        this.pageCss.set(SAMPLE_CSS);
        this.statsInfo.set({ name: SAMPLE_NAME, outputs: Object.keys(SAMPLE_STATS.outputs).length });
        this.statsText = null;
        this.isSample.set(true);
    }

    /**
     * The baseline: a Loadline export (kept as is, with its mode) or a previous `stats.json` (analysed
     * here, raw — there is no build folder to compress).
     */
    async loadBaseline(file: File): Promise<void> {
        this.baselineError.set(null);

        try {
            const parsed: unknown = JSON.parse(await file.text());
            if (isSnapshot(parsed)) {
                this.baseline.set({ ...parsed, name: file.name });
                this.persist();
                return;
            }
            const meta = metafileOf(parsed);
            if (!meta) {
                throw new Error('NO_OUTPUTS');
            }

            this.baseline.set(snapshotOf(analyze(meta, null), 'raw', file.name, new Date(file.lastModified)));
            this.persist();
        } catch (error) {
            this.baseline.set(null);
            this.baselineError.set(errorMessage(error, this.i18n.ui()));
        }
    }

    /**
     * The previous build folder as the baseline: its `stats.json`, analysed with its own files
     * compressed here. It is the way to compare compressed against compressed — a bare previous
     * `stats.json` can only be compared raw.
     *
     * Without a stats file the graph is read from the chunks, as it is for the build on screen and as
     * the command already did: refusing it left a Vite build, which never writes one, no way to be
     * compared here. And the stats file is looked for under both names Angular gives it, because from
     * 22.2 on it is `browser-stats.json` and only `stats.json` was looked for.
     */
    async loadBaselineDist(files: Iterable<File>): Promise<void> {
        this.baselineError.set(null);
        const list = [...files];
        const stats = await droppedStats(list);

        const assets = list.filter(file => isAsset(file.name));
        if (assets.length > 0 && typeof CompressionStream === 'undefined') {
            this.baselineError.set(this.i18n.ui().distNoApi);
            return;
        }

        this.baselineWorking.set(true);
        try {
            const parsed = metafileOf(stats ? JSON.parse(await stats.text()) : await this.baselineGraph(list));
            if (!parsed) {
                throw new Error('NO_OUTPUTS');
            }

            const sizes = await gzipSizes(assets);

            // The folder picked, so the baseline is named after it (`dist/app` rather than `stats.json`).
            const first = stats ?? list[0];
            const folder = first?.webkitRelativePath.split('/', 1)[0] || (first?.name ?? 'build');
            // The previous folder is measured the same way as the current one, or the comparison
            // would be between two different units.
            const brotli = withGzipFallback(brotliSizes(list), sizes);
            const useBrotli = brotli.size > 0 && this.preferBrotli();
            const chosen = useBrotli ? brotli : sizes;
            const mode: Mode = useBrotli ? 'brotli' : sizes.size > 0 ? 'gzip' : 'raw';
            const analysis = analyze(parsed, chosen.size > 0 ? chosen : null);
            this.baseline.set(snapshotOf(analysis, mode, folder, new Date(first?.lastModified ?? Date.now())));
            this.persist();
        } catch (error) {
            this.baseline.set(null);
            this.baselineError.set(errorMessage(error, this.i18n.ui()));
        } finally {
            this.baselineWorking.set(false);
        }
    }

    /** The graph of a previous folder that brought no stats file, read from its chunks. */
    private async baselineGraph(list: readonly File[]): Promise<Metafile> {
        const page = indexHtmlOf(list, this.config()?.build?.page);
        const html = page ? await page.text() : null;
        const graph = await readFolderGraph(bundleFilesOf(list), html, this.config()?.build);
        return graph.meta;
    }

    clearBaseline(): void {
        this.baseline.set(null);
        this.baselineError.set(null);
        this.persist();
    }

    /**
     * `loadline.json`, dropped on the page: the thresholds the team agreed on, applied here.
     *
     * The acceptances in it are not applied to what the page shows. A signal the page hides is a
     * signal nobody can look at, and the page is where somebody goes **to** look; the command is
     * where an acceptance decides whether a build stops, and that is where it belongs.
     */
    async applyConfig(text: string): Promise<void> {
        let config: LoadlineConfig | null;
        try {
            ({ config } = readConfig(JSON.parse(text)));
        } catch {
            // Not readable JSON: nothing changes, and the drop zone already says what was ignored.
            return;
        }
        const before = this.config()?.build;
        if (config?.criteria) {
            this.criteriaService.applyAll(config.criteria, this.mode());
        }
        // The five answers, unlike the acceptances, **are** applied here: they are context to
        // read the report with rather than a decision to hide something, and having them in
        // the file and not on the page is exactly the split this file exists to end. A block
        // with nothing answered in it still replaces what is here, because the committed
        // answers are the team's and a half-finished form in one browser is not.
        if (config?.situation) {
            this.situation.apply(config.situation);
        }
        this.config.set(config);
        // `build.screens` is applied as the report is drawn; the other three are how the folder is
        // read, so the folder is read again under them. Without the files — a session restored
        // after a reload — there is nothing to read, and the next drop of the folder applies them.
        const files = this.folderFiles;
        if (files && !sameFolderReading(before, config?.build)) {
            await this.loadDist(files);
        }
    }

    /** Adds files to the context: each one is recognised by name, the rest are reported as ignored. */
    async loadContext(files: Iterable<File>): Promise<void> {
        const current = this.context();
        const loaded = new Set(this.contextInfo()?.files);
        const ignored: string[] = [];
        let next: ProjectContext = { ...current, pipelines: [...current.pipelines] };

        const list = [...files];
        // `package.json` first: the pipeline's scripts resolve through it.
        list.sort((a, b) => Number(b.name === 'package.json') - Number(a.name === 'package.json'));

        for (const file of list) {
            try {
                const text = await file.text();
                if (file.name === 'angular.json') {
                    const angular = readAngularJson(JSON.parse(text), this.angularProject());
                    if (!angular) {
                        throw new Error('not angular.json');
                    }
                    next = { ...next, angular };
                } else if (file.name === 'package.json') {
                    const pkg = readPackageJson(JSON.parse(text));
                    if (!pkg) {
                        throw new Error('not package.json');
                    }
                    next = { ...next, pkg };
                } else if (/\.ya?ml$/i.test(file.name) || /^jenkinsfile$/i.test(file.name)) {
                    const pipeline = readPipeline(file.name, text, next.pkg?.scripts ?? {});
                    // Any YAML is accepted at the door, because a pipeline file can be called
                    // anything. What decides is what is inside: a `docker-compose.yml` names no CI
                    // and holds no build, and listing it as a pipeline that builds nothing reads as
                    // a finding about the project rather than about the wrong file being dropped.
                    if (pipeline.kind === 'unknown' && pipeline.builds.length === 0) {
                        ignored.push(file.name);
                        continue;
                    }
                    next = { ...next, pipelines: [...next.pipelines.filter(p => p.file !== file.name), pipeline] };
                } else {
                    ignored.push(file.name);
                    continue;
                }
                loaded.add(file.name);
                this.contextTexts.set(file.name, text);
            } catch {
                ignored.push(file.name);
            }
        }

        // Pipelines read before `package.json` arrived did not have the scripts: read them again.
        if (next.pkg && next.pkg !== current.pkg) {
            const scripts = next.pkg.scripts;
            next = { ...next, pipelines: next.pipelines.map(p => readPipeline(p.file, p.text, scripts)) };
        }

        this.context.set(next);
        this.contextInfo.set({ files: [...loaded], ignored });
        this.persist();
    }

    /**
     * Which application of `angular.json` the budgets are read from. A workspace can declare
     * several, and until now the first one won silently: the report showed one application's
     * budgets while the `stats.json` came from another, with nothing on screen saying so.
     */
    selectAngularProject(name: string): void {
        const text = this.contextTexts.get('angular.json');
        if (!text) {
            return;
        }

        try {
            const angular = readAngularJson(JSON.parse(text), name);
            if (angular) {
                this.angularProject.set(name);
                this.context.update(current => ({ ...current, angular }));
            }
        } catch {
            // The file was already read once to get here: a failure now means it changed underneath.
        }
    }

    clearContext(): void {
        this.context.set(EMPTY_CONTEXT);
        this.contextInfo.set(null);
        this.contextTexts.clear();
        this.angularProject.set(null);
        this.persist();
    }

    // --- browser measurement --------------------------------------------------------------------

    /**
     * Reads what somebody pasted from their browser. Returns the reason when it cannot be used, so
     * the zone can say which of the three things went wrong instead of "invalid".
     */
    loadMeasurement(text: string, pick: string | null = null): 'ok' | MeasurementError {
        const parsed = readMeasurement(text);
        if (typeof parsed === 'string') {
            this.measurement.set(null);
            this.measurementError.set(measurementMessage(parsed, this.i18n.ui()));
            return parsed;
        }

        // Matching against the analysis is what tells a measurement of *this* build from one of
        // another: with hashed file names, nothing matching means nothing to compare.
        const analysis = this.analysis();
        if (analysis) {
            const report = contrast(analysis, parsed, pick);
            if (typeof report === 'string') {
                this.measurement.set(null);
                this.measurementError.set(measurementMessage(report, this.i18n.ui()));
                return report;
            }
        }

        this.measurement.set(parsed);
        this.measurementPick.set(pick);
        this.measurementError.set(null);
        this.persist();
        return 'ok';
    }

    /** Attributes the measurement to a screen by hand. `null` gives the job back to Loadline. */
    setMeasurementPick(source: string | null): void {
        this.measurementPick.set(source);
        this.persist();
    }

    clearMeasurement(): void {
        this.measurement.set(null);
        this.measurementPick.set(null);
        this.measurementError.set(null);
        this.persist();
    }

    // --- reclassifying an entry by hand ----------------------------------------------------------

    /**
     * Says what a lazy entry is, overruling the rules for it. Asking for the opposite of a mark that
     * is already there removes it instead: that is how somebody undoes one entry without wiping the
     * rest, and it leaves the rules answering again rather than freezing their answer in a mark.
     */
    markAs(source: string, kind: ScreenMark): void {
        const marks = new Map(this.marks());
        if (marks.has(source) && marks.get(source) !== kind) {
            marks.delete(source);
        } else {
            marks.set(source, kind);
        }

        this.marks.set(marks);
        this.persist();
    }

    /** Back to what the rules say, everywhere. */
    clearMarks(): void {
        this.marks.set(new Map());
        this.persist();
    }

    // --- last session ---------------------------------------------------------------------------

    /** Loads back what this browser kept from the previous visit. */
    async restoreLast(): Promise<void> {
        const stored = await loadSession();
        this.lastSession.set(null);
        if (!stored) {
            return;
        }

        try {
            const parsed = metafileOf(JSON.parse(stored.statsText));
            if (!parsed) {
                throw new Error('NO_OUTPUTS');
            }

            this.metafile.set(parsed);
            this.statsInfo.set({ name: stored.statsName, outputs: Object.keys(parsed.outputs).length });
            this.statsText = stored.statsText;
            this.derived.set(stored.derived === true);
            this.graphLinks.set(
                stored.parallel ? { parallel: new Map(stored.parallel), routes: new Map(stored.routes) } : null,
            );
        } catch (error) {
            this.error.set(errorMessage(error, this.i18n.ui()));
            return;
        }

        if (stored.gzip) {
            this.gzip.set(new Map(stored.gzip));
            this.distFiles.set(stored.gzip.length);
        }
        if (stored.brotli && stored.brotli.length > 0) {
            this.brotli.set(new Map(stored.brotli));
        }
        this.announced.set(stored.announced ? new Set(stored.announced) : null);
        this.pageOrigins.set(stored.pageOrigins ?? null);
        this.pageCss.set(stored.pageCss ?? null);
        this.assets.set(stored.assets ?? null);
        if (stored.maps && stored.maps.length > 0) {
            const splits = new Map(stored.maps.map(([chunk, split]) => [chunk, new Map(split)]));
            this.maps.set(splits);
            this.mapFiles.set(splits.size);
        }
        if (stored.marks && stored.marks.length > 0) {
            this.marks.set(new Map(stored.marks));
        }
        if (stored.baseline) {
            this.baseline.set(stored.baseline);
        }
        if (stored.measurement && stored.measurement.entries.length > 0) {
            this.measurement.set({
                url: stored.measurement.url,
                // A session saved before the snippet asked for timings kept a pair per file. It
                // still restores, with everything the newer one carries left unknown.
                entries: stored.measurement.entries.map(entry =>
                    Array.isArray(entry) ? { file: entry[0], bytes: entry[1] } : entry,
                ),
                source: 'json',
                page: stored.measurement.page ?? NO_PAGE,
            });
            this.measurementPick.set(stored.measurement.pick);
        }
        if (stored.context.length > 0) {
            await this.loadContext(stored.context.map(file => new File([file.text], file.name)));
        }
    }

    forgetLast(): void {
        this.lastSession.set(null);
        void clearSession();
    }

    /**
     * Forgets the compressed sizes and the source maps when none of their file names appears in the
     * new metafile. Without this, loading a newer `stats.json` on top of an old folder keeps
     * saying "compressed figures" while every chunk has silently fallen back to its raw size.
     */
    private dropStaleSizes(meta: Metafile): void {
        const sizes = this.gzip();
        if (!sizes) {
            return;
        }

        const names = new Set(Object.keys(meta.outputs).map(file => baseName(file)));
        for (const name of sizes.keys()) {
            if (names.has(name)) {
                return;
            }
        }

        this.forgetFolder();
    }

    /**
     * Everything the build folder said, in one place: the sizes, the maps, the page and the files
     * besides the code. It was two lists, and the one for a folder that no longer matched the build
     * had left the pictures and the names out, which kept raising signals about a build that was no
     * longer the one on screen.
     */
    private forgetFolder(): void {
        this.folderFiles = null;
        this.gzip.set(null);
        this.brotli.set(null);
        this.maps.set(null);
        this.announced.set(null);
        this.pageOrigins.set(null);
        this.pageTitle.set(null);
        this.pageCss.set(null);
        this.assets.set(null);
        this.buildTexts.set(new Map());
        this.buildMaps.set([]);
        this.distFiles.set(null);
        this.mapFiles.set(null);
    }

    /** Keeps the current session in this browser, so a reload does not lose the measurement. */
    private persist(): void {
        const text = this.statsText;
        if (!text || !this.metafile()) {
            return;
        }

        const gzip = this.gzip();
        const brotli = this.brotli();
        const maps = this.maps();
        const announced = this.announced();
        const links = this.graphLinks();
        const measurement = this.measurement();
        const session: StoredSession = {
            derived: this.derived(),
            parallel: links
                ? [...links.parallel].map(([chunk, together]): [string, string[]] => [chunk, [...together]])
                : null,
            routes: links ? [...links.routes] : null,
            date: new Date().toISOString(),
            statsName: this.statsInfo()?.name ?? 'stats.json',
            statsText: text,
            gzip: gzip ? [...gzip] : null,
            brotli: brotli ? [...brotli] : null,
            maps: maps ? [...maps].map(([chunk, split]): [string, [string, number][]] => [chunk, [...split]]) : null,
            announced: announced ? [...announced] : null,
            pageOrigins: this.pageOrigins(),
            pageCss: this.pageCss(),
            assets: this.assets(),
            baseline: this.baseline(),
            marks: [...this.marks()],
            context: [...this.contextTexts].map(([name, value]) => ({ name, text: value })),
            measurement: measurement
                ? {
                      entries: measurement.entries,
                      url: measurement.url,
                      pick: this.measurementPick(),
                      page: measurement.page,
                  }
                : null,
        };
        void saveSession(session);
    }

    /** Routes whatever was dropped: context files by name, then Loadline exports, then metafiles. */
    async loadAny(files: Iterable<File>, preferBaseline = false): Promise<void> {
        const list = [...files];
        const contextFiles = list.filter(file => isContextName(file.name));
        if (contextFiles.length > 0) {
            await this.loadContext(contextFiles);
        }

        const others = list.filter(file => !isContextName(file.name));
        for (const file of others) {
            await this.route(file, await sniff(file), preferBaseline);
        }
    }

    /**
     * One dropped file, put where it belongs.
     *
     * A method rather than a chain inside `loadAny` because there are six kinds of file now, and
     * that chain is where the seventh would have gone wrong: a `pnpm-lock.yaml` read as a pipeline,
     * an audit report read as a metafile.
     */
    private async route(file: File, kind: IntakeKind, preferBaseline: boolean): Promise<void> {
        if (kind === 'lock') {
            this.lock.set(readLock(file.name, await file.text()));
            return;
        }
        if (kind === 'audit') {
            this.advisories.set(readAudit(await file.text()));
            return;
        }
        if (kind === 'config') {
            await this.applyConfig(await file.text());
            return;
        }
        if (kind === 'baseline' || (kind === 'stats' && preferBaseline)) {
            await this.loadBaseline(file);
            return;
        }
        if (kind === 'stats' || !this.metafile()) {
            await this.loadStats(file);
        }
    }
}
