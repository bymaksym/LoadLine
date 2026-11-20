import { describe, expect, it } from 'vitest';
import { type Analysis, type DuplicateCopy, type DuplicatePackage } from '../../analysis/analysis.types';
import { buildDupesFindings } from './dupes';

const copy = (version: string, via: string[], importers: string[] = []): DuplicateCopy => ({
    at: `node_modules/x@${version}`,
    version,
    under: via[0] ?? null,
    bytes: 500,
    files: 1,
    zone: 'boot',
    screens: 0,
    chain: null,
    importers,
    viaPackages: via,
});

const dupe = (name: string, copies: DuplicateCopy[]): DuplicatePackage => ({ name, copies, bytes: 1000, inBoot: true });

const analysis = (duplicates: DuplicatePackage[]): Analysis =>
    ({ duplicates, bootBytes: 1000, bootRawBytes: 1000 }) as unknown as Analysis;

/**
 * espaciot-app: `idb` pinned a major apart by `firebase`, and `tslib` brought twice by two packages
 * that ask for ranges. The fix said "this cannot be deduplicated" and nothing about `tslib`.
 */
describe('buildDupesFindings · the advice for every package', () => {
    const both = analysis([
        dupe('idb', [copy('7.1.1', ['@firebase/app']), copy('8.0.0', [], ['src/app/db.ts'])]),
        dupe('tslib', [copy('2.8.1', ['@angular/core']), copy('1.14.1', ['@microsoft/teams-js'])]),
    ]);
    const declared = new Map([['@firebase/app', { idb: '7.1.1' }]]);

    it('names each package next to what can be done about it', () => {
        const [finding] = buildDupesFindings(both, 'en', declared);

        expect(finding?.fix).toContain('<strong><span class="mono">idb</span>: this cannot be deduplicated');
        expect(finding?.fix).toContain('<span class="mono">tslib</span>: at least one copy is not one you asked for');
        expect(finding?.unfixable).toBeUndefined();
    });

    it('marks the card unfixable only when every package is pinned apart', () => {
        const [finding] = buildDupesFindings(analysis([both.duplicates[0]!]), 'es', declared);

        expect(finding?.unfixable).toBe(true);
        expect(finding?.fix).toContain('no se puede deduplicar');
    });
});
