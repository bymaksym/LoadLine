/**
 * Looks for copied code with jscpd: identical blocks in two `.ts`, `.html` or `.scss` files under
 * `src/` and `cli/`. It is there to show "this is written out in three places" so somebody can
 * decide whether to extract it.
 *
 * It informs, it does not block: in `pnpm run check` it is `soft`, like knip. A copy breaks nothing,
 * and sometimes extracting it costs more than it saves.
 *
 * Deliberate copies go in `allowed` in .config/duplicates.json, as pairs of files with the reason. Pairs and
 * not single files: excluding a whole file would also hide whatever gets copied out of it into a
 * third one. When an accepted pair stops having copies, it says so, so the entry can go.
 *
 * `minTokens` is the smallest copy that counts. With jscpd's default (50) the import blocks and the
 * component headers show up, which repeat by convention; with 100, only logic and markup with content.
 *
 * Tests are left out: repeating the setup in every spec is normal.
 *
 * Usage: node tooling/validate-duplicates.mjs
 */
// @ts-check
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JSCPD_BIN = path.join(ROOT, 'node_modules', 'jscpd', 'run-jscpd.js');

/** @type {{ minTokens: number, allowed: { files: [string, string], reason: string }[] }} */
const config = JSON.parse(readFileSync(path.join(ROOT, '.config/duplicates.json'), 'utf8'));

/**
 * @param {string} a
 * @param {string} b
 */
const pairKey = (a, b) => [a, b].sort().join('\n');
const allowed = new Map(config.allowed.map(({ files: [a, b], reason }) => [pairKey(a, b), reason]));

const outDir = mkdtempSync(path.join(tmpdir(), 'jscpd-'));

/** @typedef {{ name: string, start: number, end: number }} CloneSide */
/** @type {{ duplicates: { lines: number, firstFile: CloneSide, secondFile: CloneSide }[] }} */
let report;
try {
    const { status, stderr } = spawnSync(
        process.execPath,
        [
            JSCPD_BIN,
            'src',
            'cli',
            '--pattern',
            '**/*.{ts,html,scss}',
            '--ignore',
            '**/*.spec.ts,src/styles/_fonts.scss',
            '--min-tokens',
            String(config.minTokens),
            '--absolute',
            '--reporters',
            'json',
            '--output',
            outDir,
            '--silent',
            '--no-tips',
        ],
        { cwd: ROOT, encoding: 'utf8' },
    );

    if (status !== 0) {
        console.error(red(`jscpd failed (exit code ${status}).`), stderr);
        process.exit(1);
    }

    report = JSON.parse(readFileSync(path.join(outDir, 'jscpd-report.json'), 'utf8'));
} finally {
    rmSync(outDir, { recursive: true, force: true });
}

/**
 * On Windows jscpd returns absolute paths with the long-path prefix `\\?\`.
 *
 * @param {string} file
 */
const relative = file =>
    path
        .relative(ROOT, file.replace(/^\\\\\?\\/, ''))
        .split(path.sep)
        .join('/');

/** @type {Map<string, { files: string[], lines: number, blocks: string[] }>} */
const pairs = new Map();
for (const clone of report.duplicates) {
    const a = relative(clone.firstFile.name);
    const b = relative(clone.secondFile.name);
    const key = pairKey(a, b);
    const pair = pairs.get(key) ?? { files: [a, b].sort(), lines: 0, blocks: [] };

    pair.lines += clone.lines;
    pair.blocks.push(
        `${a}:${clone.firstFile.start}-${clone.firstFile.end}  ↔  ${b}:${clone.secondFile.start}-${clone.secondFile.end}`,
    );
    pairs.set(key, pair);
}

const reported = [...pairs.entries()]
    .filter(([key]) => !allowed.has(key))
    .map(([, pair]) => pair)
    .sort((x, y) => y.lines - x.lines);
const staleAllowed = [...allowed.keys()].filter(key => !pairs.has(key));

for (const pair of reported) {
    const [a, b] = pair.files;
    console.log(`${bold(`${pair.lines} lines`)}  ${a === b ? `inside ${a}` : `${a}  ↔  ${b}`}`);
    for (const block of pair.blocks) {
        console.log(dim(`    ${block}`));
    }
}

for (const key of staleAllowed) {
    console.log(
        yellow(
            `No copies left between ${key.replace('\n', ' and ')}: remove it from allowed in .config/duplicates.json.`,
        ),
    );
}

const totalLines = reported.reduce((sum, pair) => sum + pair.lines, 0);

if (reported.length === 0) {
    console.log(
        green(`No copies of ${config.minTokens} tokens or more outside the ones accepted in .config/duplicates.json.`),
    );
    process.exit(0);
}

console.log(
    red(`\n${reported.length} pairs of files with copied code (${totalLines} lines).`),
    'If a copy is deliberate, add the pair to allowed in .config/duplicates.json with the reason.',
);
process.exit(1);
