# Security

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private vulnerability reporting: the **Security** tab of
this repository → **Report a vulnerability**. It opens a thread only you and the maintainer can read,
and needs no email address from either side.

This project is maintained by one person and comes with no commitment of support, but a report that
says how to reproduce the problem will be read and fixed in a release rather than sat on.

## What is worth reporting

Loadline reads build output and writes a report. It has no runtime dependencies and makes no network
requests, from the page or the command, which rules out most of what usually goes wrong. What is
left:

- **Leaking what it read.** Any request leaving `loadline.html`, any path of your own source
  surviving in **Copy diagnostics**, anything written outside the directory you pointed it at.
- **Input that takes over the process.** A crafted `stats.json`, source map, `index.html` or build
  folder that makes the command execute something, escape the folder it was given, or read a file
  elsewhere on the machine.
- **A published artifact that does not match this repository.** If the tarball on npm, or the
  `loadline.html` inside it, contains code that is not in the commit it claims to come from, that is
  the most serious report this project can receive.

## What is not a vulnerability

- **A wrong figure.** A chunk reported at the wrong weight is a bug; a public issue is the right
  place for it.
- **A crash on a malformed build**, as long as it is a crash and not an execution. Open an issue with
  the input if you can share it.
- **Findings against `fixtures/`.** That directory holds a deliberately imperfect build so the
  analysis has something to find, and it is not shipped in the npm package.

## Supported versions

Before `1.0.0`, only the latest published version is supported. Fixes go out as a new version; there
are no backports.

## Verifying what you installed

Releases are published from tags by [the publish workflow](.github/workflows/publish.yml) and carry
npm provenance, so npm can tell you which commit and which workflow run produced your tarball:

```bash
npm audit signatures
```

Anything other than a verified signature for `loadline` is worth reporting.
