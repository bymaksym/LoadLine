import { isSnapshot } from '../baseline/baseline';
import { isLoadlineConfig } from '../config/loadline-config';
import { type BundleFile } from './bundle-graph.types';
import { knownHashOf } from './embedded';
import { metafileOf } from './webpack-stats';

/** Which of the dropped files goes where. Decided by name first, by content when the name says nothing. */
export type IntakeKind = 'stats' | 'baseline' | 'context' | 'lock' | 'audit' | 'config' | 'unknown';

/** The files that make up the build output, the only ones worth compressing. */
export const isAsset = (name: string): boolean => /\.(?:m?js|css)$/i.test(name);

/**
 * What a build's stats file is called, newest first: Angular's metafile from 22.2 and before it,
 * the webpack stats Angular 8 to 11 write with differential loading, Create React App's `--stats`
 * and Vue CLI's `--report-json`. The page and the command look for the same names; a name says
 * where to look, and the content still decides (`metafileOf`).
 */
export const STATS_NAMES = [
    'browser-stats.json',
    'stats.json',
    'stats-es2015.json',
    'bundle-stats.json',
    'report.json',
] as const;

/** The stats file among some files, by the order of `STATS_NAMES`. */
export const statsFileIn = <T extends { name: string }>(files: readonly T[]): T | null => {
    for (const name of STATS_NAMES) {
        const found = files.find(file => file.name === name);
        if (found) {
            return found;
        }
    }
    return null;
};

/** The same among dropped files, when it is one: a `report.json` that is no stats file stays a file. */
export const droppedStats = async (files: readonly File[]): Promise<File | null> => {
    const named = statsFileIn(files);
    return named && (await sniff(named)) === 'stats' ? named : null;
};

/**
 * Files worth reading as text, to find which names anything in the folder mentions.
 *
 * More than the code on purpose: a web app manifest names the icons and a `robots.txt` names a
 * sitemap. Reading only the chunks reported both of those as files nothing reaches — a wrong
 * answer given with exactly the same confidence as a right one.
 */
export const isSearchable = (name: string): boolean => /\.(?:m?js|css|json|webmanifest|xml|txt|svg)$/i.test(name);

/**
 * The content hash of a file, for telling "two files of the same size" from "the same file twice".
 *
 * Only worth doing on what a duplicate would be — a font, a picture — and only below a size where
 * reading the whole thing into memory is reasonable. A fifty-megabyte video is left uncompared and
 * the report says so, rather than reporting "no duplicates" and meaning "nobody looked".
 */
export const hashOf = async (file: File): Promise<string | null> => {
    // A report written by `--html` brings the hash instead of the bytes.
    const known = knownHashOf(file);
    if (known) {
        return known;
    }
    // Read as possibly absent: `crypto.subtle` is undefined outside a secure context (a page opened
    // over plain http), whatever lib.dom says.
    const subtle = (crypto as { subtle?: SubtleCrypto }).subtle;
    if (file.size > 8 * 1024 * 1024 || !subtle) {
        return null;
    }

    const digest = await subtle.digest('SHA-256', await file.arrayBuffer());
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Files read for the project context: what the pipeline builds and which budgets apply.
 *
 * Any YAML is accepted, because a pipeline file can be called anything and asking somebody to
 * rename theirs would be worse. What a dropped `docker-compose.yml` gets is not a place in the
 * report: whether it actually is a pipeline is decided after reading it, by whether anything in it
 * looks like a build.
 */
export const isContextName = (name: string): boolean =>
    name === 'angular.json' || name === 'package.json' || /\.ya?ml$/i.test(name) || /^jenkinsfile$/i.test(name);

/** A lock file, in any of the three formats a package manager writes. */
export const isLockName = (name: string): boolean =>
    /^(?:package-lock|npm-shrinkwrap)\.json$/i.test(name) || /^(?:pnpm-lock\.ya?ml|yarn\.lock)$/i.test(name);

/**
 * What a file compresses to, done in the browser. Streamed rather than read whole: a build folder
 * is tens of megabytes, and nothing here needs the bytes themselves, only how many come out.
 */
export const gzipSize = async (file: File): Promise<number> => {
    const stream = file.stream().pipeThrough(new CompressionStream('gzip'));
    const reader = stream.getReader();
    let size = 0;

    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            size += value.length;
        }
    } finally {
        reader.releaseLock();
    }

    return size;
};

/**
 * Where a picked file sits inside the folder: `browser/assets/a.js` picked as `browser` is
 * `assets/a.js`. The file name when the browser gave no path.
 */
export const pathInside = (file: File): string =>
    (file.webkitRelativePath || '').split('/').slice(1).join('/') || file.name;

/**
 * Every asset of the folder, compressed. Keyed by file name, which is how the metafile names them.
 *
 * @param byPath filled with the same figures by path inside the folder, for the files that share a
 *               name: keyed by name, 25 `plugin.min.js` all weigh the last one compressed.
 */
export const gzipSizes = async (
    files: File[],
    onProgress?: (done: number, total: number) => void,
    byPath?: Map<string, number>,
): Promise<Map<string, number>> => {
    const sizes = new Map<string, number>();
    for (const [index, file] of files.entries()) {
        const size = await gzipSize(file);
        sizes.set(file.name, size);
        byPath?.set(pathInside(file), size);
        // Tens of megabytes go through here one file at a time, and the page used to say nothing
        // about it beyond one line of grey text that never changed.
        onProgress?.(index + 1, files.length);
    }

    return sizes;
};

/**
 * Sizes of the pre-compressed files of the folder. Nothing has to be decompressed: the size of a
 * `.br` file *is* the brotli figure.
 */
export const brotliSizes = (files: File[], byPath = false): Map<string, number> => {
    const sizes = new Map<string, number>();
    for (const file of files) {
        // `.br` is what every server and every plugin writes; `.brotli` turns up often enough that
        // not reading it means silently showing gzip figures on a folder that had brotli ones.
        const found = /^(.*\.(?:m?js|css))\.(?:br|brotli)$/i.exec(file.name);
        if (found?.[1]) {
            sizes.set(byPath ? pathInside(file).replace(/\.(?:br|brotli)$/i, '') : found[1], file.size);
        }
    }

    return sizes;
};

/**
 * The brotli figures with a gzip one wherever a file brought no `.br` of its own.
 *
 * Pre-compressing plugins skip small files — vite-plugin-compression below 1 kB — and the server
 * then sends that file the way it sends anything else, gzip. Without this a file with no `.br` was
 * missing from the brotli figures, and the analysis reads "not in the figures" as "not a file of
 * this folder": a Vue build lost `runtime-core` from its bootstrap (18 kB instead of 40) and a whole
 * screen from its table, under a line calling it the server side of a rendered build.
 */
export const withGzipFallback = (
    brotli: ReadonlyMap<string, number>,
    gzip: ReadonlyMap<string, number>,
): Map<string, number> => {
    const complete = new Map(brotli);
    if (complete.size === 0) {
        return complete;
    }
    for (const [name, bytes] of gzip) {
        if (!complete.has(name)) {
            complete.set(name, bytes);
        }
    }
    return complete;
};

/**
 * The picked folder as the folder reader takes it: each file with its path **inside** the folder.
 *
 * A directory picker reports `browser/assets/main-A1B2C3.js`, which names the folder somebody
 * happened to pick; what a chunk writing `./sibling.js` means is `assets/sibling.js`, from the root
 * of the build. Dropping the first segment is what makes the two line up.
 */
export const bundleFilesOf = (files: readonly File[]): BundleFile[] =>
    files.map(file => ({ path: pathInside(file), bytes: file.size, text: () => file.text() }));

/** What a dropped file is, without loading it. Cheap: reads the name, then the JSON if needed. */
export const sniff = async (file: File): Promise<IntakeKind> => {
    // A lock file is decided by its name, before anything is read: `pnpm-lock.yaml` would otherwise
    // be taken for a pipeline by the rule above, which accepts any YAML.
    if (isLockName(file.name)) {
        return 'lock';
    }
    if (isContextName(file.name)) {
        return 'context';
    }
    if (!/\.json$/i.test(file.name)) {
        return 'unknown';
    }

    try {
        const parsed: unknown = JSON.parse(await file.text());
        if (isSnapshot(parsed)) {
            return 'baseline';
        }
        if (isLoadlineConfig(parsed)) {
            return 'config';
        }
        if (metafileOf(parsed)) {
            return 'stats';
        }
        // An audit report has no name of its own — people redirect it to whatever they like — so it
        // is recognised by the two shapes npm and pnpm write.
        const shape = parsed as { vulnerabilities?: unknown; advisories?: unknown };
        return shape.vulnerabilities || shape.advisories ? 'audit' : 'unknown';
    } catch {
        return 'unknown';
    }
};

/**
 * What the page asks for before it can paint, besides the code.
 *
 * Three figures rather than one because the report is shown in three units, and a stylesheet
 * quoted in gzip next to a bootstrap quoted in raw bytes would be the same mistake this exists to
 * fix. `brotli` is `null` unless the folder carried the pre-compressed files.
 */
export interface PageCss {
    files: string[];
    raw: number;
    gzip: number;
    brotli: number | null;
}

/**
 * The stylesheets the page names, weighed with the same maps every other figure is weighed with.
 *
 * A name the folder does not hold is dropped rather than counted as zero: a page left over from
 * another build would otherwise add a stylesheet of no bytes to the first load and say nothing.
 */
export const pageCssOf = (
    named: readonly string[],
    sizes: { raw: ReadonlyMap<string, number>; gzip: ReadonlyMap<string, number>; brotli: ReadonlyMap<string, number> },
): PageCss | null => {
    const files = named.filter(name => sizes.raw.has(name));
    if (files.length === 0) {
        return null;
    }

    const total = (from: ReadonlyMap<string, number>) => files.reduce((sum, file) => sum + (from.get(file) ?? 0), 0);
    const brotli = files.every(file => sizes.brotli.has(file)) ? total(sizes.brotli) : null;

    return { files, raw: total(sizes.raw), gzip: total(sizes.gzip), brotli };
};
