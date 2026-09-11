import { Component, computed, inject, signal, type WritableSignal } from '@angular/core';
import { rate } from '@core/criteria/criteria';
import { type Mode, type Verdict } from '@core/criteria/criteria.types';
import { formatBytes, formatDelta } from '@core/format/format.utils';
import { globalSharedChunks } from '@core/worth/worth';
import { copyText } from '@shared/clipboard.utils';
import { ExplainComponent } from '@shared/explain/explain';
import { BytesPipe } from '@shared/pipes/bytes.pipe';
import { VerdictComponent } from '@shared/verdict/verdict';
import { CompareStore } from '@state/compare.store';
import { CriteriaService } from '@state/criteria.service';
import { ExportService } from '@state/export.service';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';
import { REPORT_TABS, type ReportTab } from '@state/report-nav.types';
import { SituationService } from '@state/situation.service';
import { BootTabComponent } from './panels/boot/boot-tab';
import { CompareTabComponent } from './panels/compare/compare-tab';
import { CriteriaTabComponent } from './panels/criteria/criteria-tab';
import { FindingsTabComponent } from './panels/findings/findings-tab';
import { MeasuredTabComponent } from './panels/measured/measured-tab';
import { ProjectTabComponent } from './panels/project/project-tab';
import { ScreensTabComponent } from './panels/screens/screens-tab';
import { SearchTabComponent } from './panels/search/search-tab';
import { SharedTabComponent } from './panels/shared/shared-tab';
import { SituationTabComponent } from './panels/situation/situation-tab';
import { TreeTabComponent } from './panels/tree/tree-tab';

/** What separates two clauses of one explanation. The bubble keeps the break as a break. */
const PARAGRAPH = '\n\n';

/** The report: five rated summary figures and one tab per view. Every tab is a component. */
@Component({
    selector: 'app-report-page',
    templateUrl: './report.page.html',
    styleUrl: './report.page.scss',
    imports: [
        BytesPipe,
        FindingsTabComponent,
        ScreensTabComponent,
        MeasuredTabComponent,
        BootTabComponent,
        SharedTabComponent,
        TreeTabComponent,
        SearchTabComponent,
        ProjectTabComponent,
        SituationTabComponent,
        CriteriaTabComponent,
        VerdictComponent,
        ExplainComponent,
        CompareTabComponent,
    ],
})
export class ReportPageComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);
    protected readonly nav = inject(ReportNav);
    private readonly criteriaService = inject(CriteriaService);
    protected readonly exports = inject(ExportService);
    private readonly compare = inject(CompareStore);
    private readonly situationService = inject(SituationService);

    // * CONSTANTS
    protected readonly tabs = REPORT_TABS;

    // * ATTRIBUTES
    /** Feedback after copying the Markdown table; goes back to the button label after a moment. */
    protected readonly copied = signal(false);
    protected readonly copiedDiagnostics = signal(false);

    /**
     * The stylesheets the page asks for, in the unit the report is shown in, next to the figure
     * that does not include them. `null` without a build folder: there is nothing measured to say.
     */
    protected readonly pageCss = computed(() => {
        const css = this.store.pageCss();
        const boot = this.store.analysis()?.bootBytes;
        if (!css || boot === undefined) {
            return null;
        }

        const mode = this.store.mode();
        const bytes = mode === 'brotli' ? (css.brotli ?? css.gzip) : css[mode];
        return { size: formatBytes(bytes), files: css.files.length, total: formatBytes(boot + bytes) };
    });

    /** The lead line above the figures: which unit they are in. */
    protected readonly lead = computed(() => {
        const t = this.i18n.ui();
        const leads: Record<Mode, string> = {
            raw: t.headLeadRaw,
            gzip: t.headLeadGzip,
            brotli: t.headLeadBrotli,
        };
        return leads[this.store.mode()];
    });

    /** "Lazy" chunks loaded by so many screens that, for all practical purposes, they are bootstrap. */
    protected readonly globalShared = computed(() => {
        const analysis = this.store.analysis();
        return analysis ? globalSharedChunks(analysis, this.store.criteria().sharedRatio) : [];
    });

    protected readonly wideShared = computed(() => {
        const analysis = this.store.analysis();
        if (!analysis) {
            return [];
        }

        const total = analysis.screens.length;
        const { sharedRatio, wideRatio } = this.store.criteria();
        return analysis.sharedChunks.filter(
            chunk => total > 0 && chunk.screens >= total * wideRatio && chunk.screens < total * sharedRatio,
        );
    });

    protected readonly extraBytes = computed(() => this.globalShared().reduce((sum, chunk) => sum + chunk.bytes, 0));

    protected readonly effectiveBytes = computed(() => (this.store.analysis()?.bootBytes ?? 0) + this.extraBytes());

    protected readonly medianTotal = computed(() => {
        const totals = (this.store.analysis()?.screens ?? []).map(screen => screen.total).toSorted((a, b) => a - b);
        return totals[Math.floor(totals.length / 2)] ?? 0;
    });

    /** `info` findings are context: they neither count nor colour anything. */
    protected readonly severityCount = computed(() => {
        const findings = this.store.findings();
        return {
            high: findings.filter(f => f.severity === 'high').length,
            mid: findings.filter(f => f.severity === 'mid').length,
        };
    });

    /** Under the bootstrap tile: how it moved against the baseline, when there is one. */
    protected readonly bootDelta = computed(() => {
        const comparison = this.store.comparison();
        if (!comparison) {
            return null;
        }

        const t = this.i18n.ui();
        const { diff, ratio } = comparison.boot;
        if (diff === 0) {
            return { text: t.tileBootSame(comparison.baselineName), tone: 'same' as const };
        }

        return {
            text: t.tileBootDelta(formatDelta(diff), Math.round(ratio * 100), comparison.baselineName),
            tone: diff > 0 ? ('up' as const) : ('down' as const),
        };
    });

    // --- Ratings of the five figures ------------------------------------------------------------
    protected readonly bootVerdict = computed<Verdict>(() => {
        const c = this.store.criteria();
        return rate(this.store.analysis()?.bootBytes ?? 0, c.bootOk, c.bootBad);
    });

    protected readonly effectiveVerdict = computed<Verdict>(() => {
        const c = this.store.criteria();
        return rate(this.effectiveBytes(), c.bootOk, c.bootBad);
    });

    protected readonly medianVerdict = computed<Verdict>(() => {
        const c = this.store.criteria();
        return rate(this.medianTotal(), c.screenOk, c.screenBad);
    });

    /**
     * Rated by what the near-global chunks add to every visit, not by there being any. Counting
     * them was saying "bad" about nine chunks adding 33 kB while the tile next to it rated the
     * effective bootstrap that includes those same 33 kB as fair — two colours, one fact.
     */
    protected readonly sharedVerdict = computed<Verdict>(() => {
        if (this.extraBytes() >= this.store.criteria().sharedMinBytes) {
            return 'bad';
        }
        return this.globalShared().length > 0 || this.wideShared().length > 0 ? 'ok' : 'good';
    });

    protected readonly findingsVerdict = computed<Verdict>(() => {
        const { high, mid } = this.severityCount();
        if (high > 0) {
            return 'bad';
        }
        return mid > 0 ? 'ok' : 'good';
    });

    protected readonly bootRule = computed(() => {
        const c = this.store.criteria();
        return this.i18n.ui().verdictRule(formatBytes(c.bootOk), formatBytes(c.bootBad));
    });

    protected readonly screenRule = computed(() => {
        const c = this.store.criteria();
        return this.i18n.ui().verdictRule(formatBytes(c.screenOk), formatBytes(c.screenBad));
    });

    protected readonly coverageRule = computed(() => {
        const c = this.store.criteria();
        return this.i18n.ui().verdictRuleCoverage(Math.round(c.wideRatio * 100), Math.round(c.sharedRatio * 100));
    });

    /**
     * Which of the rated tiles carries the badge — and it is one, not five.
     *
     * The five figures used to show "Bad" five times over, which left the whole row in one flat
     * block of red and ranked nothing. The colour of each figure already rates it; the badge earns
     * its place only by pointing at the worst of them. The screens tile is not a candidate: how
     * many screens there are has no threshold, and what is rated there — the typical screen — is a
     * figure in its subtitle.
     */
    protected readonly loudestTile = computed<'boot' | 'effective' | 'shared' | 'findings'>(() => {
        const rank: Record<Verdict, number> = { good: 0, ok: 1, bad: 2 };
        const tiles = [
            ['boot', this.bootVerdict()],
            ['effective', this.effectiveVerdict()],
            ['shared', this.sharedVerdict()],
            ['findings', this.findingsVerdict()],
        ] as const;

        return tiles.reduce((worst, tile) => (rank[tile[1]] > rank[worst[1]] ? tile : worst))[0];
    });

    /**
     * The thresholds the five figures were coloured against, in one sentence.
     *
     * The rule of each tile used to live in that tile's `title`, and a tile is a `button`: nothing
     * clickable can go inside one, so there was no way to make those rules reachable where they
     * were. Said once here, above the row, they are reachable for all five.
     */
    protected readonly rulesInForce = computed(() => {
        const t = this.i18n.ui();
        return [
            `${t.tileBoot}: ${this.bootRule()}`,
            `${t.tileScreens}: ${this.screenRule()}`,
            `${t.tileShared}: ${this.coverageRule()}`,
        ].join(PARAGRAPH);
    });

    protected readonly customCriteria = computed(() => this.criteriaService.customCount(this.store.mode()));

    protected readonly counts = computed<Record<ReportTab, number>>(() => {
        const analysis = this.store.analysis();
        const { high, mid } = this.severityCount();

        return {
            findings: high + mid,
            screens: analysis?.screens.length ?? 0,
            measured: this.store.measured()?.extra.length ?? 0,
            boot: analysis?.bootBuckets.length ?? 0,
            shared: analysis?.sharedChunks.length ?? 0,
            tree: analysis?.tree.length ?? 0,
            search: this.store.searchIndex().total,
            project: this.store.contextInfo()?.files.length ?? 0,
            situation: this.situationService.answered(),
            compare: this.compare.count(),
            criteria: this.customCriteria(),
        };
    });

    /**
     * The rating in a word, for the figures whose badge was taken away. Sighted readers get the
     * colour; without this a screen reader would get a bare number and nothing else.
     */
    protected verdictWord(verdict: Verdict): string {
        const t = this.i18n.ui();
        const words: Record<Verdict, string> = { good: t.verdictGood, ok: t.verdictOk, bad: t.verdictBad };
        return words[verdict];
    }

    protected tabLabel(tab: ReportTab): string {
        const t = this.i18n.ui();
        const labels: Record<ReportTab, string> = {
            findings: t.tabFindings,
            screens: t.tabScreens,
            measured: t.tabMeasured,
            boot: t.tabBoot,
            shared: t.tabShared,
            tree: t.tabTree,
            search: t.tabSearch,
            project: t.tabProject,
            situation: t.tabSituation,
            compare: t.tabCompare,
            criteria: t.tabCriteria,
        };
        return labels[tab];
    }

    /** Tabs whose counter is only shown when there is something to count. */
    protected showsCount(tab: ReportTab): boolean {
        const quiet: ReportTab[] = ['criteria', 'project', 'search', 'measured', 'compare', 'situation'];
        return !quiet.includes(tab) || this.counts()[tab] > 0;
    }

    /** Arrows, Home and End between tabs, as the `tablist` pattern requires. */
    protected onTabKey(event: KeyboardEvent, index: number): void {
        const moves: Record<string, number> = {
            ArrowRight: index + 1,
            ArrowLeft: index - 1,
            Home: 0,
            End: this.tabs.length - 1,
        };
        const next = moves[event.key];
        if (next === undefined) {
            return;
        }

        event.preventDefault();
        const tab = this.tabs[(next + this.tabs.length) % this.tabs.length];
        if (!tab) {
            return;
        }

        this.nav.go(tab);
        (event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`#tab-${tab}`)?.focus();
    }

    protected async copyMarkdown(): Promise<void> {
        if (await copyText(this.exports.markdown())) {
            this.flash(this.copied);
        }
    }

    /**
     * The shape of the build with every path of the project hashed, for pasting into an issue. It
     * is here rather than in the drop zone because this is where somebody is when the report says
     * something they think is wrong.
     */
    protected async copyDiagnostics(): Promise<void> {
        if (await copyText(this.exports.diagnostics())) {
            this.flash(this.copiedDiagnostics);
        }
    }

    /** "Copied" on a button, for as long as somebody needs to see that the click did something. */
    private flash(signalToSet: WritableSignal<boolean>): void {
        signalToSet.set(true);
        setTimeout(() => signalToSet.set(false), 1800);
    }
}
