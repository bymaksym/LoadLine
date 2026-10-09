import { describe, expect, it } from 'vitest';
import { RECOMMENDED } from '../criteria/criteria';
import { readConfig } from './loadline-config';
import { type LoadlineConfig } from './loadline-config.types';
import { criteriaToWrite, mergeConfigs } from './merge-config';

const read = (file: Record<string, unknown>): LoadlineConfig => {
    const { config } = readConfig({ tool: 'loadline', version: 1, ...file });
    if (!config) {
        throw new Error('not a config');
    }
    return config;
};

const names = { base: 'base.json', own: 'loadline.json' };

describe('mergeConfigs', () => {
    it('joins objects key by key, and the file that extends wins', () => {
        const base = read({
            criteria: { bootOk: '150kB', bootBad: '300kB' },
            gates: { maxBoot: '350kB', failOn: 'high' },
        });
        const own = read({ criteria: { bootOk: '170kB' }, gates: { maxScreen: '600kB' } });

        const { config } = mergeConfigs(base, own, names);

        expect(config.criteria).toEqual({ bootOk: 170 * 1024, bootBad: 300 * 1024 });
        expect(config.gates).toEqual({ maxBoot: 350 * 1024, failOn: 'high', maxScreen: 600 * 1024 });
    });

    /** The opposite of tsconfig.json, where a list in the child replaces the base's whole. */
    it('adds lists up instead of replacing them, with nothing twice', () => {
        const base = read({
            packages: ['@angular/core', 'rxjs'],
            gates: { failOnSignals: ['secrets'] },
            forbidden: [{ package: 'moment', why: 'date-fns' }],
            build: { ignore: ['polyfills-legacy-*.js'] },
        });
        const own = read({
            packages: ['rxjs', 'date-fns'],
            gates: { failOnSignals: ['forbidden'] },
            build: { ignore: ['sw.js'], page: 'app.html' },
        });

        const { config } = mergeConfigs(base, own, names);

        expect(config.packages).toEqual(['@angular/core', 'rxjs', 'date-fns']);
        expect(config.gates?.failOnSignals).toEqual(['secrets', 'forbidden']);
        expect(config.forbidden).toHaveLength(1);
        expect(config.build).toEqual({ ignore: ['polyfills-legacy-*.js', 'sw.js'], page: 'app.html' });
    });

    it("puts this file's acceptances first: the first entry that covers a signal is the one applied", () => {
        const base = read({ accepted: [{ kind: 'dupes', why: 'company-wide' }] });
        const own = read({ accepted: [{ kind: 'dupes', key: 'date-fns', why: 'until 4.x', until: '2026-12-01' }] });

        expect(mergeConfigs(base, own, names).config.accepted?.map(entry => entry.why)).toEqual([
            'until 4.x',
            'company-wide',
        ]);
    });

    it("never inherits the situation: those are a team's answers, with its name on them", () => {
        const base = read({ situation: { deploys: 'daily', answeredBy: '@platform' } });
        const own = read({});

        const { config } = mergeConfigs(base, own, names);

        expect(config.situation?.deploys).toBe('unknown');
        expect(config.situation?.answeredBy).toBeNull();
    });

    it('stops on a mode that would read every inherited size in the wrong unit', () => {
        const base = read({ mode: 'gzip', gates: { maxBoot: '350kB' } });

        expect(mergeConfigs(base, read({ mode: 'raw' }), names).gateProblems[0]).toContain('base.json');
        expect(mergeConfigs(base, read({ mode: 'gzip' }), names).gateProblems).toEqual([]);
        expect(mergeConfigs(base, read({}), names).config.mode).toBe('gzip');
    });

    it('drops extends from the result: what comes out says everything itself', () => {
        const own = read({ extends: '@acme/loadline-config' });

        expect(own.extends).toEqual(['@acme/loadline-config']);
        expect(mergeConfigs(read({}), own, names).config.extends).toBeUndefined();
    });
});

describe('criteriaToWrite', () => {
    const changed = { ...RECOMMENDED.gzip, bootOk: 100 * 1024 };

    it('writes every threshold for a file of its own, so a release cannot move one', () => {
        expect(criteriaToWrite(changed, 'gzip', false)).toEqual(changed);
    });

    /** Forty pinned thresholds in a file that extends a base override every one of the base's. */
    it('writes only what was changed for a file that extends a base', () => {
        expect(criteriaToWrite(changed, 'gzip', true)).toEqual({ bootOk: 100 * 1024 });
    });
});
