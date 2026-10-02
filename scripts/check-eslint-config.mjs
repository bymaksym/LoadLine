/**
 * Checks eslint.config.js for what no linter reports about its own configuration:
 *
 *   - a rule written by hand that changes nothing, because a preset it extends (or an earlier block)
 *     already sets it exactly so. On 02/10/2026 there were eight, from `no-var` to `prefer-const`:
 *     a list that looks like decisions and is not, and that hides which lines really are.
 *   - a deprecated rule still switched on, which stops getting fixes and, one major later, stops
 *     existing.
 *
 * Conflicts with Prettier are the other half of a sound configuration, and eslint-config-prettier
 * already ships a checker for them (`pnpm run lint:prettier`).
 *
 * How a duplicate is found, with no list of presets to keep in sync: the blocks a preset brings are
 * named by ESLint (`… > unicorn/recommended`) and the project's own are not. For every rule of an
 * own block, the block is rebuilt without it and ESLint is asked for the settings it ends with on
 * real files that block applies to. Identical on all of them means the line can go.
 *
 * Usage: node scripts/check-eslint-config.mjs
 * Exit code 1 on a duplicate or on a deprecated rule that is not in ALLOWED_DEPRECATED.
 */
// @ts-check
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { matchesGlob } from 'node:path';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';

import { ESLint } from 'eslint';
import { builtinRules } from 'eslint/use-at-your-own-risk';

/** Deprecated, still on, and why. Anything not here fails. */
const ALLOWED_DEPRECATED = new Map([
    [
        'quotes',
        'bans backtick strings with nothing interpolated, which Prettier does not; its successor lives in @stylistic, a dependency for one rule',
    ],
]);

/** How many real files per block are asked about. Enough to cover its globs, few enough to be quick. */
const SAMPLES = 6;

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);

/** @type {any[]} */
const config = require('../eslint.config.js');

const candidates = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
})
    .split('\n')
    .filter(file => /\.(?:ts|html|mjs|js)$/.test(file));

// What ESLint never looks at (fixtures, the built page) has no settings to compare.
const reference = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: config });
const ignored = await Promise.all(candidates.map(async file => reference.isPathIgnored(file)));
const tracked = candidates.filter((_file, index) => !ignored[index]);

/**
 * @param {any} block
 * @param {string} file
 */
const applies = (block, file) => {
    /** @param {unknown} pattern */
    const match = pattern => typeof pattern === 'string' && matchesGlob(file, pattern);
    const files = /** @type {unknown[] | undefined} */ (block.files);
    const ignores = /** @type {unknown[] | undefined} */ (block.ignores) ?? [];
    return (files === undefined || files.some(match)) && !ignores.some(match);
};

/**
 * Evenly spread over the matching files, so one block's sample is not six files of one folder.
 *
 * @param {any} block
 */
const samplesOf = block => {
    const matching = tracked.filter(file => applies(block, file));
    const step = Math.max(1, Math.floor(matching.length / SAMPLES));
    return matching.filter((_file, index) => index % step === 0).slice(0, SAMPLES);
};

/**
 * The rule settings ESLint ends with for each file, under a given configuration.
 *
 * @param {any[]} blocks
 * @param {string[]} files
 */
const settingsFor = async (blocks, files) => {
    const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: blocks });
    return Promise.all(files.map(async file => /** @type {any} */ (await eslint.calculateConfigForFile(file))));
};

/** @param {unknown} value */
const severityOf = value => (Array.isArray(value) ? value[0] : value);

// ---------------------------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------------------------
/** @type {string[]} */
const duplicates = [];
const own = config.filter(block => !block.name && block.rules);

for (const block of own) {
    const samples = samplesOf(block);
    if (samples.length === 0) {
        continue;
    }
    const before = await settingsFor(config, samples);

    for (const rule of Object.keys(block.rules)) {
        const { [rule]: _left, ...rest } = block.rules;
        const without = config.map(other => (other === block ? { ...block, rules: rest } : other));
        const after = await settingsFor(without, samples);
        const same = samples.every(
            (_file, index) => JSON.stringify(before[index].rules[rule]) === JSON.stringify(after[index].rules[rule]),
        );
        if (same) {
            duplicates.push(`${rule}  (block for ${JSON.stringify(block.files ?? 'every file')})`);
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Deprecated rules still on
// ---------------------------------------------------------------------------------------------
/**
 * @param {any} settings
 * @param {string} name
 */
const metaOf = (settings, name) => {
    const slash = name.lastIndexOf('/');
    if (slash === -1) {
        return builtinRules.get(name)?.meta;
    }
    return settings.plugins?.[name.slice(0, slash)]?.rules?.[name.slice(slash + 1)]?.meta;
};

/** @type {Map<string, string>} */
const deprecated = new Map();
const everyKind = [...new Set(own.flatMap(block => samplesOf(block).slice(0, 1)))];
for (const settings of await settingsFor(config, everyKind)) {
    for (const [name, value] of Object.entries(settings.rules ?? {})) {
        const on = severityOf(value) !== 0 && severityOf(value) !== 'off';
        const meta = metaOf(settings, name);
        if (on && meta?.deprecated && !ALLOWED_DEPRECATED.has(name)) {
            /** @type {unknown[]} */
            const by = meta.replacedBy ?? meta.deprecated?.replacedBy ?? [];
            // Either a rule name or, in the newer format, `{ plugin: { name }, rule: { name } }`.
            const names = by.map(entry =>
                typeof entry === 'string'
                    ? entry
                    : [/** @type {any} */ (entry).plugin?.name, /** @type {any} */ (entry).rule?.name]
                          .filter(Boolean)
                          .join(' → '),
            );
            deprecated.set(name, names.join(', ') || 'nothing named');
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------
for (const line of duplicates) {
    console.log(`${styleText('yellow', 'duplicate')}   ${line}`);
}
for (const [name, by] of deprecated) {
    console.log(`${styleText('yellow', 'deprecated')}  ${name}  replaced by ${by}`);
}

if (duplicates.length === 0 && deprecated.size === 0) {
    console.log(
        styleText('green', `No hand-written rule repeats what is already set, and no deprecated rule is on`),
        styleText('dim', `(${own.length} own blocks checked; allowed: ${[...ALLOWED_DEPRECATED.keys()].join(', ')}).`),
    );
    process.exit(0);
}

console.log(
    styleText('red', `\n${duplicates.length} duplicate(s), ${deprecated.size} deprecated rule(s).`),
    'Delete a duplicate line; replace a deprecated rule, or say why it stays in ALLOWED_DEPRECATED.',
);
process.exit(1);
