# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries that change what Loadline reports say **which figure moved and why**: the output of this tool
is numbers, so a release that moves one silently is indistinguishable from a regression. Below
`1.0.0`, a minor bump may change the command's flags or its output. The page and the command share
their analysis, so a change to one is a change to both unless an entry says otherwise.

## [1.2.1](https://github.com/bymaksym/LoadLine/compare/v1.2.0...v1.2.1) (2026-10-10)


### Bug Fixes

* an Action name and description the Marketplace accepts ([2c34b39](https://github.com/bymaksym/LoadLine/commit/2c34b39ad616c071144d44b4990466114785951e))

## [1.2.0](https://github.com/bymaksym/LoadLine/compare/v1.1.0...v1.2.0) (2026-10-10)


### Features

* a GitHub Action, so Loadline can be listed in the Marketplace ([11b402b](https://github.com/bymaksym/LoadLine/commit/11b402b674d5b3a4d0737fb05306ddea6f70d053))

## [1.1.0](https://github.com/bymaksym/LoadLine/compare/v1.0.0...v1.1.0) (2026-10-09)


### Features

* `--format agent`, `--format badge`, `--why` and `--entry` in the command ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))
* `build.own`, `build.dependencies` and `build.routeKeys` in loadline.json ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))
* `extends` shares one loadline.json across repositories; `--print-config` shows the result ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))
* `forbidden` rules raise a signal when a package or folder ships where it must not ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))
* `gates.failOnSignals` fails the build on the signals it names, whatever their severity ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))
* AMD, SystemJS and nomodule builds, and route tables that name the screens ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))
* the page shows the bootstrap against the baseline, screens by packages and round trips ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))
* the project root as a target, with the build found inside it ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))
* webpack stats, older builds, and loadline.json extends, forbidden rules and signal gates ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))
* webpack's stats.json is read, for Angular 8 to 16, Create React App, Vue CLI and webpack ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))


### Bug Fixes

* a dropped folder the browser cannot list is reported instead of doing nothing ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))
* a folder chosen with the button reads the stats file inside it, as a dropped one does ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))
* a stylesheet stored twice and downloaded once is no longer said to be downloaded twice ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))
* re-reading a rebuilt folder reads its import graph again instead of keeping the old one ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))
* Sapper's screens are named by their routes when the folder has no source maps ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))
* the page reads the build folder again when a later loadline.json changes how it is read ([6a38612](https://github.com/bymaksym/LoadLine/commit/6a386128e0d0683d527708e38ed08fd8bf55b6ad))

## [1.0.0](https://github.com/bymaksym/LoadLine/compare/v0.1.0...v1.0.0) (2026-10-03)


### Features

* a map of the bundle, --html with the build inside, and what moved since the last run ([5e92dc4](https://github.com/bymaksym/LoadLine/commit/5e92dc4ec8633df3890319edacd45e9a04f0bb68))
* a redesigned page, savings in the report's unit, and CI that compares each PR with main ([2ebe2dc](https://github.com/bymaksym/LoadLine/commit/2ebe2dc5beea0268a00ded58961825c2d6b9fe4d))


### Bug Fixes

* --what-if is answered in the summary and json formats, and the others say so on stderr ([2ebe2dc](https://github.com/bymaksym/LoadLine/commit/2ebe2dc5beea0268a00ded58961825c2d6b9fe4d))
* "Fixing both would take…" instead of "Acting on all 2 would take…" ([2ebe2dc](https://github.com/bymaksym/LoadLine/commit/2ebe2dc5beea0268a00ded58961825c2d6b9fe4d))
* **ci:** anchor release-please at 0.1.0 so it stops proposing 1.0.0 ([f4cb6f5](https://github.com/bymaksym/LoadLine/commit/f4cb6f56f65c96143fab88804e823b2df19b6a1a))
* **ci:** tag releases as v0.2.0, which is the shape publish.yml listens for ([f7f7466](https://github.com/bymaksym/LoadLine/commit/f7f74664bc85904917a61c032343bcc29db96467))
* keep the header buttons on screen on a narrow phone ([5e92dc4](https://github.com/bymaksym/LoadLine/commit/5e92dc4ec8633df3890319edacd45e9a04f0bb68))
* reject a stats.json without inputs before the analysis starts ([5e92dc4](https://github.com/bymaksym/LoadLine/commit/5e92dc4ec8633df3890319edacd45e9a04f0bb68))
* the signal count is the same in the summary, the tab and the filter ([2ebe2dc](https://github.com/bymaksym/LoadLine/commit/2ebe2dc5beea0268a00ded58961825c2d6b9fe4d))


### Miscellaneous Chores

* release 1.0.0 ([1c09574](https://github.com/bymaksym/LoadLine/commit/1c095742e9e7ed5b09ef809986c8974b24df6c46))

## [Unreleased]

Nothing yet.

## [0.1.0] - 2026-09-11

First published version. `0.x` on purpose: the figures are stable, the shape of the flags and of the
exported report may still move before `1.0.0`.

Published as `@bymaksym/loadline` and not as `loadline`, which npm refuses: its typosquatting check
rejects the name for being two letters from `readline`. The registry returning 404 for a name means
nobody owns it, not that you may have it — the rule only fires on publish. **The command installed
is still `loadline`**, since the executable's name is independent of the package's.

### Added

- **Weight per screen.** What opening each screen downloads, split into the bootstrap everyone pays
  for, what the screen shares with others, and what is its own.
- **How many screens load each deferred chunk.** A chunk the bundler labels deferred and sixty
  screens import is downloaded always.
- **Two front ends over one analysis.** `loadline.html`, a self-contained page that runs in the
  browser with nothing to install and nothing uploaded, and the same analysis as a command for CI.
- **Reads a build with or without a stats file.** An esbuild `stats.json`, or the build folder on its
  own — ES module chunks carry their own import graph, which is how anything on Vite, Rollup or
  Rolldown is read.
- **Real transfer figures** from the build folder: gzip, brotli where the precompressed files are
  there, and per-file weights read from the source maps.
- **Comparison against a previous measurement**, and size budgets cross-checked against the
  configuration the pipeline actually builds.
- **`--self-check`**, which works the bootstrap out twice — from the import graph and from the
  `index.html` the compiler wrote — and fails when the two disagree.
- Output as text, JSON, Markdown, SARIF or a PR comment, with thresholds that can fail a build.
- **Zero runtime dependencies and no install script.** Node 20.19 is the whole requirement.

<!--
A release section is written here before the tag: the tag has to match `version` in package.json or
the publish workflow refuses the push.

Headings, in this order, and only the ones that apply:
Added · Changed · Deprecated · Removed · Fixed · Security

## [0.1.1] - 2026-09-20

### Fixed
- Deferred chunks imported by more than one screen were counted once instead of once per screen, so
  "everybody pays" was under-reported on apps with shared lazy routes.
-->

[unreleased]: https://github.com/bymaksym/LoadLine/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bymaksym/LoadLine/releases/tag/v0.1.0
