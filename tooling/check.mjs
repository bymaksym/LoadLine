/**
 * A review of the project in one pass: types, tests, the project's own contracts (styles in scope,
 * accessibility, spelling, dead and copied code), secrets, the state of the dependencies and, at the
 * end, the style and format autofix.
 *
 * `pnpm run check` opens a picker with the default checks ticked (space ticks, enter runs). They come
 * in five groups, ordered by "what ruins my day first": what stops the tool from working, then the
 * project's own rules that fail silently, then leaked secrets, then the dependencies, and style last
 * — which, besides, does not report, it fixes.
 *
 * Several start unticked and not because they matter less: they add nothing to the everyday
 * diagnosis. Either they take a while and get run on their own anyway (the tests, the build), or
 * they write to the repository and that is decided by hand. Ticking one costs a space.
 *
 * Why a script and not a chain of `&&` in package.json: chained, the first failure stops the run and
 * only that one is seen. Here EVERY chosen check runs and a summary at the end says what passes and
 * what does not, which is what is needed to decide where to start.
 *
 * The ones marked `writes` write to the repository, and they are of two kinds: dependency
 * maintenance (which rewrites the lockfile) and the style autofix (which rewrites source files).
 * The picker labels them `writes files`, and they **only run with somebody at the keyboard**:
 * neither `--all`, nor `--defaults`, nor a run without a terminal launches them, ticked or not.
 * Writing to the repository is a decision, and a pipeline is in no position to take it.
 *
 * ⚠️ The consequence: without a terminal, style is NOT checked through this script. CI runs
 * `prettier --check` and `eslint` on its own (.github/workflows/ci.yml), not through here.
 *
 * Run them on a clean tree and commit what comes out separately. For the dependency ones it matters
 * more than it looks: a lockfile diff is tens of thousands of lines, and mixed with a feature it
 * makes `git bisect` useless and forces reverting both together.
 *
 * `pnpm run fix-all` (`--fix`) is the shortcut when you ONLY want the autofix: the three fixers one
 * after the other (Prettier last), no picker, with the summary. As a chain of `&` in package.json,
 * Linux and macOS ran them at the same time, ESLint and Prettier writing the same file.
 *
 * The ones marked `soft` report but do NOT fail the exit code:
 *   - knip      → an unused export is worth seeing and not worth stopping anything for.
 *   - jscpd     → a copy breaks nothing, and sometimes extracting it costs more than it saves.
 *   - peers     → being ahead of the range another dependency asks for is sometimes on purpose.
 *   - audit     → needs the network, and without it would fail for something that is not ours.
 *   - outdated  → being one version behind is not a defect.
 *
 * Usage:  node tooling/check.mjs [--all | --defaults | --fix]
 *       --all       runs every check that does NOT write, without asking.
 *       --defaults  runs the ticked-by-default ones without asking (still none that writes).
 *       --fix       runs only the style and format autofix (`fix`). It writes to the repository,
 *                   but asking for it with this option is already somebody's decision.
 *
 * With no interactive terminal (CI, redirected output) it does not ask: it behaves as `--defaults`.
 * Exits with 1 if any check that is not `soft` fails, so it can be hooked into CI.
 */
// @ts-check
import { spawnSync } from 'node:child_process';
import { delimiter } from 'node:path';
import { clearScreenDown, emitKeypressEvents, moveCursor } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';

/**
 * `cmd` runs through a shell, so binaries resolve through the `node_modules/.bin` pnpm puts on the
 * PATH of a script. `on` is only the box ticked when the picker opens. `writes` marks the ones that
 * write to the repository: labelled, and never run without a terminal. `group` opens a block in the
 * picker; the following entries hang from it until the next `group`. `fix` marks the style and
 * format autofix, the only thing `--fix` runs.
 *
 * @typedef {{
 *   title: string,
 *   cmd: string,
 *   on: boolean,
 *   group?: string,
 *   soft?: boolean,
 *   writes?: boolean,
 *   fix?: boolean,
 * }} Check
 */

/** @type {Check[]} */
const CHECKS = [
    // 1. What breaks the tool. First, because if this fails the rest hardly matters.
    { group: 'Correctness', title: 'Types (TypeScript)', cmd: 'pnpm run typecheck', on: true },
    { title: 'Lint (ESLint)', cmd: 'eslint', on: true },
    // Loads the whole program, so it takes about as long as a typecheck: unticked.
    {
        title: 'Lint with types (unawaited promises, uncalled signals)',
        cmd: 'eslint --config eslint.typed.config.js',
        on: false,
    },
    { title: 'Formatting (Prettier)', cmd: 'prettier --check .', on: true },
    // The lint configuration itself: a rule fighting Prettier (each fixes what the other just wrote),
    // a hand-written rule that repeats a preset, a deprecated rule still on.
    {
        title: 'ESLint rules that fight Prettier',
        cmd: 'eslint-config-prettier src/main.ts src/app/app.html cli/main.ts tooling/check.mjs',
        on: true,
    },
    // Rebuilds the configuration once per hand-written rule, so it takes about twenty seconds.
    { title: 'ESLint rules duplicated or deprecated', cmd: 'node tooling/check-eslint-config.mjs', on: false },
    { title: 'Tests (Vitest: page and command)', cmd: 'pnpm test', on: false },
    // The production build, then Loadline reading it twice and comparing: the check that notices
    // when Angular changes the shape of its output. It takes the longest of all.
    { title: 'Build and self-check', cmd: 'pnpm run build:cli && pnpm run self:check', on: false },

    // 2. The project's own rules that neither the compiler nor ESLint see, and that fail silently: a
    // class no stylesheet in scope declares, a `var(--x)` with no `--x`, a header cell with no
    // scope, a typo on the page, a file nobody imports any more.
    { group: 'Project contracts', title: 'Styles (Stylelint)', cmd: 'stylelint "src/**/*.scss"', on: true },
    { title: 'Classes in scope (check-styles)', cmd: 'node tooling/check-styles.mjs', on: true },
    // A folder of forty files, or eight `render-*.ts` side by side, is a folder nobody made.
    { title: 'Folders that need splitting (check-folders)', cmd: 'node tooling/check-folders.mjs', on: true },
    // A tool that does not find its config runs on its defaults and passes: this asks each one.
    { title: 'Every tool reads its config', cmd: 'node tooling/check-config-found.mjs', on: true },
    { title: 'Accessibility of the HTML (html-validate)', cmd: 'html-validate "src/**/*.html"', on: true },
    { title: 'Spelling of the text (cspell)', cmd: 'cspell lint --no-progress --no-summary', on: true },
    { title: 'Translation keys nothing reads', cmd: 'node tooling/validate-i18n.mjs', on: true },
    { title: 'Unused code and dependencies (knip)', cmd: 'node tooling/knip.mjs', on: true, soft: true },
    { title: 'Copied code (jscpd)', cmd: 'node tooling/validate-duplicates.mjs', on: true, soft: true },

    // 3. Credentials pasted where they should not be. It blocks, and is NOT `soft` on purpose: a
    // committed secret is already in the history, so removing it means rewriting that and rotating
    // the credential anyway.
    {
        group: 'Security',
        title: 'Secrets in the code (secretlint)',
        // Through the script: its config is in .config/, which secretlint does not search.
        cmd: 'pnpm run -s secrets:scan',
        on: true,
    },

    // 4. In the order they have to run: `update` moves within the ranges and leaves duplicate copies,
    // `dedupe` collapses them, and `dedupe --check` confirms none is left. Then which
    // vulnerabilities are still alive and what has fallen behind.
    // ⚠️ `update` does NOT cross majors: it stays within the ranges of package.json. A major is
    // another task, with `ng update` (which also migrates the code) or picked by hand in
    // `pnpm run deps:update`.
    {
        group: 'Dependencies',
        title: 'Update dependencies (within the ranges)',
        cmd: 'pnpm update',
        on: true,
        writes: true,
    },
    { title: 'Collapse lockfile duplicates', cmd: 'pnpm dedupe', on: true, writes: true },
    { title: 'Duplicates in the lockfile', cmd: 'pnpm dedupe --check', on: true },
    // A version outside the range another dependency asks for (e.g. a TypeScript newer than the one
    // the Angular builder accepts). It does not block: sometimes that is on purpose.
    { title: 'Incompatible versions between dependencies', cmd: 'pnpm peers check', on: true, soft: true },
    { title: 'Known vulnerabilities', cmd: 'pnpm audit --audit-level high', on: true, soft: true },
    // The cooldown and the Angular-bound limits are in .ncurc.js.
    { title: 'Outdated dependencies', cmd: 'ncu', on: true, soft: true },

    // 5. These three do NOT report: they fix. They are `pnpm run fix-all` (`--fix`), and they go last
    // because the rest of the report is already printed when they start rewriting; Prettier last, to
    // format whatever the other two touched. What they report is what they could NOT fix, which is
    // the only part that asks for a decision. Prettier never leaves such a remainder, so its row is
    // always green. ESLint with types, as in the editor and the commit: without them its fixes
    // would not be applied (an `as` too many, a missing `readonly`).
    {
        group: 'Style and format (fixes)',
        title: 'ESLint with types',
        cmd: 'eslint --config eslint.typed.config.js --fix',
        on: false,
        writes: true,
        fix: true,
    },
    { title: 'Styles (Stylelint)', cmd: 'stylelint --fix "src/**/*.scss"', on: false, writes: true, fix: true },
    { title: 'Format (Prettier)', cmd: 'prettier --write --list-different .', on: false, writes: true, fix: true },
];

const OK = 'ok';
const WARN = 'warn';
const FAIL = 'fail';

// `styleText` returns plain text when the output is not a terminal (`pnpm run check > log.txt`, a
// pipeline) or when the system asks for no colour (NO_COLOR). Written by hand, the codes came out
// anyway and left unreadable `[32m` scattered through the report.
/** @param {string} text */
const bold = text => styleText('bold', text);
/** @param {string} text */
const dim = text => styleText('dim', text);
/** @param {string} text */
const green = text => styleText('green', text);
/** @param {string} text */
const cyan = text => styleText('cyan', text);

// Moving and hiding the cursor is not colour, so it does not go through `styleText`. Only the picker
// uses it, and the picker never opens without an interactive terminal.
const HIDE_CURSOR = '\u001B[?25l';
const SHOW_CURSOR = '\u001B[?25h';

// ---------------------------------------------------------------------------------------------
// Picker
// ---------------------------------------------------------------------------------------------

/**
 * The lines of the menu. Rebuilt whole on every key, so it keeps no state.
 *
 * @param {boolean[]} chosen
 * @param {number} cursor
 */
const menuLines = (chosen, cursor) => [
    bold('What to check'),
    dim('↑↓ move · space tick · a all/none · enter run · esc quit'),
    // `flatMap` because an entry with `group` takes three lines (gap, group title and itself). The
    // cursor indexes CHECKS, not lines, so inserting headers does not throw it off.
    ...CHECKS.flatMap((check, index) => {
        const pointer = index === cursor ? cyan('❯') : ' ';
        const box = chosen[index] ? green('◉') : '○';
        const title = index === cursor ? bold(check.title) : check.title;

        // `writes files` first: it is what has to be seen BEFORE pressing space, not after.
        const tags = [check.writes && 'writes files', check.soft && 'does not block'].filter(Boolean);

        const line = ` ${pointer} ${box} ${title}${tags.length > 0 ? `  ${dim(`(${tags.join(' · ')})`)}` : ''}`;

        return check.group ? ['', `   ${dim(check.group.toUpperCase())}`, line] : [line];
    }),
    '',
];

/**
 * Resolves with the ticked array, or with `null` when cancelled.
 *
 * @returns {Promise<boolean[] | null>}
 */
const askChecks = () =>
    new Promise(resolve => {
        const chosen = CHECKS.map(check => check.on);
        let cursor = 0;
        let printed = 0;

        const draw = () => {
            // Go up to the start of the previous block and clear from there: repainting it whole
            // avoids keeping track of which line changed.
            if (printed > 0) {
                moveCursor(process.stdout, 0, -printed);
                clearScreenDown(process.stdout);
            }

            const lines = menuLines(chosen, cursor);
            printed = lines.length;

            process.stdout.write(`${lines.join('\n')}\n`);
        };

        /** @param {boolean[] | null} result */
        const finish = result => {
            process.stdin.off('keypress', onKey);
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdout.write(SHOW_CURSOR);

            resolve(result);
        };

        /**
         * @param {string} _char
         * @param {{ name?: string, ctrl?: boolean }} key
         */
        const onKey = (_char, key) => {
            if (key.ctrl && key.name === 'c') {
                finish(null);
                return;
            }

            switch (key.name) {
                case 'escape': {
                    finish(null);
                    return;
                }
                case 'return': {
                    finish(chosen);
                    return;
                }
                case 'up': {
                    cursor = (cursor - 1 + CHECKS.length) % CHECKS.length;
                    break;
                }
                case 'down': {
                    cursor = (cursor + 1) % CHECKS.length;
                    break;
                }
                case 'space': {
                    chosen[cursor] = !chosen[cursor];
                    break;
                }
                case 'a': {
                    chosen.fill(!chosen.every(Boolean));
                    break;
                }
                default: {
                    return;
                }
            }

            draw();
        };

        emitKeypressEvents(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdout.write(HIDE_CURSOR);
        process.stdin.on('keypress', onKey);

        draw();
    });

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------
const runAll = process.argv.includes('--all');
const fixOnly = process.argv.includes('--fix');
const noPrompt = runAll || process.argv.includes('--defaults') || !process.stdin.isTTY || !process.stdout.isTTY;

// The ones that write NEVER run without asking — not with `--all`, not with `--defaults`, not in CI —
// however they come ticked: rewriting the lockfile is a decision, and a decision needs somebody at
// the keyboard. That is why the filter is here and not in `--all`; this way `on: true` still serves
// to leave them ticked when the picker opens, which is its only legitimate use.
/** @returns {Promise<boolean[] | null>} */
const pickChecks = async () => (noPrompt ? CHECKS.map(check => !check.writes && (runAll || check.on)) : askChecks());
const chosen = fixOnly ? CHECKS.map(check => Boolean(check.fix)) : await pickChecks();

if (chosen === null) {
    console.log('\nCancelled\n');
    process.exit(130);
}

const selected = CHECKS.filter((_check, index) => chosen[index]);

if (selected.length === 0) {
    console.log('\nNothing is ticked\n');
    process.exit(0);
}

// `pnpm run check` already puts `node_modules/.bin` on the PATH; `node tooling/check.mjs` does not,
// and every check would fail in 0.0 s with "command not found". Adding it here makes both work. On
// Windows the variable is spelt `Path`, and a second `PATH` next to it would be ignored.
const BIN = fileURLToPath(new URL('../node_modules/.bin', import.meta.url));
const pathKey = Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
const env = { ...process.env, [pathKey]: `${BIN}${delimiter}${process.env[pathKey] ?? ''}` };

/** @type {(Check & { state: string, ms: number })[]} */
const results = [];

for (const check of selected) {
    console.log(`\n${bold(`▶ ${check.title}`)}\n  ${dim(check.cmd)}\n`);

    const startedAt = Date.now();
    const { status } = spawnSync(check.cmd, { shell: true, stdio: 'inherit', env });
    const ms = Date.now() - startedAt;

    results.push({ ...check, state: status === 0 ? OK : check.soft ? WARN : FAIL, ms });
}

// ---------------------------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------------------------
/** @type {Record<string, string>} */
const ICONS = { [OK]: '✔', [WARN]: '⚠', [FAIL]: '✘' };
const width = Math.max(...results.map(result => result.title.length));

console.log(`\n${bold('─── Summary ───')}\n`);

for (const { title, state, ms } of results) {
    console.log(`  ${ICONS[state]} ${title.padEnd(width)}  ${state.padEnd(5)} ${(ms / 1000).toFixed(1)}s`);
}

const failed = results.filter(result => result.state === FAIL);
const warned = results.filter(result => result.state === WARN);

console.log(
    failed.length === 0
        ? `\n✔ No failures${warned.length > 0 ? ` (${warned.length} warning(s) that do not block)` : ''}\n`
        : `\n✘ ${failed.length} check(s) failed: ${failed.map(result => result.title).join(', ')}\n`,
);

process.exit(failed.length === 0 ? 0 : 1);
