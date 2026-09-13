#!/usr/bin/env node
/*
 * The executable. It is hand-written JavaScript and not compiled output for two reasons: it is the
 * only file that needs the shebang, and it is the only one that knows where the repository root is,
 * which is how `--version` gets the version without a copy of it in the source.
 *
 * Checked by `tsconfig.scripts.json`: `require` of a built path hands back `any`, so the one thing
 * worth writing down is what this file expects to find on the other side of it.
 */
// @ts-check

const { join } = require('node:path');

/** What `dist/cli/cli/main.js` exports. The command's whole interface to its own executable. */
/** @typedef {{ run: (argv: string[], version: string) => Promise<number> }} CompiledCli */

const root = join(__dirname, '..');
const entry = join(root, 'dist', 'cli', 'cli', 'main.js');

/** @type {CompiledCli | undefined} */
let main;
try {
    main = require(entry);
} catch {
    // Which of the two advices is right depends on where this file sits: inside `node_modules` it
    // is an install that arrived without its compiled half, and the fix is another install; in a
    // clone it is a checkout nobody has compiled yet, and the fix is the build script.
    const installed = __dirname.includes('node_modules');
    process.stderr.write(
        installed
            ? 'This install is missing its compiled analysis. Install it again: npm i -g loadline\n'
            : 'The command is not built yet. Run: pnpm build:cli\n',
    );
    process.exitCode = 2;
}

if (main) {
    const { version } = require(join(root, 'package.json'));
    main.run(process.argv.slice(2), version).then(
        code => {
            process.exitCode = code;
        },
        /** @param {unknown} error */
        error => {
            const stack = error instanceof Error ? error.stack : undefined;
            process.stderr.write(`${stack ?? String(error)}\n`);
            process.exitCode = 2;
        },
    );
}
