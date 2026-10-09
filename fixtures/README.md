# fixtures

**Everything here is generated, tracked on purpose, and must not be regenerated casually.**

Compiled output inside a repository looks like something committed by accident, and deleting it for
tidiness fails quietly: the tests still run, against nothing. Hence this file.

Not shipped — `files` in package.json does not include this directory.

## `vite-app/`

A real build compiled with **Vite 8 and Rolldown**, sources and output both: three lazy routes, a
widget deferred inside one of them, and a chunk two routes share.

It is here because a rule written against a bundler's output cannot be tested against output this
project produced. A rule for spotting webpack output once matched Loadline's own code, and Loadline
refused its own build while still analysing its `stats.json` happily. Pointing the tool at a folder
Angular did not write is what catches that. It also carries shapes a bundler produces and nobody
would write by hand: a specifier minified into a template literal, the preload list baked into a
dynamic import, a chunk named after the module it starts at.

Recompiling with a newer Vite **moves the figures the tests assert**. Treat it as a change to the
expected values rather than a refresh: update them in the same commit, and say in the message which
Vite produced them.

## `vite5-app/` and `vite-relative-app/`

The same application as `vite-app`, sources unchanged, built two more ways that each write Vite's
preload list in a shape the reader once missed — and missing it costs every screen a round trip
it does not take:

- **`vite5-app`**, Vite **5.0.12**: the list lives in `__vite__mapDeps.viteFileDeps`, inside a
  function at the end of the chunk, where 5.1 and later write a constant at the top. Excalidraw
  ships exactly this.
- **`vite-relative-app`**, Vite **8.2.2 with rolldown 1.2.7** (pinned through `overrides`: a later
  rolldown writes different `.map` files) and `base: './'`: the list names `./orders.page-….js`,
  relative to the chunk that holds it rather than to the root. Nuxt always writes it this way, and
  so does any Vite app built for a subfolder, Electron or Tauri.

The original `vite-app` was rebuilt byte for byte with Vite 8.2.2 and rolldown 1.2.7, which is how
these two know what to pin.

## `vite-router-app/`

The same application with its router written as a **route table** — `{ path, name, component: ()
=> import(…) }`, the shape vue-router, Nuxt and React Router write — and one more lazy file no route
opens: `messages.es.js`, loaded with `load: () => import(…)` the way Nuxt's i18n loads a language.
Built with **Vite 8.2.2 and rolldown 1.2.7**, and **without source maps** on purpose: what it holds
up is the table naming the screens (`dashboard`, `order-list`, `/settings`) where the only other
name a chunk has is its hash, and the language file kept out of the screens. Nuxt without maps
listed fourteen language files as screens before this.

## `webpack4-app/`

The same application as `vite-app`, sources and output, compiled with **webpack 4.47** and
html-webpack-plugin 4 — what Create React App 1 to 3 and Vue CLI shipped. One change to the sources:
`??` became `||` in `main.js`, because webpack 4's parser predates it.

Its folder is here to be refused. Its chunks register themselves in `webpackJsonp` and load each
other by number, so a folder of them carries no graph, and before the marker was known the three lazy
routes came out as one bootstrap of 1 kB and zero screens. Rebuild it with
`NODE_OPTIONS=--openssl-legacy-provider`: webpack 4 hashes with MD4, which Node 17 and later no
longer offer by default.

Its `stats.json` is here to be read: `webpack --mode production --json > stats.json`, added on
09/10/2026 from a rebuild whose `dist/` came out byte for byte the same. It has to give the screens of
`vite-app`. The absolute folder it was built in is replaced by `C:\fixture\webpack4-app` in the
module identifiers, which nothing reads.

## `webpack5-app/`

The same application built by **webpack 5.111.1** (webpack-cli 7.2.3, html-webpack-plugin 5.6.8),
with a runtime chunk and `splitChunks: { chunks: 'all', minSize: 0 }` so that `table.js`, which two
routes share, is a chunk of its own: a lazy screen that arrives as two files fetched at once. The
`stats.json` is `webpack --json=stats.json`, with the build folder replaced by
`C:\fixture\webpack5-app` as above. It holds up the runtime chunk in the bootstrap, the shared chunk,
and the route and its shared chunk counted as one round trip.

## `vite-legacy-app/`

The same application built by **Vite 8.2.2 (rolldown 1.2.13) with `@vitejs/plugin-legacy` 8.2.3**,
`polyfills: []` and without source maps, both to keep it small: a modern copy behind
`<script type="module">` and a SystemJS copy behind `<script nomodule>`, started from `data-src`.

It holds up that the second copy is **left out and counted**: Stencil, Angular up to 13 and every
legacy plugin ship one, and a real Stencil build had a 42 kB fallback no current browser fetches in a
bootstrap of 48. Seven files come out under "for browsers without ES modules", the first trip is the
one modern chunk, and the screens are those of `vite-app`.

## `rollup-amd-app/`

The same application built by **Rollup 4** with `format: 'amd'`, and a page its own config writes:
`<script data-main="main-…" src="…/require.min.js">`, the loader on a CDN. Module ids carry no
extension and the lazy routes are `require([…])`, which is what every RequireJS application and
Polymer's es5/es6 builds look like. Read as ES modules only, Polymer's build came out as a 2 kB
loader, zero screens and 1.1 MB "in no figure here"; this holds up the dependency lists, the name in
a string as a lazy edge, and `data-main`.

## `sample-report.json`

A snapshot, not an input: the whole report for the synthetic build in
`src/app/core/sample/sample-build.ts`, written down.

Being frozen, it cannot notice Angular changing shape — `--self-check` against a real build does
that. What it notices is us: any edit to the analysis, the criteria or the signals that moves a
number or a sentence turns up here as a diff, and that diff is the review. It is also the build the
page loads behind **See an example**, so it tests that the example still shows what it should.

Accept a deliberate change with `pnpm test:cli -u`, and read the diff first — that is the only moment
anyone looks at it.
