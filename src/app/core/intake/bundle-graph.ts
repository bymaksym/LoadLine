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
import {
    bytesBySource,
    isSourceMap,
    projectRootsOf,
    segmentsOf,
    sourceAt,
    sourcePathOf,
} from '../analysis/sourcemap/sourcemap';
import { type ChunkSplit, type Segment, type SourceMap } from '../analysis/sourcemap/sourcemap.types';
import { scriptsIn } from '../build-text/index-html';
import { routeBefore, routeKeyPattern, type RouteRef, sapperRoutesIn } from '../build-text/route-table';
import { builtByOf, stencilComponentsIn, toolsIn } from '../build-text/tool-marks';
import { type BuildHints } from '../config/loadline-config.types';
import { baseName, namedBy } from '../format/format.utils';
import { type BundleFile, type BundleGraph } from './bundle-graph.types';
import { lazyByName, mentionedBy, mentionKeysOf, offPageOf, reachOver } from './unreached';

const JS_FILE = /\.m?js$/i;

/**
 * `import … from "x"`, `export … from "x"` and the bare `import "x"`. All three make the browser
 * fetch the other file as soon as it has parsed this one, which is the only thing that matters
 * here. The character class stops at `;` so a match cannot run past the end of its statement.
 */
const STATIC_IMPORT = /\b(?:import|export)\b(?:[^'"`;()]+\bfrom\s*)?['"]([^'"]+)['"]/g;

/** `import("x")` in the three quotes a minifier may leave behind — Rolldown writes backticks. */
const DYNAMIC_IMPORT = /\bimport\s*\(\s*(['"`])([^'"`]+)\1\s*\)/g;

/**
 * The module formats that came before ES modules write their graph in plain sight too, as a list of
 * strings: AMD's `define(["./a.js"], …)` and SystemJS's `System.register(["./a.js"], …)`, with an
 * optional module name in front. Polymer's es5 and es6 builds are AMD, Stencil's and Vite's legacy
 * copies SystemJS. Read as ES modules alone, Polymer's came out as a 2 kB bootstrap of nothing but
 * the loader, zero screens and 1.1 MB "in no figure here". What these load lazily — `require([…])`
 * under whatever name the minifier left, SystemJS's `module.import("./x.js")` — is the string
 * fallback's and `DYNAMIC_IMPORT`'s job respectively.
 */
const DEPENDENCY_LIST = /\b(?:define|System\.register)\s*\(\s*(?:(['"])[^'"]*\1\s*,\s*)?\[([^\]]*)\]/g;

/** `importScripts("a.js", "b.js")`: how a classic worker, a service worker above all, pulls in code. */
const IMPORT_SCRIPTS = /\bimportScripts\s*\(([^)]*)\)/g;

/**
 * A service worker registered from the code: `navigator.serviceWorker.register("/sw.js")`, or
 * Workbox's `new Workbox("/sw.js")`. Its file runs beside the page and never as part of a screen,
 * so it and what it imports leave the figures; read as nothing at all, it was listed with the
 * leftovers of an old build.
 */
const SERVICE_WORKER = /\b(?:serviceWorker\s*\.\s*register|new\s+Workbox)\s*\(\s*(['"`])([^'"`]+)\1/g;

/**
 * Any quoted string, for the last way a chunk gets named: by a string that is not an import at all.
 * Loaders written before `import()` was usable — Stencil's, Polymer's `require([…])`, any hand-made
 * one — build the file name at run time from an id (``import(`./${id}.entry.js`)``) and keep the ids
 * as plain strings. Bounded, so a long string costs its length and no more; and the quotes are looked
 * at rather than consumed, so a string holding the other kind of quote cannot put every string after
 * it out of step.
 */
const STRING_LITERAL = /(?<=['"`])([^'"`\s\\]{4,300})(?=['"`])/g;

/**
 * `new Worker(new URL("x.js", import.meta.url))`, which is how Vite writes a worker — with a
 * `""+` in front of the URL and its `.href` after it — and `SharedWorker` the same. The name is
 * relative to the chunk holding it, whether or not it starts with `./`.
 */
const WORKER =
    /\bnew\s+(?:Shared)?Worker\s*\(\s*(?:(?:""|''|``)\s*\+\s*)?new\s+URL\s*\(\s*(['"`])([^'"`]+)\1\s*,\s*import\.meta\.url/g;

/**
 * Vite's table of preloadable files, written once at the top of any chunk that needs one.
 *
 * Two shapes. Vite 5.1 onwards: `const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=[…])))`.
 * Vite 5.0: a function at the end of the chunk that fills `__vite__mapDeps.viteFileDeps=[…]` on its
 * first call. Reading only the first, Excalidraw (Vite 5.0) had every preload list dropped and its
 * lazy features counted one round trip deeper than the browser takes them.
 */
const MAP_DEPS_TABLE = /__vite__mapDeps(?:\.viteFileDeps)?\s*=[^[]*\[([^\]]*)\]/;

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
 *
 * ⚠️ Before webpack 5 the registry was called `webpackJsonp` — `window.webpackJsonp=…||[]` in
 * webpack 4, `window["webpackJsonp"]=function` in webpack 3 — which is what Create React App 1 to
 * 3 and Vue CLI shipped. Without it, a webpack 4 build of three lazy routes (`fixtures/webpack4-app`)
 * came out as one bootstrap of 1 kB, zero screens, and its four other chunks not mentioned at all.
 * A webpack build of a single chunk writes no registry and is still read: it has no graph to lose.
 */
const LOADER_RUNTIME =
    /webpackChunk\w*\s*(?:\|\|)?=|webpackJsonp\w*["']?\]?\s*=|__webpack_require__\s*\(|globalThis\.TURBOPACK|__next_f\.push/;

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
    groups: PreloadGroup[];
    /** The routes whose key imports a chunk, read out of the route table: see `route-table.ts`. */
    routes: { target: string; route: RouteRef }[];
    /** Files of the folder this chunk names in a plain string: the last-resort edges, `mentionsIn`. */
    mentions: string[];
    /** Service workers it registers. */
    registers: string[];
    /** Weight of each source inside this chunk, as the map named them. Empty without a map. */
    split: ChunkSplit;
    /** Sources in the order the map lists them, which is the order the bundler wrote them in. */
    sources: string[];
    /** What this chunk says about the tool that wrote it: see `TOOL_MARKS`. */
    tools: NonNullable<Metafile['builtBy']>;
}

/**
 * One preload list: the files fetched together, and — when the call it sits in said so — the lazy
 * import it belongs to.
 */
interface PreloadGroup {
    files: string[];
    /** The chunk the `import()` next to this list asks for. `null` when the list stood on its own. */
    target: string | null;
}

/**
 * One name of a preload list as a file of the folder, or `''` when it is none.
 *
 * Vite writes these relative to the root of the folder (`assets/x.js`) with the default `base`, and
 * relative to the chunk holding the list (`./x.js`) with `base: './'` — and Nuxt always does the
 * latter. Read only from the root, `./x.js` named a file that is not there, the whole list was
 * dropped, and every screen of a Nuxt app, or of a Vite app built for a subfolder, Electron or
 * Tauri, came out one round trip deeper than the browser takes it.
 */
const preloadPath = (chunk: string, name: string, exists: (path: string) => boolean): string => {
    const fromRoot = resolveFrom('', name);
    if (exists(fromRoot)) {
        return fromRoot;
    }
    const fromChunk = resolveFrom(chunk, name);
    return exists(fromChunk) ? fromChunk : '';
};

/** Every file name of a preload list, resolved, or `null` when one of them is not a file here. */
const groupOf = (chunk: string, names: readonly string[], exists: (path: string) => boolean): string[] | null => {
    const paths = names.map(name => preloadPath(chunk, name, exists));
    return paths.length > 1 && paths.every(path => path !== '') ? paths : null;
};

/**
 * The lazy import each preload call belongs to: the last `import()` written before it, and after the
 * call before it. Vite writes the pair as one expression — `__vitePreload(() => import("./x.js"),
 * __vite__mapDeps([4,5,3]))` — whatever `.then()` sits between them, so the nearest one back is the
 * one it goes with.
 */
const importBefore = (imports: readonly { index: number; target: string }[], from: number, to: number) =>
    imports.findLast(entry => entry.index > from && entry.index < to)?.target ?? null;

/**
 * The preload lists of a chunk: the sets of files Vite asks for in one go.
 *
 * Vite does not wait for a lazy chunk to arrive and be parsed before fetching what that chunk
 * imports; it bakes the list into the call and fires the whole set off at once. Angular does not do
 * this. Without reading these, every screen of a Vite application would be counted one round trip
 * deeper than it is.
 */
const groupsIn = (
    chunk: string,
    code: string,
    imports: readonly { index: number; target: string }[],
    exists: (path: string) => boolean,
): PreloadGroup[] => {
    const groups: PreloadGroup[] = [];
    const table = MAP_DEPS_TABLE.exec(code);
    const files = table ? [...(table[1] ?? '').matchAll(QUOTED)].map(match => match[1] ?? '') : [];

    let previousCall = -1;
    for (const call of code.matchAll(MAP_DEPS_CALL)) {
        const names = (call[1] ?? '').split(',').map(index => files[Number(index.trim())] ?? '');
        const group = groupOf(chunk, names, exists);
        if (group) {
            groups.push({ files: group, target: importBefore(imports, previousCall, call.index) });
        }
        previousCall = call.index;
    }

    for (const list of code.matchAll(PATH_LIST)) {
        // The table itself is a list of file names, and would otherwise read as one huge group.
        const inTable = !!table && list.index >= table.index && list.index < table.index + table[0].length;
        const group = inTable
            ? null
            : groupOf(
                  chunk,
                  [...list[0].matchAll(QUOTED)].map(m => m[1] ?? ''),
                  exists,
              );
        if (group) {
            groups.push({ files: group, target: null });
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
    root: string,
    keys: ReadonlyMap<string, string[]>,
    routeKeys: RegExp,
): Omit<ReadChunk, 'split' | 'sources'> => {
    const statics = new Set<string>();
    const dynamics: { target: string; from: string | null }[] = [];
    const imports: { index: number; target: string }[] = [];
    const routes: { target: string; route: RouteRef }[] = [];
    const mentions = new Set<string>();
    const registers = new Set<string>();
    const mapped = segments.length > 0;
    const starts = mapped ? lineStartsOf(code) : [];

    for (const match of code.matchAll(STATIC_IMPORT)) {
        const target = resolveFrom(chunk, match[1] ?? '');
        if (target !== chunk && exists(target)) {
            statics.add(target);
        }
    }

    // AMD and SystemJS dependencies, and a classic worker's `importScripts`: fetched before the
    // module runs, so they travel with it like a static import. A dependency list names modules
    // relative to the chunk, or to the root of the site; whichever of the two is a file wins.
    const lists = [
        ...[...code.matchAll(DEPENDENCY_LIST)].map(match => match[2] ?? ''),
        ...[...code.matchAll(IMPORT_SCRIPTS)].map(match => match[1] ?? ''),
    ];
    for (const list of lists) {
        for (const [, name = ''] of list.matchAll(QUOTED)) {
            // An AMD module id usually leaves the extension off — Rollup's `amd` output and
            // RequireJS both write `"./shared-1a2b3c4d"` — so the name with `.js` is tried too.
            const relative = /^\.{0,2}\//.test(name) ? name : `./${name}`;
            const target = [resolveFrom(chunk, relative), resolveFrom('', name)]
                .flatMap(path => [path, `${path}.js`])
                .find(path => path !== chunk && exists(path));
            if (target) {
                statics.add(target);
            }
        }
    }

    for (const match of code.matchAll(SERVICE_WORKER)) {
        const name = match[2] ?? '';
        const target = [resolveFrom('', name), resolveFrom(chunk, name)].find(path => exists(path));
        if (target) {
            registers.add(target);
        }
    }

    for (const match of code.matchAll(STRING_LITERAL)) {
        const target = mentionedBy(match[1] ?? '', keys);
        if (target && target !== chunk) {
            mentions.add(target);
        }
    }

    for (const { id, tag } of stencilComponentsIn(code)) {
        const target = resolveFrom(chunk, `./${id}.entry.js`);
        if (exists(target)) {
            routes.push({ target, route: { path: '', name: tag } });
        }
    }

    for (const { specifier, route } of sapperRoutesIn(code)) {
        const target = resolveFrom(chunk, specifier);
        if (exists(target)) {
            routes.push({ target, route });
        }
    }

    for (const match of code.matchAll(DYNAMIC_IMPORT)) {
        const target = resolveFrom(chunk, match[2] ?? '');
        if (target === chunk || !exists(target)) {
            continue;
        }
        imports.push({ index: match.index, target });
        const route = routeBefore(code, match.index, routeKeys);
        if (route) {
            routes.push({ target, route });
        }

        // Which of the files inside this chunk wrote the import. The map answers it exactly, so
        // "who lazy-loads this screen" is read rather than guessed even in a chunk holding thirty
        // files. Without a map it stays open and the entry of the chunk answers for it later.
        const position = mapped ? positionOf(starts, match.index) : null;
        const from = position ? sourceAt(segments, position.line, position.column) : null;
        dynamics.push({ target, from: from ? sourcePathOf(from, root) : null });
    }

    // A worker is a chunk started on demand like any `import()`, written another way. Missed, its
    // chunk read as unreachable — "possibly a service worker" — and its weight belonged nowhere.
    for (const match of code.matchAll(WORKER)) {
        const name = match[2] ?? '';
        const target = resolveFrom(chunk, /^\.{0,2}\//.test(name) ? name : `./${name}`);
        if (target === chunk || !exists(target)) {
            continue;
        }
        const position = mapped ? positionOf(starts, match.index) : null;
        const from = position ? sourceAt(segments, position.line, position.column) : null;
        dynamics.push({ target, from: from ? sourcePathOf(from, root) : null });
    }

    const stencil = routes.some(entry => entry.route.path === '' && entry.target.endsWith('.entry.js'));
    return {
        statics: [...statics],
        dynamics,
        groups: groupsIn(chunk, code, imports, exists),
        routes,
        mentions: [...mentions],
        registers: [...registers],
        tools: toolsIn(code, stencil),
    };
};

/** A template or a stylesheet: compiled into a module, never one a chunk can start at. */
const NOT_A_MODULE = /\.(?:html?|css|scss|sass|less|styl)$/i;

/**
 * Which source file a chunk starts at.
 *
 * One source is the whole answer when there is only one. Otherwise the bundler's own name for the
 * chunk decides: Rollup and esbuild both name a chunk after the module it starts at, so
 * `orders.page-DgHWSolo.js` came from the source called `orders.page`. When neither settles it the
 * last source is taken, because a chunk is written dependencies first and the module it exists for
 * goes at the end.
 *
 * The last *module*: Angular names every chunk `chunk-<hash>.js` and lists a component's template
 * after the component, so the last source of a lazy screen is `orders.page.html`. Taken as is, a
 * real build named all eight of its screens after their templates, and its signals sent people to
 * open an `.html` to change an import.
 */
export const entrySourceOf = (chunk: string, sources: readonly string[]): string | null => {
    if (sources.length <= 1) {
        return sources[0] ?? null;
    }

    const stem = baseName(chunk).replace(JS_FILE, '').replace(HASH, '');
    const named = sources.find(source => baseName(source).replace(/\.[^.]+$/, '') === stem);

    return named ?? sources.findLast(source => !NOT_A_MODULE.test(source)) ?? sources.at(-1) ?? null;
};

/** The map of a chunk, when the folder ships one next to it. */
const mapOf = async (
    chunk: BundleFile,
    code: string,
    byPath: ReadonlyMap<string, BundleFile>,
): Promise<SourceMap | null> => {
    const url = MAP_URL.exec(code)?.[1];
    // A source map URL is relative to the chunk, as any URL in a script is: `vendor-1a2b.map` sits
    // next to `assets/vendor-3c4d.js`. Read from the root of the folder, as a preload list is,
    // Ember's maps — named with a hash of their own, so `${chunk}.map` misses them too — were not
    // found, and the report said a folder holding three of them had none.
    const relative = url && !/^(?:\.{0,2}\/|[a-z]+:)/i.test(url) ? `./${url}` : url;
    const named = relative && !relative.startsWith('data:') ? byPath.get(resolveFrom(chunk.path, relative)) : undefined;
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
    routeKeys: RegExp,
): Promise<{ read: Map<string, ReadChunk>; splits: Map<string, ChunkSplit>; runtimes: Set<string> }> => {
    const read = new Map<string, ReadChunk>();
    const splits = new Map<string, ChunkSplit>();
    const runtimes = new Set<string>();
    const exists = (path: string): boolean => byPath.has(path);

    // Every map first, because where the project starts is decided across all of them.
    const loaded: { chunk: BundleFile; code: string; map: SourceMap | null }[] = [];
    for (const chunk of chunks) {
        const code = await chunk.text();
        if (LOADER_RUNTIME.test(code)) {
            runtimes.add(chunk.path);
        }
        loaded.push({ chunk, code, map: await mapOf(chunk, code, byPath) });
    }
    const roots = projectRootsOf(loaded.map(({ map }) => map?.sources ?? []));
    const keys = mentionKeysOf(chunks.map(chunk => chunk.path));

    for (const [index, { chunk, code, map }] of loaded.entries()) {
        const segments = map ? segmentsOf(map) : [];
        const root = roots[index] ?? '';
        const raw = map ? bytesBySource(map, code) : new Map<string, number>();
        const split: ChunkSplit = new Map();

        for (const [source, bytes] of raw) {
            const path = sourcePathOf(source, root);
            split.set(path, (split.get(path) ?? 0) + bytes);
        }
        if (raw.size > 0) {
            // Keyed and named the way `readSourceMaps` does it, so what the folder reader stores
            // is the same object whichever of the two paths produced it.
            splits.set(baseName(chunk.path), raw);
        }

        const sources = map ? map.sources.map(source => sourcePathOf(source, root)) : [];
        read.set(chunk.path, {
            ...readChunk(chunk.path, code, segments, exists, root, keys, routeKeys),
            split,
            sources,
        });
    }

    return { read, splits, runtimes };
};

/**
 * Which chunks the loader asks for in the same round trip, from the preload lists.
 *
 * A list only means something once it is tied to the import it belongs to. The call it sits in ties
 * it when it was read next to one; otherwise what ties it is that exactly one of its files is a
 * chunk this same chunk lazily imports. When two of them are and nothing says which, the list is
 * left alone: counting a screen as arriving with something it does not would understate the round
 * trips, and that is the direction that flatters the build.
 */
const parallelOf = (read: ReadonlyMap<string, ReadChunk>): Map<string, string[]> => {
    const parallel = new Map<string, string[]>();
    const targetOf = (group: PreloadGroup, lazy: ReadonlySet<string>): string | null => {
        if (group.target !== null && lazy.has(group.target) && group.files.includes(group.target)) {
            return group.target;
        }
        const inside = group.files.filter(path => lazy.has(path));
        return inside.length === 1 ? (inside[0] ?? null) : null;
    };

    for (const info of read.values()) {
        const lazy = new Set(info.dynamics.map(entry => entry.target));
        for (const group of info.groups) {
            const target = targetOf(group, lazy);
            if (!target) {
                continue;
            }
            const rest = group.files.filter(path => path !== target);
            parallel.set(target, [...new Set([...(parallel.get(target) ?? []), ...rest])]);
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
 * @param page    what else the page says about its scripts: the `nomodule` ones, and the service
 *                workers it registers. Both are files of the build no screen downloads.
 */
export const readBundleGraph = async (
    files: readonly BundleFile[],
    entries: ReadonlySet<string>,
    page: {
        legacy?: ReadonlySet<string>;
        workers?: ReadonlySet<string>;
        ignored?: ReadonlySet<string>;
        /** The page itself, for what it says about the tool that wrote the build. */
        html?: string | null;
        /** The keys of a route table besides the ones every router uses: `build.routeKeys`. */
        routeKeys?: readonly string[];
    } = {},
): Promise<BundleGraph> => {
    const byPath = new Map(files.map(file => [file.path, file]));
    const chunks = files.filter(file => JS_FILE.test(file.path));
    const { read, splits, runtimes } = await readChunks(chunks, byPath, routeKeyPattern(page.routeKeys));

    const named = (names: ReadonlySet<string> | undefined): string[] =>
        chunks.filter(chunk => names?.has(baseName(chunk.path))).map(chunk => chunk.path);
    const ignored = page.ignored ?? new Set<string>();
    const modernRoots = named(entries).filter(path => !ignored.has(path));
    const legacyRoots = named(page.legacy).filter(path => !modernRoots.includes(path) && !ignored.has(path));
    // A page that starts nothing but a `nomodule` script is a build for old browsers only, and then
    // that copy is the one there is to read.
    const roots = modernRoots.length > 0 ? modernRoots : legacyRoots;
    if (roots.length === 0) {
        throw new Error('NO_PAGE');
    }

    const lazyTargets = new Set([...read.values()].flatMap(info => info.dynamics.map(entry => entry.target)));

    /**
     * A folder whose entry carries a run-time loader, where nothing lazily imports anything, and
     * where other chunks register themselves with that loader is not an ES module bundle: it is
     * webpack's or Turbopack's output, and its graph is a table of numbers this cannot read. Saying
     * so is the whole point — pointed at a Next.js export, the report came out as one bootstrap of
     * seven files, zero screens and "nothing stands out".
     *
     * All three halves are required on purpose. The marker alone would refuse an ES module bundle
     * that happens to carry one webpack-built dependency; no lazy edges alone is a perfectly
     * ordinary application with every route eager. And the loader with nothing else carrying the
     * marker is a loader with nothing to load: an Ember build ships ember-auto-import's webpack
     * runtime inside `vendor.js` with no chunk for it, and was refused as a Next.js app.
     */
    const loaded = [...runtimes].some(path => !roots.includes(path));
    if (lazyTargets.size === 0 && roots.some(root => runtimes.has(root)) && loaded) {
        throw new Error('NOT_ESM_GRAPH');
    }

    const workerRoots = new Set([...named(page.workers), ...[...read.values()].flatMap(info => info.registers)]);
    const byName = lazyByName(read, roots, new Set([...legacyRoots, ...workerRoots, ...ignored]));
    for (const target of byName) {
        lazyTargets.add(target);
    }
    const offPage = offPageOf(read, roots, roots === modernRoots ? legacyRoots : [], workerRoots);
    // What `loadline.json` says no screen downloads, when nothing the application imports reaches it.
    const reached = reachOver(read, roots);
    for (const path of ignored) {
        if (!reached.has(path)) {
            offPage.set(path, 'ignored');
        }
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

    // What no screen downloads stays out of the source graph too: the legacy copy carries every
    // source of the modern one a second time, and counted, every file would weigh double.
    const onPage = [...read].filter(([chunk]) => !offPage.has(chunk));

    for (const [, info] of onPage) {
        for (const [source, bytes] of info.split) {
            inputOf(source).bytes += bytes;
        }
    }

    for (const [chunk, info] of onPage) {
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
        const away = offPage.get(chunk.path);
        if (away) {
            output.offPage = away;
        }

        outputs[chunk.path] = output;
    }

    // Every route a chunk is the page of, once each: vue-router sends three routes to one `Home`.
    const routes = new Map<string, RouteRef[]>();
    const found = [...read.values()].flatMap(info => info.routes);
    for (const { target, route } of found) {
        const known = routes.get(target) ?? [];
        if (known.every(other => !(other.path === route.path && other.name === route.name))) {
            routes.set(target, [...known, route]);
        }
    }

    const builtBy = builtByOf(
        page.html ?? null,
        [...read.values()].map(info => info.tools),
    );
    return { meta: { inputs, outputs, builtBy, readFrom: 'folder' }, parallel: parallelOf(read), splits, routes };
};

/**
 * The graph of a folder, read with everything its page says: where execution starts, what only an
 * old browser runs and which service workers it registers. The one way in for the page and the
 * command alike, so the two never read a page differently.
 */
export const readFolderGraph = (
    files: readonly BundleFile[],
    html: string | null,
    hints: BuildHints = {},
): Promise<BundleGraph> => {
    const scripts = html ? scriptsIn(html) : null;
    const named = (patterns: readonly string[] = []) =>
        files.filter(file => JS_FILE.test(file.path) && patterns.some(pattern => namedBy(pattern, file.path)));
    return readBundleGraph(
        files,
        new Set([...(scripts?.entries ?? []), ...named(hints.entries).map(file => baseName(file.path))]),
        {
            legacy: new Set(scripts?.legacy),
            workers: new Set(scripts?.workers),
            ignored: new Set(named(hints.ignore).map(file => file.path)),
            html,
            ...(hints.routeKeys && { routeKeys: hints.routeKeys }),
        },
    );
};
