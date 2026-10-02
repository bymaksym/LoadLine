// @ts-check
/**
 * ESLint with type information: used by the editor (.vscode/settings.json), by the `.ts` files of a
 * commit (lint-staged in package.json), by `pnpm run lint:types`, `pnpm run check` and CI.
 *
 * It is not in eslint.config.js because, to know what is a promise or a signal, it loads the whole
 * program with TypeScript: `pnpm run lint` and the `.html` files of a commit are spared that cost.
 * It includes every rule of eslint.config.js plus these.
 *
 * The rules come from typescript-eslint's `strictTypeChecked` and `stylisticTypeChecked`: unawaited
 * and misused promises, `any` leaking through (`no-unsafe-*`), deprecated APIs, conditions the
 * types say never change, assertions that change nothing. They replaced a hand-picked list of nine
 * on 02/10/2026, after measuring what the presets found in this code: 36 places, all fixed.
 *
 * Only the rules that need types are taken from them, plus the core rules they switch off in favour
 * of a type-aware twin. The rest of those presets is what eslint.config.js already applies through
 * `strict` and `stylistic`, with this project's options — taken whole, they would put the defaults
 * back over those options.
 */
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const baseConfig = require('./eslint.config.js');

/** @type {any} The exported type of the plugin does not declare its rules, which are there. */
const tsPlugin = tseslint.plugin;

/** @param {string} name */
const needsTypes = name =>
    Boolean(tsPlugin.rules?.[name.replace('@typescript-eslint/', '')]?.meta.docs?.requiresTypeChecking);

const typeAware = Object.fromEntries(
    [...tseslint.configs.strictTypeChecked, ...tseslint.configs.stylisticTypeChecked]
        .flatMap(config => Object.entries(config.rules ?? {}))
        .filter(([name, value]) => needsTypes(name) || (!name.includes('/') && value === 'off')),
);

module.exports = defineConfig([
    ...baseConfig,
    {
        files: ['src/**/*.ts', 'cli/**/*.ts'],
        languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname } },
        rules: {
            ...typeAware,

            // Options the measurement asked for.
            // Numbers are interpolated into text on every other line of this project, and a number
            // prints the same in a template as anywhere else. Without this, 671 places.
            '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
            // `() => this.open.set(false)` is a callback, not a value somebody reads.
            '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
            // `||` on a string is on purpose here: an empty folder name or an empty field means "not
            // there" exactly as `undefined` does, and `??` would keep the empty string.
            '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: { string: true } }],

            // What no preset has.
            // `if (this.loading)` instead of `if (this.loading())`: the signal always exists, so it is
            // always true.
            '@angular-eslint/no-uncalled-signals': 'error',
            // A `switch` over a union or an enum that does not cover every case.
            '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
            // A private field that is never reassigned is `readonly`.
            '@typescript-eslint/prefer-readonly': 'error',
        },
    },
]);
