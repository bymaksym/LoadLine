import { ApplicationRef, Component, computed, DestroyRef, inject, signal, type WritableSignal } from '@angular/core';
import { rate } from '@core/criteria/criteria';
import { type DataSource, type Mode, type Verdict } from '@core/criteria/criteria.types';
import { formatBytes, formatDelta } from '@core/format/format.utils';
import { QUESTIONS } from '@core/situation/situation';
import { globalSharedChunks } from '@core/worth/worth';
import { copyText } from '@shared/clipboard.utils';
import { ExplainComponent } from '@shared/explain/explain';
import { BytesPipe } from '@shared/pipes/bytes.pipe';
import { CompareStore } from '@state/compare.store';
import { CriteriaService } from '@state/criteria.service';
import { ExportService } from '@state/export.service';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';
import { FIRST_INPUT_TAB, REPORT_TABS, type ReportTab } from '@state/report-nav.types';
import { labelOfTab } from '@state/report-tab-label';
import { SituationService } from '@state/situation.service';
import { BootTabComponent } from './panels/boot/boot-tab';
import { CompareTabComponent } from './panels/compare/compare-tab';
import { CriteriaTabComponent } from './panels/criteria/criteria-tab';
import { FindingsTabComponent } from './panels/findings/findings-tab';
import { MapTabComponent } from './panels/map/map-tab';
import { MeasuredTabComponent } from './panels/measured/measured-tab';
import { ProjectTabComponent } from './panels/project/project-tab';
import { ScreensTabComponent } from './panels/screens/screens-tab';
import { SearchTabComponent } from './panels/search/search-tab';
import { SharedTabComponent } from './panels/shared/shared-tab';
import { SituationTabComponent } from './panels/situation/situation-tab';
import { TreeTabComponent } from './panels/tree/tree-tab';

/** What separates two clauses of one explanation. The bubble keeps the break as a break. */
const PARAGRAPH = '\n\n';

/**
 * How much room the bar under the lead figure leaves past the worse threshold, so the tick of
 * "bad above" is never drawn on the right edge and a figure over it still has somewhere to end.
 */
const BAR_HEADROOM = 1.17;

/** The report: one lead figure, four that lead to their tab, and one tab per view. Every tab is a component. */
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
        MapTabComponent,
        SearchTabComponent,
        ProjectTabComponent,
        SituationTabComponent,
        CriteriaTabComponent,
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
    protected readonly firstInputTab = FIRST_INPUT_TAB;
    /** The four kinds of figure, in the order the legend at the foot of the report gives them. */
    protected readonly sources: readonly DataSource[] = ['measured', 'derived', 'declared', 'unknown'];

    constructor() {
        // The browser lays the page out for paper right after `beforeprint`, without waiting for a
        // scheduled change detection: the panels are drawn by hand, twice, because the map measures
        // its frame after the first render and draws itself with that width on the second.
        const appRef = inject(ApplicationRef);
        const before = (): void => {
            this.printing.set(true);
            appRef.tick();
            appRef.tick();
        };
        const after = (): void => this.printing.set(false);

        addEventListener('beforeprint', before);
        addEventListener('afterprint', after);
        inject(DestroyRef).onDestroy(() => {
            removeEventListener('beforeprint', before);
            removeEventListener('afterprint', after);
        });
    }

    // * ATTRIBUTES
    /** Between `beforeprint` and `afterprint`: the page is being laid out for paper. */
    private readonly printing = signal(false);

    /**
     * The panels drawn. On screen, the open tab. On paper, every view of the build in the order of
     * the strip, plus the open tab if it is one of the inputs: an empty form says nothing on paper,
     * but one somebody filled in and chose to print does.
     */
    protected readonly shownTabs = computed<ReportTab[]>(() => {
        const open = this.nav.tab();
        if (!this.printing()) {
            return [open];
        }

        const views = REPORT_TABS.slice(0, REPORT_TABS.indexOf(FIRST_INPUT_TAB));
        return views.includes(open) ? views : [...views, open];
    });

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

    /** The lead figure, with its unit apart: the number is what is read, the unit is set smaller. */
    protected readonly heroFigure = computed(() => {
        const text = formatBytes(this.effectiveBytes());
        // Whichever space `formatBytes` joins them with: plain for the command, narrow here.
        const space = Math.max(text.lastIndexOf(' '), text.lastIndexOf(' '));
        return { value: text.slice(0, space), unit: text.slice(space + 1) };
    });

    /**
     * The bar under the lead figure: the declared bootstrap and what the near-global chunks add to
     * it, on a scale that always shows both thresholds, so where the figure ends says how far it is
     * from each of them without reading a number.
     */
    protected readonly heroBar = computed(() => {
        const { bootOk, bootBad } = this.store.criteria();
        const boot = this.store.analysis()?.bootBytes ?? 0;
        const scale = Math.max(bootBad, this.effectiveBytes()) * BAR_HEADROOM;
        const at = (bytes: number): number => (bytes / scale) * 100;
        return {
            boot: at(boot),
            extra: at(this.extraBytes()),
            okAt: at(bootOk),
            badAt: at(bootBad),
            okLabel: formatBytes(bootOk),
            badLabel: formatBytes(bootBad),
        };
    });

    protected readonly medianTotal = computed(() => {
        const totals = (this.store.analysis()?.screens ?? []).map(screen => screen.total).toSorted((a, b) => a - b);
        return totals[Math.floor(totals.length / 2)] ?? 0;
    });

    /**
     * The signals by severity. `rest` is context (`ok` and `info`): it colours nothing, but it is
     * counted, so the summary, the tab and the filter inside it all say the same total.
     */
    protected readonly severityCount = computed(() => {
        const findings = this.store.findings();
        const high = findings.filter(f => f.severity === 'high').length;
        const mid = findings.filter(f => f.severity === 'mid').length;
        return { all: findings.length, high, mid, rest: findings.length - high - mid };
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
     * its place only by pointing at the worst of them. Neither the screens tile nor the signals one
     * is a candidate: how many screens or signals there are is a count with no threshold, and a
     * second alarm on it would be the same fact twice.
     */
    protected readonly loudestTile = computed<'boot' | 'effective' | 'shared' | null>(() => {
        const rank: Record<Verdict, number> = { good: 0, ok: 1, bad: 2 };
        const tiles = [
            ['boot', this.bootVerdict()],
            ['effective', this.effectiveVerdict()],
            ['shared', this.sharedVerdict()],
        ] as const;

        // "Worst" is an alarm: on a figure that is only fair it would be one about nothing.
        const worst = tiles.reduce((loudest, tile) => (rank[tile[1]] > rank[loudest[1]] ? tile : loudest));
        return worst[1] === 'bad' ? worst[0] : null;
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
        return {
            findings: this.severityCount().all,
            screens: analysis?.screens.length ?? 0,
            measured: this.store.measured()?.extra.length ?? 0,
            boot: analysis?.bootBuckets.length ?? 0,
            shared: analysis?.sharedChunks.length ?? 0,
            tree: analysis?.tree.length ?? 0,
            map: 0,
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

    /**
     * The tooltip of a rated figure: the rule it was rated by and, when the rating is not good,
     * what moves it. On a green figure the answer to "how do I fix this" is "nothing", and saying
     * it anyway makes the tooltip less useful.
     */
    protected hint(rule: string, advice: string, verdict: Verdict): string {
        if (verdict === 'good') {
            return rule;
        }
        return rule ? `${rule}${PARAGRAPH}${advice}` : advice;
    }

    protected tabLabel(tab: ReportTab): string {
        return labelOfTab(tab, this.i18n.ui());
    }

    /**
     * The counter beside a tab, or nothing. The views count what is in them; the inputs are quiet
     * until something was put in, except the questions, whose counter says how many are answered.
     */
    protected countLabel(tab: ReportTab): string | null {
        const n = this.counts()[tab];
        if (tab === 'situation') {
            return `${n}/${QUESTIONS.length}`;
        }

        const quiet: ReportTab[] = ['criteria', 'project', 'search', 'measured', 'compare', 'map'];
        return quiet.includes(tab) && n === 0 ? null : String(n);
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
