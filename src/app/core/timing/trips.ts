/**
 * One screen's load as a waterfall: the round trips it takes, one after another, each a wait and a
 * transfer, and the parse at the end.
 *
 * The report already counts the trips and already estimates the time (`timing.ts`); what it did not
 * do was show them **in sequence**. Three trips of 5 kB cost three waits however little they
 * weigh, and a sum of milliseconds hides exactly that — a picture of the gaps does not. So this is
 * the same model laid out on a time axis, and nothing more: the waits and the throughput are the
 * profiles of `timing.ts`, the trips are the ones the analysis counted, and the total for the
 * bootstrap is the one `timingOf` gives. It is an estimate, and has to be labelled as one wherever
 * it is drawn.
 *
 * The trips are sequential by construction: a browser does not know a chunk exists until the one
 * importing it has arrived and been parsed. Within a trip the chunks share the connection, so a
 * trip ends when all of its bytes are in, not when its smallest file is.
 */

import { type Analysis, type ScreenCost } from '../analysis/analysis.types';
import { PROFILES, scriptMsOf } from './timing';
import { type NetworkProfile } from './timing.types';

export interface TripChunk {
    file: string;
    /** In the report's unit: what travels. */
    bytes: number;
}

export interface Trip {
    /** 1-based, in the order they happen. */
    index: number;
    /** A trip of the first load, before the screen's own ones. */
    boot: boolean;
    chunks: TripChunk[];
    bytes: number;
    startMs: number;
    /** The round trip before the first byte: the gap a waterfall exists to show. */
    waitMs: number;
    transferMs: number;
    endMs: number;
}

export interface TripPlan {
    trips: Trip[];
    /** Parse and compile of everything that arrived, after the last trip. */
    parseMs: number;
    totalMs: number;
    /**
     * The first load was taken as one trip because `index.html` was not read: the graph alone
     * cannot tell a chunk the page names from one discovered by parsing. Said where it is drawn.
     */
    bootAssumed: boolean;
}

/**
 * The trips of a screen for somebody landing on it directly: the first load, then the screen.
 *
 * @param latency the latency the criteria set, which scales every profile's wait like `timingOf`
 *                does; `null` keeps the profiles as they are
 */
export const tripsOf = (
    analysis: Analysis,
    screen: ScreenCost,
    profile: NetworkProfile = PROFILES.slow4g,
    latency: number | null = null,
): TripPlan => {
    const bytesOf = (file: string): number => analysis.chunkOf(file)?.bytes ?? 0;
    const waitMs = profile.latencyMs * (latency === null ? 1 : latency / PROFILES.slow4g.latencyMs);

    // The first load: what the page names on the first trip, then each late group on its own.
    const startup = analysis.startup;
    const late = new Set(startup?.discovered);
    const bootGroups: string[][] = startup
        ? [analysis.bootChunks.filter(file => !late.has(file)), ...startup.byWave]
        : [analysis.bootChunks];

    // The screen's own chunks, by the trip they arrive in counted from the router's request.
    const lazyGroups: string[][] = [];
    for (const [file, wave] of screen.chunkWaves) {
        (lazyGroups[wave - 1] ??= []).push(file);
    }

    const groups = [
        ...bootGroups.filter(group => group.length > 0).map(group => ({ boot: true, group })),
        ...lazyGroups.filter(group => group.length > 0).map(group => ({ boot: false, group })),
    ];

    let clock = 0;
    const trips = groups.map(({ boot, group }, position): Trip => {
        const chunks = group.map(file => ({ file, bytes: bytesOf(file) })).toSorted((a, b) => b.bytes - a.bytes);
        const bytes = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
        const transferMs = (bytes / profile.bytesPerSecond) * 1000;
        const trip: Trip = {
            index: position + 1,
            boot,
            chunks,
            bytes,
            startMs: Math.round(clock),
            waitMs: Math.round(waitMs),
            transferMs: Math.round(transferMs),
            endMs: Math.round(clock + waitMs + transferMs),
        };
        clock += waitMs + transferMs;
        return trip;
    });

    // Parse goes by raw bytes, which a chunk does not carry: the bootstrap's own ratio converts.
    const travelled = trips.reduce((sum, trip) => sum + trip.bytes, 0);
    const toRaw = analysis.bootBytes > 0 ? analysis.bootRawBytes / analysis.bootBytes : 1;
    const parseMs = Math.round(scriptMsOf(travelled * toRaw));

    return { trips, parseMs, totalMs: Math.round(clock) + parseMs, bootAssumed: !startup };
};
