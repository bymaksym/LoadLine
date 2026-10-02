import { type UiStrings } from '@core/i18n/ui-strings';
import { type ReportTab } from './report-nav.types';

/**
 * The name each tab is drawn with. The tab strip and the palette both show it, and it used to be
 * written out in each of them: a new tab had to be named twice, and one named once would have come
 * out blank in the other. `Record<ReportTab, …>` makes a missing tab a type error here instead.
 */
export const labelOfTab = (tab: ReportTab, t: UiStrings): string => {
    const labels: Record<ReportTab, string> = {
        findings: t.tabFindings,
        screens: t.tabScreens,
        measured: t.tabMeasured,
        boot: t.tabBoot,
        shared: t.tabShared,
        tree: t.tabTree,
        map: t.tabMap,
        search: t.tabSearch,
        project: t.tabProject,
        situation: t.tabSituation,
        compare: t.tabCompare,
        criteria: t.tabCriteria,
    };
    return labels[tab];
};
