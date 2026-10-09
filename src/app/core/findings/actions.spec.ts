import { describe, expect, it } from 'vitest';
import { type Analysis } from '../analysis/analysis.types';
import { type GraphInsights } from '../analysis/graph/insights.types';
import { formatSaving, rankActions, remainingInUnit, savingInUnit, totalSaving, unitScale } from './actions';
import { type Finding, type FindingKind } from './finding.types';

const KB = 1024;

const finding = (kind: FindingKind, saving?: number, sources?: string[]): Finding => ({
    kind,
    severity: 'mid',
    chip: '',
    title: kind,
    body: '',
    fix: '',
    saving,
    sources,
});

/** An analysis whose only job is to answer "what would go without these files". */
const analysisWith = (exclusiveOf: (files: Iterable<string>) => number, bootTotal: number): Analysis =>
    ({ insights: () => ({ exclusiveOf, bootTotal }) as GraphInsights }) as Analysis;

describe('rankActions · what to fix first', () => {
    it('puts a cheap fix ahead of a bigger one that costs a refactor', () => {
        // Sorted by bytes alone, the 400 kB refactor leads and nobody does it. It is exactly the
        // ordering this ranking exists to correct.
        const ranked = rankActions([
            finding('shared', 400 * KB), // refactor
            finding('dupes', 90 * KB), // one line of configuration
        ]);

        expect(ranked.map(action => action.finding.kind)).toEqual(['dupes', 'shared']);
    });

    it('leaves out what there is nothing to do about', () => {
        const ranked = rankActions([finding('bootGrew', 50 * KB), finding('clean'), finding('zoneless')]);

        expect(ranked).toEqual([]);
    });
});

describe('totalSaving · what doing all of it is worth', () => {
    it('walks the graph once with every named file taken out, rather than adding the savings up', () => {
        const seen: string[][] = [];
        const analysis = analysisWith(files => {
            seen.push([...files]);
            // The same 30 kB reached two ways: two signals of 30 kB are worth 30, not 60.
            return 30 * KB;
        }, 200 * KB);

        const total = totalSaving(analysis, [
            finding('bootLazy', 30 * KB, ['a.ts', 'b.ts']),
            finding('ownBarrel', 30 * KB, ['b.ts', 'c.ts']),
        ]);

        expect(seen).toEqual([['a.ts', 'b.ts', 'c.ts']]);
        expect(total.bytes).toBe(30 * KB);
        expect(total.after).toBe(170 * KB);
        expect(total.counted).toBe(2);
    });

    it('says nothing was counted when no signal names any files', () => {
        const total = totalSaving(
            analysisWith(() => 999, 200 * KB),
            [finding('clean')],
        );

        expect(total.bytes).toBe(0);
        expect(total.counted).toBe(0);
    });
});

describe('savings in the report’s unit', () => {
    /** A bootstrap of 300 kB raw that travels as 100 kB, and a walk that counts 300 kB too. */
    const compressed = {
        bootBytes: 100 * KB,
        bootRawBytes: 300 * KB,
        insights: () => ({ exclusiveOf: () => 90 * KB, bootTotal: 300 * KB }) as unknown as GraphInsights,
    } as unknown as Analysis;

    it('carries a raw saving into a compressed report at the bootstrap’s own ratio, as an estimate', () => {
        // The bug this exists for: "takes 302 kB off" a bootstrap headed as 258 kB. The saving
        // has to come out in the unit of the figure it comes off.
        const total = totalSaving(compressed, [finding('ownInBoot', 90 * KB, ['a.ts'])]);
        const inUnit = savingInUnit(compressed, total);

        expect(total.bytes).toBe(90 * KB);
        expect(inUnit).toEqual({ bytes: 30 * KB, after: 70 * KB, estimated: true });
        expect(formatSaving(total.bytes, unitScale(compressed))).toMatch(/^≈30\s?kB$/);
    });

    it('leaves a raw report exactly as it was, with nothing marked as estimated', () => {
        const raw = { ...compressed, bootBytes: 300 * KB };
        const total = totalSaving(raw, [finding('ownInBoot', 90 * KB, ['a.ts'])]);

        expect(unitScale(raw)).toEqual({ ratio: 1, estimated: false });
        expect(savingInUnit(raw, total)).toEqual({ bytes: 90 * KB, after: 210 * KB, estimated: false });
        expect(remainingInUnit(raw, 90 * KB, 210 * KB)).toBe(210 * KB);
    });
});
