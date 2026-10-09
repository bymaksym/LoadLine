/**
 * The route table a router keeps in the code, read where each lazy route names its chunk.
 *
 * Every router that splits by route writes the same shape: an object with a `path` and a key whose
 * value imports the chunk — `component: () => import('./Home.js')` in vue-router and Nuxt,
 * `loadComponent` and `loadChildren` in Angular, `lazy` and `getComponent` in React Router,
 * `asyncComponent` under a path written as the key in svelte-spa-router. A router that uses another
 * word is named in `build.routeKeys` of `loadline.json`. Minifiers keep the keys,
 * because they are the router's API. What that gives the report is the one thing the files alone
 * cannot: which lazy chunks are places somebody navigates to. A language file Nuxt loads with
 * `load: () => import(…)`, a tab of documentation behind `{ label, component }` with no path, an
 * async component inside a page — all of those are lazy and none of them is a screen, and without
 * source maps the report used to list them as screens named after hashes.
 */

/** One route of the table: its path and, when the router names it, its name. */
export interface RouteRef {
    path: string;
    name: string | null;
}

/** The keys that hand a router the chunk of a route. */
const ROUTE_KEYS = new Set(['component', 'loadComponent', 'loadChildren', 'lazy', 'getComponent', 'asyncComponent']);

/** What a key of `build.routeKeys` may be: a property name a minifier keeps as it is written. */
export const isRouteKey = (key: string): boolean => /^[A-Z_$][\w$]*$/i.test(key);

/**
 * The keys as one pattern, with the ones `build.routeKeys` adds. Only property names get in
 * (`isRouteKey`), so the pattern is an alternation of words and stays linear.
 */
export const routeKeyPattern = (extra: readonly string[] = []): RegExp => {
    const keys = [...ROUTE_KEYS, ...extra.filter(key => isRouteKey(key) && !ROUTE_KEYS.has(key))];
    return new RegExp(
        String.raw`(?<![\w$])(?:${keys.map(key => key.replaceAll('$', String.raw`\$`)).join('|')})\s*:`,
        'g',
    );
};

const ROUTE_KEY = routeKeyPattern();

/** `path: '…'` or `name: '…'` at the top level of the object, in any of the three quotes. */
const ROUTE_FIELD = /[,{]\s*(path|name)\s*:\s*(['"`])([^'"`]*)\2/g;

/**
 * The path as the key of the route, the way svelte-spa-router writes its table: `"/users/:id":
 * wrap({`, read off the end of what comes before the object. It has to start with a slash, or any
 * `{ component }` inside any object property would be a route.
 */
const KEYED_PATH = /(['"`])(\/[^'"`]*)\1\s*:\s*(?:[\w$.]+\s*)?\(\s*$/;

/** How far back a route object can start. A route with guards, meta and a validator fits in this. */
const WINDOW = 800;

/** How far the import can be from its key: `component: () => Q(() => import(` and nothing longer. */
const KEY_REACH = 80;

const OPEN = new Set(['{', '(', '[']);
const CLOSE = new Set(['}', ')', ']']);

/**
 * The route whose key imports at `index`, or `null` when that import is not a route's.
 *
 * The object is walked back from the key, counting braces, so `meta: { … }` in between is skipped
 * and a `path` of the route before this one is never taken for this one's. Bounded both ways, so a
 * bundle of several megabytes costs a fixed amount per lazy import and nothing more.
 */
export const routeBefore = (code: string, index: number, keys: RegExp = ROUTE_KEY): RouteRef | null => {
    const start = Math.max(0, index - WINDOW);
    const window = code.slice(start, index);

    let key = -1;
    for (const match of window.matchAll(keys)) {
        key = match.index;
    }
    if (key === -1 || window.length - key > KEY_REACH) {
        return null;
    }

    // Back to the brace that opens this route, keeping only what sits at its own level.
    let depth = 0;
    let open = -1;
    const level: string[] = [];
    for (let position = key - 1; position >= 0; position--) {
        const char = window[position] ?? '';
        if (CLOSE.has(char)) {
            depth++;
        } else if (OPEN.has(char)) {
            if (depth === 0) {
                open = position;
                break;
            }
            depth--;
        } else if (depth === 0) {
            level.push(char);
        }
    }
    if (open === -1 || window[open] !== '{') {
        return null;
    }

    const own = `{${level.toReversed().join('')}`;
    let path: string | null = null;
    let name: string | null = null;
    for (const [, field, , value = ''] of own.matchAll(ROUTE_FIELD)) {
        if (field === 'path') {
            path = value;
        } else {
            name = value;
        }
    }
    path ??= KEYED_PATH.exec(window.slice(Math.max(0, open - 200), open))?.[2] ?? null;
    return path === null ? null : { path, name: name || null };
};

/** What a screen is called by its routes: the router's name for it, or its path. */
export const routeLabel = (route: RouteRef): string => route.name ?? (route.path === '' ? '/' : route.path);

/**
 * Sapper's table, which has none of the shapes above. Its manifest is two lists: the components,
 * `{js:()=>import("./index.e902f999.js"),css:[…]}`, and the routes, each a regular expression and the
 * components of its layouts and its page by their place in the first list:
 * `{pattern:/^\/profile\/([^\/]+?)\/?$/,parts:[null,{i:5,params:t=>({user:e(t[1])})}]}`. Without it,
 * a build without source maps had seven screens named `index` and told them apart by their hashes.
 */
const SAPPER_COMPONENT = /\bjs\s*:\s*\(\s*\)\s*=>\s*import\(\s*(["'`])([^"'`]+)\1\s*\)/g;

/** A route of the table, up to its parts: the source of the expression, escapes kept. */
const SAPPER_ROUTE = /\bpattern\s*:\s*\/\^((?:[^\n/\\]|\\.)*)\/[a-z]*\s*,\s*parts\s*:\s*\[/g;

/** A part of a route: `i:5`, the place of its component. The last one is the page. */
const SAPPER_PART = /\bi\s*:\s*(\d+)/g;

/** A parameter of a route, `user:e(t[1])`: its name and the group of the expression it is read from. */
const SAPPER_PARAM = /([\w$]+)\s*:\s*[\w$]+\(\s*[\w$]+\[(\d+)\]\s*\)/g;

/**
 * A group of the expression, `([^\/]+?)`, with the escapes and the character classes inside it read
 * whole so a `)` in them does not end it. Sapper writes no group inside another.
 */
const SAPPER_GROUP = /\((?:\\.|\[(?:\\.|[^\\\]])*\]|[^()[\\])*\)/g;

/** How far after its expression the parts of a route can be: a route with three parameters fits. */
const PARTS_REACH = 400;

/**
 * The path a route's expression matches, with each group named by its parameter, the way Sapper's
 * files are named: `^\/article\/([^\/]+?)\/?$` is `/article/[slug]`.
 */
const sapperPath = (source: string, params: ReadonlyMap<number, string>): string => {
    let group = 0;
    const path = source
        .replaceAll(SAPPER_GROUP, () => {
            group += 1;
            return `[${params.get(group) ?? group}]`;
        })
        // An escape is the character it escapes; `$` is the end and `?` the optional slash before it.
        .replaceAll(/\\(.)|[$?]/g, (_, escaped: string | undefined) => escaped ?? '');
    // What is left of the ending `\/?$` is that slash, which no route is called by.
    return path.length > 1 ? path.replace(/\/$/, '') : path;
};

/**
 * The parts of a route, from after `parts:[` to the bracket that closes the list, so that what the
 * last route is read from ends where the table does and not in the code after it.
 */
const partsAfter = (code: string, start: number): string => {
    let depth = 1;
    const end = Math.min(code.length, start + PARTS_REACH);
    for (let at = start; at < end; at++) {
        const char = code[at] ?? '';
        if (OPEN.has(char)) {
            depth++;
        } else if (CLOSE.has(char) && --depth === 0) {
            return code.slice(start, at);
        }
    }
    return '';
};

/** The routes of Sapper's manifest in a chunk, by the specifier of the page each one opens. */
export const sapperRoutesIn = (code: string): { specifier: string; route: RouteRef }[] => {
    const routes = [...code.matchAll(SAPPER_ROUTE)];
    if (routes.length === 0) {
        return [];
    }
    const components = [...code.matchAll(SAPPER_COMPONENT)].map(match => match[2] ?? '');

    return routes.flatMap(match => {
        const parts = partsAfter(code, match.index + match[0].length);
        const page = [...parts.matchAll(SAPPER_PART)].at(-1)?.[1];
        const specifier = page === undefined ? undefined : components[Number(page)];
        if (specifier === undefined) {
            return [];
        }
        const params = new Map([...parts.matchAll(SAPPER_PARAM)].map(([, name = '', group]) => [Number(group), name]));
        return [{ specifier, route: { path: sapperPath(match[1] ?? '', params), name: null } }];
    });
};
