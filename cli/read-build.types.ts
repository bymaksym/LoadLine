/** Everything the command reads off the disk before any analysis happens. */

import { type Metafile } from '../src/app/core/analysis/metafile.types';
import { type ChunkSplit } from '../src/app/core/analysis/sourcemap.types';
import { type AssetReport } from '../src/app/core/assets/assets.types';
import { type Snapshot } from '../src/app/core/baseline/baseline.types';
import { type LoadlineConfig } from '../src/app/core/config/loadline-config.types';
import { type Criteria } from '../src/app/core/criteria/criteria.types';
import { type Advisory, type LockedPackage } from '../src/app/core/deps/deps.types';
import { type PageOrigins } from '../src/app/core/findings/page';
import { type BundleGraph } from '../src/app/core/intake/bundle-graph.types';
import { type PageCss } from '../src/app/core/intake/dist-files';
import { type ProjectContext } from '../src/app/core/project/project-context.types';

/** What a build folder yields. All three are optional: the `stats.json` alone already works. */
export interface DistSizes {
    /** Compressed sizes by file name. `null` when no folder was given. */
    gzip: Map<string, number> | null;
    /** Sizes of the pre-compressed `.br` files. `null` when the folder carries none. */
    brotli: Map<string, number> | null;
    /** Bytes per source file of each chunk, from the `.js.map` files. `null` when there are none. */
    splits: Map<string, ChunkSplit> | null;
    /**
     * Chunk names `index.html` tells the browser to fetch before it has parsed anything. `null`
     * when no folder was given or it carries no such page: without it the round trips of the first
     * load cannot be told apart from the graph.
     */
    announced: Set<string> | null;
    /**
     * The import graph read out of the chunks, when the folder itself is what is being analysed.
     * `null` whenever a `stats.json` said it first, which is a better source when it exists.
     */
    graph: BundleGraph | null;
    /**
     * The stylesheets `index.html` asks for, which the graph knows nothing about and the browser
     * will not paint without. `null` when no folder or no page was given.
     */
    pageCss: PageCss | null;
    /**
     * Everything in the folder that is not JavaScript: the fonts, the pictures, what nothing names,
     * and the pictures hiding inside the chunks as `data:` URIs. `null` when no folder was read.
     */
    assets?: AssetReport | null;
    /** The URLs `index.html` writes, query and all: `app.js?v=3` only exists in the full string. */
    hrefs?: string[];
    /**
     * The hosts that page fetches from, when they are not its own. `null` when no page was read:
     * a build with no `index.html` knows nothing about its origins, and that is not the same as
     * knowing there are none.
     */
    pageOrigins?: PageOrigins | null;
    /**
     * The text of every chunk and stylesheet, for the reading that is about what the build *says*
     * rather than what it weighs: keys left in it, development leftovers, licence headers.
     */
    texts?: ReadonlyMap<string, string>;
    /** The `.js.map` files with their text, for what a deployed source map gives away. */
    maps?: { name: string; text: string }[];
}

/**
 * Everything the analysis needs, with the extras optional.
 *
 * The half that is not optional is the build itself. Everything a folder or a dropped file merely
 * *may* bring — the compressed sizes, the page, the assets, the lock file, `loadline.json` — is
 * optional, because the tool's whole shape is that a bare `stats.json` already produces a report
 * and each extra file adds a section to it.
 */
export interface BuildInput extends DistSizes {
    meta: Metafile;
    /** Chunks the loader asks for in the same round trip as a lazy one. Only Vite writes these. */
    parallel: ReadonlyMap<string, readonly string[]> | null;
    /** The name of the `stats.json`, which is how the report says which build it is about. */
    statsName: string;
    baseline: Snapshot | null;
    context: ProjectContext;
    /** Thresholds read from --criteria, replacing the recommended ones one key at a time. */
    criteria: Partial<Criteria> | null;
    /** `loadline.json`, when one was passed or found next to the working directory. */
    config?: LoadlineConfig | null;
    configProblems?: string[];
    /** Where it came from, so the lead line can say which file the thresholds are from. */
    configName?: string | null;
    /** The lock file, when one was passed. `null` when none was, which is not "no packages". */
    lock?: LockedPackage[] | null;
    /** The audit report, same rule: `null` means nobody ran one, not that there is nothing. */
    advisories?: Advisory[] | null;
}
