/**
 * The disk side of the command: the same inputs the page takes by drag and drop, read from paths.
 * Nothing here computes anything — that is `report.ts` — so what differs between the browser and
 * the terminal stays in one file.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { analyze } from '../src/app/core/analysis/analysis';
import { foreignFormat, isMetafile, type Metafile } from '../src/app/core/analysis/metafile.types';
import { readSourceMaps } from '../src/app/core/analysis/sourcemap';
import { type TextFile } from '../src/app/core/analysis/sourcemap.types';
import { kindOf, readAssets } from '../src/app/core/assets/assets';
import { type AssetFile } from '../src/app/core/assets/assets.types';
import { isSnapshot, snapshotOf } from '../src/app/core/baseline/baseline';
import { type Snapshot } from '../src/app/core/baseline/baseline.types';
import { readConfig } from '../src/app/core/config/loadline-config';
import { type LoadlineConfig } from '../src/app/core/config/loadline-config.types';
import { RECOMMENDED } from '../src/app/core/criteria/criteria';
import { type Criteria } from '../src/app/core/criteria/criteria.types';
import { readAudit, readLock } from '../src/app/core/deps/deps';
import { type Advisory, type LockedPackage } from '../src/app/core/deps/deps.types';
import { type UiStrings } from '../src/app/core/i18n/ui-strings';
import { readBundleGraph } from '../src/app/core/intake/bundle-graph';
import { type BundleFile } from '../src/app/core/intake/bundle-graph.types';
import { pageCssOf } from '../src/app/core/intake/dist-files';
import { announcedIn, assetsIn, indexHtmlOf, originsIn, scriptsIn, stylesIn } from '../src/app/core/intake/index-html';
import { EMPTY_CONTEXT, readAngularJson, readPackageJson, readPipeline } from '../src/app/core/project/project-context';
import { type ProjectContext } from '../src/app/core/project/project-context.types';
import { foreignMessage } from '../src/app/state/report-messages.utils';
import { type DistSizes } from './read-build.types';

/** Something the person can fix by editing the command line, as opposed to a bug in the tool. */
export class InputError extends Error {}

/**
 * `loadline.json`, from the path given or from the working directory.
 *
 * Found rather than required on purpose: the file is meant to be committed next to the code, and a
 * tool that only reads its configuration when told to is a tool whose configuration drifts. An
 * explicit `--config` that does not exist **is** an error — somebody asked for a file — while a
 * missing one in the working directory is simply the ordinary case.
 */
export const readLoadlineConfig = async (
    given: string | null,
    cwd: string,
): Promise<{ config: LoadlineConfig | null; problems: string[]; name: string | null }> => {
    const path = given ?? join(cwd, 'loadline.json');
    if (!given && !(await exists(path))) {
        return { config: null, problems: [], name: null };
    }

    const parsed = await readJson(path);
    const { config, problems } = readConfig(parsed);
    return { config, problems, name: config ? path : null };
};

const exists = async (path: string): Promise<boolean> => {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
};

const readJson = async (path: string): Promise<unknown> => {
    let text: string;
    try {
        text = await readFile(path, 'utf8');
    } catch {
        throw new InputError(`Could not read ${path}.`);
    }

    try {
        return JSON.parse(text) as unknown;
    } catch {
        throw new InputError(`${path} is not valid JSON.`);
    }
};

const filesUnder = async (folder: string): Promise<string[]> => {
    let entries;
    try {
        entries = await readdir(folder, { withFileTypes: true, recursive: true });
    } catch {
        throw new InputError(`Could not read the folder ${folder}.`);
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
    if (!isMetafile(parsed)) {
        throw new InputError(`${path}: ${foreignMessage(foreignFormat(parsed), t)} ${t.errExpected}`);
    }

    return parsed;
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
export const readDist = async (folder: string, derive = false): Promise<DistSizes> => {
    const paths = await filesUnder(folder);
    const gzip = new Map<string, number>();
    const brotli = new Map<string, number>();

    for (const path of paths) {
        const name = basename(path);
        const compressed = /^(.*\.(?:m?js|css))\.(?:br|brotli)$/i.exec(name);
        if (compressed?.[1]) {
            const info = await stat(path);
            brotli.set(compressed[1], info.size);
        } else if (/\.(?:m?js|css)$/i.test(name)) {
            gzip.set(name, await gzipSizeOf(path));
        }
    }

    if (gzip.size === 0) {
        throw new InputError(`No .js or .css files under ${folder}. Is that the browser/ folder of the build?`);
    }

    // The page of the build says which chunks the browser asks for straight away, which is the one
    // thing the import graph cannot work out on its own.
    const page = indexHtmlOf(paths.map(path => ({ name: basename(path), path })));
    const html = page ? await readFile(page.path, 'utf8') : null;

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
        const uninteresting = new Set(['script', 'style', 'map']);
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

    const named = html ? assetsIn(html) : { referenced: [], preloaded: [], prefetched: [], hrefs: [] };
    const assets = readAssets({
        files: assetFiles,
        html,
        texts,
        hashes,
        inPage: new Set([...named.referenced, ...(html ? announcedIn(html) : []), ...(html ? stylesIn(html) : [])]),
        preloaded: new Set(named.preloaded),
        prefetched: new Set(named.prefetched),
        bootChunks: new Set<string>(),
        // The same figures the rest of the report is in, so the first trip and the headline are
        // not the same bytes quoted in two units.
        weigh: brotli.size > 0 ? brotli : gzip,
    });

    const bundle = derive ? await bundleFilesOf(folder, paths) : [];
    const graph = derive ? await readBundleGraph(bundle, new Set(html ? scriptsIn(html).entries : [])) : null;

    const mapped: TextFile[] = paths
        .filter(path => /\.m?js(?:\.map)?$/.test(path))
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
        hrefs: named.hrefs,
        pageOrigins: html ? originsIn(html) : null,
        // The chunk texts are already in memory for the reference search; they are handed on rather
        // than read a second time. The maps are read here for the same reason.
        texts: new Map([...texts].filter(([name]) => /\.(?:m?js|css)$/i.test(name))),
        maps: await Promise.all(
            paths
                .filter(path => /\.m?js\.map$/i.test(path))
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
): Promise<{ lock: LockedPackage[] | null; advisories: Advisory[] | null }> => {
    let lock: LockedPackage[] | null = null;
    if (lockPath) {
        const text = await readFile(lockPath, 'utf8').catch(() => null);
        if (text === null) {
            throw new InputError(`Could not read ${lockPath}.`);
        }
        lock = readLock(basename(lockPath), text);
        if (!lock) {
            throw new InputError(`${lockPath} is not a package-lock.json, a pnpm-lock.yaml or a yarn.lock.`);
        }
    }

    let advisories: Advisory[] | null = null;
    if (auditPath) {
        const text = await readFile(auditPath, 'utf8').catch(() => null);
        if (text === null) {
            throw new InputError(`Could not read ${auditPath}.`);
        }
        advisories = readAudit(text);
        if (!advisories) {
            throw new InputError(`${auditPath} is not the JSON output of npm audit or pnpm audit.`);
        }
    }

    return { lock, advisories };
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
    if (!isMetafile(parsed)) {
        throw new InputError(`${path} is neither a stats.json nor an analysis exported from Loadline.`);
    }

    const info = await stat(path);
    // Named by the path it was given rather than by its file name: two builds compared in CI are
    // both called stats.json, and "compared against stats.json" says nothing.
    return snapshotOf(analyze(parsed, null), 'raw', path, info.mtime);
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
        if (await exists(directory)) {
            const paths = await filesUnder(directory);
            found.push(...paths.filter(path => /\.ya?ml$/i.test(path)));
        }
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
        throw new InputError(`No angular.json, package.json or pipeline file under ${folder}.`);
    }

    return { ...EMPTY_CONTEXT, angular, pkg, pipelines };
};

/**
 * A thresholds file: the same keys the page edits, sizes in bytes and coverages as fractions. Every
 * key is optional and replaces one recommended value; an unknown key is rejected rather than
 * ignored, because a typo that silently does nothing is the worst way for a gate to be wrong.
 */
export const readCriteria = async (path: string): Promise<Partial<Criteria>> => {
    const parsed = await readJson(path);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new InputError(`${path} has to be an object of thresholds.`);
    }

    const known = new Set(Object.keys(RECOMMENDED.raw));
    const criteria: Partial<Criteria> = {};

    for (const [key, value] of Object.entries(parsed)) {
        if (!known.has(key)) {
            throw new InputError(`${path}: "${key}" is not one of the criteria.`);
        }
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            throw new InputError(`${path}: "${key}" has to be a number.`);
        }
        criteria[key as keyof Criteria] = value;
    }

    return criteria;
};
