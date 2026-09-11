/** Presentation helpers and metafile path normalisation. */

import { type Lang } from '../i18n/ui-strings';

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

const numbers = { lang: 'en' as Lang, decimals: formatter('en'), counts: counter('en') };

export const setNumberLang = (lang: Lang): void => {
    if (lang === numbers.lang) {
        return;
    }

    numbers.lang = lang;
    numbers.decimals = formatter(lang);
    numbers.counts = counter(lang);
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
        return `${numbers.decimals.format(bytes / KB / KB)} MB`;
    }
    if (bytes >= KB) {
        return `${Math.round(bytes / KB)} kB`;
    }
    return `${bytes} B`;
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
 * Strips the `node_modules` noise to leave the name a package is recognised by.
 * pnpm adds an extra segment (`.pnpm/pkg@version/node_modules/`) that has to be skipped first.
 */
export const shortName = (path: string): string =>
    path.replace(/^.*node_modules\/\.pnpm\/[^/]+\/node_modules\//, '').replace(/^.*node_modules\//, '');

/** Name of the npm package a path belongs to, or `null` if it is project code. */
export const packageOf = (path: string): string | null => {
    const short = shortName(path);
    if (short === path) {
        return null;
    }

    const parts = short.split('/');
    const head = parts[0] ?? short;
    return head.startsWith('@') ? parts.slice(0, 2).join('/') : head;
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

const SUFFIX = new RegExp(String.raw`\.(?:${[...VIEW_SUFFIXES, ...ROUTE_SUFFIXES].join('|')})\.${SOURCE_EXTENSION}$`);
const EXTENSION = new RegExp(String.raw`\.${SOURCE_EXTENSION}$`);

/**
 * SvelteKit names a route file by its role and the route by its folder: `+page.svelte` in every
 * one of them. Left alone, three screens came out as three rows called `+page.svelte`.
 */
const ROLE_FILE = /^\+/;

/** Folders that are the root of the routes rather than one route: there the file name is all there is. */
const ROUTE_ROOTS = new Set(['routes', 'pages', 'app', 'src']);

/**
 * Readable screen name from the file it originates from.
 * `features/users/users.page.ts` -> `users`
 * `src/routes/orders/+page.svelte` -> `orders`
 */
export const screenLabel = (source: string): string => {
    const name = baseName(source).replace(SUFFIX, '').replace(EXTENSION, '') || baseName(source);
    if (!ROLE_FILE.test(name)) {
        return name;
    }

    const folder = source.split('/').at(-2) ?? '';
    return folder && !ROUTE_ROOTS.has(folder) ? folder : name.slice(1);
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
