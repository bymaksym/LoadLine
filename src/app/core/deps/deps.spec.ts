import { describe, expect, it } from 'vitest';
import { type ModuleEntry } from '../analysis/analysis.types';
import { packageOf } from '../format/format.utils';
import { readAudit, readDeps, readLock } from './deps';

const module = (path: string, bytes = 1000, chunk = 'main-A1.js'): ModuleEntry => ({
    path,
    label: path.replace(/^node_modules\//, ''),
    pkg: packageOf(path),
    bytes,
    places: [{ chunk, chunkName: chunk, bytes, zone: 'boot', screens: 0 }],
});

describe('readLock · three formats, because a project has whichever one it has', () => {
    it('reads an npm lock file, new format and old', () => {
        const npm = readLock(
            'package-lock.json',
            JSON.stringify({
                packages: { '': {}, 'node_modules/lodash': { version: '4.17.21' } },
                dependencies: { rxjs: { version: '7.8.1' } },
            }),
        );

        expect(npm?.map(entry => `${entry.name}@${entry.version}`).toSorted((a, b) => a.localeCompare(b))).toEqual([
            'lodash@4.17.21',
            'rxjs@7.8.1',
        ]);
    });

    it('is null for an npm lock file that parses to something other than an object', () => {
        expect(readLock('package-lock.json', 'null')).toBeNull();
        expect(readLock('package-lock.json', '[]')).toBeNull();
        expect(readLock('package-lock.json', 'not json')).toBeNull();
    });

    it('skips a lock entry whose version is missing or not a string', () => {
        const lock = readLock(
            'package-lock.json',
            JSON.stringify({
                packages: {
                    'node_modules/lodash': { version: '4.17.21' },
                    'node_modules/broken': { version: 7 },
                    'node_modules/absent': {},
                    'node_modules/nothing': null,
                },
            }),
        );

        expect(lock?.map(entry => entry.name)).toEqual(['lodash']);
    });

    it('reads a pnpm lock file, scopes included', () => {
        const pnpm = readLock(
            'pnpm-lock.yaml',
            ['packages:', '  /lodash@4.17.21:', '  /@angular/core@22.1.0:'].join('\n'),
        );

        expect(pnpm?.map(entry => entry.name).toSorted((a, b) => a.localeCompare(b))).toEqual([
            '@angular/core',
            'lodash',
        ]);
    });

    it('refuses a file that is none of the three, rather than reading nothing out of it', () => {
        expect(readLock('something.txt', 'hello')).toBeNull();
    });
});

describe('readAudit', () => {
    it('reads both shapes npm and pnpm write', () => {
        const modern = readAudit(
            JSON.stringify({ vulnerabilities: { lodash: { severity: 'high', via: [{ title: 'Pollution' }] } } }),
        );
        // npm 6 spells it `module_name`; it is their field, written as a string so the project's
        // own naming rule is not disabled for one fixture.
        const legacy = readAudit('{"advisories":{"1":{"module_name":"lodash","severity":"critical","title":"Old"}}}');

        expect(modern?.[0]).toMatchObject({ package: 'lodash', severity: 'high', title: 'Pollution' });
        expect(legacy?.[0]).toMatchObject({ package: 'lodash', severity: 'critical' });
    });

    it('is null for anything that is not an audit report: nobody ran one is not the same as none', () => {
        expect(readAudit('{"hello":1}')).toBeNull();
        expect(readAudit('not json')).toBeNull();
    });

    /*
     * These four parse as JSON and are not objects with the fields the reader goes on to use. The
     * shape used to be asserted rather than checked, so `null` reached a property read and threw a
     * TypeError out of a function whose signature promises `Advisory[] | null`.
     */
    it('rejects valid JSON that is not an object instead of throwing', () => {
        expect(readAudit('null')).toBeNull();
        expect(readAudit('[1,2,3]')).toBeNull();
        expect(readAudit('"a string"')).toBeNull();
        expect(readAudit('42')).toBeNull();
    });

    /*
     * `Object.entries` of a string yields its characters, so a report whose `vulnerabilities` is
     * not a keyed object used to become one advisory per character, each named after its index.
     */
    it('does not invent an advisory per character when the keyed object is a string', () => {
        expect(readAudit('{"vulnerabilities":"oops"}')).toBeNull();
    });

    it('skips an entry that is not an object rather than reading fields off it', () => {
        expect(readAudit('{"vulnerabilities":{"lodash":null,"rxjs":{"severity":"low"}}}')).toEqual([
            { package: 'rxjs', severity: 'low', title: 'rxjs', url: null, range: null, fixedIn: null },
        ]);
    });

    it('falls back to `info` for a severity that is not one of the five', () => {
        expect(readAudit('{"vulnerabilities":{"lodash":{"severity":"catastrophic"}}}')?.[0]?.severity).toBe('info');
        expect(readAudit('{"vulnerabilities":{"lodash":{"severity":7}}}')?.[0]?.severity).toBe('info');
    });
});

describe('readDeps · the crossing neither side can do alone', () => {
    const report = readDeps({
        lock: [{ name: 'lodash', version: '4.17.21', requiredBy: ['chart-lib'] }],
        advisories: [
            { package: 'lodash', severity: 'high', title: 'Pollution', url: null, range: null, fixedIn: null },
            { package: 'esbuild', severity: 'moderate', title: 'Dev only', url: null, range: null, fixedIn: null },
        ],
        modules: [module('node_modules/lodash/index.js', 70_000), module('src/app/main.ts', 500)],
        boot: new Set(['main-A1.js']),
        direct: new Set(['@angular/core']),
    });

    it('separates the advisories that ship from the ones that do not', () => {
        // "You have 2 vulnerabilities" is noise. "1 of your 2 is in the first load" is an afternoon.
        expect(report.shipped.map(entry => entry.package)).toEqual(['lodash']);
        expect(report.shipped[0]?.inBoot).toBe(true);
        expect(report.notShipped.map(entry => entry.package)).toEqual(['esbuild']);
    });

    it('names what is in the bundle that the project never asked for, and what pulls it in', () => {
        expect(report.transitive[0]).toMatchObject({ name: 'lodash', chain: ['chart-lib'] });
    });

    it('says whether either file was read at all', () => {
        const nothing = readDeps({ lock: null, advisories: null, modules: [], boot: new Set(), direct: new Set() });

        expect(nothing.lockRead).toBe(false);
        expect(nothing.auditRead).toBe(false);
    });
});
