import { isMetafile } from './metafile.types';

describe('isMetafile', () => {
    it('takes a metafile with both halves', () => {
        expect(isMetafile({ inputs: {}, outputs: {} })).toBe(true);
    });

    // The analysis reads `inputs` in seven places without a fallback: a file without it has to be
    // refused here, where the message is "not a stats file", and not fail halfway through.
    it('refuses a file with outputs and no inputs', () => {
        expect(isMetafile({ outputs: {} })).toBe(false);
    });

    // `typeof null` is 'object', which is how `"outputs": null` used to pass.
    it('refuses null where an object is expected', () => {
        expect(isMetafile({ inputs: {}, outputs: null })).toBe(false);
        expect(isMetafile({ inputs: null, outputs: {} })).toBe(false);
    });

    it('refuses what is not an object at all', () => {
        expect(isMetafile(null)).toBe(false);
        expect(isMetafile('stats.json')).toBe(false);
        expect(isMetafile([])).toBe(false);
    });
});
