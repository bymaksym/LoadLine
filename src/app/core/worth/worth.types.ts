/**
 * What a shared chunk costs and where that cost comes from: the two things the report can defend
 * with what it already knows, and the figures behind each one.
 *
 * What it deliberately does **not** decide is whether the fix is easy or whether it pays off. Both
 * depend on the team, the deadline and how well they know the library — none of which is in a
 * metafile. Saying "no easy fix" invites the reader to prove the tool wrong, and they often can.
 * Naming the origin instead ("no group reaches half the chunk") is checkable and survives the
 * argument.
 */

/**
 * A rank, used for ordering and tinting only. The reason shown to the reader is the `origin`.
 *
 * `none`: the cost is smaller than what moves between any two builds.
 * `try`: one group dominates the chunk and it has an address, named in `top`.
 * `hard`: no group dominates it, or the one that does is imported from all over.
 */
export type WorthLevel = 'none' | 'try' | 'hard';

/** Which of the four origins applies, decided from what the chunk carries. */
export type WorthOrigin = 'small' | 'ownCode' | 'package' | 'common';

/** What dominates a chunk: one npm package, or one folder of the project. */
export interface WorthTop {
    label: string;
    /** Fraction of the chunk's bytes, 0-1. */
    share: number;
    isPackage: boolean;
}

export interface Worth {
    level: WorthLevel;
    origin: WorthOrigin;
    /**
     * What the chunk adds to a **typical visit**: its size weighted by how many screens load it.
     * The figure that ranks by what is paid — 58 kB loaded by 44 of 47 screens costs ten times what
     * same 58 kB loaded by 5 of them costs, and the size column alone hides that.
     */
    typicalCost: number;
    /** `typicalCost` as a fraction of the effective bootstrap, 0-1. `0` when that is unknown. */
    shareOfBoot: number;
    /** What the typical visit would weigh with this chunk gone: the most removing it can save. */
    withoutIt: number;
    top: WorthTop | null;
    /** Own files importing `top` directly, when it is a package. `null` otherwise. */
    importers: number | null;
}

/** What `worthOfShared` needs. Kept explicit so the rule can be tested without an analysis. */
export interface WorthInput {
    /** Size of the chunk, in the unit of the report. */
    bytes: number;
    /** Fraction of screens loading it, 0-1. */
    ratio: number;
    /** Its packages and project folders with their bytes, heaviest first or not. */
    groups: { label: string; bytes: number; isPackage: boolean }[];
    /** Own files importing a package directly. */
    importersOf: (pkg: string) => number;
    /** What a typical visit downloads today, to put the cost in proportion. */
    effectiveBoot: number;
    /** Below this the gain falls inside the variation between two builds: the criterion the signal uses. */
    minBytes: number;
    /** More own importers than this and the package is infrastructure, not a decision. */
    maxImporters: number;
    /** How much of the chunk one package or folder has to be for the chunk to be "that thing". */
    dominantRatio: number;
}
