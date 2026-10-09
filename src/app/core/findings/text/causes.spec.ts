import { describe, expect, it } from 'vitest';
import { compare } from '../../baseline/baseline';
import { type Snapshot, type SnapshotPart } from '../../baseline/baseline.types';
import { RECOMMENDED } from '../../criteria/criteria';
import { buildComparisonFindings } from '../findings';

const KB = 1024;

/**
 * Five screens of 200 kB beyond the bootstrap, `b` at `bBytes`. Gzip, and `b`'s chunks weigh four
 * times raw what the report shows: the ratio its causes are printed at, hence the ≈.
 */
const snapshot = (bBytes: number, parts: SnapshotPart[]): Snapshot => ({
    tool: 'loadline',
    version: 1,
    name: 'x.json',
    date: '2026-09-01',
    mode: 'gzip',
    boot: 500 * KB,
    bootPackages: [],
    screens: ['a', 'b', 'c', 'd', 'e'].map(name => {
        const lazy = name === 'b' ? bBytes : 200 * KB;
        return {
            source: `src/${name}.page.ts`,
            label: name,
            total: 500 * KB + lazy,
            shared: lazy,
            own: 0,
            ...(name === 'b' && { lazyRaw: lazy * 4, lazyParts: parts }),
        };
    }),
});

describe('what a screen that grew is made of', () => {
    const before = snapshot(200 * KB, [{ name: 'b/page', bytes: 800 * KB, own: true }]);
    const now = snapshot(300 * KB, [
        { name: 'xlsx', bytes: 392 * KB, own: false },
        { name: 'b/page', bytes: 808 * KB, own: true },
    ]);

    it('names the packages and own folders that grew, in the report unit, in both languages', () => {
        const [en] = buildComparisonFindings(compare(now, before), 'en', RECOMMENDED.gzip);
        expect(en?.kind).toBe('screensGrew');
        expect(en?.body).toContain(
            '— <span class="mono">xlsx</span> ≈+98 kB (new), <span class="mono">b/page</span> ≈+2 kB (your code)',
        );
        expect(en?.body).toContain('hence the ≈');

        const [es] = buildComparisonFindings(compare(now, before), 'es', RECOMMENDED.gzip);
        expect(es?.body).toContain(
            '<span class="mono">xlsx</span> ≈+98 kB (nuevo), <span class="mono">b/page</span> ≈+2 kB (tu código)',
        );
    });

    it('claims no cause against a baseline that never broke the screen down', () => {
        const older = snapshot(200 * KB, []);
        const screens = older.screens.map(({ lazyParts: _parts, lazyRaw: _raw, ...screen }) => screen);
        const [en] = buildComparisonFindings(compare(now, { ...older, screens }), 'en', RECOMMENDED.gzip);

        expect(en?.kind).toBe('screensGrew');
        expect(en?.body).not.toContain('where it comes from');
        expect(en?.body).not.toContain('xlsx');
    });
});
