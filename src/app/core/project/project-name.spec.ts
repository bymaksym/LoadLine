import { describe, expect, it } from 'vitest';
import { titleIn } from '../build-text/index-html';
import { projectNameOf } from './project-name';

describe('projectNameOf', () => {
    /**
     * The same build was "Esail IT Solutions" without `--project` and "control-horario-angular" with
     * it: the package name came first and is only known with the flag. The title is in the build.
     */
    it("takes the page's title first, so --project does not change the name", () => {
        const title = { pageTitle: 'Esail IT Solutions', folder: 'browser' };
        expect(projectNameOf(title)).toBe('Esail IT Solutions');
        expect(projectNameOf({ ...title, packageName: 'control-horario-angular' })).toBe('Esail IT Solutions');
    });

    it('takes the package name when the title is missing or is the template one', () => {
        expect(projectNameOf({ packageName: 'conduit', angularProject: 'app' })).toBe('conduit');
        expect(projectNameOf({ packageName: 'shop', pageTitle: 'Vite + React + TS' })).toBe('shop');
        expect(projectNameOf({ packageName: 'shop', pageTitle: 'React App' })).toBe('shop');
    });

    /** Without context files — which almost nobody loads — the build still says what it is. */
    it("falls back to the page's title, then to the folder", () => {
        expect(projectNameOf({ pageTitle: 'Excalidraw Whiteboard', folder: 'excalidraw-app/build' })).toBe(
            'Excalidraw Whiteboard',
        );
        expect(projectNameOf({ folder: 'dist/angular-conduit/browser' })).toBe('angular-conduit');
        expect(projectNameOf({ folder: 'dist/angular-conduit/stats.json' })).toBe('angular-conduit');
    });

    it("says nothing rather than naming a project after the build tool's folder", () => {
        expect(projectNameOf({ folder: 'dist' })).toBeNull();
        expect(projectNameOf({ folder: '.output/public' })).toBeNull();
        expect(projectNameOf({})).toBeNull();
    });
});

describe('titleIn', () => {
    it('reads the title, with its entities and its whitespace tidied', () => {
        expect(titleIn('<head><title>\n  Tom &amp; Jerry  </title></head>')).toBe('Tom & Jerry');
    });

    it('says nothing for a page with no title, or an empty one', () => {
        expect(titleIn('<head></head>')).toBeNull();
        expect(titleIn('<title> </title>')).toBeNull();
    });
});
