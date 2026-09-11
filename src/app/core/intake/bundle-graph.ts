/**
 * The import graph read out of the compiled folder itself, for the builds that write no stats file.
 *
 * An ES module bundle carries its own graph in plain sight: `import{a}from"./chunk-X.js"` keeps two
 * files together, `import("./chunk-Y.js")` is the lazy boundary, and both are written in the code
 * that ships. Nothing else is needed to answer what the report answers — what the first load pulls
 * in, what a screen adds on top, and what several screens pay for twice. That is why this reads the
 * folder rather than a format: `stats.json` belongs to esbuild, and everything built on Vite,
 * Rollup or Rolldown never writes one.
 *
 * Two things are deliberately not attempted:
 *
 * - **A JavaScript parser.** Specifiers are found with regular expressions, which will also match
 *   the odd string inside a comment or a template. What makes that harmless is the last step: a
 *   match is only kept when the file it points at **exists in the folder**. The list of files is
 *   already there, so a false positive points at nothing and drops out on its own.
 * - **The imports between source files.** The bundler erased them: inside one chunk there is no
 *   `import` statement left to read. What the source maps do give is which source each stretch of
 *   generated code came from, and that answers the two questions that matter — what each chunk
 *   carries, and which file wrote each dynamic import. The chain from the entry to a package, which
 *   needs file-to-file edges, is the one thing a folder cannot answer and the report leaves empty.
 */

import { type Metafile, type MetafileImport, type MetafileOutput } from '../analysis/metafile.types';
import { bytesBySource, isSourceMap, segmentsOf, sourceAt, sourcePathOf } from '../analysis/sourcemap';
import { type ChunkSplit, type Segment, type SourceMap } from '../analysis/sourcemap.types';
import { baseName } from '../format/format.utils';
import { type BundleFile, type BundleGraph } from './bundle-graph.types';

const JS_FILE = /\.m?js$/i;

/**
 * `import … from "x"`, `export … from "x"` and the bare `import "x"`. All three make the browser
 * fetch the other file as soon as it has parsed this one, which is the only thing that matters
 * here. The character class stops at `;` so a match cannot run past the end of its statement.
 */
const STATIC_IMPORT = /\b(?:import|export)\b(?:[^'"`;()]*\bfrom\s*)?['"]([^'"]+)['"]/g;

/** `import("x")` in the three quotes a minifier may leave behind — Rolldown writes backticks. */
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g;

/** Vite's table of preloadable files, written once at the top of any chunk that needs one. */
const MAP_DEPS_TABLE = /__vite__mapDeps\s*=[^[]*\[([^\]]*)\]/;

/** Each use of that table: the indices of the files that one dynamic import asks for. */
const MAP_DEPS_CALL = /__vite__mapDeps\(\s*\[([^\]]*)\]\s*\)/g;

/** The same list written out instead of indexed, which is what an unminified build carries. */
const PATH_LIST = /\[\s*(?:['"`][^'"`\]]+['"`]\s*,\s*)+['"`][^'"`\]]+['"`]\s*\]/g;

/** The quoted strings of a list, whatever quote it was written with. */
const QUOTED = /['"`]([^'"`]+)['"`]/g;

/**
 * What a bundler that resolves imports at run time leaves behind in its entry chunk: webpack's
 * module table, Turbopack's, and the marker Next writes next to them. None of these builds has a
 * graph in the file — the imports are numbers the loader looks up — so reading one as if it did
 * produces a report of one chunk and no screens, which is the worst possible answer: confident,
 * detailed and wrong.
 *
 * ⚠️ Each of these matches the **shape** of the registry being written, not the mere mention of a
 * name. The first version looked for `webpackChunk` anywhere and Loadline refused its own build,
 * because this very file talks about webpack and ends up in the bundle. Anything that writes about
 * bundlers — a tool, a blog, a documentation site — would have been refused the same way.
 *
 * ⚠️ The registry is assigned with `=` or with `||=`, and both have to be here. webpack used to
 * write `self.webpackChunkX=self.webpackChunkX||[]`; when the output targets browsers that have
 * logical assignment it writes `globalThis.webpackChunkX||=[]` instead, and only the second form
 * survives in a Create React App build. Matching just `=` let one through: Loadline read a
 * `react-scripts build` as a good build — one bootstrap, zero screens, "nothing stands out" — which
 * is the same failure Next.js produced before it was checked, from the same rule missing a shape.
 * `__webpack_require__` is no help as a fallback here: the minifier mangles it to one letter.
 */
const LOADER_RUNTIME = /webpackChunk\w*\s*(?:\|\|)?=|__webpack_require__\s*\(|globalThis\.TURBOPACK|__next_f\.push/;

/** Where a chunk says its map is. Absent from a build that ships none, which is most of them. */
const MAP_URL = /\/\/#\s*sourceMappingURL=(\S+)/;

/** The hash a bundler appends to a chunk name, which is not part of the module it came from. */
const HASH = /-[\w-]{8,}$/;

/**
 * A specifier written inside a chunk turned into the path of another file of the folder.
 *
 * Two shapes turn up and they resolve differently: `./sibling.js` is relative to the chunk that
 * wrote it, and `assets/other.js` — how Vite writes its preload lists — is relative to the root of
 * the folder. Whatever resolves to nothing in the folder, a bare `react` included, is not a file of
 * this build and the caller drops it.
 */
export const resolveFrom = (chunk: string, specifier: string): string => {
    const slash = chunk.lastIndexOf('/');
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    const segments = relative && slash !== -1 ? chunk.slice(0, slash).split('/') : [];

    for (const part of specifier.replace(/^\//, '').split('/')) {
        if (part === '' || part === '.') {
            continue;
        }
        if (part === '..') {
            segments.pop();
        } else {
            segments.push(part);
        }
    }

    return segments.join('/');
};

/** The offset every line starts at, so a match in the text can be looked up in the map. */
const lineStartsOf = (code: string): number[] => {
    const starts = [0];
    for (let index = code.indexOf('\n'); index !== -1; index = code.indexOf('\n', index + 1)) {
        starts.push(index + 1);
    }

    return starts;
};

/** An offset in the text as the line and column a source map is keyed by. */
const positionOf = (starts: readonly number[], offset: number): { line: number; column: number } => {
    let low = 0;
    let high = starts.length - 1;

    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if ((starts[middle] ?? 0) <= offset) {
            low = middle;
        } else {
            high = middle - 1;
        }
    }

    return { line: low, column: offset - (starts[low] ?? 0) };
};

/** What one chunk turned out to say, before anything is known about the rest of the folder. */
interface ReadChunk {
    /** Chunks it pulls along: the browser asks for these as soon as it has parsed this one. */
    statics: string[];
    /** Chunks it only asks for when something happens, with the source file that asked. */
    dynamics: { target: string; from: string | null }[];
    /** Sets of files Vite fetches in one go, from the preload lists baked into those calls. */
    groups: string[][];
    /** Weight of each source inside this chunk, as the map named them. Empty without a map. */
    split: ChunkSplit;
    /** Sources in the order the map lists them, which is the order the bundler wrote them in. */
    sources: string[];
}

/** Every file name of a preload list, resolved, or `null` when one of them is not a file here. */
const groupOf = (names: readonly string[], exists: (path: string) => boolean): string[] | null => {
    const paths = names.map(name => resolveFrom('', name));
    return paths.length > 1 && paths.every(path => path !== '' && exists(path)) ? paths : null;
};

/**
 * The preload lists of a chunk: the sets of files Vite asks for in one go.
 *
 * Vite does not wait for a lazy chunk to arrive and be parsed before fetching what that chunk
 * imports; it bakes the list into the call and fires the whole set off at once. Angular does not do
 * this. Without reading these, every screen of a Vite application would be counted one round trip
 * deeper than it is.
 */
const groupsIn = (code: string, exists: (path: string) => boolean): string[][] => {
    const groups: string[][] = [];
    const table = MAP_DEPS_TABLE.exec(code);
    const files = table ? [...(table[1] ?? '').matchAll(QUOTED)].map(match => match[1] ?? '') : [];

    for (const call of code.matchAll(MAP_DEPS_CALL)) {
        const names = (call[1] ?? '').split(',').map(index => files[Number(index.trim())] ?? '');
        const group = groupOf(names, exists);
        if (group) {
            groups.push(group);
        }
    }

    for (const list of code.matchAll(PATH_LIST)) {
        // The table itself is a list of file names, and would otherwise read as one huge group.
        const inTable = !!table && list.index >= table.index && list.index < table.index + table[0].length;
        const group = inTable
            ? null
            : groupOf(
                  [...(list[0].matchAll(QUOTED) ?? [])].map(m => m[1] ?? ''),
                  exists,
              );
        if (group) {
            groups.push(group);
        }
    }

    return groups;
};

/** Reads one chunk: its edges and its preload lists, plus who wrote each dynamic import. */
const readChunk = (
    chunk: string,
    code: string,
    segments: readonly Segment[][],
    exists: (path: string) => boolean,
): Omit<ReadChunk, 'split' | 'sources'> => {
    const statics = new Set<string>();
    const dynamics: { target: string; from: string | null }[] = [];
    const mapped = segments.length > 0;
    const starts = mapped ? lineStartsOf(code) : [];

    for (const match of code.matchAll(STATIC_IMPORT)) {
        const target = resolveFrom(chunk, match[1] ?? '');
        if (target !== chunk && exists(target)) {
            statics.add(target);
        }
    }

    for (const match of code.matchAll(DYNAMIC_IMPORT)) {
        const target = resolveFrom(chunk, match[2] ?? '');
        if (target === chunk || !exists(target)) {
            continue;
        }

        // Which of the files inside this chunk wrote the import. The map answers it exactly, so
        // "who lazy-loads this screen" is read rather than guessed even in a chunk holding thirty
        // files. Without a map it stays open and the entry of the chunk answers for it later.
        const position = mapped ? positionOf(starts, match.index) : null;
        const from = position ? sourceAt(segments, position.line, position.column) : null;
        dynamics.push({ target, from: from ? sourcePathOf(from) : null });
    }

    return { statics: [...statics], dynamics, groups: groupsIn(code, exists) };
};

/**
 * Which source file a chunk starts at.
 *
 * One source is the whole answer when there is only one. Otherwise the bundler's own name for the
 * chunk decides: Rollup and esbuild both name a chunk after the module it starts at, so
 * `orders.page-DgHWSolo.js` came from the source called `orders.page`. When neither settles it the
 * last source is taken, because a chunk is written dependencies first and the module it exists for
 * goes at the end.
 */
export const entrySourceOf = (chunk: string, sources: readonly string[]): string | null => {
    if (sources.length <= 1) {
        return sources[0] ?? null;
    }

    const stem = baseName(chunk).replace(JS_FILE, '').replace(HASH, '');
    const named = sources.find(source => baseName(source).replace(/\.[^.]+$/, '') === stem);

    return named ?? sources.at(-1) ?? null;
};

/** The map of a chunk, when the folder ships one next to it. */
const mapOf = async (
    chunk: BundleFile,
    code: string,
    byPath: ReadonlyMap<string, BundleFile>,
): Promise<SourceMap | null> => {
    const url = MAP_URL.exec(code)?.[1];
    const named = url && !url.startsWith('data:') ? byPath.get(resolveFrom(chunk.path, url)) : undefined;
    const file = named ?? byPath.get(`${chunk.path}.map`);
    if (!file) {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(await file.text());
        return isSourceMap(parsed) ? parsed : null;
    } catch {
        // A truncated map costs the breakdown of one chunk, not the report.
        return null;
    }
};

/** Reads every chunk of the folder once: text, map, edges and weights. */
const readChunks = async (
    chunks: readonly BundleFile[],
    byPath: ReadonlyMap<string, BundleFile>,
): Promise<{ read: Map<string, ReadChunk>; splits: Map<string, ChunkSplit>; runtimes: Set<string> }> => {
    const read = new Map<string, ReadChunk>();
    const splits = new Map<string, ChunkSplit>();
    const runtimes = new Set<string>();
    const exists = (path: string): boolean => byPath.has(path);

    for (const chunk of chunks) {
        const code = await chunk.text();
        if (LOADER_RUNTIME.test(code)) {
            runtimes.add(chunk.path);
        }
        const map = await mapOf(chunk, code, byPath);
        const segments = map ? segmentsOf(map) : [];
        const raw = map ? bytesBySource(map, code) : new Map<string, number>();
        const split: ChunkSplit = new Map();

        for (const [source, bytes] of raw) {
            const path = sourcePathOf(source);
            split.set(path, (split.get(path) ?? 0) + bytes);
        }
        if (raw.size > 0) {
            // Keyed and named the way `readSourceMaps` does it, so what the folder reader stores
            // is the same object whichever of the two paths produced it.
            splits.set(baseName(chunk.path), raw);
        }

        const sources = map ? map.sources.map(source => sourcePathOf(source)) : [];
        read.set(chunk.path, { ...readChunk(chunk.path, code, segments, exists), split, sources });
    }

    return { read, splits, runtimes };
};

/**
 * Which chunks the loader asks for in the same round trip, from the preload lists.
 *
 * A list only means something once it is tied to the import it belongs to, and what ties it is that
 * exactly one of its files is a chunk this same chunk lazily imports. When two of them are, the
 * list is left alone: counting a screen as arriving with something it does not would understate the
 * round trips, and that is the direction that flatters the build.
 */
const parallelOf = (read: ReadonlyMap<string, ReadChunk>): Map<string, string[]> => {
    const parallel = new Map<string, string[]>();
    const targetOf = (group: readonly string[], lazy: ReadonlySet<string>): string | null => {
        const inside = group.filter(path => lazy.has(path));
        return inside.length === 1 ? (inside[0] ?? null) : null;
    };

    for (const info of read.values()) {
        const lazy = new Set(info.dynamics.map(entry => entry.target));
        for (const group of info.groups) {
            const target = targetOf(group, lazy);
            if (target) {
                const rest = group.filter(path => path !== target);
                parallel.set(target, [...new Set([...(parallel.get(target) ?? []), ...rest])]);
            }
        }
    }

    return parallel;
};

/**
 * Builds the metafile the analysis takes out of a compiled folder.
 *
 * @param files   every file of the folder, with its path relative to the folder itself
 * @param entries the file names the page names in a `<script>` tag. They are what tells an entry
 *                chunk from a shared one: a bundler writes the shared code of an application into
 *                its entry chunk, so the entry ends up imported by its own children and cannot be
 *                found by looking for a chunk that nobody imports.
 */
export const readBundleGraph = async (
    files: readonly BundleFile[],
    entries: ReadonlySet<string>,
): Promise<BundleGraph> => {
    const byPath = new Map(files.map(file => [file.path, file]));
    const chunks = files.filter(file => JS_FILE.test(file.path));
    const { read, splits, runtimes } = await readChunks(chunks, byPath);

    const roots = chunks.filter(chunk => entries.has(baseName(chunk.path))).map(chunk => chunk.path);
    if (roots.length === 0) {
        throw new Error('NO_PAGE');
    }

    const lazyTargets = new Set([...read.values()].flatMap(info => info.dynamics.map(entry => entry.target)));

    /**
     * A folder whose entry carries a run-time loader and where nothing lazily imports anything is
     * not an ES module bundle: it is webpack's or Turbopack's output, and its graph is a table of
     * numbers this cannot read. Saying so is the whole point — pointed at a Next.js export, the
     * report came out as one bootstrap of seven files, zero screens and "nothing stands out".
     *
     * Both halves are required on purpose. The marker alone would refuse an ES module bundle that
     * happens to carry one webpack-built dependency; no lazy edges alone is a perfectly ordinary
     * application with every route eager, which is a build this reads correctly today.
     */
    if (lazyTargets.size === 0 && roots.some(root => runtimes.has(root))) {
        throw new Error('NOT_ESM_GRAPH');
    }
    const entryChunks = new Set([...roots, ...lazyTargets]);

    /**
     * The name the source graph knows a chunk by. It is a real file when the maps said so, and the
     * chunk itself when they did not: without maps the smallest thing the folder knows about is a
     * chunk, and naming a screen after its file is what the folder actually says.
     */
    const sourceKeys = new Map<string, string>(
        [...read].map(([chunk, info]) => [chunk, entrySourceOf(chunk, info.sources) ?? chunk]),
    );

    const inputs: Record<string, { bytes: number; imports: MetafileImport[] }> = {};
    const inputOf = (path: string): { bytes: number; imports: MetafileImport[] } =>
        (inputs[path] ??= { bytes: 0, imports: [] });

    for (const info of read.values()) {
        for (const [source, bytes] of info.split) {
            inputOf(source).bytes += bytes;
        }
    }

    for (const [chunk, info] of read) {
        for (const { target, from } of info.dynamics) {
            const importer = from ?? sourceKeys.get(chunk);
            const imported = sourceKeys.get(target);
            if (importer && imported) {
                inputOf(importer).imports.push({ path: imported, kind: 'dynamic-import' });
            }
        }
    }

    const outputs: Metafile['outputs'] = {};
    for (const chunk of chunks) {
        const info = read.get(chunk.path);
        const dynamics = [...new Set(info?.dynamics.map(entry => entry.target))];
        const output: MetafileOutput = {
            bytes: chunk.bytes,
            imports: [
                ...(info?.statics ?? []).map((path): MetafileImport => ({ path, kind: 'import-statement' })),
                ...dynamics.map((path): MetafileImport => ({ path, kind: 'dynamic-import' })),
            ],
        };

        if (info && info.split.size > 0) {
            output.inputs = Object.fromEntries(
                [...info.split].map(([path, bytes]) => [path, { bytesInOutput: bytes }]),
            );
        }
        if (entryChunks.has(chunk.path)) {
            output.entryPoint = sourceKeys.get(chunk.path) ?? chunk.path;
        }

        outputs[chunk.path] = output;
    }

    return { meta: { inputs, outputs }, parallel: parallelOf(read), splits };
};
