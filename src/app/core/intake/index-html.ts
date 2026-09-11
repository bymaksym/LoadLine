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

/** Angular writes `index.html`; with server-side rendering the browser one is `index.csr.html`. */
const INDEX_NAME = /^index(\.[\w-]+)?\.html$/i;

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
const INLINE_SCRIPT = /<script\b([^>]*)>([\S\s]*?)<\/script>/gi;

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
export const indexHtmlOf = <T extends { name: string }>(files: readonly T[]): T | null => {
    const named = files.find(file => INDEX_NAME.test(file.name));
    if (named) {
        return named;
    }

    const pages = files.filter(file => /\.html?$/i.test(file.name));
    return pages.length === 1 ? (pages[0] ?? null) : null;
};

/**
 * The chunks an inline script of the page imports by hand. They are entries in the same sense a
 * `<script src>` is: the browser runs that script as soon as it parses the page, so execution
 * starts there.
 */
const startedInline = (html: string): string[] => {
    const started: string[] = [];

    for (const [, attributes = '', body = ''] of html.matchAll(INLINE_SCRIPT)) {
        // A `<script src>` has no body worth reading, and its file is already counted as the entry.
        if (attribute(attributes, 'src') !== null) {
            continue;
        }
        for (const call of body.matchAll(IMPORT_CALL)) {
            started.push(fileNameOf(call[2] ?? ''));
        }
    }

    return started;
};

/**
 * The two ways a page names a script, kept apart because they mean different things. A `<script>`
 * is where execution starts; a `modulepreload` is a file fetched early that some other file will
 * import. Only the first one is an entry of the build.
 */
export const scriptsIn = (html: string): { names: string[]; entries: string[] } => {
    const names = new Set<string>();
    const entries = new Set<string>();

    for (const [, tag = '', rest = ''] of html.matchAll(TAG)) {
        const isScript = tag.toLowerCase() === 'script';
        const rel = new Set((attribute(rest, 'rel') ?? '').toLowerCase().split(/\s+/));
        // A plain `preload` only counts when it is a script: the same tag preloads fonts and images.
        const preloads = rel.has('modulepreload') || (rel.has('preload') && attribute(rest, 'as') === 'script');
        if (!isScript && !preloads) {
            continue;
        }

        const name = fileNameOf(attribute(rest, isScript ? 'src' : 'href') ?? '');
        if (/\.m?js$/.test(name)) {
            names.add(name);
            if (isScript) {
                entries.add(name);
            }
        }
    }

    // After the tags, so the order stays the order the page names things in: the links come first
    // in the document and the script that starts the application is at the end of it.
    for (const name of startedInline(html)) {
        if (!/\.m?js$/.test(name)) {
            continue;
        }
        names.add(name);
        entries.add(name);
    }

    return { names: [...names], entries: [...entries] };
};

/** The JavaScript files the page names, as bare file names, in the order the page names them. */
export const announcedIn = (html: string): string[] => scriptsIn(html).names;

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
export const assetsIn = (
    html: string,
): { referenced: string[]; preloaded: string[]; prefetched: string[]; hrefs: string[] } => {
    const referenced = new Set<string>();
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

        referenced.add(source);
        hrefs.add(url);
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
        if (source) {
            referenced.add(source);
            hrefs.add(url);
        }
    }

    return {
        referenced: [...referenced],
        preloaded: [...preloaded],
        prefetched: [...prefetched],
        hrefs: [...hrefs],
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
const ABSOLUTE = /^(?:(https?:)?\/\/)([^/?#]+)/i;

const originOf = (url: string): string | null => {
    const found = ABSOLUTE.exec(url.trim());
    if (!found) {
        return null;
    }

    return `${(found[1] ?? '').toLowerCase()}//${(found[2] ?? '').toLowerCase()}`;
};

/** One host the page fetches from, with how much of the first load comes from it. */
export interface PageOrigin {
    /** `https://cdn.example.com`, or `//cdn.example.com` when the page left the scheme out. */
    origin: string;
    /** Files the page names on that host. */
    files: number;
    /** How many of them are JavaScript: the ones the round-trip arithmetic is about. */
    scripts: number;
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

    const count = (url: string, isScript: boolean): void => {
        const origin = originOf(url);
        if (!origin) {
            return;
        }

        const row = byOrigin.get(origin) ?? { origin, files: 0, scripts: 0 };
        row.files += 1;
        row.scripts += isScript ? 1 : 0;
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
        count(url, lower === 'script' || rel.has('modulepreload') || attribute(rest, 'as') === 'script');
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
