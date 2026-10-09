/**
 * The disk side of the command: the same inputs the page takes by drag and drop, read from paths.
 * Nothing here computes anything — that is `report.ts` — so what differs between the browser and
 * the terminal stays in one file.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { brotliCompressSync, createGzip, gzipSync } from 'node:zlib';
import { analyze } from '../../src/app/core/analysis/analysis';
import { foreignFormat, type Metafile } from '../../src/app/core/analysis/metafile.types';
import { isScriptMapName, readSourceMaps } from '../../src/app/core/analysis/sourcemap/sourcemap';
import { type TextFile } from '../../src/app/core/analysis/sourcemap/sourcemap.types';
import { firstTripIn, kindOf, readAssets } from '../../src/app/core/assets/assets';
import { type AssetFile } from '../../src/app/core/assets/assets.types';
import { isSnapshot, snapshotOf } from '../../src/app/core/baseline/baseline';
import { type Snapshot } from '../../src/app/core/baseline/baseline.types';
import {
    announcedIn,
    assetsIn,
    indexHtmlOf,
    inlineScriptsIn,
    originsIn,
    stylesIn,
    titleIn,
} from '../../src/app/core/build-text/index-html';
import { CONFIG_TEXT } from '../../src/app/core/config/config-text';
import { readCriteriaBlock } from '../../src/app/core/config/config-values';
import { isLoadlineConfig } from '../../src/app/core/config/loadline-config';
import { type BuildHints } from '../../src/app/core/config/loadline-config.types';
import { type Criteria } from '../../src/app/core/criteria/criteria.types';
import { readAudit, readLock } from '../../src/app/core/deps/deps';
import { type Advisory, type LockedPackage } from '../../src/app/core/deps/deps.types';
import { type Lang, type UiStrings } from '../../src/app/core/i18n/ui-strings';
import { readFolderGraph } from '../../src/app/core/intake/bundle-graph';
import { type BundleFile } from '../../src/app/core/intake/bundle-graph.types';
import { pageCssOf, withGzipFallback } from '../../src/app/core/intake/dist-files';
import { metafileOf } from '../../src/app/core/intake/webpack-stats';
import {
    EMPTY_CONTEXT,
    readAngularJson,
    readPackageJson,
    readPipeline,
} from '../../src/app/core/project/project-context';
import { type ProjectContext } from '../../src/app/core/project/project-context.types';
import { foreignMessage } from '../../src/app/state/report-messages.utils';
import { ERROR_TEXT, type ErrorStrings } from '../text/text-errors';
import { type DistSizes } from './read-build.types';

/** Something the person can fix by editing the command line, as opposed to a bug in the tool. */
/**
 * A failure of what was given, not of Loadline: exit 2. `say` words it in the language of the run,
 * and `message` is the English, for anything that prints an error without asking which language.
 */
export class InputError extends Error {
    readonly say: (t: ErrorStrings) => string;

    constructor(say: ((t: ErrorStrings) => string) | string) {
        const said = typeof say === 'string' ? (): string => say : say;
        super(said(ERROR_TEXT.en));
        this.say = said;
    }
}

export const exists = async (path: string): Promise<boolean> => {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
};

export const readJson = async (path: string): Promise<unknown> => {
    let text: string;
    try {
        text = await readFile(path, 'utf8');
    } catch {
        throw new InputError(t => t.cannotRead(path));
    }

    try {
        return JSON.parse(text) as unknown;
    } catch {
        throw new InputError(t => t.notJson(path));
    }
};

const filesUnder = async (folder: string): Promise<string[]> => {
    let entries;
    try {
        entries = await readdir(folder, { withFileTypes: true, recursive: true });
    } catch {
        throw new InputError(t => t.cannotReadFolder(folder));
    }

    return entries.filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name));
};

/**
 * The stats file. When it is not one, the format it *is* gets named: a webpack stats.json, a Vite
 * manifest and a visualizer dump are all files somebody can reasonably believe are "the stats of my
 * build", and each has a different one-sentence answer. The page has said this for a while; the
 * command used to answer all three with "not an esbuild metafile", which is true and useless.
 */
export const readStats = async (path: string, t: UiStrings): Promise<Metafile> => {
    const parsed = await readJson(path);
    const meta = metafileOf(parsed);
    if (!meta) {
        throw new InputError(`${path}: ${foreignMessage(foreignFormat(parsed), t)} ${t.errExpected}`);
    }

    return meta;
};

/** Whether what was named is a folder, which is what decides between the two ways of reading. */
export const isFolder = async (path: string): Promise<boolean> => {
    try {
        const info = await stat(path);
        return info.isDirectory();
    } catch {
        return false;
    }
};

/**
 * What a file compresses to. `createGzip()` and the browser's `CompressionStream('gzip')` are both
 * zlib at its default level, so this is the figure the page shows for the same file. Streamed
 * rather than read whole: a build folder runs to tens of megabytes and only the count is wanted.
 */
const gzipSizeOf = async (path: string): Promise<number> => {
    let size = 0;
    const count = new Writable({
        write(chunk: Buffer, _encoding, done) {
            size += chunk.length;
            done();
        },
    });

    await pipeline(createReadStream(path), createGzip(), count);
    return size;
};

/**
 * The folder as the graph reader takes it: paths relative to the folder, with forward slashes on
 * every platform, because that is how a chunk writes `./sibling.js` inside itself.
 */
const bundleFilesOf = (folder: string, paths: readonly string[]): Promise<BundleFile[]> =>
    Promise.all(
        paths.map(async path => {
            const info = await stat(path);
            return {
                path: relative(folder, path).replaceAll('\\', '/'),
                bytes: info.size,
                text: () => readFile(path, 'utf8'),
            };
        }),
    );

/**
 * The build folder. Names are cut down to their last segment, which is how the metafile names its
 * outputs and how the page keys the same figures.
 *
 * @param derive also read the import graph out of the chunks, for a build with no stats file. It
 *               reads every source map on the way, so the maps are never parsed twice.
 */
export const readDist = async (folder: string, derive = false, hints: BuildHints = {}): Promise<DistSizes> => {
    const paths = await filesUnder(folder);
    const gzip = new Map<string, number>();
    const found = new Map<string, number>();
    // The same figures by path inside the folder, for the files that share a name with another.
    const gzipByPath = new Map<string, number>();
    const foundByPath = new Map<string, number>();
    const inside = (path: string): string => relative(folder, path).replaceAll('\\', '/');

    for (const path of paths) {
        const name = basename(path);
        const compressed = /^(.*\.(?:m?js|css))\.(?:br|brotli)$/i.exec(name);
        if (compressed?.[1]) {
            const info = await stat(path);
            found.set(compressed[1], info.size);
            foundByPath.set(inside(path).replace(/\.(?:br|brotli)$/i, ''), info.size);
        } else if (/\.(?:m?js|css)$/i.test(name)) {
            const size = await gzipSizeOf(path);
            gzip.set(name, size);
            gzipByPath.set(inside(path), size);
        }
    }

    if (gzip.size === 0) {
        throw new InputError(t => t.noAssets(folder));
    }
    const brotli = withGzipFallback(found, gzip);

    // The page of the build says which chunks the browser asks for straight away, which is the one
    // thing the import graph cannot work out on its own.
    // Named by its path inside the folder, which is how `build.page` of `loadline.json` names it.
    const page = indexHtmlOf(
        paths.map(path => ({ name: basename(path), path: relative(folder, path), file: path })),
        hints.page,
    );
    const html = page ? await readFile(page.file, 'utf8') : null;

    // What the page asks for besides the code. A render-blocking stylesheet is the strictest
    // "downloaded before anything appears" there is, and it was the one thing the headline of this
    // tool left out.
    const cssRaw = new Map<string, number>();
    for (const path of paths) {
        if (!/\.css$/i.test(path)) {
            continue;
        }
        const info = await stat(path);
        cssRaw.set(basename(path), info.size);
    }
    const pageCss = html ? pageCssOf(stylesIn(html), { raw: cssRaw, gzip, brotli }) : null;

    // --- everything the folder holds besides the code -------------------------------------------
    // The texts are read once and used twice: to find which file names anything mentions, and to
    // count the bytes that are really an image the compiler put inline. The hashes are what turns
    // "two files of the same size" into "the same file twice", which is a claim rather than a hunch.
    const assetFiles: AssetFile[] = await Promise.all(
        paths.map(async path => {
            const info = await stat(path);
            return { path: relative(folder, path).replaceAll('\\', '/'), name: basename(path), bytes: info.size };
        }),
    );

    // Every text file of the folder, not only the code. A web app manifest names the icons and a
    // `robots.txt` names a sitemap: reading only the chunks reported both as files nothing reaches,
    // which is a wrong answer given with the same confidence as a right one.
    const texts = new Map<string, string>();
    for (const path of paths) {
        if (/\.(?:m?js|css|json|webmanifest|xml|txt|svg)$/i.test(path)) {
            texts.set(basename(path), await readFile(path, 'utf8'));
        }
    }

    const hashes = new Map<string, string>();
    for (const path of paths) {
        // Only what a duplicate would be: a font, a picture, a video. Hashing every chunk would
        // compare files whose names already carry a content hash, which answers nothing.
        const uninteresting = new Set(['script', 'map']);
        if (uninteresting.has(kindOf(basename(path)))) {
            continue;
        }
        // Keyed by path: a folder per route writes several `index.html`, and keyed by name they
        // would collapse onto one hash and come out as copies of each other.
        hashes.set(
            relative(folder, path).replaceAll('\\', '/'),
            createHash('sha256')
                .update(await readFile(path))
                .digest('hex'),
        );
    }

    const named = html
        ? assetsIn(html)
        : { referenced: [], preloaded: [], prefetched: [], hrefs: [], icons: [], alternates: [] };
    const assetInput = {
        files: assetFiles,
        html,
        texts,
        hashes,
        inPage: new Set([...named.referenced, ...(html ? announcedIn(html) : []), ...(html ? stylesIn(html) : [])]),
        preloaded: new Set(named.preloaded),
        prefetched: new Set(named.prefetched),
        icons: new Set(named.icons),
        bootChunks: new Set<string>(),
        // The same figures the rest of the report is in, so the first trip and the headline are
        // not the same bytes quoted in two units.
        weigh: brotli.size > 0 ? brotli : gzip,
        weighPath: brotli.size > 0 ? withGzipFallback(foundByPath, gzipByPath) : gzipByPath,
    };
    const assets = readAssets(assetInput);
    // The first trip in every unit the folder can give, because which one the report is in is only
    // decided later, by `--mode`.
    // The scripts written inside the page, compressed the way the page itself would travel.
    const inline = html ? inlineScriptsIn(html) : '';
    const inlineBytes = inline
        ? { raw: Buffer.byteLength(inline), gzip: gzipSync(inline).length, brotli: brotliCompressSync(inline).length }
        : { raw: 0, gzip: 0, brotli: 0 };
    const firstTrips: DistSizes['firstTrips'] = {
        raw: firstTripIn(assetInput, null, null, inlineBytes.raw),
        gzip: firstTripIn(assetInput, gzip, gzipByPath, inlineBytes.gzip),
        ...(brotli.size > 0 && { brotli: firstTripIn(assetInput, brotli, assetInput.weighPath, inlineBytes.brotli) }),
    };

    const bundle = derive ? await bundleFilesOf(folder, paths) : [];
    const graph = derive ? await readFolderGraph(bundle, html, hints) : null;

    const mapped: TextFile[] = paths
        .filter(path => /\.m?js$/.test(path) || isScriptMapName(path))
        .map(path => ({ name: basename(path), text: () => readFile(path, 'utf8') }));
    const splits = graph?.splits ?? (await readSourceMaps(mapped));

    return {
        gzip,
        brotli: brotli.size > 0 ? brotli : null,
        splits: splits.size > 0 ? splits : null,
        announced: html ? new Set(announcedIn(html)) : null,
        graph,
        pageCss,
        assets,
        firstTrips,
        pageTitle: html ? titleIn(html) : null,
        hrefs: named.hrefs,
        pageOrigins: html ? originsIn(html) : null,
        // The chunk texts are already in memory for the reference search; they are handed on rather
        // than read a second time. The maps are read here for the same reason.
        // The page too, for what its inline scripts carry: they are downloaded like any chunk.
        texts: new Map([
            ...[...texts].filter(([name]) => /\.(?:m?js|css)$/i.test(name)),
            ...(page && html ? [[page.name, html] as const] : []),
        ]),
        maps: await Promise.all(
            paths
                .filter(path => isScriptMapName(path))
                .map(async path => ({ name: basename(path), text: await readFile(path, 'utf8') })),
        ),
    };
};

/**
 * The lock file and the audit report: two files the person already has, read through the same door
 * `angular.json` goes through.
 *
 * Both are optional and both are `null` when absent rather than empty, because "nobody ran an
 * audit" and "the audit found nothing" are different statements and a report that conflates them
 * is telling somebody they are safe when nothing checked.
 */
export const readDepsFiles = async (
    lockPath: string | null,
    auditPath: string | null,
): Promise<{ lock: LockedPackage[] | null; advisories: Advisory[] | null; lockDirect: string[] | null }> => {
    let lock: LockedPackage[] | null = null;
    let lockDirect: string[] | null = null;
    if (lockPath) {
        const text = await readFile(lockPath, 'utf8').catch(() => null);
        if (text === null) {
            throw new InputError(t => t.cannotRead(lockPath));
        }
        lock = readLock(basename(lockPath), text);
        if (!lock) {
            throw new InputError(t => t.notLock(lockPath));
        }
        // What the project asked for by name, from the package.json every lock file sits next to.
        // Without it "shipped but never asked for" needed --project too, the help did not say so,
        // and --lock on its own changed nothing anybody could see.
        const manifest = await readFile(join(dirname(lockPath), 'package.json'), 'utf8').catch(() => null);
        const pkg = manifest === null ? null : readPackageJson(safeParse(manifest));
        lockDirect = pkg ? pkg.dependencies : null;
    }

    let advisories: Advisory[] | null = null;
    if (auditPath) {
        const text = await readFile(auditPath, 'utf8').catch(() => null);
        if (text === null) {
            throw new InputError(t => t.cannotRead(auditPath));
        }
        advisories = readAudit(text);
        if (!advisories) {
            throw new InputError(t => t.notAudit(auditPath));
        }
    }

    return { lock, advisories, lockDirect };
};

/**
 * The `name` of the `package.json` the build sits under, to call the report by. A few levels up and
 * no further: a build lives inside its project — `dist/app/browser` — and a folder copied somewhere
 * else would otherwise be named after whatever `package.json` the walk happened to reach.
 */
export const nearestPackageName = async (from: string): Promise<string | null> => {
    let folder = from;
    for (let level = 0; level < 4; level++) {
        const manifest = await readFile(join(folder, 'package.json'), 'utf8').catch(() => null);
        if (manifest !== null) {
            return readPackageJson(safeParse(manifest))?.name ?? null;
        }
        const parent = dirname(folder);
        if (parent === folder) {
            return null;
        }
        folder = parent;
    }
    return null;
};

const safeParse = (text: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

/**
 * The baseline: an analysis exported from Loadline, which carries the unit it was measured in, or a
 * previous `stats.json`, which can only be compared raw because nothing there says what its files
 * compressed to.
 */
export const readBaseline = async (path: string): Promise<Snapshot> => {
    const parsed = await readJson(path);
    if (isSnapshot(parsed)) {
        return parsed;
    }
    const meta = metafileOf(parsed);
    if (!meta) {
        throw new InputError(t => t.notStats(path));
    }

    const info = await stat(path);
    // Named by the path it was given rather than by its file name: two builds compared in CI are
    // both called stats.json, and "compared against stats.json" says nothing.
    return snapshotOf(analyze(meta, null), 'raw', path, info.mtime);
};

/**
 * Pipeline files that sit at the root of a project, one name per CI.
 *
 * It was GitLab's two names and GitHub's folder. Everything else — Azure, Bitbucket, CircleCI,
 * Jenkins — was simply not looked for, so the budget check quietly did half its job on those
 * projects and said nothing about it.
 */
const PIPELINE_NAMES = [
    '.gitlab-ci.yml',
    '.gitlab-ci.yaml',
    'azure-pipelines.yml',
    'azure-pipelines.yaml',
    'bitbucket-pipelines.yml',
    'bitbucket-pipelines.yaml',
    'Jenkinsfile',
];

/** Folders where a CI keeps one file per pipeline. */
const PIPELINE_FOLDERS = [['.github', 'workflows'], ['.circleci']];

/** The pipeline files worth looking for, in the places projects keep them. */
const pipelinePaths = async (folder: string): Promise<string[]> => {
    const found: string[] = [];
    for (const name of PIPELINE_NAMES) {
        const path = join(folder, name);
        if (await exists(path)) {
            found.push(path);
        }
    }

    for (const segments of PIPELINE_FOLDERS) {
        const directory = join(folder, ...segments);
        if (!(await exists(directory))) {
            continue;
        }
        const paths = await filesUnder(directory);
        found.push(...paths.filter(path => /\.ya?ml$/i.test(path)));
    }

    return found;
};

/**
 * The project's own configuration, for the budget checks. A missing file is not an error: each one
 * adds a check, and a project with no pipeline file still gets everything `angular.json` allows.
 */
export const readProject = async (folder: string): Promise<ProjectContext> => {
    const angularPath = join(folder, 'angular.json');
    const packagePath = join(folder, 'package.json');

    // `package.json` first: the build commands of the pipeline resolve through its scripts.
    const pkg = (await exists(packagePath)) ? readPackageJson(await readJson(packagePath)) : null;
    const angular = (await exists(angularPath)) ? readAngularJson(await readJson(angularPath)) : null;

    const pipelines = [];
    const paths = await pipelinePaths(folder);
    for (const path of paths) {
        pipelines.push(readPipeline(basename(path), await readFile(path, 'utf8'), pkg?.scripts ?? {}));
    }

    if (!pkg && !angular && pipelines.length === 0) {
        throw new InputError(t => t.noProject(folder));
    }

    return { ...EMPTY_CONTEXT, angular, pkg, pipelines };
};

/**
 * A thresholds file: the same keys the page edits, either as a bare object or as the `criteria`
 * block of a `loadline.json`. Values are written as in `loadline.json` — `"170kB"` or bytes,
 * `"25%"` or a fraction. Every key is optional and replaces one recommended value; anything that
 * cannot be read is rejected rather than ignored, because a typo that silently does nothing is the
 * worst way for a gate to be wrong.
 */
export const readCriteria = async (path: string, lang: Lang = 'en'): Promise<Partial<Criteria>> => {
    const parsed = await readJson(path);
    const block = isLoadlineConfig(parsed) ? parsed.criteria : parsed;
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
        throw new InputError(t => t.notThresholds(path));
    }

    // Without "the recommended value stays", which is what `loadline.json` does with a value it
    // cannot read: here the run stops, and the sentence promised a report that never came.
    const { criteria, problems } = readCriteriaBlock(block, {
        ...CONFIG_TEXT[lang],
        recommendedStays: problem => problem,
    });
    if (problems[0]) {
        throw new InputError(`${path}: ${problems[0]}`);
    }
    return criteria ?? {};
};
