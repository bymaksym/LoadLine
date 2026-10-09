/**
 * Reading the build folder for everything that is not JavaScript.
 *
 * Every figure here comes from files that were already in the folder somebody dropped, or from the
 * text of chunks that were already open. Nothing is fetched, nothing is recompressed, and — the
 * rule that decides the shape of this file — **nothing is estimated**. "This PNG would be 310 kB in
 * AVIF" is a number nobody measured; what gets said instead is what it weighs, what format it is
 * in, and whether a modern version of it is sitting in the same folder.
 */

import { pagePathsIn, prefetchPathsIn } from '../build-text/index-html';
import { asMember } from '../json/json.utils';
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
 * Files whose name is fixed by whoever reads them: the host (`_redirects`, `_headers`,
 * `_routes.json`, `.htaccess`, `CNAME`), a crawler (`robots.txt`, `sitemap.xml`), the browser
 * looking for a service worker or a manifest at a URL that does not move, and the pages a host
 * serves on its own (`404.html`, `200.html`). Nothing in the build names them and none can carry a
 * hash, so "not referenced" and "no hash" are both true of them and say nothing: three real builds
 * listed them under both.
 */
export const SERVER_FILE =
    /^(?:_redirects|_headers|_routes\.json|\.htaccess|CNAME|robots\.txt|sitemap[\w-]*\.xml|[\w-]*\.webmanifest|sw\.js|service-worker\.js|(?:200|404|50\d)\.html)$/i;

/** The three of the eight kinds the media table holds. The only place they are listed. */
const MEDIA_KINDS: ReadonlySet<MediaFile['kind']> = new Set<MediaFile['kind']>(['image', 'video', 'audio']);

/**
 * The kind that puts a file in the media table, or `null` when it belongs in none.
 *
 * `kindOf` answers over all eight kinds and the table holds three, so the wide answer used to be
 * asserted back down into the narrow one. This asks the same question so that the answer is
 * already narrow, which is what both the filter and the row below need.
 */
const mediaKindOf = (name: string): MediaFile['kind'] | null => asMember(kindOf(name), MEDIA_KINDS);

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
    /**
     * Every icon the page names in a `<link>`: the favicon alternatives and the touch icons. The
     * browser fetches one of them at most, so two of them holding the same picture is not a file
     * that travels twice.
     */
    icons?: ReadonlySet<string>;
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
    /**
     * The same figures keyed by the path inside the folder, for files that share a name: `weigh` is
     * keyed by name, which is how the metafile names chunks, and gives 25 `plugin.min.js` one size.
     */
    weighPath?: ReadonlyMap<string, number>;
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
/** @param inPage the paths of the files the page asks for. */
const mediaOf = (files: readonly AssetFile[], inPage: ReadonlySet<string>): MediaFile[] => {
    const media = files.filter(file => mediaKindOf(file.name) !== null);
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
                // Never the fallback: `media` is exactly the files whose kind is one of the three.
                kind: mediaKindOf(file.name) ?? 'image',
                format,
                inPage: inPage.has(file.path),
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

/**
 * What is downloaded once and kept, and can be kept twice. A stylesheet too: Sapper wrote the same
 * 204 bytes as `main.css` and `chunk.css`, and both were counted. Not a script, whose name carries
 * the hash of its content, so two of them with one content have one name.
 */
const DUPLICATE_KINDS: ReadonlySet<AssetKind> = new Set<AssetKind>(['font', 'image', 'video', 'audio', 'style']);

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
        // What is downloaded once and kept: a font, a picture, a recording. An HTML document and a
        // data file are one per navigation, and two of them being equal says nothing about waste —
        // Nuxt's 200.html, 404.html and every route's shell are the same page on purpose, and two
        // routes' `_payload.json` came out "identical" because they held the same timestamp.
        // Nor is an empty file: Ember writes two empty stylesheets, and "0 B twice" is no copy.
        if (!DUPLICATE_KINDS.has(kindOf(file.name)) || file.bytes === 0) {
            continue;
        }
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
            named: null,
        }))
        .toSorted((a, b) => b.wasted - a.wasted);
};

/** How many files of the folder carry each name. */
const namesakesOf = (files: readonly AssetFile[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const file of files) {
        counts.set(file.name, (counts.get(file.name) ?? 0) + 1);
    }
    return counts;
};

/** Whether a path the page wrote is this file: the same path, or one under a `base` or a subfolder. */
const isPathOf = (file: AssetFile, path: string): boolean =>
    file.path === path || file.path.endsWith(`/${path}`) || path.endsWith(`/${file.path}`);

/**
 * The files the page asks for. By name, which is how everything else here keys a file — except a
 * name several files share, where only the path the page wrote says which one it is. By name,
 * PocketBase's page asked for all 25 `plugin.min.js` of TinyMCE.
 */
const askedFiles = (input: AssetInput): AssetFile[] => {
    const namesakes = namesakesOf(input.files);
    const shared = input.files.filter(file => input.inPage.has(file.name) && (namesakes.get(file.name) ?? 0) > 1);
    const paths = shared.length > 0 && input.html ? pagePathsIn(input.html) : [];
    // One file per path, the exact one first and then the shortest: a folder holding `browser/`
    // and `server/` has two `main.js`, and the page names one of them.
    const picked = new Set(
        paths.flatMap(path =>
            shared
                .filter(file => isPathOf(file, path))
                .toSorted((a, b) => Number(b.path === path) - Number(a.path === path) || a.path.length - b.path.length)
                .slice(0, 1),
        ),
    );
    return input.files.filter(
        file => input.inPage.has(file.name) && ((namesakes.get(file.name) ?? 0) < 2 || picked.has(file)),
    );
};

/**
 * What a file weighs in the unit given: by path when the folder was read by path, and by name
 * only when the name is its own — 25 `plugin.min.js` keyed by name all weigh the last one read.
 */
const weigherOf = (
    files: readonly AssetFile[],
    weigh: ReadonlyMap<string, number> | null | undefined,
    weighPath: ReadonlyMap<string, number> | null | undefined,
): ((file: AssetFile) => number) => {
    const namesakes = namesakesOf(files);
    return file =>
        weighPath?.get(file.path) ??
        ((namesakes.get(file.name) ?? 0) > 1 ? file.bytes : (weigh?.get(file.name) ?? file.bytes));
};

/** The whole first trip: everything the page asks for before anything appears. */
const firstTripOf = (input: AssetInput, weighFile: (file: AssetFile) => number, inline = 0): FirstTrip => {
    // A `prefetch` is named by the page and is still not part of this trip: it is for the next
    // navigation. Counted, PocketBase's warm-up of TinyMCE read "731 kB across 12 files" for a first
    // trip of 392 kB in 5, under a signal of the same report saying prefetches are not counted.
    // And only what this folder holds: a stylesheet from a font host or forty posters from an image
    // CDN are files of somebody else's, and counting them as files of the trip made "55 files" out
    // of 14. Taking the files rather than the names the page wrote is what keeps them out.
    // Nor is the page's icon: the browser asks for it beside the page and paints without it. Counted,
    // the favicon of every build was part of "before anything appears".
    const named = askedFiles(input).filter(
        file => (!input.prefetched?.has(file.name) || input.preloaded.has(file.name)) && !input.icons?.has(file.name),
    );
    const total = (kinds: AssetKind[]): number =>
        named.filter(file => kinds.includes(kindOf(file.name))).reduce((sum, file) => sum + weighFile(file), 0);

    const scripts = total(['script']) + inline;
    const styles = total(['style']);
    const fonts = named
        .filter(file => kindOf(file.name) === 'font' && input.preloaded.has(file.name))
        .reduce((sum, file) => sum + weighFile(file), 0);
    const images = total(['image']);

    return {
        scripts,
        styles,
        fonts,
        images,
        inline,
        total: scripts + styles + fonts + images,
        files: named.filter(file => kindOf(file.name) !== 'font' || input.preloaded.has(file.name)).length,
    };
};

/**
 * The first trip with the bootstrap chunks `index.html` does not name, once the analysis has found
 * them. The folder alone only sees what the page names, and a chunk the browser discovers by
 * parsing is still downloaded before anything appears, one round trip later. Left out, a real build
 * read "the whole first trip is 133 kB" under a 464 kB bootstrap: the 346 kB it left out was the
 * chunk that made the bootstrap take two trips.
 */
export const withLateBoot = (trip: FirstTrip, late: readonly number[]): FirstTrip => {
    const bytes = late.reduce((sum, size) => sum + size, 0);
    return { ...trip, scripts: trip.scripts + bytes, total: trip.total + bytes, files: trip.files + late.length };
};

/**
 * The first trip weighed with other figures than the report's: raw bytes when `weigh` is absent.
 * The command reads the folder before it knows which unit it was asked for, and a trip weighed in
 * brotli under `--mode raw` read "Bootstrap 110 kB" over "the whole first trip is 48 kB".
 */
/** @param inline what the page's inline scripts weigh, in the unit of `weigh` (`inlineScriptsIn`). */
export const firstTripIn = (
    input: AssetInput,
    weigh: ReadonlyMap<string, number> | null,
    weighPath: ReadonlyMap<string, number> | null = null,
    inline = 0,
): FirstTrip => firstTripOf(input, weigherOf(input.files, weigh, weighPath), inline);

export const readAssets = (input: AssetInput): AssetReport => {
    const sizes = new Map(input.files.map(file => [file.name, file.bytes]));
    const sizeOf = (name: string): number => input.weigh?.get(name) ?? sizes.get(name) ?? 0;
    const referenced = referencedNames(input);
    const referencesRead = input.texts.size > 0 || input.html !== null;

    const inlined = inlinedOf(input.texts);

    // Scripts only. A prefetched font or picture is a different conversation and a much smaller
    // one; what makes this worth a line is a framework fetching whole routes nobody asked for.
    // Matched by the path the page wrote where it can be, and weighed per path: by name alone,
    // files that share one counted once and weighed the same (see `prefetchPathsIn`).
    const weighFile = weigherOf(input.files, input.weigh, input.weighPath);
    const byPath = input.html
        ? prefetchPathsIn(input.html).flatMap(path => input.files.filter(file => isPathOf(file, path)).slice(0, 1))
        : [];
    const asked = askedFiles(input);
    const prefetched = (
        byPath.length > 0
            ? byPath.map(file => ({ name: file.path, bytes: weighFile(file) }))
            : [...(input.prefetched ?? [])].map(name => ({ name, bytes: sizeOf(name) }))
    )
        .filter(file => kindOf(file.name) === 'script')
        .toSorted((a, b) => b.bytes - a.bytes);

    return {
        files: input.files.map(file => ({ ...file, kind: kindOf(file.name) })),
        fonts: fontsOf(input.files, input.preloaded),
        media: mediaOf(input.files, new Set(asked.map(file => file.path))),
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
                      !SERVER_FILE.test(file.name) &&
                      !/^index(?:\.[\w-]+)?\.html$/i.test(file.name),
              )
            : [],
        referencesRead,
        // A favicon and a touch icon holding the same picture are alternatives the browser picks one
        // of, not a file downloaded twice under two names.
        duplicates: duplicatesOf(input.files, input.hashes)
            .filter(entry => entry.names.some(path => !input.icons?.has(path.split('/').at(-1) ?? path)))
            .map(entry => ({
                ...entry,
                named: referencesRead
                    ? entry.names.filter(path => referenced.has(path.split('/').at(-1) ?? path)).length
                    : null,
            })),
        contentCompared: !!input.hashes && input.hashes.size > 0,
        inlined,
        inlinedBytes: inlined.reduce((sum, row) => sum + row.bytes, 0),
        stylesByChunk: stylesByChunk(input, sizeOf),
        firstTrip: firstTripOf(input, weighFile),
        inPage: [...input.inPage],
        inPagePaths: asked.map(file => file.path),
    };
};

/**
 * The stylesheets the code loads and the page does not ask for: the CSS of a lazy route, which
 * Vite writes beside its chunk. Not "named by a lazy chunk": Vite lists every route's CSS in the
 * preload table of whichever chunk imports the route, and that is usually the bootstrap. Left out
 * of every total — the figures are JavaScript — and named, so leaving them out is said.
 */
export const routeStylesOf = (report: AssetReport): string[] => {
    const asked = new Set(report.inPage);
    return [...new Set(report.stylesByChunk.flatMap(row => row.styles))].filter(style => !asked.has(style));
};
