import { describe, expect, it } from 'vitest';
import { type ModuleEntry } from '../analysis/analysis.types';
import { packageOf } from '../format/format.utils';
import { exposureOf, scanBuild } from './scan';
import { findSecrets } from './secrets';

const module = (path: string, bytes = 1000, chunk = 'main-A1.js'): ModuleEntry => ({
    path,
    label: path.replace(/^node_modules\//, ''),
    pkg: packageOf(path),
    bytes,
    places: [{ chunk, chunkName: chunk, bytes, zone: 'boot', screens: 0 }],
});

describe('findSecrets', () => {
    it('finds the formats that identify themselves, and redacts what it prints', () => {
        const texts = new Map([['main-A1.js', `const k="AKIAIOSFODNN7EXAMPLE";const g="AIza${'B'.repeat(35)}";`]]);
        const found = findSecrets(texts);

        expect(found.map(match => match.kind)).toEqual(['awsKey', 'googleKey']);
        // Never the whole thing: this report gets pasted into issues.
        expect(found[0]?.redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
        expect(found[0]?.redacted.startsWith('AKIA')).toBe(true);
    });

    it('says nothing about a long string that merely sits next to the word key', () => {
        // The rule that would catch this is the rule that makes a security signal noisy, and a
        // noisy security signal is one somebody switches off before the real match arrives.
        const texts = new Map([['main-A1.js', 'const apiKey = "aGVsbG8gd29ybGQgdGhpcyBpcyBub3QgYSBrZXk";']]);

        expect(findSecrets(texts)).toEqual([]);
    });

    it('finds an internal address and an unsubstituted environment variable', () => {
        const texts = new Map([['main-A1.js', 'fetch("https://billing.internal/api");if(process.env.API_TOKEN){}']]);

        expect(findSecrets(texts).map(match => match.kind)).toEqual(['internalUrl', 'envLeftover']);
    });

    it('counts the same string once, however many chunks hold it', () => {
        const key = 'AKIAIOSFODNN7EXAMPLE';
        const found = findSecrets(
            new Map([
                ['a.js', `x="${key}"`],
                ['b.js', `y="${key}"`],
            ]),
        );

        expect(found).toHaveLength(1);
        expect(found[0]?.count).toBe(2);
    });
});

describe('scanBuild · the rest of what the text says', () => {
    const report = scanBuild({
        texts: new Map([
            ['main-A1.js', '/*! lodash MIT */ /*! chartjs GPL-3.0 */ console.log("x");console.log("y");'],
            // The string that used to be enough to call this a development build. It is not: any
            // project holding a linter rule or a scanner carries it, and Loadline's own bundle did.
            ['dev-B2.js', 'const marker = "react-dom.development";'],
        ]),
        modules: [
            module('node_modules/@sentry/browser/index.js', 40_000),
            module('node_modules/posthog-js/index.js', 30_000),
            module('src/app/users.spec.ts', 500),
            module('src/app/users.ts', 2000),
        ],
        boot: new Set(['main-A1.js']),
        maps: [],
    });

    it('groups third-party services by what they are for, not by name', () => {
        expect(report.thirdParty.map(group => group.category).toSorted((a, b) => a.localeCompare(b))).toEqual([
            'analytics',
            'errors',
        ]);
        expect(report.thirdParty.reduce((sum, group) => sum + group.bootBytes, 0)).toBe(70_000);
    });

    it('classifies a licence rather than only naming it', () => {
        const gpl = report.licences.find(entry => entry.id === 'GPL');

        expect(gpl?.class).toBe('strongCopyleft');
        // The strict ones lead: "you ship GPL" only helps next to "and that kind has conditions".
        expect(report.licences[0]?.id).toBe('GPL');
    });

    it('names the test files and the leftover logs', () => {
        const kinds = report.leftovers.map(item => item.kind);

        expect(kinds).toContain('testFiles');
        expect(report.leftovers.find(item => item.kind === 'consoleLogs')?.count).toBe(2);
    });

    it('does not call a build a development build because a chunk mentions one', () => {
        // The mistake this rule was written with. What decides is whether the file is in the
        // bundle, which the metafile says outright.
        expect(report.leftovers.map(item => item.kind)).not.toContain('reactDev');
    });

    it('calls it one when the development file really is among the inputs', () => {
        const shipped = scanBuild({
            texts: new Map(),
            modules: [module('node_modules/react-dom/cjs/react-dom.development.js', 900_000)],
            boot: new Set(['main-A1.js']),
            maps: [],
        });

        expect(shipped.leftovers.map(item => item.kind)).toContain('reactDev');
    });
});

describe('exposureOf', () => {
    it('says how much of the source a deployed map gives away', () => {
        const map = JSON.stringify({
            version: 3,
            sources: ['../../src/app/secret-pricing.ts', '../../node_modules/rxjs/index.js'],
            sourcesContent: ['const key = process.env.STRIPE_SECRET; // do not ship', null],
            mappings: '',
        });

        const exposure = exposureOf([{ name: 'main-A1.js.map', text: map }]);

        // `node_modules` is not this project's source and would drown the list that matters.
        expect(exposure?.ownFiles).toBe(1);
        expect(exposure?.paths).toEqual(['src/app/secret-pricing.ts']);
        expect(exposure?.hasContent).toBe(true);
        expect(exposure?.envReferences).toBe(1);
    });

    it('says nothing at all when there were no maps to read', () => {
        expect(exposureOf([])).toBeNull();
    });
});
