import { describe, expect, it } from 'vitest';
import { type Finding, type FindingKind } from '../findings/finding.types';
import { applyAcceptances, readConfig, writeConfig } from './loadline-config';
import { type LoadlineConfig } from './loadline-config.types';

const finding = (kind: FindingKind, key = '', saving?: number): Finding =>
    ({
        kind,
        severity: 'mid',
        chip: '',
        title: kind,
        body: '',
        fix: '',
        target: { tab: 'boot', key },
        saving,
    }) as Finding;

const config = (accepted: LoadlineConfig['accepted']): LoadlineConfig => ({ tool: 'loadline', version: 1, accepted });

describe('readConfig', () => {
    it('refuses anything that is not the file', () => {
        expect(readConfig({ criteria: {} }).config).toBeNull();
        expect(readConfig(null).problems).toHaveLength(1);
    });

    it('drops an acceptance with no reason, and says why', () => {
        const read = readConfig({
            tool: 'loadline',
            version: 1,
            accepted: [{ kind: 'dupes', why: '  ' }],
        });

        expect(read.config?.accepted).toEqual([]);
        expect(read.problems[0]).toContain('suppression');
    });

    it('drops an acceptance of a signal that does not exist', () => {
        const read = readConfig({ tool: 'loadline', version: 1, accepted: [{ kind: 'nonsense', why: 'because' }] });

        expect(read.config?.accepted).toEqual([]);
        expect(read.problems[0]).toContain('nonsense');
    });

    it('keeps an acceptance whose date is malformed, without the date', () => {
        const read = readConfig({
            tool: 'loadline',
            version: 1,
            accepted: [{ kind: 'dupes', why: 'later', until: 'next month' }],
        });

        expect(read.config?.accepted?.[0]?.until).toBeUndefined();
        expect(read.problems[0]).toContain('YYYY-MM-DD');
    });
});

describe('applyAcceptances', () => {
    const today = new Date('2026-09-06T00:00:00Z');

    it('sets aside the signal it names, and only that one', () => {
        const { kept, accepted } = applyAcceptances(
            [finding('dupes', 'date-fns'), finding('dupes', 'rxjs')],
            config([{ kind: 'dupes', key: 'date-fns', why: 'upstream' }]),
            today,
        );

        expect(kept.map(item => item.target?.key)).toEqual(['rxjs']);
        expect(accepted[0]?.lapse).toBeNull();
    });

    it('gives the signal back when the date has passed', () => {
        const { kept, accepted } = applyAcceptances(
            [finding('dupes', 'date-fns')],
            config([{ kind: 'dupes', why: 'later', until: '2026-01-01' }]),
            today,
        );

        expect(kept).toHaveLength(1);
        expect(accepted[0]?.lapse).toBe('expired');
    });

    it('gives it back when the figure it was accepted at has grown', () => {
        // 12 kB was what somebody agreed to live with. 400 is not that decision.
        const { kept, accepted } = applyAcceptances(
            [finding('dupes', 'date-fns', 400_000)],
            config([{ kind: 'dupes', why: 'small enough', bytes: 12_000 }]),
            today,
        );

        expect(kept).toHaveLength(1);
        expect(accepted[0]?.lapse).toBe('grew');
    });

    it('accepts every instance of a kind when no key is given', () => {
        const { kept } = applyAcceptances(
            [finding('dupes', 'a'), finding('dupes', 'b')],
            config([{ kind: 'dupes', why: 'all of them, knowingly' }]),
            today,
        );

        expect(kept).toEqual([]);
    });
});

describe('writeConfig', () => {
    it('writes a file the reader accepts', () => {
        const text = writeConfig({ criteria: { bootOk: 1024 } });

        expect(readConfig(JSON.parse(text)).config?.criteria?.bootOk).toBe(1024);
    });
});
