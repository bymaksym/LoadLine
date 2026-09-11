import { describe, expect, it } from 'vitest';
import { analyze } from './analysis';
import { type Metafile } from './metafile.types';
import { buildSearchIndex, countMatches, queryIndex } from './search';

/**
 * `main` statically imports `heavy-lib`; screen A lazily imports `pdf`; both screens share
 * `ui-kit`. Enough to check the three answers the search has to give: bootstrap, shared and own.
 */
const meta: Metafile = {
    inputs: {
        'src/main.ts': {
            bytes: 100,
            format: 'esm',
            imports: [
                { path: 'node_modules/heavy-lib/index.js', kind: 'import-statement' },
                { path: 'src/app/a.page.ts', kind: 'dynamic-import' },
                { path: 'src/app/b.page.ts', kind: 'dynamic-import' },
            ],
        },
        'src/app/a.page.ts': {
            bytes: 100,
            format: 'esm',
            imports: [{ path: 'node_modules/crypto-js/md5.js', kind: 'import-statement' }],
        },
        'src/app/b.page.ts': { bytes: 100, format: 'esm' },
        'src/app/shared/translation-keys.enum.ts': { bytes: 900, format: 'esm' },
        'node_modules/heavy-lib/index.js': { bytes: 500, format: 'esm' },
        'node_modules/crypto-js/md5.js': { bytes: 300, format: 'cjs' },
        'node_modules/ui-kit/index.js': { bytes: 800, format: 'esm' },
        // Spread over two zones: a little in the bootstrap, most of it in the shared chunk.
        'node_modules/wide-lib/index.js': { bytes: 500, format: 'esm' },
    },
    outputs: {
        'dist/main.js': {
            bytes: 1500,
            entryPoint: 'src/main.ts',
            inputs: {
                'src/main.ts': { bytesInOutput: 100 },
                'node_modules/heavy-lib/index.js': { bytesInOutput: 500 },
                'src/app/shared/translation-keys.enum.ts': { bytesInOutput: 900 },
                'node_modules/wide-lib/index.js': { bytesInOutput: 100 },
            },
            imports: [
                { path: 'dist/screen-a.js', kind: 'dynamic-import' },
                { path: 'dist/screen-b.js', kind: 'dynamic-import' },
            ],
        },
        'dist/screen-a.js': {
            bytes: 400,
            entryPoint: 'src/app/a.page.ts',
            inputs: {
                'src/app/a.page.ts': { bytesInOutput: 100 },
                'node_modules/crypto-js/md5.js': { bytesInOutput: 300 },
            },
            imports: [{ path: 'dist/shared.js', kind: 'import-statement' }],
        },
        'dist/screen-b.js': {
            bytes: 100,
            entryPoint: 'src/app/b.page.ts',
            inputs: { 'src/app/b.page.ts': { bytesInOutput: 100 } },
            imports: [{ path: 'dist/shared.js', kind: 'import-statement' }],
        },
        'dist/shared.js': {
            bytes: 1200,
            inputs: {
                'node_modules/ui-kit/index.js': { bytesInOutput: 800 },
                'node_modules/wide-lib/index.js': { bytesInOutput: 400 },
            },
        },
    },
};

const index = buildSearchIndex(analyze(meta, null));

describe('search', () => {
    it('says nothing until there is something to search for', () => {
        expect(queryIndex(index, '')).toEqual([]);
        expect(queryIndex(index, 'u')).toEqual([]);
    });

    it('finds a package in the bootstrap and says everybody pays for it', () => {
        const [result] = queryIndex(index, 'heavy');

        expect(result).toMatchObject({
            kind: 'package',
            key: 'heavy-lib',
            bytes: 500,
            zone: 'boot',
            inBoot: true,
            bootBytes: 500,
        });
        // In the bootstrap the screen list adds nothing: every screen loads it.
        expect(result?.screens).toEqual([]);
        expect(result?.chain).toEqual(['src/main.ts', 'heavy-lib']);
    });

    it('says which screens pay for a shared package', () => {
        const [result] = queryIndex(index, 'ui-kit');

        expect(result).toMatchObject({ zone: 'shared', inBoot: false, bytes: 800 });
        expect(result?.screens.map(screen => screen.label)).toEqual(['a', 'b']);
        expect(result?.places.map(place => place.chunkName)).toEqual(['shared.js']);
    });

    it('summarises a package spread over zones by where its weight is, not by the worst zone', () => {
        const [result] = queryIndex(index, 'wide-lib');

        // 400 of its 500 bytes are in the shared chunk: calling the whole thing "bootstrap"
        // would say every load pays 500 bytes for it, and every load only pays 100.
        expect(result).toMatchObject({ bytes: 500, zone: 'shared', inBoot: true, bootBytes: 100 });
        // And it still says which screens pay for the shared part: being partly in the bootstrap
        // does not make the screen list irrelevant.
        expect(result?.screens.map(screen => screen.label)).toEqual(['a', 'b']);
    });

    it('finds a package by the name of one of its files', () => {
        const [result] = queryIndex(index, 'md5');

        // The question is "are we shipping an md5"; the answer is the package that ships it.
        expect(result?.key).toBe('crypto-js');
        expect(result?.matchedFiles).toEqual(['crypto-js/md5.js']);
    });

    it('keeps project files one per file, because that is what gets edited', () => {
        const [result] = queryIndex(index, 'translation-keys');

        expect(result).toMatchObject({
            kind: 'file',
            key: 'src/app/shared/translation-keys.enum.ts',
            bytes: 900,
            zone: 'boot',
        });
        expect(result?.contents).toEqual([]);
    });

    it('finding nothing is an answer: that name is not in the bundle', () => {
        expect(queryIndex(index, 'moment')).toEqual([]);
        expect(countMatches(index, 'moment')).toBe(0);
    });

    it('counts the matches without building the results', () => {
        expect(countMatches(index, 'src/app')).toBe(queryIndex(index, 'src/app').length);
        expect(countMatches(index, 'x')).toBe(0);
    });

    it('orders by weight, heaviest first', () => {
        const sizes = queryIndex(index, 's').map(result => result.bytes);

        expect(sizes).toEqual([...sizes].toSorted((a, b) => b - a));
    });
});
