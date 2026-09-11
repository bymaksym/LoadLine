import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analysis';
import { announcedIn } from '../intake/index-html';
import { SAMPLE_PAGE, SAMPLE_STATS } from '../sample/sample-build';
import { anonymise, diagnosticsOf } from './diagnostics';

const announced = new Set(announcedIn(SAMPLE_PAGE));

const report = (): string =>
    diagnosticsOf({
        meta: SAMPLE_STATS,
        analysis: analyze(SAMPLE_STATS, null, null, announced),
        error: null,
        derived: false,
        announced,
        mode: 'raw',
        mapFiles: null,
    });

describe('the diagnostics report', () => {
    /**
     * The one property that decides whether this is usable at all. If a path of somebody's project
     * can appear in it, nobody can paste it into a public issue, and then it does not exist.
     */
    it('names no file of the project it is about', () => {
        const text = report();

        expect(text).not.toContain('src/app');
        expect(text).not.toContain('.page.ts');
        expect(text).not.toContain('countries');
    });

    it('keeps the package names, which are public and are usually the answer', () => {
        const text = report();

        expect(text).toContain('@angular/core');
        expect(text).toContain('date-fns');
        expect(text).toContain('xlsx');
    });

    it('says how every lazy entry was classified, which is where a wrong answer shows', () => {
        const text = report();

        expect(text).toContain('screens:          8');
        expect(text).toContain('deferred blocks:  1');
        expect(text).toContain('route groupers:   1');
        // One line per entry, so a missing row is visible rather than a count that does not add up.
        expect(text.split('\n').filter(line => line.trim().startsWith('screen '))).toHaveLength(8);
    });

    /** Two lines about the same file have to be visibly about the same file. */
    it('gives one path the same name every time, and different paths different ones', () => {
        expect(anonymise('src/app/a.ts')).toBe(anonymise('src/app/a.ts'));
        expect(anonymise('src/app/a.ts')).not.toBe(anonymise('src/app/b.ts'));
    });

    /**
     * The case this exists for is the one where there is no report to look at. Saying "nothing
     * loaded" and the message is more use than saying nothing.
     */
    it('still says something when the analysis produced nothing', () => {
        const text = diagnosticsOf({
            meta: SAMPLE_STATS,
            analysis: null,
            error: 'NO_ENTRIES',
            derived: true,
            announced: null,
            mode: 'raw',
            mapFiles: null,
        });

        expect(text).toContain('NO_ENTRIES');
        expect(text).toContain('index.html:       not loaded');
    });
});
