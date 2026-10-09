/**
 * Checks that no folder has grown into a drawer: at most 20 files in one, and no four modules
 * sharing a prefix outside a folder of that name.
 *
 * Neither the compiler nor ESLint looks at the shape of the tree, and it is the first thing somebody
 * new reads. A folder of forty files is opened and scrolled, not read; and eight files called
 * `render-*.ts` side by side are a folder that was never made — the prefix doing the job the
 * directory should. It was written after `core/analysis` reached 44 files, `core/findings` 40 and
 * `cli` 39, each of which split cleanly by what its files are about.
 *
 * The rules:
 *   1. **20 files per folder**, specs and type files included: a module with its spec and its types
 *      is three, so twenty is six or seven modules — what fits in one look.
 *   2. **4 modules with the same prefix** (`render-agent`, `render-json`, …) live in a folder named
 *      after it. Three is a coincidence; four is a group with a name.
 *
 * An exception goes in `MANY_FILES` or `PREFIXED` with its reason, like every other silence in this repository.
 * `fixtures/` is not looked at: those are real builds kept byte for byte, and their shape is the
 * bundler's.
 *
 * Usage: node tooling/check-folders.mjs
 * Exit code 1 when a folder breaks either rule.
 */
// @ts-check
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { posix } from 'node:path';

const MAX_FILES = 20;
const MIN_PREFIXED = 4;

/** Folders allowed past the file count, each with the reason. */
const MANY_FILES = new Map([
    [
        '.',
        'The configs of the tools, which find them at the root on their own (see "Tooling" in ' +
            'CONTRIBUTING.md). The ones that can be told where to look already live in .config/.',
    ],
]);

/** Folders allowed a group of prefixed modules, each with the reason. */
const PREFIXED = new Map([
    [
        'tooling',
        'The check-* scripts share a verb, not a subject — styles, the ESLint config, the folders — ' +
            'and each is a command package.json, CI and the hooks run by its path.',
    ],
]);

const SKIPPED = /^fixtures\//;

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
    .split('\n')
    .filter(file => file !== '' && !SKIPPED.test(file) && existsSync(file));

/** @type {Map<string, string[]>} */
const byFolder = new Map();
for (const file of files) {
    const folder = posix.dirname(file);
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), posix.basename(file)]);
}

/**
 * `report-nav.service.ts` → `report-nav`: the module a file belongs to, which is its name up to the
 * first dot. Its service, its types and its spec are one module, not three.
 */
const stemOf = (/** @type {string} */ name) => name.replace(/^_/, '').split('.')[0] ?? name;

/** @type {string[]} */
const problems = [];
for (const [folder, names] of [...byFolder].toSorted(([a], [b]) => a.localeCompare(b))) {
    if (names.length > MAX_FILES && !MANY_FILES.has(folder)) {
        problems.push(
            `${folder}/ has ${names.length} files, over ${MAX_FILES}: split it into folders by what they are about.`,
        );
    }

    /** @type {Map<string, Set<string>>} */
    const byPrefix = new Map();
    for (const stem of new Set(names.map(name => stemOf(name)))) {
        const [prefix] = stem.split('-');
        if (prefix && prefix !== stem) {
            byPrefix.set(prefix, (byPrefix.get(prefix) ?? new Set()).add(stem));
        }
    }
    for (const [prefix, stems] of byPrefix) {
        if (stems.size >= MIN_PREFIXED && posix.basename(folder) !== prefix && !PREFIXED.has(folder)) {
            problems.push(
                `${folder}/ has ${stems.size} modules called ${prefix}-*: they go in a folder ${folder}/${prefix}/.`,
            );
        }
    }
}

if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
}
console.log(
    `${byFolder.size} folders, none over ${MAX_FILES} files or holding a group of ${MIN_PREFIXED} prefixed modules.`,
);
