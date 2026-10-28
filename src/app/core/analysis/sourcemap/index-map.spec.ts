import { describe, expect, it } from 'vitest';
import { isReadableMap, parseSourceMap } from './index-map';
import { bytesBySource, isSourceMap, segmentsOf } from './sourcemap';

/**
 * Zaporeak, exported as JavaScript by Metro: a 16 MB map in 2,290 sections and nothing at its root,
 * read as "this folder carries no source maps". Two sections here, the second starting mid-line.
 */
const INDEX_MAP = JSON.stringify({
    version: 3,
    sections: [
        {
            offset: { line: 0, column: 0 },
            map: { version: 3, sources: ['src/a.ts'], sourcesContent: ['a'], names: [], mappings: 'AAAA;AACA' },
        },
        {
            offset: { line: 1, column: 6 },
            map: { version: 3, sources: ['src/b.ts'], sourcesContent: ['b'], names: [], mappings: 'AAAA,MAAC' },
        },
    ],
});

describe('parseSourceMap · an index map', () => {
    it('joins the sections into one map the readers understand', () => {
        const map = parseSourceMap(INDEX_MAP);

        expect(isSourceMap(map)).toBe(true);
        if (!isSourceMap(map)) {
            return;
        }
        expect(map.sources).toEqual(['src/a.ts', 'src/b.ts']);
        expect(segmentsOf(map)).toEqual([
            [{ column: 0, source: 'src/a.ts' }],
            [
                { column: 0, source: 'src/a.ts' },
                { column: 6, source: 'src/b.ts' },
                { column: 12, source: 'src/b.ts' },
            ],
        ]);
    });

    it('splits the generated file by source, as with a regular map', () => {
        const map = parseSourceMap(INDEX_MAP);
        const split = isSourceMap(map) ? bytesBySource(map, 'aaaa\naaaaaabbbbbbbbbbbbbb') : null;

        expect(split?.get('src/a.ts')).toBe(5 + 6);
        expect(split?.get('src/b.ts')).toBe(15);
    });

    it('keeps the sources’ contents, which say what the maps give away', () => {
        expect((parseSourceMap(INDEX_MAP) as { sourcesContent: string[] }).sourcesContent).toEqual(['a', 'b']);
    });

    /** A section pointing at another file is not fetched: that map is one this does not read. */
    it('says a map made only of url sections is not readable, rather than reading nothing', () => {
        const remote = JSON.stringify({ version: 3, sections: [{ offset: { line: 0, column: 0 }, url: 'a.map' }] });

        expect(isReadableMap(remote)).toBe(false);
        expect(isReadableMap(INDEX_MAP)).toBe(true);
        expect(isReadableMap('not json')).toBe(false);
    });
});
