/**
 * Runs knip with `KNIP_DISABLE_RAW_TRANSFER=1`. Everything that runs knip goes through here: the
 * package.json scripts, `pnpm run check`, the pre-push hook and CI.
 *
 * Without the variable the parser (oxc) reserves a 6 GiB virtual buffer per file. On Windows that
 * reservation counts against the commit limit and fails with `RangeError: Array buffer allocation
 * failed` when the machine is busy. Knip swallows the error (`catch {}`), so the file it could not
 * read contributes no imports and everything that file imported shows up as an "Unused file": 326
 * false ones against 4 real ones, measured in another project built from the same template. With
 * the variable it parses a little slower, and the result no longer depends on free memory.
 *
 * The variable is set here and not in the package.json script because `VAR=1 cmd` does not work
 * in the Windows cmd shell.
 *
 * Usage: node scripts/knip.mjs [knip options]
 */
// @ts-check
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const knipBin = fileURLToPath(new URL('../node_modules/knip/bin/knip.js', import.meta.url));

const { status } = spawnSync(process.execPath, [knipBin, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, KNIP_DISABLE_RAW_TRANSFER: '1' },
});

process.exit(status ?? 1);
