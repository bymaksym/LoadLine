/**
 * The caching figures, assembled from what the report already holds.
 *
 * It is a module of its own so that `caching.ts` stays rules and this stays plumbing: the page and
 * the command both need exactly this assembly, and two copies of it would be two places for the
 * definition of "vendor" to drift apart.
 */

import { type Analysis } from '../analysis/analysis.types';
import { type AssetReport } from '../assets/assets.types';
import { type Snapshot } from '../baseline/baseline.types';
import { baseName } from '../format/format.utils';
import { type ChunkContents, readCaching } from './caching';
import { type CachingReport } from './caching.types';

/**
 * How much of a chunk has to be somebody else's code before mixing is the finding.
 *
 * A chunk that is 2 % vendor is a chunk, not a badly split vendor bundle. At a quarter and above,
 * the dependencies inside it are a real part of what every deploy invalidates. It is a constant
 * rather than a criterion because it is about the shape of a split and not about a budget: nothing
 * a team decides changes what "mixed" means.
 */
const MIN_VENDOR_RATIO = 0.25;

/** Every chunk of the build with its vendor/own split, read from the tree the analysis already built. */
const chunksOf = (analysis: Analysis): ChunkContents[] => {
    const boot = new Set(analysis.bootChunks);

    return analysis.tree
        .filter(node => node.kind === 'chunk')
        .map((node): ChunkContents => {
            const vendorBytes = node.children
                .filter(child => child.kind === 'package')
                .reduce((sum, child) => sum + child.bytes, 0);
            const ownBytes = node.children
                .filter(child => child.kind === 'folder')
                .reduce((sum, child) => sum + child.bytes, 0);

            return { name: node.label, bytes: node.bytes, inBoot: boot.has(node.id), vendorBytes, ownBytes };
        });
};

/**
 * @param assets   the rest of the folder, when one was read. It also carries what the page asks
 *                 for, which is where "does anything ask for this file" comes from: working it out
 *                 again here is how the two halves of one report came to disagree about a favicon.
 * @param hrefs    the URLs `index.html` writes, query and all. `app.js?v=3` is a caching fact that
 *                 only exists in the full string, so it cannot be read from the file names.
 * @param baseline the previous build. Only the snapshots that carry `files` can answer what an
 *                 update costs; an older export cannot, and the report says nothing rather than
 *                 guessing from the byte totals.
 */
export const cachingOf = (
    analysis: Analysis,
    baseline: Snapshot | null,
    assets: AssetReport | null,
    inPage: ReadonlySet<string>,
    hrefs: readonly string[] = [],
): CachingReport => {
    // What the page asks for, as the folder reader worked it out. Without a folder there is only
    // what `index.html` announced of the JavaScript, which is what the caller passes.
    const named = assets ? new Set(assets.inPage) : inPage;
    const current = new Map(
        analysis.allChunks.map(file => {
            const chunk = analysis.chunkOf(file);
            return [baseName(file), { bytes: chunk?.bytes ?? 0, content: chunk?.mainContent }] as const;
        }),
    );
    const previous = baseline?.files
        ? new Map(baseline.files.map(file => [file.name, { bytes: file.bytes, content: file.content }] as const))
        : null;

    return readCaching({
        current,
        previous,
        chunks: chunksOf(analysis),
        files: assets
            ? assets.files.map(file => ({ name: file.name, path: file.path, bytes: file.bytes }))
            : [...current].map(([name, file]) => ({ name, bytes: file.bytes })),
        referencedAs: new Map(hrefs.map(href => [baseName(/^[^?#]*/.exec(href)?.[0] ?? ''), href] as const)),
        // Keyed by file name, because that is the only thing the two builds have in common: the
        // previous one is a list of names and sizes, and its output paths were never kept.
        importers: new Map(
            [...analysis.chunkImporters].map(
                ([target, naming]) => [baseName(target), naming.map(file => baseName(file))] as const,
            ),
        ),
        inPage: named,
        minVendorRatio: MIN_VENDOR_RATIO,
    });
};
