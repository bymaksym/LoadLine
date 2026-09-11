/** Which tab is shown and which element it has to highlight. */

/**
 * The tabs, in the order they are drawn. One list: the page renders it, the URL is validated
 * against it, and the counters are keyed by it.
 */
export const REPORT_TABS = [
    'findings',
    'screens',
    'measured',
    'boot',
    'shared',
    'tree',
    'search',
    'project',
    // Next to the project's own files, because it is the same kind of thing: context about the
    // world this build ships into rather than a view of the build.
    'situation',
    // Not a view of this build but of several, so it sits at the end next to the settings.
    'compare',
    'criteria',
] as const;

export type ReportTab = (typeof REPORT_TABS)[number];

export interface Focus {
    tab: ReportTab;
    /** Identifier of the element to highlight: chunk file, screen source or package name. */
    key: string;
    /** Changes on every request, so asking twice for the same element scrolls to it again. */
    seq: number;
}
