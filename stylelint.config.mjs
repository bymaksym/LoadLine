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

        // Flexibility
        'no-empty-source': null,
        'selector-class-pattern': null,
        'custom-property-pattern': null,
        'import-notation': null,

        // Modern CSS
        'color-function-notation': 'modern',
        'alpha-value-notation': 'number',
    },
};
