/**
 * The map's layout is arithmetic, and arithmetic a picture hides: a rectangle a few pixels off
 * still looks right. So the two properties that make it honest are checked as numbers — every area
 * is its share of the whole, and nothing leaves the frame.
 */

import { describe, expect, it } from 'vitest';
import { type TreeNode } from './analysis.types';
import { mapOf, pathTo, squarify } from './treemap';

const LABELS = { unattributed: 'unattributed', rest: (count: number) => `${count} more` };

describe('squarify', () => {
    const frame = { x: 0, y: 0, w: 600, h: 400 };
    const weights = [500, 250, 120, 80, 30, 15, 5];
    const tiles = squarify(weights, weight => weight, frame);

    it('gives every item an area proportional to its weight', () => {
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        for (const tile of tiles) {
            const expected = (tile.item / total) * frame.w * frame.h;
            expect(tile.rect.w * tile.rect.h).toBeCloseTo(expected, 4);
        }
    });

    it('keeps every rectangle inside the frame and fills it', () => {
        for (const { rect } of tiles) {
            expect(rect.x).toBeGreaterThanOrEqual(-1e-9);
            expect(rect.y).toBeGreaterThanOrEqual(-1e-9);
            expect(rect.x + rect.w).toBeLessThanOrEqual(frame.w + 1e-6);
            expect(rect.y + rect.h).toBeLessThanOrEqual(frame.h + 1e-6);
        }
        const area = tiles.reduce((sum, { rect }) => sum + rect.w * rect.h, 0);
        expect(area).toBeCloseTo(frame.w * frame.h, 4);
    });

    it('orders the result largest first, which is the order a keyboard visits it in', () => {
        expect(tiles.map(tile => tile.item)).toEqual(weights);
    });

    it('leaves out what weighs nothing: a zero-area rectangle is nothing anybody can point at', () => {
        expect(squarify([3, 0, 1], weight => weight, frame).map(tile => tile.item)).toEqual([3, 1]);
        expect(squarify([], weight => weight, frame)).toEqual([]);
    });
});

const chunk = (id: string, bytes: number, rawBytes: number, parts: [string, number, TreeNode['kind']][]): TreeNode => ({
    id,
    label: id,
    bytes,
    rawBytes,
    kind: 'chunk',
    zone: 'boot',
    screens: 0,
    children: parts.map(([label, partBytes, kind]) => ({
        id: `${id}::${label}`,
        label,
        bytes: partBytes,
        kind,
        children: [
            { id: `${id}::${label}::index.js`, label: 'index.js', bytes: partBytes, kind: 'file', children: [] },
        ],
    })),
});

describe('mapOf', () => {
    it('sizes chunks by the figure of the report and the parts inside by their raw share', () => {
        const [main] = mapOf([chunk('main.js', 40_000, 100_000, [['rxjs', 60_000, 'package']])], LABELS);

        expect(main?.weight).toBe(40_000);
        expect(main?.bytes).toBe(40_000);
        expect(main?.raw).toBe(100_000);
        // 40 kB the metafile attributes to no file: the bundler's wrapper, drawn so the parts fill the chunk.
        expect(main?.children.map(part => [part.label, part.weight])).toEqual([
            ['rxjs', 60_000],
            ['unattributed', 40_000],
        ]);
    });

    it('adds no remainder when the parts add up to more than the file, as Angular 22 writes them', () => {
        const [main] = mapOf([chunk('main.js', 40_000, 100_000, [['rxjs', 125_000, 'package']])], LABELS);
        expect(main?.children.map(part => part.label)).toEqual(['rxjs']);
    });

    it('marks project folders and their files as the project’s own, and packages as not', () => {
        const [main] = mapOf(
            [
                chunk('main.js', 10_000, 10_000, [
                    ['src/app/core', 6000, 'folder'],
                    ['rxjs', 4000, 'package'],
                ]),
            ],
            LABELS,
        );
        const [core, rxjs] = main?.children ?? [];
        expect(core?.own).toBe(true);
        expect(core?.children[0]?.own).toBe(true);
        expect(rxjs?.own).toBe(false);
    });

    it('folds a crowd of tiny chunks into one rectangle that opens like any other', () => {
        const tree = [
            chunk('big.js', 1_000_000, 1_000_000, []),
            ...Array.from({ length: 5 }, (_, index) => chunk(`tiny-${index}.js`, 100, 100, [])),
        ];
        const roots = mapOf(tree, LABELS);

        expect(roots.map(node => node.label)).toEqual(['big.js', '5 more']);
        expect(roots[1]?.children).toHaveLength(5);
        expect(roots[1]?.weight).toBe(500);
    });

    it('finds a chunk by what it carries, not only by its name', () => {
        const [main] = mapOf([chunk('main.js', 10, 10, [['@firebase/app', 10, 'package']])], LABELS);
        expect(main?.haystack.includes('@firebase/app')).toBe(true);
    });
});

describe('pathTo', () => {
    it('walks the ids down and stops at the first one that is not there', () => {
        const roots = mapOf([chunk('main.js', 10, 10, [['rxjs', 10, 'package']])], LABELS);
        expect(pathTo(roots, ['main.js', 'main.js::rxjs']).map(node => node.label)).toEqual(['main.js', 'rxjs']);
        expect(pathTo(roots, ['main.js', 'nope', 'main.js::rxjs']).map(node => node.label)).toEqual(['main.js']);
    });
});
