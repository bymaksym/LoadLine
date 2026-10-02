// html-validate (`pnpm run a11y:audit`, and the `.html` files of a commit): reads the templates as
// HTML and checks the accessibility angular-eslint cannot see, such as a button whose only text is a
// `title`, or a label that points at no control.
/** @type {import('html-validate').ConfigData} */
export default {
    root: true,
    extends: ['html-validate:a11y'],
    plugins: ['html-validate-angular'],
    elements: ['html5'],
    transform: { html$: 'html-validate-angular:html' },
    rules: {
        // Angular's own elements (`app-*`) are not standard HTML.
        'no-unknown-elements': 'off',
        // Every `role="button"` in the templates is a table row that expands its detail: a `<tr>`
        // cannot become a `<button>` without leaving the table. Focus and keyboard on them are
        // already checked by angular-eslint's template accessibility rules.
        'prefer-native-element': 'off',
        // An exception (`<!-- [html-validate-disable-next rule] -->`) that no longer does anything.
        'no-unused-disable': 'error',
    },
};
