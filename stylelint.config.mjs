/** @type {import('stylelint').Config} */
export default {
    extends: ['stylelint-config-standard-scss', 'stylelint-config-clean-order'],
    plugins: ['stylelint-scss'],
    rules: {
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
