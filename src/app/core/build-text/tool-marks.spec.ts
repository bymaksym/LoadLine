import { describe, expect, it } from 'vitest';
import { builtByOf, stencilComponentsIn, toolsIn } from './tool-marks';

describe('stencilComponentsIn', () => {
    /** As Stencil 1.8 writes it in `app.esm.js`: an id, and the components the chunk defines. */
    it('reads the id of each chunk and the first tag it defines', () => {
        const loader =
            'o([["p-w91mnxr1",[[1,"app-home"]]],["p-qidxadfy",[[1,"app-root"],[0,"stencil-route",{group:[513]}]]]],t)';

        expect(stencilComponentsIn(loader)).toEqual([
            { id: 'p-w91mnxr1', tag: 'app-home' },
            { id: 'p-qidxadfy', tag: 'app-root' },
        ]);
    });

    it('takes no array of strings for a list of components: a tag has a hyphen', () => {
        expect(stencilComponentsIn('x=[["en",[[1,"english"]]]]')).toEqual([]);
    });
});

describe('what the files say about the tool', () => {
    it("reads Vite's preload helper and Angular's root attribute in a chunk", () => {
        expect(toolsIn('const __vitePreload=function(e,t){};', false)).toEqual({ bundler: 'vite' });
        expect(toolsIn('e.setAttribute("ng-version","17.3.0")', false)).toEqual({ framework: 'angular' });
        expect(toolsIn('', true)).toEqual({ framework: 'stencil', bundler: 'rollup' });
    });

    it('takes the framework from the page before the chunks', () => {
        const ember = '<meta name="conduit/config/environment" content="%7B%7D">';

        expect(builtByOf(ember, [{ bundler: 'vite' }])).toEqual({ bundler: 'vite', framework: 'ember' });
        expect(builtByOf('<script>__SAPPER__={}</script>', [])).toEqual({ framework: 'sapper', bundler: 'rollup' });
        expect(builtByOf(null, [{}, { framework: 'angular' }])).toEqual({ framework: 'angular' });
    });
});
