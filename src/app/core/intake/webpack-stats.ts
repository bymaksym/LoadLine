/**
 * webpack's `stats.json`, read as the metafile everything else analyses.
 *
 * It was refused on purpose until 09/10/2026, with "Statoscope does it better". It is also, by far,
 * what the applications written before 2020 can produce: Angular up to 16, Create React App, Vue
 * CLI, Gatsby, Nuxt 2, Rspack. Their folders cannot be read — the chunks load each other by number —
 * and the stats file has the same three things the metafile has, in another shape:
 *
 * | webpack                                  | metafile                                       |
 * | ---------------------------------------- | ---------------------------------------------- |
 * | `modules[]` (and `chunks[].modules[]`)   | `inputs`, with the edges taken from `reasons`  |
 * | `chunks[].files` and `assets[].size`     | `outputs`, one per file the browser downloads  |
 * | `entrypoints[].chunks`                   | static edges: the files an entry starts with   |
 * | `chunks[].origins`                       | lazy edges: who asked for the chunk, and where |
 *
 * ⚠️ **A module's `size` is its source before minification**, not what it takes in the file. A main
 * chunk of Angular 8 is 2.9 MB of modules in a file of 560 kB. The per-file weights are that size
 * shared out in proportion to what the file weighs, so they add up to the file and the bootstrap
 * by package reads in the unit of everything else. It is an estimate — minification does not shrink
 * every file by the same factor — and a source map in the folder replaces it with a measurement,
 * as it does for every other build.
 */

import {
    foreignFormat,
    isMetafile,
    type Metafile,
    type MetafileImport,
    type MetafileOutput,
} from '../analysis/metafile.types';
import { asArray, asRecord, asText } from '../json/json.utils';
import {
    collect,
    idsOf,
    importersOf,
    modulePath,
    type ModuleRow,
    type Reason,
    requested,
    type Rows,
    textsOf,
} from './webpack-modules';

interface Chunk {
    id: string;
    names: string[];
    files: string[];
    initial: boolean;
    parents: string[];
    origins: { from: string; loc: string; request: string }[];
}

/**
 * The compilation that is the browser's. A build of several configurations writes one per child and
 * nothing at the top: the one with chunks is taken, and of several, not the server's — nobody
 * downloads that — and then the one with the most chunks.
 */
const compilationOf = (data: Record<string, unknown>): Record<string, unknown> | null => {
    if ((asArray(data['chunks'])?.length ?? 0) > 0) {
        return data;
    }
    const children = (asArray(data['children']) ?? [])
        .map(child => asRecord(child))
        .filter((child): child is Record<string, unknown> => (asArray(child?.['chunks'])?.length ?? 0) > 0);
    const browser = children.filter(child => !/server|edge|node/i.test(asText(child['name']) ?? ''));
    const [best] = (browser.length > 0 ? browser : children).toSorted(
        (a, b) => (asArray(b['chunks'])?.length ?? 0) - (asArray(a['chunks'])?.length ?? 0),
    );
    return best ?? null;
};

const chunksOf = (compilation: Record<string, unknown>): Chunk[] =>
    (asArray(compilation['chunks']) ?? []).flatMap(item => {
        const chunk = asRecord(item);
        if (!chunk) {
            return [];
        }
        const origins = (asArray(chunk['origins']) ?? []).flatMap(entry => {
            const origin = asRecord(entry);
            const from = asText(origin?.['moduleName']) ?? '';
            return origin && from
                ? [{ from, loc: asText(origin['loc']) ?? '', request: asText(origin['request']) ?? '' }]
                : [];
        });
        return [
            {
                id: String(chunk['id']),
                names: textsOf(chunk['names']),
                files: textsOf(chunk['files']),
                initial: chunk['initial'] === true,
                parents: idsOf(chunk['parents']),
                origins,
            },
        ];
    });

/** What each emitted file weighs. webpack 5 nests them in groups for the terminal, as it does modules. */
const assetSizes = (list: unknown, into = new Map<string, number>()): Map<string, number> => {
    const items = asArray(list) ?? [];
    for (const item of items) {
        const asset = asRecord(item);
        const name = asText(asset?.['name']);
        if (asset && name && typeof asset['size'] === 'number') {
            into.set(name, asset['size']);
        } else if (asset) {
            assetSizes(asset['children'], into);
        }
    }
    return into;
};

const isScript = (file: string): boolean => /\.m?js$/.test(file);
const isStyle = (file: string): boolean => file.endsWith('.css');

/**
 * The source weights of a chunk shared out over what its file weighs, so they add up to the file
 * (see the top of this file). Rounded down, with what rounding lost given to the largest, so the
 * sum is exact: the breakdown that does not add up to the file is a signal of its own (§3.23).
 */
const shareOut = (parts: ReadonlyMap<string, number>, bytes: number): Record<string, { bytesInOutput: number }> => {
    let total = 0;
    for (const size of parts.values()) {
        total += size;
    }
    if (total === 0) {
        return {};
    }
    const shares = [...parts].map(([path, size]) => [path, Math.floor((size * bytes) / total)] as const);
    const lost = bytes - shares.reduce((sum, [, share]) => sum + share, 0);
    const largest = shares.reduce((best, entry) => (entry[1] > best[1] ? entry : best), shares[0] ?? ['', 0]);
    return Object.fromEntries(
        shares.map(([path, share]) => [path, { bytesInOutput: path === largest[0] ? share + lost : share }]),
    );
};

const isLazy = (kind: string): boolean => kind.startsWith('import()');
const isEntry = (kind: string): boolean => kind.endsWith('entry');
/** A worker is a second program beside the page, not a part of it that arrives later. */
const isWorker = (kind: string): boolean => kind.includes('Worker');

const importKind = (kind: string): string => {
    if (isLazy(kind)) {
        return 'dynamic-import';
    }
    if (isWorker(kind) || kind.startsWith('new URL')) {
        return 'url-token';
    }
    return /cjs|require/.test(kind) ? 'require-call' : 'import-statement';
};

/**
 * A webpack `stats.json` as a metafile, or `null` when it has no chunk with a script in it — a
 * stats file written with `chunks: false` has nothing to analyse.
 */
export const fromWebpackStats = (value: unknown): Metafile | null => {
    const data = asRecord(value);
    const compilation = data ? compilationOf(data) : null;
    if (!compilation) {
        return null;
    }

    const chunks = chunksOf(compilation);
    const byId = new Map(chunks.map(chunk => [chunk.id, chunk]));
    const read: Rows = { rows: new Map(), concatenated: new Map() };
    collect({ children: compilation['modules'] }, [], read);
    const rawChunks = asArray(compilation['chunks']) ?? [];
    for (const item of rawChunks) {
        const chunk = asRecord(item);
        collect({ children: chunk?.['modules'] }, chunk ? [String(chunk['id'])] : [], read);
    }
    const { rows } = read;
    const sizes = assetSizes(compilation['assets']);

    // --- inputs: every file, and who imports it -------------------------------------------------
    const inputs: Metafile['inputs'] = {};
    for (const row of rows.values()) {
        const input = (inputs[row.path] ??= { bytes: 0, imports: [] });
        input.bytes += row.size;
        if (row.cjs) {
            input.format = 'cjs';
        }
    }
    const seen = new Set<string>();
    for (const row of rows.values()) {
        for (const reason of row.reasons) {
            if (isEntry(reason.kind)) {
                continue;
            }
            const kind = importKind(reason.kind);
            for (const from of importersOf(reason, row, read)) {
                const key = `${from}>${row.path}>${kind}`;
                if (from === row.path || seen.has(key)) {
                    continue;
                }

                seen.add(key);
                inputs[from]?.imports?.push({ path: row.path, kind });
            }
        }
    }

    // --- outputs: one per file a chunk writes ---------------------------------------------------
    const outputs: Metafile['outputs'] = {};
    const rowsIn = new Map<string, ModuleRow[]>();
    for (const row of rows.values()) {
        for (const chunk of row.chunks) {
            rowsIn.set(chunk, [...(rowsIn.get(chunk) ?? []), row]);
        }
    }
    const weights = (chunk: string, style: boolean): Map<string, number> => {
        const parts = new Map<string, number>();
        const inChunk = rowsIn.get(chunk) ?? [];
        for (const row of inChunk) {
            if (row.style === style) {
                parts.set(row.path, (parts.get(row.path) ?? 0) + row.size);
            }
        }
        return parts;
    };

    for (const chunk of chunks) {
        const scripts = chunk.files.filter(file => isScript(file));
        const styles = chunk.files.filter(file => isStyle(file));
        for (const [index, file] of [...scripts, ...styles].entries()) {
            const bytes = sizes.get(file) ?? 0;
            const output: MetafileOutput = { bytes, imports: [] };
            // One script per chunk is the rule; were there two, the modules would be counted twice.
            if (index === 0 || isStyle(file)) {
                output.inputs = shareOut(weights(chunk.id, isStyle(file)), bytes);
            }
            outputs[file] = output;
        }
    }

    const scriptsOf = (chunk: string): string[] => byId.get(chunk)?.files.filter(file => isScript(file)) ?? [];
    const link = (from: string, to: string, kind: string): void => {
        const imports = outputs[from]?.imports;
        if (from !== to && imports?.every(imp => !(imp.path === to && imp.kind === kind))) {
            imports.push({ path: to, kind } satisfies MetafileImport);
        }
    };

    // --- where the application starts -----------------------------------------------------------
    const entrypoints = Object.entries(asRecord(compilation['entrypoints']) ?? {});
    for (const [name, raw] of entrypoints) {
        const entry = asRecord(raw);
        const named = new Set(
            (asArray(entry?.['assets']) ?? []).map(asset => asText(asset) ?? asText(asRecord(asset)?.['name']) ?? ''),
        );
        const listed = idsOf(entry?.['chunks']);
        const ids =
            listed.length > 0
                ? listed
                : chunks.filter(chunk => chunk.files.some(file => named.has(file))).map(chunk => chunk.id);
        // The chunk named after the entry holds its module; webpack lists it last, after the runtime
        // and the vendors it needs.
        const home = ids.find(id => byId.get(id)?.names.includes(name)) ?? ids.at(-1);
        const [start] = home ? scriptsOf(home) : [];
        const output = start ? outputs[start] : undefined;
        if (!home || !start || !output) {
            continue;
        }

        const module = (rowsIn.get(home) ?? []).find(row => row.reasons.some(reason => isEntry(reason.kind)));
        output.entryPoint = module?.path ?? name;
        for (const id of ids) {
            for (const file of scriptsOf(id)) {
                link(start, file, 'import-statement');
            }
        }
    }

    // --- what arrives later, and who asks for it --------------------------------------------------
    // A lazy chunk group is every chunk sharing one origin: the `import()` at one place in one file.
    // One of them holds the module asked for and is what gets imported; the others — the vendors
    // `splitChunks` moved out, a chunk two routes share — travel with it.
    const groups = new Map<string, { from: string; loc: string; request: string; members: string[] }>();
    for (const chunk of chunks) {
        if (chunk.initial) {
            continue;
        }
        for (const origin of chunk.origins) {
            const key = `${origin.from}|${origin.loc}`;
            const group = groups.get(key) ?? { ...origin, members: [] };
            group.members.push(chunk.id);
            groups.set(key, group);
        }
    }
    const groupsOf = (id: string): number => [...groups.values()].filter(group => group.members.includes(id)).length;

    for (const group of groups.values()) {
        const from = modulePath(group.from);
        const here = (reason: Reason): boolean => modulePath(reason.from) === from && reason.loc === group.loc;
        const target = group.members
            .flatMap(id =>
                (rowsIn.get(id) ?? [])
                    .filter(row => row.reasons.some(reason => here(reason)))
                    .map(row => ({ id, row })),
            )
            .at(0);
        if (target?.row.reasons.some(reason => here(reason) && isWorker(reason.kind))) {
            continue;
        }
        const primary =
            target?.id ??
            group.members.toSorted(
                (a, b) =>
                    groupsOf(a) - groupsOf(b) ||
                    (sizes.get(scriptsOf(b)[0] ?? '') ?? 0) - (sizes.get(scriptsOf(a)[0] ?? '') ?? 0),
            )[0];
        const [lazy] = primary ? scriptsOf(primary) : [];
        const output = lazy ? outputs[lazy] : undefined;
        if (!primary || !lazy || !output) {
            continue;
        }

        output.entryPoint ??= target?.row.path ?? (from ? requested(from, group.request) : lazy);
        for (const id of group.members) {
            for (const file of scriptsOf(id)) {
                link(lazy, file, 'import-statement');
                if (file !== lazy && !output.fetchedWith?.includes(file)) {
                    output.fetchedWith = [...(output.fetchedWith ?? []), file];
                }
            }
        }

        const holders = new Set([...rows.values()].filter(row => row.path === from).flatMap(row => [...row.chunks]));
        const importers =
            holders.size > 0 ? holders : new Set(group.members.flatMap(id => byId.get(id)?.parents ?? []));
        for (const id of importers) {
            if (group.members.includes(id)) {
                continue;
            }
            for (const file of scriptsOf(id)) {
                link(file, lazy, 'dynamic-import');
            }
        }
    }

    return Object.keys(outputs).some(file => isScript(file))
        ? { inputs, outputs, builtBy: { bundler: 'webpack' }, readFrom: 'webpack' }
        : null;
};

/**
 * What a parsed file is as a metafile: itself when it is one, translated when it is webpack's, and
 * `null` otherwise. Every door a stats file comes in by goes through here, so the two formats are
 * read the same way by the page, the command, a baseline and a comparison.
 */
export const metafileOf = (value: unknown): Metafile | null => {
    if (isMetafile(value)) {
        return value;
    }
    return foreignFormat(value) === 'webpack' ? fromWebpackStats(value) : null;
};
