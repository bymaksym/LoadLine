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

## `sample-report.json`

A snapshot, not an input: the whole report for the synthetic build in
`src/app/core/sample/sample-build.ts`, written down.

Being frozen, it cannot notice Angular changing shape — `--self-check` against a real build does
that. What it notices is us: any edit to the analysis, the criteria or the signals that moves a
number or a sentence turns up here as a diff, and that diff is the review. It is also the build the
page loads behind **See an example**, so it tests that the example still shows what it should.

Accept a deliberate change with `pnpm test:cli -u`, and read the diff first — that is the only moment
anyone looks at it.
