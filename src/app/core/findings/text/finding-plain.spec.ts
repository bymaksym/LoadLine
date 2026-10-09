import { describe, expect, it } from 'vitest';
import { plainText } from './finding-plain';

/**
 * What the terminal and the JSON payload get. It had no test of its own until a signal quoting an
 * HTML tag went through it: reading real builds caught `<link rel="modulepreload">` reaching a text field
 * looking like markup, which is the same failure as the one that shipped in a signal title once.
 */
describe('plainText', () => {
    it('drops the two tags the signals are written with', () => {
        expect(plainText('<strong>4 screens</strong> load <span class="mono">rxjs</span>')).toBe('4 screens load rxjs');
    });

    it('leaves anything else alone: a version range is not markup', () => {
        expect(plainText('typescript >=6.0 <6.1')).toBe('typescript >=6.0 <6.1');
    });

    /**
     * A signal that talks about a tag has to escape it — written raw it would be injected into the
     * page as a real element — and a reader of a CI log wants the tag, not the entity.
     */
    it('gives back the tag a signal quoted, rather than the escape it was written with', () => {
        expect(plainText('Add a <span class="mono">&lt;link rel=&quot;modulepreload&quot;&gt;</span>')).toBe(
            'Add a <link rel="modulepreload">',
        );
    });
});
