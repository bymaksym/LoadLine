import { describe, expect, it } from 'vitest';
import { announcedIn } from '../../src/app/core/build-text/index-html';
import { formatBytes } from '../../src/app/core/format/format.utils';
import { EMPTY_CONTEXT } from '../../src/app/core/project/project-context';
import { SAMPLE_NAME, SAMPLE_PAGE, SAMPLE_STATS } from '../../src/app/core/sample/sample-build';
import { parseArgs } from '../args';
import { type Options } from '../args.types';
import { type BuildInput } from '../read/read-build.types';
import { buildReport } from '../report';
import { type CliReport } from '../report.types';
import { BADGE_COLOR, escapeXml, renderBadge, textWidth } from './render-badge';

/** The sample build as `sample.spec.ts` reads it: a stats file and the page next to it. */
const INPUT: BuildInput = {
    meta: SAMPLE_STATS,
    parallel: null,
    routes: null,
    statsName: SAMPLE_NAME,
    gzip: null,
    brotli: null,
    splits: null,
    announced: new Set(announcedIn(SAMPLE_PAGE)),
    graph: null,
    pageCss: null,
    baseline: null,
    context: EMPTY_CONTEXT,
    criteria: null,
    config: null,
    configProblems: [],
    configName: null,
};

const options = (...flags: string[]): Options => {
    const parsed = parseArgs([SAMPLE_NAME, '--no-cache', ...flags]);
    if (!parsed.ok) {
        throw new Error(parsed.message);
    }
    return parsed.options;
};

const sample = (...flags: string[]): CliReport => buildReport(INPUT, options(...flags));

/**
 * The same build against a baseline whose bootstrap weighed `factor` times what it weighs now: the
 * comparison is the one the command would make, not one written by hand for the test.
 */
const against = (factor: number): CliReport => {
    const before = sample().snapshot;
    return buildReport({ ...INPUT, baseline: { ...before, boot: Math.round(before.boot * factor) } }, options());
};

describe('--format badge', () => {
    it('is a self-contained SVG with an accessible name', () => {
        const svg = renderBadge(sample());

        expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
        expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
        expect(svg).toMatch(/<title>first load: [^<]+<\/title>/);
        expect(svg).toContain('role="img"');
        expect(svg).toMatch(/aria-label="first load: [^"]+"/);
        // Nothing to fetch: a badge that loads a font or an image breaks the day that host is down.
        expect(svg).not.toMatch(/href=|@import|url\((?!#)/);
    });

    it('says the size of the first load', () => {
        const report = sample();
        expect(renderBadge(report)).toContain(`>${formatBytes(report.analysis.bootBytes)}</text>`);
    });

    it('says the label in the language of --lang', () => {
        expect(renderBadge(sample('--lang', 'es'))).toContain('>primera carga</text>');
    });

    it('shows the change against a baseline, up or down', () => {
        // Smaller before: the build grew.
        const grew = renderBadge(against(0.9));
        expect(grew).toMatch(/▲\d+ %<\/text>/);
        // The accessible name says it in signs, not in triangles a screen reader spells out.
        expect(grew).toMatch(/aria-label="first load: [^"]+, \+\d+ %"/);

        const shrank = renderBadge(against(1.1));
        expect(shrank).toMatch(/▼\d+ %<\/text>/);
        expect(shrank).toMatch(/aria-label="first load: [^"]+, −\d+ %"/);

        // Without a baseline there is no arrow to show.
        expect(renderBadge(sample())).not.toMatch(/[▲▼]/);
    });

    it('takes its colour from the verdict on the bootstrap', () => {
        const report = sample();
        const boot = report.analysis.bootBytes;
        const withLimits = (bootOk: number, bootBad: number): string =>
            renderBadge({ ...report, criteria: { ...report.criteria, bootOk, bootBad } });

        expect(withLimits(boot, boot * 2)).toContain(`fill="${BADGE_COLOR.good}"`);
        expect(withLimits(boot - 1, boot)).toContain(`fill="${BADGE_COLOR.ok}"`);
        expect(withLimits(boot - 2, boot - 1)).toContain(`fill="${BADGE_COLOR.bad}"`);
    });

    it('escapes what it writes, so a text with < or & is still XML', () => {
        // A change too small to round to a whole percent is written "<1 %": the one `<` the badge
        // really prints, and the reason the escaping is not optional.
        const svg = renderBadge(against(1.001));
        expect(svg).toContain('▼&lt;1 %</text>');
        expect(svg).not.toMatch(/<1 %/);

        expect(escapeXml('a<b & "c"')).toBe('a&lt;b &amp; &#34;c&#34;');
    });

    it('estimates wider texts as wider, the same every time', () => {
        expect(textWidth('mmmm')).toBeGreaterThan(textWidth('iiii'));
        expect(textWidth('first load')).toBe(textWidth('first load'));
    });
});
