/**
 * The shapes the bundle analysis produces. Split from `analysis.ts` so the file that computes them
 * reads as computation only.
 */

import { type GraphInsights } from './insights.types';

/** Where a chunk lands: everyone pays the bootstrap, several screens a shared one, one an own one. */
export type Zone = 'boot' | 'shared' | 'own';

/** Whether a chunk is downloaded with the first load or waits for somebody to import it. */
export type Delivery = 'eager' | 'lazy';

/**
 * What the first load takes once `index.html` is known: the browser asks straight away for the
 * entry script and for every `modulepreload` link, and only finds the rest by parsing.
 */
export interface Startup {
    /** Round trips the bootstrap needs. `1` means the page names every chunk of it. */
    waves: number;
    /** Bootstrap chunks `index.html` does not name: the ones that arrive a round trip late. */
    discovered: string[];
    /**
     * The same chunks grouped by the trip they arrive in. Index `0` is the second trip, because
     * nothing in the first one is late by definition.
     *
     * Depth and width are different problems with different fixes and the flat list above hides
     * which one this build has. Eight chunks all found on the second trip cost **one** extra round
     * trip and naming any seven of them saves nothing; four chunks stacked one behind another cost
     * three, and each one named removes a trip. The advice is only honest with the grouping in
     * hand, and the count of tags it ends up asking for is itself a cost.
     */
    byWave: string[][];
    /**
     * How many chunks share the busiest trip. The other half of `waves`, and the half that decides
     * whether the answer is "name a couple of files" or "there is nothing to name".
     */
    width: number;
    /**
     * One deepest chain of static imports, in the order the browser discovers it.
     *
     * The critical preload set: the only chunks where naming a file in the page removes a round
     * trip. Everything late that is **not** in here shares a trip that is already being paid, so a
     * tag for it buys nothing and competes for bandwidth with the stylesheet that blocks the paint.
     */
    critical: string[];
}

/**
 * A lazy entry the screens table has no row for, as the report lists it. Leaving one out silently
 * is what makes a screen count impossible to check, so both kinds are named and weighed.
 */
export interface NotScreen {
    /** Source file the entry originates from. Doubles as its identifier, and as the mark's key. */
    source: string;
    label: string;
    bytes: number;
}

/**
 * A lazy entry reclassified by hand. The rules that tell screens from pieces of a screen read file
 * names for half of the job, and no set of names fits every project: a mark is the way out that
 * does not need Loadline to learn one more convention.
 */
export type ScreenMark = 'screen' | 'block';

/** Where the weight of each file inside a chunk comes from. */
export type SplitSource = 'metafile' | 'sourcemap';

/**
 * The two measurements of the same chunks, side by side: what the files weigh, and what the
 * per-file breakdown inside them adds up to.
 *
 * They are supposed to be the same number. When they are not, every figure this report measures
 * inside a chunk is off by that ratio while the weight printed next to it is exact — so the ratio
 * is the report's own margin of error, and it is knowable rather than something to hope about.
 */
export interface SplitDrift {
    /** What those chunks weigh, from the build itself. */
    file: number;
    /** What their per-file weights add up to. */
    measured: number;
    /** `measured / file`. `1` is agreement; `1.25` means the breakdown reads a quarter high. */
    ratio: number;
    /** How many chunks the two figures were compared over. */
    chunks: number;
}

/** A chunk of the bundle with its resolved size (raw or compressed, whichever is available). */
export interface ChunkInfo {
    file: string;
    name: string;
    bytes: number;
    /** How many screens it appears in. 0 = bootstrap. */
    screens: number;
    mainContent: string;
}

export interface ScreenCost {
    label: string;
    /** Source file the screen originates from. Doubles as its identifier. */
    source: string;
    files: number;
    boot: number;
    shared: number;
    own: number;
    total: number;
    ownChunks: string[];
    sharedChunks: string[];
    /**
     * Round trips the screen's chunks take to all be there, counted from the moment the router
     * asks for it. `1` is one request; `3` means two of them wait for a previous one to arrive and
     * be parsed. The bytes are the same either way, which is why this is a separate figure.
     */
    waves: number;
    /**
     * How many chunks share the busiest of those trips.
     *
     * Depth and width are opposite problems and `waves` reports them as one. Three trips where the
     * busiest carries a single file is a chain: every level of it is a wait that a flatter import
     * would remove. Three trips where the busiest carries nine files is a fan-out: the nine cost
     * one trip between them and there is nothing to shorten.
     */
    width: number;
    /** Which round trip each of the screen's lazy chunks arrives in. Keyed by output path. */
    chunkWaves: Map<string, number>;
}

/** One entry of the breakdown: an npm package or a folder of the project. */
export interface BucketSlice {
    name: string;
    bytes: number;
    isProjectCode: boolean;
}

/** Node of the bundle tree: chunk → package or folder → file. */
export interface TreeNode {
    id: string;
    label: string;
    bytes: number;
    kind: 'chunk' | 'package' | 'folder' | 'file';
    /**
     * Chunks only: the file's size on disk, uncompressed. `bytes` is the figure of the report,
     * which is the compressed one when the build folder was loaded; the breakdown inside the chunk
     * can only ever be raw, so the two units have to be shown side by side to be comparable.
     */
    rawBytes?: number;
    /** Chunks only: whether it is bootstrap and how many screens load it. */
    zone?: Zone;
    screens?: number;
    children: TreeNode[];
}

/** An npm package shipped as CommonJS: esbuild cannot tree-shake it, every file imported enters whole. */
export interface CommonJsPackage {
    name: string;
    /** Raw bytes of its CommonJS files inside the bundle. */
    bytes: number;
    files: number;
    /** Where it lands. Bootstrap is paid by everyone; a lazy chunk by the screens loading it. */
    zone: Zone;
    screens: number;
    /** Own files importing it directly. Empty when another package brings it in. */
    importers: string[];
    /** Packages importing it, for when no own file does. */
    viaPackages: string[];
}

/** One place a file of the bundle lands: which chunk, how much of it is there and who pays for it. */
export interface ModulePlace {
    chunk: string;
    chunkName: string;
    bytes: number;
    zone: Zone;
    /** Screens loading the chunk. 0 for the bootstrap: everybody loads it. */
    screens: number;
}

/**
 * A file of the bundle as the search sees it. One entry per input of the metafile that ends up
 * shipping bytes, with every chunk it lands in.
 */
export interface ModuleEntry {
    path: string;
    /** The path without the `node_modules` prefixes: how the file is named when talking about it. */
    label: string;
    pkg: string | null;
    /** Total across every chunk. A file in two chunks is paid twice, and this says so. */
    bytes: number;
    places: ModulePlace[];
}

/** One installed copy of a package that ships more than once. */
export interface DuplicateCopy {
    /**
     * Where it is installed: everything before the last `node_modules/` of its files' paths. `''`
     * is the copy at the top level. This is what tells one copy from another in every layout, and
     * it doubles as a stable key for a list.
     */
    at: string;
    /** Its version, when the path carries it: pnpm writes it, npm and yarn do not. */
    version: string | null;
    /** The package this copy is nested inside, when it is not the top-level one. */
    under: string | null;
    bytes: number;
    files: number;
    /** The worst zone this copy reaches: `boot` is the one that costs everybody. */
    zone: Zone;
    screens: number;
    /**
     * Shortest chain of imports from the entry point to this copy, as source paths. It is what
     * tells the two copies apart: which dependency brings each one in.
     */
    chain: string[] | null;
    /** Own files importing this copy directly. */
    importers: string[];
    /** Packages importing it, for when no own file does. */
    viaPackages: string[];
}

export interface DuplicatePackage {
    name: string;
    copies: DuplicateCopy[];
    bytes: number;
    /** One of the copies is in the bootstrap: that copy is paid by every load of the app. */
    inBoot: boolean;
}

export interface Analysis {
    bootBytes: number;
    /** Bootstrap in bytes on disk, whatever is being shown: what Angular's budgets measure. */
    bootRawBytes: number;
    /**
     * Outputs of a server build that were left out. A metafile of an app with server-side rendering
     * carries both sides; nobody downloads the server one. `0` when there was no server side.
     */
    serverOutputs: number;
    /**
     * Lazy entries that are a piece of a screen rather than a screen: an Angular `@defer` block, a
     * `lazy()` inside a component. They are not counted as screens, and they are listed so that
     * leaving them out is visible rather than silent.
     */
    deferredBlocks: NotScreen[];
    /**
     * Lazy entries that only group routes: they hold a list of dynamic imports and no code of their
     * own. What they load are the screens; they are not one. Listed for the same reason as the
     * blocks, and because a wrong one has to be correctable by hand.
     */
    routeGroupers: NotScreen[];
    /**
     * Lazy entries that are data rather than code anybody navigates to: a language file, a table of
     * countries. They are listed for the same reason as the two above — an entry silently left out
     * makes the screen count impossible to check — and apart from them because the answer to one is
     * "move it out of the bundle", not "this is a screen".
     */
    lazyData: NotScreen[];
    /**
     * JavaScript in the build that nothing reachable from the entry point imports, by either kind
     * of import: a service worker, a chunk whose path is built at run time, or what a previous
     * build left in a folder nobody cleans. None of it is in any figure of the report, and on a
     * site that imports a chunk per page it can be most of the build — which the report used to
     * describe as if it were the whole of it.
     */
    unreachable: { file: string; bytes: number }[];
    /** Which entries were reclassified by hand, so the report can say it is not showing the rules' answer. */
    marks: ReadonlyMap<string, ScreenMark>;
    bootFiles: number;
    /** The chunks everybody downloads. Needed to tell the bootstrap apart in a browser measurement. */
    bootChunks: string[];
    /**
     * What the first load costs in round trips, from what `index.html` announces. `null` when that
     * page was not loaded: the import graph alone cannot tell a preloaded chunk from one the
     * browser only finds by parsing, and guessing would be worse than saying nothing.
     */
    startup: Startup | null;
    /** Every JavaScript chunk of the build, to match what the browser downloaded against it. */
    allChunks: string[];
    bootBuckets: BucketSlice[];
    bootBucketTotal: number;
    screens: ScreenCost[];
    sharedChunks: ChunkInfo[];
    /** Lazy chunk → source files of the screens that load it. The other side of `screens`. */
    chunkScreens: Map<string, string[]>;
    tree: TreeNode[];
    /**
     * Chunk → the chunks whose own text names it, by either kind of import.
     *
     * These are the edges the hash cascade travels along. A bundler writes the target's file name
     * — hash included — as a string literal inside the chunk that imports it, so when the target's
     * content changes, its name changes, and every chunk carrying that name changes too although
     * not a line of their source moved. Dynamic imports count for the same reason static ones do:
     * `import('./screen-A1B2.js')` is that name sitting in the parent's bytes, and Vite's
     * `__vite__mapDeps` is a whole array of them in one file.
     */
    chunkImporters: Map<string, string[]>;
    /** For the signals: who imports each package, from project code. */
    packageImporters: Map<string, Set<string>>;
    /** The same for project files: which of them import each one directly. */
    ownImporters: Map<string, Set<string>>;
    /**
     * Bootstrap package → shortest chain of static imports from the main entry to it, as source
     * paths. Answers "which import puts this package in the bootstrap". Missing when the package
     * is not statically reachable from the entry (a worker, an odd alias).
     */
    bootChains: Map<string, string[]>;
    /** Screen source → own files that load it with a dynamic import: its routes file(s). */
    screenLoaders: Map<string, string[]>;
    commonJs: CommonJsPackage[];
    duplicates: DuplicatePackage[];
    /** Every own file inside the bootstrap, heaviest first. Which of them is large is a criterion. */
    ownFilesInBoot: { path: string; bytes: number }[];
    /** Every file that ships bytes, with where it lands. What the search looks through. */
    modules: ModuleEntry[];
    /**
     * Shortest chain of imports from the entry point to any file, lazy boundaries included, as
     * source paths. `null` when the file is not reachable from the entry.
     */
    chainTo: (path: string) => string[] | null;
    /** Where the weight of each file inside a chunk was measured: the metafile or a source map. */
    splitSource: SplitSource;
    /**
     * How far that breakdown is from the chunks it describes. `null` when there was nothing to
     * compare: every chunk measured from a source map, or a metafile that breaks none of them down.
     */
    splitDrift: SplitDrift | null;
    chunkOf: (file: string) => ChunkInfo | undefined;
    /**
     * The figures that come out of the same graph and used to go unread: exclusive weight, barrels,
     * cycles, mixed imports, bytes paid twice, twin screens, and how much of the first load is
     * somebody else's code.
     *
     * A function rather than a field because it costs a walk of the graph per bootstrap bucket, and
     * the analysis runs twice on every report while only one of the two runs is ever asked. The
     * result is memoised: calling it a second time is free.
     */
    insights: () => GraphInsights;
}
