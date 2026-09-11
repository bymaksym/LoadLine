import { Component, computed, inject, signal } from '@angular/core';
import { formatBytes, screenLabel } from '@core/format/format.utils';
import { bootLine, type HistoryPoint, screenLine, screensInHistory } from '@core/history/history';
import { configurationBudgets, isZoneless, pipelineKnown } from '@core/project/project-context';
import { type ConfigurationBudget, type PipelineBuild } from '@core/project/project-context.types';
import { ExplainComponent } from '@shared/explain/explain';
import { BytesPipe } from '@shared/pipes/bytes.pipe';
import { type SparkBar, SparkComponent } from '@shared/spark/spark';
import { HistoryService } from '@state/history.service';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';
import { PanelHeaderComponent } from '../panel-header/panel-header';
import { revealOnFocus } from '../reveal-on-focus.utils';

interface BudgetRow extends ConfigurationBudget {
    isDefault: boolean;
    /** The budget comes from `build.options`, not from the configuration itself. */
    inherited: boolean;
    /** Error threshold against the current raw bootstrap: negative when already over. */
    headroom: number | null;
    tone: 'good' | 'ok' | 'bad' | null;
}

/**
 * What the project files say: budgets per configuration, what the pipeline builds, zone.js.
 * Its purpose is one question — does the size budget actually apply? — answered row by row.
 */
@Component({
    selector: 'app-project-tab',
    templateUrl: './project-tab.html',
    styleUrl: './project-tab.scss',
    imports: [PanelHeaderComponent, BytesPipe, SparkComponent, ExplainComponent],
})
export class ProjectTabComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);
    protected readonly historyService = inject(HistoryService);
    protected readonly nav = inject(ReportNav);

    protected readonly pipelineKnown = computed(() => pipelineKnown(this.store.context()));

    /** Reading another application of the workspace: its budgets replace the ones on screen. */
    protected pickProject(event: Event): void {
        this.store.selectAngularProject((event.target as HTMLSelectElement).value);
    }

    protected readonly zone = computed<'zone' | 'zoneless' | 'unknown'>(() => {
        const zoneless = isZoneless(this.store.context());
        if (zoneless === null) {
            return 'unknown';
        }
        return zoneless ? 'zoneless' : 'zone';
    });

    protected readonly rows = computed<BudgetRow[]>(() => {
        const context = this.store.context();
        const angular = context.angular;
        const boot = this.store.analysis()?.bootRawBytes ?? 0;
        const factor = this.store.criteria().budgetSlackFactor;

        return configurationBudgets(context).map(row => {
            const own = angular?.configurations.find(config => config.name === row.name);
            const inherited =
                row.hasBudget && !own?.budgets.some(budget => budget.warning !== null || budget.error !== null);
            const headroom = row.error !== null && boot > 0 ? Math.round(((row.error - boot) / boot) * 100) : null;

            let tone: BudgetRow['tone'] = null;
            if (headroom !== null) {
                if (headroom < 0) {
                    tone = 'bad';
                } else {
                    tone = row.error !== null && row.error >= boot * factor ? 'ok' : 'good';
                }
            }

            return { ...row, isDefault: angular?.defaultConfiguration === row.name, inherited, headroom, tone };
        });
    });

    constructor() {
        revealOnFocus('project');
    }

    protected targetsOf(build: PipelineBuild): string[] {
        if (build.configurations.length > 0) {
            return build.configurations;
        }

        const fallback = this.store.context().angular?.defaultConfiguration;
        return fallback ? [this.i18n.ui().buildDefaultConfig(fallback)] : ['—'];
    }

    /** The context input belongs to the intake component; this is the same input, opened from here. */
    protected chooseFiles(): void {
        document.querySelector<HTMLInputElement>('#contextInput')?.click();
    }

    /** The points of this browser's history, in the unit the report is being shown in. */
    protected readonly historyPoints = computed(() => bootLine(this.historyService.history(), this.store.mode()));

    /**
     * Which screen the second line is drawing. Empty is the bootstrap on its own, which is where
     * this started and is still the answer most visits want.
     */
    protected readonly historyScreen = signal('');

    /**
     * The screens the history has ever held, not the ones this build has.
     *
     * They are two different lists and the difference is the point: the screen somebody wants to
     * look up is often the one that stopped appearing, and offering only what is on screen today
     * would drop it from the list exactly when it became interesting.
     */
    protected readonly historyScreens = computed(() =>
        screensInHistory(this.historyPoints()).map(source => ({ source, label: screenLabel(source) })),
    );

    protected readonly bootBars = computed<SparkBar[]>(() =>
        this.historyPoints().map(point => ({ value: point.boot, title: this.historyTitle(point) })),
    );

    /**
     * The same line for one screen. Kept apart from the bootstrap one rather than drawn over it:
     * they are not on the same scale — a screen is a fraction of a bootstrap — and two lines sharing
     * an axis they do not share would say the screen is flat when it has doubled.
     */
    protected readonly screenBars = computed<SparkBar[]>(() => {
        const source = this.historyScreen();
        if (!source) {
            return [];
        }

        const t = this.i18n.ui();
        return screenLine(this.historyPoints(), source).map(entry => ({
            value: entry.bytes,
            title:
                entry.bytes === null
                    ? `${entry.point.date.slice(0, 10)} · ${t.historyScreenAbsent}`
                    : `${entry.point.date.slice(0, 10)} · ${entry.point.name} · ${formatBytes(entry.bytes)}`,
        }));
    });

    protected pickHistoryScreen(event: Event): void {
        this.historyScreen.set((event.target as HTMLSelectElement).value);
    }

    protected historyTitle(point: HistoryPoint): string {
        return `${point.date.slice(0, 10)} · ${point.name} · ${formatBytes(point.boot)}`;
    }

    /** The chart in words, because a picture of twenty bars is not readable to everybody. */
    protected historyLabel(bars: SparkBar[]): string {
        return bars.map(bar => bar.title).join('; ');
    }

    protected keep(): void {
        void this.historyService.keep();
    }

    protected forget(): void {
        void this.historyService.forget();
    }
}
