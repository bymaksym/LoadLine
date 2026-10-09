/**
UI strings. Signals live apart, in `findings.ts`.
*/

import { type Delivery, type OffPageOutputs } from '../analysis/analysis.types';
import { type CriteriaKey, type DataSource, type Mode, type Provenance, type Scale } from '../criteria/criteria.types';
import { type Effort } from '../findings/effort';
import { type Breadth, type Exposure, type RawKey, type SituationKey } from '../situation/situation.types';

export type Lang = 'es' | 'en';

/** The languages there are. One list, so adding a third does not have to be found in the command. */
export const LANGS: Lang[] = ['en', 'es'];

export interface UiStrings {
    // --- rating and criteria ---
    verdictGood: string;
    verdictOk: string;
    verdictBad: string;
    verdictRule: (ok: string, bad: string) => string;
    verdictRuleCoverage: (wide: number, global: number) => string;
    tabCriteria: string;
    tabCompare: string;
    secCompare: string;
    secCompareSub: string;
    howToCompare: string;
    compareAdd: string;
    compareAddCurrent: string;
    compareClear: string;
    compareRemove: string;
    /** The mono line of the empty card: how many applications there are, and how many are missing. */
    compareState: (builds: number) => string;
    compareEmptyTitle: string;
    compareEmpty: string;
    compareNeedsTwo: string;
    compareBuild: string;
    compareTotal: string;
    compareRaw: string;
    compareIn: string;
    compareOfN: (n: number, total: number) => string;
    compareCost: string;
    compareCostHelp: string;
    compareInBootHelp: string;
    compareDuplicatedLead: (builds: number) => string;
    compareDuplicatedHelp: string;
    compareFrameworks: string;
    compareFrameworksNote: string;
    comparePackages: string;
    compareNoShared: string;
    compareOwn: string;
    compareNoOwn: string;
    compareRest: (n: number) => string;
    compareVersions: string;
    compareVersionsHelp: string;
    compareVersionUnknown: string;
    compareVersionsNote: string;
    compareRejected: (files: string[]) => string;
    secCriteria: string;
    secCriteriaSub: string;
    howToCriteria: string;
    criteriaModeNote: (mode: Mode) => string;
    /** With both figures available, which of the two the report is shown in. */
    criteriaFigures: string;
    criteriaGzipBtn: string;
    criteriaBrotliBtn: string;
    /** No `.br` in the folder: the colours are gzip, and brotli would be lower. */
    criteriaBrotliMissing: string;
    criteriaRecommended: (value: string) => string;
    criteriaReset: string;
    criteriaStatusRec: string;
    criteriaStatusCustom: (n: number) => string;
    criteriaEdit: string;
    critGroupSizes: string;
    critGroupShared: string;
    critGroupSignals: string;
    critGroupShape: string;
    critGroupContext: string;
    critOkUpTo: string;
    critBadAbove: string;
    critColThreshold: string;
    /** How much work each kind of signal is, as words. Written once in `effort.ts`, not computed. */
    effortLabel: Record<Effort, string>;
    actionsTotal: (count: number) => string;
    actionsTotalAfter: string;
    actionsTotalNote: string;
    /** The same note in a compressed report, where the savings were carried over from raw bytes. */
    actionsTotalNoteEstimated: string;
    /**
     * The measurements this browser has kept. Every string here has to keep saying *this browser*:
     * a chart looks like a dashboard, and one machine's memory is not the team's history.
     */
    /** What a change to one file invalidates: the question that follows every finding. */
    blastTitle: string;
    blastBody: (chunks: number, screens: number, everyone: boolean) => string;
    /**
     * The rest of the bill: chunks invalidated only because a hashed name written inside them
     * moved. Always shown next to the direct figure, never on its own — the whole value of the
     * number is the comparison, and a share of the build with nothing beside it is just alarming.
     */
    blastCascade: (chunks: number, screens: number, everyone: boolean, share: string) => string;
    blastCascadeHelp: string;
    /**
     * The amplifier, named. Vite's `__vite__mapDeps` is a literal array of hashed names in one
     * file, and that file is imported by several of the ones it lists — which is where the shape
     * comes from. "This file names 42 others" points somewhere; a percentage does not.
     */
    blastHub: (file: string, names: number) => string;
    historyTitle: string;
    historyNote: string;
    historyEmpty: string;
    historyKeep: string;
    historyExport: string;
    historyForget: string;
    historySignals: (high: number, mid: number) => string;
    /** The second line: one screen over the same measurements, on its own scale. */
    historyScreenPick: string;
    historyScreenNone: string;
    historyScreenAbsent: string;
    /** The bootstrap column that says what removing a row would actually take off the first load. */
    thExclusive: string;
    helpExclusive: string;
    helpExclusiveOf: (percent: number) => string;
    critLabel: Record<CriteriaKey, string>;
    critHelp: Record<CriteriaKey, string>;
    /** Why a size threshold does or does not change when the report switches to compressed figures. */
    critScale: Record<Scale, string>;
    /**
     * Where each threshold's number comes from. Cheap to show and, as far as anybody has looked,
     * not something any tool in this category does — which is itself the reason to do it: a report
     * that rates a build against thirty-seven numbers should say which of them have a source.
     */
    critFrom: Record<Provenance, string>;
    critFromHelp: Record<Provenance, string>;
    /** Saving the thresholds as the file the command reads with `--criteria`. */
    criteriaExport: string;
    criteriaExportHelp: string;
    unitKb: string;
    unitPct: string;
    unitTimes: string;
    unitFiles: string;
    unitChunks: string;
    unitScreens: string;
    unitLangs: string;
    unitImporters: string;
    unitTrips: string;
    unitMs: string;
    /** Keeping a chunk of the tree at the top of the list, to compare it against a distant row. */
    treePin: string;
    treeUnpin: string;

    tagline: string;
    lede: string;
    themeBtn: string;
    /** The theme button names the theme it switches to, not the one on screen. */
    themeToDark: string;
    themeToLight: string;
    /** The header button that opens the palette, and the keys that do the same. */
    searchBtn: string;
    searchKeys: string;
    /** The mark in the header is a way back to the front page. */
    homeAria: string;
    /** The chip in the header that says which build is loaded, and goes back to change it. */
    buildChipHelp: string;
    /** The front page: what is required, what is optional, and the way back to a report. */
    intakeRequired: string;
    intakeOptional: string;
    intakeBack: string;
    /** The line above the summary: the caveat on every figure, and what would add detail. */
    contextRawNote: string;
    contextAddDetail: string;
    contextAddDist: string;
    contextAddBaseline: string;
    contextAddContext: string;
    /** Under the lead figure: what it is made of, one part per colour of its bar. */
    heroCaptionBoot: (boot: string) => string;
    heroCaptionExtra: (extra: string, chunks: number, ratio: number) => string;
    heroCaptionSame: string;
    /** The one badge in the summary, on the worst of the rated figures. */
    kpiWorst: string;
    /** The legend at the foot of the report: where each kind of figure comes from. */
    provenanceTitle: string;
    dataSourceShort: Record<DataSource, string>;
    /** How much air the rows get. One control for the whole page: it changes spacing and nothing else. */
    densityCompact: string;
    densityComfortable: string;
    densityHelp: string;
    /** Which columns the widest table draws, and copying one of its rows out of it. */
    columnsBtn: (shown: number, total: number) => string;
    copyRow: string;
    copyRowHelp: string;
    /**
     * The mark that opens "where this figure comes from". One control used everywhere, because
     * sixty explanations used to live in `title` attributes, which do not exist on a touch screen.
     */
    explainBtn: string;
    /**
     * The palette: the only part of the interface with no control on the page at all. It is opened
     * with Ctrl/Cmd + K, with `/`, and `?` is what documents it.
     */
    paletteTitle: string;
    palettePlaceholder: string;
    paletteNone: string;
    paletteTab: string;
    paletteAction: string;
    paletteCount: (shown: number, total: number) => string;
    paletteKeysHint: string;
    keysTitle: string;
    keyJump: string;
    keySearch: string;
    keyMove: string;
    keyClose: string;
    keyHelp: string;
    keyTabs: string;

    // --- intake ---
    drop1Title: string;
    drop1Body: string;
    drop1Btn: string;
    /** The same zone's other way in: the build folder, which is all a Vite or Nuxt build has. */
    drop1FolderBtn: string;
    /** Loads the built-in example, for looking at the tool without building an application first. */
    sampleBtn: string;
    /** What the status line says while the example is loaded, so it is never mistaken for a build. */
    sampleLoaded: (outputs: number) => string;
    sampleRemove: string;
    /** Copies the shape of the build, with your file names hashed: what a bug report can carry. */
    diagnosticsBtn: string;
    diagnosticsCopied: string;
    diagnosticsHint: string;
    drop2Title: string;
    drop2Body: string;
    drop2Btn: string;
    /** Removing what was loaded, so a wrong file does not force a reload of the page. */
    statsRemove: string;
    distRemove: string;
    /** Where the project name shown next to the title comes from. */
    projectNameHelp: string;
    statsIdle: string;
    distIdle: string;
    statsLoaded: (name: string, outputs: number) => string;
    /**
     * No stats file: the graph was read from the chunks of the folder themselves. `opaque` when
     * the folder brought no source maps either, so what is inside each chunk is not known.
     */
    statsFromFolder: (name: string, outputs: number, opaque: boolean) => string;
    statsError: (message: string) => string;
    distNoFiles: string;
    distNoApi: string;
    distWorking: (done: number, total: number) => string;
    /** The other wait: walking the import graph, which is the one that actually freezes the page. */
    distReading: string;
    distLoaded: (files: number) => string;
    /** The folder also carried source maps: the breakdown stops being an approximation. */
    distLoadedMaps: (files: number, maps: number) => string;
    distLoadedBrotli: string;
    /** The folder also carried the page, so the round trips of the first load can be counted. */
    distLoadedIndex: string;
    /** A restored session: the figures came back, the text of the build did not. */
    distTextUnread: string;
    splitExact: string;
    splitApprox: string;
    splitHelp: string;
    /** An SSR build carries both sides in one metafile; only the browser one is analysed. */
    serverIgnored: (n: number) => string;
    serverIgnoredHelp: string;
    /** Files of the folder no screen downloads: the `nomodule` copy and the service worker. */
    offPageIgnored: (off: OffPageOutputs) => string;
    offPageIgnoredHelp: string;
    /** The line under the screens table: the lazy entries it has no row for. */
    notScreensLabel: string;
    /** What kind each of those entries is, written after its size. */
    notScreenKind: { block: string; grouper: string; data: string; package: string; worker: string; onDemand: string };
    /** Lazy entries that are a piece of a screen, not a screen: @defer and friends. */
    blocksHelp: string;
    /** Lazy entries that are a list of routes and no code: what they load is the screen. */
    groupersHelp: string;
    /** Lazy entries that are data rather than screens. */
    dataHelp: string;
    /** Packages loaded on demand with an `import()` of their own. */
    packagesHelp: string;
    /** Web workers started from the page. */
    workersHelp: string;
    /** Lazy chunks no route of the route table opens, in a build where the table was read. */
    onDemandHelp: string;
    /** Under the table of a folder build whose code has no route table: every lazy chunk is a screen. */
    noRouteTable: string;
    /** The stylesheets the screens load and the page does not ask for: not in any total. */
    routeCss: (count: number, list: string) => string;
    /** Reclassifying an entry by hand, for when the rules get it wrong in a project. */
    markScreen: string;
    markScreenHelp: string;
    markBlock: string;
    markBlockHelp: string;
    marksNote: (n: number) => string;
    marksReset: string;
    /**
    Compact bar replacing the drop zones once there is a report.
    */
    intakeCompressed: (unit: string) => string;
    intakeRaw: string;
    /**
     * Reading the build folder again after a rebuild. Only ever drawn where the browser can hold on
     * to the folder: not in Firefox, not in Safari, and not from a `file://` page.
     */
    rereadBtn: string;
    rereadHelp: string;

    // --- baseline and project context zones ---
    drop3Title: string;
    drop3Body: string;
    drop3Btn: string;
    drop4Title: string;
    drop4Body: string;
    drop4Btn: string;
    baselineIdle: string;
    baselineLoaded: (name: string, mode: string, screens: number) => string;
    baselineError: (message: string) => string;
    /** Compact bar: "baseline: name". */
    baselineShort: (name: string) => string;
    baselineModeMismatch: string;
    baselineRemove: string;
    /** Zone 3 also takes the previous build folder, to compare compressed against compressed. */
    drop3BtnDist: string;
    baselineWorking: string;
    contextIdle: string;
    contextLoaded: (files: string[]) => string;
    contextIgnored: (files: string[]) => string;
    contextShort: (n: number) => string;
    /**
     * Compact bar, when the `loadline.json` dropped extends others the page cannot read: which, and
     * that only what this file says is applied. `configExtendsHelp` is the longer version, on hover.
     */
    configExtends: (names: string) => string;
    configExtendsHelp: string;
    contextRemove: string;
    /** Offer to restore the measurement this browser kept from the previous visit. */
    restorePrompt: (name: string, date: string) => string;
    restoreBtn: string;
    restoreForget: string;

    // --- export ---
    exportJson: string;
    exportMarkdown: string;
    exportCopied: string;
    exportHint: string;

    // --- comparison ---
    colDelta: string;
    helpDelta: (baseline: string) => string;
    deltaRaw: string;
    tileBootDelta: (diff: string, pct: number, baseline: string) => string;
    tileBootSame: (baseline: string) => string;
    compareNewScreens: (n: number) => string;
    compareGoneScreens: (n: number) => string;
    compareNew: string;

    // --- project tab ---
    tabProject: string;
    secProject: string;
    secProjectSub: string;
    howToProject: string;
    /** The mono line of the empty card, in the vocabulary of the provenance tags. */
    projectState: string;
    projectEmptyTitle: string;
    projectEmpty: string;
    projectEmptyBtn: string;
    projectBudgets: (project: string) => string;
    /** A workspace with several applications: which one is being read, and the way to change it. */
    projectPick: string;
    projectPickHelp: (n: number) => string;
    projectNoBudgets: string;
    thConfiguration: string;
    thWarning: string;
    thError: string;
    thBuiltBy: string;
    thAgainstBoot: string;
    helpBuiltBy: string;
    helpAgainstBoot: string;
    builtByNone: string;
    builtByUnknown: string;
    budgetNoneRow: string;
    budgetInherited: string;
    budgetDefaultTag: string;
    budgetOver: (pct: number) => string;
    budgetHeadroom: (pct: number) => string;
    projectPipeline: (file: string) => string;
    projectNoBuilds: string;
    thJob: string;
    thCommand: string;
    thResolvesTo: string;
    buildDefaultConfig: (name: string) => string;
    buildUnresolved: string;
    projectZone: string;
    zoneYes: string;
    zoneNo: string;
    zoneUnknown: string;
    projectAngular: (version: string) => string;
    projectBootRaw: (size: string) => string;

    // --- summary ---
    headLeadGzip: string;
    headLeadRaw: string;
    unitGzip: string;
    unitRaw: string;
    unitBrotli: string;
    headLeadBrotli: string;

    /**
     * What to do about a figure that came out orange or red. General, not per project: the four
     * ways to bring a figure down, how to tell whether one is worth taking, and when it stops being worth it.
     */
    howToAct: string;
    howToActBody: string;
    /** One line per rated figure: what moves that one. Shown only when it is not rated good. */
    adviceBoot: string;
    adviceEffective: string;
    adviceShared: string;
    adviceFindings: string;

    tileBoot: string;
    tileBootSub: (files: number) => string;
    /** Under the bootstrap split when the report is compressed: the split itself is raw bytes. */
    bootSplitRaw: (total: string) => string;
    /**
     * In place of the split when the bootstrap's chunks carry no source maps: what is inside them is
     * not known, and two tiles reading "0 B" said it was nothing.
     */
    bootSplitUnknown: string;
    /** The stylesheets the page also asks for, which the figure above does not include. */
    tileBootCss: (size: string, files: number, total: string) => string;
    tileScreens: string;
    tileScreensTypical: string;
    tileScreensTop: (label: string, size: string) => string;
    tileScreensNone: string;
    tileShared: string;
    tileSharedSub: (global: number, partial: number) => string;
    tileSharedNone: string;
    tileFindings: string;
    tileFindingsSub: (high: number, mid: number, context: number) => string;
    tileFindingsNone: string;

    // --- tabs ---
    tabFindings: string;
    tabScreens: string;
    tabBoot: string;
    tabShared: string;
    tabTree: string;
    tabMap: string;
    howTo: string;
    howToFindings: string;
    howToScreens: string;
    howToBoot: string;
    howToShared: string;
    howToTree: string;

    secFindings: string;
    secFindingsSub: string;
    secScreens: string;
    secScreensSub: string;
    secTree: string;
    secTreeSub: string;

    // --- map ---
    howToMap: string;
    secMap: string;
    secMapSub: string;
    /** The breadcrumb's first step: every chunk of the build. */
    mapRoot: string;
    mapSearch: string;
    /** How many rectangles a search lights up, out of how many are drawn. */
    mapMatches: (hits: number) => string;
    /** The bytes of a chunk the metafile attributes to no file: the bundler's own wrapper. */
    mapUnattributed: string;
    mapRest: (count: number) => string;
    mapKind: Record<'chunk' | 'package' | 'folder' | 'file' | 'rest' | 'unattributed' | 'build', string>;
    /** What the area means at the level shown, which is the one thing a treemap never says. */
    mapAreaRoot: (unit: string) => string;
    mapAreaInside: string;
    mapShareOfParent: (percent: string, parent: string) => string;
    mapShareOfAll: (percent: string) => string;
    mapRawInside: (raw: string) => string;
    mapContents: string;
    mapOpen: string;
    mapUp: string;
    mapFindIt: string;
    mapHint: string;
    mapLegendPackage: string;
    mapLegendOwn: string;
    mapEmpty: string;
    mapPick: string;
    secBoot: string;
    secBootSub: string;
    secShared: string;
    secSharedSub: string;

    // --- signals ---
    sevHigh: string;
    sevMid: string;
    sevOk: string;
    sevInfo: string;
    seeInShared: string;
    seeInBoot: string;
    seeInScreens: string;
    seeInProject: string;
    seeInMeasured: string;
    seeInSituation: string;
    fixLabel: string;
    /** The signals that are context rather than a problem: the filter that gathers `ok` and `info`. */
    findingsRest: string;
    /** Ticking a signal off while a fix is being made, so the list does not start the same length twice. */
    findingsSee: string;
    findingsUnsee: string;
    findingsSeenHelp: string;
    findingsSeenCount: (n: number) => string;
    findingsSeenReset: string;
    findingsNoneHere: string;
    /** The columns of the ranked table: the signal, the bytes it takes off the first load, the work it is. */
    findingsColSignal: string;
    findingsColOff: string;
    findingsColFix: string;

    // --- screens ---
    legBoot: string;
    legOwn: string;
    screensCaveat: string;
    filterScreens: string;
    filterBoot: string;
    filterShared: string;
    /** The invitation on every sortable column header. */
    sortByColumn: string;
    shownCount: (shown: number, total: number) => string;
    /** The same counter where the rows are not screens: packages in the bootstrap, shared chunks. */
    shownRows: (shown: number, total: number) => string;
    noMatch: string;
    colScreen: string;
    colShared: string;
    colOwn: string;
    colTotal: string;
    helpTotal: string;
    helpOwnCol: string;
    helpSharedCol: string;
    whichScreens: string;
    /** The three parts a screen total is made of, each leading to the tab that owns it. */
    screenParts: string;
    /** What a screen downloads, read as a shape: how few files carry it, how many are crumbs. */
    screenShape: (n: {
        files: number;
        heavy: number;
        share: number;
        crumbs: number;
        crumbMax: string;
        crumbSize: string;
    }) => string;
    origin: string;
    filesCount: (n: number) => string;
    /** From the computed table to the measured one: where the difference gets settled. */
    measureFromScreens: string;

    // --- eager, lazy and round trips ---
    /** What every load brings down, against what waits for somebody to ask for it. */
    tagDelivery: Record<Delivery, string>;
    helpDelivery: Record<Delivery, string>;
    /**
     * How many round trips a screen takes to be complete. The other half of the weight: the same
     * bytes in three sequential requests arrive later than in one, and no size figure shows it.
     */
    colWaves: string;
    helpWaves: string;
    screenWaves: (n: number) => string;
    /** The first load, read off `index.html`: what it announces and what it only finds by parsing. */
    startupNote: (startup: { waves: number; late: number; chunks: number } | null) => string;
    startupHelp: string;

    // --- measured tab ---
    tabMeasured: string;
    secMeasured: string;
    secMeasuredSub: string;
    howToMeasured: string;
    /** The mono line of the empty card: nothing measured, so everything on screen is derived. */
    measureState: string;
    measureTitle: string;
    measureStep1: string;
    measureStep2: string;
    measureStep3: string;
    measureCopy: string;
    /** The snippet is folded away behind a button: it is copied far more often than it is read. */
    measureShowCode: string;
    measureHideCode: string;
    /** The column beside the empty card: what pasting a measurement adds to the report. */
    measureGain: string;
    measureGainCompare: string;
    measureGainServed: string;
    measureCopied: string;
    measurePlaceholder: string;
    measureRun: string;
    measureClear: string;
    measureErrEmpty: string;
    measureErrNoFiles: string;
    measureErrNoMatch: string;
    measureStale: string;
    measureScreen: string;
    measureAuto: string;
    measurePicked: string;
    measureRootOnly: string;
    measureFrom: (url: string) => string;
    measureComputed: string;
    measureMeasured: string;
    measureDiff: string;
    measureSame: string;
    measureTransfer: string;
    measureTransferHelp: string;
    measureFiles: (n: number) => string;
    measureExtra: string;
    measureExtraHelp: string;
    measureExtraNone: string;
    measureMissing: string;
    measureMissingHelp: string;
    measureMissingNone: string;
    measureForeign: (n: number) => string;
    measureOther: (n: number) => string;
    measureBelongs: string;
    measureNobody: string;
    measureZone: Record<'boot' | 'shared' | 'own', string>;
    measureNotes: string;

    /**
     * The environment as that one paste observed it.
     *
     * Every string of this block has to keep saying **observed**, never "your users". The snippet
     * describes the machine of whoever ran it, on the connection they were on, on the day they ran
     * it, and the whole value of showing these figures depends on never letting that slip.
     */
    measureObserved: string;
    measureObservedHelp: string;
    /** With the date it was taken, so a figure from two months ago reads as one. */
    measureTakenAt: (date: string) => string;
    measureStaleFact: (days: number) => string;
    measureProtocol: string;
    measureRtt: string;
    measureTtfb: string;
    measureCompression: string;
    measureCompressionOff: (n: number) => string;
    measureCacheState: string;
    /** From the cache, revalidated, downloaded: the three the file names alone cannot tell apart. */
    measureCacheSplit: (fromCache: number, revalidated: number, network: number) => string;
    measureConnections: string;
    measureThird: string;
    measureThirdValue: (requests: number, origins: number) => string;
    measureSw: string;
    measureSwOn: string;
    measureSwOff: string;
    measurePreloads: string;
    measureBatches: string;
    measureBatchesValue: (batches: number, widest: number) => string;
    /** What a figure the paste did not carry says. Never a default, never an average. */
    measureUnknown: string;
    /**
     * The four states a figure can be in, painted apart wherever two of them sit side by side.
     *
     * The one that matters is the fourth. A report that quietly turns "nobody looked" into "we
     * assumed the median" cannot be checked by anybody, so `unknown` has a word of its own and
     * never a value.
     */
    dataSource: Record<DataSource, string>;
    dataSourceHelp: Record<DataSource, string>;

    /**
     * The five questions.
     *
     * They are the third source of facts in the report and the only one written by a person rather
     * than read off a disk, which is why the wording carries more weight here than anywhere else:
     * an ambiguous question gets a confident wrong answer, and a confident wrong answer is the one
     * input that can move a colour. Every one of them is asked in words somebody in a stand-up
     * would use, with the figure it stands for written underneath rather than instead.
     */
    tabSituation: string;
    secSituation: string;
    secSituationSub: string;
    howToSituation: string;
    /** The whole question, as it is asked. */
    sitQuestion: Record<SituationKey, string>;
    /** Each option of each question, keyed by the value it sets. */
    sitOption: Record<SituationKey, Record<string, string>>;
    /** What the question is really asking, in the unit an analytics query would answer in. */
    sitTechnical: Record<SituationKey, string>;
    /** Where to look when nobody knows it off the top of their head. */
    sitHowTo: Record<SituationKey, string>;
    /**
     * The raw controls, for whoever would rather type the figure than pick a band.
     *
     * They are not a second questionnaire: they are the same three answers with less rounding, and
     * when one is filled in it wins over the band above it.
     */
    sitPanel: string;
    sitPanelHelp: string;
    sitRawLabel: Record<RawKey, string>;
    sitRawUnit: Record<RawKey, string>;
    /** Placeholder of the three raw controls. A dash: prose does not fit in a number box. */
    sitRawEmpty: string;
    /** The words before a raw control: the band is the answer, the figure the sharper version of it. */
    sitRawOr: string;
    /** The mark on a question nobody has answered, now that no option carries that meaning. */
    sitOpen: string;
    /** The fourth question's raw control is the report's own latency, so it says so and links there. */
    sitLatency: (ms: number) => string;
    sitLatencyGo: string;
    /** The fifth has no raw control at all: its unit is two figures nothing here measures. */
    sitNoRaw: string;
    /** RUM: the fact that changes what the fourth question is for. */
    sitRum: string;
    sitRumHelp: string;
    sitRumOn: string;
    /** Who answered and when. Not decoration: an answer with no date cannot be told to have expired. */
    sitWho: string;
    sitWhoPlaceholder: string;
    sitWhen: string;
    /** The shape the date is typed in, which is the page's language and not the browser's. */
    sitWhenPlaceholder: string;
    sitWhenInvalid: string;
    sitStale: (days: number) => string;
    sitNoDate: string;
    sitAnswered: (answered: number, total: number) => string;
    sitReset: string;
    sitExport: string;
    sitExportHelp: string;
    /**
     * The line the middle two questions exist to produce: releases a week × the share arriving with
     * a warm cache. Shown as the multiplication, never only as its result.
     */
    sitCost: (deploys: string, returning: string, perWeek: string) => string;
    sitCostNone: string;
    sitExposure: Record<Exposure, string>;
    sitBreadth: Record<Breadth, string>;
    /** What answering does, and — the half that matters — what it cannot do. */
    sitAsymmetry: string;
    sitDeclared: string;

    // --- shared columns ---
    thSource: string;
    thSize: string;
    thChunk: string;
    thScreens: string;
    thMain: string;
    /** A chunk with nothing of its own to attribute: an empty cell explained none of it. */
    chunkNoContent: string;
    thOwn: string;
    thSharedWith: string;
    thCoverage: string;
    thImporters: string;
    helpScreens: string;
    helpSize: string;
    helpMain: string;
    helpCoverage: string;
    helpImporters: string;
    helpSource: string;

    // --- shared chunks ---
    covGlobal: string;
    covWide: string;
    covNarrow: string;
    coverageOf: (n: number, total: number) => string;
    loadedBy: (n: number) => string;
    contents: string;
    pathExpandAll: string;
    pathCollapseAll: string;
    /** Why the breakdown of a chunk is raw while the chunk's own figure may be compressed. */
    pathRawHelp: string;
    pathUnattributed: (size: string) => string;
    pathUnattributedHelp: string;
    /** The chunk's raw size, next to its compressed one. */
    treeRawHelp: string;
    /**
     * What a shared chunk costs and where that cost comes from. The tags name what was measured —
     * which group dominates the chunk, and how many files reach it — never how hard the fix is or
     * whether it pays off: that depends on the project, and the report cannot see it. The reader
     * draws the conclusion from the figure and the address.
     */
    worthTitle: string;
    /** Tags, one per origin. They describe where the weight comes from, not a verdict on the work. */
    worthTagSmall: string;
    worthTagOwn: string;
    worthTagPackage: (importers: number) => string;
    worthTagCommon: string;
    worthCost: (cost: string, share: number, without: string) => string;
    worthSmall: (min: string) => string;
    worthOwn: (label: string, share: number) => string;
    worthPackage: (pkg: string, share: number, importers: number) => string;
    worthCommon: string;
    /** The fact the whole rule rests on, said once per chunk. */
    worthNoSplit: string;
    worthTriage: (n: {
        namedN: number;
        namedCost: string;
        spreadN: number;
        spreadCost: string;
        smallN: number;
        min: string;
    }) => string;

    /**
     * The line that opens the shared tab. Its figures — the total and the two coverage thresholds —
     * go in `<strong>`, which the tab draws in monospace: it splits on the tag, never `innerHTML`.
     */
    sharedSum: (size: string, chunks: number, ratio: number, wide: number) => string;
    sharedSumNone: (ratio: number, wide: number) => string;

    // --- bootstrap ---
    bootPackages: string;
    bootOwnCode: string;
    entriesCount: (n: number) => string;
    importersCount: (n: number) => string;
    importersNone: string;
    /** How many of the importers are in lazy screens, out of how many there are: "1 of 4 …". */
    importersLazyOnly: (lazy: number, total: number) => string;
    ownCodeRow: string;
    /** Legend of the bootstrap table: what each bar colour is. */
    legBootPkg: string;
    legBootOwn: string;
    /**
     * The red row. It says what the rule actually checks — few importers, at least one in a lazy
     * screen — and not "only lazy screens import it", which the rule never establishes: a package
     * with four importers, three of them in the bootstrap, also matches.
     */
    legBootBad: string;
    /** The same two sides in a sentence, for the hover of the split bar and its figures. */
    helpBootPackages: string;
    helpBootOwnCode: string;
    helpBootSplit: (pkg: string, own: string) => string;
    helpBootPercent: string;
    /** Words closing "18.2 % …" in a bar's hover. */
    helpBootOfBoot: string;
    helpBootLazyOnly: (max: number) => string;
    helpImportersNone: string;
    /**
     * On the exclusive weight and the importers of a build read from its folder: the maps say what
     * each chunk carries, never who imports what, and "0 B · nobody imports it" read as an answer.
     */
    helpImportsUnknown: string;
    /** Detail of a bootstrap package: the import chain from the entry, and the files importing it. */
    bootChain: string;
    bootChainNone: string;
    tagCommonJs: string;
    helpCommonJs: string;
    /** Screen detail: the routes file that lazy-loads it. */
    loadedFrom: string;

    // --- tree ---
    treeAll: string;
    treeBoot: string;
    treeLazy: string;
    treeShared: string;
    treeOwn: string;
    treeScreens: (n: number) => string;
    filterTree: string;
    treeNoMatch: string;
    /** The tail of the list, folded into one row: how many crumbs, what they weigh, and the line. */
    treeCrumbs: (n: number, total: string, line: string) => string;
    /** How the build divides: what everybody pays for, what several screens pay for, what one does. */
    shapeTitle: string;
    /** On a chunk row: how much of its zone that one chunk holds. Only when it is a lot. */
    treeShare: (share: number, zone: 'boot' | 'shared' | 'own') => string;
    treeShareHelp: string;
    /** Under the bar: how much of the build comes down on every load, said as a proportion. */
    shapeSplit: (eagerPercent: number) => string;
    /** The legend under that bar: when each zone comes down and who pays for it, in a few words. */
    shapeZone: Record<'boot' | 'shared' | 'own', string>;
    shapeNote: (n: {
        zone: 'boot' | 'shared' | 'own';
        share: number;
        heavy: boolean;
        crumbs: number;
        files: number;
        crumbMax: string;
        crumbSize: string;
    }) => string;
    /** Who pays for each zone. The filter buttons double as the legend of the bar colours. */
    helpZoneAll: string;
    helpZoneBoot: string;
    helpZoneShared: string;
    helpZoneOwn: string;
    helpTreeBar: (percent: number) => string;

    // --- search ---
    tabSearch: string;
    secSearch: string;
    secSearchSub: string;
    howToSearch: string;
    searchPlaceholder: string;
    /** Before anything is typed: the heaviest names, out of how many there are to search. */
    searchHeaviest: (shown: number, total: number) => string;
    searchTooShort: string;
    /** The useful negative answer: the name is not in the bundle. */
    searchNoMatch: (query: string) => string;
    searchFound: (shown: number, total: number) => string;
    searchKindPackage: string;
    searchKindFile: string;
    searchInBoot: string;
    searchPartlyBoot: (size: string) => string;
    searchScreensCount: (n: number) => string;
    searchMatchedIn: (n: number) => string;
    searchCopiesTag: (n: number) => string;
    searchChain: string;
    searchChainNone: string;
    /**
     * "Why is this here", the question that follows every row of the report, asked where the row
     * is rather than in the tab that used to be the only place holding the answer.
     */
    whyHere: string;
    whyHereOf: (name: string) => string;
    whyHereNone: string;
    searchPlaces: string;
    thZone: string;
    helpZone: string;
    searchTwice: string;
    seeInSearch: string;

    // --- duplicates ---
    /** How one installed copy is named: by its version when the path carries it, by where it is otherwise. */
    dupCopy: (copy: { version: string | null; under: string | null }) => string;
    dupZone: Record<'boot' | 'shared' | 'own', string>;
    dupBroughtBy: string;
    dupImportedBy: string;
    dupNobody: string;

    noScreens: string;
    noShared: string;
    footer: string;
    /** With a report open the footer folds into the question it answers. */

    // --- three views drawn from figures the report already has ---
    /** The bootstrap map coloured by how each part moved since the baseline (bootstrap tab). */
    diffTitle: string;
    diffSub: (before: string, after: string, diff: string, baseline: string) => string;
    diffChange: { new: string; grew: string; shrank: string; same: string; gone: string };
    /** A folder of the project's own code, as opposed to a package. */
    diffOwn: string;
    diffGone: string;
    /** Under the map in a compressed report: the deltas are raw weights at the bootstrap's ratio. */
    diffEstimated: string;
    /** Against a baseline that did not record the project's folders: they are not compared. */
    diffPackagesOnly: string;
    diffTile: (name: string, size: string, change: string) => string;
    /** Screens × packages (screens tab). */
    gridTitle: string;
    gridSub: string;
    gridBoot: string;
    gridLazy: string;
    gridOwn: string;
    gridRest: string;
    gridTotal: string;
    gridCell: (screen: string, size: string, what: string) => string;
    gridScale: { less: string; more: string };
    gridRaw: string;
    /** One screen's load, trip by trip (screen detail). */
    tripsTitle: string;
    tripsNote: string;
    tripsProfile: { slow4g: string; fast4g: string; cable: string };
    tripsBoot: string;
    tripsScreen: string;
    tripLabel: (index: number) => string;
    tripsWait: string;
    tripsParse: string;
    tripsTotal: (time: string, trips: number) => string;
    tripsAssumed: string;
    tripBar: (index: number, wait: string, transfer: string, size: string, files: number) => string;

    errNoEntries: string;
    errNoMain: string;
    errNoOutputs: string;
    /** A JSON that is not a metafile of any format we know: not the same answer as a missing key. */
    errNotMetafile: string;
    /** What a good file looks like. Follows every reason, because the reason alone never said it. */
    errExpected: string;
    /** A folder read on its own, without the page that says which chunk the application starts at. */
    errNoPage: string;
    /** A folder dropped on the page that the browser would not let it read. */
    errFolderUnreadable: string;
    entryLabel: string;
    entryBtn: string;
    /** A folder of chunks whose imports the loader resolves at run time: webpack's, Turbopack's. */
    errNotEsmGraph: string;
    /** The file is fine, it is another format: which one, and what to do instead. */
    errWebpackStats: string;
    errViteManifest: string;
    errVisualizer: string;
}

/** A ratio as a percentage, the way both languages write it inside a sentence. */
export const pct = (ratio: number): string => `${Math.round(ratio * 100)} %`;
