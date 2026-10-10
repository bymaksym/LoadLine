<p align="center">
  <img src="https://raw.githubusercontent.com/bymaksym/LoadLine/main/.github/banner.png?v=2" alt="Loadline — weight per screen" width="100%">
</p>

> Weight per screen: what someone opening a screen of your app actually downloads, how much of that
> everybody else pays for too, and what is worth moving elsewhere.

[![npm](https://img.shields.io/npm/v/@bymaksym/loadline.svg)](https://www.npmjs.com/package/@bymaksym/loadline)
[![CI](https://github.com/bymaksym/LoadLine/actions/workflows/ci.yml/badge.svg)](https://github.com/bymaksym/LoadLine/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/bymaksym/LoadLine.svg)](LICENSE)

Bundle analysers report what each chunk weighs. Loadline reports what each **screen** costs: it
walks the import graph of your build, separates the bootstrap everyone downloads from the code a
single route adds, and counts how many round trips each screen takes to arrive.

It runs two ways from the same code, with the same results — as a single HTML page in your browser,
or as a command in your pipeline. Nothing is uploaded and nothing is fetched: the page carries its
own fonts and works offline.

## Quick start

**In the browser.** Open [`loadline.html`](loadline.html) and drop your build on it, or choose it with
**Choose build folder**. No install, no server, no build step. Press **See an example** to see the report on a synthetic build that ships
inside the page.

**In the terminal.**

```bash
npx @bymaksym/loadline dist/app                        # the build root: the metafile and browser/ are found
npx @bymaksym/loadline dist/app --html loadline.html --open   # and the page, with the build already in it
npx @bymaksym/loadline dist/app/browser                # the build folder on its own
npx @bymaksym/loadline .                               # the project: the newest build inside it is found
npx @bymaksym/loadline dist/app/browser-stats.json --dist dist/app/browser
```

Pointed at the root of an Angular build, the command finds `browser-stats.json` (Angular 22.2) or
`stats.json` (up to 22.1) and the `browser/` folder next to it. `--html` writes the same page as
`loadline.html` with the files the command read inside it, so a script can produce a report somebody
opens with a double click — treemap, search and every chunk included, nothing to drag in.

Each run is remembered in `node_modules/.cache/loadline`, and the next run of the same build says
what moved — `since the last run: bootstrap 156 kB → 129 kB (−27 kB)` — without a `--baseline`. It is
a line and a column, never a gate; `--no-cache` turns it off.

Zero runtime dependencies, no install script, Node 20.19 or newer. `npm i -g @bymaksym/loadline` installs it;
`pnpm`, `yarn`, `bun` and `deno` all work, as do `pnpm dlx`, `yarn dlx` and `bunx`. The package also
ships `loadline.html` next to the command, under `npm root -g`.

## Compatibility

Loadline reads ES module output, either from an esbuild metafile or from the compiled folder, whose
chunks carry their own import graph, and webpack builds from their `stats.json`.

| Build tool                               | Frameworks                                                        | What to pass                                                             |
| ---------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| esbuild (metafile)                       | Angular 17+, plain esbuild                                        | The build root, or the metafile with `--dist`                            |
| Vite, Rollup, Rolldown                   | Vue, React, Svelte, Solid, Nuxt, SvelteKit, Astro, React Router 7 | The build folder                                                         |
| Older formats: AMD, SystemJS, `nomodule` | Sapper, Stencil, Polymer, Ember, RequireJS, Vite's legacy plugin  | The build folder, or the project root: the build is found inside it      |
| webpack, Rspack                          | Angular ≤ 16, Create React App, Vue CLI, Gatsby, Nuxt 2           | The `stats.json` with `--dist`, or the build folder when it is inside it |
| Turbopack                                | Next.js                                                           | Not supported: it writes no stats file                                   |

Webpack resolves imports at run time through its own loader, so the shipped files contain no graph
to read; its `stats.json` does, and Loadline reads it as a metafile. How to get one:

| Tool             | Command                               | Where it lands                   |
| ---------------- | ------------------------------------- | -------------------------------- |
| Angular 8 to 16  | `ng build --stats-json`               | `dist/<app>/stats(-es2015).json` |
| Create React App | `react-scripts build --stats`         | `build/bundle-stats.json`        |
| Vue CLI          | `vue-cli-service build --report-json` | `dist/report.json`               |
| plain webpack    | `webpack --json > stats.json`         | wherever it is redirected        |

Inside the build folder, `loadline <folder>` finds it; anywhere else, pass it with `--dist <folder>`.
A module's size in that file is its source before minification, so what each file weighs inside a
chunk is shared out in proportion until the folder's source maps measure it.

A build folder must contain the `index.html` of the build, which names the chunk the application
starts at. Source maps in the folder are optional: without them every figure still comes out, but
chunks are not broken down by source file and screens are named after their chunk.

To get a metafile out of Angular:

```bash
ng build --configuration <the-one-your-pipeline-deploys> --stats-json
```

Angular 22.2 and later write it as `dist/<app>/browser-stats.json`; earlier versions as
`dist/<app>/stats.json`.
Either way, `loadline dist/<app>` finds it.

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
- **A map of the bundle** — one rectangle per chunk, sized by what it weighs in the report's unit,
  with what fills it drawn inside, by package and by folder of yours. Click to open a chunk, as in
  `esbuild-visualizer`, with the difference that the area between chunks is what travels and the
  area inside one is each part's raw share, because a compressed share of one module does not exist.
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
| The lock file (`--lock`)                    | Who brings each package in, and whether a duplicate is pinned beyond reach  |
| A browser measurement, pasted into Measured | What is actually served: compression, 304s, third parties, real round trips |
| Several apps at once                        | What microfrontends ship twice, and what a shared package would save        |

## In CI

### The minimum

Enough for most projects: every pull request is built and fails if the first load is over the
limit. Copy one, change `dist/my-app` to your build folder (`outputPath` in `angular.json`, `outDir`
in Vite), and that is all.

**GitHub Actions** — `.github/workflows/loadline.yml`:

```yaml
name: Loadline
on: pull_request
jobs:
    loadline:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v7
            - uses: actions/setup-node@v7
              with: { node-version: 22 }
            - run: npm ci && npm run build
            - run: npx @bymaksym/loadline@1 dist/my-app --format summary --max-boot 350kB
```

Or the Action in this repository, which runs the same check and adds the full report to the job
summary. It runs the Loadline version it was released with, so pinning the Action pins the tool:

<!-- x-release-please-start-version -->

```yaml
- uses: actions/checkout@v7
- uses: actions/setup-node@v7
  with: { node-version: 22 }
- run: npm ci && npm run build
- uses: bymaksym/LoadLine@v1.2.1
  with:
      path: dist/my-app
      args: --max-boot 350kB # anything the command takes
```

<!-- x-release-please-end -->

**GitLab CI** — `.gitlab-ci.yml`:

```yaml
loadline:
    image: node:22
    rules:
        - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    script:
        - npm ci && npm run build
        - npx @bymaksym/loadline@1 dist/my-app --format summary --max-boot 350kB
```

**Bitbucket Pipelines** — `bitbucket-pipelines.yml`:

```yaml
image: node:22
pipelines:
    pull-requests:
        '**':
            - step:
                  name: Loadline
                  script:
                      - npm ci && npm run build
                      - npx @bymaksym/loadline@1 dist/my-app --format summary --max-boot 350kB
```

**Azure Pipelines** — `azure-pipelines.yml` (the `pr` trigger covers GitHub and Bitbucket
repositories; in Azure Repos, a branch policy runs it):

```yaml
trigger: none
pr:
    - '*'
pool:
    vmImage: ubuntu-latest
steps:
    - task: NodeTool@0
      inputs: { versionSpec: '22.x' }
    - script: npm ci && npm run build
    - script: npx @bymaksym/loadline@1 dist/my-app --format summary --max-boot 350kB
```

**CircleCI** — `.circleci/config.yml` (it runs on every push; "Only build pull requests" in the
project settings limits it to pull requests):

```yaml
version: 2.1
jobs:
    loadline:
        docker:
            - image: cimg/node:22
        steps:
            - checkout
            - run: npm ci && npm run build
            - run: npx @bymaksym/loadline@1 dist/my-app --format summary --max-boot 350kB
workflows:
    loadline:
        jobs:
            - loadline
```

- **Your own install command** if it is not npm: `pnpm install --frozen-lockfile`, `yarn`.
- **More to fail on**: `--fail-on high` adds the most serious signals; run it once first without
  the flag, so an existing build does not fail on day one for something nobody touched.
- **Limits in `loadline.json`** instead of flags, and the step becomes
  `npx @bymaksym/loadline@1 dist/my-app --format summary`. See [Configuration](#configuration).
- **The whole report** — package names, the import chains, the screens by name — needs the build to
  say what is inside each file: `ng build --stats-json` in Angular, `build.sourcemap: true` in Vite.
  Without it the limits still work.

**A badge** of the first load, green, amber or red by the same verdict as the report, with the
change when there is a `--baseline`:

```bash
npx @bymaksym/loadline@1 dist/my-app --format badge > loadline.svg
```

Commit it from the pipeline of the main branch and show it in the README with
`![first load](loadline.svg)`, or attach it to the pull request. It is a plain SVG: nothing fetched,
no badge service.

When you want the comment on every pull request with what it **adds** compared with `main`, use the
full recipes below.

### Everything it can do

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

Output formats: `text` (default), `summary` for the whole report in a dozen lines, `json`,
`markdown`, `sarif` for GitHub code scanning, `pr-comment`, which carries an HTML marker so
the next run edits its comment instead of adding another, and `agent` for a coding agent or a
script: the five actions worth most, each with its file, import chain and saving, as `key=value`
lines with no prose. `--lang en|es` — English unless it is
asked for in Spanish, never read from the machine's locale, which is the same rule the page
follows with its language button. `loadline --help` for the full list.

The comment is worth most when it says what the pull request **adds**, and that needs the figures
of `main` to compare against. A pipeline keeps nothing between runs — the cache in
`node_modules/.cache` is gone with the runner — so `main` leaves its snapshot as an artifact on every
push, and each pull request downloads the latest one and passes it as `--baseline`. Until `main` has
run once there is nothing to download, and the comment shows plain figures instead of differences.

```yaml
# .github/workflows/loadline.yml
name: Loadline
on:
    push: { branches: [main] }
    pull_request:
permissions: { contents: read, actions: read, pull-requests: write, security-events: write }
jobs:
    weight:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v7
            - uses: actions/setup-node@v7
              with: { node-version: 22 }
            - run: npm ci && npm run build

            # The snapshot main left on its last green run: what this pull request is compared to.
            - if: github.event_name == 'pull_request'
              run: |
                  run=$(gh run list --branch main --workflow loadline.yml --status success --limit 1 --json databaseId --jq '.[0].databaseId')
                  if [ -n "$run" ]; then gh run download "$run" --name loadline-baseline --dir base; fi
              env: { GH_TOKEN: '${{ github.token }}' }

            - run: |
                  baseline=$([ -f base/loadline-baseline.json ] && echo "--baseline base/loadline-baseline.json")
                  npx @bymaksym/loadline@1 dist/app/browser $baseline --export loadline-baseline.json --format pr-comment > comment.md

            - if: github.event_name == 'pull_request'
              run: gh pr comment "$NUMBER" --body-file comment.md --edit-last --create-if-none
              env: { GH_TOKEN: '${{ github.token }}', NUMBER: '${{ github.event.number }}' }

            # On main, the snapshot becomes the baseline of every pull request opened after it.
            - if: github.event_name == 'push'
              uses: actions/upload-artifact@v7
              with: { name: loadline-baseline, path: loadline-baseline.json }

            - run: npx @bymaksym/loadline@1 dist/app/browser --format sarif > loadline.sarif
            - uses: github/codeql-action/upload-sarif@v4
              with: { sarif_file: loadline.sarif }
```

To make the pull request fail on growth rather than only report it, add one more step after the
comment, so the comment is posted whatever the verdict:
`[ -z "$baseline" ] || npx @bymaksym/loadline@1 dist/app/browser $baseline --max-growth 20kB` (or
`--max-growth-pct 5`). It judges what this pull request added, not the size of the whole
application — and it needs a baseline, which the first run on `main` does not have yet.

The recipes pin the major version (`@1`): a new major can move a threshold, and a pipeline should
change its verdict because the code changed, not because a tool updated overnight. In a job log,
`--format summary` prints a dozen lines instead of the whole report.

### GitLab CI

The same idea: the default branch keeps its snapshot as an artifact, and each merge request
downloads it, compares, and keeps one note up to date. Posting the note needs a project access
token with the `api` scope, saved as a masked CI/CD variable called `LOADLINE_TOKEN` — the job's own
token can read artifacts but cannot write notes. Without the variable the job still runs and fails
on the gates; it only does not comment.

```yaml
# .gitlab-ci.yml
loadline:
    image: node:22
    rules:
        - if: $CI_PIPELINE_SOURCE == "merge_request_event"
        - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
    script:
        - npm ci && npm run build
        # The snapshot the default branch left on its last successful run of this job.
        - >
            curl --fail --silent --location --header "JOB-TOKEN: $CI_JOB_TOKEN" --output base.json
            "$CI_API_V4_URL/projects/$CI_PROJECT_ID/jobs/artifacts/$CI_DEFAULT_BRANCH/raw/loadline-baseline.json?job=loadline"
            || rm -f base.json
        - baseline=$([ -f base.json ] && echo "--baseline base.json")
        - npx @bymaksym/loadline@1 dist/app/browser $baseline --export loadline-baseline.json --format pr-comment > comment.md
        # One note per merge request, edited on every push: found by the marker the comment carries.
        - |
            if [ "$CI_PIPELINE_SOURCE" = "merge_request_event" ] && [ -n "$LOADLINE_TOKEN" ]; then
              notes="$CI_API_V4_URL/projects/$CI_PROJECT_ID/merge_requests/$CI_MERGE_REQUEST_IID/notes"
              id=$(curl --silent --header "PRIVATE-TOKEN: $LOADLINE_TOKEN" "$notes?per_page=100" \
                | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const n=JSON.parse(s).find(n=>n.body.includes("<!-- loadline-report -->"));process.stdout.write(n?String(n.id):"")})')
              if [ -n "$id" ]; then method=PUT; url="$notes/$id"; else method=POST; url="$notes"; fi
              curl --silent --request "$method" --header "PRIVATE-TOKEN: $LOADLINE_TOKEN" --data-urlencode "body@comment.md" "$url" > /dev/null
            fi
        # Fails the merge request on growth, after the note is posted. Growth needs a baseline,
        # which the very first run of the default branch does not have yet.
        - if [ -n "$baseline" ]; then npx @bymaksym/loadline@1 dist/app/browser $baseline --max-growth 20kB --format summary; fi
    artifacts:
        paths: [loadline-baseline.json]
        expire_in: 30 days
```

## Configuration

Everything is optional. A `loadline.json` next to your code sets the thresholds, makes CI fail, and
records the signals the team has decided to live with. The page and the command both read it, so
they judge the build the same way.

```json
{
    "$schema": "https://unpkg.com/@bymaksym/loadline/loadline.schema.json",
    "tool": "loadline",
    "version": 1,
    "gates": { "maxBoot": "350kB", "screens": { "map": "900kB" }, "failOn": "high" },
    "accepted": [{ "kind": "dupes", "key": "date-fns", "why": "until 4.x", "until": "2026-12-01" }]
}
```

With the `$schema` line your editor completes every key, explains it on hover and underlines a typo.
Anything the command cannot use in the file is printed, never ignored. Flags win over the file.

| I want to…                                       | Read                                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Fail CI on size, growth, new packages, signals   | [Configuring Loadline](docs/CONFIG.md#fail-the-build-on-size)                   |
| Give one heavy screen its own limit              | [One limit per screen](docs/CONFIG.md#one-limit-per-screen)                     |
| Change what counts as good or bad                | [Thresholds](docs/CONFIG.md#change-the-thresholds)                              |
| Live with a signal without hiding it forever     | [Accept a signal](docs/CONFIG.md#accept-a-signal)                               |
| Never ship a package, or never in the first load | [Forbid something](docs/CONFIG.md#forbid-something)                             |
| Share one file between many repositories         | [Share the configuration](docs/CONFIG.md#share-the-configuration)               |
| Fix a build read wrong: entry, screens, page     | [When it reads your build wrong](docs/CONFIG.md#when-it-reads-your-build-wrong) |
| See every key and its recommended value          | [Reference](docs/CONFIG-REFERENCE.md)                                           |

## Documentation

- [Configuring Loadline](docs/CONFIG.md) — `loadline.json` by task, with examples, and the
  [reference](docs/CONFIG-REFERENCE.md) of every key.
- [How it works](docs/HOW-IT-WORKS.md) — the algorithm, what each signal means, the limits of the
  analysis, and [how the other tools compare](docs/HOW-IT-WORKS.md#7-what-the-other-tools-do).
- [CONTRIBUTING.md](.github/CONTRIBUTING.md) — what CI checks before you spend time on a change.
- [SECURITY.md](.github/SECURITY.md) — report vulnerabilities privately, never as an issue.
- [CHANGELOG.md](CHANGELOG.md) — what changed in each version.

When opening an issue, the **Copy diagnostics** button at the end of the report writes about thirty
lines describing the build and what Loadline decided about it. Package names are real; paths in your
own code are replaced by stable hashes, so it can be pasted in public.

## Community

[Discord — ByMaksymDev Labs](https://discord.gg/ctDJjFF9yT), where Loadline has its own
channel. Bugs and feature requests are better off as issues here, where they can be found
again; the chat is for everything that is a conversation.

## License

[MIT](LICENSE). Offered with no commitment of support: issues and pull requests are welcome and may
sit unanswered.
