import { describe, expect, it } from 'vitest';
import { formatMs, PROFILES, timingOf, timingsOf } from './timing';

const KB = 1024;

describe('timingOf · bytes as an estimate of time', () => {
    it('charges the latency once per round trip', () => {
        const one = timingOf(0, 0, 1, PROFILES.slow4g);
        const three = timingOf(0, 0, 3, PROFILES.slow4g);

        expect(one.latencyMs).toBe(150);
        expect(three.latencyMs).toBe(450);
    });

    it('counts a round trip even when the report says none', () => {
        // A first load is at least one request. Zero would say the bytes arrive before being asked for.
        expect(timingOf(0, 0, 0, PROFILES.cable).latencyMs).toBe(28);
    });

    it('measures transfer on what travels and parsing on what the engine reads', () => {
        // 300 kB compressed, 900 kB raw: the two halves are deliberately not the same figure.
        const timing = timingOf(300 * KB, 900 * KB, 1, PROFILES.slow4g);

        expect(timing.transferMs).toBe(Math.round(((300 * KB) / PROFILES.slow4g.bytesPerSecond) * 1000));
        expect(timing.scriptMs).toBe(900);
        expect(timing.totalMs).toBe(timing.transferMs + timing.latencyMs + timing.scriptMs);
    });

    it('scales the three profiles with the criterion instead of flattening them', () => {
        const [slow, fast, cable] = timingsOf(0, 0, 1, 300);

        // Twice the slow-mobile default: every profile doubles, and they stay different from
        // each other, which one shared number would not.
        expect(slow?.latencyMs).toBe(300);
        expect(fast?.latencyMs).toBe(170);
        expect(cable?.latencyMs).toBe(56);
    });
});

describe('formatMs', () => {
    it('stays in milliseconds below a second and switches to seconds above it', () => {
        expect(formatMs(340)).toBe('340 ms');
        expect(formatMs(1200)).toBe('1.20 s');
        expect(formatMs(12_345)).toBe('12.3 s');
    });
});
