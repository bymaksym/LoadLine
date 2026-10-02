import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every custom property the project defines: the ones any stylesheet declares (the tokens are
 * declared in one file and used in all the others) and the ones a template or a component sets
 * (`[style.--x]`, `'--x'`). Read from the files, so adding a token never means touching this too.
 * Paths are from this folder, not from wherever Stylelint is launched.
 *
 * @param {string} pattern
 * @param {RegExp} regex
 */
const read = (pattern, regex) =>
    globSync(pattern, { cwd: import.meta.dirname }).flatMap(file =>
        [...readFileSync(join(import.meta.dirname, file), 'utf8').matchAll(regex)].map(match => match[1]),
    );

const knownCustomProperties = Object.fromEntries(
    [
        ...read('src/**/*.scss', /(--[a-z][\w-]*)\s*:/g),
        ...read('src/**/*.{ts,html}', /(?:style\.|['"`])(--[a-z][\w-]*)/g),
    ].map(name => [name, {}]),
);

/** @type {import('stylelint').Config} */
export default {
    extends: ['stylelint-config-standard-scss', 'stylelint-config-clean-order'],
    plugins: [
        'stylelint-scss',
        'stylelint-declaration-strict-value',
        'stylelint-high-performance-animation',
        'stylelint-declaration-block-no-ignored-properties',
        'stylelint-value-no-unknown-custom-properties',
        'stylelint-plugin-use-baseline',
    ],
    rules: {
        /*
           A `var(--x)` with no `--x` anywhere makes the browser drop the declaration without a word.
           It is not hypothetical here: `--sp-*` and `--fs-*` were used by whole blocks before they
           were defined, and every margin in them came out as zero (see src/assets/_tokens.scss).
        */
        'csstools/value-no-unknown-custom-properties': [
            true,
            { importFrom: [{ customProperties: knownCustomProperties }] },
        ],

        /*
           Colours, sizes, typefaces and spacing through the tokens in src/assets/_tokens.scss: a
           colour written by hand does not follow the dark theme, and a size written by hand is how
           the page ended up with fifteen font sizes between 0.8 and 1.45 rem and some thirty
           margins and gaps (02/10/2026). A property's exceptions replace the general ones, which is
           why the keywords are repeated. Each part of a shorthand (`padding: a b`) is checked, and
           a `calc()` passes, which is what a figure derived from another one (`--row-y`) needs.
        */
        'scale-unlimited/declaration-strict-value': [
            // `background` too: `/color$/` does not reach the shorthand, which is how most of this
            // project writes a background.
            [
                '/color$/',
                'background',
                'fill',
                'stroke',
                'font-size',
                'font-family',
                '/^(margin|padding)(-|$)/',
                '/^(row-|column-)?gap$/',
            ],
            {
                ignoreValues: {
                    // Relative to the text around it (a glyph inside a sentence): not a size of its own.
                    'font-size': ['inherit', 'initial', 'unset', String.raw`/^\d*\.?\d+(em|%)$/`],
                    // No air, centring, and the hairline a border overlaps by: none of them is a step.
                    '/^(margin|padding)(-|$)/': ['0', 'auto', '1px', '-1px', 'inherit', 'initial', 'unset'],
                    '/^(row-|column-)?gap$/': ['0', '1px', 'normal', 'inherit', 'initial', 'unset'],
                    '/color$/': ['transparent', 'inherit', 'currentcolor', 'currentColor', 'none', 'initial', 'unset'],
                    background: ['transparent', 'inherit', 'none', 'initial', 'unset'],
                    fill: ['transparent', 'inherit', 'currentcolor', 'currentColor', 'none', 'initial', 'unset'],
                    stroke: ['transparent', 'inherit', 'currentcolor', 'currentColor', 'none', 'initial', 'unset'],
                    'font-family': ['inherit', 'initial', 'unset'],
                },
                message: 'Use a token from src/assets/_tokens.scss for "${value}" in "${property}".',
            },
        ],

        // Animating size or position recalculates the layout on every frame; colour and opacity do not.
        'plugin/no-low-performance-animation-properties': [true, { ignore: 'paint-properties' }],

        // Properties the browser ignores without saying so (a `width` on something `display: inline`).
        'plugin/declaration-block-no-ignored-properties': true,

        // Only CSS every current browser has had for over two years ("widely available"), the same
        // floor eslint.config.js holds the page's JavaScript to. `:host-context` is rewritten by
        // Angular and never reaches the browser. The rest are refinements whose absence loses a
        // detail and breaks nothing: a hidden scrollbar on the tab strip, a paste box that can be
        // resized, and the print sheet opening `details` (which has a `display` fallback below it).
        'plugin/use-baseline': [
            true,
            {
                ignoreSelectors: ['host-context', 'details-content'],
                ignoreProperties: {
                    'content-visibility': ['/^.+$/'],
                    resize: ['/^.+$/'],
                    'scrollbar-width': ['/^.+$/'],
                },
            },
        ],

        // Angular
        'selector-pseudo-element-no-unknown': [
            true,
            {
                ignorePseudoElements: ['ng-deep', 'host', 'host-context'],
            },
        ],
        'selector-type-no-unknown': [
            true,
            {
                ignore: ['custom-elements', 'default-namespace'],
            },
        ],

        // SCSS
        'scss/dollar-variable-pattern': '^[a-z][a-zA-Z0-9]*(-[a-z0-9]+)*$',
        'scss/at-mixin-pattern': '^[a-z][a-zA-Z0-9]*(-[a-z0-9]+)*$',
        'scss/no-global-function-names': null,

        /*
           BEM: `block`, `block__element`, `block--modifier`, `block__element--modifier`. Every part
           is lower case and the words inside one part are joined by a single hyphen, so `-` never
           means "a part of" — that is what `__` and `--` are for. Elements do not nest: a part of a
           part is another element of the same block (`tree__head`, `tree__head-size`), never
           `tree__head__size`.

           What this catches is a class written out in full: `.BadName`, `.legend_row`, `.someThing`.
           What it does NOT catch is the form most of this stylesheet is written in — an element as
           `&__size` inside its block. `resolveNestedSelectors` resolves an ancestor written as a
           descendant, not a `&` glued to a suffix, so there is no class in `&__size` for the
           pattern to look at and a wrong one there goes through. That half stays a reading, not a
           check; the rule is still worth having for the half it does hold.

           It does not have to stay a reading. A test that resolves `&` against its parents before
           looking sees straight into `&__size`, and the same walk can then check what no name
           pattern can: that a stylesheet declares one block, and that a block name is not reused by
           another area. Glosario GOD has it as `test/bem.test.ts` — measured there by writing
           `&--past .otro-bloque__x` by hand, which this rule passes with exit code 0 and that test
           catches. Measured here too, and it is not clean: 20 of 25 stylesheets declare more than
           one block and four block names span two areas. Working note with the numbers and the
           order to do it in: docs/DEUDA-BEM.md.
        */
        'selector-class-pattern': [
            '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9]+(?:-[a-z0-9]+)*)?(?:--[a-z0-9]+(?:-[a-z0-9]+)*)?$',
            {
                resolveNestedSelectors: true,
                message: selector =>
                    `"${selector}" is not BEM: block[__element][--modifier], lower case, words inside a part joined by a single hyphen.`,
            },
        ],

        // Flexibility
        'no-empty-source': null,
        'custom-property-pattern': null,
        'import-notation': null,

        // Modern CSS
        'color-function-notation': 'modern',
        'alpha-value-notation': 'number',
    },
};
