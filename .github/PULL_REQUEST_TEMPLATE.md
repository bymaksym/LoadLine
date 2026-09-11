<!--
Short on purpose. CI already checks formatting, lint, types, tests and the build. What CI cannot
check is the only thing asked for here: whether a figure moved, and why.
-->

## What this changes

<!-- One or two sentences. If it fixes an issue, "Fixes #123" here. -->

## Does it move a figure?

<!--
Keep whichever applies.

- **No.** Nothing Loadline reports changes.
- **Yes** — which figure, on which build, from what to what, and why the new one is right. A changed
  number with no reason in the diff is indistinguishable from a regression.
-->

## Checks

- [ ] `pnpm run format:check`, `lint:ci`, `lint-styles:ci`, `typecheck` and `test` pass locally
- [ ] Commit messages follow Conventional Commits (`commitlint` enforces this on push)
- [ ] If this touches the analysis, **the page and the command both got it** — they share the code
- [ ] If this adds a rule about another bundler's output, there is a fixture it runs against
- [ ] No new runtime dependency, or an argument for one below
