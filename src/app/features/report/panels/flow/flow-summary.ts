import { Component, computed, inject } from '@angular/core';
import { flowOf } from '@core/analysis/views/flow/flow';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';
import { takeawayText } from './flow-labels';

/**
 * The flow on the first view, compact: the one sentence its tab leads with — which package makes
 * which screen heavy — under the summary, where everybody looks first, with the way to the diagram.
 * Not on the Flow tab itself, which opens with the same sentence.
 */
@Component({
    selector: 'app-flow-summary',
    template: `
        @if (line() && nav.tab() !== 'flow') {
            <p class="flow-summary">
                <span>{{ line() }}</span>
                <button class="flow-summary__open" type="button" (click)="nav.go('flow')">
                    {{ i18n.ui().flowOpen }} →
                </button>
            </p>
        }
    `,
    styleUrl: './flow-summary.scss',
})
export class FlowSummaryComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly nav = inject(ReportNav);
    private readonly store = inject(ReportStore);

    protected readonly line = computed(() => {
        const analysis = this.store.analysis();
        return analysis ? takeawayText(flowOf(analysis), this.i18n.ui()) : '';
    });
}
