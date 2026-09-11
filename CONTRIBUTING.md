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

Run what CI runs, in the same order — the cheap checks first, so a typo fails in seconds rather than
after the build:

```bash
pnpm run format:check
pnpm run lint:ci
pnpm run lint-styles:ci
pnpm run typecheck
pnpm test
```

`pnpm run fix-all` applies the formatting and the auto-fixable lint in one go; check what it changed
before committing, since an automatic fix can silence a rule instead of satisfying it.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org) — `commitlint`
runs as a local hook, so it fails before the push rather than in CI.

## What makes a change easy to accept

- **A figure that changed needs a reason in the diff.** The whole output of this tool is numbers, and
  a number that moves without an explanation is indistinguishable from a regression. Say which figure
  and why in the pull request.
- **A new rule about another bundler's output needs a fixture.** `fixtures/` holds a real Vite build
  for this: a rule written against webpack output once matched Loadline's own code, and running the
  tool against a folder Angular did not write is what caught it.
- **The page and the command share their analysis.** They are the same code with two front ends; a
  fix applied to only one of them is a bug report waiting to happen.
- **No new runtime dependency.** The published package has zero, which is what lets `npx loadline`
  run with nothing to install and nothing to audit. Development dependencies are a normal
  conversation.

## Out of scope

- Reformatting, renaming or restructuring on its own. Prettier and ESLint already decide formatting.
- A second way to do something that already works — [docs/HOW-IT-WORKS.md](docs/HOW-IT-WORKS.md) says
  why the current one is the way it is.
- Features that need a server, an account or a network request. Everything runs locally and nothing
  is uploaded.

## Security

Do not open a public issue for a vulnerability. [SECURITY.md](SECURITY.md) says where it goes.

## Licence

By contributing you agree that your contribution is licensed under the [MIT licence](LICENSE), the
same as the rest of the project.
