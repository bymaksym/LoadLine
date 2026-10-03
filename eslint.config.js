// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const eslintConfigPrettier = require('eslint-config-prettier');
const unusedImports = require('eslint-plugin-unused-imports');
const unicorn = require('eslint-plugin-unicorn').default;
const simpleImportSort = require('eslint-plugin-simple-import-sort');
/** @type {any} */
const importX = require('eslint-plugin-import-x');
const { createTypeScriptImportResolver } = require('eslint-import-resolver-typescript');
/** @type {any} */
const regexp = require('eslint-plugin-regexp');
const eslintComments = require('@eslint-community/eslint-plugin-eslint-comments');
/** @type {any} */
const baselineJs = require('eslint-plugin-baseline-js').default;
/** @type {any} */
const vitest = require('@vitest/eslint-plugin');
/** @type {any} */
const angularModern = require('eslint-plugin-angular-modern');

module.exports = defineConfig([
    {
        // `loadline.html` is the self-contained build artifact (JS inlined by scripts/inline-build.mjs).
        // `fixtures/vite-app/dist` is a bundler's output kept byte for byte; the sources next to it are
        // a throwaway application, not code this project ships. `.claude/**` holds the worktrees
        // agents work in: whole copies of the repository that would be linted twice.
        ignores: ['.angular/**', '.claude/**', 'coverage/**', 'dist/**', 'fixtures/**', 'loadline.html'],
    },
    // Flag `// eslint-disable` comments that no longer suppress anything (no zombie disables).
    {
        linterOptions: {
            reportUnusedDisableDirectives: 'error',
        },
    },
    {
        files: ['**/*.ts'],
        plugins: {
            'unused-imports': unusedImports,
            'simple-import-sort': simpleImportSort,
            'import-x': importX,
            '@eslint-community/eslint-comments': eslintComments,
        },
        extends: [
            eslint.configs.recommended,
            tseslint.configs.strict,
            tseslint.configs.stylistic,
            angular.configs.tsRecommended,
            unicorn.configs.recommended,
            // Regular expressions: backtracking that can hang on a long input, redundant classes,
            // escapes that do nothing. This project reads minified bundles of several megabytes with
            // them, which is exactly the input that turns a slow pattern into a hung command.
            regexp.configs['flat/recommended'],
            eslintConfigPrettier,
        ],
        processor: angular.processInlineTemplates,
        // Without a resolver, import-x looks the tsconfig aliases (@core, @shared, @state) up as
        // packages in node_modules: it fails and retries on every import, and it cannot see that two
        // spellings name the same file. Measured in another project from the same template:
        // no-duplicates + no-self-import went from 157 ms to 45 ms per file.
        settings: {
            'import-x/resolver-next': [createTypeScriptImportResolver({ project: 'tsconfig.json' })],
        },
        rules: {
            // Angular best practices
            '@angular-eslint/directive-selector': [
                'error',
                {
                    type: 'attribute',
                    prefix: 'app',
                    style: 'camelCase',
                },
            ],
            '@angular-eslint/component-selector': [
                'error',
                {
                    type: ['attribute', 'element'],
                    prefix: 'app',
                    style: 'kebab-case',
                },
            ],
            '@angular-eslint/prefer-output-readonly': 'error',
            '@angular-eslint/prefer-signals': 'error',
            '@angular-eslint/component-class-suffix': 'off', // Angular >= 20 convention
            '@angular-eslint/no-async-lifecycle-method': 'error',
            '@angular-eslint/no-attribute-decorator': 'error',
            '@angular-eslint/sort-lifecycle-methods': 'error',
            '@angular-eslint/contextual-decorator': 'error',
            '@angular-eslint/no-duplicates-in-metadata-arrays': 'error',
            '@angular-eslint/no-lifecycle-call': 'error',
            '@angular-eslint/use-lifecycle-interface': 'error',

            // TypeScript best practices
            '@typescript-eslint/consistent-indexed-object-style': 'off',
            // Inline `import type` for type-only imports (inline avoids clashing with import-x/no-duplicates)
            '@typescript-eslint/consistent-type-imports': [
                'error',
                { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
            ],
            '@typescript-eslint/explicit-member-accessibility': [
                'error',
                {
                    accessibility: 'no-public',
                },
            ],
            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: 'variable',
                    format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
                    // The same convention no-unused-vars reads: `_previous` is taken out on purpose.
                    leadingUnderscore: 'allow',
                },
                {
                    selector: 'interface',
                    format: ['PascalCase'],
                },
                {
                    selector: 'typeAlias',
                    format: ['PascalCase'],
                },
                {
                    selector: 'class',
                    format: ['PascalCase'],
                },
            ],
            '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],
            '@typescript-eslint/no-shadow': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    vars: 'all',
                    varsIgnorePattern: '^_',
                    args: 'all',
                    argsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
            '@typescript-eslint/no-inferrable-types': [
                'error',
                {
                    ignoreProperties: true,
                },
            ],
            '@typescript-eslint/no-redeclare': [
                'error',
                {
                    ignoreDeclarationMerge: false,
                },
            ],

            // JavaScript best practices
            eqeqeq: 'error',
            curly: 'error',
            'guard-for-in': 'error',
            'no-bitwise': 'error',
            'no-new-wrappers': 'error',
            'no-useless-concat': 'error',
            'one-var': ['error', 'never'],
            'func-style': 'error',
            'prefer-arrow-callback': 'error',
            'no-eval': 'error',
            'array-callback-return': ['error', { checkForEach: true }],
            'no-constructor-return': 'error',
            'no-promise-executor-return': 'error',
            'no-self-compare': 'error',
            'no-template-curly-in-string': 'error',
            'no-unmodified-loop-condition': 'error',
            'no-unreachable-loop': 'error',
            'require-atomic-updates': 'error',
            camelcase: 'error',
            'no-console': ['error', { allow: ['debug', 'error'] }],
            // Past ~400 lines of actual code a file stops being read top to bottom and starts
            // being searched. Blank lines and comments do not count: this project comments a lot,
            // and a limit that punishes comments pushes exactly the wrong way. The files over it
            // today have their own entry further down, each with the reason.
            'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
            // Project convention turned into a rule: every read/write of localStorage goes through
            // the one module that guards it with try/catch (private mode, blocked storage).
            'no-restricted-globals': [
                'error',
                {
                    name: 'localStorage',
                    message: 'Persist through core/session/local-store.ts, which guards localStorage.',
                },
            ],
            'no-else-return': ['error', { allowElseIf: false }],
            'no-extend-native': 'error',
            'no-lonely-if': 'error',
            'no-param-reassign': 'error',
            'no-return-assign': 'error',
            'no-throw-literal': 'error',
            'object-shorthand': 'error',
            'prefer-template': 'error',
            radix: 'error',
            yoda: 'error',
            quotes: [
                'error',
                'single',
                {
                    avoidEscape: true,
                    allowTemplateLiterals: false,
                },
            ],
            'require-await': 'error',

            // Unused imports
            'unused-imports/no-unused-vars': 'off',
            'unused-imports/no-unused-imports': 'error',

            // Sort imports: Angular, third-party, the project's own aliases, then relatives.
            'simple-import-sort/imports': [
                'error',
                {
                    groups: [
                        [
                            '^\\u0000', // Side effect imports (polyfills, etc.)
                            '^node:', // Node.js built-ins
                            '^@angular', // Angular core imports
                            '^(?!@(core|shared|state)/)@?\\w', // Third-party packages (rxjs, vitest, etc.)
                            '^@(core|shared|state)/', // Project layers (see `paths` in tsconfig.json)
                            '^\\.\\.', // Parent relative imports (..)
                            '^\\./', // Sibling relative imports (./)
                            '^.+\\.s?css$', // Style imports (SCSS, CSS)
                        ],
                    ],
                },
            ],
            'simple-import-sort/exports': 'error',

            // Import
            'import-x/no-duplicates': 'error',
            'import-x/no-self-import': 'error',
            'import-x/no-useless-path-segments': 'error',
            'import-x/newline-after-import': 'error',

            // A silence names its rule and says why, and a disable has its enable: the reason sits
            // next to the line that needs it, and a forgotten `eslint-enable` cannot switch a rule
            // off for the rest of the file by accident.
            '@eslint-community/eslint-comments/require-description': 'error',
            '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
            '@eslint-community/eslint-comments/disable-enable-pair': ['error', { allowWholeFile: true }],

            // Unicorn
            'unicorn/no-null': 'off',
            'unicorn/consistent-function-scoping': 'off', // Angular: helpers next to the component that uses them
            'unicorn/prefer-https': 'off',
            'unicorn/consistent-class-member-order': 'off',
            'unicorn/prefer-minimal-ternary': 'off',
            'unicorn/prefer-await': 'off',
            'unicorn/consistent-boolean-name': 'off',
            'unicorn/no-computed-property-existence-check': 'off',
            'unicorn/no-top-level-side-effects': 'off',
            'unicorn/no-optional-chaining-on-undeclared-variable': 'off',
            'unicorn/prefer-iterator-to-array': 'off',
            'unicorn/class-reference-in-static-methods': 'off',
            'unicorn/name-replacements': 'off',
            'unicorn/no-array-reduce': 'off', // `reduce` is idiomatic for building maps/totals; very opinionated rule
            'unicorn/no-non-function-verb-prefix': 'off', // false positives with signals (`store`, `filter`)
            'unicorn/prefer-simple-condition-first': 'off', // cosmetic short-circuit tweak; clashes with intentional guard order
            'unicorn/max-nested-calls': 'off', // computed(() => ...map(...)) chains exceed depth 3 naturally
            'unicorn/single-line-block-comment-style': 'off', // its fixer turns `/** summary */` into a multi-line block without `*` prefixes
            'unicorn/better-dom-traversing': 'off', // false positives: tree nodes have `children` and are not DOM elements
            // New in unicorn 76 (02/10/2026). A ternary only when both branches fit on one line: a guard
            // returning a whole object stays an `if`, where the condition and the result read apart.
            'unicorn/prefer-ternary': ['error', 'only-single-line'],
            // It asks for `Set#difference()` / `#intersection()`, which do not exist on Node 20 (they
            // arrived in 22), and `src/app/core` is also the command that `engines` promises runs on
            // 20.19. Following it would pass every check here and break `npx` for that floor with
            // "difference is not a function". Measured on 02/10/2026 with Node 20.19.0.
            'unicorn/prefer-set-methods': 'off',
            '@angular-eslint/no-input-rename': 'off',
        },
    },
    // The rules that need types (unawaited promises, uncalled signals, non-exhaustive switches) live
    // in eslint.typed.config.js, which extends this one: they load the whole program, and
    // `pnpm run lint` and the `.html` files of a commit have no reason to pay for that.
    {
        // The page runs in whatever browser opens loadline.html, so it only uses what every current
        // browser has had for over two years ("widely available"). The command shares
        // `src/app/core` but runs on Node, whose floor is `engines` and the CI job that holds it.
        files: ['src/**/*.ts'],
        ignores: ['src/**/*.spec.ts'],
        plugins: { 'baseline-js': baselineJs },
        rules: {
            'baseline-js/use-baseline': [
                'error',
                {
                    available: 'widely',
                    includeWebApis: { preset: 'auto', useTypes: 'off' },
                    includeJsBuiltins: { preset: 'auto', useTypes: 'off' },
                },
            ],
        },
    },
    {
        // Modern Angular, as a guard rather than a cleanup: on 02/10/2026 none of these had a single
        // hit. Only what angular-eslint does not already cover. Left out on purpose, as in the
        // project this list comes from: the injection-context rules, which cannot follow a call from
        // the constructor into a private method and were 26 false positives out of 26 there.
        files: ['src/**/*.ts'],
        plugins: { 'angular-modern': angularModern },
        rules: {
            // Modules: each component imports the piece it uses, and a whole module is not tree-shaken.
            'angular-modern/no-commonmodule': 'error',
            'angular-modern/no-routermodule': 'error',
            'angular-modern/no-applicationmodule': 'error',
            'angular-modern/no-browsermodule': 'error',
            'angular-modern/no-createngmodule': 'error',
            'angular-modern/no-platformbrowser': 'error',
            'angular-modern/no-platformbrowserdynamic': 'error',
            'angular-modern/no-httpclientmodule': 'error',
            'angular-modern/no-browseranimationsmodule': 'error',
            'angular-modern/no-noopanimationsmodule': 'error',
            'angular-modern/no-routertestingmodule': 'error',
            'angular-modern/no-httpclienttestingmodule': 'error',
            // Functional guards and interceptors, `inject()` rather than the constructor, signal
            // inputs and outputs, host bindings in the decorator, `[class.x]` rather than `ngClass`.
            'angular-modern/no-canactivate-class': 'error',
            'angular-modern/no-canactivatechild-class': 'error',
            'angular-modern/no-candeactivate-class': 'error',
            'angular-modern/no-canmatch-class': 'error',
            'angular-modern/no-canload-class': 'error',
            'angular-modern/no-resolve-class': 'error',
            'angular-modern/no-httpinterceptor-class': 'error',
            'angular-modern/no-httpinterceptors-token': 'error',
            'angular-modern/no-withinterceptorsfromdi': 'error',
            'angular-modern/no-constructor-injection': 'error',
            'angular-modern/no-inject-decorator': 'error',
            'angular-modern/no-provider-deps': 'error',
            'angular-modern/no-input-decorator': 'error',
            'angular-modern/no-output-decorator': 'error',
            'angular-modern/no-hostbinding-decorator': 'error',
            'angular-modern/no-hostlistener-decorator': 'error',
            'angular-modern/no-ngclass': 'error',
            'angular-modern/no-ngstyle': 'error',
            // The page has no zone.js (the analysis even reports that as a virtue in other builds):
            // `NgZone` and eager change detection would not do what they promise.
            'angular-modern/no-zonejs-import': 'error',
            'angular-modern/no-providezonechangedetection': 'error',
            'angular-modern/no-ngzone': 'error',
            'angular-modern/no-eager-change-detection': 'error',
            'angular-modern/no-ngdocheck': 'error',
        },
    },
    {
        // `src/app/core` is the analysis, and the command runs the very same files on Node with no
        // dependencies installed. So it imports only itself: an import of the page (`features`,
        // `state`, `shared`), of Angular or of any package would pass every check of the page and
        // break `npx` at the first `require`, and a `node:` module would break the page. On
        // 02/10/2026 it already held — not one such import — and this is what keeps it so.
        files: ['src/app/core/**/*.ts'],
        ignores: ['src/app/core/**/*.spec.ts'],
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            regex: String.raw`^(?!\.{1,2}/|@core/)`,
                            message:
                                'src/app/core runs in the command too, with no dependencies installed: import only from core itself.',
                        },
                        {
                            group: ['**/features/**', '**/state/**', '**/shared/**'],
                            message: 'src/app/core must not reach into the page: the command runs it without one.',
                        },
                    ],
                },
            ],
        },
    },
    {
        // What Node 20.19 does not have, in the code the command runs. `engines` promises that floor,
        // and the browser check above cannot hold it: Baseline is about browsers, `Object.groupBy` is
        // already "widely" there and missing on 20, and an instance method like `difference` cannot
        // be recognised without types. Measured on 02/10/2026: `new Set().difference` is `undefined`
        // on Node 20.19.0.
        files: ['src/app/core/**/*.ts', 'cli/**/*.ts'],
        rules: {
            'no-restricted-properties': [
                'error',
                ...[
                    'difference',
                    'intersection',
                    'union',
                    'symmetricDifference',
                    'isSubsetOf',
                    'isSupersetOf',
                    'isDisjointFrom',
                ].map(property => ({
                    property,
                    message: 'Set methods arrived in Node 22 and the command runs on 20.19: loop with `has()` instead.',
                })),
                ...[
                    ['Object', 'groupBy'],
                    ['Map', 'groupBy'],
                    ['Promise', 'withResolvers'],
                    ['Array', 'fromAsync'],
                ].map(([object, property]) => ({
                    object,
                    property,
                    message: `${object}.${property} is missing on Node 20.19, which the command still runs on.`,
                })),
            ],
        },
    },
    {
        // Deliberate uses of what is not "widely" yet. The clipboard is called inside a `try` whose
        // `catch` is the ordinary answer (a refused clipboard says nothing and changes nothing).
        // `main.ts` is the bootstrap the Angular CLI writes: a module script, so top-level await is
        // there by construction, and esbuild lowers it for the browsers the build targets.
        files: ['src/app/shared/clipboard.utils.ts', 'src/main.ts'],
        plugins: { 'baseline-js': baselineJs },
        rules: {
            'baseline-js/use-baseline': [
                'error',
                {
                    available: 'widely',
                    includeWebApis: { preset: 'auto', useTypes: 'off' },
                    includeJsBuiltins: { preset: 'auto', useTypes: 'off' },
                    ignoreFeatures: ['async-clipboard', 'top-level-await'],
                },
            ],
        },
    },
    {
        // Tests: a forgotten `it.only`, an `expect` outside a test or inside an `if`.
        files: ['**/*.spec.ts'],
        extends: [vitest.configs.recommended],
        rules: {
            // Vitest takes a message as the second argument (`expect(value, finding.kind)`), which is
            // what says which item of a loop failed. The rule's default of one is Jest's.
            'vitest/valid-expect': ['error', { maxArgs: 2 }],
            // In a test `!` is the assertion itself: "this fixture has a graph". If it does not, the
            // test fails on the spot, which is what a guard would have been written to do anyway.
            '@typescript-eslint/no-non-null-assertion': 'off',
        },
    },
    {
        // The only place that touches localStorage: it is the guard the rule is asking for, and
        // the services go through it. It used to be two services named here, which meant the third
        // one that needed to remember something had to argue with the rule instead of reusing them.
        files: ['src/app/core/session/local-store.ts'],
        rules: {
            'no-restricted-globals': 'off',
        },
    },
    {
        // Translation dictionaries: one line per string, no logic. A line ceiling on a list of
        // words would only force it to be split by the alphabet, which helps nobody. The signals'
        // text is the same thing in a different place: both languages of one signal have to be
        // read side by side, and splitting the file by signal would scatter exactly that.
        files: ['src/app/core/i18n/en.ts', 'src/app/core/i18n/es.ts', 'src/app/core/findings/finding-text.ts'],
        rules: {
            'max-lines': 'off',
        },
    },
    {
        // The two files already over the limit, kept on purpose (see ROADMAP §10): the store's
        // save/restore reads half a dozen signals and extracting it would trade one big file for
        // two coupled ones. The caps are their current size plus a little slack, so they can be
        // edited but not grown. Lower them if either one shrinks.
        // Raised from 515 on 04/09/2026 for the hand marks (CHECKLIST §3): a signal, the two
        // commands that write it and the three lines that save and restore it with the session.
        // Raised again to 575 on 04/09/2026: picking which application of a workspace is read, the
        // criteria export, and rejecting a YAML that turns out not to be a pipeline.
        // Raised again to 620 on 04/09/2026 (CHECKLIST §4): a build folder with no stats file now
        // produces the graph itself, which is a second way in — reading it, saying so, and taking
        // it away again when the folder goes.
        // Raised to 625 the same day (CHECKLIST §7.7): how far the folder has got through being
        // compressed. Tens of megabytes go through one file at a time and the page used to say
        // nothing about it; this is the signal and the two lines that keep it honest.
        // Raised to 655 on 04/09/2026 (CHECKLIST §5): the built-in example — loading it and saying
        // it is not your build — and the one method that hands the diagnostics module what it
        // needs. Both are entry points into the store, which is where entry points live.
        // Raised to 675 on 06/09/2026: the stylesheets the page asks for. They are read from the
        // folder, cleared with it, saved with the session and restored from it, which is four
        // places because that is how many places every other thing the folder brings lives in.
        // Raised to 695 the same day (IDEAS §C): the rest of the folder — the fonts, the pictures,
        // what nothing names. The reading itself is in `core/intake/folder-assets.ts`, precisely
        // because it is not state; what is here is one signal, one call and the line that clears it.
        // Raised to 730 the same day (IDEAS §D and §26): what an update costs, and the split between
        // the signals of this build and the ones about a comparison. The split is not padding — a
        // snapshot carries its signals so the next one can say which are new, and one computed
        // holding both would depend on itself.
        // Raised again to 840 the same day (IDEAS §25): the measurements this browser keeps —
        // reading them, adding one, exporting them, forgetting them. Four entry points, which is
        // what a memory with a way out costs.
        // Raised to 800 the same day (IDEAS §F): the lock file, the audit report and `loadline.json`
        // are three more things that can be dropped, and each is a signal, a line that routes it and
        // a line that clears it. The reading of all three is in `core/`, and routing a drop is now a
        // method of its own rather than a chain of `else if`, which is where the seventh kind of
        // file would have gone wrong.
        // Raised to 860 on 10/09/2026 (CHECKLIST §2.3 and §2.4): the environment a pasted
        // measurement observes, and the hosts `index.html` fetches from. Each is one derived
        // signal plus the lines that save and restore it with the session; the reading of both is
        // in `core/`.
        // Raised to 870 the same day (CHECKLIST §5): the five answers reaching the signals that
        // were withholding a colour for want of them. The answers themselves live in a service and
        // the arithmetic in `core/situation/`; what is here is reading them and passing them on.
        // Raised to 880 on 02/10/2026: where a file nothing names lives in the repository, read off
        // the `assets` of `angular.json`. One derived value and its import; the mapping is in `core/`,
        // and loading a build `loadline --html` wrote went to `app.ts` rather than here.
        // Lowered to 865 the same day: the signals from the folder were written out twice, once per
        // list of findings, and are one private method now (857 lines after it).
        files: ['src/app/state/report.store.ts'],
        rules: {
            'max-lines': ['error', { max: 865, skipBlankLines: true, skipComments: true }],
        },
    },
    {
        // Raised from 460 to 500 on 04/09/2026: finding the copies npm and yarn nest, which is a
        // second layout to read rather than a longer version of the pnpm one.
        // Raised to 510 the same day: telling "nobody measured this chunk" from "it weighs
        // nothing", which a folder read without source maps made a real distinction.
        // Raised to 535 on 05/09/2026: what nothing reaches from the entry point. Four real
        // projects showed why it is worth a walk of its own — one of them had 9 MB the report
        // never mentioned — and it is also what keeps a folder nobody cleaned out of the table.
        // Raised to 560 on 06/09/2026 (IDEAS §A): the source files behind each bucket of the
        // bootstrap breakdown, what each weighs there, and the one lazy call that hands both to
        // `insights.ts`. The eight figures themselves are in their own modules on purpose — this
        // file grew by the bookkeeping they need and by nothing else.
        // Raised to 570 on 10/09/2026 (CHECKLIST §2.5): the width of each round trip, which is the
        // half of the shape a depth figure hides. One line per screen and one for the first load.
        files: ['src/app/core/analysis/analysis.ts'],
        rules: {
            'max-lines': ['error', { max: 570, skipBlankLines: true, skipComments: true }],
        },
    },
    {
        // One `push` per signal, and each of them gained a line on 05/09/2026: `kind`, the name a
        // signal has outside the page. Nothing here got more complicated — it is the same list with
        // one more field — and it is capped rather than exempted because a NEW signal should still
        // be a decision somebody takes on purpose.
        // Raised to 440 the same day for one such decision: the signal about what the report cannot
        // reach, which four real builds said was worth having.
        // Raised to 460 on 06/09/2026 (IDEAS §26): which signals went away and which came in since
        // the baseline. Eight of the ten lines are the card; the other two are what hands the
        // savings to the signals that name one, so the ranked list has something to sort by. The
        // eight new signals of IDEAS §A live in `graph.ts`, not here.
        files: ['src/app/core/findings/findings.ts'],
        rules: {
            'max-lines': ['error', { max: 460, skipBlankLines: true, skipComments: true }],
        },
    },
    {
        // The declaration of the same dictionary en.ts and es.ts fill in: one line per string, no
        // logic. It is capped rather than exempted like them because a growing UI surface IS worth
        // noticing — the cap is its current size plus a little slack. Lower it if it shrinks.
        // Raised from 410 on 04/09/2026: the screens panel gained the eight strings of the hand
        // marks (CHECKLIST §3), which is a control that did not exist, not a rewording.
        // Raised again to 460 the same day: sixteen thresholds that were constants buried in the
        // code became editable criteria, and each one needs its label, its help and its unit.
        // Raised to 475 on 04/09/2026: the example (its button, what the status line says while it
        // is loaded, how to close it), the diagnostics button, and one more criterion with its
        // label, help and unit. Three controls that did not exist, not a rewording.
        // Raised to 495 on 06/09/2026 (IDEAS §1 and §41): the ranked list above the signals and the
        // bootstrap column that says what removing a row would really take off. Both are controls
        // that did not exist, not rewordings.
        files: ['src/app/core/i18n/ui-strings.ts'],
        rules: {
            // Raised from 495 when the last of the fifty ideas landed. It is the contract every
            // string in the page is declared against, so it grows with every feature and shrinks
            // with none; splitting it would only mean looking in two files for one key.
            // Raised to 580 on 10/09/2026 (CHECKLIST §2.3): the observed-environment block of the
            // measured tab. Fifteen labels for figures that did not exist, not rewordings.
            // Raised to 590 the same day (CHECKLIST §4): the four states a figure can be in, which
            // are two records of four and the one label the whole section exists for — `unknown`.
            // Raised to 625 on 10/09/2026 (CHECKLIST §5): the five questions. A tab that did not
            // exist, and the bulk of it is four records keyed by question — the question, its
            // options, the metric it stands for and where to look for it — rather than prose.
            // Raised to 650 on 02/10/2026: the Map tab. Twenty-five strings of one panel, most of them
            // one line each — what a rectangle is, what its area means at each level.
            // Raised to 670 on 02/10/2026: the redesign. The header (search, theme, build chip),
            // the front page's required/optional split and the line that replaced the load bar, the
            // lead figure's caption, the provenance legend at the foot, and the column headers and
            // empty states of the tabs that became tables. Nine strings of the old layout went.
            'max-lines': ['error', { max: 670, skipBlankLines: true, skipComments: true }],
        },
    },
    {
        // The terminal report: one block per section of the page, each with its own table, and
        // the small table and wrap helpers they share. Raised to 420 on 03/10/2026: savings and
        // the --what-if table are now in the report's unit, with the note that says when they are
        // an estimate — a figure that changed meaning, not a rewording.
        files: ['cli/render-text.ts'],
        rules: {
            'max-lines': ['error', { max: 420, skipBlankLines: true, skipComments: true }],
        },
    },
    {
        // The spec of `analysis.ts`: one fixture metafile per shape of build, and each fixture is
        // twenty lines of JSON that says what it tests. Capped rather than exempted so a new case
        // is a decision; raised on 04/09/2026 for the npm layout of duplicates and for `.mjs`.
        // Raised to 530 on 05/09/2026 for two shapes found in real framework builds: a second
        // entry chunk the page also starts, and a duplicated copy installed outside node_modules.
        // Raised to 560 the same day for a third: a folder still holding the previous build.
        files: ['src/app/core/analysis/analysis.spec.ts'],
        rules: {
            'max-lines': ['error', { max: 560, skipBlankLines: true, skipComments: true }],
        },
    },
    {
        // The command: its interface IS what it writes to stdout, and it compiles to CommonJS
        // (see tsconfig.cli.json), where a top-level await does not exist.
        files: ['cli/**/*.ts'],
        rules: {
            'no-console': 'off',
            'unicorn/prefer-top-level-await': 'off',
            // These files talk about paths on every line, so `path` is the name a variable wants;
            // `import path from 'node:path'` would shadow it in half the functions.
            'unicorn/import-style': 'off',
            'unicorn/no-process-exit': 'off',
        },
    },
    {
        // Node scripts: console output IS their interface.
        files: ['scripts/**/*.mjs'],
        rules: {
            'no-console': 'off',
        },
    },
    {
        files: ['**/*.html'],
        extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
        rules: {
            // A template past ~300 lines is describing more than one thing and wants splitting into
            // child components. The biggest is the screens panel, which has its own entry below.
            'max-lines': ['error', { max: 300, skipBlankLines: true }],
            // Angular template best practices
            '@angular-eslint/template/attributes-order': [
                'error',
                {
                    alphabetical: true,
                    order: [
                        'STRUCTURAL_DIRECTIVE', // deprecated, use @if and @for instead
                        'TEMPLATE_REFERENCE', // e.g. `<input #inputRef>`
                        'ATTRIBUTE_BINDING', // e.g. `<input required>`, `id="3"`
                        'INPUT_BINDING', // e.g. `[id]="3"`, `[attr.colspan]="colspan"`,
                        'TWO_WAY_BINDING', // e.g. `[(id)]="id"`,
                        'OUTPUT_BINDING', // e.g. `(idChange)="handleChange()"`,
                    ],
                },
            ],
            '@angular-eslint/template/button-has-type': 'error',
            '@angular-eslint/template/no-positive-tabindex': 'error', // a11y: tabindex>0 breaks the natural focus order
            '@angular-eslint/template/prefer-ngsrc': 'off', // needs width/height and can break layout
            '@angular-eslint/template/prefer-self-closing-tags': 'error',
            '@angular-eslint/template/use-track-by-function': 'error',
            '@angular-eslint/template/prefer-static-string-properties': 'error',
        },
    },
]);
