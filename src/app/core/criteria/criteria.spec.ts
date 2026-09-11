import { describe, expect, it } from 'vitest';
import { CRITERIA_FIELDS, fromField, rate, RECOMMENDED, toField, worst } from './criteria';

const KB = 1024;

describe('criteria', () => {
    it('rates a figure against its two thresholds, the threshold itself being inside the good band', () => {
        expect(rate(170 * KB, 170 * KB, 350 * KB)).toBe('good');
        expect(rate(171 * KB, 170 * KB, 350 * KB)).toBe('ok');
        expect(rate(350 * KB, 170 * KB, 350 * KB)).toBe('ok');
        expect(rate(351 * KB, 170 * KB, 350 * KB)).toBe('bad');
    });

    it('the worst verdict wins when summarising', () => {
        expect(worst(['good', 'ok'])).toBe('ok');
        expect(worst(['good', 'bad', 'ok'])).toBe('bad');
        expect(worst([])).toBe('good');
    });

    it('raw recommended values are the Angular CLI default budgets', () => {
        expect(RECOMMENDED.raw.bootOk).toBe(500 * KB);
        expect(RECOMMENDED.raw.bootBad).toBe(1024 * KB);
    });

    it('the signal thresholds that are proportions do not depend on the mode', () => {
        for (const key of ['sharedRatio', 'wideRatio', 'bootPackageMaxImporters', 'heavyScreenFactor'] as const) {
            expect(RECOMMENDED.raw[key]).toBe(RECOMMENDED.gzip[key]);
            expect(RECOMMENDED.brotli[key]).toBe(RECOMMENDED.gzip[key]);
        }
    });

    it('the sizes of a whole chunk scale with the unit, or they mean different things', () => {
        // A 50 kB minimum applied to gzip figures is three times stricter than the same rule
        // applied to raw ones, and the report ends up saying nothing is worth touching.
        for (const key of ['sharedMinBytes', 'heavyScreenMinBytes', 'growthMinBytes'] as const) {
            expect(RECOMMENDED.gzip[key]).toBeLessThan(RECOMMENDED.raw[key]);
            expect(RECOMMENDED.gzip[key] / RECOMMENDED.raw[key]).toBeCloseTo(1 / 3, 1);
            expect(RECOMMENDED.brotli[key]).toBeLessThanOrEqual(RECOMMENDED.gzip[key]);
        }
    });

    it('the sizes measured inside a chunk do not, because the figure they judge never moves', () => {
        // `bytesInOutput` is raw minified bytes in every mode: gzip compresses the whole chunk, so
        // one module has no compressed size. Scaling these with the unit made the same build raise
        // the bootstrap-package signal about three times more often once the folder was dropped.
        for (const key of [
            'bootPackageMinBytes',
            'ownFolderMinBytes',
            'bigOwnFileBytes',
            'shippedMinBytes',
            'grouperMaxBytes',
        ] as const) {
            expect(RECOMMENDED.gzip[key]).toBe(RECOMMENDED.raw[key]);
            expect(RECOMMENDED.brotli[key]).toBe(RECOMMENDED.raw[key]);
        }
    });

    it('the ones that price a request are thought of in what travels, so raw is the higher one', () => {
        // Below them, asking for a file costs about what the file holds. What travels is the
        // compressed file, so the raw column is that same line expressed in uncompressed bytes.
        for (const key of ['crumbMaxBytes', 'tinyChunkBytes'] as const) {
            expect(RECOMMENDED.raw[key]).toBeGreaterThan(RECOMMENDED.gzip[key]);
            expect(RECOMMENDED.brotli[key]).toBe(RECOMMENDED.gzip[key]);
        }
    });

    it('brotli thresholds sit below the gzip ones, since the figures do too', () => {
        // Otherwise switching to brotli would turn everything green for a reason that is not the app.
        for (const key of ['bootOk', 'bootBad', 'screenOk', 'screenBad', 'ownOk', 'ownBad'] as const) {
            expect(RECOMMENDED.brotli[key]).toBeLessThan(RECOMMENDED.gzip[key]);
            expect(RECOMMENDED.brotli[key] / RECOMMENDED.gzip[key]).toBeCloseTo(0.85, 1);
        }
    });

    it('converts between the internal value and the field value without loss', () => {
        expect(toField(170 * KB, 'kb')).toBe(170);
        expect(fromField(170, 'kb')).toBe(170 * KB);
        expect(toField(0.6, 'pct')).toBe(60);
        expect(fromField(60, 'pct')).toBeCloseTo(0.6);
    });

    it('every editable criterion exists in the recommended set', () => {
        for (const field of CRITERIA_FIELDS) {
            expect(RECOMMENDED.gzip).toHaveProperty(field.key);
            if (field.pairWith) {
                expect(RECOMMENDED.gzip).toHaveProperty(field.pairWith);
            }
        }
    });

    /**
     * Where each number comes from, said out loud.
     *
     * The point of these two is to keep the labels honest in the direction they are easy to
     * get wrong. Only two thresholds have a source anybody can go and read; naming a third as
     * `external` because a sentence somewhere sounds authoritative is exactly the invented
     * justification the label exists to prevent.
     */
    it('claims an outside source for the two thresholds that actually have one', () => {
        const external = CRITERIA_FIELDS.filter(field => field.from === 'external').map(field => field.key);

        // Angular CLI's default budgets, and Lighthouse's mobile throttling profile.
        expect(external).toEqual(['bootOk', 'latencyMs']);
    });

    it('calls a convention a convention', () => {
        const from = new Map(CRITERIA_FIELDS.map(field => [field.key, field.from]));

        for (const key of [
            'screenFilesMax',
            'screenWavesMax',
            'tinyChunkBytes',
            'minTinyChunks',
            'crumbMaxBytes',
            'manyCrumbs',
        ] as const) {
            expect(from.get(key)).toBe('convention');
        }
    });
});
