/**
 * Registers the lockfile merge driver in this clone's LOCAL git config.
 *
 * Why a script and not documentation: `.gitattributes` says WHICH file uses the `pnpm-lock`
 * driver, but HOW that driver runs lives in `.git/config`, which is not versioned. Without this,
 * whoever clones the repository finds the attribute pointing at a driver that does not exist, and
 * git silently falls back to the ordinary line merge.
 *
 * It hangs off `prepare`, so the first `pnpm install` sets it up. It is idempotent.
 *
 * What the driver does: it takes the version from the branch being merged into (%A), puts it in
 * place as the working lockfile and regenerates it against the `package.json` git has already
 * merged. If `package.json` is in conflict too, pnpm fails on its markers and git marks the
 * lockfile as conflicted — a visible failure, which is the point: resolve package.json first.
 */
// @ts-check
import { execFileSync } from 'node:child_process';

const DRIVER_NAME = 'pnpm-lock';

// `%A` arrives as `$0` of the `sh -c`. `>&2` sends pnpm's chatter to stderr so the merge output
// stays readable.
const DRIVER_COMMAND =
    'sh -c \'cp -f "$0" pnpm-lock.yaml && pnpm install --lockfile-only >&2 && cp -f pnpm-lock.yaml "$0"\' %A';

/**
 * @param {string} key
 * @param {string} value
 */
const setConfig = (key, value) => {
    execFileSync('git', ['config', '--local', key, value], { stdio: 'ignore' });
};

try {
    setConfig(`merge.${DRIVER_NAME}.name`, 'Regenerate pnpm-lock.yaml instead of merging its lines');
    setConfig(`merge.${DRIVER_NAME}.driver`, DRIVER_COMMAND);
} catch {
    // Outside a git clone (a tarball, a CI container without `.git`) there is no config to touch,
    // and that must not take the install down with it.
}
