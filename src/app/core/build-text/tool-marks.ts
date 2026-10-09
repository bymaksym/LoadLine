/**
 * What a build's own files say about the tool that wrote it, read by the folder reader for the
 * advice the report gives (`analysis/tool.ts`), and the one thing a tool writes that changes how a
 * folder is read: Stencil's list of components.
 */

import { type Metafile } from '../analysis/metafile.types';

type BuiltBy = NonNullable<Metafile['builtBy']>;

/**
 * Stencil's list of lazy components, which its loader carries in the entry: `["p-w91mnxr1",[[1,
 * "app-home"]]]` — the id of a chunk, `<id>.entry.js`, and the first custom element it defines. It is
 * read the way a router's table is: the components are what gets loaded on demand and are named by
 * their tag, and what the loader fetches that is not in the list — the polyfills for browsers
 * without custom elements or CSS variables — is no component. A Stencil app listed twelve screens
 * named `p-qidxadfy.entry`, three of them its polyfills.
 */
const STENCIL_COMPONENT = /\["([\w-]+)",\[\[\d+,"([a-z]\w*-[\w-]*)"/g;

/** The components Stencil's loader lists in a chunk: the id of each chunk and its first tag. */
export const stencilComponentsIn = (code: string): { id: string; tag: string }[] =>
    [...code.matchAll(STENCIL_COMPONENT)].map(([, id = '', tag = '']) => ({ id, tag }));

/**
 * What a chunk says about the tool that wrote it, for the advice the report gives (`analysis/tool.ts`).
 * Each is something only that tool writes: Vite's preload helper, and the attribute Angular's
 * runtime sets on every root element. A folder with source maps names the packages anyway; these
 * are for one without.
 */
const VITE_MARK = /__vitePreload|__vite__mapDeps|vite\/modulepreload-polyfill/;
const ANGULAR_MARK = /["']ng-version["']/;

/** What one chunk says: `stencil` when it carried Stencil's list of components. */
export const toolsIn = (code: string, stencil: boolean): BuiltBy => ({
    ...(VITE_MARK.test(code) && { bundler: 'vite' as const }),
    ...(stencil && { framework: 'stencil' as const, bundler: 'rollup' as const }),
    ...(ANGULAR_MARK.test(code) && { framework: 'angular' as const }),
});

/**
 * What the page says about the tool, for the frameworks whose page carries their name: Sapper's and
 * Nuxt's state, SvelteKit's start-up, the meta every Ember app has, and Polymer's loader.
 */
const PAGE_MARKS: readonly [RegExp, BuiltBy][] = [
    [/__SAPPER__/, { framework: 'sapper', bundler: 'rollup' }],
    [/__NUXT__|\/_nuxt\//, { framework: 'nuxt', bundler: 'vite' }],
    [/__sveltekit/, { framework: 'sveltekit', bundler: 'vite' }],
    [/<meta name="[\w-]+\/config\/environment"/, { framework: 'ember' }],
    [/webcomponents-loader\.js|@webcomponents\/webcomponentsjs/, { framework: 'polymer' }],
];

/** The tool, from the page first and then from the chunks; the page names the framework more surely. */
export const builtByOf = (html: string | null, chunks: readonly BuiltBy[]): BuiltBy => {
    const page = PAGE_MARKS.find(([mark]) => html !== null && mark.test(html))?.[1] ?? {};
    const bundler = page.bundler ?? chunks.find(tools => tools.bundler)?.bundler;
    const framework = page.framework ?? chunks.find(tools => tools.framework)?.framework;
    return { ...(bundler && { bundler }), ...(framework && { framework }) };
};
