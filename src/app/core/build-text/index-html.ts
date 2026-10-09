/**
 * What `index.html` tells the browser to fetch before it has parsed a single chunk: the entry
 * script and the `modulepreload` links.
 *
 * It matters because the import graph cannot tell the two apart. A bootstrap chunk named by this
 * page is asked for at once, together with the rest; one that is not is only discovered when the
 * chunk importing it has arrived and been parsed, which is another round trip. Same bytes, later.
 *
 * Read with regular expressions rather than `DOMParser` so the command line reads it the same way
 * the page does: the terminal has no DOM, and two readers would drift apart.
 */

import { namedBy } from '../format/format.utils';

/** Angular writes `index.html`; with server-side rendering the browser one is `index.csr.html`. */
const INDEX_NAME = /^index(?:\.[\w-]+)?\.html$/i;

const TAG = /<(script|link)\b([^>]*)>/gi;

/** Images written into the page itself: they are asked for as soon as the tag is parsed. */
const IMG = /<img\b([^>]*)>/gi;

/** `<base href>`: one tag that moves every relative URL of the page somewhere else. */
const BASE = /<(base)\b([^>]*)>/gi;

/**
 * An inline `<script>` with its body, which is the other way a page starts an application: rather
 * than `<script type="module" src>`, SvelteKit writes the chunk names into an `import()` inside the
 * page and calls `start()` with the result. Nothing outside that script names those chunks, so
 * without reading it the build has no entry at all and cannot be read — which is what it did.
 */
const INLINE_SCRIPT = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/** `import("./chunk.js")` as it is written in a page: a literal specifier, never a variable. */
const IMPORT_CALL = /\bimport\s*\(\s*(["'`])([^"'`]+)\1\s*\)/g;
const ATTRIBUTE = (name: string): RegExp =>
    new RegExp(String.raw`\b${name}\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))`, 'i');

const attribute = (tag: string, name: string): string | null => {
    const found = ATTRIBUTE(name).exec(tag);
    return found ? (found[2] ?? found[3] ?? found[4] ?? '') : null;
};

/** The file name of a URL, with the query and the hash off: how the metafile keys its outputs. */
const fileNameOf = (url: string): string => {
    const path = /^[^?#]*/.exec(url)?.[0] ?? '';
    return path.slice(path.lastIndexOf('/') + 1);
};

/**
 * Whichever of the dropped files is the page. `null` when the folder does not carry one.
 *
 * A build whose page is not called `index.html` used to fall through here and lose the round trips
 * of the first load with no explanation. When nothing matches the name, a folder holding exactly
 * one HTML file leaves no room for doubt about which page it is.
 */
export const indexHtmlOf = <T extends { name: string; path?: string; webkitRelativePath?: string }>(
    files: readonly T[],
    page?: string,
): T | null => {
    // `build.page` of `loadline.json`, when the page of the application is not the one this would pick.
    const where = (file: T): string => file.path ?? file.webkitRelativePath ?? file.name;
    const chosen = page ? files.find(file => namedBy(page, where(file).replaceAll('\\', '/'))) : undefined;
    if (chosen) {
        return chosen;
    }

    const named = files.find(file => INDEX_NAME.test(file.name));
    if (named) {
        return named;
    }

    const pages = files.filter(file => /\.html?$/i.test(file.name));
    return pages.length === 1 ? (pages[0] ?? null) : null;
};

/**
 * Any run of text between two quotes inside an inline script. Most are not file names; the ones that
 * name no script of the folder point at nothing and drop out where the graph is read, the same rule
 * that makes the regular expressions over the chunks safe.
 *
 * ⚠️ The quotes are looked at, never consumed. Matched as pairs, one string holding the other kind
 * of quote — Sapper's `"if(0)import('')"` — put every pair after it out of step, and the very
 * string that named the entry was read as the code between two strings.
 */
const INLINE_STRING = /(?<=["'`])([^"'`\s<>]{1,300})(?=["'`])/g;

/** `navigator.serviceWorker.register(` right before a string: that file is no part of the page. */
const REGISTERS_WORKER = /serviceWorker\s*\.\s*register\s*\(\s*["'`]$/;

/**
 * The `catch` of an inline script, up to the first closing brace: the way a page says "and if this
 * browser cannot do the above". Sapper starts its client with `type="module"` in a `try` and falls
 * back to the `shimport` loader in the `catch`; what only the fallback names is the copy for old
 * browsers, the same as a `nomodule` script.
 */
const CATCH_BLOCK = /\bcatch(?:\s*\([^)]*\))?\s*\{[^}]*\}/g;

/**
 * `<script nomodule>`: the copy for browsers without ES modules. A browser that runs the modern one
 * skips it, so it is no part of what the page downloads — and counted, a Stencil build had its
 * bootstrap at 48 kB of which 42 kB was `app.js`, the SystemJS fallback nobody on a current browser
 * fetches. Vite's legacy plugin and Angular's differential loading up to 13 write the same tag.
 */
const isNoModule = (attributes: string): boolean => /\bnomodule\b/i.test(attributes);

/** A script the browser runs. JSON, an import map or a template is data, whatever names it holds. */
const isExecutable = (attributes: string): boolean => {
    const type = (attribute(attributes, 'type') ?? '').toLowerCase();
    return type === '' || type === 'module' || /^(?:text|application)\/(?:java|ecma)script$/.test(type);
};

/**
 * The chunks an inline script of the page starts by hand. They are entries in the same sense a
 * `<script src>` is: the browser runs that script as soon as it parses the page, so execution
 * starts there.
 *
 * An `import()` is how SvelteKit does it. Pages older than ES modules do it with a string: Sapper
 * writes `s.src="/client/client.11806644.js"` into a script element it creates, Polymer's AMD
 * builds `define(['src/components/my-app.js'])`, a RequireJS page `require(['app.js'])`. Each of
 * them is a page whose application starts from nothing a tag names, and a build whose page names no
 * entry is refused — which is what Sapper's was, with a message saying it had no `index.html` while
 * the folder held one. So any string naming a script counts; whether that script is a file of this
 * build is decided where the files are known, and a name that is none drops out there.
 */
const startedInline = (html: string): { started: string[]; legacy: string[]; workers: string[] } => {
    const started: string[] = [];
    const legacy: string[] = [];
    const workers: string[] = [];

    for (const [, attributes = '', body = ''] of html.matchAll(INLINE_SCRIPT)) {
        // A `<script src>` has no body worth reading, and its file is already counted as the entry.
        if (attribute(attributes, 'src') !== null || !isExecutable(attributes)) {
            continue;
        }
        const into = isNoModule(attributes) ? legacy : started;
        for (const call of body.matchAll(IMPORT_CALL)) {
            into.push(fileNameOf(call[2] ?? ''));
        }
        const fallbacks = [...body.matchAll(CATCH_BLOCK)].map(block => [block.index, block.index + block[0].length]);
        for (const literal of body.matchAll(INLINE_STRING)) {
            const name = fileNameOf(literal[1] ?? '');
            if (!/\.m?js$/.test(name)) {
                continue;
            }
            const registered = REGISTERS_WORKER.test(body.slice(Math.max(0, literal.index - 40), literal.index));
            const fallback = fallbacks.some(([from = 0, to = 0]) => literal.index > from && literal.index < to);
            (registered ? workers : fallback ? legacy : into).push(name);
        }
    }

    return { started, legacy, workers };
};

export interface PageScripts {
    /** Every script the page asks for before anything runs, in the order it names them. */
    names: string[];
    /** The ones execution starts at: `<script src>`, and what an inline script starts by hand. */
    entries: string[];
    /** What only a browser without ES modules runs (`nomodule`): left out of every figure. */
    legacy: string[];
    /** Service workers the page registers. They run beside the page, never as part of a screen. */
    workers: string[];
}

/**
 * The two ways a page names a script, kept apart because they mean different things. A `<script>`
 * is where execution starts; a `modulepreload` is a file fetched early that some other file will
 * import. Only the first one is an entry of the build.
 */
export const scriptsIn = (html: string): PageScripts => {
    const names = new Set<string>();
    const entries = new Set<string>();
    const legacy = new Set<string>();

    for (const [, tag = '', rest = ''] of html.matchAll(TAG)) {
        const isScript = tag.toLowerCase() === 'script';
        const rel = new Set((attribute(rest, 'rel') ?? '').toLowerCase().split(/\s+/));
        // A plain `preload` only counts when it is a script: the same tag preloads fonts and images.
        const preloads = rel.has('modulepreload') || (rel.has('preload') && attribute(rest, 'as') === 'script');
        if (!isScript && !preloads) {
            continue;
        }

        // RequireJS starts the application from `data-main`, a module id with the extension left off,
        // and the script the tag itself names is only the loader.
        const main = isScript ? attribute(rest, 'data-main') : null;
        if (main) {
            const module = fileNameOf(main);
            entries.add(/\.m?js$/.test(module) ? module : `${module}.js`);
        }
        // Vite's legacy plugin names its entry in `data-src` and starts it with `System.import`.
        const legacySrc = isScript && isNoModule(rest) ? attribute(rest, 'data-src') : null;
        const url = isScript ? (attribute(rest, 'src') ?? legacySrc) : attribute(rest, 'href');
        const name = fileNameOf(url ?? '');
        if (!/\.m?js$/.test(name)) {
            continue;
        }

        if (isScript && isNoModule(rest)) {
            legacy.add(name);
            continue;
        }
        names.add(name);
        if (isScript) {
            entries.add(name);
        }
    }

    // After the tags, so the order stays the order the page names things in: the links come first
    // in the document and the script that starts the application is at the end of it.
    const inline = startedInline(html);
    for (const name of inline.started) {
        if (!/\.m?js$/.test(name) || legacy.has(name)) {
            continue;
        }
        names.add(name);
        entries.add(name);
    }
    for (const name of inline.legacy) {
        if (/\.m?js$/.test(name) && !entries.has(name)) {
            legacy.add(name);
        }
    }

    return { names: [...names], entries: [...entries], legacy: [...legacy], workers: inline.workers };
};

/** The JavaScript files the page names, as bare file names, in the order the page names them. */
export const announcedIn = (html: string): string[] => scriptsIn(html).names;

/**
 * What the page carries as code of its own: the bodies of its inline `<script>`s. They travel with
 * the page, before anything it names, and Polymer's es6 build had 14 kB of them that no figure
 * counted.
 */
export const inlineScriptsIn = (html: string): string =>
    [...html.matchAll(INLINE_SCRIPT)]
        .filter(([, attributes = '']) => !/\bsrc\s*=/i.test(attributes))
        .map(match => (match[2] ?? '').trim())
        .join('\n');

/**
 * Everything else the page names before anything is painted: the images written into the HTML, and
 * whatever it preloads.
 *
 * Fonts are the reason this exists. A `<link rel="preload" as="font">` is a file the browser fetches
 * at once, before it has parsed a stylesheet, and a page preloading seven weights of one family
 * pays for all seven on the first load. A font the page does **not** preload is fetched later, once
 * the CSS that names it has arrived, and belongs in a different figure — so the two are kept apart
 * rather than added together.
 *
 * `<img src>` is included and `srcset` is not: the browser picks one candidate from a `srcset` and
 * counting them all would overstate the first load, which is the mistake this whole group exists
 * to stop making in the other direction.
 */
/**
 * Icons a page names that the browser does not all download.
 *
 * `<link rel="icon">` with several sizes or types are **alternatives**: the browser picks the one
 * that fits and fetches that one, the way it picks one candidate of a `srcset`. `apple-touch-icon`
 * and `mask-icon` are fetched only when somebody saves the page to a home screen or pins a tab. A
 * page with a `.ico`, an SVG, three PNG sizes and a touch icon was counted as downloading all six,
 * which inflated the first trip, the "no hash, asked for by the page" list and the "same file twice"
 * one with files that never travel together.
 */
const ON_DEMAND_ICON = new Set(['apple-touch-icon', 'apple-touch-icon-precomposed', 'mask-icon']);

/**
 * Links that name a file for somebody else — a crawler, a feed reader, a search box — and that the
 * browser does not fetch on its own: `<link rel="sitemap">` made `sitemap.xml` "asked for by the
 * page" and one more file of the first trip.
 */
const NOT_FETCHED = new Set(['sitemap', 'canonical', 'alternate', 'author', 'help', 'license', 'search']);

/** Which of a page's `rel="icon"` alternatives a current browser fetches: the SVG when there is one. */
const chosenIcon = (icons: readonly { source: string; type: string; sizes: string }[]): string | null => {
    const svg = icons.find(icon => icon.type.includes('svg') || /\.svg$/i.test(icon.source));
    const any = icons.find(icon => icon.sizes === '' || icon.sizes === 'any');
    return (svg ?? any ?? icons[0])?.source ?? null;
};

export const assetsIn = (
    html: string,
): {
    referenced: string[];
    preloaded: string[];
    prefetched: string[];
    hrefs: string[];
    icons: string[];
    alternates: string[];
} => {
    const referenced = new Set<string>();
    /** Every icon the page names, and of those, the ones the browser will not fetch on this load. */
    const icons = new Set<string>();
    const alternates = new Set<string>();
    const favicons: { source: string; type: string; sizes: string }[] = [];
    const preloaded = new Set<string>();
    /**
     * Kept apart from both, because it is neither. A `prefetch` is not part of the first load — the
     * report is right not to add it to the bootstrap — but "the browser gets to it when it is idle"
     * turned out to be a comfortable half-truth: measured against a real Nuxt build, Chrome fetched
     * all three of them during the first page load. Counting them nowhere at all meant the one
     * finding that matters most on that framework was the one nothing said.
     */
    const prefetched = new Set<string>();
    // The URLs as written, query and all. Everything else here works on bare file names, which is
    // how the metafile keys things — but `app.js?v=3` is a *caching* fact that only survives in the
    // full string, and stripping it first would make that check impossible.
    const hrefs = new Set<string>();

    for (const [, tag = '', rest = ''] of html.matchAll(TAG)) {
        const lower = tag.toLowerCase();
        const rel = new Set((attribute(rest, 'rel') ?? '').toLowerCase().split(/\s+/));
        const preloads = rel.has('preload') || rel.has('prefetch') || rel.has('modulepreload');
        const url = attribute(rest, lower === 'link' ? 'href' : 'src') ?? '';
        const source = fileNameOf(url);
        if (!source) {
            continue;
        }

        hrefs.add(url);
        // The copy for browsers without ES modules is named and never fetched by one that has them:
        // counted, Vite's legacy polyfills made a 1 kB first load read 35 kB.
        const legacy = lower === 'script' && isNoModule(rest);
        if (legacy || (lower === 'link' && [...rel].some(value => NOT_FETCHED.has(value)))) {
            alternates.add(source);
            continue;
        }
        if (lower === 'link' && [...rel].some(value => ON_DEMAND_ICON.has(value))) {
            icons.add(source);
            alternates.add(source);
            continue;
        }
        if (lower === 'link' && rel.has('icon')) {
            icons.add(source);
            favicons.push({
                source,
                type: (attribute(rest, 'type') ?? '').toLowerCase(),
                sizes: (attribute(rest, 'sizes') ?? '').toLowerCase().trim(),
            });
            continue;
        }

        referenced.add(source);
        // `prefetch` is deliberately not a preload: it is what the browser fetches when it is idle,
        // which is the opposite of "before anything appears".
        if (lower === 'link' && preloads && !rel.has('prefetch')) {
            preloaded.add(source);
        }
        if (lower === 'link' && rel.has('prefetch')) {
            prefetched.add(source);
        }
    }

    // An `<img>` is not in `TAG`, which only matches the two tags the scripts and styles use. It is
    // matched on its own so a hero image written into the page is counted where it is paid for.
    for (const [, rest = ''] of html.matchAll(IMG)) {
        const url = attribute(rest, 'src') ?? '';
        const source = fileNameOf(url);
        if (!source) {
            continue;
        }

        referenced.add(source);
        hrefs.add(url);
    }

    // One favicon is fetched; the rest are alternatives. A file that is also named some other way —
    // an `<img>` of the same logo — stays referenced through that other tag.
    const fetched = chosenIcon(favicons);
    for (const icon of favicons) {
        if (icon.source === fetched) {
            referenced.add(icon.source);
        } else {
            alternates.add(icon.source);
        }
    }
    for (const name of referenced) {
        alternates.delete(name);
    }

    return {
        referenced: [...referenced],
        preloaded: [...preloaded],
        prefetched: [...prefetched],
        hrefs: [...hrefs],
        icons: [...icons],
        alternates: [...alternates],
    };
};

/**
 * The stylesheets the page asks for, which is the other half of the first load and the half this
 * tool has never counted.
 *
 * It matters more than it looks. A `<link rel="stylesheet">` in the head is **render-blocking**:
 * the browser will not paint until it has arrived, which is a stronger claim than the one made
 * about any script. Loadline's own build reports a bootstrap of 156 kB and asks for a 69 kB
 * stylesheet in the same page — a headline understated by 31 % on the one figure the tool is
 * named after, and its own sentence said "index.html announces the only bootstrap chunk".
 *
 * A `media="print"` link is left out on purpose: that is the trick for loading a stylesheet
 * without blocking the paint, and counting it would punish exactly the thing worth doing. The
 * same file usually appears twice in an Angular page — once with the trick and once without — and
 * a set keeps it one file.
 */
export const stylesIn = (html: string): string[] => {
    const names = new Set<string>();

    for (const [, tag = '', rest = ''] of html.matchAll(TAG)) {
        if (tag.toLowerCase() !== 'link') {
            continue;
        }

        const rel = new Set((attribute(rest, 'rel') ?? '').toLowerCase().split(/\s+/));
        const isSheet = rel.has('stylesheet') || (rel.has('preload') && attribute(rest, 'as') === 'style');
        if (!isSheet || (attribute(rest, 'media') ?? '').toLowerCase() === 'print') {
            continue;
        }

        const name = fileNameOf(attribute(rest, 'href') ?? '');
        if (/\.css$/i.test(name)) {
            names.add(name);
        }
    }

    return [...names];
};

/**
 * An absolute URL's origin — scheme and host — or `null` when the URL is relative.
 *
 * A protocol-relative `//cdn.example.com/main.js` counts: it is a different host, which is the
 * whole of what matters here, and the scheme it inherits changes nothing about the handshake.
 */
const ABSOLUTE = /^(https?:)?\/\/([^/?#]+)/i;

const originOf = (url: string): string | null => {
    const found = ABSOLUTE.exec(url.trim());
    return found ? `${(found[1] ?? '').toLowerCase()}//${(found[2] ?? '').toLowerCase()}` : null;
};

/** One host the page fetches from, with how much of the first load comes from it. */
export interface PageOrigin {
    /** `https://cdn.example.com`, or `//cdn.example.com` when the page left the scheme out. */
    origin: string;
    /** Files the page names on that host. */
    files: number;
    /** How many of them are JavaScript: the ones the round-trip arithmetic is about. */
    scripts: number;
    /**
     * Stylesheets that block the paint: the page shows nothing until they have arrived, from a
     * host it had to connect to first. Optional because a session saved before it was counted
     * has none, and that reads as zero.
     */
    styles?: number;
}

/**
 * Where the page fetches from, when that is not itself.
 *
 * This is a fact about the first load that the import graph cannot hold and that moves the
 * arithmetic at the root. A chunk on another host is not one request later than the page: it is a
 * DNS lookup, a TCP connection and a TLS handshake — or a fresh QUIC handshake — **before the
 * first byte of the first chunk**, and under HTTP/1.1 it is also a second pool of six connections,
 * which cuts the other way and helps. Neither half is visible in a file listing.
 *
 * `<base href>` is read because it moves every relative URL on the page at once, which is the one
 * way a build with nothing but relative paths still ends up served from somewhere else.
 *
 * `preconnect` and `dns-prefetch` are read because they are the mitigation. A page already warming
 * the connection to its CDN has paid attention to this and should not be told about it as if it
 * had not.
 */
export const originsIn = (html: string): { origins: PageOrigin[]; hinted: string[]; base: string | null } => {
    const byOrigin = new Map<string, PageOrigin>();
    const hinted = new Set<string>();
    let base: string | null = null;

    const count = (url: string, isScript: boolean, isStyle = false): void => {
        const origin = originOf(url);
        if (!origin) {
            return;
        }

        const row = byOrigin.get(origin) ?? { origin, files: 0, scripts: 0, styles: 0 };
        row.files += 1;
        row.scripts += isScript ? 1 : 0;
        row.styles = (row.styles ?? 0) + (isStyle ? 1 : 0);
        byOrigin.set(origin, row);
    };

    for (const [, tag = '', rest = ''] of html.matchAll(TAG)) {
        const lower = tag.toLowerCase();
        const rel = new Set((attribute(rest, 'rel') ?? '').toLowerCase().split(/\s+/));
        const url = attribute(rest, lower === 'link' ? 'href' : 'src') ?? '';

        // A hint names an origin and fetches nothing: it belongs on the other side of the answer.
        if (lower === 'link' && (rel.has('preconnect') || rel.has('dns-prefetch'))) {
            const origin = originOf(url);
            if (origin) {
                hinted.add(origin);
            }
            continue;
        }

        if (!url) {
            continue;
        }
        count(
            url,
            lower === 'script' || rel.has('modulepreload') || attribute(rest, 'as') === 'script',
            // `media="print"` is the trick for loading one without blocking: see `stylesIn`.
            lower === 'link' && rel.has('stylesheet') && (attribute(rest, 'media') ?? '').toLowerCase() !== 'print',
        );
    }

    for (const [, rest = ''] of html.matchAll(IMG)) {
        count(attribute(rest, 'src') ?? '', false);
    }

    // Last, and on its own: a `<base>` is not a file the page fetches, it is where every relative
    // URL of the page resolves against, so one tag can move the whole build to another host.
    for (const [, tag = '', rest = ''] of html.matchAll(BASE)) {
        if (tag.toLowerCase() === 'base') {
            base = originOf(attribute(rest, 'href') ?? '');
        }
    }

    return {
        origins: [...byOrigin.values()].toSorted((a, b) => b.scripts - a.scripts || b.files - a.files),
        hinted: [...hinted],
        base,
    };
};

/**
 * Where the page's `<link rel="prefetch">` point, as paths inside the build: query and hash off,
 * `./` and `/` off, and nothing on another host. The file name alone is not enough to find them —
 * TinyMCE's 25 plugins are all `plugin.min.js`, and read by name sixteen prefetched files came out
 * as five, every one of them weighing the same.
 */
export const prefetchPathsIn = (html: string): string[] => pathsIn(html, true);

/**
 * Where every script, stylesheet, preload and `<img>` of the page points, as paths inside the
 * build, the same way. What tells the one `plugin.min.js` the page names from the 24 it does not.
 */
export const pagePathsIn = (html: string): string[] => pathsIn(html, false);

const pathsIn = (html: string, prefetchOnly: boolean): string[] => {
    const urls: string[] = [];
    for (const [, tag = '', rest = ''] of html.matchAll(TAG)) {
        const link = tag.toLowerCase() === 'link';
        const rel = new Set((attribute(rest, 'rel') ?? '').toLowerCase().split(/\s+/));
        if (prefetchOnly ? link && rel.has('prefetch') : !link || !rel.has('prefetch')) {
            urls.push(attribute(rest, link ? 'href' : 'src') ?? '');
        }
    }
    if (!prefetchOnly) {
        for (const [, rest = ''] of html.matchAll(IMG)) {
            urls.push(attribute(rest, 'src') ?? '');
        }
    }

    const paths = new Set<string>();
    for (const url of urls) {
        const path = /^(?:[a-z]+:)?\/\//i.test(url)
            ? ''
            : (/^[^?#]*/.exec(url)?.[0] ?? '').replace(/^(?:\.\/|\/)+/, '');
        if (path) {
            paths.add(path);
        }
    }
    return [...paths];
};

/** The `<title>` of the page: what the application calls itself, when nothing else names it. */
const TITLE = /<title[^>]*>([^<]*)<\/title>/i;

/** The few entities a title is written with. Anything else stays as it is: it is a label. */
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

export const titleIn = (html: string): string | null => {
    const title = (TITLE.exec(html)?.[1] ?? '').replaceAll(
        /&(?:amp|lt|gt|quot|#39);/g,
        entity => ENTITIES[entity] ?? entity,
    );
    const trimmed = title.replaceAll(/\s+/g, ' ').trim();
    return trimmed === '' ? null : trimmed;
};
