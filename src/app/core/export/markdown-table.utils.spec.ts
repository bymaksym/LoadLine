import { describe, expect, it } from 'vitest';
import { type Analysis } from '../analysis/analysis.types';
import { type Comparison } from '../baseline/baseline.types';
import { EN } from '../i18n/en';
import { markdownTable } from './markdown-table.utils';

const analysis = {
    bootBytes: 180_000,
    screens: [
        { source: 'src/app/a.page.ts', label: 'a', total: 200_000, shared: 10_000, own: 10_000, boot: 180_000 },
        { source: 'src/app/b.page.ts', label: 'b', total: 190_000, shared: 5000, own: 5000, boot: 180_000 },
    ],
} as unknown as Analysis;

const comparison = {
    baselineName: 'before.json',
    screens: new Map([
        ['src/app/a.page.ts', { total: { before: 190_000, after: 200_000, diff: 10_000, ratio: 0.05 } }],
    ]),
} as unknown as Comparison;

describe('markdownTable', () => {
    it('carries the unit in the lead line, so the figures cannot be read as another one', () => {
        expect(markdownTable(analysis, null, EN, 'gzip-compressed')).toContain('gzip-compressed');
    });

    it('has one row per screen and no delta column without a baseline', () => {
        const table = markdownTable(analysis, null, EN, 'raw').split('\n');
        const rows = table.filter(line => line.startsWith('| a ') || line.startsWith('| b '));

        expect(rows).toHaveLength(2);
        expect(table[2]).not.toContain(EN.colDelta);
    });

    it('adds the delta column against a baseline, and says which screens are new', () => {
        const table = markdownTable(analysis, comparison, EN, 'raw');

        expect(table).toContain(`${EN.colDelta} before.json`);
        expect(table).toContain('+10 kB');
        // `b` is not in the baseline: it cannot show a difference, and pretending zero would lie.
        expect(table).toContain(EN.compareNew);
    });
});
