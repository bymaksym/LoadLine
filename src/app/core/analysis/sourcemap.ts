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

/**
 * A source as the rest of the tool names it: the `./` and `../` a map uses to climb out of the
 * output folder dropped, which leaves the path the metafile would have written.
 */
export const sourcePathOf = (source: string): string => source.replace(/^(?:\.\.?\/)+/, '');

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
export const resolveSources = (sources: string[], inputs: string[]): (string | null)[] => {
    const known = new Set(inputs);
    const byFileName = new Map<string, string[]>();
    for (const input of inputs) {
        const name = input.split('/').pop() ?? input;
        byFileName.set(name, [...(byFileName.get(name) ?? []), input]);
    }

    return sources.map(source => {
        const path = sourcePathOf(source);
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
    for (const [chunk, split] of splits) {
        const sources = [...split.keys()];
        const mapped = resolveSources(sources, inputs);
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
