import { inject, Service, signal } from '@angular/core';
import { EMPTY_HISTORY, type History, remember } from '../core/history/history';
import { clearHistory, loadHistory, saveHistory } from '../core/session/persistence';
import { download } from '../shared/download.utils';
import { ReportStore } from './report.store';

/**
 * The measurements this browser has kept.
 *
 * Apart from `ReportStore` because it is a different thing: the store holds one build and
 * everything derived from it, and this holds what somebody chose to remember across builds. They
 * were in one place and the store had grown past what its own line ceiling allows, which was the
 * moment to notice that the second half was never about the report on screen.
 *
 * **It lives in this browser and nowhere else.** No account, no server, no sync — and every string
 * the page draws around it has to keep saying so, because a chart looks like a dashboard and one
 * machine's memory is not a team's history. It is exportable for exactly that reason: the way to
 * share it is to hand over the file.
 */
@Service()
export class HistoryService {
    // * SERVICES
    private readonly store = inject(ReportStore);

    // * ATTRIBUTES
    readonly history = signal<History>(EMPTY_HISTORY);

    constructor() {
        void loadHistory().then(history => this.history.set(history));
    }

    /**
     * Adds what is on screen to the history of this browser.
     *
     * Asked for rather than automatic. A measurement is worth remembering when somebody decides it
     * is — the build they just made, the one they are about to compare against — and a history that
     * records every drop of a folder is a history of somebody trying things, not of a project.
     */
    async keep(): Promise<void> {
        const analysis = this.store.analysis();
        if (!analysis || this.store.isSample()) {
            return;
        }

        const findings = this.store.findings();
        const next = remember(this.history(), {
            date: new Date().toISOString(),
            name: this.store.statsInfo()?.name ?? 'stats.json',
            mode: this.store.mode(),
            boot: analysis.bootBytes,
            screens: analysis.screens.map(screen => [screen.source, screen.total] as [string, number]),
            signals: {
                high: findings.filter(finding => finding.severity === 'high').length,
                mid: findings.filter(finding => finding.severity === 'mid').length,
            },
        });

        this.history.set(next);
        await saveHistory(next);
    }

    /** Forgets it all. The counterpart of keeping it: memory nobody can drop is not a feature. */
    async forget(): Promise<void> {
        this.history.set(EMPTY_HISTORY);
        await clearHistory();
    }

    /** The history as a file, which is the only way to move it off this machine. */
    export(): void {
        download('loadline-history.json', JSON.stringify(this.history(), null, 2), 'application/json');
    }
}
