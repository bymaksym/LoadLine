import { describe, expect, it } from 'vitest';
import { composeFindings } from './compose';
import { type Finding, type Severity } from './finding.types';

/** The ordering is about severity and source, never about which signal it is: `kind` is filler here. */
const finding = (chip: string, severity: Severity): Finding => ({
    kind: 'shared',
    severity,
    chip,
    title: chip,
    body: '',
    fix: '',
});

const chips = (findings: Finding[]): string[] => findings.map(f => f.chip);

const EMPTY = { base: [], fromComparison: [], fromContext: [], fromMeasurement: [] };

describe('composeFindings', () => {
    it('with nothing else to read, the analysis card stands alone', () => {
        const base = [finding('nothing stands out', 'ok')];

        expect(composeFindings({ ...EMPTY, base })).toEqual(base);
    });

    it('a measurement leads: it is the only part that was measured instead of computed', () => {
        const composed = composeFindings({
            ...EMPTY,
            base: [finding('shared', 'high')],
            fromComparison: [finding('grew', 'high')],
            fromMeasurement: [finding('measured', 'high')],
        });

        expect(chips(composed)).toEqual(['measured', 'shared', 'grew']);
    });

    it('the comparison is read before the project files', () => {
        const composed = composeFindings({
            ...EMPTY,
            base: [],
            fromComparison: [finding('grew', 'mid')],
            fromContext: [finding('budget', 'mid')],
        });

        expect(chips(composed)).toEqual(['grew', 'budget']);
    });

    it('context goes to the end and never displaces a problem', () => {
        const composed = composeFindings({
            ...EMPTY,
            base: [finding('shared', 'high')],
            fromContext: [finding('zoneless', 'info')],
        });

        expect(chips(composed)).toEqual(['shared', 'zoneless']);
    });

    it('with no problem anywhere, the analysis card comes back and the notes follow', () => {
        const composed = composeFindings({
            ...EMPTY,
            base: [finding('nothing stands out', 'ok')],
            fromContext: [finding('zoneless', 'info')],
        });

        expect(chips(composed)).toEqual(['nothing stands out', 'zoneless']);
    });
});
