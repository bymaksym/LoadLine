/**
 * The index map of the source map specification — `{ "version": 3, "sections": [...] }` — joined into
 * the regular map every reader here understands.
 *
 * Metro writes it: an Expo app exported as JavaScript came with a 4.3 MB bundle and a 16 MB map in
 * 2,290 sections, one per module, with no `sources` or `mappings` at its root. Every reader asked for
 * those two fields, found neither, dropped the map without a word and reported "this folder carries
 * no source maps". It is in the specification, so any tool may write it, not only Metro.
 *
 * Joining is done once, where the JSON is parsed, so the readers downstream — the split per file,
 * the attribution of a `console.log`, the exposure of the sources, the graph of a folder — need no
 * second path. Each section's mappings are decoded to absolute positions, moved by the section's
 * offset (its first line by the column too, the rest by the line alone, as the specification says)
 * and encoded again against one list of sources. Names are left out: nothing here reads them.
 *
 * A section that points at another file (`url`) instead of carrying its map is not followed — there
 * is no fetching here — and a map made only of those is not readable; `isReadableMap` says so, which
 * is what lets the report say "there is a map in a format this does not read" instead of "none".
 */

const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** One decoded segment, absolute: generated column, then source, line and column when it maps. */
type Absolute = [number] | [number, number, number, number];

const record = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** An offset's line or column: a number, or `0` where the section left it out. */
const offsetOf = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** Base64 VLQ, the same reading `sourcemap.ts` does, for every field of every segment of a line. */
const decodeFields = (segment: string): number[] => {
    const values: number[] = [];
    let value = 0;
    let shift = 0;
    for (const char of segment) {
        const digit = VLQ_CHARS.indexOf(char);
        if (digit === -1) {
            return values;
        }
        value += (digit % 32) * 2 ** shift;
        if (digit >= 32) {
            shift += 5;
            continue;
        }
        values.push(value % 2 === 1 ? -Math.floor(value / 2) : Math.floor(value / 2));
        value = 0;
        shift = 0;
    }
    return values;
};

const encode = (value: number): string => {
    let rest = value < 0 ? -value * 2 + 1 : value * 2;
    let out = '';
    do {
        const digit = rest % 32;
        rest = Math.floor(rest / 32);
        out += VLQ_CHARS[digit + (rest > 0 ? 32 : 0)] ?? '';
    } while (rest > 0);
    return out;
};

/** A section's mappings as absolute segments per line: the relative fields carried along. */
const decodeAbsolute = (mappings: string): Absolute[][] => {
    const lines: Absolute[][] = [];
    let source = 0;
    let sourceLine = 0;
    let sourceColumn = 0;
    for (const line of mappings.split(';')) {
        const segments: Absolute[] = [];
        let column = 0;
        const written = line ? line.split(',') : [];
        for (const segment of written) {
            const fields = decodeFields(segment);
            column += fields[0] ?? 0;
            if (fields.length >= 4) {
                source += fields[1] ?? 0;
                sourceLine += fields[2] ?? 0;
                sourceColumn += fields[3] ?? 0;
                segments.push([column, source, sourceLine, sourceColumn]);
            } else {
                segments.push([column]);
            }
        }
        lines.push(segments);
    }
    return lines;
};

/** The regular map an index map stands for, or `null` when no section carries a map of its own. */
const joinSections = (sections: readonly unknown[]): Record<string, unknown> | null => {
    const sources: string[] = [];
    const contents: (string | null)[] = [];
    const indexOf = new Map<string, number>();
    const output: Absolute[][] = [];
    let joined = 0;

    const ordered = sections
        .map(section => record(section))
        .filter((section): section is Record<string, unknown> => section !== null)
        .map(section => ({
            line: offsetOf(record(section['offset'])?.['line']),
            column: offsetOf(record(section['offset'])?.['column']),
            map: record(section['map']),
        }))
        .toSorted((a, b) => a.line - b.line || a.column - b.column);

    for (const { line, column, map } of ordered) {
        const own = map ? map['sources'] : null;
        const mappings = map ? map['mappings'] : null;
        // A nested index map is forbidden by the specification, and a `url` section is not fetched.
        if (!map || !Array.isArray(own) || typeof mappings !== 'string') {
            continue;
        }
        joined += 1;
        const ownContents = Array.isArray(map['sourcesContent']) ? map['sourcesContent'] : [];
        const global = own.map((source, index) => {
            const name = typeof source === 'string' ? source : '';
            const known = indexOf.get(name);
            if (known !== undefined) {
                return known;
            }
            indexOf.set(name, sources.length);
            sources.push(name);
            const content: unknown = ownContents[index];
            contents.push(typeof content === 'string' ? content : null);
            return sources.length - 1;
        });

        for (const [offset, segments] of decodeAbsolute(mappings).entries()) {
            const at = line + offset;
            const shift = offset === 0 ? column : 0;
            while (output.length <= at) {
                output.push([]);
            }
            const row = output[at] ?? [];
            for (const segment of segments) {
                row.push(
                    segment.length === 4
                        ? [segment[0] + shift, global[segment[1]] ?? 0, segment[2], segment[3]]
                        : [segment[0] + shift],
                );
            }
        }
    }

    if (joined === 0) {
        return null;
    }

    // Encoded again, relative as the format wants: the column within its line, the rest across the map.
    let source = 0;
    let sourceLine = 0;
    let sourceColumn = 0;
    const encoded = output.map(row => {
        let column = 0;
        return row
            .map(segment => {
                const head = encode(segment[0] - column);
                column = segment[0];
                if (segment.length === 1) {
                    return head;
                }
                const tail =
                    encode(segment[1] - source) + encode(segment[2] - sourceLine) + encode(segment[3] - sourceColumn);
                [, source, sourceLine, sourceColumn] = segment;
                return head + tail;
            })
            .join(',');
    });

    return { version: 3, sources, sourcesContent: contents, names: [], mappings: encoded.join(';') };
};

/** Whether a parsed map is an index map: `sections` and no `mappings` of its own. */
export const isIndexMap = (value: unknown): boolean => {
    const map = record(value);
    return !!map && Array.isArray(map['sections']) && typeof map['mappings'] !== 'string';
};

/**
 * A parsed source map as every reader here expects one: an index map joined into a regular map,
 * anything else as it came. What cannot be joined comes back as it came, and reads as no map.
 */
export const asPlainMap = (value: unknown): unknown => {
    const map = record(value);
    const sections = map?.['sections'];
    return isIndexMap(value) && Array.isArray(sections) ? (joinSections(sections) ?? value) : value;
};

/** `JSON.parse` of a map's text, index maps joined. Throws as `JSON.parse` does on what is not JSON. */
export const parseSourceMap = (text: string): unknown => asPlainMap(JSON.parse(text));

/**
 * Whether a map's text is one this tool reads: JSON with `sources` and `mappings`, once an index map
 * is joined. `false` for an index map made only of `url` sections, a map of another shape, or text
 * that is not JSON — the cases the report has to name as "a map it does not read".
 */
export const isReadableMap = (text: string): boolean => {
    try {
        const map = record(parseSourceMap(text));
        return !!map && Array.isArray(map['sources']) && typeof map['mappings'] === 'string';
    } catch {
        return false;
    }
};
