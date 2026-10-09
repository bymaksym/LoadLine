/** Presentation helpers and metafile path normalisation. */

import { type Lang } from '../i18n/ui-strings';
import { declaredPackage, isDependency } from './ownership';

const KB = 1024;

/**
 * The language the figures are written in. It only decides the decimal separator, and it is set
 * once from outside — by `I18nService` when the language changes, by the command when it reads
 * `--lang` — because these helpers are called from everywhere and threading a language through
 * every call site would touch every table in the report to move one comma.
 */
const formatter = (lang: Lang): Intl.NumberFormat =>
    new Intl.NumberFormat(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The same thing for figures that are not sizes, where two decimals would be false precision. */
const counter = (lang: Lang): Intl.NumberFormat => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 });

const numbers = { lang: 'en' as Lang, decimals: formatter('en'), counts: counter('en'), unitSpace: ' ' };

export const setNumberLang = (lang: Lang): void => {
    if (lang === numbers.lang) {
        return;
    }

    numbers.lang = lang;
    numbers.decimals = formatter(lang);
    numbers.counts = counter(lang);
};

/**
 * What goes between a size and its unit. A plain space for the command, whose output is a terminal
 * and plain text. The page sets a narrow no-break space (U+202F): "736 kB" must never break across
 * two lines, and in the monospace face a full space reads as a double gap between figure and unit.
 */
export const setUnitSpace = (space: string): void => {
    numbers.unitSpace = space;
};

/**
 * Human-readable size. Stays in kB up to the megabyte so columns compare at a glance.
 *
 * The step is 1024, and the label is `kB` rather than `KiB` on purpose: Angular CLI prints its
 * budgets the same way, and this tool exists to be read next to those. Two labels for the same
 * figure would cost more than the pedantry gains.
 */
export const formatBytes = (bytes: number): string => {
    if (bytes >= KB * KB) {
        return `${numbers.decimals.format(bytes / KB / KB)}${numbers.unitSpace}MB`;
    }
    const space = numbers.unitSpace;
    return bytes >= KB ? `${Math.round(bytes / KB)}${space}kB` : `${bytes}${space}B`;
};

/**
 * Two sizes that have to read as different: a figure and the limit it broke. Rounded alike they
 * said "1 kB, over the 1 kB allowed" of 1,047 bytes against 1,024; then both are given in bytes.
 */
export const formatBytesApart = (actual: number, limit: number): [string, string] => {
    const [a, b] = [formatBytes(actual), formatBytes(limit)];
    return a === b && actual !== limit
        ? [`${formatCount(actual)}${numbers.unitSpace}B`, `${formatCount(limit)}${numbers.unitSpace}B`]
        : [a, b];
};

/**
 * A small figure that is not a size: releases a week, screens a session, times a week something
 * gets paid for.
 *
 * One decimal at most, and none when the number is whole. `4.00` reads as a precision none of
 * these have — most of them come from a band somebody picked out of four options — and the whole
 * value of showing them is that a reader can see how rough they are.
 */
export const formatCount = (value: number): string => numbers.counts.format(value);

/** Last segment of a path: `chunk-ABC.js`, `login.page.ts`. */
export const baseName = (path: string): string => path.split('/').pop() ?? path;

/**
 * Where Angular's own source maps point. Its packages are built with Bazel, and the maps they ship
 * name the file in the Bazel output folder, not in the package: once a build composes them, a file
 * of `@angular/forms` reads `node_modules/.pnpm/k8-fastbuild-ST-fdfa778d11ba/bin/packages/forms/…`
 * (`bin/src/material/…` for the components repo). Read like any other path, that is a package
 * called `.pnpm` — 72 kB of one real build's first load were — or, under npm, `k8-fastbuild-…`.
 * Only a build read through its source maps meets it: a stats file names the `.mjs` in the package.
 */
export const ANGULAR_BAZEL =
    /^.*node_modules\/(?:\.pnpm\/)?[\w-]+-(?:fastbuild|opt|dbg)(?:-ST-[\da-f]+)?\/bin\/(?:packages|src)\//;

/**
 * Strips the `node_modules` noise to leave the name a package is recognised by.
 * pnpm adds an extra segment (`.pnpm/pkg@version/node_modules/`) that has to be skipped first.
 */
export const shortName = (path: string): string => {
    // What is yours is named by its path, wherever it sits; what `loadline.json` calls a dependency
    // by the package it makes (`ownership.ts`).
    if (!isDependency(path)) {
        return path;
    }
    const declared = declaredPackage(path);
    if (declared) {
        return declared.rest ? `${declared.name}/${declared.rest}` : declared.name;
    }
    return path
        .replace(ANGULAR_BAZEL, '@angular/')
        .replace(/^.*node_modules\/\.pnpm\/[^/]+\/node_modules\//, '')
        .replace(/^.*node_modules\//, '');
};

/** Name of the npm package a path belongs to, or `null` if it is project code. */
export const packageOf = (path: string): string | null => {
    if (!isDependency(path)) {
        return null;
    }
    const declared = declaredPackage(path);
    if (declared) {
        return declared.name;
    }

    const short = shortName(path);
    const parts = short.split('/');
    const head = parts[0] ?? short;
    // A file straight in `node_modules/` or in a scope is a package of one file, resolved by name:
    // Sapper's `@sapper/app.mjs` is `@sapper/app`, not a package called `@sapper/app.mjs`.
    const scoped = head.startsWith('@');
    const name = scoped ? parts.slice(0, 2).join('/') : head;
    return parts.length === (scoped ? 2 : 1) ? name.replace(/\.[cm]?js$/, '') : name;
};

/**
 * An import chain as something a person reads: own files stay as paths, package files collapse to
 * the package name, and consecutive steps inside the same package become one.
 * `[main.ts, app.config.ts, node_modules/x/a.js, node_modules/x/b.js]` -> `[main.ts, app.config.ts, x]`
 */
export const chainSteps = (chain: string[]): string[] => {
    const steps: string[] = [];
    for (const file of chain) {
        const step = packageOf(file) ?? file;
        if (steps.at(-1) !== step) {
            steps.push(step);
        }
    }
    return steps;
};

/**
 * Folder names that say "the project's own code starts here" rather than naming a part of it.
 * They are looked for anywhere in the path, not only at the front, which is the whole point: in a
 * workspace the same file is at `apps/web/src/app/features/users/x.ts`.
 */
const SOURCE_ROOTS = new Set(['src', 'app', 'apps', 'lib', 'libs', 'source', 'packages', 'projects']);

/**
 * Project folder a source file is attributed to: `shared/enums`, `core/services`.
 *
 * It used to anchor at the start of the path (`src/`, `app/` or `lib/`) and fall back to the first
 * two segments. In a workspace nothing anchored, so **every** file of an application fell back to
 * the same two segments — `apps/web` — and the bootstrap breakdown by folder came out as a single
 * row while the signal that looks for a layer of yours in the bootstrap could not find one by
 * construction. Now the anchor is the innermost source root, wherever it sits.
 */
export const projectFolderOf = (path: string): string => {
    const parts = path.split('/');
    // The file itself never names the folder.
    const dirs = parts.slice(0, -1);
    if (dirs.length === 0) {
        return path;
    }

    let start = 0;
    for (const [index, part] of dirs.entries()) {
        if (SOURCE_ROOTS.has(part)) {
            start = index + 1;
        }
    }

    const inside = dirs.slice(start);
    if (inside.length >= 2) {
        return inside.slice(0, 2).join('/');
    }

    // A library whose code sits right under its own root has nothing two levels deep. What names
    // it is the library, which is on the other side of the root: `libs/shared/ui/src/lib/button`.
    const outside = dirs.slice(0, start).filter(part => !SOURCE_ROOTS.has(part));
    return [outside.at(-1), ...inside].filter(Boolean).join('/') || dirs.join('/');
};

/**
 * The suffixes a framework puts between the name and the extension. One list, because two of them
 * drifted apart: the screens table recognised `.view` and `.container` as views while the label
 * only knew how to strip `.page` and `.component`, so a screen in `user.view.ts` was listed as
 * `user.view`.
 */
export const VIEW_SUFFIXES = ['component', 'page', 'view', 'container'];
export const ROUTE_SUFFIXES = ['route', 'routes'];

/**
 * What a screen can be written in. Single-file components are here because two frameworks the tool
 * says it reads write them: without `vue` and `svelte`, every screen of a Vue application was
 * listed as `orders.page.vue`, extension and all.
 */
export const SOURCE_EXTENSION = '(?:[tj]sx?|vue|svelte)';

/**
 * What Angular up to 8 starts a lazy route at: `loadChildren: './article/article.module#…'` makes a
 * chunk of `article.module.ngfactory.js` (or of `article.module.ts` without AOT), and an Angular 8
 * build read through its webpack stats listed its screens as `article.module.ngfactory`. Only for
 * the name: a module is no view, and the rules that tell screens from pieces of them never read it.
 */
const LAZY_MODULE_SUFFIXES = [String.raw`module\.ngfactory`, 'module'];

const SUFFIX = new RegExp(
    String.raw`\.(?:${[...VIEW_SUFFIXES, ...ROUTE_SUFFIXES, ...LAZY_MODULE_SUFFIXES].join('|')})\.${SOURCE_EXTENSION}$`,
);
const EXTENSION = new RegExp(String.raw`\.${SOURCE_EXTENSION}$`);

/**
 * SvelteKit names a route file by its role and the route by its folder: `+page.svelte` in every
 * one of them. Left alone, three screens came out as three rows called `+page.svelte`.
 */
const ROLE_PREFIX = '+';

/** Folders that are the root of the routes rather than one route: there the file name is all there is. */
const ROUTE_ROOTS = new Set(['routes', 'pages', 'app', 'src']);

/** A route parameter written into a file name: `[id]`, `[...slug]`, `_id` (Nuxt 2), `$id` (Remix). */
const DYNAMIC_SEGMENT = /^(?:\[[^\]]+\]|[_$]\w+)$/;

/**
 * A screen known only by its chunk — a folder read without source maps — named the way its bundler
 * named the chunk, without the hash: `Article-BZRh73np.js` → `Article`. Rollup, Vite and esbuild
 * name a chunk after the module it starts at and append eight characters, and on a real Vue build the
 * table read `Article-BZRh73np` while a signal said every row was a hash nobody could read. A name
 * that is only a hash stays one, and so does Angular's `chunk-`, which names nothing.
 */
export const chunkLabel = (chunk: string): string => {
    const stem = baseName(chunk).replace(/\.m?js$/i, '');
    // `-` and eight characters is Rollup, Vite and esbuild; `.` and a hex hash is Rollup 1 and the
    // bundlers of its time — Sapper's table read `index.e902f999` and `index.62e5829d`.
    const named = stem.replace(/-[\w-]{8}$/, '').replace(/\.[\da-f]{8,}$/i, '');
    // A letter names nothing either: Stencil calls every chunk `p-3b66a627`, and its polyfills
    // were listed as "p, p, p".
    return named.length > 1 && named !== stem && named.toLowerCase() !== 'chunk' ? named : stem;
};

/**
 * Readable screen name from the file it originates from.
 * `features/users/users.page.ts` -> `users`
 * `src/routes/orders/+page.svelte` -> `orders`
 *
 * @param chunk the chunk the screen starts at. When it is the source too, the folder said nothing
 *              finer — no source map — and the chunk's own name is all there is: see `chunkLabel`.
 */
export const screenLabel = (source: string, chunk?: string): string => {
    if (source === chunk) {
        return chunkLabel(chunk);
    }

    const name = baseName(source).replace(SUFFIX, '').replace(EXTENSION, '') || baseName(source);
    const folder = source.split('/').at(-2) ?? '';
    const routed = folder && !ROUTE_ROOTS.has(folder);
    if (name.startsWith(ROLE_PREFIX)) {
        return routed ? folder : name.slice(1);
    }
    // File-system routing names a route by its folder too: `pages/movie/index.vue` is `movie`, and
    // `pages/movie/[id].vue` is `movie/[id]`. On their own, a Nuxt app's table had `index` twice
    // and `[id]` twice, and its gate messages said "Screen index downloads 191 kB" about two
    // different screens.
    // Under a parameter, the route is the path: `genre/[no]/movie` is not the `movie` screen. Asked
    // before `index`, or Sapper's `profile/[user]/index.svelte` came out as `[user]` next to its own
    // sibling `profile/[user]/[view]`.
    if (routed && DYNAMIC_SEGMENT.test(folder)) {
        return routeOf(source) ?? name;
    }
    if (name === 'index' && routed) {
        return folder;
    }
    return DYNAMIC_SEGMENT.test(name) && routed ? `${folder}/${name}` : name;
};

/** The path of a file below the root of the routes, without its extension or a trailing `index`. */
const routeOf = (source: string): string | null => {
    const parts = source.replace(SUFFIX, '').replace(EXTENSION, '').split('/');
    const root = parts.findLastIndex(part => ROUTE_ROOTS.has(part));
    const route = parts.slice(root + 1).filter(part => part !== 'index');
    return route.length > 0 ? route.join('/') : null;
};

/**
 * The same labels made unique where two screens share one, by the folders above each, up to the
 * root of the routes: `movie` and `genre/[no]/movie`. One that is unique already is left as it is.
 */
export const uniqueLabels = <T extends { label: string; source: string }>(
    screens: readonly T[],
    isChunk: (source: string) => boolean = () => false,
): T[] => {
    const count = new Map<string, number>();
    for (const screen of screens) {
        count.set(screen.label, (count.get(screen.label) ?? 0) + 1);
    }
    return screens.map(screen => {
        if ((count.get(screen.label) ?? 0) < 2) {
            return screen;
        }
        // A screen known only by its chunk has no folders to tell it apart by, only its hash: two
        // Sapper `[slug]` read `client/[slug].df9e6d95`, the folder of the build and not of a route.
        const longer = isChunk(screen.source)
            ? baseName(screen.source).replace(/\.m?js$/i, '')
            : routeOf(screen.source);
        return longer && longer !== screen.label ? { ...screen, label: longer } : screen;
    });
};

/**
 * A path shortened to fit a table cell by dropping middle folders, never by cutting a word in two.
 *
 * `overflow-wrap: anywhere` was doing the shortening before, and it produced things like
 * `…ICustomerSummary.interfa` / `ce.ts` — the half of the name that identifies the file split
 * across two lines. Folders in the middle are the part nobody reads; the first one says where in
 * the project this is and the last one says what it is, so those two are what survives.
 *
 * `src/app/features/customers/detail/ICustomerSummary.interface.ts`
 *   -> `src/…/detail/ICustomerSummary.interface.ts`
 *
 * The full path always goes in a `title`: this shortens what is drawn, never what is known.
 */
export const elidePath = (path: string, max = 46): string => {
    if (path.length <= max) {
        return path;
    }

    const parts = path.split('/');
    const [first] = parts;
    // Two segments or fewer have no middle to drop, and a single long name cannot be helped here.
    if (parts.length < 3 || first === undefined) {
        return path;
    }

    // The tail grows from the end while it fits; the last segment always goes in, however long.
    const tail: string[] = [];
    let width = first.length + 3;
    for (const part of parts.slice(1).toReversed()) {
        if (tail.length > 0 && width + part.length + 1 > max) {
            break;
        }
        tail.unshift(part);
        width += part.length + 1;
    }

    return tail.length === parts.length - 1 ? path : [first, '…', ...tail].join('/');
};

/**
 * A difference as it reads next to a figure: `+12 kB`, `−3 kB`, with the typographic minus.
 * Zero comes out as `+0 B`; every caller that would rather say "the same" checks for it first.
 */
export const formatDelta = (diff: number): string => `${diff >= 0 ? '+' : '−'}${formatBytes(Math.abs(diff))}`;

/**
 * Whether a pattern of `loadline.json` names a file: the whole name, or with `*` standing for any
 * text — the hash, a folder. Matched against the file name and against its path in the folder, so `client.*.js` and
 * `build/p-*.js` both work. Matched by hand rather than turned into a regular expression: the
 * pattern is somebody's text, and a regular expression built from it is one more thing to get wrong.
 */
export const namedBy = (pattern: string, path: string): boolean =>
    [baseName(path), path].some(name => matchesStars(pattern, name));

/** Whether `text` is `pattern` whole, with `*` standing for any text. The matcher `namedBy` uses. */
export const matchesStars = (pattern: string, text: string): boolean => {
    const [first = '', ...rest] = pattern.split('*');
    if (rest.length === 0) {
        return text === first;
    }
    const last = rest.pop() ?? '';
    if (!text.startsWith(first) || !text.endsWith(last) || text.length < first.length + last.length) {
        return false;
    }
    let at = first.length;
    for (const part of rest) {
        const found = text.indexOf(part, at);
        if (found === -1) {
            return false;
        }
        at = found + part.length;
    }
    return at <= text.length - last.length;
};
