import { Component, computed, inject, signal } from '@angular/core';
import { type ChunkInfo } from '@core/analysis/analysis.types';
import { filesOfChunk } from '@core/analysis/path-tree';
import { type PathItem } from '@core/analysis/path-tree.types';
import { type Verdict } from '@core/criteria/criteria.types';
import { elidePath, formatBytes } from '@core/format/format.utils';
import { effectiveBootBytes, worthOfShared } from '@core/worth/worth';
import { type Worth } from '@core/worth/worth.types';
import { ExplainComponent } from '@shared/explain/explain';
import { PathTreeComponent } from '@shared/path-tree/path-tree';
import { BytesPipe } from '@shared/pipes/bytes.pipe';
import { pickSort, type Sort, sortSign } from '@shared/sort-header/sort.utils';
import { SortHeaderComponent } from '@shared/sort-header/sort-header';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';
import { PanelHeaderComponent } from '../panel-header/panel-header';
import { revealOnFocus } from '../reveal-on-focus.utils';

type Coverage = 'global' | 'wide' | 'narrow';
type SortKey = 'name' | 'coverage' | 'bytes';

interface SharedRow extends ChunkInfo {
    ratio: number;
    coverage: Coverage;
    /**
     * Coverage as a rating: near-global is bad, widely shared fair, lightly shared good — and no
     * colour at all when the chunk costs less than the minimum worth touching, whatever its
     * coverage. Colour is for what somebody should act on.
     */
    verdict: Verdict | null;
    /** Size in red when it is near-global and heavy enough to be a signal. */
    sizeVerdict: Verdict | null;
    /** Screens loading it: source and label, to link with the screens tab. */
    loadedBy: { source: string; label: string }[];
    /** Every file of the chunk, for the folder tree. */
    files: PathItem[];
    /** What it costs on a typical visit, and which group of the chunk that cost comes from. */
    worth: Worth;
}

/** Lazy chunks loaded by several screens: how many, which ones and what they carry. */
@Component({
    selector: 'app-shared-tab',
    templateUrl: './shared-tab.html',
    styleUrl: './shared-tab.scss',
    imports: [PanelHeaderComponent, BytesPipe, PathTreeComponent, SortHeaderComponent, ExplainComponent],
})
export class SharedTabComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);
    protected readonly nav = inject(ReportNav);

    // * CONSTANTS
    protected readonly elide = elidePath;

    // * ATTRIBUTES
    protected readonly expanded = signal<string | null>(null);
    protected readonly filter = signal('');
    /** Named `order` and not `sort` on purpose: `this.sort()` reads as `Array#sort` to a linter. */
    protected readonly order = signal<Sort<SortKey>>({ key: 'coverage', dir: 'desc' });

    protected readonly totalScreens = computed(() => this.store.analysis()?.screens.length ?? 0);

    private readonly chunks = computed<SharedRow[]>(() => {
        const analysis = this.store.analysis();
        if (!analysis) {
            return [];
        }

        const c = this.store.criteria();
        const total = analysis.screens.length || 1;
        const labelOf = new Map(analysis.screens.map(screen => [screen.source, screen.label]));
        const treeById = new Map(analysis.tree.map(node => [node.id, node]));
        const effectiveBoot = effectiveBootBytes(analysis, c.sharedRatio);
        const importersOf = (pkg: string): number => analysis.packageImporters.get(pkg)?.size ?? 0;

        return analysis.sharedChunks.map(chunk => {
            const ratio = chunk.screens / total;
            const coverage = coverageOf(ratio, c.sharedRatio, c.wideRatio);
            const node = treeById.get(chunk.file);

            const worth = worthOfShared({
                bytes: chunk.bytes,
                ratio,
                // The analysis already grouped the chunk by package and by project folder,
                // which is the unit a decision is taken about.
                groups: (node?.children ?? []).map(group => ({
                    label: group.label,
                    bytes: group.bytes,
                    isPackage: group.kind === 'package',
                })),
                importersOf,
                effectiveBoot,
                minBytes: c.sharedMinBytes,
                maxImporters: c.bootPackageMaxImporters,
                dominantRatio: c.dominantRatio,
            });

            return {
                ...chunk,
                ratio,
                coverage,
                /**
                 * Coverage rated by what it costs, not by the proportion alone. A chunk of 101 B
                 * loaded by 17 of 22 screens is 77 % coverage and 101 B: painting that red says
                 * "bad" about nothing, and contradicts both the effective-bootstrap figure and this
                 * tab's own triage. The label stays — it is still, in practice, bootstrap.
                 */
                verdict: worth.level === 'none' ? null : VERDICT_BY_COVERAGE[coverage],
                sizeVerdict: coverage === 'global' && chunk.bytes > c.sharedMinBytes ? 'bad' : null,
                loadedBy: (analysis.chunkScreens.get(chunk.file) ?? [])
                    .map(source => ({ source, label: labelOf.get(source) ?? source }))
                    .toSorted((a, b) => a.label.localeCompare(b.label)),
                files: filesOfChunk(node),
                worth,
            };
        });
    });

    /** Every chunk, sorted; the denominator of "8 of 15" and what the summary line adds up. */
    protected readonly allRows = computed(() => {
        const { key, dir } = this.order();
        const sign = sortSign(dir);
        const rows = this.chunks();

        if (key === 'name') {
            return rows.toSorted((a, b) => sign * a.name.localeCompare(b.name));
        }
        if (key === 'coverage') {
            return rows.toSorted((a, b) => sign * (a.ratio - b.ratio));
        }
        return rows.toSorted((a, b) => sign * (a.bytes - b.bytes));
    });

    protected readonly rows = computed<SharedRow[]>(() => {
        const query = this.filter().trim().toLowerCase();
        if (!query) {
            return this.allRows();
        }

        return this.allRows().filter(
            row => row.name.toLowerCase().includes(query) || row.mainContent.toLowerCase().includes(query),
        );
    });

    protected readonly sumText = computed(() => {
        const t = this.i18n.ui();
        const ratio = this.store.criteria().sharedRatio;
        const globals = this.allRows().filter(row => row.coverage === 'global');
        if (globals.length === 0) {
            return t.sharedSumNone(ratio);
        }

        const bytes = globals.reduce((sum, row) => sum + row.bytes, 0);
        return t.sharedSum(formatBytes(bytes), globals.length, ratio);
    });

    protected readonly coverageRule = computed(() => {
        const c = this.store.criteria();
        return this.i18n.ui().verdictRuleCoverage(Math.round(c.wideRatio * 100), Math.round(c.sharedRatio * 100));
    });

    /**
     * The tab in one line: of the chunks everybody ends up downloading, how many have a named
     * source and how many do not. Turns a list of 148 rows into three numbers to act on.
     */
    protected readonly triage = computed(() => {
        const t = this.i18n.ui();
        // Every row of the table, not only the near-global ones: the line has to add up to what
        // the tags below say, or it reads as a contradiction.
        const rows = this.allRows();
        if (rows.length === 0) {
            return '';
        }

        const of = (level: Worth['level']) => rows.filter(row => row.worth.level === level);
        const cost = (group: SharedRow[]) => formatBytes(group.reduce((sum, row) => sum + row.worth.typicalCost, 0));
        const named = of('try');
        const spread = of('hard');

        return t.worthTriage({
            namedN: named.length,
            namedCost: cost(named),
            spreadN: spread.length,
            spreadCost: cost(spread),
            smallN: of('none').length,
            min: formatBytes(this.store.criteria().sharedMinBytes),
        });
    });

    constructor() {
        // A signal asking for a chunk must not land on one the filter is hiding.
        revealOnFocus('shared', key => {
            this.filter.set('');
            this.expanded.set(key);
        });
    }

    protected pick(key: SortKey): void {
        this.order.set(pickSort(this.order(), key, key === 'name' ? 'asc' : 'desc'));
    }

    /**
     * Where the weight comes from, in two or three words. Deliberately a description and not a
     * verdict: "no dominant source" is a fact about the import graph that the reader can check,
     * whereas "no easy fix" is a claim about their project that the report cannot back up.
     */
    protected worthLabel(worth: Worth): string {
        const t = this.i18n.ui();
        const labels: Record<Worth['origin'], string> = {
            small: t.worthTagSmall,
            ownCode: t.worthTagOwn,
            package: t.worthTagPackage(worth.importers ?? 0),
            common: t.worthTagCommon,
        };
        return labels[worth.origin];
    }

    /** What it costs today and what it would cost without it: the same sentence for every row. */
    protected worthCost(worth: Worth): string {
        const t = this.i18n.ui();
        return t.worthCost(
            formatBytes(worth.typicalCost),
            Math.round(worth.shareOfBoot * 100),
            formatBytes(worth.withoutIt),
        );
    }

    /** Why that answer, with the thing to look at named. */
    protected worthWhy(worth: Worth): string {
        const t = this.i18n.ui();
        const share = worth.top ? Math.round(worth.top.share * 100) : 0;

        if (worth.origin === 'small') {
            return t.worthSmall(formatBytes(this.store.criteria().sharedMinBytes));
        }
        if (worth.origin === 'ownCode') {
            return t.worthOwn(worth.top?.label ?? '', share);
        }
        if (worth.origin === 'package') {
            return t.worthPackage(worth.top?.label ?? '', share, worth.importers ?? 0);
        }
        return t.worthCommon;
    }

    protected toggle(row: SharedRow): void {
        this.expanded.set(this.expanded() === row.file ? null : row.file);
    }

    protected covLabel(coverage: Coverage): string {
        const t = this.i18n.ui();
        const labels: Record<Coverage, string> = { global: t.covGlobal, wide: t.covWide, narrow: t.covNarrow };
        return labels[coverage];
    }

    protected tagClass(coverage: Coverage): string {
        return TAG_BY_COVERAGE[coverage];
    }
}

const VERDICT_BY_COVERAGE: Record<Coverage, Verdict> = { global: 'bad', wide: 'ok', narrow: 'good' };
const TAG_BY_COVERAGE: Record<Coverage, string> = { global: 'tag--crit', wide: 'tag--warn', narrow: 'tag--ok' };

const coverageOf = (ratio: number, sharedRatio: number, wideRatio: number): Coverage => {
    if (ratio >= sharedRatio) {
        return 'global';
    }
    return ratio >= wideRatio ? 'wide' : 'narrow';
};
