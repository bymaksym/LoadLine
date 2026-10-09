/**
 * The rounds against real applications, as a check rather than an afternoon.
 *
 * Twice in two days a round against open-source apps found a dozen things no test had: a rule written
 * for one bundler that broke another, a figure five per cent short. Each round was by hand — clone,
 * build, run, read — and nothing kept what it had learnt. The next rule could break Sapper again and
 * nobody would see it until the round after.
 *
 * `apps.json` names each application by repository and commit, how to build it and what to point
 * Loadline at. `expected/<report>.json` is what the report said the last time somebody read it and
 * agreed. Two steps:
 *
 *   node tooling/rounds/rounds.mjs build [name…]    clone, install and build into the rounds folder
 *   node tooling/rounds/rounds.mjs [check] [name…]  run Loadline on each build and compare
 *       --update   write what came out as the expected report, after reading the differences
 *       --strict   a build that is not there fails, instead of being skipped
 *
 * The rounds folder is `LOADLINE_ROUNDS`, or `../loadline-rounds` next to the repository: gigabytes of
 * `node_modules` that have no business inside it. An app that needs an older Node (`"node": "12"`)
 * builds with the one in `LOADLINE_ROUNDS_NODE_12`, a folder holding that `node`; without it the
 * build is skipped and says so. Some builds need a hand on the way (`notes`): the script prints them.
 *
 * What is compared is a summary, not the whole report: the figures, the screens and the signals by
 * kind and title. A change in any of them is either the point of the change being made — then
 * `--update`, with the reason in the commit — or a regression on a build nobody was looking at.
 *
 * Usage: node tooling/rounds/rounds.mjs [build|check] [--update] [--strict] [name…]
 */
// @ts-check
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';

/** @param {string} text */
const bold = text => styleText('bold', text);
/** @param {string} text */
const dim = text => styleText('dim', text);
/** @param {string} text */
const green = text => styleText('green', text);
/** @param {string} text */
const red = text => styleText('red', text);
/** @param {string} text */
const yellow = text => styleText('yellow', text);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const EXPECTED = path.join(HERE, 'expected');
const ROUNDS = process.env['LOADLINE_ROUNDS'] ?? path.resolve(ROOT, '..', 'loadline-rounds');

/**
 * @typedef {{ name: string, target: string, args?: string[] }} Report
 * @typedef {{
 *   name: string, repo: string, commit: string, framework: string, node?: string, cwd?: string,
 *   install: string[], build: string[], notes?: string, reports: Report[]
 * }} App
 */

/** @type {App[]} */
const APPS = JSON.parse(readFileSync(path.join(HERE, 'apps.json'), 'utf8')).apps;

const args = process.argv.slice(2);
const step = args[0] === 'build' || args[0] === 'check' ? args[0] : 'check';
const flags = new Set(args.filter(arg => arg.startsWith('--')));
const names = args.filter(arg => !arg.startsWith('--') && arg !== step);
const chosen = names.length > 0 ? APPS.filter(app => names.includes(app.name)) : APPS;
const unknown = names.filter(name => !APPS.some(app => app.name === name));
if (unknown.length > 0) {
    console.error(red(`Not in apps.json: ${unknown.join(', ')}.`));
    process.exit(2);
}

/**
 * Runs one command of a build, through the shell, with the Node the app asks for.
 *
 * @param {string} command
 * @param {string} cwd
 * @param {string | null} nodeFolder
 */
const run = (command, cwd, nodeFolder) => {
    const env = { ...process.env };
    if (nodeFolder) {
        env['PATH'] = `${nodeFolder}${path.delimiter}${env['PATH'] ?? ''}`;
    }
    console.log(dim(`  $ ${command}`));
    const result = spawnSync(command, { cwd, env, shell: true, stdio: 'inherit' });
    return result.status === 0;
};

/** @param {App} app */
const build = app => {
    console.log(bold(`\n${app.name}`) + dim(` · ${app.repo}@${app.commit} · ${app.framework}`));
    const nodeFolder = app.node ? (process.env[`LOADLINE_ROUNDS_NODE_${app.node}`] ?? null) : null;
    if (app.node && !nodeFolder) {
        console.log(yellow(`  skipped: needs Node ${app.node}; set LOADLINE_ROUNDS_NODE_${app.node} to its folder.`));
        return true;
    }

    const checkout = path.join(ROUNDS, app.name);
    // A rounds folder may keep the builds and nothing else — the outputs are what `check` reads, and
    // the checkouts are gigabytes — and `git checkout` there said "not a git repository".
    if (existsSync(checkout) && !existsSync(path.join(checkout, '.git'))) {
        console.log(red(`  ${checkout} holds a build and no checkout: move it away to build this app again.`));
        return false;
    }
    if (!existsSync(checkout)) {
        mkdirSync(ROUNDS, { recursive: true });
        if (!run(`git clone https://github.com/${app.repo}.git ${app.name}`, ROUNDS, null)) {
            return false;
        }
    }
    if (!run(`git checkout --force ${app.commit}`, checkout, null)) {
        return false;
    }
    if (app.notes) {
        console.log(yellow(`  note: ${app.notes}`));
    }

    const cwd = path.join(checkout, app.cwd ?? '.');
    return [...app.install, ...app.build].every(command => run(command, cwd, nodeFolder));
};

/**
 * What of a report is compared: the figures, the screens and the signals. Long texts are left
 * out — a reworded explanation is reviewed in `sample-report.json` — and the title of each signal
 * stays, because it carries the figure the signal is about.
 *
 * @param {any} report the `--format json` output
 */
const summaryOf = report => ({
    // A refusal is an answer too: `{ ok: false, error: { code } }`, and a build refused today and
    // read tomorrow is the change worth seeing.
    refused: report.ok === false && report.error ? report.error.code : null,
    mode: report.mode,
    boot: { bytes: report.boot?.bytes, rawBytes: report.boot?.rawBytes, files: report.boot?.files },
    firstTrip: report.firstTrip ? { total: report.firstTrip.total, files: report.firstTrip.files } : null,
    serverOutputs: report.serverOutputs,
    offPage: report.offPage,
    screens: (report.screens ?? []).map(
        /** @param {any} screen */ screen =>
            `${screen.label}: own ${screen.own}, shared ${screen.shared}, total ${screen.total}`,
    ),
    deferred: (report.deferred ?? []).map(/** @param {any} entry */ entry => `${entry.label} ${entry.bytes}`),
    shared: (report.shared ?? []).length,
    workers: (report.workers ?? []).length,
    onDemand: (report.onDemand ?? []).length,
    data: (report.data ?? []).length,
    signals: (report.findings ?? []).map(
        /** @param {any} finding */ finding => `${finding.severity} ${finding.kind}: ${withoutHashes(finding.title)}`,
    ),
});

/**
 * A title with webpack's long content hashes taken out of the names it quotes: Angular 8 rebuilt
 * from the same commit named `main-es2015.37572af1b074b9470efb.js` where the expected report had
 * `c38895c2…`, and the round said "changed" about a build that had not.
 *
 * @param {string} title
 */
const withoutHashes = title => title.replaceAll(/([.-])[\da-f]{16,}(?=\.)/g, '$1#');

/**
 * The differences between two summaries, one line each, by the path to what changed.
 *
 * @param {unknown} expected
 * @param {unknown} actual
 * @param {string} at
 * @returns {string[]}
 */
const differences = (expected, actual, at = '') => {
    if (JSON.stringify(expected) === JSON.stringify(actual)) {
        return [];
    }
    if (Array.isArray(expected) && Array.isArray(actual) && expected.every(item => typeof item === 'string')) {
        const gone = expected.filter(item => !actual.includes(item)).map(item => `${at}: − ${item}`);
        const added = actual.filter(item => !expected.includes(item)).map(item => `${at}: + ${item}`);
        return gone.length + added.length > 0 ? [...gone, ...added] : [`${at}: same entries, another order`];
    }
    if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
        const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])];
        return keys.flatMap(key =>
            differences(
                /** @type {Record<string, unknown>} */ (expected)[key],
                /** @type {Record<string, unknown>} */ (actual)[key],
                at ? `${at}.${key}` : key,
            ),
        );
    }
    return [`${at}: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`];
};

/** How long a run may take before it is reported: a slow regular expression is a hung command. */
const SLOW_MS = 30_000;

/**
 * @param {App} app
 * @param {Report} report
 * @returns {'same' | 'changed' | 'missing' | 'failed'}
 */
const check = (app, report) => {
    const target = path.join(ROUNDS, app.name, report.target);
    if (!existsSync(target)) {
        console.log(`${yellow('not built')}  ${report.name} ${dim(`(${target})`)}`);
        return 'missing';
    }

    const started = Date.now();
    const result = spawnSync(
        process.execPath,
        [path.join(ROOT, 'bin', 'loadline.js'), target, '--format', 'json', '--no-cache', ...(report.args ?? [])],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    );
    const took = Date.now() - started;
    let parsed;
    try {
        parsed = JSON.parse(result.stdout);
    } catch {
        console.log(`${red('failed')}     ${report.name}: ${(result.stderr || result.stdout).trim().split('\n')[0]}`);
        return 'failed';
    }

    const actual = summaryOf(parsed);
    const file = path.join(EXPECTED, `${report.name}.json`);
    const slow = took > SLOW_MS ? yellow(` · ${Math.round(took / 1000)} s`) : '';
    if (flags.has('--update')) {
        mkdirSync(EXPECTED, { recursive: true });
        writeFileSync(file, `${JSON.stringify(actual, null, 4)}\n`);
        console.log(`${green('written')}    ${report.name}${slow}`);
        return 'same';
    }
    if (!existsSync(file)) {
        console.log(`${yellow('no expected')} ${report.name}: run with --update to keep what it says now`);
        return 'changed';
    }

    const lines = differences(JSON.parse(readFileSync(file, 'utf8')), actual);
    if (lines.length === 0) {
        console.log(`${green('same')}       ${report.name}${slow}`);
        return 'same';
    }
    console.log(`${red('changed')}    ${report.name}${slow}`);
    for (const line of lines) {
        console.log(`             ${line}`);
    }
    return 'changed';
};

if (step === 'build') {
    const failed = chosen.filter(app => !build(app));
    if (failed.length > 0) {
        console.error(red(`\nBuild failed: ${failed.map(app => app.name).join(', ')}.`));
        process.exit(1);
    }
} else {
    if (!existsSync(path.join(ROOT, 'dist', 'cli'))) {
        console.error(red('The command is not compiled: pnpm run build:cli first.'));
        process.exit(2);
    }
    console.log(dim(`Rounds folder: ${ROUNDS}\n`));
    const results = chosen.flatMap(app => app.reports.map(report => check(app, report)));
    const count = /** @param {string} kind */ kind => results.filter(result => result === kind).length;
    console.log(
        `\n${count('same')} same · ${count('changed')} changed · ${count('failed')} failed · ${count('missing')} not built`,
    );
    const missingFails = flags.has('--strict') && count('missing') > 0;
    process.exit(count('changed') + count('failed') > 0 || missingFails ? 1 : 0);
}
