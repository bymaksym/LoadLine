/**
 * What an update costs, as opposed to a first visit.
 *
 * Nobody looks at this and it is half the real cost: almost every visit to a running application is
 * somebody who already had yesterday's version. Changing one line in `app.component.ts` and
 * invalidating 1.2 MB of vendor code is a configuration mistake that shows up in no report anywhere,
 * and it is one of the expensive ones.
 */

/** One file of the new build, compared against what the previous one held. */
export type FileChange = 'same' | 'changed' | 'added' | 'removed';

export interface ChangedFile {
    name: string;
    change: FileChange;
    /** Bytes in the new build. For a removed file, what it used to weigh. */
    bytes: number;
}

/**
 * A chunk whose hash moves on every deploy although hardly any of its content does.
 *
 * Almost always because it mixes `node_modules` with the project's own code: the dependencies do
 * not change for months, the project's code changes every day, and one file holding both is
 * re-downloaded every day by everyone.
 */
export interface UnstableChunk {
    name: string;
    bytes: number;
    /** Fraction of the chunk that is `node_modules`, 0 to 1. */
    vendorRatio: number;
    /** Bytes of it that are somebody else's code and did not have to be invalidated. */
    vendorBytes: number;
    /** Whether it is part of the bootstrap, which is when everybody pays for the invalidation. */
    inBoot: boolean;
}

/** A file whose name cannot be cached for long: no content hash, or a version in the query. */
export interface UnhashableFile {
    name: string;
    /**
     * Where it sits in the build folder. What the report names it by: Nuxt writes one
     * `_payload.json` per route, and three lines all reading `_payload.json` name nothing at all.
     * The same fact as the file name when there is no folder to have a path in.
     */
    path: string;
    bytes: number;
    /** `query` when the version is in a `?v=`, `none` when the name simply carries no hash. */
    reason: 'query' | 'none';
    /** Whether the page asks for it, which is what makes the revalidation part of the first load. */
    inPage: boolean;
}

/**
 * The measured cascade: which of the files that changed name did so because their own content
 * moved, and which only because a name written inside them moved.
 *
 * This is the half that separates a diagnosis from an accusation. "87 % of the build was
 * re-downloaded" is true and unusable on its own; "87 %, and three files account for the edit —
 * the rest is the hash cascade" is a different sentence about the same deploy.
 *
 * It comes from the two builds' file names and the current build's import edges, so neither half
 * is modelled: the names say what changed, the edges say what could carry a change. Both figures
 * are bounds and are shown as such. A chunk that was edited **and** sits downstream of another
 * edited chunk is indistinguishable from a pure cascade victim here and is counted as `carried`,
 * so `roots` is a floor on what really changed and `carried` a ceiling on what the cascade explains.
 */
export interface MeasuredCascade {
    /** Changed files naming no other changed file: an edit has to have landed in each of these. */
    roots: string[];
    /** Their bytes. The counterfactual — what this deploy would have cost with no cascade at all. */
    rootBytes: number;
    /** Changed files naming at least one other changed file. */
    carried: string[];
    /** Their bytes. `bytes` of the update minus this is `rootBytes` plus whatever arrived new. */
    carriedBytes: number;
}

export interface UpdateCost {
    /** Bytes somebody who had the previous build has to download again. */
    bytes: number;
    /** What a first-time visitor downloads, for the comparison that gives the figure its meaning. */
    fresh: number;
    /** `bytes / fresh`, 0 when there is no new build to speak of. */
    ratio: number;
    changed: ChangedFile[];
    added: ChangedFile[];
    removed: ChangedFile[];
    /** Files whose name is identical in both builds: the ones a browser does not ask for again. */
    reused: number;
    /**
     * The split of `changed` into the edit and its cascade. `null` when the import edges were not
     * available, which is the one case where saying nothing beats guessing at the shape.
     */
    cascade: MeasuredCascade | null;
}

export interface CachingReport {
    /** `null` when no previous build was given: there is nothing to diff against. */
    update: UpdateCost | null;
    unstable: UnstableChunk[];
    unhashable: UnhashableFile[];
}
