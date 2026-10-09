/**
 * The first load as a badge: an SVG for a README or a pull request, the one piece of the report
 * people see without running the tool.
 *
 * It copies the look of shields.io's "flat" style on purpose. A README already holds a row of those,
 * and a badge that looks like none of its neighbours reads as an advert rather than a figure. It is
 * drawn here rather than fetched from shields because the command fetches nothing, and a badge that
 * depends on somebody else's server goes grey the day that server is down.
 */

import { rate } from '../../src/app/core/criteria/criteria';
import { type Verdict } from '../../src/app/core/criteria/criteria.types';
import { formatBytes } from '../../src/app/core/format/format.utils';
import { type Lang } from '../../src/app/core/i18n/ui-strings';
import { type CliReport } from '../report.types';

/**
 * The label, in the two languages of `--lang`. Here rather than in `text.ts` with the rest of the
 * command's words: the badge is the only thing that says it, and two words do not earn an entry
 * in a table every other format reads.
 */
const LABEL: Record<Lang, string> = { en: 'first load', es: 'primera carga' };

/**
 * The colour of the value, by the same verdict the text report paints the bootstrap with. Each one
 * holds white text at 4.5:1 or more (WCAG AA): shields' own amber does not, and a badge is read at
 * eleven pixels, which is exactly where low contrast stops being legible.
 */
export const BADGE_COLOR: Record<Verdict, string> = {
    good: '#2e7d32',
    ok: '#9a6700',
    bad: '#c62828',
};

const LABEL_COLOR = '#555';
const HEIGHT = 20;
/** Space on each side of a text, as shields leaves it. */
const PADDING = 6;
const FONT = 'Verdana,Geneva,DejaVu Sans,sans-serif';

/**
 * Widths of Verdana at 11px, by groups of characters. There is no font to measure in a terminal,
 * and a lookup that is roughly right and always the same is better here than one that is exact on
 * one machine: the text is also told its length (`textLength`), so a guess a pixel off squeezes or
 * spreads the letters a little instead of running past the edge.
 */
const NARROW = new Set("ijl.,:;|!'");
const SLIM = new Set(' frtI()[]-/');
const WIDE = new Set('mwMW%');
const DIGIT_WIDTH = 7;
const UPPER_WIDTH = 7.5;
const LOWER_WIDTH = 6.5;

const charWidth = (char: string): number => {
    if (NARROW.has(char)) {
        return 3;
    }
    if (SLIM.has(char)) {
        return 4;
    }
    if (WIDE.has(char)) {
        return 10;
    }
    if (/\d/.test(char)) {
        return DIGIT_WIDTH;
    }
    return char === char.toLowerCase() ? LOWER_WIDTH : UPPER_WIDTH;
};

/** The estimated width of a text at 11px, whole pixels. Exported for the test. */
export const textWidth = (text: string): number => {
    // By code point, which is what a glyph roughly is for the labels and figures this ever draws.
    let width = 0;
    for (const char of text) {
        width += charWidth(char);
    }
    return Math.ceil(width);
};

// The quotes by number: every XML parser knows those, and they read the same in an attribute either
// way it is quoted.
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;' };

/** Text and attribute values both go through this: a name with `&` in it is not XML. */
export const escapeXml = (text: string): string => text.replaceAll(/[&<>"']/g, char => ESCAPES[char] ?? char);

/**
 * The change against the baseline, as the badge shows it and as it is read out. The arrow is for
 * the eye; a screen reader says "down-pointing triangle" for it, so the accessible name gets the
 * signed figure instead.
 */
const changeOf = (report: CliReport): { shown: string; spoken: string } | null => {
    const boot = report.comparison?.boot;
    // Nothing before means no ratio: "+100 %" of nothing would be a number nobody can use.
    if (!boot || boot.before === 0) {
        return null;
    }
    if (boot.diff === 0) {
        return { shown: '±0 %', spoken: '±0 %' };
    }

    const percent = Math.round(Math.abs(boot.ratio) * 100);
    // A change that rounds to nothing still happened: "▲0 %" would read as a contradiction.
    const figure = percent === 0 ? '<1 %' : `${percent} %`;
    return boot.diff > 0
        ? { shown: `▲${figure}`, spoken: `+${figure}` }
        : { shown: `▼${figure}`, spoken: `−${figure}` };
};

/** One half of the badge's text: the shadow shields draws under it, then the text itself. */
const halfText = (text: string, centre: number, width: number): string => {
    const content = escapeXml(text);
    return (
        `<text aria-hidden="true" x="${centre}" y="15" fill="#010101" fill-opacity=".3" textLength="${width}">${content}</text>` +
        `<text x="${centre}" y="14" textLength="${width}">${content}</text>`
    );
};

/** The badge for `--format badge`, an SVG document with nothing outside it to load. */
export const renderBadge = (report: CliReport): string => {
    const { analysis, criteria } = report;
    const label = LABEL[report.lang];
    const change = changeOf(report);
    const size = formatBytes(analysis.bootBytes);
    const value = change ? `${size} ${change.shown}` : size;
    const spoken = `${label}: ${change ? `${size}, ${change.spoken}` : size}`;
    const color = BADGE_COLOR[rate(analysis.bootBytes, criteria.bootOk, criteria.bootBad)];

    const labelText = textWidth(label);
    const valueText = textWidth(value);
    const labelWidth = labelText + PADDING * 2;
    const valueWidth = valueText + PADDING * 2;
    const width = labelWidth + valueWidth;
    const name = escapeXml(spoken);

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" role="img" aria-label="${name}">`,
        `<title>${name}</title>`,
        '<linearGradient id="loadline-shine" x2="0" y2="100%">',
        '<stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/>',
        '</linearGradient>',
        `<clipPath id="loadline-round"><rect width="${width}" height="${HEIGHT}" rx="3" fill="#fff"/></clipPath>`,
        '<g clip-path="url(#loadline-round)">',
        `<rect width="${labelWidth}" height="${HEIGHT}" fill="${LABEL_COLOR}"/>`,
        `<rect x="${labelWidth}" width="${valueWidth}" height="${HEIGHT}" fill="${color}"/>`,
        `<rect width="${width}" height="${HEIGHT}" fill="url(#loadline-shine)"/>`,
        '</g>',
        `<g fill="#fff" text-anchor="middle" font-family="${FONT}" font-size="11">`,
        halfText(label, labelWidth / 2, labelText),
        halfText(value, labelWidth + valueWidth / 2, valueText),
        '</g>',
        '</svg>',
    ].join('\n');
};
