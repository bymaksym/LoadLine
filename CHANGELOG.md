# Changelog

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries that change what Loadline reports say **which figure moved and why**: the output of this tool
is numbers, so a release that moves one silently is indistinguishable from a regression. Below
`1.0.0`, a minor bump may change the command's flags or its output. The page and the command share
their analysis, so a change to one is a change to both unless an entry says otherwise.

## [1.3.0](https://github.com/bymaksym/LoadLine/compare/v1.2.1...v1.3.0) (2026-11-22)


### Features

* **cli:** look for loadline.json in .config/ as well ([4066951](https://github.com/bymaksym/LoadLine/commit/4066951b81f3be34ecf8b9dbbf767ca64a0ff4de))
* **cli:** name a native Expo app instead of misreading it ([f7b5746](https://github.com/bymaksym/LoadLine/commit/f7b57463cb6b7404da596e2a989bb29d975d1463))
* **cli:** say where the initial load stands against angular.json's budget ([061c7e6](https://github.com/bymaksym/LoadLine/commit/061c7e60ab1b8cd47147875eac0d7cf974145ea1))
* **flow:** a Flow tab that says which package makes which screen heavy ([20999d9](https://github.com/bymaksym/LoadLine/commit/20999d94aeefda4da4afa860ab711c82d71001fe))
* **flow:** model and layout of the "where the bytes go" diagram ([9e4b952](https://github.com/bymaksym/LoadLine/commit/9e4b952c60342edb8c0bc2fd626ad77d8f816b5c))
* **flow:** name what a build does not break down, and say something about it too ([1eaa234](https://github.com/bymaksym/LoadLine/commit/1eaa23491ddc9b0bc68fe80fa0e0e902e78dac54))
* read index source maps, the sectioned format Metro writes ([b65b441](https://github.com/bymaksym/LoadLine/commit/b65b4417edc08717de81c148cc4b434b92a612e1))


### Bug Fixes

* a commented console.log is not a leftover; copied files are not chunks ([bcf725a](https://github.com/bymaksym/LoadLine/commit/bcf725aab570ee4dd5725c99fd2e839824ff04a4))
* an import chain says where an import() takes it out of the bootstrap ([776db30](https://github.com/bymaksym/LoadLine/commit/776db301eb7ac81b61cdd6f044b81856641a1ba4))
* an order for "what to fix first" when nothing saves a kilobyte ([2a50f16](https://github.com/bymaksym/LoadLine/commit/2a50f16cef423c46a8e47e6cb21b92a57dde7ff0))
* **cli:** name the build once, relative and with / ([a588ffe](https://github.com/bymaksym/LoadLine/commit/a588ffee27f7b56ac2ee1f23b43a2943670f91d7))
* **flow:** labels on a plate, over every ribbon, dimmed by their ink only ([2b99f01](https://github.com/bymaksym/LoadLine/commit/2b99f01360b0e6af2d07506e76a7ccbeef7a9dfc))
* never round a mixed chunk to 100 % dependencies ([887b706](https://github.com/bymaksym/LoadLine/commit/887b7068cb00fa3cef88ee1f309d9e29b1190305))
* one count of source maps in every card ([e72bf0e](https://github.com/bymaksym/LoadLine/commit/e72bf0e736def077a126d77d58d60ee21a623e97))
* one source order for the app name, title first ([4a0c362](https://github.com/bymaksym/LoadLine/commit/4a0c362b92eaaf33b92b2396522ce64f87047bf7))
* platform icons are not a file downloaded twice; fonts say their weights ([0e52e0e](https://github.com/bymaksym/LoadLine/commit/0e52e0e61044a04f9ab0dc201cf56332567e6925))
* read pnpm 9 lock files for who brings each dependency ([9626bdd](https://github.com/bymaksym/LoadLine/commit/9626bdd7c7671bde82b88b648f368db0bbcb5491))
* scale a chunk's parts to its weight when they add up to more than it ([2cb0495](https://github.com/bymaksym/LoadLine/commit/2cb0495a2eeaf2233e9b61b0663b62efb3794c6a))
* tell copied files from chunks only where the bundler listed its chunks ([bbb37cc](https://github.com/bymaksym/LoadLine/commit/bbb37ccd51c3c2790fe6ac269a263f76b4367b17))
* the advice for deep screens names how this build's tool preloads ([e266c18](https://github.com/bymaksym/LoadLine/commit/e266c18b9958cb28a07bc5cd922c7f58f53a034d))
* the duplicates advice names every duplicated package ([f63f3d2](https://github.com/bymaksym/LoadLine/commit/f63f3d21ac29d29f2c7968c0e22ae84fcd07d68f))

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
