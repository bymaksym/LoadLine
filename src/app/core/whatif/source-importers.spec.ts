import { describe, expect, it } from 'vitest';
import { importersInSources } from './source-importers';

const map = (sources: string[], contents: string[]) => ({
    text: JSON.stringify({ version: 3, sources, sourcesContent: contents }),
});

describe('importersInSources', () => {
    const maps = [
        map(
            [
                '../src/hooks/useTextGeneration.ts',
                '../src/App.tsx',
                '../src/lazy.ts',
                '../node_modules/@excalidraw/mermaid-to-excalidraw/dist/index.js',
            ],
            [
                'import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";',
                "import React from 'react';",
                "const m = await import('@excalidraw/mermaid-to-excalidraw/dist/parser');",
                'export * from "@excalidraw/mermaid-to-excalidraw/dist/x";',
            ],
        ),
    ];

    /** Excalidraw: the static import that puts 173 kB of mermaid in the first load, read from the map. */
    it('finds the files of the project whose source imports the package, a subpath included', () => {
        expect(importersInSources(maps, '@excalidraw/mermaid-to-excalidraw')).toEqual([
            'src/hooks/useTextGeneration.ts',
        ]);
    });

    /** An `import()` is already the cut: naming the file that has one sends somebody to change nothing. */
    it('leaves out a file that already imports it lazily', () => {
        expect(importersInSources(maps, '@excalidraw/mermaid-to-excalidraw')).not.toContain('src/lazy.ts');
    });

    it('does not take a package whose name merely starts the same', () => {
        expect(importersInSources(maps, '@excalidraw/mermaid')).toEqual([]);
        expect(importersInSources([map(['../src/a.ts'], ["import x from 'react-dom';"])], 'react')).toEqual([]);
    });
});
