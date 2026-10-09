import { describe, expect, it } from 'vitest';
import { type Analysis, type ModuleEntry, type Zone } from '../../analysis/analysis.types';
import { type GraphInsights } from '../../analysis/graph/insights.types';
import { type ForbiddenRule } from '../../config/loadline-config.types';
import { buildForbiddenFindings } from './forbidden';

const KB = 1024;

const module = (path: string, pkg: string | null, bytes: number, zone: Zone): ModuleEntry => ({
    path,
    label: path,
    pkg,
    bytes,
    places: [{ chunk: `dist/${zone}.js`, chunkName: `${zone}.js`, bytes, zone, screens: zone === 'boot' ? 0 : 1 }],
});

/** A bootstrap with date-fns and the shell, and a lazy admin screen that brings moment. */
const modules = [
    module('node_modules/date-fns/format.js', 'date-fns', 12 * KB, 'boot'),
    module('src/app/shell.ts', null, 4 * KB, 'boot'),
    module('src/app/admin/admin.page.ts', null, 6 * KB, 'own'),
    module('node_modules/moment/moment.js', 'moment', 60 * KB, 'own'),
    module('node_modules/moment/locale/es.js', 'moment', 2 * KB, 'own'),
];

const analysis = {
    modules,
    chainTo: (path: string) => ['src/main.ts', 'src/app/admin/admin.page.ts', path],
    // What the signal saves is the insights' figure; here only which rules fire is under test.
    insights: () => ({ exclusiveOf: () => 0 }) as unknown as GraphInsights,
} as unknown as Analysis;

const rule = (fields: Partial<ForbiddenRule>): ForbiddenRule => ({ in: 'anywhere', why: 'because', ...fields });

describe('buildForbiddenFindings', () => {
    it('raises one high signal per rule that matches, keyed by the rule as written', () => {
        const [found, ...rest] = buildForbiddenFindings(analysis, [rule({ package: 'moment' })], 'en');

        expect(rest).toEqual([]);
        expect(found?.kind).toBe('forbidden');
        expect(found?.severity).toBe('high');
        expect(found?.target?.key).toBe('moment');
        // Every file of the package, the locale too: the size an acceptance is held against.
        expect(found?.size).toBe(62 * KB);
    });

    it('in "bootstrap" looks at the first load only, so a lazy screen may still load it', () => {
        const rules = [rule({ package: 'moment', in: 'bootstrap' }), rule({ package: 'date-fns', in: 'bootstrap' })];
        const found = buildForbiddenFindings(analysis, rules, 'en');

        expect(found.map(finding => finding.target?.key)).toEqual(['date-fns']);
    });

    it('matches files of the project by path, with * for any text, and never a package', () => {
        const found = buildForbiddenFindings(
            analysis,
            [rule({ path: 'src/app/admin/*' }), rule({ path: '*.js' })],
            'en',
        );

        expect(found.map(finding => finding.target?.key)).toEqual(['src/app/admin/*']);
    });

    it('matches packages with * too', () => {
        expect(buildForbiddenFindings(analysis, [rule({ package: 'date-*' })], 'en')).toHaveLength(1);
    });

    it('shows the reason as text, not as markup somebody typed into it', () => {
        const [found] = buildForbiddenFindings(analysis, [rule({ package: 'moment', why: 'use <date-fns>' })], 'es');

        expect(found?.body).toContain('use &lt;date-fns&gt;');
        expect(found?.title).toContain('moment');
    });

    it('says nothing without rules, or when nothing matches', () => {
        expect(buildForbiddenFindings(analysis, undefined, 'en')).toEqual([]);
        expect(buildForbiddenFindings(analysis, [rule({ package: 'lodash' })], 'en')).toEqual([]);
    });
});
