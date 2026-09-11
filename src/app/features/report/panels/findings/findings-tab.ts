import { Component, computed, inject, signal } from '@angular/core';
import { type Action, rankActions, type TotalSaving, totalSaving } from '@core/findings/actions';
import { type Effort } from '@core/findings/effort';
import { type Finding, type FindingTarget, type Severity } from '@core/findings/finding.types';
import { BytesPipe } from '@shared/pipes/bytes.pipe';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';
import { PanelHeaderComponent } from '../panel-header/panel-header';

/** `all` is everything; `rest` is the cards that are context rather than a problem: `ok` and `info`. */
type FindingFilter = 'all' | 'high' | 'mid' | 'rest';

/**
 * Which signals have been ticked off, by title.
 *
 * Outside the component because the tab is destroyed and rebuilt every time somebody leaves it, and
 * this is a working list: it is read several times while a fix is being made, and it used to start
 * the same length every time. Session only — a tick is about this sitting, not about the project.
 */
const seenTitles = signal<ReadonlySet<string>>(new Set());

/** The signals, one card each, with a button leading to the report row they come from. */
@Component({
    selector: 'app-findings-tab',
    templateUrl: './findings-tab.html',
    styleUrl: './findings-tab.scss',
    imports: [PanelHeaderComponent, BytesPipe],
})
export class FindingsTabComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);
    protected readonly nav = inject(ReportNav);

    // * CONSTANTS
    protected readonly filters: FindingFilter[] = ['all', 'high', 'mid', 'rest'];

    // * ATTRIBUTES
    protected readonly filter = signal<FindingFilter>('all');
    protected readonly seen = seenTitles;

    /**
     * What to fix first: the signals ordered by bytes per unit of effort.
     *
     * It is an **order** over the list below and never a selection — every card is still there,
     * which is the rule this project holds itself to about grouping rather than trimming. Sorted by
     * bytes alone the 400 kB refactor leads and the 90 kB one-line fix never gets done, which is
     * why the effort of each kind of signal is written down and divided out.
     */
    protected readonly actions = computed<Action[]>(() => rankActions(this.store.findings()));

    /**
     * What doing all of it is worth. Not a sum: two signals often name the same bytes arriving by
     * two routes, so it is one walk of the graph with every named file taken out at once.
     */
    protected readonly saving = computed<TotalSaving | null>(() => {
        const analysis = this.store.analysis();
        return analysis ? totalSaving(analysis, this.store.findings()) : null;
    });

    /** How much work a signal is, as words. Written once, in `effort.ts`, not computed. */
    protected effortLabel(effort: Effort): string {
        return this.i18n.ui().effortLabel[effort];
    }

    /** Jumps to the card of a ranked line: the list is an index into the list below it. */
    protected goToCard(finding: Finding): void {
        this.filter.set('all');
        document.querySelector(`[data-title="${CSS.escape(finding.title)}"]`)?.scrollIntoView({ block: 'center' });
    }

    /** The same three numbers the front page shows, so the tile and the list cannot disagree. */
    protected readonly counts = computed<Record<FindingFilter, number>>(() => {
        const findings = this.store.findings();
        return {
            all: findings.length,
            high: findings.filter(finding => finding.severity === 'high').length,
            mid: findings.filter(finding => finding.severity === 'mid').length,
            rest: findings.filter(finding => finding.severity === 'ok' || finding.severity === 'info').length,
        };
    });

    /**
     * The list as it is drawn: filtered, and with what has been ticked off at the end. Ticked cards
     * are moved rather than hidden — hiding them would make the list shrink under the reader and
     * lose the way back.
     */
    protected readonly rows = computed<Finding[]>(() => {
        const filter = this.filter();
        const seen = this.seen();
        const findings = this.store.findings().filter(finding => matches(finding, filter));

        return [
            ...findings.filter(finding => !seen.has(finding.title)),
            ...findings.filter(finding => seen.has(finding.title)),
        ];
    });

    protected toggleSeen(title: string): void {
        const next = new Set(this.seen());
        if (!next.delete(title)) {
            next.add(title);
        }
        this.seen.set(next);
    }

    protected clearSeen(): void {
        this.seen.set(new Set());
    }

    protected filterLabel(filter: FindingFilter): string {
        const t = this.i18n.ui();
        const labels: Record<FindingFilter, string> = {
            all: t.treeAll,
            high: t.sevHigh,
            mid: t.sevMid,
            rest: t.findingsRest,
        };
        return labels[filter];
    }

    protected sevLabel(severity: Severity): string {
        const t = this.i18n.ui();
        const labels: Record<Severity, string> = { high: t.sevHigh, mid: t.sevMid, ok: t.sevOk, info: t.sevInfo };
        return labels[severity];
    }

    protected sevClass(severity: Severity): string {
        const classes: Record<Severity, string> = { high: 'tag--crit', mid: 'tag--warn', ok: 'tag--ok', info: '' };
        return classes[severity];
    }

    protected targetLabel(target: FindingTarget): string {
        const t = this.i18n.ui();
        const labels: Record<FindingTarget['tab'], string> = {
            shared: t.seeInShared,
            boot: t.seeInBoot,
            screens: t.seeInScreens,
            search: t.seeInSearch,
            project: t.seeInProject,
            measured: t.seeInMeasured,
            situation: t.seeInSituation,
        };
        return labels[target.tab];
    }
}

const matches = (finding: Finding, filter: FindingFilter): boolean => {
    if (filter === 'all') {
        return true;
    }
    if (filter === 'rest') {
        return finding.severity === 'ok' || finding.severity === 'info';
    }
    return finding.severity === filter;
};
