import { Component, computed, inject, signal } from '@angular/core';
import { type Verdict } from '@core/criteria/criteria.types';
import {
    formatSaving,
    rankActions,
    remainingInUnit,
    type TotalSaving,
    totalSaving,
    unitScale,
} from '@core/findings/actions';
import { EFFORT, type Effort } from '@core/findings/effort';
import { type Finding, type FindingTarget, type Severity } from '@core/findings/finding.types';
import { formatBytes } from '@core/format/format.utils';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';
import { PanelHeaderComponent } from '../panel-header/panel-header';
import { revealOnFocus } from '../reveal-on-focus.utils';

/** `all` is everything; `rest` is the signals that are context rather than a problem: `ok` and `info`. */
type FindingFilter = 'all' | 'high' | 'mid' | 'rest';

/** One line of the table: a signal with its place in the order and what acting on it is worth. */
interface SignalRow {
    finding: Finding;
    /** Its place in the order worth fixing, `01` first. Kept when a filter hides the lines above it. */
    rank: string;
    /** Bytes off the first load; `0` when the signal names none. */
    saving: number;
    effort: Effort;
}

/**
 * Which signals have been ticked off, by title.
 *
 * Outside the component because the tab is destroyed and rebuilt every time somebody leaves it, and
 * this is a working list: it is read several times while a fix is being made, and it used to start
 * the same length every time. Session only — a tick is about this sitting, not about the project.
 */
const seenTitles = signal<ReadonlySet<string>>(new Set());

/**
 * The signals as one ranked table: a line each, in the order worth fixing, opening in place to say
 * why and what to do.
 *
 * It used to be a "what to fix first" list above a column of long cards, which was the same
 * signals twice — once ordered, once explained — and the reader went back and forth between them.
 */
@Component({
    selector: 'app-findings-tab',
    templateUrl: './findings-tab.html',
    styleUrl: './findings-tab.scss',
    imports: [PanelHeaderComponent],
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
    /** The title of the line that is open. One at a time: two open details are a wall of text again. */
    protected readonly open = signal<string | null>(null);

    /**
     * Every signal, in the order worth fixing: the ranked actions (bytes per unit of effort, by
     * severity) first, then whatever the ranking leaves out — context, verdicts that all is well.
     *
     * It is an **order** and never a selection — every signal is still in the table, which is the
     * rule this project holds itself to about grouping rather than trimming. Sorted by bytes alone
     * the 400 kB refactor leads and the 90 kB one-line fix never gets done, which is why the effort
     * of each kind of signal is written down and divided out.
     */
    protected readonly ranked = computed<SignalRow[]>(() => {
        const findings = this.store.findings();
        const actions = rankActions(findings);
        const inOrder = new Set(actions.map(action => action.finding));
        const lines = [
            ...actions.map(({ finding, saving, effort }) => ({ finding, saving, effort })),
            ...findings
                .filter(finding => !inOrder.has(finding))
                .map(finding => ({ finding, saving: finding.saving ?? 0, effort: EFFORT[finding.kind] })),
        ];

        return lines.map((line, index) => ({ ...line, rank: String(index + 1).padStart(2, '0') }));
    });

    /**
     * What doing all of it is worth. Not a sum: two signals often name the same bytes arriving by
     * two routes, so it is one walk of the graph with every named file taken out at once.
     */
    protected readonly saving = computed<TotalSaving | null>(() => {
        const analysis = this.store.analysis();
        return analysis ? totalSaving(analysis, this.store.findings()) : null;
    });

    /**
     * How a saving is written: in the report's unit, like the bootstrap it comes off, with `≈` when
     * a compressed report had to carry it over from raw bytes. See `unitScale`.
     */
    private readonly scale = computed(() => {
        const analysis = this.store.analysis();
        return analysis ? unitScale(analysis) : { ratio: 1, estimated: false };
    });

    protected readonly estimated = computed(() => this.scale().estimated);

    protected savingText(bytes: number): string {
        return formatSaving(bytes, this.scale());
    }

    /** What the first load would be left at. The sentence around it already says "about". */
    protected remainingText(total: TotalSaving): string {
        const analysis = this.store.analysis();
        return analysis ? formatBytes(remainingInUnit(analysis, total.bytes, total.after)) : '';
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
     * The table as it is drawn: filtered, and with what has been ticked off at the end. Ticked lines
     * are moved rather than hidden — hiding them would make the table shrink under the reader and
     * lose the way back.
     */
    protected readonly rows = computed<SignalRow[]>(() => {
        const filter = this.filter();
        const seen = this.seen();
        const rows = this.ranked().filter(row => matches(row.finding, filter));

        return [
            ...rows.filter(row => !seen.has(row.finding.title)),
            ...rows.filter(row => seen.has(row.finding.title)),
        ];
    });

    constructor() {
        // A link that names a signal: the filter is cleared so it cannot be hidden by one, and its
        // line opens.
        revealOnFocus('findings', key => {
            this.filter.set('all');
            this.open.set(key);
        });
    }

    /** Opens a line, or closes it when it is the one already open. */
    protected toggle(title: string): void {
        this.open.set(this.open() === title ? null : title);
    }

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

    /** How much work a signal is, as words. Written once, in `effort.ts`, not computed. */
    protected effortLabel(effort: Effort): string {
        return this.i18n.ui().effortLabel[effort];
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

    /**
     * The shape of a filter, in the verdict markers' three forms: triangle important, square to
     * review, and a grey disc — the marker with no rating — for context. `all` draws its own.
     */
    protected filterShape(filter: FindingFilter): Verdict | 'all' | null {
        const shapes: Record<FindingFilter, Verdict | 'all' | null> = {
            all: 'all',
            high: 'bad',
            mid: 'ok',
            rest: null,
        };
        return shapes[filter];
    }

    protected sevShape(severity: Severity): Verdict | null {
        const shapes: Record<Severity, Verdict | null> = { high: 'bad', mid: 'ok', ok: null, info: null };
        return shapes[severity];
    }

    protected sevLabel(severity: Severity): string {
        const t = this.i18n.ui();
        const labels: Record<Severity, string> = { high: t.sevHigh, mid: t.sevMid, ok: t.sevOk, info: t.sevInfo };
        return labels[severity];
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
    return filter === 'rest' ? finding.severity === 'ok' || finding.severity === 'info' : finding.severity === filter;
};
