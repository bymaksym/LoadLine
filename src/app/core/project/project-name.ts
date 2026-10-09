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

export const projectNameOf = (sources: NameSources): string | null =>
    [sources.packageName, sources.angularProject, sources.pageTitle, sources.folder ? folderName(sources.folder) : null]
        .map(name => name?.trim())
        .find(name => !!name) ?? null;
