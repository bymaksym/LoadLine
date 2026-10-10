/**
 * Every tool finds its configuration, and nothing new lands in the root.
 *
 * Several of these tools, when they do not find their config, do not fail: they run on their own
 * defaults and report success. Prettier formats with its defaults, html-validate checks with its
 * `recommended` preset, cspell reads with an English dictionary and no word list, knip analyses
 * with no entry points, npm-check-updates proposes versions with no cooldown. A config renamed, moved
 * or deleted turns each of them into a check that passes for the wrong reason. So this asks each
 * one which config it is reading, rather than trusting that the file is where it should be.
 *
 * The other half is the root itself. It holds what the tools look for there and little else (see
 * the "Tooling" section of .github/CONTRIBUTING.md); a file that is not on ROOT_FILES is either a
 * config a generator dropped (`eslint --init`, `ng generate`) or one that should live in .config/.
 *
 * Usage: node tooling/check-config-found.mjs
 * Exit code 1 on any finding.
 */
// @ts-check
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Every file allowed at the root. Folders are not listed: they are not what clutters it. */
const ROOT_FILES = new Set([
    '.editorconfig',
    '.gitattributes',
    '.gitignore',
    '.htmlvalidate.mjs',
    '.mcp.json',
    '.ncurc.js',
    '.prettierignore',
    'AGENTS.md',
    'CHANGELOG.md',
    'CLAUDE.md',
    'LICENSE',
    'README.md',
    'action.yml',
    'angular.json',
    'eslint.config.js',
    'eslint.typed.config.js',
    'knip.jsonc',
    'loadline.html',
    'loadline.schema.json',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'tsconfig.app.json',
    'tsconfig.cli.json',
    'tsconfig.cli.spec.json',
    'tsconfig.json',
    'tsconfig.scripts.json',
    'tsconfig.spec.json',
]);

/** Configs a tool finds by this exact path (or is handed by it in one place). */
const REQUIRED = [
    'eslint.config.js',
    'knip.jsonc',
    '.ncurc.js',
    '.htmlvalidate.mjs',
    '.prettierignore',
    '.config/cspell.config.yaml',
    '.config/stylelintrc.mjs',
    '.config/commitlint.config.js',
    '.config/secretlintrc.json',
    '.config/secretlintignore',
    '.config/duplicates.json',
    '.github/release-please-config.json',
    '.github/release-please-manifest.json',
];

/**
 * What each tool that would fall back to its defaults says it is reading. Asked of the tool itself,
 * so a config it no longer picks up fails here even when the file is still on disk.
 *
 * @type {{ tool: string, args: string[], expect: RegExp }[]}
 */
const PROBES = [
    { tool: 'Prettier: config', args: ['prettier', '--find-config-path', 'src/main.ts'], expect: /^package\.json$/m },
    { tool: 'Prettier: ignore file', args: ['prettier', '--file-info', 'loadline.html'], expect: /"ignored": true/ },
    {
        tool: 'cspell',
        args: ['cspell', 'lint', '--no-progress', '--verbose', '--verbose', 'README.md'],
        expect: /Config Files Found:\s+\.config\/cspell\.config\.yaml/,
    },
    {
        tool: 'html-validate',
        args: ['html-validate', '--print-config', 'src/app/app.html'],
        expect: /html-validate-angular/,
    },
];

const findings = [];

const atRoot = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: ROOT,
    encoding: 'utf8',
})
    .split('\n')
    // `--cached` also lists what is deleted from the disk and not yet from the index.
    .filter(file => file && !file.includes('/') && existsSync(join(ROOT, file)));
for (const file of atRoot) {
    if (!ROOT_FILES.has(file)) {
        findings.push(`${file} is at the root and is not on ROOT_FILES: move it, or add it with the reason.`);
    }
}

for (const file of REQUIRED) {
    if (!existsSync(join(ROOT, file))) {
        findings.push(`${file} is missing, and the tool that reads it would run on its defaults.`);
    }
}

for (const { tool, args, expect } of PROBES) {
    // Through a shell, so `node_modules/.bin` resolves the same way the package.json scripts do,
    // `.cmd` shims on Windows included.
    const { stdout, stderr } = spawnSync(args.join(' '), {
        cwd: ROOT,
        encoding: 'utf8',
        shell: true,
        env: { ...process.env, PATH: `${join(ROOT, 'node_modules', '.bin')}${delimiter}${process.env['PATH'] ?? ''}` },
    });
    if (!expect.test(`${stdout}${stderr}`.replaceAll('\\', '/'))) {
        findings.push(
            `${tool}: it is not reading the config it should (\`${args.join(' ')}\` did not match ${String(expect)}).`,
        );
    }
}

if (findings.length > 0) {
    for (const finding of findings) {
        console.error(styleText('red', `✘ ${finding}`));
    }
    process.exit(1);
}
console.log(
    styleText(
        'green',
        `✔ ${PROBES.length} tools read their config, ${REQUIRED.length} configs in place, the root holds only what it should.`,
    ),
);
