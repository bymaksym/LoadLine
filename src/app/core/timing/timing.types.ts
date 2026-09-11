/** The shapes of the one part of the report that is a model rather than a measurement. */

/** The three connections a figure is translated into. Keys, not copy: the names are translated. */
export type ProfileId = 'slow4g' | 'fast4g' | 'cable';

export interface NetworkProfile {
    id: ProfileId;
    /** Throughput in bytes per second, after protocol overhead. */
    bytesPerSecond: number;
    /**
     * What one round trip costs before a byte arrives, in milliseconds. It is the criterion of this
     * whole group: the same build in front of an audience on a slow network is a different build.
     */
    latencyMs: number;
}

/** What one figure of the report costs in time, on one profile. */
export interface Timing {
    profile: ProfileId;
    /** Time on the wire: the bytes divided by the throughput. */
    transferMs: number;
    /** Latency × round trips. The part no compression touches. */
    latencyMs: number;
    /**
     * Parsing and compiling the JavaScript. It goes by **raw** bytes, not compressed ones: what the
     * engine works on is the decompressed source, and quoting it against a gzip figure would make a
     * well-compressed bundle look cheap to run, which is exactly backwards.
     */
    scriptMs: number;
    /** The three added up. */
    totalMs: number;
}
