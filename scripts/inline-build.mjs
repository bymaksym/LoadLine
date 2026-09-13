/**
 * Inlines the compiled JS and CSS into `index.html`, leaving ONE self-contained file.
 *
 * This is what keeps the property that made v1 pleasant: the tool opens with a double click, no
 * server, nothing to install. Without it an Angular project produces several files and can no
 * longer be opened from disk.
 *
 * Usage: node scripts/inline-build.mjs [output-folder] [target-file]
 */
// @ts-check
import fs from 'node:fs';
import path from 'node:path';

const distRoot = process.argv[2] ?? 'dist/loadline-app';
const target = process.argv[3] ?? 'loadline.html';

// Angular v17+ leaves the browser artifacts in `<output>/browser`.
const browserDir = fs.existsSync(path.join(distRoot, 'browser')) ? path.join(distRoot, 'browser') : distRoot;
const indexPath = path.join(browserDir, 'index.html');

if (!fs.existsSync(indexPath)) {
    console.error(`Cannot find ${indexPath}. Did you build first? (pnpm run build)`);
    process.exit(1);
}

let html = fs.readFileSync(indexPath, 'utf8');
/** The base names of everything that ended up inside, for the line printed at the end. */
/** @type {string[]} */
const inlined = [];

/** A local `<script src>` becomes a `<script>` with the code inside. */
html = html.replaceAll(/<script([^>]*?)src="([^"]+)"([^>]*)><\/script>/g, (match, before, src, after) => {
    if (/^https?:/.test(src)) {
        return match;
    }

    const file = path.join(browserDir, path.basename(src));
    if (!fs.existsSync(file)) {
        return match;
    }

    inlined.push(path.basename(src));
    // `type="module"` is kept: the bundle uses module syntax.
    const attrs = `${before}${after}`.replaceAll(/\s+(defer|async)\b/g, '').trim();
    return `<script ${attrs}>\n${fs.readFileSync(file, 'utf8')}\n</script>`;
});

/**
 * Same for the project's own stylesheets. The `https?:` guard is kept although nothing external is
 * linked any more — the fonts are inside the CSS as data URIs since CHECKLIST §7.8 — because what
 * it protects is the property that made that change worth making: this file never reaches out.
 */
html = html.replaceAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (match, href) => {
    if (/^https?:/.test(href)) {
        return match;
    }

    const file = path.join(browserDir, path.basename(href));
    if (!fs.existsSync(file)) {
        return match;
    }

    inlined.push(path.basename(href));
    return `<style>\n${fs.readFileSync(file, 'utf8')}\n</style>`;
});

/** Icons go inside as data URIs: opened from disk, an `href="favicon.svg"` finds nothing. */
/** @type {Record<string, string>} */
const mime = { '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };
html = html.replaceAll(/<link\b[^>]*>/g, match => {
    // Attribute order is not guaranteed (the build rewrites the head), so read `rel` and `href` separately.
    const rel = /\brel="([^"]+)"/.exec(match)?.[1];
    const href = /\bhref="([^"]+)"/.exec(match)?.[1];
    // `rel` is absent on a `<link>` that has none, which is not one of the two this looks for.
    if (!rel || !['icon', 'apple-touch-icon'].includes(rel) || !href || /^https?:/.test(href)) {
        return match;
    }

    const file = path.join(browserDir, path.basename(href));
    const type = mime[path.extname(href)];
    if (!type || !fs.existsSync(file)) {
        return match;
    }

    inlined.push(path.basename(href));
    const data = fs.readFileSync(file).toString('base64');
    return match.replace(`href="${href}"`, `href="data:${type};base64,${data}"`);
});

// The manifest and the share image only make sense served from a URL.
html = html.replaceAll(/<link[^>]*rel="manifest"[^>]*>\s*/g, '');
html = html.replaceAll(/<meta[^>]*property="og:image(?::width|:height)?"[^>]*>\s*/g, '');

// `<base href="/">` breaks loading from `file://`, and without a router it is not needed at all.
html = html.replaceAll(/<base[^>]*>/g, '');

// The modulepreloads point to files that are already inlined: leaving them causes 404s when opening the HTML.
html = html.replaceAll(/<link[^>]*rel="modulepreload"[^>]*>\s*/g, '');

fs.writeFileSync(target, html);

const size = (fs.statSync(target).size / 1024).toFixed(0);
console.log(`${target}: ${size} kB · ${inlined.length} files inlined (${inlined.join(', ')})`);
