/** The part of a source map Loadline reads, and what it gets reduced to. */

/** The little of a source map that matters here. `sourcesContent` is deliberately ignored. */
export interface SourceMap {
    version: number;
    sources: string[];
    mappings: string;
}

/**
 * One decoded stretch of a generated line: from this column on, the code came from this source.
 * `null` is a stretch the map claims for nobody — the bundler's own runtime, a banner.
 */
export interface Segment {
    column: number;
    source: string | null;
}

/** Bytes per source of one chunk, before knowing the metafile: what gets kept and persisted. */
export type ChunkSplit = Map<string, number>;

/**
 * The little of a file the source-map reader needs: a name and its text. A browser `File` already
 * is one, and so is a file on disk once the command wraps it. Reading the maps is the same work on
 * both sides, and this is what keeps it in one function.
 */
export interface TextFile {
    name: string;
    text: () => Promise<string>;
}
