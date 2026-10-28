/**
 * What the project being analysed is called, from whatever says it.
 *
 * A report has to name what it is about at a glance, and the name used to come only from a
 * `package.json` or an `angular.json` loaded as context — which almost nobody loads — so almost
 * every report was about nothing in particular. The build itself says it too: the page has a
 * `<title>`, and the folder is usually named after the app.
 */

/** Folder names that are the build tool's, not the project's: `dist/browser` says nothing. */
const GENERIC_FOLDERS = new Set([
    'dist',
    'build',
    'browser',
    'public',
    'out',
    'output',
    '.output',
    'www',
    'static',
    'assets',
    'client',
    'server',
]);

export interface NameSources {
    /** `name` of a `package.json`: what the project is called where people call it something. */
    packageName?: string | null;
    /** The project inside an Angular workspace. */
    angularProject?: string | null;
    /** The page's `<title>`, which is what the application calls itself on screen. */
    pageTitle?: string | null;
    /** The folder the build was read from, last segment first: `dist/angular-conduit/browser`. */
    folder?: string | null;
}

/** A folder path's most specific segment that is not one of the build tool's own names. */
const folderName = (folder: string): string | null =>
    folder
        .replaceAll('\\', '/')
        .split('/')
        .filter(part => part !== '' && part !== '.' && part !== '..')
        .findLast(part => !GENERIC_FOLDERS.has(part.toLowerCase()) && !/\.json$/i.test(part)) ?? null;

/**
 * The titles a project generator writes and nobody changed: "Vite + React + TS" names the template,
 * not the application, and reading it as the name would put the same name on every Vite app there is.
 */
const TEMPLATE_TITLES = new Set(['vite app', 'react app', 'svelte app', 'sveltekit app', 'angular', 'document', 'app']);
const isTemplateTitle = (title: string): boolean => {
    const lower = title.toLowerCase();
    return TEMPLATE_TITLES.has(lower) || lower === 'vite' || lower.startsWith('vite + ');
};

/**
 * **The build's own title first, then the package, then the Angular project, then the folder.**
 *
 * One order whatever was passed, so the same build gets the same name with and without `--project`.
 * The package name came first, and it is only known when `--project` is given or a `package.json`
 * sits a few folders above the build: a build copied to a temporary folder was called "Esail IT
 * Solutions" (its `<title>`) without the flag and "control-horario-angular" with it. The title is in
 * the build itself, so it does not depend on what else the command was given — and it is the name
 * the application calls itself on screen, which a package name often is not ("frontend", "web").
 * A title left as the generator wrote it is skipped: it names a template, not this application.
 */
export const projectNameOf = (sources: NameSources): string | null => {
    const title = sources.pageTitle?.trim();
    return (
        [
            title && !isTemplateTitle(title) ? title : null,
            sources.packageName,
            sources.angularProject,
            sources.folder ? folderName(sources.folder) : null,
        ]
            .map(name => name?.trim())
            .find(name => !!name) ?? null
    );
};
