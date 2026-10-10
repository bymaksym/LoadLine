# Contributing

Issues and pull requests are welcome and may sit unanswered: this is a one-person project offered
with no commitment of support. What follows is what the repository already checks, written down so a
pull request does not fail on something you had no way of knowing.

## Getting it running

```bash
pnpm install          # pnpm only: a guard in `prepare` stops npm and yarn
pnpm build            # writes loadline.html, the page the tool is
pnpm build:cli        # compiles the command into dist/cli/
pnpm test             # the page's tests and the command's
```

Use the pnpm version in `packageManager`. `only-allow` runs from `prepare` and stops an `npm install`
or a `yarn install` before it can write a second lockfile.

## Before opening a pull request

Run what CI runs. One command does all of it except the slow parts, and prints a summary of what
passes and what does not instead of stopping at the first failure:

```bash
pnpm run check:all    # types, lint, format, styles, accessibility, spelling, secrets, dependencies
pnpm test             # the page's tests and the command's
```

`pnpm run check` is the same with a picker, where the checks that write to the repository (the
dependency update, the autofix) can be ticked too.

A change to how a build is read, or to a signal, also goes through the real applications in
`tooling/rounds/apps.json` — thirteen reports from eleven open-source apps, Angular 21 to Sapper and
Angular 7, each pinned to a commit:

```bash
pnpm run rounds build    # once: clone, install and build them in ../loadline-rounds (LOADLINE_ROUNDS)
pnpm run build:cli && pnpm run rounds    # run Loadline on each and compare with tooling/rounds/expected/
```

A difference is either what the change meant to do — then `pnpm run rounds --update`, and the commit
says why the figure moved — or a regression on a build nobody was looking at. The apps that need
Node 12 build with the one in `LOADLINE_ROUNDS_NODE_12` — the folder holding that `node.exe` or
`node`, such as nvm's `v12.22.12` — and are skipped without it; the ones with a `yarn.lock` install
with `npx yarn@1.22.22`, so yarn does not have to be installed. A rounds folder may keep only the
builds, which is all `check` reads: `build` then stops at that app and says so, instead of running
`git checkout` where there is no repository. A fresh build is not always byte for byte the one the
expected reports came from (vue3-realworld moves by a few bytes per screen, Angular 7 by a few
hundred when its dependencies resolve again), so after building from scratch, write them once from
the last commit before comparing a change against them. The long hashes webpack writes in a file
name are taken out of the titles compared, so a rebuild of the same code is not a change.

`pnpm run fix-all` applies the formatting and the auto-fixable lint, one tool after the other with
Prettier last; check what it changed before committing, since an automatic fix can silence a rule
instead of satisfying it.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) — `commitlint`
runs as a local hook, so it fails before the push rather than in CI.

## Tooling

Where each config lives follows one rule: **a config goes where its tool looks for it, or where a
missing one fails loudly.** Prettier, html-validate, cspell, knip, npm-check-updates and Playwright
do not fail when they find no config — they run on their defaults and report success — so moving
their file behind a flag turns every place that forgets the flag into a check that passes for the
wrong reason.

- **At the root**, where their tools look: `eslint.config.js` (ESLint has no other lookup),
  `.prettierignore` (the Prettier config itself is the `prettier` key in package.json), `knip.jsonc`,
  `.htmlvalidate.mjs`, `.ncurc.js`, the `tsconfig*.json` files and `.husky/`. The editor folds them
  under `package.json`, `eslint.config.js` and `tsconfig.json` (`explorer.fileNesting` in
  .vscode/settings.json), so the root still reads as the project.
- **In `.config/`**, what is found there or handed over in one place, and fails loudly otherwise:
  `stylelintrc.mjs` and `cspell.config.yaml` (both tools search `.config/`, and so do their editor
  extensions — Stylelint only under the `stylelintrc` name), `commitlint.config.js` (passed by
  `.husky/commit-msg`), `secretlintrc.json` and `secretlintignore` (passed by `secrets:scan`) and
  `duplicates.json` (read by `tooling/validate-duplicates.mjs`).
- **In `.github/`**, next to `dependabot.yml`, what decides versions: release-please's config and
  manifest, passed to the action in `workflows/release-please.yml`.
- **In `tooling/`**, the checks written for this project; **in `scripts/`**, the build steps.
- **The product at the root, not configs**: `loadline.html` (the page) and `loadline.schema.json`
  (the schema of `loadline.json`, which users point `$schema` at as
  `unpkg.com/@bymaksym/loadline/loadline.schema.json`). Both are generated and published with the
  package, and a move would break every link to them. And `action.yml`, the GitHub Action:
  `uses: bymaksym/LoadLine@vX` reads it at the root and nowhere else.

`pnpm run config:check` (in `check` and CI) asks each tool that would fall back to its defaults
which config it is reading, and fails on a file at the root that is not on its list.

## What makes a change easy to accept

- **A figure that changed needs a reason in the diff.** The whole output of this tool is numbers, and
  a number that moves without an explanation is indistinguishable from a regression. Say which figure
  and why in the pull request.
- **A new rule about another bundler's output needs a fixture.** `fixtures/` holds a real Vite build
  for this: a rule written against webpack output once matched Loadline's own code, and running the
  tool against a folder Angular did not write is what caught it.
- **The page and the command share their analysis.** They are the same code with two front ends; a
  fix applied to only one of them is a bug report waiting to happen.
- **No new runtime dependency.** The published package has zero, which is what lets `npx @bymaksym/loadline`
  run with nothing to install and nothing to audit. Development dependencies are a normal
  conversation.

## Out of scope

- Reformatting, renaming or restructuring on its own. Prettier and ESLint already decide formatting.
- A second way to do something that already works — [docs/HOW-IT-WORKS.md](../docs/HOW-IT-WORKS.md) says
  why the current one is the way it is.
- Features that need a server, an account or a network request. Everything runs locally and nothing
  is uploaded.

## Security

Do not open a public issue for a vulnerability. [SECURITY.md](SECURITY.md) says where it goes.

## Licence

By contributing you agree that your contribution is licensed under the [MIT licence](../LICENSE), the
same as the rest of the project.
