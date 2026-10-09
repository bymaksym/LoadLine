import { describe, expect, it } from 'vitest';
import { type ModuleEntry } from '../analysis/analysis.types';
import { packageOf } from '../format/format.utils';
import { readAudit, readDeps, readLock } from './deps';

const module = (path: string, bytes = 1000): ModuleEntry => ({
    path,
    label: path.replace(/^node_modules\//, ''),
    pkg: packageOf(path),
    bytes,
    places: [{ chunk: 'main-A1.js', chunkName: 'main-A1.js', bytes, zone: 'boot', screens: 0 }],
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

    /** `yarn audit --json` writes JSON lines, one advisory per path that reaches it. */
    it("reads yarn's JSON lines, one advisory each however many paths repeat it", () => {
        // As yarn writes it: npm 6's field names, which is why this is text and not an object.
        const advisory =
            '{"id":7,"module_name":"mermaid","severity":"high","title":"XSS","findings":[{"version":"10.0.0"}]}';
        const line = `{"type":"auditAdvisory","data":{"advisory":${advisory}}}`;
        const lines = [line, line, '{"type":"auditSummary","data":{}}'].join('\n');

        expect(readAudit(lines)).toMatchObject([{ package: 'mermaid', severity: 'high', versions: ['10.0.0'] }]);
    });

    it('falls back to `info` for a severity that is not one of the five', () => {
        expect(readAudit('{"vulnerabilities":{"lodash":{"severity":"catastrophic"}}}')?.[0]?.severity).toBe('info');
        expect(readAudit('{"vulnerabilities":{"lodash":{"severity":7}}}')?.[0]?.severity).toBe('info');
    });
});

/**
 * pnpm writes the installed versions an advisory found. A Nuxt app's audit reported six advisories
 * against `devalue <=5.9.2` as shipped in the first load, and failed `--fail-on high`, while the
 * browser carried `devalue@6.0.2`: 5.9.2 was a copy only the server had.
 */
describe('readDeps · the copy that ships, against the copy the audit found', () => {
    // As pnpm writes it: npm 6's field names, which is why this is text and not an object.
    const audit = readAudit(
        '{"advisories":{"1":{"module_name":"devalue","severity":"high","title":"Prototype pollution",' +
            '"vulnerable_versions":"<=5.9.2","patched_versions":">=5.9.3",' +
            '"findings":[{"version":"5.9.2","paths":["@nuxtjs/i18n>devalue"]}]}}}',
    );
    const crossing = (path: string) =>
        readDeps({
            lock: null,
            advisories: audit,
            modules: [module(path)],
            boot: new Set(['main-A1.js']),
            direct: new Set(),
        });

    it("reads pnpm's range, fix and installed versions instead of leaving them out", () => {
        expect(audit?.[0]).toMatchObject({ range: '<=5.9.2', fixedIn: '>=5.9.3', versions: ['5.9.2'] });
    });

    it('does not count it as shipped when the browser carries another version', () => {
        const report = crossing('node_modules/.pnpm/devalue@6.0.2/node_modules/devalue/src/parse.js');

        expect(report.shipped).toEqual([]);
        expect(report.notShipped.map(entry => entry.package)).toEqual(['devalue']);
    });

    it('counts it when the version in the browser is the one the audit found', () => {
        expect(crossing('node_modules/.pnpm/devalue@5.9.2/node_modules/devalue/src/parse.js').shipped).toHaveLength(1);
    });

    it('counts it when the path does not say which version ships, which is the side to be wrong on', () => {
        expect(crossing('node_modules/devalue/src/parse.js').shipped).toHaveLength(1);
    });
});

/** Nothing filled the chain, and "each one comes with the chain that pulls it" printed none. */
describe('readDeps · the chain that pulls a package in', () => {
    it('walks up what each lock entry declares to something the project asked for', () => {
        const report = readDeps({
            lock: [
                { name: 'chart-lib', version: '2.0.0', requiredBy: [], declares: { 'color-lib': '^1.0.0' } },
                { name: 'color-lib', version: '1.2.0', requiredBy: [], declares: { hammerjs: '^2.0.0' } },
                { name: 'hammerjs', version: '2.0.8', requiredBy: [] },
            ],
            advisories: null,
            modules: [module('node_modules/hammerjs/hammer.js', 20_000)],
            boot: new Set(['main-A1.js']),
            direct: new Set(['chart-lib']),
        });

        expect(report.transitive[0]).toMatchObject({ name: 'hammerjs', chain: ['chart-lib', 'color-lib'] });
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
