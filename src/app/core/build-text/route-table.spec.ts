import { describe, expect, it } from 'vitest';
import { isRouteKey, routeBefore, routeKeyPattern, routeLabel, sapperRoutesIn } from './route-table';

/** The route of the first `import(` in a piece of minified code, as the folder reader asks for it. */
const routeOf = (code: string) => routeBefore(code, code.indexOf('import('));

/** Each shape is copied from a real build of the router it names, minified the way it shipped. */
describe('routeBefore', () => {
    it('reads vue-router: a path, a name and the component', () => {
        expect(
            routeOf(
                'routes:[{name:`global-feed`,path:`/`,component:()=>Q(()=>import(`./Home-C.js`),__vite__mapDeps([0]))}',
            ),
        ).toEqual({
            path: '/',
            name: 'global-feed',
        });
    });

    /** Nuxt writes `meta` between the path and the component, with braces and parentheses of its own. */
    it('skips what sits between the path and the component', () => {
        const nuxt =
            '{name:`type-id`,path:`/:type()/:id()`,meta:{key:e=>e.fullPath,validate:({params:e})=>`type`in e},component:()=>z(()=>import(`./48z.js`)';

        expect(routeOf(nuxt)).toEqual({ path: '/:type/:id', name: 'type-id' });
    });

    it('reads Angular, where a route has a path and no name', () => {
        expect(routeOf('{path:"settings",loadComponent:()=>import("./chunk-H.js"),canActivate:[y]}')).toEqual({
            path: 'settings',
            name: null,
        });
    });

    it('reads svelte-spa-router, where the path is the key of the route', () => {
        expect(
            routeOf('const HB={"/pbinstal/:token":Tn({asyncComponent:()=>Wt(()=>import("./PageInstaller-C.js")'),
        ).toEqual({
            path: '/pbinstal/:token',
            name: null,
        });
    });

    /** The three things that are lazy and are not routes, each from a real build. */
    it('is not fooled by a language file, a tab or an async component', () => {
        // Nuxt i18n: a key that loads, and no path.
        expect(
            routeOf('"ru-RU":[{key:`locale_ru`,load:()=>z(()=>import(`./Bfy.js`),[],import.meta.url),cache:!0}]'),
        ).toBeNull();
        // PocketBase's documentation tabs: a component, a label, and no path.
        expect(routeOf('{list:{label:"List/Search",component:Wt(()=>import("./ListApiDocs-B.js")')).toBeNull();
        // An async component inside a page.
        expect(
            routeOf('async function b(){const{default:$}=await import("./FilterAutocompleteInput-B.js")}'),
        ).toBeNull();
    });

    /** The route before this one has a path too; it is not this route's. */
    it('never takes the path of the previous route', () => {
        const code = '[{path:"a",component:A},{name:"b",component:()=>import("./b.js")}]';

        expect(routeOf(code)).toBeNull();
    });
});

describe('routeLabel', () => {
    it('names a route by its name, then by its path, and the empty path as the index', () => {
        expect(routeLabel({ path: '/orders', name: 'order-list' })).toBe('order-list');
        expect(routeLabel({ path: '/orders', name: null })).toBe('/orders');
        expect(routeLabel({ path: '', name: null })).toBe('/');
    });
});

describe('the keys of a route table', () => {
    it("reads React Router's getComponent", () => {
        expect(routeOf('{path:"/admin",getComponent:()=>import("./admin-1a2b3c4d.js")}')).toEqual({
            path: '/admin',
            name: null,
        });
    });

    /**
     * A router that hands a route its chunk under another word loses the table, and every lazy chunk
     * becomes a screen. `build.routeKeys` names the word, and only property names get into the pattern.
     */
    it('takes the keys build.routeKeys adds, and nothing that is not a property name', () => {
        const code = '{path:"/orders",page:()=>import("./orders-1a2b3c4d.js")}';
        const at = code.indexOf('import(');

        expect(routeBefore(code, at)).toBeNull();
        expect(routeBefore(code, at, routeKeyPattern(['page']))).toEqual({ path: '/orders', name: null });
        expect(isRouteKey('page')).toBe(true);
        expect(isRouteKey('a|b')).toBe(false);
        expect(routeKeyPattern(['a|b(']).source).not.toContain('a|b(');
    });
});

/** Sapper's manifest from the build of sveltejs/realworld at `c4f895c`, cut to four components. */
describe('sapperRoutesIn', () => {
    const manifest = String.raw`se=[{js:()=>import("./index.e902f999.js"),css:["chunk.ea3ca6d4.css"]},{js:()=>import("./index.a1e5bc4b.js"),css:["chunk.ea3ca6d4.css"]},{js:()=>import("./[slug].df9e6d95.js"),css:[]},{js:()=>import("./[view].c3bb4539.js"),css:[]}],re=(e=>[{pattern:/^\/$/,parts:[{i:0}]},{pattern:/^\/register\/?$/,parts:[{i:1}]},{pattern:/^\/article\/([^\/]+?)\/?$/,parts:[null,{i:2,params:t=>({slug:e(t[1])})}]},{pattern:/^\/profile\/([^\/]+?)\/([^\/]+?)\/?$/,parts:[null,null,{i:3,params:t=>({user:e(t[1]),view:e(t[2])})}]}])(decodeURIComponent);function ne(e){return{i:1}}`;

    it('names each page by the path of its route, its groups by their parameters', () => {
        expect(sapperRoutesIn(manifest)).toEqual([
            { specifier: './index.e902f999.js', route: { path: '/', name: null } },
            { specifier: './index.a1e5bc4b.js', route: { path: '/register', name: null } },
            { specifier: './[slug].df9e6d95.js', route: { path: '/article/[slug]', name: null } },
            { specifier: './[view].c3bb4539.js', route: { path: '/profile/[user]/[view]', name: null } },
        ]);
    });

    /** A layout is a part before the page; the route opens the last one. */
    it('takes the page, not the layout in front of it', () => {
        const code = String.raw`[{js:()=>import("./_layout.1a2b3c4d.js")},{js:()=>import("./[p].fefc6f77.js")}],{pattern:/^\/([^\/]+?)\/?$/,parts:[{i:0},{i:1,params:t=>({p:e(t[1])})}]}`;

        expect(sapperRoutesIn(code)).toEqual([{ specifier: './[p].fefc6f77.js', route: { path: '/[p]', name: null } }]);
    });

    it('reads nothing where there is no manifest', () => {
        expect(sapperRoutesIn(String.raw`const te=[/^\/auth\/login\/?$/];import("./a.js")`)).toEqual([]);
    });
});
