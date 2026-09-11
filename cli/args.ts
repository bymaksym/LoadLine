/**
 * Reading the command line. No dependency for this on purpose: the whole surface is a handful of
 * long flags, and an argument parser would be the only runtime dependency of a tool whose point is
 * that it does not need one.
 */

import { MODES as MODE_LIST } from '../src/app/core/criteria/criteria';
import { type Mode } from '../src/app/core/criteria/criteria.types';
import { type Lang, LANGS as LANG_LIST } from '../src/app/core/i18n/ui-strings';
import { parseSize } from '../src/app/core/project/project-context';
import { type FailOn, type Options, type OutputFormat, type ParsedArgs } from './args.types';

// The two lists the page also uses. Written out again here, they drifted: adding a language would
// have been accepted by the page and rejected by the command.
const MODES = new Set<string>(MODE_LIST);
const LANGS = new Set<string>(LANG_LIST);
const FORMATS = new Set<string>(['text', 'json', 'markdown', 'pr-comment', 'sarif', 'summary']);
const SEVERITIES = new Set<string>(['high', 'mid', 'none']);

/** Flags that take a value. Everything else is a switch, which is how a missing value gets caught. */
const WITH_VALUE = new Set([
    '--dist',
    '--baseline',
    '--export',
    '--project',
    '--mode',
    '--lang',
    '--format',
    '--criteria',
    '--config',
    '--lock',
    '--audit',
    '--what-if',
    '--max-boot',
    '--max-screen',
    '--max-own',
    '--max-growth',
    '--max-growth-pct',
    '--fail-on',
]);

const EMPTY: Options = {
    target: '',
    dist: null,
    baseline: null,
    export: null,
    project: null,
    mode: null,
    criteria: null,
    config: null,
    lock: null,
    audit: null,
    whatIf: [],
    lang: 'en',
    format: 'text',
    gates: {
        maxBoot: null,
        maxScreen: null,
        maxOwn: null,
        maxGrowth: null,
        maxGrowthRatio: null,
        failOn: 'none',
        failOnNewPackage: false,
    },
    color: true,
    help: false,
    version: false,
    selfCheck: false,
};

/** A percentage as it is written on the command line (`10`) into the fraction the code compares. */
const parsePercent = (value: string): number | null => {
    const number = Number(value.replace('%', ''));
    return Number.isFinite(number) && number >= 0 ? number / 100 : null;
};

const sizeError = (flag: string, value: string): string =>
    `${flag} takes a size like 350kB, 1.5MB or a number of bytes, not "${value}".`;

/**
 * Applies one flag to the options. Returns the message when the value cannot be used, so every
 * rejection names the flag it was about instead of saying "invalid arguments".
 */
const apply = (options: Options, flag: string, value: string, positional: string[]): string | null => {
    switch (flag) {
        case '-h':
        case '--help': {
            options.help = true;
            return null;
        }
        case '-V':
        case '--version': {
            options.version = true;
            return null;
        }
        case '--no-color': {
            options.color = false;
            return null;
        }
        case '--self-check': {
            options.selfCheck = true;
            return null;
        }
        case '--dist': {
            options.dist = value;
            return null;
        }
        case '--baseline': {
            options.baseline = value;
            return null;
        }
        case '--export': {
            options.export = value;
            return null;
        }
        case '--project': {
            options.project = value;
            return null;
        }
        case '--criteria': {
            options.criteria = value;
            return null;
        }
        case '--config': {
            options.config = value;
            return null;
        }
        case '--lock': {
            options.lock = value;
            return null;
        }
        case '--audit': {
            options.audit = value;
            return null;
        }
        case '--what-if': {
            options.whatIf.push(value);
            return null;
        }
        case '--fail-on-new-package': {
            options.gates.failOnNewPackage = true;
            return null;
        }
        case '--mode': {
            options.mode = value as Mode;
            return MODES.has(value) ? null : `--mode takes raw, gzip or brotli, not "${value}".`;
        }
        case '--lang': {
            options.lang = value as Lang;
            return LANGS.has(value) ? null : `--lang takes en or es, not "${value}".`;
        }
        case '--format': {
            options.format = value as OutputFormat;
            return FORMATS.has(value)
                ? null
                : `--format takes text, json, markdown, pr-comment, sarif or summary, not "${value}".`;
        }
        case '--fail-on': {
            options.gates.failOn = value as FailOn;
            return SEVERITIES.has(value) ? null : `--fail-on takes high, mid or none, not "${value}".`;
        }
        case '--max-boot': {
            options.gates.maxBoot = parseSize(value);
            return options.gates.maxBoot === null ? sizeError(flag, value) : null;
        }
        case '--max-screen': {
            options.gates.maxScreen = parseSize(value);
            return options.gates.maxScreen === null ? sizeError(flag, value) : null;
        }
        case '--max-own': {
            options.gates.maxOwn = parseSize(value);
            return options.gates.maxOwn === null ? sizeError(flag, value) : null;
        }
        case '--max-growth': {
            options.gates.maxGrowth = parseSize(value);
            return options.gates.maxGrowth === null ? sizeError(flag, value) : null;
        }
        case '--max-growth-pct': {
            options.gates.maxGrowthRatio = parsePercent(value);
            return options.gates.maxGrowthRatio === null ? `--max-growth-pct takes a number, not "${value}".` : null;
        }
        default: {
            if (flag.startsWith('-')) {
                return `Unknown flag: ${flag}`;
            }
            positional.push(flag);
            return null;
        }
    }
};

/** `--flag=value` and `--flag value` are the same thing; this turns the first into the second. */
const expand = (argv: string[]): string[] =>
    argv.flatMap(argument => {
        const equals = argument.startsWith('--') ? argument.indexOf('=') : -1;
        return equals > 0 ? [argument.slice(0, equals), argument.slice(equals + 1)] : [argument];
    });

export const parseArgs = (argv: string[]): ParsedArgs => {
    const options: Options = { ...EMPTY, gates: { ...EMPTY.gates } };
    const args = expand(argv);
    const positional: string[] = [];

    for (let index = 0; index < args.length; index++) {
        const flag = args[index] ?? '';
        const takesValue = WITH_VALUE.has(flag);
        const value = takesValue ? args[++index] : undefined;
        if (takesValue && value === undefined) {
            return { ok: false, message: `${flag} needs a value.` };
        }

        const failed = apply(options, flag, value ?? '', positional);
        if (failed) {
            return { ok: false, message: failed };
        }
    }

    if (options.help || options.version) {
        return { ok: true, options };
    }

    const target = positional[0];
    if (!target) {
        return { ok: false, message: 'Missing the stats.json or the build folder to analyse.' };
    }
    if (positional.length > 1) {
        return { ok: false, message: `Unexpected argument: ${positional[1]}` };
    }

    return { ok: true, options: { ...options, target } };
};

export const USAGE = `Loadline — weight per screen, from the terminal.

Usage
  loadline <stats.json|build folder> [options]

  A build folder works on its own: its chunks carry the import graph, so anything that emits ES
  modules — Vite, Rollup, Rolldown, esbuild — is read without a stats file. It has to hold the
  index.html of the build, which is what names the chunk the application starts at.

Reading the build
  --dist <folder>          The build output (the "browser" folder). Gives gzip figures, brotli when
                           it carries .br files, and exact per-file weights when it carries .js.map.
                           Not needed when the folder is what is being analysed.
  --baseline <file>        A previous stats.json or a Loadline export, to compare against.
  --export <file>          Write this build's snapshot there, to be the --baseline of a later run.
                           The other half of --baseline, and the only one a build that writes no
                           stats.json has: a folder read as a graph could be compared against a
                           baseline and never produce one.
  --lock <file>            pnpm-lock.yaml, package-lock.json or yarn.lock. Says which packages you
                           did not ask for directly and what pulls each one in.
  --audit <file.json>      The output of "pnpm audit --json" or "npm audit --json". Crossed with
                           what actually ships: "3 of your 47 are in the first load" instead of
                           "you have 47". Nothing is fetched — both files are ones you already have.
  --project <folder>       Where angular.json, package.json and the pipeline file live. Adds the
                           budget checks. Not read unless asked for.
  --mode raw|gzip|brotli   Which figure the report is in. Default: the best --dist allows.
  --criteria <file.json>   Thresholds replacing the recommended ones. The Criteria tab of the page
                           writes this file with its "Download criteria" button.
  --config <file.json>     loadline.json: the thresholds, the gates and the signals the team has
                           decided to live with, kept next to the code. Without the flag, a
                           loadline.json in the working directory is read if there is one. Flags on
                           the command line win over the file.

Output
  --format <format>             text (default), json, markdown, pr-comment or sarif.
                                pr-comment writes the comment a bot leaves on a merge request, with
                                an HTML marker so the next run edits it instead of adding a
                                sixteenth one. sarif anchors each signal to a file, which is what
                                GitHub's code scanning reads.
  --lang en|es                  Default: en.
  --no-color                    Never emit colour. It is off already when stdout is not a terminal.

Failing the build
  --max-boot <size>        Fail when the bootstrap is over it.
  --max-screen <size>      Fail when the total download of a screen is over it.
  --max-own <size>         Fail when the own code of a screen is over it.
  --max-growth <size>      With --baseline: fail when the bootstrap or a screen grows by more.
  --max-growth-pct <n>     The same, as a percentage.
  --fail-on high|mid|none  Fail when a signal of that severity is raised. Default: none.
  --fail-on-new-package    Fail when a package enters the bootstrap that was not in the baseline,
                           or that the "packages" list of loadline.json does not name.

Asking what if
  --what-if <name>         What the first load would weigh without that package, folder or file —
                           the figure to have BEFORE spending the afternoon. Exact: the graph is
                           walked without those files, and what stops being reachable is what stops
                           being downloaded. It does not re-chunk the build, so the round trips and
                           the per-screen totals are not recomputed and the output says so.
                           Repeatable.

Checking the tool itself
  --self-check             Work the bootstrap out twice — once by walking the import graph, once
                           by closing what index.html announces — and fail when the two disagree.
                           It says nothing about the bundle: it catches the build changing shape
                           under Loadline, which is how the figures go wrong without an error.
                           Needs the index.html, so pass the build folder or add --dist. Prints
                           the check and nothing else.

Exit codes
  0  ran, nothing broke a gate.
  1  a gate broke.
  2  the arguments or the files could not be used.

Examples
  loadline dist/app/browser
  loadline dist/app/stats.json --dist dist/app/browser
  loadline dist/app/stats.json --dist dist/app/browser --max-boot 350kB --fail-on high
  loadline dist/app/stats.json --baseline prev/stats.json --max-growth 20kB --format json
  loadline dist --export loadline-baseline.json
  loadline dist --baseline loadline-baseline.json --max-growth 20kB
  loadline dist/app/stats.json --dist dist/app/browser --self-check
`;
