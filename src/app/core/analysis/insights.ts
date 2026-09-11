/**
 * The eight figures that were inside the metafile and were not being read.
 *
 * They are computed in one place, after the analysis has decided what the bootstrap is and where
 * every file lands, because each of them needs both halves: the graph says what imports what, and
 * the split says who pays for it. Nothing here reads a new file.
 *
 * It is a separate module from `analysis.ts` for the reason that file gives about itself: that one
 * computes what the report has always shown, and these are additions that should be readable —
 * and removable — on their own.
 */

import { packageOf, shortName } from '../format/format.utils';
import { type ModuleEntry, type ScreenCost } from './analysis.types';
import { ownBarrels, packageBarrels } from './barrels';
import { fileCycles, folderCycles } from './cycles';
import { exclusiveByBucket, exclusiveWeigher } from './exclusive';
import {
    type GraphInsights,
    type MixedImport,
    type OwnershipSplit,
    type PaidTwice,
    type TwinScreens,
} from './insights.types';
import { type Metafile } from './metafile.types';
import { buildModuleGraph } from './module-graph';

/** From how many re-exports a file of the project is worth calling a barrel. */
const MIN_REEXPORTS = 5;
/** A package under this many files cannot be shipping "far more than anybody imports". */
const MIN_PACKAGE_FILES = 8;
/** Files per entry point from which the gap is the finding rather than the library being large. */
const MIN_BARREL_RATIO = 4;
/** How much two screens have to share before they are the same screen twice. */
const TWIN_OVERLAP = 0.9;

export interface InsightsInput {
    inputs: Metafile['inputs'];
    /** Source files the application starts at. */
    roots: readonly string[];
    isOwn: (path: string) => boolean;
    /** Every file that ships bytes, with where it lands: the analysis's own index. */
    modules: readonly ModuleEntry[];
    /** Output paths of the bootstrap chunks. */
    boot: ReadonlySet<string>;
    /** What one source file weighs inside the bootstrap chunks, raw minified. */
    bootBytesOf: (path: string) => number;
    screens: readonly ScreenCost[];
    /** Chunk file → size in the unit of the report, for the twin-screen figures. */
    sizeOf: (chunk: string) => number;
    /** Bucket of the bootstrap breakdown → the source files behind it. */
    filesByBucket: ReadonlyMap<string, string[]>;
    /** Package → own files importing it, as `importGraphOf` computed it. */
    packageImporters: ReadonlyMap<string, Set<string>>;
}

/**
 * A file imported both ways at once.
 *
 * This is the classic silent failure of code splitting and no analyser shows it, because every one
 * of them looks at chunks and this lives on the edges. Someone writes `const Chart = await
 * import('./chart')` and a type import three files away already pulled the same module in
 * statically: the `import()` defers nothing, the module travels on the first load, and the person
 * who wrote it believes otherwise.
 */
const mixedImports = (
    inputs: Metafile['inputs'],
    byPath: ReadonlyMap<string, ModuleEntry>,
    boot: ReadonlySet<string>,
): MixedImport[] => {
    const statics = new Map<string, string[]>();
    const dynamics = new Map<string, string[]>();

    const record = (from: string, edge: { path: string; kind: string; external?: boolean }): void => {
        if (edge.external) {
            return;
        }
        const into = edge.kind === 'dynamic-import' ? dynamics : statics;
        into.set(edge.path, [...(into.get(edge.path) ?? []), from]);
    };

    for (const [from, data] of Object.entries(inputs)) {
        const imports = data.imports ?? [];
        for (const edge of imports) {
            record(from, edge);
        }
    }

    const found: MixedImport[] = [];
    for (const [path, dynamicImporters] of dynamics) {
        const staticImporters = statics.get(path);
        const entry = byPath.get(path);
        if (!staticImporters || !entry) {
            continue;
        }

        found.push({
            path,
            label: shortName(path),
            bytes: entry.bytes,
            staticImporters,
            dynamicImporters,
            inBoot: entry.places.some(place => boot.has(place.chunk)),
        });
    }

    return found.toSorted((a, b) => Number(b.inBoot) - Number(a.inBoot) || b.bytes - a.bytes);
};

/**
 * The same file copied into several chunks.
 *
 * Different from a package shipped in two versions, which the report already names: there the two
 * copies are different code. Here they are byte for byte the same module, and the split put it in
 * two places because two sets of screens reach it and neither is a subset of the other. It is
 * money thrown away that appears in no list, and the fix is configuration rather than code.
 */
const paidTwice = (modules: readonly ModuleEntry[]): PaidTwice[] =>
    modules
        .filter(entry => entry.places.length > 1)
        .map((entry): PaidTwice => ({
            path: entry.path,
            label: entry.label,
            copies: entry.places.length,
            // Everything but the largest copy: one of them was going to be downloaded anyway.
            wasted: entry.bytes - (entry.places[0]?.bytes ?? 0),
            chunks: entry.places.map(place => place.chunkName),
        }))
        .filter(entry => entry.wasted > 0)
        .toSorted((a, b) => b.wasted - a.wasted);

/**
 * Screens that load almost the same code.
 *
 * Either they are missing a shared chunk — the same modules copied into two of them — or they are
 * one screen written twice. Both answers are something to do, and neither is visible in a table
 * sorted by weight, where the two rows simply look alike.
 */
const twinScreens = (screens: readonly ScreenCost[], sizeOf: (chunk: string) => number): TwinScreens[] => {
    const sets = screens.map(screen => ({
        screen,
        chunks: new Set([...screen.ownChunks, ...screen.sharedChunks]),
    }));
    type Pair = (typeof sets)[number];

    /** The two of them compared. `null` when they are not alike enough to be worth a line. */
    const pairOf = (left: Pair, right: Pair): TwinScreens | null => {
        const union = new Set([...left.chunks, ...right.chunks]);
        const common = [...left.chunks].filter(chunk => right.chunks.has(chunk));
        const overlap = union.size === 0 ? 0 : common.length / union.size;
        if (overlap < TWIN_OVERLAP) {
            return null;
        }

        const apart = [...union].filter(chunk => !left.chunks.has(chunk) || !right.chunks.has(chunk));
        return {
            a: left.screen.source,
            b: right.screen.source,
            labelA: left.screen.label,
            labelB: right.screen.label,
            overlap,
            sharedBytes: common.reduce((sum, chunk) => sum + sizeOf(chunk), 0),
            apartBytes: apart.reduce((sum, chunk) => sum + sizeOf(chunk), 0),
        };
    };

    return sets
        .flatMap((left, index) => sets.slice(index + 1).map(right => pairOf(left, right)))
        .filter(pair => pair !== null)
        .toSorted((a, b) => b.overlap - a.overlap || b.sharedBytes - a.sharedBytes);
};

/**
 * How much of the first load is code nobody here wrote.
 *
 * It changes the conversation. "Optimise my code" and "review my dependencies" are different
 * weeks of work, and the second one is usually where the kilobytes are; a report that does not
 * say which of the two it is leaves the reader to guess.
 */
const ownershipOf = (
    filesByBucket: ReadonlyMap<string, string[]>,
    bootBytesOf: (path: string) => number,
): OwnershipSplit => {
    let theirs = 0;
    let yours = 0;
    const packages: { name: string; bytes: number }[] = [];

    for (const [bucket, files] of filesByBucket) {
        const bytes = files.reduce((sum, file) => sum + bootBytesOf(file), 0);
        if (bytes <= 0) {
            continue;
        }

        // A bucket is a package when its files come from `node_modules`; the name alone cannot say,
        // since a project folder may be called the same thing as a package.
        if (files.some(file => packageOf(file) !== null)) {
            theirs += bytes;
            packages.push({ name: bucket, bytes });
        } else {
            yours += bytes;
        }
    }

    const total = theirs + yours;
    return {
        theirs,
        yours,
        theirsRatio: total > 0 ? theirs / total : 0,
        topPackages: packages.toSorted((a, b) => b.bytes - a.bytes),
    };
};

export const graphInsightsOf = (input: InsightsInput): GraphInsights => {
    const graph = buildModuleGraph(input.inputs);
    const byPath = new Map(input.modules.map(entry => [entry.path, entry]));
    const shippedBytesOf = (path: string): number => byPath.get(path)?.bytes ?? 0;
    const inBoot = (path: string): boolean =>
        byPath.get(path)?.places.some(place => input.boot.has(place.chunk)) ?? false;

    const weigher = exclusiveWeigher(graph, input.roots, input.bootBytesOf);
    const label = (path: string): string => shortName(path);
    const cycleInput = { graph, isOwn: input.isOwn, shippedBytesOf, inBoot, label };
    const twiceOver = paidTwice(input.modules);

    return {
        exclusive: exclusiveByBucket(weigher, input.filesByBucket),
        exclusiveOf: weigher.of,
        bootTotal: weigher.total,
        filesByBucket: input.filesByBucket,
        mixedImports: mixedImports(input.inputs, byPath, input.boot),
        ownBarrels: ownBarrels({
            graph,
            inputs: input.inputs,
            isOwn: input.isOwn,
            shippedBytesOf,
            inBoot,
            exclusiveOf: weigher.of,
            minReexports: MIN_REEXPORTS,
            label: path => path,
        }),
        packageBarrels: packageBarrels({
            graph,
            shippedBytesOf,
            inBoot,
            importersOf: pkg => [...(input.packageImporters.get(pkg) ?? [])],
            minFiles: MIN_PACKAGE_FILES,
            minRatio: MIN_BARREL_RATIO,
        }),
        cycles: fileCycles(cycleInput),
        folderCycles: folderCycles(cycleInput),
        paidTwice: twiceOver,
        paidTwiceBytes: twiceOver.reduce((sum, entry) => sum + entry.wasted, 0),
        twins: twinScreens(input.screens, input.sizeOf),
        ownership: ownershipOf(input.filesByBucket, input.bootBytesOf),
    };
};
