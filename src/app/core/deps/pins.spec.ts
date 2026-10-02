/**
 * The case that made this exist: `idb` twice in a Firebase application, one copy pinned to exactly
 * `7.1.1` by `@firebase/app` and the other on 8.x. The report used to suggest an override without
 * a word about what forcing it means; these tests are the word.
 */

import { describe, expect, it } from 'vitest';
import { type DuplicatePackage } from '../analysis/analysis.types';
import { readLock } from './deps';
import { declaredFromLock, pinsOf } from './pins';

const copy = (version: string, via: string[]): DuplicatePackage['copies'][number] => ({
    at: '',
    version,
    under: null,
    bytes: 3000,
    files: 1,
    zone: 'boot',
    screens: 0,
    chain: null,
    importers: [],
    viaPackages: via,
});

const IDB: DuplicatePackage = {
    name: 'idb',
    copies: [copy('7.1.1', ['@firebase/app']), copy('8.0.2', ['offline-kit'])],
    bytes: 7000,
    inBoot: true,
};

describe('pinsOf', () => {
    it('says a copy is pinned to an exact version, a major away from the other', () => {
        const declared = new Map([
            ['@firebase/app', { idb: '7.1.1' }],
            ['offline-kit', { idb: '^8.0.0' }],
        ]);

        expect(pinsOf([IDB], declared).get('idb')).toEqual([
            { parent: '@firebase/app', range: '7.1.1', version: '7.1.1', majorApart: true },
        ]);
    });

    it('does not call a range a pin', () => {
        const declared = new Map([['@firebase/app', { idb: '^7.1.1' }]]);
        expect(pinsOf([IDB], declared).size).toBe(0);
    });

    it('tells a pin on the same major apart: an override may work there', () => {
        const same: DuplicatePackage = { ...IDB, copies: [copy('7.1.1', ['@firebase/app']), copy('7.2.0', ['other'])] };
        const declared = new Map([['@firebase/app', { idb: '=7.1.1' }]]);

        expect(pinsOf([same], declared).get('idb')?.[0]?.majorApart).toBe(false);
    });

    it('says nothing when nobody gave the ranges', () => {
        expect(pinsOf([IDB], null).size).toBe(0);
    });
});

describe('declaredFromLock', () => {
    it('reads what each package declares out of a package-lock.json', () => {
        const lock = readLock(
            'package-lock.json',
            JSON.stringify({
                packages: {
                    'node_modules/@firebase/app': {
                        version: '0.10.13',
                        dependencies: { idb: '7.1.1', tslib: '^2.1.0' },
                    },
                    'node_modules/idb': { version: '8.0.2' },
                },
            }),
        );

        expect(declaredFromLock(lock).get('@firebase/app')).toEqual({ idb: '7.1.1', tslib: '^2.1.0' });
    });

    it('reads it out of a yarn.lock, and never out of pnpm’s resolved versions', () => {
        const yarn = readLock(
            'yarn.lock',
            [
                '"@firebase/app@0.10.13":',
                '  version "0.10.13"',
                '  dependencies:',
                '    idb "7.1.1"',
                '    tslib "^2.1.0"',
                '',
                'idb@7.1.1:',
                '  version "7.1.1"',
            ].join('\n'),
        );
        expect(declaredFromLock(yarn).get('@firebase/app')).toEqual({ idb: '7.1.1', tslib: '^2.1.0' });

        // pnpm writes the same shape under `snapshots:` with what was resolved, not what was asked
        // for: read as ranges, every dependency of every package would look pinned.
        const pnpm = readLock(
            'pnpm-lock.yaml',
            ['snapshots:', '', "  '@firebase/app@0.10.13':", '    dependencies:', '      idb: 7.1.1'].join('\n'),
        );
        expect(declaredFromLock(pnpm).size).toBe(0);
    });
});
