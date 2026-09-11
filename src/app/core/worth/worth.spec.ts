import { describe, expect, it } from 'vitest';
import { worthOfShared } from './worth';
import { type WorthInput } from './worth.types';

const KB = 1024;

const input = (over: Partial<WorthInput> = {}): WorthInput => ({
    bytes: 100 * KB,
    ratio: 1,
    groups: [{ label: 'primeng', bytes: 100 * KB, isPackage: true }],
    importersOf: () => 1,
    effectiveBoot: 1000 * KB,
    minBytes: 50 * KB,
    maxImporters: 3,
    dominantRatio: 0.5,
    ...over,
});

describe('worthOfShared', () => {
    it('prices the chunk by what a typical visit pays, not by its size', () => {
        const global = worthOfShared(input({ bytes: 58 * KB, ratio: 44 / 47 }));
        const rare = worthOfShared(input({ bytes: 58 * KB, ratio: 5 / 47 }));

        expect(global.typicalCost).toBe(Math.round(58 * KB * (44 / 47)));
        // Same size, a tenth of the cost: that is the effect of weighting by coverage.
        expect(rare.typicalCost * 8).toBeLessThan(global.typicalCost);
    });

    it('says what the typical visit would weigh without it', () => {
        const worth = worthOfShared(input({ bytes: 100 * KB, ratio: 1, effectiveBoot: 1000 * KB }));

        expect(worth.withoutIt).toBe(900 * KB);
        expect(worth.shareOfBoot).toBeCloseTo(0.1);
    });

    it('below the threshold nothing is worth doing, whatever it carries', () => {
        const worth = worthOfShared(input({ bytes: 20 * KB, ratio: 1 }));

        expect(worth.level).toBe('none');
        expect(worth.origin).toBe('small');
    });

    it('a chunk that is mostly your own code has somewhere to go', () => {
        const worth = worthOfShared(input({ groups: [{ label: 'shared/enums', bytes: 100 * KB, isPackage: false }] }));

        expect(worth.level).toBe('try');
        expect(worth.origin).toBe('ownCode');
        expect(worth.top).toEqual({ label: 'shared/enums', share: 1, isPackage: false });
        // Only packages have importers to count.
        expect(worth.importers).toBeNull();
    });

    it('a package few of your files import is a decision with an address', () => {
        const worth = worthOfShared(input({ importersOf: () => 2 }));

        expect(worth.level).toBe('try');
        expect(worth.origin).toBe('package');
        expect(worth.importers).toBe(2);
    });

    it('a package imported from all over is infrastructure, not a fix', () => {
        const worth = worthOfShared(input({ importersOf: () => 40 }));

        expect(worth.level).toBe('hard');
        expect(worth.origin).toBe('common');
    });

    it('with nothing dominating it, there is no single thing to point at', () => {
        const worth = worthOfShared(
            input({
                groups: [
                    { label: 'primeng', bytes: 40 * KB, isPackage: true },
                    { label: 'rxjs', bytes: 35 * KB, isPackage: true },
                    { label: 'shared/utils', bytes: 25 * KB, isPackage: false },
                ],
            }),
        );

        expect(worth.top).toBeNull();
        expect(worth.level).toBe('hard');
    });
});
