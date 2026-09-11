/**
 * The cost of an update, worked out from the two things that are already there: the file names of
 * this build and the file names of the previous one.
 *
 * The whole method is one observation. A build tool writes the content hash into the file name, so
 * **a name that has not changed is a file the browser does not ask for again**. Comparing two lists
 * of names is therefore not an approximation of the cache delta, it is the cache delta — as long as
 * the names carry hashes, which is the third figure here and the reason it is measured too.
 */

import {
    type CachingReport,
    type ChangedFile,
    type MeasuredCascade,
    type UnhashableFile,
    type UnstableChunk,
    type UpdateCost,
} from './caching.types';

/**
 * A content hash in a file name: `main-A1B2C3D4.js`, `main.a1b2c3d4.js`, `chunk-0fPdmq0U.mjs`.
 *
 * Eight characters or more of hex or base64 next to the extension. Shorter than that and it is a
 * version number somebody wrote by hand, which is exactly the case this is meant to catch rather
 * than accept.
 */
const HASHED = /[.\-_][\dA-Za-z_-]{8,}\.[\da-z]+$/;

/**
 * The same thing when the hash **is** the whole name: `ChDGvcpR.js`, `DkjDNEOM.js`, `BauOL-29.js`.
 *
 * SvelteKit, Nuxt and Rollup all write chunks with no readable prefix at all, and `HASHED` needs a
 * separator before the hash, so it said no to every one of them: nine files on SvelteKit and twelve
 * on Nuxt reported as uncacheable, at `mid`, when they are the most cacheable files in the build.
 *
 * Mixed case is what tells a hash from a word — `version.json` and `_payload.json` really do carry
 * no hash and stay reported. It costs a hand-written `AppShell.js` being taken for a hash, and that
 * is the right way round to be wrong: the price is one missing line, not a false claim.
 */
const BARE_HASH = /^[\dA-Za-z_-]{8,}\.[\da-z]+$/;
const MIXED_CASE = /(?=.*[a-z])(?=.*[A-Z])/;

/**
 * A name somebody wrote, with something after it: `main-K7QW2X.js`, `chunk-A1B2.js`.
 *
 * It has to be kept out of `BARE_HASH`, because base64 includes `-` and `_` and without this
 * `main-K7QW2X` reads as one opaque token — which would take a six-character version suffix for a
 * content hash and stop reporting exactly the case this signal exists for.
 */
const WRITTEN_PREFIX = /^[a-z]{3,}[.\-_]/;

/** A version pinned in the query string: `app.js?v=3`. It defeats the cache on every deploy. */
const VERSIONED_QUERY = /[?&]v(?:er|ersion)?=/i;

/** The name with its content hash taken off, which is what makes two builds' files comparable. */
export const unhashedName = (name: string): string => name.replace(/[.\-_][\dA-Za-z_-]{8,}(\.[\da-z]+)$/, '$1');

/** A name that is nothing but a hash: `ChDGvcpR.js`. Taking the hash off it would leave `.js`. */
const isBareHash = (name: string): boolean =>
    BARE_HASH.test(name) && MIXED_CASE.test(name) && !WRITTEN_PREFIX.test(name);

/** One file of a build as this comparison needs it: what it weighs, and what it is made of. */
export interface FileWeight {
    bytes: number;
    /**
     * The largest source file inside the chunk. Absent when nothing said what was inside it — a
     * folder read with no source maps and no metafile — and then matching falls back to the name.
     */
    content?: string;
}

/**
 * The key a file is matched by across two builds.
 *
 * Normally the name with the hash taken off, which is the whole method: a build tool writes the
 * content hash into the name, so `main-A1.js` and `main-B2.js` are one file that changed.
 *
 * It has nothing to work with when the name **is** the hash — SvelteKit, Nuxt and Rollup write
 * chunks called `ChDGvcpR.js` — because there is no name left underneath. Every one of those read
 * as one file gone and another arrived: a two-byte edit to a shared module in the SvelteKit probe
 * reported 10 kB added and 10 kB removed rather than 10 kB changed, and the split into the edit and
 * the cascade it set off never saw the largest file in the build.
 *
 * For those, the identity is what the chunk is made of rather than what it is called. It is not a
 * guess and not a heuristic over the bytes: the analysis already works out the biggest source file
 * of every chunk, from the same metafile or source map the weights come from, and the snapshot
 * carries it. A content key is only used when it names exactly one chunk on that side — two chunks
 * built around the same file say nothing about which of them is which — and `CONTENT_KEY` in
 * front of it is there so it can never be mistaken for a file name.
 */
const CONTENT_KEY = '\u{0}';

const keysOf = (files: ReadonlyMap<string, FileWeight>): Map<string, string> => {
    const perContent = new Map<string, number>();
    for (const [name, file] of files) {
        if (file.content && isBareHash(name)) {
            perContent.set(file.content, (perContent.get(file.content) ?? 0) + 1);
        }
    }

    const keys = new Map<string, string>();
    for (const [name, file] of files) {
        const byContent = !!file.content && isBareHash(name) && perContent.get(file.content) === 1;
        keys.set(name, byContent ? `${CONTENT_KEY}${file.content ?? ''}` : unhashedName(name));
    }

    return keys;
};

/**
 * The changed files split into the edit and the cascade it set off.
 *
 * Both halves are read, neither is modelled: the two builds' names say which files changed, and the
 * current build's import edges say which of them carry a changed name inside. A file naming nothing
 * that changed cannot have moved for any reason but its own content — that is where the edit was.
 *
 * The split is a pair of bounds and is presented as one. A file that was edited *and* sits
 * downstream of another edited file looks exactly like a pure cascade victim from here, so `roots`
 * is a floor on the edit and `carried` a ceiling on the cascade.
 */
const cascadeOf = (
    changed: readonly ChangedFile[],
    importers: ReadonlyMap<string, readonly string[]>,
): MeasuredCascade => {
    const changedNames = new Set(changed.map(file => file.name));

    // A changed file is explained by the cascade when it names another file that also changed:
    // that name is inside its bytes, so its hash had to move whether or not anything else did.
    const carriedNames = new Set(
        [...importers]
            .filter(([target]) => changedNames.has(target))
            .flatMap(([, naming]) => naming)
            .filter(name => changedNames.has(name)),
    );

    const carried = changed.filter(file => carriedNames.has(file.name));
    const roots = changed.filter(file => !carriedNames.has(file.name));
    const bytesOf = (files: readonly ChangedFile[]): number => files.reduce((sum, file) => sum + file.bytes, 0);

    return {
        roots: roots.map(file => file.name),
        rootBytes: bytesOf(roots),
        carried: carried.map(file => file.name),
        carriedBytes: bytesOf(carried),
    };
};

/**
 * What somebody who already had the previous version has to download.
 *
 * Files are matched by their **unhashed** name, so `main-A1.js` and `main-B2.js` are the same file
 * having changed rather than one file gone and another arrived. That distinction is the entire
 * point: `12 gone, 12 new` says nothing, `12 changed, 1.2 MB re-downloaded` says what it costs.
 *
 * @param importers file name → the names of the files that carry it inside them, from the current
 *                  build's import edges. Optional: without it the update cost is the same figure it
 *                  always was, and the split into edit and cascade is `null` rather than guessed.
 */
export const updateCostOf = (
    current: ReadonlyMap<string, FileWeight>,
    previous: ReadonlyMap<string, FileWeight>,
    importers: ReadonlyMap<string, readonly string[]> | null = null,
): UpdateCost => {
    const previousKeys = keysOf(previous);
    const currentKeys = keysOf(current);

    const before = new Map<string, { name: string; bytes: number }>();
    for (const [name, file] of previous) {
        before.set(previousKeys.get(name) ?? unhashedName(name), { name, bytes: file.bytes });
    }

    const changed: ChangedFile[] = [];
    const added: ChangedFile[] = [];
    const seen = new Set<string>();
    let reused = 0;
    let fresh = 0;

    for (const [name, file] of current) {
        const bytes = file.bytes;
        fresh += bytes;
        const key = currentKeys.get(name) ?? unhashedName(name);
        const was = before.get(key);
        seen.add(key);

        if (!was) {
            added.push({ name, change: 'added', bytes });
        } else if (was.name === name) {
            // Same name, same content, still in the browser's cache. Nothing to download.
            reused += 1;
        } else {
            changed.push({ name, change: 'changed', bytes });
        }
    }

    const removed: ChangedFile[] = [...before]
        .filter(([key]) => !seen.has(key))
        .map(([, was]): ChangedFile => ({ name: was.name, change: 'removed', bytes: was.bytes }));

    const bytes = [...changed, ...added].reduce((sum, file) => sum + file.bytes, 0);
    const byWeight = changed.toSorted((a, b) => b.bytes - a.bytes);

    return {
        bytes,
        fresh,
        ratio: fresh > 0 ? bytes / fresh : 0,
        changed: byWeight,
        added: added.toSorted((a, b) => b.bytes - a.bytes),
        removed: removed.toSorted((a, b) => b.bytes - a.bytes),
        reused,
        cascade: importers ? cascadeOf(byWeight, importers) : null,
    };
};

/**
 * A chunk as this figure needs it: how much of it is somebody else's code and how much is the
 * project's own.
 *
 * The split is passed in rather than worked out here, because the analysis already did it: the
 * tree it builds groups every chunk by package and by folder, and telling a package from a folder
 * is the one thing a path cannot always say on its own.
 */
export interface ChunkContents {
    name: string;
    bytes: number;
    inBoot: boolean;
    /** Raw minified bytes of `node_modules` inside it. */
    vendorBytes: number;
    /** The same for the project's own files. */
    ownBytes: number;
}

/**
 * Chunks that mix somebody else's code with the project's own.
 *
 * This is the cause behind the symptom the update cost measures, which is why it is a separate
 * figure and not a footnote on that one. Dependencies do not change for months; the project's code
 * changes every day; one file holding both is invalidated every day, and everything of the first
 * kind inside it is re-downloaded for nothing.
 *
 * @param minRatio how much of a chunk has to be somebody else's before it is worth a line. A chunk
 *                 that is 2 % vendor is not a badly split vendor bundle, it is a chunk.
 */
export const unstableChunks = (chunks: readonly ChunkContents[], minRatio: number): UnstableChunk[] =>
    chunks
        .map((chunk): UnstableChunk => {
            const total = chunk.vendorBytes + chunk.ownBytes;

            return {
                name: chunk.name,
                bytes: chunk.bytes,
                vendorRatio: total > 0 ? chunk.vendorBytes / total : 0,
                // Only when the chunk holds both. A chunk that is nothing but vendor code is the
                // right answer, not the problem: its hash does not move when the project changes.
                vendorBytes: chunk.ownBytes > 0 ? chunk.vendorBytes : 0,
                inBoot: chunk.inBoot,
            };
        })
        .filter(chunk => chunk.vendorBytes > 0 && chunk.vendorRatio >= minRatio)
        .toSorted((a, b) => Number(b.inBoot) - Number(a.inBoot) || b.vendorBytes - a.vendorBytes);

/**
 * The files for which "it carries no hash" is not a finding but the definition.
 *
 * The HTML document of a build is the one URL that has to stay put — hash it and nobody can reach
 * the application. A source map is never fetched by a page: its name is derived from the chunk's,
 * which already carries the hash. A pre-compressed copy is not a second cache entry either:
 * `app.js.br` is `app.js` under another encoding, served at the same URL by content negotiation.
 *
 * Counting them turned this into the one signal that fires on every build ever read: seven entries
 * on a plain Vite build, of which six were `.map` and the seventh `index.html`, and twenty-five on
 * Nuxt, enough to push it to `mid` and into the "what to fix first" table. A signal that is always
 * on is a signal nobody reads.
 */
const NEVER_HASHED = /(?:\.map|\.html?|\.br|\.brotli|\.gz|\.zst)$/i;

/**
 * Files a browser cannot keep for long.
 *
 * Informative almost always — a `favicon.ico` has no hash and never will — and worth a line when it
 * fires on something big, because then every visit revalidates it. The `?v=` case is the one that
 * is nearly always a mistake: it changes the URL on every deploy, which is what a content hash does
 * except that it changes it for **every** file at once.
 */
export const unhashableFiles = (
    files: readonly { name: string; path?: string; bytes: number }[],
    referencedAs: ReadonlyMap<string, string>,
    inPage: ReadonlySet<string>,
): UnhashableFile[] =>
    files
        .filter(file => !NEVER_HASHED.test(file.name))
        .map((file): UnhashableFile | null => {
            // Every rule below reads the name, because that is what a hash is written into and what
            // the page, the metafile and the compressed copies all key a file by. Only what gets
            // printed is the path.
            const at = { name: file.name, path: file.path ?? file.name, bytes: file.bytes };
            const reference = referencedAs.get(file.name) ?? file.name;
            if (VERSIONED_QUERY.test(reference)) {
                return { ...at, reason: 'query', inPage: inPage.has(file.name) };
            }
            const bare = isBareHash(file.name);
            const hashed = HASHED.test(file.name) || bare;
            return hashed ? null : { ...at, reason: 'none', inPage: inPage.has(file.name) };
        })
        .filter(file => file !== null)
        .toSorted((a, b) => Number(b.inPage) - Number(a.inPage) || b.bytes - a.bytes);

export interface CachingInput {
    current: ReadonlyMap<string, FileWeight>;
    /** The previous build's file names with their sizes. `null` when none was given. */
    previous: ReadonlyMap<string, FileWeight> | null;
    chunks: readonly ChunkContents[];
    /** Every file of the folder, for the names that cannot be cached. */
    files: readonly { name: string; bytes: number }[];
    /** File name → the URL something referenced it by, when that is known. For the `?v=` case. */
    referencedAs: ReadonlyMap<string, string>;
    /** File name → the files naming it, so the update cost can be split into edit and cascade. */
    importers: ReadonlyMap<string, readonly string[]> | null;
    inPage: ReadonlySet<string>;
    minVendorRatio: number;
}

export const readCaching = (input: CachingInput): CachingReport => ({
    update: input.previous ? updateCostOf(input.current, input.previous, input.importers) : null,
    unstable: unstableChunks(input.chunks, input.minVendorRatio),
    unhashable: unhashableFiles(input.files, input.referencedAs, input.inPage),
});
