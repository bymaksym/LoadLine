/**
 * The advice that depends on the tool that wrote the build, in its own words.
 *
 * Each signal used to name Vite and Angular side by side — "`sourcemap: true` in Vite, `"sourceMap":
 * true` in Angular" — which is right for two tools and noise for the rest: an Ember build was told
 * to edit a Vite config it does not have. With the tool known (`analysis/tool.ts`) the advice is the
 * one line that applies; without it, it is the two common ones, as before.
 */

import { type BuildTool } from '../../analysis/tool';
import { type Lang } from '../../i18n/ui-strings';
import { mono } from './finding-html';

/** One instruction: what to write, and where, in each language. */
interface Setting {
    code: string;
    where: Record<Lang, string>;
}

type Key = NonNullable<BuildTool['framework']> | NonNullable<BuildTool['bundler']>;

const VITE_CONFIG = { en: 'vite.config', es: 'vite.config' };

/** Source maps on. */
const MAPS: Partial<Record<Key, Setting>> = {
    angular: { code: '"sourceMap": true', where: { en: 'angular.json', es: 'angular.json' } },
    nuxt: { code: 'sourcemap: { client: true }', where: { en: 'nuxt.config', es: 'nuxt.config' } },
    stencil: {
        code: 'sourceMap: true',
        where: { en: 'stencil.config.ts (Stencil 2 or later)', es: 'stencil.config.ts (Stencil 2 o posterior)' },
    },
    ember: { code: 'sourcemaps: { enabled: true }', where: { en: 'ember-cli-build.js', es: 'ember-cli-build.js' } },
    sapper: {
        code: 'output.sourcemap: true',
        where: { en: 'the client of rollup.config.js', es: 'el client de rollup.config.js' },
    },
    vite: { code: 'build.sourcemap: true', where: VITE_CONFIG },
    webpack: {
        code: "devtool: 'source-map'",
        where: { en: 'the webpack configuration', es: 'la configuración de webpack' },
    },
    rollup: { code: 'output.sourcemap: true', where: { en: 'rollup.config.js', es: 'rollup.config.js' } },
    esbuild: { code: '--sourcemap', where: { en: 'the esbuild command', es: 'el comando de esbuild' } },
};

/** Source maps written but not linked from the bundle: for an error tool, not for the public. */
const HIDDEN_MAPS: Partial<Record<Key, Setting>> = {
    angular: {
        code: '"sourceMap": { "scripts": true, "hidden": true }',
        where: { en: 'angular.json', es: 'angular.json' },
    },
    nuxt: { code: "sourcemap: { client: 'hidden' }", where: { en: 'nuxt.config', es: 'nuxt.config' } },
    sapper: { code: "output.sourcemap: 'hidden'", where: { en: 'rollup.config.js', es: 'rollup.config.js' } },
    vite: { code: "build.sourcemap: 'hidden'", where: VITE_CONFIG },
    webpack: {
        code: "devtool: 'hidden-source-map'",
        where: { en: 'the webpack configuration', es: 'la configuración de webpack' },
    },
    rollup: { code: "output.sourcemap: 'hidden'", where: { en: 'rollup.config.js', es: 'rollup.config.js' } },
    esbuild: { code: '--sourcemap=external', where: { en: 'the esbuild command', es: 'el comando de esbuild' } },
};

/** The framework's own setting first — Angular on webpack is still `angular.json` — then the bundler's. */
const settingFor = (table: Partial<Record<Key, Setting>>, tool: BuildTool | undefined): Setting | null =>
    (tool?.framework ? table[tool.framework] : undefined) ?? (tool?.bundler ? table[tool.bundler] : undefined) ?? null;

const said = (setting: Setting, lang: Lang): string =>
    `${mono(setting.code)} ${lang === 'es' ? 'en' : 'in'} ${setting.where[lang]}`;

/** "`build.sourcemap: true` in vite.config", or the two common ones when the tool is not known. */
export const mapsOn = (tool: BuildTool | undefined, lang: Lang): string => {
    const setting = settingFor(MAPS, tool);
    if (setting) {
        return said(setting, lang);
    }
    return lang === 'es'
        ? `${mono('sourcemap: true')} en Vite, ${mono('"sourceMap": true')} en Angular`
        : `${mono('sourcemap: true')} in Vite, ${mono('"sourceMap": true')} in Angular`;
};

/** The same for maps generated without being linked. */
export const mapsHidden = (tool: BuildTool | undefined, lang: Lang): string => {
    const setting = settingFor(HIDDEN_MAPS, tool);
    if (setting) {
        return said(setting, lang);
    }
    return lang === 'es'
        ? `${mono('"sourceMap": { "scripts": true, "hidden": true }')} en Angular, ${mono("build.sourcemap: 'hidden'")} en Vite`
        : `${mono('"sourceMap": { "scripts": true, "hidden": true }')} in Angular, ${mono("build.sourcemap: 'hidden'")} in Vite`;
};

/** Whether the build may be Angular's, which ships a `console` call in every build there is. */
export const mayBeAngular = (tool: BuildTool | undefined): boolean => !tool?.framework || tool.framework === 'angular';

/**
 * How a webpack build splits its dependencies out, said first when the build is webpack's: the
 * `manualChunks` the rest of the advice names is Rollup's. Angular up to 16 builds with webpack and
 * has an option of its own for it.
 */
export const webpackSplit = (tool: BuildTool | undefined, lang: Lang): string => {
    if (tool?.bundler !== 'webpack') {
        return '';
    }
    if (tool.framework === 'angular') {
        return lang === 'es'
            ? `con ${mono('"vendorChunk": true')} en angular.json, que el browser builder de Angular 16 o anterior tiene para eso; `
            : `with ${mono('"vendorChunk": true')} in angular.json, which the browser builder of Angular 16 or earlier has for it; `;
    }
    return lang === 'es'
        ? `en webpack con un grupo de ${mono('optimization.splitChunks.cacheGroups')} para ${mono('node_modules')}; `
        : `in webpack with a group of ${mono('optimization.splitChunks.cacheGroups')} for ${mono('node_modules')}; `;
};
