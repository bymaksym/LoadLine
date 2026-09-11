import { describe, expect, it } from 'vitest';
import { buildPathTree, mergePathItems } from './path-tree';

describe('buildPathTree', () => {
    it('groups by folder and sorts by weight, folders and files mixed', () => {
        const roots = buildPathTree([
            { path: 'src/app/a.ts', bytes: 10 },
            { path: 'src/app/b.ts', bytes: 30 },
            { path: 'src/lib/c.ts', bytes: 15 },
        ]);

        expect(roots).toHaveLength(1);
        expect(roots[0]?.name).toBe('src');
        expect(roots[0]?.bytes).toBe(55);
        expect(roots[0]?.files).toBe(3);
        expect(roots[0]?.children.map(c => c.name)).toEqual(['app', 'lib']);
        expect(roots[0]?.children[0]?.children.map(c => c.name)).toEqual(['b.ts', 'a.ts']);
    });

    it('collapses single-folder chains, but never the root', () => {
        const roots = buildPathTree([
            { path: '@angular/core/fesm2022/core.mjs', bytes: 100 },
            { path: '@angular/router/fesm2022/router.mjs', bytes: 50 },
        ]);

        // `@angular` has two children: it stays visible. `core/fesm2022` has one: it collapses.
        expect(roots.map(r => r.name)).toEqual(['@angular']);
        expect(roots[0]?.children.map(c => c.name)).toEqual(['core/fesm2022', 'router/fesm2022']);
        expect(roots[0]?.children[0]?.children[0]?.isFile).toBe(true);
    });

    it('a loose file at the root is a leaf', () => {
        const roots = buildPathTree([{ path: 'xlsx.mjs', bytes: 7 }]);

        expect(roots).toEqual([{ id: 'xlsx.mjs', name: 'xlsx.mjs', bytes: 7, files: 1, isFile: true, children: [] }]);
    });
});

describe('mergePathItems', () => {
    it('adds up the same file repeated across chunks', () => {
        const merged = mergePathItems([
            { path: 'a.js', bytes: 1 },
            { path: 'a.js', bytes: 2 },
            { path: 'b.js', bytes: 5 },
        ]);

        expect(merged).toEqual([
            { path: 'a.js', bytes: 3 },
            { path: 'b.js', bytes: 5 },
        ]);
    });
});
