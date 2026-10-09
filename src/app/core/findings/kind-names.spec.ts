import { describe, expect, it } from 'vitest';
import { compare } from '../baseline/baseline';
import { type Snapshot, type SnapshotFinding } from '../baseline/baseline.types';
import { RECOMMENDED } from '../criteria/criteria';
import { buildComparisonFindings } from './findings';

const KB = 1024;

const snapshot = (findings: SnapshotFinding[]): Snapshot => ({
    tool: 'loadline',
    version: 1,
    name: 'x.json',
    date: '2026-09-01',
    mode: 'raw',
    boot: 500 * KB,
    bootPackages: [],
    screens: [{ source: 'src/a.page.ts', label: 'a', total: 700 * KB, shared: 200 * KB, own: 0 }],
    findings,
});

describe('signals that came and went', () => {
    /** "No longer raised: `cycles`" named the code that raised it, not the problem that went away. */
    it('are named by what they are, in the language asked for', () => {
        const before = snapshot([{ kind: 'cycles', key: '', severity: 'mid' }]);
        const now = snapshot([{ kind: 'dupes', key: 'lodash', severity: 'mid' }]);

        const [en] = buildComparisonFindings(compare(now, before), 'en', RECOMMENDED.raw);
        const [es] = buildComparisonFindings(compare(now, before), 'es', RECOMMENDED.raw);

        expect(en?.body).toContain('No longer raised: import cycles.');
        expect(en?.body).toContain('New: duplicate copies of a package (<span class="mono">lodash</span>).');
        expect(es?.body).toContain('Ya no salen: ciclos de importación.');
        expect(es?.body).not.toContain('cycles');
    });
});
