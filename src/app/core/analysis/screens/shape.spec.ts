import { describe, expect, it } from 'vitest';
import { granularityOf, shapeOf } from './shape';

const KB = 1024;

/** The two thresholds the reading needs, written out so the numbers below say what they mean. */
const LIMITS = { crumbMaxBytes: 5 * KB, heavyShareRatio: 0.8 };

describe('shapeOf', () => {
    it('splits the build by who pays for each chunk, in reading order', () => {
        const shape = shapeOf(
            [
                { zone: 'own', bytes: 10 * KB },
                { zone: 'boot', bytes: 100 * KB },
                { zone: 'shared', bytes: 50 * KB },
            ],
            LIMITS,
        );

        expect(shape.map(z => z.zone)).toEqual(['boot', 'shared', 'own']);
        expect(shape[0]).toMatchObject({ bytes: 100 * KB, files: 1 });
    });

    it('an empty zone is left out instead of shown as zero', () => {
        expect(shapeOf([{ zone: 'boot', bytes: 10 * KB }], LIMITS).map(z => z.zone)).toEqual(['boot']);
    });

    it('says how much of a zone sits in its largest chunk', () => {
        // The real case: one chunk of 822 kB and fourteen crumbs around it.
        const shape = shapeOf(
            [
                { zone: 'shared', bytes: 822 * KB },
                ...Array.from({ length: 14 }, () => ({ zone: 'shared' as const, bytes: 2 * KB })),
            ],
            LIMITS,
        );

        expect(shape[0]?.concentration).toBeCloseTo(0.967, 2);
        expect(shape[0]?.files).toBe(15);
    });

    it('an even split concentrates on nothing', () => {
        const shape = shapeOf(
            Array.from({ length: 4 }, () => ({ zone: 'boot' as const, bytes: 25 * KB })),
            LIMITS,
        );

        expect(shape[0]?.concentration).toBeCloseTo(0.25, 2);
    });

    it('counts the crumbs and what they add up to', () => {
        const shape = shapeOf(
            [
                { zone: 'boot', bytes: 100 * KB },
                { zone: 'boot', bytes: 900 },
                { zone: 'boot', bytes: 300 },
                { zone: 'boot', bytes: 6 * KB },
            ],
            LIMITS,
        );

        // 6 kB is not a crumb: the line is at five.
        expect(shape[0]?.crumbs).toBe(2);
        expect(shape[0]?.crumbBytes).toBe(1200);
    });
});

describe('granularityOf', () => {
    it('says how few files carry most of a download', () => {
        const result = granularityOf([100 * KB, 80 * KB, 60 * KB, 2 * KB, 1 * KB, 500], LIMITS);

        expect(result.files).toBe(6);
        expect(result.heavy).toBe(3);
        expect(result.heavyShare).toBeGreaterThan(0.8);
        expect(result.crumbs).toBe(3);
    });

    it('an even download has no few files carrying it', () => {
        const result = granularityOf(
            Array.from({ length: 10 }, () => 10 * KB),
            LIMITS,
        );

        expect(result.heavy).toBe(8);
    });

    it('nothing downloaded is not a division by zero', () => {
        expect(granularityOf([], LIMITS)).toEqual({ files: 0, heavy: 0, heavyShare: 0, crumbs: 0, crumbBytes: 0 });
    });
});
