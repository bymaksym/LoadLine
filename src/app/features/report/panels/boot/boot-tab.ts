import { Component, computed, inject, signal } from '@angular/core';
import { type BucketSlice } from '@core/analysis/analysis.types';
import { mergePathItems } from '@core/analysis/path-tree';
import { type PathItem } from '@core/analysis/path-tree.types';
import { rate } from '@core/criteria/criteria';
import { type Verdict } from '@core/criteria/criteria.types';
import { baseName, chainSteps, formatBytes } from '@core/format/format.utils';
import { ChainComponent } from '@shared/chain/chain';
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

type SortKey = 'name' | 'bytes' | 'exclusive' | 'importers';

interface BootRow extends BucketSlice {
    percent: number;
    /** Own files importing the package directly. `null` for project folders. */
    importers: number | null;
    /**
     * Few importers and at least one of them in a lazy screen: few enough to open one by one, and
     * one of them already suggests the package could be moved into its screen. Deliberately not
     * called "only lazy screens import it" — the rule does not check that, and the row says how
     * many of the importers are lazy so the reader can see which case they have.
     */
    fewImporters: boolean;
    lazyScreens: string[];
    /** Size in red when the package matches the signal's criterion, as a pointer to check it. */
    sizeVerdict: Verdict | null;
    /** The files adding up to this entry, for the folder tree. */
    files: PathItem[];
    /** Own files importing the package. Screens carry their label and link to their tab. */
    importerFiles: { path: string; screen: string | null }[];
    /** Import chain from the entry, as readable steps. `null` for project folders or when not followed. */
    chain: string[] | null;
    /** Shipped as CommonJS: the bundler cannot tree-shake it. */
    isCommonJs: boolean;
    /**
     * What the first load would lose without it: the part of `bytes` that has no other way in.
     *
     * It is the column that makes this table a list of actions rather than a list of weights.
     * `chart.js weighs 310 kB` orders a plan wrongly when 240 of those are `d3`, which three other
     * things also pull in — removing `chart.js` saves 70, and until now nothing here said so.
     */
    exclusive: number;
    /** `exclusive / bytes`. Under 1 means part of it arrives anyway through something else. */
    exclusiveShare: number;
}

/** Bootstrap breakdown by package and folder, with who imports each package and which files form it. */
@Component({
    selector: 'app-boot-tab',
    templateUrl: './boot-tab.html',
    styleUrl: './boot-tab.scss',
    imports: [
        PanelHeaderComponent,
        BytesPipe,
        PathTreeComponent,
        SortHeaderComponent,
        ChainComponent,
        ExplainComponent,
    ],
})
export class BootTabComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);
    protected readonly nav = inject(ReportNav);

    // * ATTRIBUTES
    protected readonly expanded = signal<string | null>(null);
    /** Started from the address and written back to it, so a filtered table can be handed over. */
    protected readonly filter = signal(this.nav.param('q'));

    protected search(value: string): void {
        this.filter.set(value);
        this.nav.setParam('q', value);
    }
    /** Named `order` and not `sort` on purpose: `this.sort()` reads as `Array#sort` to a linter. */
    protected readonly order = signal<Sort<SortKey>>({ key: 'bytes', dir: 'desc' });

    /** The files of each bootstrap package or folder, merging the ones that appear in several chunks. */
    private readonly filesByBucket = computed(() => {
        const files = new Map<string, PathItem[]>();
        const bootChunks = (this.store.analysis()?.tree ?? []).filter(chunk => chunk.zone === 'boot');

        const groups = bootChunks.flatMap(chunk => chunk.children);

        for (const group of groups) {
            const items =
                group.children.length > 0
                    ? group.children.map(file => ({ path: file.label, bytes: file.bytes }))
                    : [{ path: group.label, bytes: group.bytes }];
            files.set(group.label, [...(files.get(group.label) ?? []), ...items]);
        }

        return new Map([...files].map(([name, items]) => [name, mergePathItems(items)]));
    });

    private readonly allRowsUnsorted = computed<BootRow[]>(() => {
        const analysis = this.store.analysis();
        if (!analysis) {
            return [];
        }

        const c = this.store.criteria();
        const total = analysis.bootBucketTotal || 1;
        const lazySources = new Map(analysis.screens.map(screen => [screen.source, screen.label]));
        const filesByBucket = this.filesByBucket();
        const commonJs = new Set(analysis.commonJs.map(pkg => pkg.name));
        const exclusive = analysis.insights().exclusive;

        return analysis.bootBuckets.map(bucket => {
            const importers = bucket.isProjectCode ? null : [...(analysis.packageImporters.get(bucket.name) ?? [])];
            const lazyScreens = (importers ?? [])
                .filter(file => lazySources.has(file))
                .map(file => lazySources.get(file) ?? baseName(file));

            // Same criterion as the signal: few importers and one of them is in a lazy screen.
            const fewImporters = !!importers && lazyScreens.length > 0 && importers.length <= c.bootPackageMaxImporters;
            const chain = bucket.isProjectCode ? null : analysis.bootChains.get(bucket.name);

            return {
                ...bucket,
                percent: (bucket.bytes / total) * 100,
                importers: importers ? importers.length : null,
                fewImporters,
                lazyScreens,
                sizeVerdict: fewImporters && bucket.bytes >= c.bootPackageMinBytes ? 'bad' : null,
                files: filesByBucket.get(bucket.name) ?? [],
                importerFiles: (importers ?? [])
                    .toSorted((a, b) => a.localeCompare(b))
                    .map(path => ({ path, screen: lazySources.get(path) ?? null })),
                chain: chain ? chainSteps(chain) : null,
                isCommonJs: commonJs.has(bucket.name),
                exclusive: exclusive.get(bucket.name) ?? 0,
                exclusiveShare: bucket.bytes > 0 ? (exclusive.get(bucket.name) ?? 0) / bucket.bytes : 0,
            };
        });
    });

    /** Every row, before the text filter: the denominator of "13 of 61" and of the split figures. */
    protected readonly allRows = computed(() => this.sorted(this.allRowsUnsorted()));

    protected readonly rows = computed<BootRow[]>(() => {
        const query = this.filter().trim().toLowerCase();
        if (!query) {
            return this.allRows();
        }

        return this.allRows().filter(row => row.name.toLowerCase().includes(query));
    });

    protected readonly split = computed(() => {
        const rows = this.allRows();
        const pkg = rows.filter(row => !row.isProjectCode);
        const own = rows.filter(row => row.isProjectCode);
        const sum = (list: BootRow[]) => list.reduce((acc, row) => acc + row.bytes, 0);

        return { pkgBytes: sum(pkg), pkgCount: pkg.length, ownBytes: sum(own), ownCount: own.length };
    });

    /** Whether any row is rated red, so the legend only explains that colour when it is on screen. */
    protected readonly hasBadRow = computed(() => this.allRows().some(row => row.sizeVerdict === 'bad'));

    /** The split bar, in words: colour is never the only thing that says which side is which. */
    protected readonly splitTitle = computed(() => {
        const totals = this.split();
        const t = this.i18n.ui();
        return t.helpBootSplit(
            `${formatBytes(totals.pkgBytes)} (${this.pct(totals.pkgBytes)})`,
            `${formatBytes(totals.ownBytes)} (${this.pct(totals.ownBytes)})`,
        );
    });

    protected readonly bootVerdict = computed<Verdict>(() => {
        const c = this.store.criteria();
        return rate(this.store.analysis()?.bootBytes ?? 0, c.bootOk, c.bootBad);
    });

    protected readonly bootRule = computed(() => {
        const c = this.store.criteria();
        return this.i18n.ui().verdictRule(formatBytes(c.bootOk), formatBytes(c.bootBad));
    });

    constructor() {
        // A signal asking for a row must not land on one the filter is hiding.
        revealOnFocus('boot', key => {
            this.filter.set('');
            this.expanded.set(key);
        });
    }

    protected pick(key: SortKey): void {
        this.order.set(pickSort(this.order(), key, key === 'name' ? 'asc' : 'desc'));
    }

    private sorted(rows: BootRow[]): BootRow[] {
        const { key, dir } = this.order();
        const sign = sortSign(dir);

        if (key === 'name') {
            return rows.toSorted((a, b) => sign * a.name.localeCompare(b.name));
        }
        if (key === 'exclusive') {
            return rows.toSorted((a, b) => sign * (a.exclusive - b.exclusive));
        }
        // A project folder has no importers to count; it sits at the end either way.
        if (key === 'importers') {
            return rows.toSorted((a, b) => sign * ((a.importers ?? -1) - (b.importers ?? -1)));
        }
        return rows.toSorted((a, b) => sign * (a.bytes - b.bytes));
    }

    protected toggle(row: BootRow): void {
        this.expanded.set(this.expanded() === row.name ? null : row.name);
    }

    protected percent(bytes: number): number {
        const total = this.store.analysis()?.bootBucketTotal ?? 0;
        return total > 0 ? (bytes / total) * 100 : 0;
    }

    protected pct(bytes: number): string {
        return `${this.percent(bytes).toFixed(0)} %`;
    }

    /**
     * What a row's bar means, on hover: the share it takes and what its colour says. The bar is the
     * only thing on the row that carries meaning in colour alone, so it is the one that needs it.
     */
    /** Why the two figures differ, said in the cell rather than left to be worked out. */
    /**
     * The three figures of a row, explained, inside the detail the row already opens.
     *
     * They were three `title` attributes on three cells. Giving each of them the explain mark would
     * have been three marks per row and a hundred and eighty in a bootstrap of sixty-one entries;
     * the column headers carry the general explanation, and what is particular to this row goes
     * here, where somebody has already asked about this row.
     */
    protected rowFigures(row: BootRow): string {
        const parts = [this.barTitle(row), this.exclusiveTitle(row)];
        if (row.sizeVerdict === 'bad') {
            parts.push(this.lazyImportersHelp());
        }
        return parts.join(' · ');
    }

    protected exclusiveTitle(row: BootRow): string {
        return this.i18n.ui().helpExclusiveOf(Math.round(row.exclusiveShare * 100));
    }

    protected barTitle(row: BootRow): string {
        const t = this.i18n.ui();
        const kind = row.isProjectCode ? t.legBootOwn : t.legBootPkg;
        const parts = [`${row.percent.toFixed(1)} % ${t.helpBootOfBoot}`, kind];
        if (row.sizeVerdict === 'bad') {
            parts.push(t.legBootBad);
        }
        return parts.join(' · ');
    }

    /** Why a size is in red. Plain size the rest of the time: there is nothing to explain. */
    protected sizeTitle(row: BootRow): string {
        const t = this.i18n.ui();
        return row.sizeVerdict === 'bad' ? this.lazyImportersHelp() : t.helpSize;
    }

    /** The rule behind the red row, with its own threshold in it: the reader can move it. */
    protected lazyImportersHelp(): string {
        return this.i18n.ui().helpBootLazyOnly(this.store.criteria().bootPackageMaxImporters);
    }
}
