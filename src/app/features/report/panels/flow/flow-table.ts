import { Component, computed, inject, input, model } from '@angular/core';
import { flowBytes, flowDetailOf } from '@core/analysis/views/flow/detail';
import { type FlowModel } from '@core/analysis/views/flow/flow.types';
import { I18nService } from '@state/i18n.service';
import { nodeName, reachText } from './flow-labels';

/**
 * The diagram's numbers as two tables: what it draws, for whoever cannot see it, and what a narrow
 * screen shows instead of a drawing it would have to scroll. The same model, the same figures.
 */
@Component({
    selector: 'app-flow-table',
    templateUrl: './flow-table.html',
    styleUrl: './flow-table.scss',
})
export class FlowTableComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);

    // * INPUTS
    readonly flow = input.required<FlowModel>();
    readonly pinned = model<string | null>(null);

    /** The three columns both tables split a figure into, in the order of the diagram's colours. */
    protected readonly zones = computed(() => {
        const t = this.i18n.ui();
        return [
            { zone: 'boot', label: t.treeBoot },
            { zone: 'shared', label: t.colShared },
            { zone: 'own', label: t.colOwn },
        ];
    });

    protected readonly packages = computed(() => {
        const flow = this.flow();
        const t = this.i18n.ui();
        return flow.sources
            .toSorted((a, b) => b.bytes - a.bytes)
            .map(source => {
                const zones = flowDetailOf(flow, source.id)?.zones ?? { boot: 0, shared: 0, own: 0 };
                return {
                    id: source.id,
                    name: nodeName(flow, source.id, t),
                    size: flowBytes(source.bytes),
                    parts: [zones.boot, zones.shared, zones.own].map(bytes => flowBytes(bytes)),
                    reach: reachText(source, flow.screens, t),
                };
            });
    });

    protected readonly screens = computed(() => {
        const flow = this.flow();
        const t = this.i18n.ui();
        return flow.targets
            .toSorted((a, b) => b.total - a.total)
            .map(target => {
                const top = flowDetailOf(flow, target.id)?.beyondBoot[0];
                return {
                    id: target.id,
                    name: nodeName(flow, target.id, t),
                    total: flowBytes(target.total),
                    parts: [target.boot, target.shared, target.own].map(bytes => flowBytes(bytes)),
                    driver: top ? `${nodeName(flow, top.id, t)} · ${flowBytes(top.bytes)}` : '—',
                };
            });
    });

    protected toggle(id: string): void {
        this.pinned.set(this.pinned() === id ? null : id);
    }
}
