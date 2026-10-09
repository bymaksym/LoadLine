/**
 * The figures that were already inside the metafile and were not being read.
 *
 * Every one of them comes out of the same import graph the rest of the report is built on: no new
 * file is asked for, nothing goes out to the network. They live apart from `analysis.ts` because
 * that file computes what the report has always shown, and because each of these answers a
 * question that used to be answered by opening another tab.
 */

/** A file that is imported statically **and** dynamically: the `import()` defers nothing. */
export interface MixedImport {
    /** The file both kinds of import point at. */
    path: string;
    label: string;
    /** Its weight where it actually lands, raw minified bytes inside the chunk. */
    bytes: number;
    /** Files importing it with a plain `import ... from`, which is what keeps it eager. */
    staticImporters: string[];
    /** Files importing it with `import()`, believing they defer it. */
    dynamicImporters: string[];
    /** Whether it ends up in the bootstrap, which is when the mistake costs everybody. */
    inBoot: boolean;
}

/**
 * A file of the project that only re-exports: `index.ts` with N lines and no code of its own.
 *
 * What makes it worth a line is not the file, it is what comes in behind it. Somebody imports
 * `@app/shared` for one function and forty files arrive, because the barrel names all forty and
 * nothing downstream can tell which one was wanted.
 */
export interface Barrel {
    path: string;
    label: string;
    /** How many files it re-exports directly. */
    reexports: number;
    /** Files reachable through it, itself included. */
    pulls: number;
    /** What those files weigh where they land, raw minified bytes. */
    bytes: number;
    /**
     * What would stop being downloaded on the first load if nothing imported this file: the part
     * of `bytes` that has no other way in. The rest arrives anyway through somebody else.
     */
    exclusive: number;
    /** Files importing the barrel. */
    importers: string[];
    inBoot: boolean;
}

/**
 * A package that ships far more files than the number of its own files anybody imports from
 * outside it. `lodash` entire, when what was written was `import { debounce } from 'lodash'`.
 */
export interface PackageBarrel {
    name: string;
    /** Files of the package inside the bundle. */
    files: number;
    /** Files of it that something outside the package imports: its real entry points. */
    entryPoints: number;
    bytes: number;
    /** What the entry points themselves weigh: the floor of what importing it can cost. */
    entryBytes: number;
    inBoot: boolean;
    /** Own files importing it, for the sentence that says where to edit. */
    importers: string[];
}

/** A cycle in the import graph, as the shortest loop found through each of its members. */
export interface Cycle {
    /** The steps of the loop, first repeated at the end so it reads as a circle. */
    steps: string[];
    /** How many files take part. For a folder cycle, how many folders. */
    size: number;
    /** Total weight of the files taking part, raw minified bytes. */
    bytes: number;
    inBoot: boolean;
}

/** One source file copied into more than one chunk, and what the extra copies cost. */
export interface PaidTwice {
    path: string;
    label: string;
    /** How many chunks hold it. */
    copies: number;
    /** Everything but the first copy: bytes downloaded by somebody who already had them. */
    wasted: number;
    /** The chunks holding it, so the fix has somewhere to start. */
    chunks: string[];
}

/** Two screens that load almost exactly the same code. */
export interface TwinScreens {
    a: string;
    b: string;
    labelA: string;
    labelB: string;
    /** How much of the two sets is common, 0 to 1. */
    overlap: number;
    /** What they have in common, in bytes of the report's unit. */
    sharedBytes: number;
    /** What only one of them loads. Small here is what makes them twins. */
    apartBytes: number;
}

/** How much of the first load is code nobody in the project wrote. */
export interface OwnershipSplit {
    /** Raw minified bytes of `node_modules` inside the bootstrap. */
    theirs: number;
    /** The same for the project's own files. */
    yours: number;
    /** `theirs / (theirs + yours)`, 0 when the bootstrap is empty. */
    theirsRatio: number;
    /** The heaviest packages, so the share is not a number with nothing behind it. */
    topPackages: { name: string; bytes: number }[];
}

export interface GraphInsights {
    /**
     * Bucket of the bootstrap breakdown → what the first load would lose if it were gone.
     *
     * This is the column the rest of the report was missing. `chart.js weighs 310 kB` orders a list
     * of actions wrongly when 240 of those kilobytes are `d3`, which three other things also pull
     * in: removing `chart.js` saves 70. Raw minified bytes, like every figure measured inside a
     * chunk.
     */
    exclusive: Map<string, number>;
    /**
     * The same question asked of any set of files at once: what the first load would lose without
     * them. Several signals name the same bytes arriving by different routes, so "what all of this
     * is worth" is one walk with every file taken out together, never a sum of separate answers.
     */
    exclusiveOf: (files: Iterable<string>) => number;
    /** What the bootstrap holds as that walk sees it: the ceiling any saving is a fraction of. */
    bootTotal: number;
    /**
     * Bucket of the bootstrap breakdown → the source files behind it. What a signal names when it
     * says which files its saving is about, so several signals can be added up without counting
     * the same bytes twice.
     */
    filesByBucket: ReadonlyMap<string, string[]>;
    mixedImports: MixedImport[];
    ownBarrels: Barrel[];
    packageBarrels: PackageBarrel[];
    /** Cycles between files, shortest first. */
    cycles: Cycle[];
    /** The same aggregated by project folder, which is where an architecture rule would be written. */
    folderCycles: Cycle[];
    paidTwice: PaidTwice[];
    /** Everything but the first copy of every duplicated file, added up. */
    paidTwiceBytes: number;
    twins: TwinScreens[];
    ownership: OwnershipSplit;
}
