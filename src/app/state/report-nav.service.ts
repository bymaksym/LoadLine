import { Service, signal } from '@angular/core';
import { type Focus, REPORT_TABS, type ReportTab } from './report-nav.types';

/**
 * The address as this tool writes it: `#screens?sort=delta&q=lodash`.
 *
 * A hash rather than a path, and that is not a shortcut: the tool has to work from a `file://` URL
 * opened by double-clicking one HTML file, where there is no server to route a path and no history
 * API worth using. A hash is the only part of a URL that survives that.
 */
const parseHash = (): { tab: ReportTab | null; params: Record<string, string> } => {
    const raw = location.hash.replace(/^#/, '');
    const [name = '', query = ''] = raw.split('?', 2);
    const params: Record<string, string> = {};

    const pairs = query.split('&');
    for (const pair of pairs) {
        const [key = '', value = ''] = pair.split('=', 2);
        if (key) {
            params[key] = decodeURIComponent(value);
        }
    }

    return { tab: REPORT_TABS.find(tab => tab === name) ?? null, params };
};

const writeHash = (tab: ReportTab, params: Record<string, string>): string => {
    const query = Object.entries(params)
        .filter(([, value]) => value !== '')
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');

    return query ? `${tab}?${query}` : tab;
};

/**
 * Which tab of the report is shown and which element has to be highlighted in it.
 *
 * Signals, summary tiles and tables link to each other through this: "see the chunk" from a signal
 * switches tab and asks that tab to expand and reveal the matching row.
 *
 * The tab is also in the address. Without it a reload landed back on Signals, the browser's back
 * button left the tool altogether, and there was no way to hand somebody a link to the tab that
 * shows the problem — which is the first thing anybody does with a report.
 */
@Service()
export class ReportNav {
    // * ATTRIBUTES
    readonly tab = signal<ReportTab>(parseHash().tab ?? 'findings');
    /**
     * What the open tab is showing: its filter, its sort, its search.
     *
     * It is in the address so that what somebody is looking at can be handed to somebody else. A
     * link to a tab is a link to a table of a hundred and sixty rows; a link to `#search?q=lodash`
     * is the thing they were actually pointing at.
     */
    readonly params = signal<Record<string, string>>(parseHash().params);
    readonly focus = signal<Focus | null>(null);
    private seq = 0;

    constructor() {
        // Back and forward, and a hash somebody pasted or edited by hand.
        addEventListener('hashchange', () => {
            const { tab, params } = parseHash();
            if (tab) {
                this.tab.set(tab);
                this.params.set(params);
            }
        });
    }

    go(tab: ReportTab, key?: string): void {
        const params = tab === this.tab() ? this.params() : {};
        this.tab.set(tab);
        this.params.set(params);
        // Assigning the same hash again is a no-op in every browser, so pressing the tab you are
        // already on does not pile up history entries.
        location.hash = writeHash(tab, params);

        if (key) {
            this.focus.set({ tab, key, seq: ++this.seq });
        }
    }

    /** What the address says about one thing the open tab is showing. */
    param(key: string): string {
        return this.params()[key] ?? '';
    }

    /**
     * Records what the open tab is showing.
     *
     * `replaceState` rather than assigning the hash: a filter typed one character at a time would
     * otherwise put eight entries in the history, and the back button — which this whole thing
     * exists to make work — would take eight presses to leave the tab.
     */
    setParam(key: string, value: string): void {
        const params = { ...this.params(), [key]: value };
        this.params.set(params);
        history.replaceState(null, '', `#${writeHash(this.tab(), params)}`);
    }
}
