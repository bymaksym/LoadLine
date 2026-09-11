/** The shapes of a browser measurement contrasted against the computed report. */

import { type ScreenCost, type Zone } from '../analysis/analysis.types';

/**
 * When each part of one response happened, in milliseconds from the navigation.
 *
 * All six or none: a paste that carries names and sizes but no timings is the common case, and a
 * half-filled timing object would be read as zeros by everything downstream.
 */
export interface EntryTiming {
    /** When the browser asked for it. Ordering these is what the measured waves are made of. */
    start: number;
    requestStart: number;
    /** First byte back. `responseStart - requestStart` is a round trip, measured rather than asked for. */
    responseStart: number;
    responseEnd: number;
    /**
     * Non-zero and apart from each other when this response had to open a connection of its own.
     * Under HTTP/1.1 that is the pool running out, observed instead of inferred from the protocol.
     */
    connectStart: number;
    connectEnd: number;
}

/** One resource the browser reported, reduced to what matters here. */
export interface MeasuredEntry {
    /** File name, without path or query: `main-ABC123.js`. */
    file: string;
    /** Bytes over the wire, when the browser gave them. `null` from a cache hit or a bare name list. */
    bytes: number | null;
    /** The address as reported. The only place the host it came from survives. */
    url?: string | null;
    /** What was negotiated for this response: `h2`, `h3`, `http/1.1`. `null` when the paste is silent. */
    protocol?: string | null;
    /**
     * The three sizes exactly as reported, kept apart on purpose.
     *
     * `transferSize` of `0` is a cache hit and is not the same as "not said"; a small non-zero one
     * against a large body is a revalidation. `encodedBodySize` against `decodedBodySize` is the
     * compression that was **served**, which is a different fact from a `.br` sitting in the build
     * folder — plenty of deployments build one and serve the other.
     */
    transferSize?: number | null;
    encodedBodySize?: number | null;
    decodedBodySize?: number | null;
    timing?: EntryTiming | null;
}

/**
 * What the page itself said, as opposed to what it fetched.
 *
 * These are the facts the import graph cannot hold and a build folder cannot either: whether a
 * service worker is **controlling** this load rather than merely shipped, how long the document
 * took before wave zero even started, and how many preload tags the framework really emitted.
 */
export interface MeasuredPage {
    /** `location.origin`: what makes a request to another host tellable from one to the page's own. */
    origin: string | null;
    /**
     * `responseStart` of the navigation entry.
     *
     * The round-trip count starts when `index.html` is parsed, but wave zero is the document, and
     * on plenty of applications it is the dominant term. Without it the seconds in this report are
     * not comparable with what a person actually sits through.
     */
    ttfbMs: number | null;
    /** The protocol the document came over. */
    protocol: string | null;
    /**
     * Whether a service worker was controlling the page. Strictly better than finding
     * `ngsw-worker.js` in the folder: a file in the build is not a worker in charge of a load.
     */
    serviceWorker: boolean | null;
    /** The caches that page can see, by name. `null` when the paste did not carry them. */
    caches: string[] | null;
    /** `link rel=modulepreload` tags in the live document: how many the framework really emits. */
    modulepreloads: number | null;
    /** When the snippet ran, as it said. Everything measured here is only as fresh as this. */
    takenAt: string | null;
}

/** Nothing known about the page: what an older paste, or a scraped list of names, gives. */
export const NO_PAGE: MeasuredPage = {
    origin: null,
    ttfbMs: null,
    protocol: null,
    serviceWorker: null,
    caches: null,
    modulepreloads: null,
    takenAt: null,
};

/** What was pasted, once read. */
export interface Measurement {
    /** The address that was open, when the snippet reported it. */
    url: string | null;
    entries: MeasuredEntry[];
    /** How the text was read: proper JSON, or names scraped out of arbitrary text. */
    source: 'json' | 'text';
    /** What the page said about itself. Every field is `null` when the paste did not carry it. */
    page: MeasuredPage;
}

/** Why a paste could not be used. */
export type MeasurementError = 'empty' | 'noFiles' | 'noMatch';

/** A chunk of the build seen from the measurement. */
export interface MeasuredChunk {
    file: string;
    name: string;
    /** Loadline's figure for it, in the unit the report is shown in. */
    bytes: number;
    /** What the browser said it cost over the wire. `null` when it did not say. */
    transferred: number | null;
    zone: Zone;
    /** Screens loading it. Empty for the bootstrap: everybody loads it. */
    screens: string[];
}

/** Extra chunks grouped by the screen they belong to: the shape the guard signal needs. */
export interface EagerScreen {
    label: string;
    source: string;
    /** How much of that screen came down without being asked for. */
    bytes: number;
}

export interface MeasuredReport {
    /** The screen the measurement is attributed to. `null` when only the bootstrap came down. */
    screen: ScreenCost | null;
    /** Whether the screen was picked by the person or worked out from the chunks. */
    picked: boolean;
    /** Downloaded and predicted for that screen. */
    matched: MeasuredChunk[];
    /** Downloaded and NOT predicted: the reason for measuring. */
    extra: MeasuredChunk[];
    /** Predicted and not downloaded: usually the screen was never reached. */
    missing: MeasuredChunk[];
    /** Chunks of other screens that came down anyway. The router-before-guard case. */
    eager: EagerScreen[];
    /** JavaScript the browser downloaded that is not part of this build. */
    foreign: string[];
    /** Files that are neither JavaScript nor part of the build: CSS, fonts, images. */
    otherFiles: number;
    /** What the computation says the screen costs, in the report's unit. */
    computed: number;
    /** The same, for the chunks that actually came down. */
    measured: number;
    /** Sum of what the browser reported over the wire. `null` when it reported nothing. */
    transferred: number | null;
    /** Files counted on each side: the pair that makes the difference obvious. */
    computedFiles: number;
    measuredFiles: number;
}
