import { describe, expect, it } from 'vitest';
import { type EntryTiming, type MeasuredEntry, type Measurement, NO_PAGE } from './measurement.types';
import { isStale, observedFrom, wavesOf } from './observed';

const timing = (start: number, responseEnd: number, extra: Partial<EntryTiming> = {}): EntryTiming => ({
    start,
    requestStart: start,
    responseStart: responseEnd - 1,
    responseEnd,
    connectStart: 0,
    connectEnd: 0,
    ...extra,
});

const entry = (file: string, rest: Partial<MeasuredEntry> = {}): MeasuredEntry => ({
    file,
    bytes: rest.transferSize ?? null,
    url: `https://app.example/${file}`,
    protocol: 'h2',
    transferSize: null,
    encodedBodySize: null,
    decodedBodySize: null,
    timing: null,
    ...rest,
});

const paste = (entries: MeasuredEntry[], page = NO_PAGE): Measurement => ({
    url: 'https://app.example/',
    entries,
    source: 'json',
    page: { ...page, origin: page.origin ?? 'https://app.example' },
});

describe('wavesOf · the trips the browser really took', () => {
    it('groups requests that were in flight together into one trip', () => {
        const waves = wavesOf([
            entry('a.js', { timing: timing(0, 100) }),
            entry('b.js', { timing: timing(2, 110) }),
            entry('c.js', { timing: timing(105, 200) }),
        ]);

        expect(waves.map(wave => wave.files)).toEqual([['a.js', 'b.js'], ['c.js']]);
    });

    it('keeps a request that started while the batch was still in flight in that batch', () => {
        const waves = wavesOf([
            entry('a.js', { timing: timing(0, 300) }),
            entry('b.js', { timing: timing(1, 100) }),
            // Started at 50, while both of the above were still on the wire: nothing had come back
            // that could have revealed it, so it is the same batch however late it was asked for.
            entry('c.js', { timing: timing(50, 320) }),
        ]);

        expect(waves).toHaveLength(1);
        expect(waves[0]?.files).toEqual(['a.js', 'b.js', 'c.js']);
    });

    it('splits when the pool runs out, which is what makes the batch count differ from the graph', () => {
        // Six at a time under HTTP/1.1: the seventh starts when the first finishes. That is a
        // second batch and not a second level of discovery, and the report has to say which.
        const waves = wavesOf([
            entry('a.js', { timing: timing(0, 100) }),
            entry('b.js', { timing: timing(0, 400) }),
            entry('c.js', { timing: timing(120, 500) }),
        ]);

        expect(waves.map(wave => wave.files)).toEqual([['a.js', 'b.js'], ['c.js']]);
    });

    it('says nothing when the paste carried no timings', () => {
        expect(wavesOf([entry('a.js')])).toEqual([]);
    });
});

describe('observedFrom · what is served, not what was built', () => {
    const build = new Set(['main.js', 'vendor.js']);

    it('names a file whose encoded body is its decoded body: nothing compressed it', () => {
        const observed = observedFrom(
            paste([
                entry('main.js', { encodedBodySize: 120_000, decodedBodySize: 121_000 }),
                entry('vendor.js', { encodedBodySize: 40_000, decodedBodySize: 130_000 }),
            ]),
            build,
        );

        expect(observed.compression.uncompressed).toEqual(['main.js']);
        expect(observed.compression.uncompressedBytes).toBe(121_000);
        expect(observed.compression.ratio).toBeCloseTo(251_000 / 160_000, 5);
    });

    it('tells a cache hit from a revalidation from a download', () => {
        const observed = observedFrom(
            paste([
                entry('main.js', { transferSize: 0, encodedBodySize: 40_000 }),
                entry('vendor.js', { transferSize: 250, encodedBodySize: 90_000 }),
            ]),
            build,
        );

        expect(observed.cache).toEqual({ fromCache: 1, revalidated: 1, network: 0 });
    });

    it('measures the round trip instead of asking for it, and leaves cache hits out of it', () => {
        const observed = observedFrom(
            paste([
                entry('main.js', {
                    transferSize: 40_000,
                    timing: { ...timing(0, 200), requestStart: 10, responseStart: 60 },
                }),
                entry('vendor.js', { transferSize: 0, encodedBodySize: 10, timing: timing(0, 200) }),
            ]),
            build,
        );

        expect(observed.rttMs).toBe(50);
    });

    it('counts a connection opened of its own: the pool running out, observed', () => {
        const observed = observedFrom(
            paste([
                entry('main.js', { timing: timing(0, 100, { connectStart: 5, connectEnd: 40 }) }),
                entry('vendor.js', { timing: timing(0, 100) }),
            ]),
            build,
        );

        expect(observed.connections).toEqual({ opened: 1, lastAt: 5 });
    });

    it('counts requests to other hosts, and every request as the denominator', () => {
        const observed = observedFrom(
            paste([
                entry('main.js'),
                entry('tag.js', { url: 'https://analytics.example/tag.js' }),
                entry('pixel.js', { url: 'https://analytics.example/pixel.js' }),
            ]),
            build,
        );

        expect(observed.thirdParty).toEqual({
            requests: 2,
            origins: ['https://analytics.example'],
            total: 3,
        });
    });

    it('reports the protocol the build agreed on, and every one it saw', () => {
        const observed = observedFrom(
            paste([entry('main.js', { protocol: 'h2' }), entry('vendor.js', { protocol: 'http/1.1' })]),
            build,
        );

        expect(observed.protocol.counted).toBe(2);
        expect(observed.protocol.seen).toEqual(['h2', 'http/1.1']);
    });
});

describe('isStale · a channel measured once has a shelf life', () => {
    it('goes stale a month after it was taken', () => {
        expect(isStale('2026-01-01T10:00:00.000Z', '2026-03-01')).toBe(true);
        expect(isStale('2026-01-01T10:00:00.000Z', '2026-01-10')).toBe(false);
    });

    it('says nothing about a paste that carried no date: unknown is not stale', () => {
        expect(isStale(null, '2026-03-01')).toBe(false);
    });
});
