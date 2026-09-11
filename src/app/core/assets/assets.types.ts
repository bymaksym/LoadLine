/**
 * What the build folder holds besides JavaScript.
 *
 * This is the biggest hole the tool had, and the reason is worth writing down: **nobody downloads
 * JavaScript, they download a page.** Until now `isAsset()` accepted `.js`, `.mjs` and `.css`, and
 * of the CSS only what it compressed to; everything else in the folder — the fonts, the images, the
 * icons, the leftovers of last month's deploy — was invisible to a tool whose headline claims to
 * say what the first load costs.
 */

/** One file of the build folder, as either side of the tool can describe it without reading it. */
export interface AssetFile {
    /** Path inside the build folder, forward slashes on every platform. */
    path: string;
    /** Last segment. How the metafile, the page and the compressed maps all key a file. */
    name: string;
    bytes: number;
}

/** What a file is, decided by its extension: the only thing available without opening it. */
export type AssetKind = 'script' | 'style' | 'font' | 'image' | 'video' | 'audio' | 'map' | 'other';

/** A family of fonts: several weights and formats of what is really one typeface. */
export interface FontFamily {
    /** The name as the files spell it, before the weight and the hash. */
    name: string;
    /** Every file of it, heaviest first. */
    files: { name: string; bytes: number; format: string }[];
    bytes: number;
    /** Formats present. Two of them for the same weight means one is being downloaded for nothing. */
    formats: string[];
    /** Files the page preloads, which are the ones that cost part of the first load. */
    preloaded: string[];
    /**
     * Files in a format that is superseded by another one sitting right next to it: a `.ttf` where
     * a `.woff2` of the same face exists. Not a guess — both files are in the folder.
     */
    superseded: string[];
}

/** An image or a video of the folder. */
export interface MediaFile extends AssetFile {
    kind: 'image' | 'video' | 'audio';
    format: string;
    /** Whether `index.html` asks for it before anything is painted. */
    inPage: boolean;
    /**
     * A modern format of the same picture, sitting next to it. `null` when there is none, which is
     * the ordinary case and the one where no promise is made: this tool never says what a file
     * *would* weigh recompressed, because that figure would be invented.
     */
    modernNeighbour: string | null;
}

/** Two files with the same content under two names. Only reported when the content was compared. */
export interface DuplicateAsset {
    /** The shared content hash, short. It is what makes the claim checkable. */
    hash: string;
    names: string[];
    bytes: number;
    /** Everything but the first copy: bytes shipped for nothing. */
    wasted: number;
}

/** Bytes of a chunk that are really an image inlined as a `data:` URI. */
export interface InlinedData {
    /** The chunk holding them. */
    chunk: string;
    /** How many `data:` URIs it carries. */
    count: number;
    /** Their combined length in the file, which is what actually travels. */
    bytes: number;
    /** The media types found, so the answer is not the same for a font and for forty icons. */
    types: string[];
}

/** The stylesheets one chunk pulls in, read from the chunk's own text. */
export interface ChunkStyles {
    chunk: string;
    styles: string[];
    bytes: number;
}

/**
 * What `index.html` asks for before anything appears, counting everything and not only the scripts.
 *
 * It is the figure the person actually notices, and until now the headline said "bootstrap" while
 * meaning "bootstrap of JavaScript". The breakdown travels with the total on purpose: a single
 * number nobody can take apart is a number nobody trusts.
 */
export interface FirstTrip {
    scripts: number;
    styles: number;
    fonts: number;
    images: number;
    total: number;
    /** How many files it is, which is the other half of what a first load costs. */
    files: number;
}

export interface AssetReport {
    /** Every file of the folder with what it is, so nothing is silently left out of the counts. */
    files: (AssetFile & { kind: AssetKind })[];
    fonts: FontFamily[];
    media: MediaFile[];
    /**
     * The scripts the page prefetches: fetched on this visit, for a navigation that may not happen.
     * Deliberately outside every first-load figure and deliberately not thrown away — a framework
     * that prefetches its whole route table makes the per-screen split mean something else.
     */
    prefetched: { name: string; bytes: number }[];
    prefetchedBytes: number;
    /** Files nothing names: not the page, not the CSS, not any chunk. */
    unreferenced: AssetFile[];
    /** `null` when the folder held no text to search, so "nothing is unreferenced" is never guessed. */
    referencesRead: boolean;
    duplicates: DuplicateAsset[];
    /** `false` when nothing hashed the files, so the empty list means "not compared", not "none". */
    contentCompared: boolean;
    inlined: InlinedData[];
    /** Total bytes of `data:` URIs across every chunk. */
    inlinedBytes: number;
    stylesByChunk: ChunkStyles[];
    firstTrip: FirstTrip;
    /**
     * The names `index.html` asks for before anything appears — scripts, stylesheets, preloads, the
     * images written into the page.
     *
     * It is carried out of here rather than recomputed by each reader, because two readers disagreed
     * about it once: the caching figures only knew the scripts, so a `favicon.svg` the page names
     * was reported as a file nothing asks for, in the same report where the picture list said it
     * was in the page.
     */
    inPage: string[];
}
