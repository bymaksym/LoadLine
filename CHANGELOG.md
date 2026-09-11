# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries that change what Loadline reports say **which figure moved and why**: the output of this tool
is numbers, so a release that moves one silently is indistinguishable from a regression. Below
`1.0.0`, a minor bump may change the command's flags or its output. The page and the command share
their analysis, so a change to one is a change to both unless an entry says otherwise.

## [Unreleased]

Nothing yet.

## [0.1.0] - 2026-09-11

First published version. `0.x` on purpose: the figures are stable, the shape of the flags and of the
exported report may still move before `1.0.0`.

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
