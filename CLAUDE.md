# Loadline — notes for agents

Loadline says what each screen of an app downloads. It is one analysis with two front ends: the page
(`loadline.html`, an Angular app built into a single file) and the command (`npx @bymaksym/loadline`).
[CONTRIBUTING.md](CONTRIBUTING.md) says how to run it and commit; this file is the rules, each with
its reason, because a rule without one gets broken the first time it is in the way.

## Where things live

- `src/app/core/` — the analysis. **The page and the command both run it**, so it imports only
  itself: no page layer, no Angular, no package, no `node:` (ESLint enforces it).
- `src/app/features/`, `src/app/shared/`, `src/app/state/` — the page only.
- `cli/` — the command: reads a build off the disk and prints the report.
- `scripts/` — build steps and checks, plain Node with JSDoc types (`tsconfig.scripts.json`).
- `fixtures/` — real builds the tests read as data.
- [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) — why the algorithm and every signal are the way they
  are. Read the section before changing an analysis or a signal.

## Rules

- **`src/app/core` must run on Node 20.19** (`engines` in package.json; a CI job holds it). No API
  newer than that — `Set#difference()` passes every check on Node 24 and breaks `npx` on 20.
- **No runtime dependency.** The published package has none, so `npx` installs nothing and there is
  nothing to audit.
- **The page uses only what is "widely available" in browsers** (Baseline): ESLint and Stylelint
  both check it. An exception goes in their config with the reason.
- **A figure that changes needs a reason.** The output is numbers; one that moves unexplained cannot
  be told from a regression. **A rule about another bundler's output needs a fixture** in `fixtures/`.
- **Regular expressions here read minified bundles of several megabytes.** Keep them linear:
  `eslint-plugin-regexp` flags backtracking, and a slow pattern there is a hung command.
- **Every string the page shows exists in English and in Spanish**: `ui-strings.ts` declares it,
  `en.ts` and `es.ts` fill it, `findings/finding-text.ts` has both languages of each signal.
- **`localStorage` only through `core/session/local-store.ts`**, which guards it (private mode,
  blocked storage).
- **Styles: tokens from `src/assets/_tokens.scss`, BEM class names, and a class a template uses must
  be declared in its scope** (`scripts/check-styles.mjs`). A `var(--x)` with no `--x` is an error:
  the browser drops the declaration silently.
- **Every silence carries its reason**: `eslint-disable` with `-- why`, `stylelint-disable` with
  `-- why`, a knip ignore with a comment. A `max-lines` cap that is raised gets a dated line saying
  what grew.
- **Generated files are not edited by hand**: `loadline.html` (the build), `src/styles/_fonts.scss`
  (`pnpm run fonts`), `fixtures/sample-report.json` (written by `cli/sample.spec.ts`), `CHANGELOG.md`
  (release-please, from the commit subjects).

## Before saying something is done

`pnpm run check:all` runs every check that does not write and prints a summary. Tests and the
self-check are slow and separate: `pnpm test`, `pnpm run self:check`. Knip only through
`pnpm run knip`: run bare on a busy Windows machine, it reports files in use as unused.
