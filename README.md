# Loadline

> Weight per screen: what someone opening a screen of your app actually downloads, how much of that
> everybody else pays for too, and what is worth moving elsewhere.

[![npm](https://img.shields.io/npm/v/loadline.svg)](https://www.npmjs.com/package/loadline)
[![CI](https://github.com/bymaksym/LoadLine/actions/workflows/ci.yml/badge.svg)](https://github.com/bymaksym/LoadLine/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/loadline.svg)](LICENSE)

Bundle analysers report what each chunk weighs. Loadline reports what each **screen** costs: it
walks the import graph of your build, separates the bootstrap everyone downloads from the code a
single route adds, and counts how many round trips each screen takes to arrive.

It runs two ways from the same code, with the same results — as a single HTML page in your browser,
or as a command in your pipeline. Nothing is uploaded and nothing is fetched: the page carries its
own fonts and works offline.

## Quick start

**In the browser.** Open [`loadline.html`](loadline.html) and drop your build on it. No install, no
server, no build step. Press **See an example** to see the report on a synthetic build that ships
inside the page.

**In the terminal.**

```bash
npx loadline dist/app/browser                          # the build folder on its own
npx loadline dist/app/stats.json --dist dist/app/browser
```

Zero runtime dependencies, no install script, Node 20.19 or newer. `npm i -g loadline` installs it;
`pnpm`, `yarn`, `bun` and `deno` all work, as do `pnpm dlx`, `yarn dlx` and `bunx`. The package also
ships `loadline.html` next to the command, under `npm root -g`.

## Compatibility

Loadline reads ES module output, either from an esbuild metafile or from the compiled folder, whose
chunks carry their own import graph.

| Build tool                 | Frameworks                                                        | What to pass                                                               |
| -------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| esbuild (metafile)         | Angular 17+, plain esbuild                                        | `stats.json`, ideally with `--dist`                                        |
| Vite, Rollup, Rolldown     | Vue, React, Svelte, Solid, Nuxt, SvelteKit, Astro, React Router 7 | The build folder                                                           |
| webpack, Turbopack, Rspack | Angular ≤ 16, Next.js, Create React App                           | Not supported — see [Statoscope](https://github.com/statoscope/statoscope) |

Webpack resolves imports at run time through its own loader, so the shipped files contain no graph
to read. Builds in that format are named for what they are rather than analysed.

A build folder must contain the `index.html` of the build, which names the chunk the application
starts at. Source maps in the folder are optional: without them every figure still comes out, but
chunks are not broken down by source file and screens are named after their chunk.

To get a metafile out of Angular:

```bash
ng build --configuration <the-one-your-pipeline-deploys> --stats-json
```

## What you get

- **One headline number** — what is downloaded before anything appears.
- **One row per screen**, with bootstrap, shared code and own code on a common scale, plus **how
  many round trips** the screen takes. A screen split across three levels of static imports costs
  three sequential requests however little it weighs.
- **Real compressed sizes**, computed with `CompressionStream` over your actual output. Brotli
  figures appear when the folder carries `.js.br` files.
- **Signals with a name and a fix** — shared code labelled as deferred, bootstrap pulled in for a
  lazy screen, duplicate package versions, CommonJS packages the bundler cannot tree-shake, large
  data files travelling in the bootstrap, and more.
- **Search by package or file** — which chunks it is in, what it weighs in each, which screens pay
  for it, and the chain of imports that brings it in.
- **Provenance on every figure** — each threshold says whether it is external, derived or a
  convention, and each number whether it was measured, derived, declared or is unknown.

Optional inputs widen the report:

| Drop in                                     | Adds                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| The build folder (`--dist`)                 | Gzip and brotli figures, per-file weights, first-load round trips           |
| A previous build or export (`--baseline`)   | Per-screen deltas, and what a returning visitor re-downloads                |
| `angular.json`, `package.json`, the CI file | Whether your size budgets sit in the configuration the pipeline builds      |
| A browser measurement, pasted into Measured | What is actually served: compression, 304s, third parties, real round trips |
| Several apps at once                        | What microfrontends ship twice, and what a shared package would save        |

## In CI

The command prints the same headline, table and signals as the page, and can fail the build.

```bash
loadline dist/app/browser \
  --baseline loadline-baseline.json \
  --max-boot 350kB \
  --max-growth 20kB \
  --fail-on high
```

Exit code `0` when nothing broke a gate, `1` when something did, `2` when the arguments or files
could not be used. With no `--max-…` and no `--fail-on` it only reports. Growth is measured on what
each screen adds beyond the bootstrap, and the bootstrap is checked separately, so a bootstrap that
grew does not break every screen's gate at once.

`--export <file>` writes this build as the baseline for the next run — the only way to produce one
for builds that write no `stats.json`. Write it on every run, passing or failing, so tomorrow
compares against yesterday rather than against the last green build.

Output formats: `text` (default), `json`, `markdown`, `sarif` for GitHub code scanning, and
`pr-comment`, which carries an HTML marker so the next run edits its comment instead of adding
another. `--lang en|es`, and `loadline --help` for the full list.

```yaml
# .github/workflows/loadline.yml
name: Loadline
on: pull_request
permissions: { contents: read, pull-requests: write, security-events: write }
jobs:
    weight:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with: { node-version: 22 }
            - run: npm ci && npm run build
            - run: npx loadline dist/app/browser --format pr-comment > comment.md
            - run: gh pr comment "$NUMBER" --body-file comment.md --edit-last --create-if-none
              env: { GH_TOKEN: '${{ github.token }}', NUMBER: '${{ github.event.number }}' }
            - run: npx loadline dist/app/browser --format sarif > loadline.sarif
            - uses: github/codeql-action/upload-sarif@v3
              with: { sarif_file: loadline.sarif }
```

## Configuration

A `loadline.json` in the working directory is read without any flag; `--config <file>` points at
another one. Flags on the command line win over the file. The page writes this file, and the
command reads it, so thresholds edited in the browser are the ones CI judges by.

```json
{
    "tool": "loadline",
    "version": 1,
    "criteria": { "bootOk": 174080 },
    "gates": { "maxBoot": "350kB", "failOn": "high", "failOnNewPackage": true },
    "packages": ["@angular/core", "@angular/common", "rxjs"],
    "accepted": [
        {
            "kind": "dupes",
            "key": "date-fns",
            "why": "two versions until the calendar library releases 4.x",
            "who": "@maks",
            "until": "2026-12-01",
            "bytes": 14336
        }
    ]
}
```

`accepted` records a signal the team has decided to live with: it names a reason, a person and an
expiry. The signal comes back when the date passes, or when the figure it was agreed at has grown.
Everything accepted is listed under the report, so no signal disappears silently.

`--fail-on-new-package` catches the way bundles actually grow — one `npm install` at a time. With a
`packages` list it fails on anything not on it; with a `--baseline` and no list, on anything that
was not in the bootstrap last time.

## Documentation

- [How it works](docs/HOW-IT-WORKS.md) — the algorithm, what each signal means, the limits of the
  analysis, and [how the other tools compare](docs/HOW-IT-WORKS.md#7-what-the-other-tools-do).
- [CONTRIBUTING.md](CONTRIBUTING.md) — what CI checks before you spend time on a change.
- [SECURITY.md](SECURITY.md) — report vulnerabilities privately, never as an issue.
- [CHANGELOG.md](CHANGELOG.md) — what changed in each version.

When opening an issue, the **Copy diagnostics** button at the end of the report writes about thirty
lines describing the build and what Loadline decided about it. Package names are real; paths in your
own code are replaced by stable hashes, so it can be pasted in public.

## License

[MIT](LICENSE). Offered with no commitment of support: issues and pull requests are welcome and may
sit unanswered.
