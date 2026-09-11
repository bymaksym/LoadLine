import { describe, expect, it } from 'vitest';
import { bytesBySource, isSourceMap, resolveSources, resolveSplits } from './sourcemap';

const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Encodes one number the way a source map does, so the fixtures read as numbers instead of as encoded strings. */
const encode = (value: number): string => {
    let bits = value < 0 ? -value * 2 + 1 : value * 2;
    let out = '';

    do {
        const digit = bits % 32;
        bits = Math.floor(bits / 32);
        // 32 added on top is the "more digits follow" flag.
        out += VLQ_CHARS[bits > 0 ? digit + 32 : digit];
    } while (bits > 0);

    return out;
};

const segment = (fields: number[]): string => fields.map(field => encode(field)).join('');

describe('bytesBySource', () => {
    it('gives each stretch of the output to the file it came from', () => {
        // One line, 30 characters. Two segments: columns 0-9 from `a.ts`, 10-30 from `b.ts`.
        const code = 'x'.repeat(30);
        const mappings = [segment([0, 0, 0, 0]), segment([10, 1, 0, 0])].join(',');
        const bytes = bytesBySource({ version: 3, sources: ['a.ts', 'b.ts'], mappings }, code);

        expect(bytes.get('a.ts')).toBe(10);
        // To the end of the line, plus the newline.
        expect(bytes.get('b.ts')).toBe(21);
    });

    it('keeps counting the source index across lines, as the format requires', () => {
        const code = ['x'.repeat(10), 'y'.repeat(10)].join('\n');
        // Second line: the source index does not restart, so 0 means "the same one as before".
        const mappings = [segment([0, 0, 0, 0]), segment([0, 1, 0, 0])].join(';');
        const bytes = bytesBySource({ version: 3, sources: ['a.ts', 'b.ts'], mappings }, code);

        expect(bytes.get('a.ts')).toBe(11);
        expect(bytes.get('b.ts')).toBe(11);
    });

    it('leaves out what maps to nothing instead of sharing it around', () => {
        const code = 'x'.repeat(20);
        // A one-field segment: generated code with no source, the bundler's own runtime.
        const mappings = [segment([0]), segment([10, 0, 0, 0])].join(',');
        const bytes = bytesBySource({ version: 3, sources: ['a.ts'], mappings }, code);

        expect(bytes.get('a.ts')).toBe(11);
        expect([...bytes.keys()]).toEqual(['a.ts']);
    });

    it('recognises a source map and rejects anything else', () => {
        expect(isSourceMap({ version: 3, sources: [], mappings: '' })).toBe(true);
        expect(isSourceMap({ outputs: {} })).toBe(false);
        expect(isSourceMap(null)).toBe(false);
    });
});

describe('resolveSources', () => {
    const inputs = ['src/app/a.page.ts', 'node_modules/heavy-lib/index.js'];

    it('matches once the `../` that point out of the output folder are gone', () => {
        expect(resolveSources(['../../src/app/a.page.ts'], inputs)).toEqual(['src/app/a.page.ts']);
        expect(resolveSources(['../../node_modules/heavy-lib/index.js'], inputs)).toEqual([
            'node_modules/heavy-lib/index.js',
        ]);
    });

    it('folds a template into its component, which is all the metafile knows about', () => {
        // Without this, a component with a big template reads as far lighter than it is.
        expect(resolveSources(['../../src/app/a.page.html'], ['src/app/a.page.ts'])).toEqual(['src/app/a.page.ts']);
    });

    it('leaves out what it cannot place, rather than guessing', () => {
        // Two candidates with the same file name: attributing weight to the wrong one would be worse.
        expect(resolveSources(['index.js'], ['a/index.js', 'b/index.js'])).toEqual([null]);
        expect(resolveSources(['angular:styles/component:css'], inputs)).toEqual([null]);
    });
});

describe('resolveSplits', () => {
    it('keys the weights by the metafile file names', () => {
        const splits = new Map([['main.js', new Map([['../../src/app/a.page.ts', 120]])]]);
        const resolved = resolveSplits(splits, ['src/app/a.page.ts']);

        expect(resolved?.get('main.js')?.get('src/app/a.page.ts')).toBe(120);
    });

    it('is null when there is nothing usable, so the analysis keeps the approximation', () => {
        expect(resolveSplits(null, [])).toBeNull();
        expect(resolveSplits(new Map([['main.js', new Map([['unknown.ts', 10]])]]), ['src/a.ts'])).toBeNull();
    });
});
