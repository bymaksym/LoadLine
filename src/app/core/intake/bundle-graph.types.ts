/** What the folder reader takes and what it gives back. */

import { type Metafile } from '../analysis/metafile.types';
import { type ChunkSplit } from '../analysis/sourcemap.types';

/**
 * One file of the build folder.
 *
 * The path is relative to the folder itself (`assets/main-A1B2C3.js`), and it has to be, because
 * `./sibling.js` written inside a chunk can only be resolved against the folder the chunk is in. A
 * browser `File` picked from a directory carries it in `webkitRelativePath`; the command builds it
 * from the path it walked.
 */
export interface BundleFile {
    path: string;
    bytes: number;
    text: () => Promise<string>;
}

export interface BundleGraph {
    /** The same shape a `stats.json` gives, so nothing downstream knows where it came from. */
    meta: Metafile;
    /**
     * Chunks the loader asks for in the same round trip as the key, read from the lists Vite bakes
     * into every dynamic import. Empty for a build that has none, which is every esbuild build.
     */
    parallel: Map<string, string[]>;
    /**
     * Bytes per source inside each chunk, keyed by generated file name: the same map the folder
     * reader already produces on its own. Returned here so a folder without a `stats.json` reads
     * its source maps once instead of twice.
     */
    splits: Map<string, ChunkSplit>;
}
