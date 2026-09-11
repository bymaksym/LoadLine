/**
 * Reading the build folder for everything that is not JavaScript.
 *
 * Every figure here comes from files that were already in the folder somebody dropped, or from the
 * text of chunks that were already open. Nothing is fetched, nothing is recompressed, and — the
 * rule that decides the shape of this file — **nothing is estimated**. "This PNG would be 310 kB in
 * AVIF" is a number nobody measured; what gets said instead is what it weighs, what format it is
 * in, and whether a modern version of it is sitting in the same folder.
 */

import {
    type AssetFile,
    type AssetKind,
    type AssetReport,
    type ChunkStyles,
    type DuplicateAsset,
    type FirstTrip,
    type FontFamily,
    type InlinedData,
    type MediaFile,
} from './assets.types';

const EXTENSIONS: Record<string, AssetKind> = {
    js: 'script',
    mjs: 'script',
    cjs: 'script',
    css: 'style',
    woff: 'font',
    woff2: 'font',
    ttf: 'font',
    otf: 'font',
    eot: 'font',
    png: 'image',
    jpg: 'image',
    jpeg: 'image',
    gif: 'image',
    webp: 'image',
    avif: 'image',
    svg: 'image',
    ico: 'image',
    bmp: 'image',
    mp4: 'video',
    webm: 'video',
    mov: 'video',
    mp3: 'audio',
    ogg: 'audio',
    wav: 'audio',
    map: 'map',
};

/** Formats a newer one supersedes, when both are in the folder. Fonts first, then pictures. */
const SUPERSEDED_BY: Record<string, string[]> = {
    woff2: ['woff', 'ttf', 'otf', 'eot'],
    avif: ['webp', 'png', 'jpg', 'jpeg'],
    webp: ['png', 'jpg', 'jpeg'],
};

export const extensionOf = (name: string): string => (/\.([\da-z]+)$/i.exec(name)?.[1] ?? '').toLowerCase();

export const kindOf = (name: string): AssetKind => EXTENSIONS[extensionOf(name)] ?? 'other';

/**
 * The face a font file belongs to.
 *
 * Build tools write `Roboto-Bold-A1B2C3.woff2`, `roboto_700.woff2`, `Inter-Regular.ttf`. What
 * identifies the family is the first segment, with the content hash and the weight taken off. It
 * is a convention rather than a fact, and it is the right kind of guess to make: getting it wrong
 * groups two families into one row, which is visible and harmless, while not grouping at all means
 * seven weights of Roboto read as seven unrelated files.
 */
const familyOf = (name: string): string => {
    const base = name.replace(/\.[^.]+$/, '');
    const head = base.split(/[_-]/, 1)[0] ?? base;
    return head.toLowerCase();
};

/**
 * Every token in a text that looks like a file name. One pass, so a big chunk is read once.
 *
 * The lookbehind is not a nicety, it is what makes the pass linear. Without it, `[\w.-]+` is tried
 * again from every position inside a long run of word characters — a base64 blob in a minified
 * chunk, say — and each attempt walks to the end of the run before failing. On a 5.9 MB chunk with
 * wasm embedded that took minutes and found nothing; anchored to a boundary, each run is attempted
 * once and the same file reads in 112 ms. The set of tokens is identical either way: a greedy match
 * already starts at the boundary, so all the lookbehind removes is the attempts that cannot match.
 */
const NAME_TOKEN = /(?<![\w.-])[\w.-]+\.[a-z0-9]{2,5}/gi;

/** A copy of another file under a different encoding: `app.js.br` next to `app.js`. */
const PRE_COMPRESSED = /\.(?:br|brotli|gz|zst)$/i;

/** A `data:` URI as a bundler writes one when a file falls under the inline threshold. */
const DATA_URI = /data:([\w./+-]+);base64,[\d+/A-Za-z]+={0,2}/g;

export interface AssetInput {
    files: readonly AssetFile[];
    /** `index.html`, when the folder carries one. */
    html: string | null;
    /**
     * The text of every file worth searching — the chunks and the stylesheets — keyed by file name.
     * What is not here simply is not searched, and `referencesRead` says whether anything was.
     */
    texts: ReadonlyMap<string, string>;
    /**
     * Content hashes, when something computed them, **keyed by path inside the build folder** and
     * not by file name. That is the whole difference between a claim and a wrong one: a build with
     * a folder per route writes `index.html`, `orders/index.html` and `settings/index.html`, and
     * keyed by name the three collapse onto one entry, the last one wins, and all three come out
     * grouped as "identical byte for byte" while holding three different pages. Nuxt and Astro both
     * write exactly that shape.
     *
     * Optional because reading fifty megabytes of video to compare two names is not always worth
     * it, and the report says which of the two cases it is rather than reporting "no duplicates"
     * either way.
     */
    hashes?: ReadonlyMap<string, string>;
    /** Names the page asks for before painting: scripts, stylesheets, preloads, images in the HTML. */
    inPage: ReadonlySet<string>;
    /** Of those, the ones that are preloaded rather than merely referenced. */
    preloaded: ReadonlySet<string>;
    /**
     * What the page asks the browser to fetch for a **later** navigation: `<link rel="prefetch">`.
     * Not part of the first load and not counted in one — but fetched on this visit all the same,
     * which is why it is carried through instead of dropped on the floor.
     */
    prefetched?: ReadonlySet<string>;
    /** The chunks of the bootstrap, to attribute the styles they pull in to the first load. */
    bootChunks: ReadonlySet<string>;
    /**
     * What each file weighs in the unit the report is shown in: the compressed sizes, when the
     * folder was compressed.
     *
     * Without it the first trip would be quoted in raw bytes next to a headline quoted in gzip —
     * `509 kB of JavaScript` under `156 kB bootstrap` — which is the same figure said twice in two
     * units and reads as a contradiction. Anything not in here keeps its size on disk, which is
     * right for a picture or a font: those are already compressed and travel as they are.
     */
    weigh?: ReadonlyMap<string, number>;
}

/** Fonts grouped into the faces they really are. */
const fontsOf = (files: readonly AssetFile[], preloaded: ReadonlySet<string>): FontFamily[] => {
    const byFamily = new Map<string, AssetFile[]>();
    for (const file of files) {
        if (kindOf(file.name) !== 'font') {
            continue;
        }
        const family = familyOf(file.name);
        byFamily.set(family, [...(byFamily.get(family) ?? []), file]);
    }

    return [...byFamily]
        .map(([name, group]): FontFamily => {
            const formats = [...new Set(group.map(file => extensionOf(file.name)))];
            const best = formats.includes('woff2') ? 'woff2' : null;
            const beaten = new Set(best ? SUPERSEDED_BY[best] : []);

            return {
                name,
                files: group
                    .map(file => ({ name: file.name, bytes: file.bytes, format: extensionOf(file.name) }))
                    .toSorted((a, b) => b.bytes - a.bytes),
                bytes: group.reduce((sum, file) => sum + file.bytes, 0),
                formats,
                preloaded: group.filter(file => preloaded.has(file.name)).map(file => file.name),
                // Only when the better format is genuinely there: this never says "convert it",
                // it says "you are shipping the same face twice and one of them is not used".
                superseded: group.filter(file => beaten.has(extensionOf(file.name))).map(file => file.name),
            };
        })
        .toSorted((a, b) => b.bytes - a.bytes);
};

/** Pictures and video, with whether a modern version of the same name is already there. */
const mediaOf = (files: readonly AssetFile[], inPage: ReadonlySet<string>): MediaFile[] => {
    const kinds = new Set<AssetKind>(['image', 'video', 'audio']);
    const media = files.filter(file => kinds.has(kindOf(file.name)));
    // Two files are the same picture when everything but the extension matches. The hash a bundler
    // adds is part of the name and stays in the comparison, which is what keeps it honest.
    const stems = new Map<string, Set<string>>();
    for (const file of media) {
        const stem = file.name.replace(/\.[^.]+$/, '');
        stems.set(stem, (stems.get(stem) ?? new Set()).add(extensionOf(file.name)));
    }

    return media
        .map((file): MediaFile => {
            const format = extensionOf(file.name);
            const siblings = stems.get(file.name.replace(/\.[^.]+$/, '')) ?? new Set<string>();
            const modern = ['avif', 'webp'].find(
                better => siblings.has(better) && SUPERSEDED_BY[better]?.includes(format),
            );

            return {
                ...file,
                kind: kindOf(file.name) as MediaFile['kind'],
                format,
                inPage: inPage.has(file.name),
                modernNeighbour: modern ?? null,
            };
        })
        .toSorted((a, b) => b.bytes - a.bytes);
};

/** Which file names appear anywhere in the text of the build, plus whatever the page names. */
const referencedNames = (input: AssetInput): Set<string> => {
    const known = new Set(input.files.map(file => file.name));
    const found = new Set<string>(input.inPage);

    const scan = (text: string): void => {
        for (const [token] of text.matchAll(NAME_TOKEN)) {
            if (known.has(token)) {
                found.add(token);
            }
        }
    };

    if (input.html) {
        scan(input.html);
    }
    for (const text of input.texts.values()) {
        scan(text);
    }

    return found;
};

/** The stylesheets each chunk names in its own text: how a lazy screen's CSS is attributed to it. */
const stylesByChunk = (input: AssetInput, sizeOf: (name: string) => number): ChunkStyles[] => {
    const styles = new Set(input.files.filter(file => kindOf(file.name) === 'style').map(file => file.name));
    const rows: ChunkStyles[] = [];

    for (const [chunk, text] of input.texts) {
        if (kindOf(chunk) !== 'script') {
            continue;
        }

        const named = new Set<string>();
        for (const [token] of text.matchAll(NAME_TOKEN)) {
            if (styles.has(token)) {
                named.add(token);
            }
        }
        if (named.size > 0) {
            rows.push({ chunk, styles: [...named], bytes: [...named].reduce((sum, css) => sum + sizeOf(css), 0) });
        }
    }

    return rows.toSorted((a, b) => b.bytes - a.bytes);
};

/**
 * Bytes of a chunk that are an image the bundler put inline because it fell under a threshold.
 *
 * Those bytes are hiding inside the figure that matters most: they cannot be deferred, they are not
 * cached separately, and they appear in no list of assets anywhere. One icon is nothing; forty of
 * them is a chunk that is a third pictures.
 */
const inlinedOf = (texts: ReadonlyMap<string, string>): InlinedData[] => {
    const rows: InlinedData[] = [];

    for (const [chunk, text] of texts) {
        if (kindOf(chunk) !== 'script' && kindOf(chunk) !== 'style') {
            continue;
        }

        let count = 0;
        let bytes = 0;
        const types = new Set<string>();
        for (const [uri, type = ''] of text.matchAll(DATA_URI)) {
            count += 1;
            bytes += uri.length;
            types.add(type);
        }

        if (count > 0) {
            rows.push({ chunk, count, bytes, types: [...types] });
        }
    }

    return rows.toSorted((a, b) => b.bytes - a.bytes);
};

/** Files with the same content under two names, when something actually compared the content. */
const duplicatesOf = (
    files: readonly AssetFile[],
    hashes: ReadonlyMap<string, string> | undefined,
): DuplicateAsset[] => {
    if (!hashes || hashes.size === 0) {
        return [];
    }

    const byHash = new Map<string, AssetFile[]>();
    for (const file of files) {
        const hash = hashes.get(file.path);
        if (hash) {
            byHash.set(hash, [...(byHash.get(hash) ?? []), file]);
        }
    }

    return [...byHash]
        .filter(([, group]) => group.length > 1)
        .map(([hash, group]): DuplicateAsset => ({
            hash: hash.slice(0, 12),
            // The path, not the name: two copies of one file are usually in different folders, and
            // "index.html, index.html, index.html" names nothing anybody can go and look at.
            names: group.map(file => file.path),
            bytes: group[0]?.bytes ?? 0,
            wasted: (group.length - 1) * (group[0]?.bytes ?? 0),
        }))
        .toSorted((a, b) => b.wasted - a.wasted);
};

/** The whole first trip: everything the page asks for before anything appears. */
const firstTripOf = (input: AssetInput, sizeOf: (name: string) => number): FirstTrip => {
    const named = [...input.inPage];
    const total = (kinds: AssetKind[]): number =>
        named.filter(name => kinds.includes(kindOf(name))).reduce((sum, name) => sum + sizeOf(name), 0);

    const scripts = total(['script']);
    const styles = total(['style']);
    const fonts = named
        .filter(name => kindOf(name) === 'font' && input.preloaded.has(name))
        .reduce((sum, name) => sum + sizeOf(name), 0);
    const images = total(['image']);

    return {
        scripts,
        styles,
        fonts,
        images,
        total: scripts + styles + fonts + images,
        files: named.filter(name => kindOf(name) !== 'font' || input.preloaded.has(name)).length,
    };
};

export const readAssets = (input: AssetInput): AssetReport => {
    const sizes = new Map(input.files.map(file => [file.name, file.bytes]));
    const sizeOf = (name: string): number => input.weigh?.get(name) ?? sizes.get(name) ?? 0;
    const referenced = referencedNames(input);
    const referencesRead = input.texts.size > 0 || input.html !== null;

    const inlined = inlinedOf(input.texts);

    // Scripts only. A prefetched font or picture is a different conversation and a much smaller
    // one; what makes this worth a line is a framework fetching whole routes nobody asked for.
    const prefetched = [...(input.prefetched ?? [])]
        .filter(name => kindOf(name) === 'script')
        .map(name => ({ name, bytes: sizeOf(name) }))
        .toSorted((a, b) => b.bytes - a.bytes);

    return {
        files: input.files.map(file => ({ ...file, kind: kindOf(file.name) })),
        fonts: fontsOf(input.files, input.preloaded),
        media: mediaOf(input.files, input.inPage),
        prefetched,
        prefetchedBytes: prefetched.reduce((sum, file) => sum + file.bytes, 0),
        // A source map is nobody's reference and never will be: it is named by the chunk it belongs
        // to, and listing every `.map` as unreachable would bury the leftovers this is for. The
        // same holds for a pre-compressed copy: `app.js.br` is `app.js` served under a different
        // encoding, nothing links to it by name, and the server picks it by the request header.
        // Listing them was worse than noise — those are the files the brotli figures in this very
        // report were read from, so it advised deleting what made its own headline exact.
        unreferenced: referencesRead
            ? input.files.filter(
                  file =>
                      !referenced.has(file.name) &&
                      kindOf(file.name) !== 'map' &&
                      !PRE_COMPRESSED.test(file.name) &&
                      !input.texts.has(file.name) &&
                      !/^index(\.[\w-]+)?\.html$/i.test(file.name),
              )
            : [],
        referencesRead,
        duplicates: duplicatesOf(input.files, input.hashes),
        contentCompared: !!input.hashes && input.hashes.size > 0,
        inlined,
        inlinedBytes: inlined.reduce((sum, row) => sum + row.bytes, 0),
        stylesByChunk: stylesByChunk(input, sizeOf),
        firstTrip: firstTripOf(input, sizeOf),
        inPage: [...input.inPage],
    };
};
