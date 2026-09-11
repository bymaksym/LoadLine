import { Component, computed, inject, signal } from '@angular/core';
import { type ScreenCost } from '@core/analysis/analysis.types';
import { rate } from '@core/criteria/criteria';
import { type Verdict } from '@core/criteria/criteria.types';
import { formatBytes, formatDelta } from '@core/format/format.utils';
import { ExplainComponent } from '@shared/explain/explain';
import { BytesPipe } from '@shared/pipes/bytes.pipe';
import { pickSort, type Sort, sortSign } from '@shared/sort-header/sort.utils';
import { SortHeaderComponent } from '@shared/sort-header/sort-header';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';
import { PanelHeaderComponent } from '../panel-header/panel-header';
import { revealOnFocus } from '../reveal-on-focus.utils';
import { NotScreensComponent } from './not-screens';
import { ScreenDetailComponent } from './screen-detail';

type SortKey = 'total' | 'shared' | 'own' | 'waves' | 'name' | 'delta';

/**
 * How wide each numeric column is. Here rather than in the stylesheet because the template is
 * assembled from whichever of them are on, and a width the CSS knows and the list does not is a
 * header that drifts off its rows.
 */
const COLUMN_WIDTH: Record<SortKey, string> = {
    name: '13rem',
    waves: '5rem',
    shared: '7rem',
    own: '6rem',
    total: '7rem',
    delta: '6rem',
};
type VerdictFilter = Verdict | 'all';

/** The delta cell of a row: text with its sign, and which way it moved. `new` = not in the baseline. */
interface DeltaCell {
    text: string;
    tone: 'up' | 'down' | 'same' | 'new';
}

/** Cost per screen: one row per screen with its bar, filterable, sortable and expandable. */
@Component({
    selector: 'app-screens-tab',
    templateUrl: './screens-tab.html',
    styleUrl: './screens-tab.scss',
    imports: [
        PanelHeaderComponent,
        BytesPipe,
        NotScreensComponent,
        SortHeaderComponent,
        ScreenDetailComponent,
        ExplainComponent,
    ],
})
export class ScreensTabComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);
    protected readonly nav = inject(ReportNav);

    // * CONSTANTS
    protected readonly verdictFilters: VerdictFilter[] = ['all', 'bad', 'ok', 'good'];

    // * ATTRIBUTES
    protected readonly filter = signal('');
    /** Named `order` and not `sort` on purpose: `this.sort()` reads as `Array#sort` to a linter. */
    protected readonly order = signal<Sort<SortKey>>({ key: 'total', dir: 'desc' });
    protected readonly verdictFilter = signal<VerdictFilter>('all');
    protected readonly expanded = signal<string | null>(null);

    protected readonly screens = computed(() => this.store.analysis()?.screens ?? []);

    /**
     * What the first load costs in round trips. It is not a property of any one screen — everybody
     * pays the same one — so it goes next to the legend rather than in a column, and it says "not
     * known" instead of a number when `index.html` was never loaded.
     */
    protected readonly startupNote = computed(() => {
        const analysis = this.store.analysis();
        const startup = analysis?.startup;
        return this.i18n
            .ui()
            .startupNote(
                startup
                    ? { waves: startup.waves, late: startup.discovered.length, chunks: analysis?.bootFiles ?? 0 }
                    : null,
            );
    });

    protected readonly comparison = computed(() => this.store.comparison());

    /**
     * The baseline column, and only when the baseline moved something. Twenty rows of `=` is a
     * column of noise in the widest table of the report: if nothing changed there is nothing to
     * compare, and the space goes back to the bars.
     */
    protected readonly showDelta = computed(() => {
        const comparison = this.comparison();
        if (!comparison) {
            return null;
        }

        const moved = this.screens().some(screen => (comparison.screens.get(screen.source)?.total.diff ?? 0) !== 0);
        const appeared = comparison.newScreens.length > 0 || comparison.goneScreens.length > 0;
        return moved || appeared ? comparison : null;
    });

    /** Deltas in raw bytes while the table shows compressed ones deserve a line saying so. */
    protected readonly deltaNote = computed(() => {
        const comparison = this.comparison();
        if (!comparison) {
            return '';
        }

        const t = this.i18n.ui();
        const parts: string[] = [];
        if (comparison.mode === 'raw' && this.store.compressed()) {
            parts.push(t.deltaRaw);
        }
        if (comparison.newScreens.length > 0) {
            parts.push(t.compareNewScreens(comparison.newScreens.length));
        }
        if (comparison.goneScreens.length > 0) {
            parts.push(t.compareGoneScreens(comparison.goneScreens.length));
        }
        return parts.join(' · ');
    });

    /** Common scale of the bars: the most expensive screen marks 100 %, whatever the sort order. */
    protected readonly scale = computed(() => Math.max(1, ...this.screens().map(screen => screen.total)));

    /** How many screens fall in each rating, for the filter buttons. */
    protected readonly verdictCount = computed<Record<Verdict, number>>(() => {
        const count: Record<Verdict, number> = { good: 0, ok: 0, bad: 0 };
        for (const screen of this.screens()) {
            count[this.totalVerdict(screen)]++;
        }
        return count;
    });

    /**
     * The numeric columns, in the order they are drawn. A list rather than six blocks of markup:
     * every one of them is the same control with a different label, and the delta only exists when
     * there is a baseline that moved.
     */
    protected readonly numberColumns = computed(() => {
        const hidden = this.hiddenColumns();
        return this.allColumns().filter(column => !hidden.has(column.key));
    });

    /**
     * Every numeric column the table can draw, whether or not it is drawn.
     *
     * The chooser needs the full list — a column you have hidden is precisely the one you have to
     * be able to tick back on — so the filtering happens one step later rather than here.
     */
    protected readonly allColumns = computed(() => {
        const t = this.i18n.ui();
        const columns: { key: SortKey; cls: string; label: string; help: string }[] = [
            { key: 'waves', cls: 'screen-row__num screen-row__num--waves', label: t.colWaves, help: t.helpWaves },
            {
                key: 'shared',
                cls: 'screen-row__num screen-row__num--shared',
                label: t.colShared,
                help: t.helpSharedCol,
            },
            {
                key: 'own',
                cls: 'screen-row__num screen-row__num--own',
                label: t.colOwn,
                help: `${t.helpOwnCol} ${this.ownRule()}`,
            },
            {
                key: 'total',
                cls: 'screen-row__num screen-row__total',
                label: t.colTotal,
                help: `${t.helpTotal} ${this.totalRule()}`,
            },
        ];

        const compared = this.showDelta();
        if (compared) {
            columns.push({
                key: 'delta',
                cls: 'screen-row__num screen-row__delta',
                label: t.colDelta,
                help: t.helpDelta(compared.baselineName),
            });
        }

        return columns;
    });

    /**
     * Columns taken off the table, in the address so a link carries the view somebody set up.
     *
     * The screen name, the bar and the total never leave: the first two identify the row and the
     * third is what the table is for. What can go is the three figures that break the total down,
     * and the delta — the ones somebody has already read and is now scrolling past.
     */
    protected readonly hiddenColumns = computed<ReadonlySet<SortKey>>(
        () => new Set(this.nav.param('hide').split(',').filter(Boolean) as SortKey[]),
    );

    protected readonly hideableColumns = computed(() => this.allColumns().filter(column => column.key !== 'total'));

    /**
     * The grid the header and every row share, built from the columns actually drawn.
     *
     * A custom property rather than a class per combination: there are sixteen ways to tick four
     * boxes, and sixteen grid templates written by hand is sixteen chances for the header to stop
     * lining up with the rows under it.
     */
    protected readonly gridColumns = computed(() =>
        ['13rem', 'minmax(0, 1fr)', ...this.numberColumns().map(column => COLUMN_WIDTH[column.key])].join(' '),
    );

    protected shows(key: SortKey): boolean {
        return !this.hiddenColumns().has(key);
    }

    protected toggleColumn(key: SortKey): void {
        const hidden = new Set(this.hiddenColumns());
        if (!hidden.delete(key)) {
            hidden.add(key);
        }

        // Sorting by a column that is no longer drawn would leave the table in an order with
        // nothing on screen explaining it.
        if (hidden.has(this.order().key)) {
            this.order.set({ key: 'total', dir: 'desc' });
        }

        this.nav.setParam('hide', [...hidden].join(','));
    }

    protected readonly rows = computed<ScreenCost[]>(() => {
        const query = this.filter().trim().toLowerCase();
        const { key, dir } = this.order();
        const sign = sortSign(dir);
        const verdict = this.verdictFilter();

        const rows = this.screens().filter(
            screen =>
                (!query || screen.label.toLowerCase().includes(query) || screen.source.toLowerCase().includes(query)) &&
                (verdict === 'all' || this.totalVerdict(screen) === verdict),
        );

        if (key === 'name') {
            return rows.toSorted((a, b) => sign * a.label.localeCompare(b.label));
        }
        if (key === 'delta') {
            const deltas = this.comparison()?.screens;
            const diffOf = (screen: ScreenCost) => deltas?.get(screen.source)?.total.diff ?? -Infinity;
            return rows.toSorted((a, b) => sign * (diffOf(a) - diffOf(b)));
        }
        return rows.toSorted((a, b) => sign * (a[key] - b[key]));
    });

    protected readonly totalRule = computed(() => {
        const c = this.store.criteria();
        return this.i18n.ui().verdictRule(formatBytes(c.screenOk), formatBytes(c.screenBad));
    });

    protected readonly ownRule = computed(() => {
        const c = this.store.criteria();
        return this.i18n.ui().verdictRule(formatBytes(c.ownOk), formatBytes(c.ownBad));
    });

    constructor() {
        // A signal ("see the screen") asks for a row: the filters are cleared so it cannot be
        // hidden by one, and the row opens.
        revealOnFocus('screens', key => {
            this.filter.set('');
            this.verdictFilter.set('all');
            this.expanded.set(key);
        });
    }

    protected totalVerdict(screen: ScreenCost): Verdict {
        const c = this.store.criteria();
        return rate(screen.total, c.screenOk, c.screenBad);
    }

    protected ownVerdict(screen: ScreenCost): Verdict {
        const c = this.store.criteria();
        return rate(screen.own, c.ownOk, c.ownBad);
    }

    protected verdictLabel(filter: VerdictFilter): string {
        const t = this.i18n.ui();
        const labels: Record<VerdictFilter, string> = {
            all: t.treeAll,
            good: t.verdictGood,
            ok: t.verdictOk,
            bad: t.verdictBad,
        };
        return labels[filter];
    }

    /**
     * Pressing a column header. Names read A to Z; every other column is interesting from the top
     * down, and pressing it again is what gets you the cheapest screen without scrolling to the end.
     */
    protected pick(key: SortKey): void {
        this.order.set(pickSort(this.order(), key, key === 'name' ? 'asc' : 'desc'));
    }

    protected deltaOf(screen: ScreenCost): DeltaCell | null {
        const comparison = this.showDelta();
        if (!comparison) {
            return null;
        }

        const delta = comparison.screens.get(screen.source);
        if (!delta) {
            return { text: this.i18n.ui().compareNew, tone: 'new' };
        }

        // A screen that did not move leaves the cell empty. An `=` in every row that did not change
        // is the same mark repeated fifteen times, which reads as a pattern and means nothing.
        const { diff } = delta.total;
        return diff === 0 ? { text: '', tone: 'same' } : { text: formatDelta(diff), tone: diff > 0 ? 'up' : 'down' };
    }

    protected toggle(screen: ScreenCost): void {
        this.expanded.set(this.expanded() === screen.source ? null : screen.source);
    }

    protected percent(value: number): number {
        return (value / this.scale()) * 100;
    }

    /**
     * Where the "good up to" and "bad above" thresholds fall on the shared scale, as percentages.
     *
     * The bars already make the finding visible without reading a number — that is what the shared
     * scale is for — and this does the same for the verdict: a row whose bar crosses the second
     * line is over budget, seen rather than looked up. `null` when a threshold sits off the end of
     * the scale, because a line drawn at 140 % is a line drawn nowhere.
     */
    protected readonly thresholds = computed(() => {
        const c = this.store.criteria();
        const scale = this.scale();
        const at = (value: number): number | null => (value > 0 && value <= scale ? (value / scale) * 100 : null);

        return { ok: at(c.screenOk), bad: at(c.screenBad) };
    });
}
