/**
 * The environment as **observed**, which is not the environment of the audience.
 *
 * Everything in here comes from one paste, taken once, from one machine, on one connection. That
 * is a real measurement and it is a narrow one, and the difference matters enough that the block
 * is named after it: `observed`, never `audience`. A developer on office fibre measuring `h3` and
 * writing it into a versioned file has produced a false fact with the shape of a measurement.
 *
 * **What it is for.** Half of this report reasons about round trips, compression and caching from
 * the build folder alone, which means reasoning about what was *built* rather than what is
 * *served*. A `.br` next to a `.js` says the pipeline made one; only `encodedBodySize` against
 * `decodedBodySize` says the server sent it. A hashed file name says the name can be cached
 * forever; only `transferSize` of zero says a returning visitor did not ask for it again.
 *
 * **What it must never do.** No figure here moves a threshold. Facts widen or narrow what the
 * report is allowed to claim; they do not relabel a build as good. The asymmetry is deliberate:
 * an optimistic answer produces silence where the honest answer is noise.
 */

import { type MeasuredEntry, type Measurement } from './measurement.types';

/** The protocol most of the build's own JavaScript came over, and how unanimous that was. */
export interface ObservedProtocol {
    /** `h2`, `h3`, `http/1.1`. `null` when nothing in the paste said. */
    value: string | null;
    /** Files that agreed, out of the files that said anything at all. */
    agree: number;
    counted: number;
    /** Every distinct answer seen, so a mixed deployment is visible instead of averaged away. */
    seen: string[];
}

/** What compression the server actually applied, as opposed to what the pipeline produced. */
export interface ObservedCompression {
    /** Build files that came down with no compression worth the name. */
    uncompressed: string[];
    /** Their decoded bytes: what is being paid for the missing header. */
    uncompressedBytes: number;
    /** `decoded / encoded` over the build's JavaScript. `null` when the paste did not say. */
    ratio: number | null;
}

/** What the browser did about its cache, measured rather than assumed from the file names. */
export interface ObservedCache {
    /** `transferSize` of zero with a body: served from the cache, no request made. */
    fromCache: number;
    /** A few hundred bytes against a large body: a 304, so the round trip was paid anyway. */
    revalidated: number;
    /** Downloaded in full. */
    network: number;
}

/** Connections opened during the load: the HTTP/1.1 pool running out, observed. */
export interface ObservedConnections {
    opened: number;
    /** How late the last one was opened, in milliseconds from the navigation. */
    lastAt: number | null;
}

/** Everything the page fetched that is neither the page's own host nor part of this build. */
export interface ObservedThirdParty {
    requests: number;
    origins: string[];
    /**
     * Every request of the load, of any kind.
     *
     * It is the denominator `screenFilesMax` has never had. Thirty JavaScript files is one number
     * on a page making thirty-two requests and a different one on a page making a hundred and ten,
     * and under HTTP/1.1 it is the difference between fine and catastrophic. Under h2 and h3 the
     * third parties do not share the page's connection, so each origin is its own handshake.
     */
    total: number;
}

/**
 * One batch as the browser actually took it: the requests that overlapped, before any of them had
 * come back.
 *
 * A request that starts before the earliest response of the current batch ended could not have
 * been discovered by parsing that batch, so it belongs to the same one.
 *
 * **A batch is not the same thing as a round trip of the import graph, and the difference is the
 * point.** The graph counts discovery: a chunk the browser cannot know about until it has parsed
 * another. A batch counts what happened, which under HTTP/1.1 also splits on the connection pool —
 * the seventh file starts when the first finishes, and that is queueing, not discovery. So a load
 * measuring more batches than the graph predicts is either a request the graph cannot see or the
 * pool running out, and the report has to say which of the two. It is the only place a wrong
 * round-trip figure can be caught at all.
 */
export interface MeasuredWave {
    files: string[];
    /** When the first of them was asked for, in milliseconds from the navigation. */
    startedAt: number;
    /** When the last of them finished. */
    endedAt: number;
}

export interface Observed {
    protocol: ObservedProtocol;
    /**
     * `responseStart - requestStart`, median over the build's JavaScript that was not a cache hit.
     *
     * A measured round trip, which beats asking somebody what their latency is — and it is still
     * one machine's round trip to one server, which is why it never moves a threshold on its own.
     */
    rttMs: number | null;
    /** How long the document itself took before wave zero could even start. */
    ttfbMs: number | null;
    compression: ObservedCompression;
    cache: ObservedCache;
    connections: ObservedConnections;
    /** The hosts the build's JavaScript actually came from, as measured rather than as written. */
    assetOrigins: string[];
    thirdParty: ObservedThirdParty;
    serviceWorker: boolean | null;
    caches: string[] | null;
    modulepreloads: number | null;
    /** The batches the browser really took over this build's JavaScript. Empty without timings. */
    waves: MeasuredWave[];
    takenAt: string | null;
    /** Whether the paste carried timings at all: without them most of the above is `null`. */
    timed: boolean;
}

/** How long a measurement of a channel is worth trusting before it is worth taking again. */
export const OBSERVED_FRESH_DAYS = 30;

/** Whether a fact taken on `takenAt` has gone stale, against a day given as `YYYY-MM-DD`. */
export const isStale = (takenAt: string | null, today: string): boolean => {
    if (!takenAt) {
        return false;
    }

    const taken = Date.parse(takenAt);
    const now = Date.parse(`${today}T00:00:00Z`);
    if (Number.isNaN(taken) || Number.isNaN(now)) {
        return false;
    }

    return now - taken > OBSERVED_FRESH_DAYS * 24 * 60 * 60 * 1000;
};

const originOf = (url: string | null | undefined): string | null => {
    if (!url) {
        return null;
    }

    const found = /^(https?:)\/\/([^/?#]+)/i.exec(url);
    return found ? `${(found[1] ?? '').toLowerCase()}//${(found[2] ?? '').toLowerCase()}` : null;
};

const median = (values: number[]): number | null => {
    if (values.length === 0) {
        return null;
    }

    const sorted = values.toSorted((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)] ?? null;
};

/**
 * A response that arrived compressed, at all.
 *
 * The test is deliberately loose. Anything that came back within a few per cent of its decoded
 * size was not compressed; anything meaningfully smaller was, and by how much is the other figure.
 * Small files are skipped because a 400-byte module compresses to about nothing either way and
 * naming it would be noise on top of a real finding.
 */
const MIN_COMPRESSIBLE = 2048;
const UNCOMPRESSED_AT = 0.95;

/**
 * The batches the browser really took, from the order the requests started.
 *
 * This is validation rather than more prediction, and it is the one thing no other tool can do:
 * the RUM vendors have the waterfall and not the module graph, the bundle analysers have the graph
 * and not the waterfall. The same shape already exists in `--self-check`, which computes the
 * bootstrap twice by two routes and fails when the two disagree.
 */
export const wavesOf = (entries: MeasuredEntry[]): MeasuredWave[] => {
    const timed = entries.filter(entry => entry.timing).toSorted((a, b) => a.timing!.start - b.timing!.start);
    const first = timed[0];
    if (!first) {
        return [];
    }

    /** Milliseconds of slack, so two requests fired in the same tick never land in two trips. */
    const TOLERANCE = 5;

    const waves: MeasuredWave[] = [];
    let files = [first.file];
    let startedAt = first.timing!.start;
    let endedAt = first.timing!.responseEnd;
    /** The earliest moment anything of this trip had come back: the soonest it could reveal more. */
    let boundary = first.timing!.responseEnd;

    for (const entry of timed.slice(1)) {
        const timing = entry.timing!;
        if (timing.start >= boundary - TOLERANCE) {
            waves.push({ files, startedAt, endedAt });
            files = [entry.file];
            startedAt = timing.start;
            endedAt = timing.responseEnd;
            boundary = timing.responseEnd;
            continue;
        }

        files.push(entry.file);
        endedAt = Math.max(endedAt, timing.responseEnd);
        boundary = Math.min(boundary, timing.responseEnd);
    }

    waves.push({ files, startedAt, endedAt });
    return waves;
};

/**
 * @param build file names of this build's JavaScript, as the browser reports them. Everything else
 *              in the paste is somebody else's code and is counted as such rather than ignored.
 */
export const observedFrom = (measurement: Measurement, build: ReadonlySet<string>): Observed => {
    const page = measurement.page;
    const pageOrigin = page.origin ?? originOf(measurement.url);
    const own = measurement.entries.filter(entry => build.has(entry.file));
    const timed = own.some(entry => entry.timing);

    const protocols = own.map(entry => entry.protocol).filter((value): value is string => !!value);
    const counts = new Map<string, number>();
    for (const protocol of protocols) {
        counts.set(protocol, (counts.get(protocol) ?? 0) + 1);
    }
    const top = [...counts].toSorted((a, b) => b[1] - a[1])[0] ?? null;

    const uncompressed: string[] = [];
    let uncompressedBytes = 0;
    let encodedTotal = 0;
    let decodedTotal = 0;
    let fromCache = 0;
    let revalidated = 0;
    let network = 0;
    let opened = 0;
    let lastAt: number | null = null;
    const trips: number[] = [];
    const assetOrigins = new Set<string>();

    for (const entry of own) {
        const origin = originOf(entry.url);
        if (origin && origin !== pageOrigin) {
            assetOrigins.add(origin);
        }

        const encoded = entry.encodedBodySize ?? null;
        const decoded = entry.decodedBodySize ?? null;
        if (encoded !== null && decoded !== null && decoded >= MIN_COMPRESSIBLE) {
            encodedTotal += encoded;
            decodedTotal += decoded;
            if (encoded >= decoded * UNCOMPRESSED_AT) {
                uncompressed.push(entry.file);
                uncompressedBytes += decoded;
            }
        }

        const transfer = entry.transferSize ?? null;
        if (transfer !== null && encoded !== null) {
            if (transfer === 0 && encoded > 0) {
                fromCache += 1;
            } else if (transfer > 0 && encoded > 0 && transfer < encoded * 0.1) {
                // Headers came back and the body did not: a 304. The round trip was still paid,
                // which is exactly what "cached" is usually taken to mean it was not.
                revalidated += 1;
            } else if (transfer > 0) {
                network += 1;
            }
        }

        const timing = entry.timing;
        if (timing) {
            // A cache hit has no round trip to measure and would drag the median to zero.
            if (timing.responseStart > timing.requestStart && (transfer === null || transfer > 0)) {
                trips.push(timing.responseStart - timing.requestStart);
            }
            if (timing.connectEnd > timing.connectStart) {
                opened += 1;
                lastAt = Math.max(lastAt ?? 0, timing.connectStart);
            }
        }
    }

    const thirdOrigins = new Set<string>();
    let thirdRequests = 0;
    for (const entry of measurement.entries) {
        if (build.has(entry.file)) {
            continue;
        }

        const origin = originOf(entry.url);
        if (origin && pageOrigin && origin !== pageOrigin) {
            thirdOrigins.add(origin);
            thirdRequests += 1;
        }
    }

    return {
        protocol: {
            value: top?.[0] ?? null,
            agree: top?.[1] ?? 0,
            counted: protocols.length,
            seen: [...counts.keys()],
        },
        rttMs: median(trips),
        ttfbMs: page.ttfbMs,
        compression: {
            uncompressed,
            uncompressedBytes,
            ratio: encodedTotal > 0 ? decodedTotal / encodedTotal : null,
        },
        cache: { fromCache, revalidated, network },
        connections: { opened, lastAt },
        assetOrigins: [...assetOrigins],
        thirdParty: { requests: thirdRequests, origins: [...thirdOrigins], total: measurement.entries.length },
        serviceWorker: page.serviceWorker,
        caches: page.caches,
        modulepreloads: page.modulepreloads,
        waves: wavesOf(own),
        takenAt: page.takenAt,
        timed,
    };
};
