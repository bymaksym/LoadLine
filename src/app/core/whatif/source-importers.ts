/**
 * Which files of the project import a package, read from the sources the maps carry.
 *
 * A build folder records which chunk holds what and never which file imports which: the bundler
 * erased the `import` statements. The maps keep the original text of every file, though, and the
 * statement is in it. So for a Vite, Rollup or Nuxt build — which write no stats file — "why is
 * this package in my first load, and where would I cut it?" had the answer "the chain needs the
 * stats.json" while the line that brings the package in was sitting in the folder.
 */

import { projectRootsOf, sourcePathOf } from '../analysis/sourcemap/sourcemap';
import { isDependency } from '../format/ownership';
import { asArray, asRecord, asText } from '../json/json.utils';

/** A package name as a literal inside a pattern: `@scope/name` and dots taken literally. */
const escape = (name: string): string => name.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);

/**
 * `from 'pkg'`, `import 'pkg'` and `require('pkg')`, with or without a subpath: the imports that
 * bring a package in with the file. Not `import('pkg')`, which is already the cut — Excalidraw's
 * clipboard and dialog both use one, and named next to the one static import that does put mermaid
 * in the first load, they sent the reader to the two files with nothing to change.
 *
 * Built per name, anchored on the quote, so it cannot wander across a file. `String.raw`, so every
 * backslash below is one the pattern sees.
 */
const QUOTE = '[\'"`]';
const NOT_QUOTE = String.raw`[^'"${'`'}\s]`;
const importOf = (name: string): RegExp =>
    new RegExp(
        `${String.raw`(?:\bfrom|\bimport|\brequire\s*\()\s*` + QUOTE + escape(name)}(?:/${NOT_QUOTE}*)?${QUOTE}`,
    );

export const importersInSources = (maps: readonly { text: string }[], name: string): string[] => {
    const pattern = importOf(name);
    const read = maps.map(map => {
        try {
            const parsed = asRecord(JSON.parse(map.text));
            return {
                sources: (asArray(parsed?.['sources']) ?? []).map(source => asText(source) ?? ''),
                contents: (asArray(parsed?.['sourcesContent']) ?? []).map(content => asText(content)),
            };
        } catch {
            return { sources: [], contents: [] };
        }
    });
    const roots = projectRootsOf(read.map(map => map.sources));

    const found = new Set<string>();
    for (const [index, { sources, contents }] of read.entries()) {
        for (const [position, source] of sources.entries()) {
            const content = contents[position];
            if (isDependency(source) || !content || !pattern.test(content)) {
                continue;
            }
            // The compiler's query is not a file of its own: `App.vue?vue&type=script` is `App.vue`.
            found.add(sourcePathOf(source, roots[index] ?? '').replace(/\?.*$/, ''));
        }
    }
    return [...found].toSorted((a, b) => a.localeCompare(b));
};
