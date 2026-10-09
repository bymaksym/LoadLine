/** The shape of a saved session in IndexedDB. */

import { type ScreenMark } from '../analysis/analysis.types';
import { type AssetReport } from '../assets/assets.types';
import { type Snapshot } from '../baseline/baseline.types';
import { type RouteRef } from '../build-text/route-table';
import { type PageOrigins } from '../findings/folder/page';
import { type PageCss } from '../intake/dist-files';
import { type MeasuredEntry, type MeasuredPage } from '../measurement/measurement.types';

export interface StoredSession {
    /** ISO date of the save, to show "from when" before restoring. */
    date: string;
    statsName: string;
    statsText: string;
    /** Compressed size per file name, when the build folder had been loaded. */
    gzip: [string, number][] | null;
    /** Real brotli size per file name, when the folder brought the pre-compressed files. */
    brotli?: [string, number][] | null;
    baseline: Snapshot | null;
    /**
     * Lazy entries reclassified by hand. Keyed by source path, so unlike the sizes it survives a
     * new build of the same project. Optional: a session saved before the marks existed has none.
     */
    marks?: [string, ScreenMark][] | null;
    context: { name: string; text: string }[];
    /**
     * Bytes per source file inside each chunk, read from the source maps of the folder. Optional:
     * a session saved before source maps were read simply does not have it.
     */
    maps?: [string, [string, number][]][] | null;
    /**
     * Chunk names `index.html` announced, when the folder carried that page. `null` or absent means
     * it was never read, which is why the round trips of the first load are not shown.
     */
    announced?: string[] | null;
    /**
     * The hosts that same page fetches from, when they are not its own. Optional for the same
     * reason as everything else here: a session saved before origins were read still restores.
     */
    pageOrigins?: PageOrigins | null;
    /**
     * The render-blocking stylesheets of that page with their weight. Absent in a session saved
     * before this was read, which is why it is optional: an old session still restores, without it.
     */
    pageCss?: PageCss | null;
    /**
     * What the folder holds besides the code: pictures, fonts, `data:` URIs, names without a hash.
     * Kept since 08/10/2026: before it, a restored session came back with its compressed figures and
     * without the signals read from those files — four signals before the reload, one after, and
     * nothing on the page saying three had stayed behind. The text of the chunks, which the scan for
     * secrets and leftovers reads, is still not kept: it is the whole build, megabytes of it.
     */
    assets?: AssetReport | null;
    /**
     * The browser measurement that was pasted, with the screen it was attributed to. Optional: a
     * session saved before there was a Measured tab simply does not have it.
     */
    measurement?: {
        /**
         * The entries as they were read, so the timings and the sizes survive a reload too. A
         * session saved before the snippet asked for timings kept a `[file, bytes]` pair instead.
         */
        entries: (MeasuredEntry | [file: string, bytes: number | null])[];
        url: string | null;
        pick: string | null;
        /** What the page said about itself. Absent in a session saved before the snippet asked. */
        page?: MeasuredPage | null;
    } | null;
    /**
     * The graph was read from the compiled folder rather than from a `stats.json`. `statsText` then
     * holds what the folder said, which is why it can be restored the same way.
     */
    derived?: boolean;
    /**
     * Chunks the loader asks for in the same round trip as a lazy one. Only a folder read from a
     * Vite build has any: it comes from the lists that build bakes into its dynamic imports.
     */
    parallel?: [string, string[]][] | null;
    /** The route table read out of the code, chunk by chunk. Absent from sessions saved before it. */
    routes?: [string, RouteRef[]][] | null;
}
