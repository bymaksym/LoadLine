import { describe, expect, it } from 'vitest';
import { mapsOn } from '../findings/text/tool-advice';
import { type Metafile } from './metafile.types';
import { toolLabel, toolOf } from './tool';

/** A metafile Loadline read out of a folder when `builtBy` is given, one esbuild wrote when not. */
const metafile = (inputs: string[], builtBy?: Metafile['builtBy']): Metafile => ({
    inputs: Object.fromEntries(inputs.map(path => [path, { bytes: 1 }])),
    outputs: {},
    ...(builtBy && { builtBy, readFrom: 'folder' as const }),
});

describe('toolOf', () => {
    it('reads a metafile nobody else wrote as esbuild, and the framework from its packages', () => {
        expect(toolOf(metafile(['src/main.ts', 'node_modules/@angular/core/fesm2022/core.mjs']))).toEqual({
            bundler: 'esbuild',
            framework: 'angular',
        });
    });

    it('names the more specific framework: SvelteKit ships svelte, Nuxt ships vue', () => {
        const kit = metafile(['node_modules/svelte/internal.js', 'node_modules/@sveltejs/kit/src/runtime.js'], {});
        const nuxt = metafile(['node_modules/vue/index.mjs', 'node_modules/nuxt/dist/app/entry.js'], {});

        expect(toolOf(kit).framework).toBe('sveltekit');
        expect(toolOf(nuxt).framework).toBe('nuxt');
    });

    it('takes what the reader said when the packages say nothing, and the packages over it when they do', () => {
        expect(toolOf(metafile(['p-a1b2.entry.js'], { bundler: 'rollup', framework: 'stencil' }))).toEqual({
            bundler: 'rollup',
            framework: 'stencil',
        });
        expect(toolOf(metafile(['node_modules/react-dom/index.js'], { bundler: 'webpack' }))).toEqual({
            bundler: 'webpack',
            framework: 'react',
        });
    });

    it('says nothing of a folder that said nothing', () => {
        const tool = toolOf(metafile(['main-1a2b3c4d.js'], {}));

        expect(tool).toEqual({ bundler: null, framework: null });
        expect(toolLabel(tool)).toBeNull();
    });
});

describe('the advice in the words of the tool', () => {
    it('names the one setting that applies, framework first', () => {
        expect(mapsOn({ bundler: 'webpack', framework: 'angular' }, 'en')).toContain('angular.json');
        expect(mapsOn({ bundler: null, framework: 'ember' }, 'en')).toContain('ember-cli-build.js');
        expect(mapsOn({ bundler: 'webpack', framework: 'react' }, 'es')).toContain('configuración de webpack');
    });

    it('names the two common ones when the tool is not known', () => {
        const advice = mapsOn({ bundler: null, framework: null }, 'en');

        expect(advice).toContain('Vite');
        expect(advice).toContain('Angular');
    });
});
