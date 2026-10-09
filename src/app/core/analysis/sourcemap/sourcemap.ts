/**
 * Weight per file read from the source maps of the build folder: a second, independent measurement
 * of what the metafile already says.
 *
 * This was written expecting to *correct* the metafile, on the assumption — true of webpack stats,
 * which is what source-map-explorer and Sonda were built around — that it measures each file
 * before minification. Measured on a real esbuild build of this very tool, it does not:
 * `bytesInOutput` adds up to 99.9 % of the generated file, while the raw source bytes of the same
 * files add up to 6.2 times it. File by file, the two measurements agree within 1 %.
 *
 * So the maps are kept for what they turned out to be worth: checking the figure rather than
 * replacing a bad one. They are an extra, never a requirement — without them everything works the
 * same, on a figure now known to be sound.
 *
 * Caveat kept on purpose: the columns of a source map count UTF-16 units, not bytes. Minified
 * JavaScript is almost entirely ASCII, so the two coincide except for the odd literal with
 * accents or emoji.
 */

import { type ChunkSplit, type Segment, type SourceMap, type TextFile } from './sourcemap.types';

const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Whether a file name is the source map of a script. Not only `*.js.map`: ember-cli hashes each map
 * on its own (`vendor-427cc….map` next to `vendor-8e0b….js`), and a folder holding three of them
 * was told it held none, in the same report that read them.
 */
export const isScriptMapName = (name: string): boolean => /\.map$/i.test(name) && !/\.css\.map$/i.test(name);

export const isSourceMap = (value: unknown): value is SourceMap => {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Partial<SourceMap>;
    return Array.isArray(candidate.sources) && typeof candidate.mappings === 'string';
};

/**
 * Decodes one segment of the `mappings` field: base64 VLQ, little-endian, five bits per digit,
 * the sixth marking "there is more", and the lowest bit of the value carrying the sign.
 */
const decodeSegment = (segment: string): number[] => {
    const values: number[] = [];
    let value = 0;
    let shift = 0;

    for (const char of segment) {
        const digit = VLQ_CHARS.indexOf(char);
        if (digit === -1) {
            return values;
        }

        // The sixth bit is the "more digits follow" flag, so a digit of 32 or more carries it.
        value += (digit % 32) * 2 ** shift;
        if (digit >= 32) {
            shift += 5;
            continue;
        }

        const negative = value % 2 === 1;
        const magnitude = Math.floor(value / 2);
        values.push(negative ? -magnitude : magnitude);
        value = 0;
        shift = 0;
    }

    return values;
};

/**
 * The mappings decoded, one array of segments per generated line. Empty lines keep their place, so
 * the index of the outer array is the line number.
 */
export const segmentsOf = (map: SourceMap): Segment[][] => {
    const decoded: Segment[][] = [];
    // The generated column restarts on every line; the source index does not.
    let sourceIndex = 0;

    for (const line of map.mappings.split(';')) {
        const segments: Segment[] = [];
        const fieldsOf = line ? line.split(',') : [];
        let column = 0;

        for (const segment of fieldsOf) {
            const fields = decodeSegment(segment);
            column += fields[0] ?? 0;

            // Fewer than four fields means "this stretch maps to nothing".
            if (fields.length >= 4) {
                sourceIndex += fields[1] ?? 0;
                segments.push({ column, source: map.sources[sourceIndex] ?? null });
            } else {
                segments.push({ column, source: null });
            }
        }

        decoded.push(segments);
    }

    return decoded;
};

/**
 * Which source a position of the generated file came from: the last segment that starts at or
 * before it. `null` when no segment claims that stretch, which is the honest answer — the position
 * is inside the bundler's own runtime, not inside anybody's file.
 */
export const sourceAt = (segments: readonly Segment[][], line: number, column: number): string | null => {
    const row = segments[line] ?? [];
    let found: string | null = null;

    for (const segment of row) {
        if (segment.column > column) {
            break;
        }
        found = segment.source;
    }

    return found;
};

/**
 * Bytes of the generated file attributed to each of its sources.
 *
 * Every segment of a line owns the output from its column to the next segment's, and the last one
 * to the end of the line. What no segment claims — the bundler's own runtime, banners — is left
 * out rather than shared around: making it up would be worse than not having it.
 */
export const bytesBySource = (map: SourceMap, code: string): Map<string, number> => {
    const lines = code.split('\n');
    const bytes = new Map<string, number>();
    const decoded = segmentsOf(map).entries();

    for (const [lineNumber, segments] of decoded) {
        // The newline is a byte of the file too.
        const lineLength = (lines[lineNumber]?.length ?? 0) + 1;

        for (const [index, segment] of segments.entries()) {
            const end = segments[index + 1]?.column ?? lineLength;
            const size = end - segment.column;
            if (segment.source && size > 0) {
                bytes.set(segment.source, (bytes.get(segment.source) ?? 0) + size);
            }
        }
    }

    return bytes;
};

/** The `./` and `../` a map uses to climb out of the output folder. */
const CLIMB = /^(?:\.\.?\/)+/;

/**
 * webpack names a map's sources under a scheme of its own: `webpack:///./src/main.js` in webpack 4,
 * `webpack://my-app/./src/main.js` in webpack 5, and its runtime `webpack/bootstrap` or
 * `webpack/runtime/…`. Without the scheme they are the paths its stats file names; the runtime is
 * webpack's, filed under `node_modules/webpack` as the stats reader files it.
 */
const withoutWebpackScheme = (source: string): string => {
    const path = source.replace(/^webpack:\/\/[^/]*\//, '');
    if (path === source) {
        return source;
    }
    return /^webpack\/(?:bootstrap|runtime\/)/.test(path) ? `node_modules/${path}` : path;
};

/**
 * The folder a map's sources share above the project, when the build was written outside it.
 *
 * A map names its sources relative to where the chunk was written. With the output folder inside
 * the project, `../src/x.ts` and `../node_modules/react/index.js` come out as `src/x.ts` and
 * `node_modules/react/index.js` once the climbing is dropped. Written outside it — `--outDir
 * ../../build` — they climb further and come out as `excalidraw/src/x.ts` and
 * `excalidraw/node_modules/react/…`, and the project's own name read as a folder a second copy of
 * every package was nested in: "react, shipped twice", and against a baseline built the ordinary
 * way, every screen new and gone at once.
 *
 * It is the folder in front of the outermost `node_modules/` when the map holds no package at the
 * top level, every other `node_modules/` sits under it, and some of the project's own files do too. `''` otherwise, which leaves every
 * path as it was — and a workspace package's own `node_modules`, next to the top-level one, is a
 * real second copy and stays one.
 */
export const projectRootOf = (sources: readonly string[]): string => {
    const clean = sources.map(source => withoutWebpackScheme(source).replace(CLIMB, ''));
    const roots = new Set(
        clean.filter(path => path.includes('node_modules/')).map(path => path.slice(0, path.indexOf('node_modules/'))),
    );
    // The shortest one is the project's own `node_modules`; a workspace package's nested one sits
    // under it (`packages/ui/node_modules/…`) and stays a copy of its own once the root is off.
    const [root] = [...roots].toSorted((a, b) => a.length - b.length);
    if (!root || [...roots].some(other => !other.startsWith(root))) {
        return '';
    }
    return clean.some(path => path.startsWith(root) && !path.includes('node_modules/')) ? root : '';
};

/**
 * `projectRootOf` for every map of a build at once. A map holding only the project's own files
 * carries no `node_modules/` to tell where the project starts, and kept its `excalidraw/…` in front
 * while the maps next to it lost theirs; such a map takes the root the others agreed on, when they
 * agreed on one and every source of it sits under it. A map that does carry packages keeps its own
 * answer: a worker can be written at another depth than the chunks around it.
 */
export const projectRootsOf = (maps: readonly (readonly string[])[]): string[] => {
    const own = maps.map(sources => projectRootOf(sources));
    const agreed = new Set(own.filter(root => root !== ''));
    const [shared] = agreed;
    return maps.map((sources, index) => {
        const answer = own[index] ?? '';
        if (answer !== '' || agreed.size !== 1 || !shared) {
            return answer;
        }
        // A map with nothing of the project's own to confirm it — a chunk of one package — or with
        // nothing but the project's own: under the agreed root throughout, it is under it.
        const clean = sources.map(source => withoutWebpackScheme(source).replace(CLIMB, ''));
        return clean.length > 0 && clean.every(path => path.startsWith(shared)) ? shared : '';
    });
};

/**
 * A source as the rest of the tool names it: the `./` and `../` a map uses to climb out of the
 * output folder dropped, and the project's folder when the map climbed past it (`projectRootOf`),
 * which leaves the path the metafile would have written.
 */
export const sourcePathOf = (source: string, root = ''): string => {
    const path = withoutWebpackScheme(source).replace(CLIMB, '');
    return installedAs(root && path.startsWith(root) ? path.slice(root.length) : path);
};

/**
 * Third-party code written where a build tool other than npm's resolution puts it, moved under
 * `node_modules/` so every rule that tells yours from theirs reads it as theirs.
 *
 * ember-cli is the case: its maps name an addon `addon-tree-output/ember-data/…`, Ember itself
 * `@ember/-internals/…` and `@glimmer/runtime.js` with nothing in front, and what the app copies
 * in `vendor/…`. None of it says `node_modules`, so a real Ember build had `ember-data` and Glimmer
 * listed as "files of yours" taking 79 kB of its bootstrap, and no package at all. The project's
 * own sources never start with a scope, and a top-level `vendor/` is third-party by its name.
 */
const installedAs = (path: string): string => {
    if (path.includes('node_modules/')) {
        return path;
    }
    const copied = /^(?:addon-tree-output|vendor)\/(.+)$/.exec(path);
    if (copied) {
        return `node_modules/${copied[1] ?? ''}`;
    }
    return /^@[\w.-]+\//.test(path) ? `node_modules/${path}` : path;
};

/**
 * Angular compiles a component's template into the component, so the map has a stretch coming from
 * `x.component.html` while the metafile only knows `x.component.ts`. Without folding one into the
 * other a component with a big template looks far lighter than it is: measured against this build,
 * the screens panel came out at 58 % of its real weight.
 */
const CODE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs'];

/**
 * Matches the paths of a source map against the metafile's file names.
 *
 * A map writes its sources relative to the output folder (`../../src/app/x.ts`) and the metafile
 * relative to the project root (`src/app/x.ts`), so most of them line up once the `../` are gone.
 * What is left over is matched by file name, and only when there is exactly one candidate: a wrong
 * guess would move weight onto an unrelated file, which is worse than leaving it out.
 */
export const resolveSources = (sources: string[], inputs: string[], root = ''): (string | null)[] => {
    const known = new Set(inputs);
    const byFileName = new Map<string, string[]>();
    for (const input of inputs) {
        const name = input.split('/').pop() ?? input;
        byFileName.set(name, [...(byFileName.get(name) ?? []), input]);
    }

    return sources.map(source => {
        const path = sourcePathOf(source, root);
        if (known.has(path)) {
            return path;
        }

        const base = path.replace(/\.[^./]+$/, '');
        const sibling = CODE_EXTENSIONS.map(extension => base + extension).find(candidate => known.has(candidate));
        if (sibling) {
            return sibling;
        }

        const candidates = (byFileName.get(path.split('/').pop() ?? path) ?? []).filter(
            input => input.endsWith(path) || path.endsWith(input),
        );
        return candidates.length === 1 ? (candidates[0] ?? null) : null;
    });
};

/**
 * Reads the source maps of a build folder. The key is the name of the generated file, the same one
 * the compressed sizes are keyed by. Takes anything with a name and its text, so the page feeds it
 * dropped files and the command feeds it files on disk.
 */
export const readSourceMaps = async (files: TextFile[]): Promise<Map<string, ChunkSplit>> => {
    const splits = new Map<string, ChunkSplit>();
    const codeByName = new Map(files.filter(file => /\.m?js$/.test(file.name)).map(file => [file.name, file]));

    for (const file of files) {
        if (!/\.m?js\.map$/.test(file.name)) {
            continue;
        }

        const generated = file.name.slice(0, -4);
        const code = codeByName.get(generated);
        if (!code) {
            continue;
        }

        try {
            const parsed: unknown = JSON.parse(await file.text());
            if (!isSourceMap(parsed)) {
                continue;
            }

            const split = bytesBySource(parsed, await code.text());
            if (split.size > 0) {
                splits.set(generated, split);
            }
        } catch {
            // A truncated or unreadable map is simply not used: the approximation still works.
        }
    }

    return splits;
};

/**
 * Turns the raw splits into what the analysis takes: bytes keyed by metafile file name. Kept apart
 * from reading, so a folder can be read before the `stats.json` arrives and matched afterwards.
 */
export const resolveSplits = (
    splits: Map<string, ChunkSplit> | null,
    inputs: string[],
): Map<string, Map<string, number>> | null => {
    if (!splits || splits.size === 0) {
        return null;
    }

    const resolved = new Map<string, Map<string, number>>();
    const roots = projectRootsOf([...splits.values()].map(split => [...split.keys()]));
    const entries = [...splits].entries();
    for (const [position, [chunk, split]] of entries) {
        const sources = [...split.keys()];
        const mapped = resolveSources(sources, inputs, roots[position] ?? '');
        const byInput = new Map<string, number>();

        for (const [index, source] of sources.entries()) {
            const input = mapped[index];
            if (input) {
                byInput.set(input, (byInput.get(input) ?? 0) + (split.get(source) ?? 0));
            }
        }

        if (byInput.size > 0) {
            resolved.set(chunk, byInput);
        }
    }

    return resolved.size > 0 ? resolved : null;
};
