/** Which tab is shown and which element it has to highlight. */

/**
 * The tabs, in the order they are drawn. One list: the page renders it, the URL is validated
 * against it, and the counters are keyed by it.
 */
export const REPORT_TABS = [
    // The views of the build.
    'findings',
    'screens',
    'boot',
    'shared',
    'tree',
    // Next to the tree, because it is the same bundle drawn instead of listed: what is inside a
    // chunk, at a glance, which is the one thing a list of rows is slow at.
    'map',
    'search',
    // What is put into the report: a measurement, answers, the project's own files, other
    // applications and the criteria. The strip draws a rule before the first of them.
    'measured',
    'situation',
    'project',
    'compare',
    'criteria',
] as const;

/** The first tab of the second group, the one the strip draws a rule before. */
export const FIRST_INPUT_TAB: ReportTab = 'measured';

export type ReportTab = (typeof REPORT_TABS)[number];

export interface Focus {
    tab: ReportTab;
    /** Identifier of the element to highlight: chunk file, screen source or package name. */
    key: string;
    /** Changes on every request, so asking twice for the same element scrolls to it again. */
    seq: number;
}
