/**
 * The browser's own measurement, contrasted against the computed one.
 *
 * Loadline walks the graph of static imports and adds up. The browser downloads what it downloads, and
 * the two do not match: entering through the root, the router loads an area's chunk to match the
 * route and only then does a guard turn it away — the chunk is already on the wire. See
 * `HOW-IT-WORKS.md` §4.1.
 *
 * What is compared here is the **set of chunks**, not the byte count. The set is unit-independent,
 * so a report shown in gzip and a browser reporting raw transfer sizes still compare cleanly: the
 * difference is then priced with Loadline's own figures, in Loadline's own unit.
 */

import { type Analysis, type ScreenCost } from '../analysis/analysis.types';
import { baseName } from '../format/format.utils';
import {
    type EagerScreen,
    type MeasuredChunk,
    type MeasuredEntry,
    type MeasuredPage,
    type MeasuredReport,
    type Measurement,
    type MeasurementError,
    NO_PAGE,
} from './measurement.types';

/** Names the browser reports for things that are not part of any bundle. */
const isAsset = (file: string): boolean => /\.(js|mjs|css)$/i.test(file);

/** File name out of a URL, an absolute path or a bare name. Query and hash go away. */
const fileNameOf = (raw: string): string => {
    const clean = raw.split(/[?#]/, 1)[0] ?? raw;
    return baseName(clean.replace(/\/+$/, ''));
};

interface RawEntry {
    name?: unknown;
    transferSize?: unknown;
    encodedBodySize?: unknown;
    decodedBodySize?: unknown;
    protocol?: unknown;
    nextHopProtocol?: unknown;
    startTime?: unknown;
    requestStart?: unknown;
    responseStart?: unknown;
    responseEnd?: unknown;
    connectStart?: unknown;
    connectEnd?: unknown;
}

/**
 * `transferSize` is 0 on a cache hit and on a cross-origin response without Timing-Allow-Origin,
 * so the encoded body — what the compressed file weighs — is the fallback.
 */
const bytesOf = (entry: RawEntry): number | null => {
    const transfer = typeof entry.transferSize === 'number' ? entry.transferSize : 0;
    if (transfer > 0) {
        return transfer;
    }

    const encoded = typeof entry.encodedBodySize === 'number' ? entry.encodedBodySize : 0;
    return encoded > 0 ? encoded : null;
};

/** A number the paste actually carried, as opposed to one it left out. `0` is a value, not absence. */
const numberOf = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

const textOf = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/**
 * All six timings or none.
 *
 * A paste carrying `startTime` and nothing else would be read as a load where every response came
 * back instantly, which is worse than a paste with no timings at all: the second says "unknown"
 * and the first says something false.
 */
const timingOf = (entry: RawEntry): MeasuredEntry['timing'] => {
    const start = numberOf(entry.startTime);
    const requestStart = numberOf(entry.requestStart);
    const responseStart = numberOf(entry.responseStart);
    const responseEnd = numberOf(entry.responseEnd);
    if (start === null || requestStart === null || responseStart === null || responseEnd === null) {
        return null;
    }

    return {
        start,
        requestStart,
        responseStart,
        responseEnd,
        connectStart: numberOf(entry.connectStart) ?? 0,
        connectEnd: numberOf(entry.connectEnd) ?? 0,
    };
};

const entriesFrom = (list: unknown[]): MeasuredEntry[] => {
    const entries: MeasuredEntry[] = [];
    for (const item of list) {
        if (typeof item === 'string') {
            entries.push({ file: fileNameOf(item), bytes: null, url: item });
            continue;
        }
        if (item && typeof item === 'object') {
            const raw = item as RawEntry;
            if (typeof raw.name === 'string') {
                entries.push({
                    file: fileNameOf(raw.name),
                    bytes: bytesOf(raw),
                    url: raw.name,
                    // Either spelling: `nextHopProtocol` is what the browser calls it, `protocol`
                    // is what the snippet renames it to, and a HAR pasted by hand uses neither
                    // consistently.
                    protocol: textOf(raw.protocol) ?? textOf(raw.nextHopProtocol),
                    transferSize: numberOf(raw.transferSize),
                    encodedBodySize: numberOf(raw.encodedBodySize),
                    decodedBodySize: numberOf(raw.decodedBodySize),
                    timing: timingOf(raw),
                });
            }
        }
    }

    return entries;
};

/** What the page said about itself, when the paste carried it. Anything missing stays `null`. */
const pageFrom = (object: Record<string, unknown>): MeasuredPage => ({
    origin: textOf(object['origin']),
    ttfbMs: numberOf(object['ttfb']),
    protocol: textOf(object['documentProtocol']),
    serviceWorker: typeof object['serviceWorker'] === 'boolean' ? object['serviceWorker'] : null,
    caches: Array.isArray(object['caches'])
        ? object['caches'].filter((name): name is string => typeof name === 'string')
        : null,
    modulepreloads: numberOf(object['modulepreloads']),
    takenAt: textOf(object['takenAt']),
});

/**
 * Reads whatever was pasted. Proper JSON first — an array of resource entries, or the object the
 * snippet builds. Failing that, any asset name in the text: pasting the network tab, a HAR or a
 * plain list all end up here, and a name list is enough to compare the sets.
 */
export const readMeasurement = (text: string): Measurement | MeasurementError => {
    const trimmed = text.trim();
    if (!trimmed) {
        return 'empty';
    }

    let url: string | null = null;
    let page: MeasuredPage = NO_PAGE;
    let entries: MeasuredEntry[] = [];

    try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            entries = entriesFrom(parsed);
        } else if (parsed && typeof parsed === 'object') {
            const object = parsed as Record<string, unknown> & { entries?: unknown; resources?: unknown };
            const list = Array.isArray(object.entries)
                ? object.entries
                : Array.isArray(object.resources)
                  ? object.resources
                  : null;
            if (list) {
                entries = entriesFrom(list);
                url = typeof object['url'] === 'string' ? object['url'] : null;
                page = pageFrom(object);
            }
        }

        if (entries.length > 0) {
            return { url, entries: dedupe(entries), source: 'json', page };
        }
    } catch {
        // Not JSON: fall through to scraping names out of the text.
    }

    const names = trimmed.match(/[\w.@~-]+\.(?:js|mjs|css)\b/gi) ?? [];
    entries = names.map(name => ({ file: fileNameOf(name), bytes: null }));
    if (entries.length === 0) {
        return 'noFiles';
    }

    return { url: null, entries: dedupe(entries), source: 'text', page: NO_PAGE };
};

/** How much one report of a file carries, to keep the fuller of two reports of the same file. */
const richness = (entry: MeasuredEntry): number =>
    (entry.bytes === null ? 0 : 2) + (entry.timing ? 1 : 0) + (entry.protocol ? 1 : 0);

/** The same file can be reported twice (a preload and the request). It is downloaded once. */
const dedupe = (entries: MeasuredEntry[]): MeasuredEntry[] => {
    const byFile = new Map<string, MeasuredEntry>();
    for (const entry of entries) {
        const current = byFile.get(entry.file);
        // The one that carries more wins: the same file can be reported once as a preload with no
        // size and once as the request that actually brought it, and the timings only exist on one
        // of the two. Losing them would cost the measured waves an entry for no reason.
        if (!current || richness(entry) > richness(current)) {
            byFile.set(entry.file, entry);
        }
    }

    return [...byFile.values()];
};

/**
 * Contrasts a measurement against the analysis.
 *
 * @param analysis  the report as computed
 * @param measurement  what the browser reported
 * @param pick  source file of the screen to attribute it to; when absent it is worked out
 */
export const contrast = (
    analysis: Analysis,
    measurement: Measurement,
    pick: string | null = null,
): MeasuredReport | MeasurementError => {
    const bootSet = new Set(analysis.bootChunks);
    // Metafile keys carry the output folder; the browser only ever says the file name.
    const byName = new Map<string, string>();
    for (const file of analysis.allChunks) {
        byName.set(baseName(file), file);
    }

    const downloaded = new Set<string>();
    const transferOf = new Map<string, number>();
    /** Running total of what the browser said it cost: adding it here avoids a second pass. */
    let transferred = 0;
    const foreign: string[] = [];
    let otherFiles = 0;

    for (const entry of measurement.entries) {
        if (!isAsset(entry.file)) {
            otherFiles += 1;
            continue;
        }

        const file = byName.get(entry.file);
        if (!file) {
            // CSS is not part of Loadline's figures — its analysis is JavaScript — so an unknown
            // stylesheet is not an unknown file, only an uncounted one.
            if (/\.css$/i.test(entry.file)) {
                otherFiles += 1;
            } else {
                foreign.push(entry.file);
            }
            continue;
        }
        if (!/\.js$/i.test(file)) {
            otherFiles += 1;
            continue;
        }

        downloaded.add(file);
        if (entry.bytes !== null) {
            transferOf.set(file, entry.bytes);
            transferred += entry.bytes;
        }
    }

    if (downloaded.size === 0) {
        return 'noMatch';
    }

    const screen = pick
        ? (analysis.screens.find(candidate => candidate.source === pick) ?? null)
        : bestScreen(analysis, downloaded, bootSet);

    const expected = new Set<string>([
        ...analysis.bootChunks,
        ...(screen?.sharedChunks ?? []),
        ...(screen?.ownChunks ?? []),
    ]);

    const describe = (file: string): MeasuredChunk => {
        const info = analysis.chunkOf(file);
        return {
            file,
            name: baseName(file),
            bytes: info?.bytes ?? 0,
            transferred: transferOf.get(file) ?? null,
            zone: bootSet.has(file) ? 'boot' : (info?.screens ?? 0) > 1 ? 'shared' : 'own',
            screens: analysis.chunkScreens.get(file) ?? [],
        };
    };

    const bySize = (a: MeasuredChunk, b: MeasuredChunk) => b.bytes - a.bytes;
    const matched: MeasuredChunk[] = [];
    const extra: MeasuredChunk[] = [];
    const missing: MeasuredChunk[] = [];

    for (const file of downloaded) {
        (expected.has(file) ? matched : extra).push(describe(file));
    }
    for (const file of expected) {
        if (!downloaded.has(file)) {
            missing.push(describe(file));
        }
    }
    matched.sort(bySize);
    extra.sort(bySize);
    missing.sort(bySize);

    // An extra chunk that belongs to other screens is the router-before-guard case: it is not
    // "the calculation is short", it is "this screen paid for that one".
    const labelOf = new Map(analysis.screens.map(row => [row.source, row.label]));
    const eagerBySource = new Map<string, EagerScreen>();
    for (const chunk of extra) {
        const owners = chunk.screens.filter(owner => owner !== screen?.source);
        for (const source of owners) {
            const group = eagerBySource.get(source) ?? {
                source,
                label: labelOf.get(source) ?? baseName(source),
                bytes: 0,
            };
            group.bytes += chunk.bytes;
            eagerBySource.set(source, group);
        }
    }

    const sum = (chunks: MeasuredChunk[]) => chunks.reduce((total, chunk) => total + chunk.bytes, 0);

    return {
        screen,
        picked: pick !== null,
        matched,
        extra,
        missing,
        eager: [...eagerBySource.values()].toSorted((a, b) => b.bytes - a.bytes),
        foreign,
        otherFiles,
        computed: screen ? screen.total : analysis.bootBytes,
        measured: sum(matched) + sum(extra),
        transferred: transferOf.size > 0 ? transferred : null,
        computedFiles: expected.size,
        measuredFiles: downloaded.size,
    };
};

/**
 * Which screen a measurement belongs to, when nobody said. The one whose chunks explain the most of
 * what came down: every predicted chunk present counts, every one missing counts against. A load
 * that only brought the bootstrap gets no screen, and that is the right answer.
 */
const bestScreen = (analysis: Analysis, downloaded: Set<string>, bootSet: Set<string>): ScreenCost | null => {
    // Only the bootstrap came down: there is no screen to attribute this to.
    if ([...downloaded].every(file => bootSet.has(file))) {
        return null;
    }

    let best: ScreenCost | null = null;
    let bestScore = 0;

    for (const screen of analysis.screens) {
        const own = [...screen.ownChunks, ...screen.sharedChunks];
        const hit = own.filter(file => downloaded.has(file)).length;
        const miss = own.length - hit;
        const score = hit - miss;
        // A screen has to explain something of its own; ties go to the first, already sorted by weight.
        if (hit > 0 && score > bestScore) {
            best = screen;
            bestScore = score;
        }
    }

    return best;
};
