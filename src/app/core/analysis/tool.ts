/**
 * What wrote the build: the bundler, and the framework above it.
 *
 * The report gives advice — "build with source maps", "split the dependencies into their own
 * chunk", "the console.log inside @angular/core" — and until 09/10/2026 it gave it in Vite's words
 * and Angular's to everybody. An Ember build read "`sourcemap: true` in Vite" and was told its
 * console calls might be Angular's. The tool is already in what is read: the reader knows when it
 * translated a webpack stats file or found Stencil's component list (`Metafile.builtBy`), and the
 * source paths name the framework's packages. Nothing here is asked of the person.
 *
 * `null` in either half when nothing says it: the advice then names the common tools, as before.
 */

import { packageOf } from '../format/format.utils';
import { type Bundler, type Framework, type Metafile } from './metafile.types';

export interface BuildTool {
    bundler: Bundler | null;
    framework: Framework | null;
}

/** How each name is written for a person. */
export const TOOL_NAMES: Record<Bundler | Framework, string> = {
    esbuild: 'esbuild',
    webpack: 'webpack',
    vite: 'Vite',
    rollup: 'Rollup',
    requirejs: 'RequireJS',
    angular: 'Angular',
    react: 'React',
    vue: 'Vue',
    svelte: 'Svelte',
    sveltekit: 'SvelteKit',
    nuxt: 'Nuxt',
    sapper: 'Sapper',
    stencil: 'Stencil',
    ember: 'Ember',
    polymer: 'Polymer',
    preact: 'Preact',
    solid: 'Solid',
    next: 'Next.js',
};

/**
 * Packages that name a framework, the more specific first: a SvelteKit app ships `svelte` too, a
 * Nuxt app `vue`, a Next.js app `react`. The first one found in the order of this list wins.
 */
const FRAMEWORK_PACKAGES: readonly [string, Framework][] = [
    ['@angular/core', 'angular'],
    ['@sveltejs/kit', 'sveltekit'],
    ['@sapper/app', 'sapper'],
    ['@sapper/internal', 'sapper'],
    ['nuxt', 'nuxt'],
    ['next', 'next'],
    ['@stencil/core', 'stencil'],
    ['ember-source', 'ember'],
    ['@ember/component', 'ember'],
    ['@glimmer/runtime', 'ember'],
    ['@polymer/polymer', 'polymer'],
    ['@polymer/lit-element', 'polymer'],
    ['preact', 'preact'],
    ['solid-js', 'solid'],
    ['react-dom', 'react'],
    ['vue', 'vue'],
    ['svelte', 'svelte'],
];

/** A file of the bundler's own, which only it puts in a build. */
const BUNDLER_FILES: readonly [RegExp, Bundler][] = [
    [/vite\/(?:preload-helper|modulepreload-polyfill)/, 'vite'],
    [/node_modules\/webpack\/(?:runtime|buildin|bootstrap)/, 'webpack'],
];

/** The tool as a person reads it — `Stencil + Rollup`, `Angular + webpack` — or `null` when nothing said. */
export const toolLabel = (tool: BuildTool): string | null => {
    const names = [tool.framework, tool.bundler].filter(name => name !== null).map(name => TOOL_NAMES[name]);
    return names.length > 0 ? names.join(' + ') : null;
};

export const toolOf = (meta: Metafile): BuildTool => {
    const inputs = Object.keys(meta.inputs);
    const packages = new Set(inputs.map(path => packageOf(path)).filter(name => name !== null));
    const found = FRAMEWORK_PACKAGES.find(([name]) => packages.has(name))?.[1] ?? null;
    const bundled = BUNDLER_FILES.find(([file]) => inputs.some(path => file.test(path)))?.[1] ?? null;

    // A metafile somebody else wrote is esbuild's: Angular's application builder and plain esbuild
    // are the two that write one. What a reader of Loadline's made says what it read.
    const said = meta.builtBy;
    const bundler = said?.bundler ?? bundled ?? (meta.readFrom ? null : 'esbuild');
    return { bundler, framework: found ?? said?.framework ?? null };
};
