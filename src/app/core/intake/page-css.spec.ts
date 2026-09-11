/**
 * The half of the first load this tool never counted.
 *
 * A `<link rel="stylesheet">` in the head is render-blocking: the browser will not paint until it
 * has arrived, which is a stronger claim than the one made about any script. Loadline's own build
 * reported a bootstrap of 156 kB while its page asked for a 69 kB stylesheet in the same breath —
 * the headline understated by 31 %, under a sentence that read "index.html announces the only
 * bootstrap chunk".
 */

import { describe, expect, it } from 'vitest';
import { pageCssOf } from './dist-files';
import { stylesIn } from './index-html';

const PAGE = `<!doctype html>
<html><head>
  <link rel="stylesheet" href="styles-ABC.css" media="print" onload="this.media='all'">
  <link rel="stylesheet" href="styles-ABC.css">
  <link rel="stylesheet" href="print-only-DEF.css" media="print">
  <link rel="preload" href="critical-GHI.css" as="style">
  <link rel="icon" href="favicon.ico">
  <script src="main-XYZ.js" type="module"></script>
</head><body></body></html>`;

describe('stylesIn', () => {
    it('names the stylesheets that block the paint, once each', () => {
        expect(stylesIn(PAGE)).toEqual(['styles-ABC.css', 'critical-GHI.css']);
    });

    /**
     * `media="print"` is the trick for loading a stylesheet without blocking the paint. Counting it
     * would charge somebody for the very thing worth doing — and Angular writes the same file twice,
     * once with the trick and once without, which is why the result is a set.
     */
    it('leaves out a print-only sheet, and is not fooled by the same file written twice', () => {
        expect(stylesIn(PAGE)).not.toContain('print-only-DEF.css');
        expect(stylesIn(PAGE).filter(name => name === 'styles-ABC.css')).toHaveLength(1);
    });

    it('says nothing about a page with no stylesheet', () => {
        expect(stylesIn('<html><head><script src="main.js"></script></head></html>')).toEqual([]);
    });
});

describe('pageCssOf', () => {
    const sizes = {
        raw: new Map([
            ['styles-ABC.css', 101_226],
            ['critical-GHI.css', 2000],
        ]),
        gzip: new Map([
            ['styles-ABC.css', 71_072],
            ['critical-GHI.css', 800],
        ]),
        brotli: new Map([['styles-ABC.css', 60_000]]),
    };

    it('totals the sheets in each unit the report can be shown in', () => {
        const css = pageCssOf(stylesIn(PAGE), sizes);

        expect(css?.files).toEqual(['styles-ABC.css', 'critical-GHI.css']);
        expect(css?.raw).toBe(103_226);
        expect(css?.gzip).toBe(71_872);
    });

    /** Half a brotli total is not a brotli total: one file missing and the figure is not offered. */
    it('offers brotli only when every sheet has one', () => {
        expect(pageCssOf(stylesIn(PAGE), sizes)?.brotli).toBeNull();
        expect(pageCssOf(['styles-ABC.css'], sizes)?.brotli).toBe(60_000);
    });

    /**
     * A page left over from another build names files this folder does not hold. Counting those as
     * zero would add a stylesheet of no bytes to the first load and say nothing about it.
     */
    it('drops a name the folder does not hold, rather than counting it as nothing', () => {
        expect(pageCssOf(['gone.css'], sizes)).toBeNull();
        expect(pageCssOf(['gone.css', 'styles-ABC.css'], sizes)?.files).toEqual(['styles-ABC.css']);
    });
});
