/**
 * Bytes translated into time.
 *
 * `+300 kB` means nothing on a MacBook with fibre, and time is the language a budget is asked for
 * in. Every figure here is arithmetic over what the report already knows: the bytes, the round
 * trips it already counts, and three connection profiles.
 *
 * **This is a model, not a measurement, and the difference is the point of this file.** Nothing
 * here was observed: no browser was opened, no request was timed. The tool has a tab for measured
 * figures and it says "measured" on it; everything produced here has to be labelled an estimate
 * wherever it is shown, and the numbers below are stated with their source so the estimate can be
 * argued with instead of believed.
 *
 * The profiles are the ones the web performance literature has settled on, and they are
 * deliberately the same ones Lighthouse and WebPageTest use, so a figure here can be put next to a
 * figure from those without converting anything:
 *
 * - **Slow 4G**: 1.6 Mbps down, 150 ms round trip. Lighthouse's mobile throttling.
 * - **4G**: 9 Mbps, 85 ms. A good mobile connection, not a perfect one.
 * - **Cable**: 30 Mbps, 28 ms. An office desk.
 *
 * The parse-and-compile figure is the roughest of the three and is worth saying so about: engines
 * differ, and the same script costs several times more on a low-end phone than on a laptop. The
 * coefficient used is one millisecond per kilobyte of **raw** JavaScript, which is the order of
 * magnitude V8 reports for a mid-range Android device. It is used for comparison between figures
 * of the same report far more than as an absolute.
 */

import { type NetworkProfile, type ProfileId, type Timing } from './timing.types';

const KB = 1024;
/** Bits per second to bytes per second, with the usual ~10 % of protocol overhead taken off. */
const throughput = (mbps: number): number => Math.round(((mbps * 1_000_000) / 8) * 0.9);

/** Milliseconds of parse and compile per kilobyte of raw JavaScript, on a mid-range phone. */
const MS_PER_RAW_KB = 1;

export const PROFILES: Record<ProfileId, NetworkProfile> = {
    slow4g: { id: 'slow4g', bytesPerSecond: throughput(1.6), latencyMs: 150 },
    fast4g: { id: 'fast4g', bytesPerSecond: throughput(9), latencyMs: 85 },
    cable: { id: 'cable', bytesPerSecond: throughput(30), latencyMs: 28 },
};

export const PROFILE_IDS: ProfileId[] = ['slow4g', 'fast4g', 'cable'];

/**
 * One figure of the report, in milliseconds.
 *
 * @param bytes    what travels, in the unit the report is in. Compressed when the folder was read,
 *                 which is the honest input for the transfer half.
 * @param rawBytes the same thing uncompressed, for the parse half. The two are the same number on
 *                 a raw report, and then the script figure is right anyway.
 * @param waves    round trips, as the report already counts them. Each one costs the latency once
 *                 before any of its bytes start arriving.
 * @param latency  the round-trip time of the **slow mobile** profile, from Criteria. The other two
 *                 scale with it, so that somebody whose users are on another continent moves all
 *                 three at once instead of flattening them into one number. `null` keeps the
 *                 profiles exactly as they are defined above.
 */
export const timingOf = (
    bytes: number,
    rawBytes: number,
    waves: number,
    profile: NetworkProfile,
    latency: number | null = null,
): Timing => {
    // Scaled, not replaced: the three profiles differ in latency as much as in throughput, and a
    // single figure applied to all of them would say a cable connection costs 150 ms per round trip.
    const scale = latency === null ? 1 : latency / PROFILES.slow4g.latencyMs;
    const latencyMs = profile.latencyMs * scale * Math.max(1, waves);
    const transferMs = (bytes / profile.bytesPerSecond) * 1000;
    const scriptMs = (rawBytes / KB) * MS_PER_RAW_KB;

    return {
        profile: profile.id,
        transferMs: Math.round(transferMs),
        latencyMs: Math.round(latencyMs),
        scriptMs: Math.round(scriptMs),
        totalMs: Math.round(transferMs + latencyMs + scriptMs),
    };
};

/** The same figure on all three profiles, which is how it is worth reading: as a range. */
export const timingsOf = (bytes: number, rawBytes: number, waves: number, latency: number | null = null): Timing[] =>
    PROFILE_IDS.map(id => timingOf(bytes, rawBytes, waves, PROFILES[id], latency));

/**
 * Milliseconds as they are read: `340 ms`, `1,20 s`. Seconds from one thousand up, because past
 * that nobody counts in milliseconds.
 */
export const formatMs = (ms: number, lang: 'es' | 'en' = 'en'): string => {
    if (ms < 1000) {
        return `${Math.round(ms)} ms`;
    }

    const seconds = ms / 1000;
    const digits = seconds >= 10 ? 1 : 2;
    return `${new Intl.NumberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(seconds)} s`;
};
