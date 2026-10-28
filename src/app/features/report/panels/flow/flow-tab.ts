import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { type Zone } from '@core/analysis/analysis.types';
import { flowBytes, flowDetailOf } from '@core/analysis/views/flow/detail';
import { FLOW_IDS } from '@core/analysis/views/flow/fine';
import { flowOf } from '@core/analysis/views/flow/flow';
import { type FlowModel } from '@core/analysis/views/flow/flow.types';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';
import { PanelHeaderComponent } from '../panel-header/panel-header';
import { ScreenDetailComponent } from '../screens/screen-detail';
import { FlowChartComponent } from './flow-chart';
import { nodeName, reachText, takeawayText } from './flow-labels';
import { FlowTableComponent } from './flow-table';

type View = 'chart' | 'table';

/** How many names a list of the panel gives before it says how many more there are. */
const LIST_MAX = 8;

/** Narrower than this, the table is what opens: the diagram would have to be scrolled sideways to be read. */
const NARROW = '(width < 640px)';

interface Line {
    id: string;
    name: string;
    bytes: string;
    zone?: Zone;
}

/**
 * Where the bytes go: which package makes which screen heavy, and whether every screen pays for it
 * (the bootstrap) or only some (a shared chunk, a screen's own). The diagram, the same numbers as
 * a table, the one sentence the figures say, and the detail of whatever is pinned.
 */
@Component({
    selector: 'app-flow-tab',
    templateUrl: './flow-tab.html',
    styleUrl: './flow-tab.scss',
    imports: [PanelHeaderComponent, FlowChartComponent, FlowTableComponent, ScreenDetailComponent],
})
export class FlowTabComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);
    protected readonly nav = inject(ReportNav);

    // * ATTRIBUTES
    private readonly chart = viewChild(FlowChartComponent);
    protected readonly view = signal<View>(this.viewParam());
    /** In the address, so a link to the tab can point at one package or one screen. */
    protected readonly pinned = signal<string | null>(this.nav.param('pin') === '' ? null : this.nav.param('pin'));

    protected readonly flow = computed<FlowModel | null>(() => {
        const analysis = this.store.analysis();
        return analysis ? flowOf(analysis) : null;
    });

    protected readonly empty = computed(() => (this.flow()?.buildBytes ?? 0) <= 0);

    protected readonly takeaway = computed(() => {
        const flow = this.flow();
        return flow ? takeawayText(flow, this.i18n.ui()) : '';
    });

    /** What the line under the diagram describes: the node previewed, else the one pinned. */
    private readonly looked = computed(() => this.chart()?.hovered() ?? this.pinned());

    protected readonly readout = computed(() => {
        const flow = this.flow();
        const id = this.looked();
        if (!flow || !id) {
            return '';
        }
        const t = this.i18n.ui();
        const source = flow.sources.find(node => node.id === id);
        if (source) {
            return `${nodeName(flow, id, t)} · ${flowBytes(source.bytes)} · ${reachText(source, flow.screens, t)}`;
        }
        const target = flow.targets.find(node => node.id === id);
        if (target) {
            return `${nodeName(flow, id, t)} · ${flowBytes(target.total)} = ${t.treeBoot} ${flowBytes(target.boot)} + ${t.colShared} ${flowBytes(target.shared)} + ${t.colOwn} ${flowBytes(target.own)}`;
        }
        const middle = flow.middles.find(node => node.id === id);
        if (!middle) {
            return '';
        }
        const reach =
            middle.kind === 'own'
                ? t.flowOneEach
                : middle.kind === 'boot'
                  ? t.flowReachAll
                  : t.flowReach(middle.screens);
        return `${nodeName(flow, id, t)} · ${flowBytes(middle.bytes)} · ${reach}`;
    });

    /** The panel under the diagram: the pinned node in figures, and where the report says more about it. */
    protected readonly detail = computed(() => {
        const flow = this.flow();
        const id = this.pinned();
        const detail = flow && id ? flowDetailOf(flow, id) : null;
        if (!flow || !id || !detail) {
            return null;
        }

        const t = this.i18n.ui();
        const lines = (entries: { id: string; bytes: number }[]): { lines: Line[]; more: number } => ({
            lines: entries.slice(0, LIST_MAX).map(entry => ({
                id: entry.id,
                name: nodeName(flow, entry.id, t),
                bytes: flowBytes(entry.bytes),
                zone: flow.middles.find(node => node.id === entry.id)?.zone,
            })),
            more: Math.max(0, entries.length - LIST_MAX),
        });

        const source = flow.sources.find(node => node.id === id);
        const middle = flow.middles.find(node => node.id === id);
        const target = flow.targets.find(node => node.id === id);
        const screen =
            target?.kind === 'screen' ? this.store.analysis()?.screens.find(entry => entry.source === id) : undefined;
        const members =
            source?.kind === 'rest'
                ? source.members
                : target?.kind === 'rest'
                  ? target.members.map(
                        member => flow.targets.find(node => node.id === member)?.label ?? this.screenLabel(member),
                    )
                  : middle?.kind === 'rest'
                    ? middle.chunks.map(chunk => chunk.split('/').pop() ?? chunk)
                    : [];

        return {
            id,
            column: source ? 'source' : middle ? 'middle' : 'target',
            name: nodeName(flow, id, t),
            size: flowBytes(source?.bytes ?? middle?.bytes ?? target?.total ?? 0),
            zones: (['boot', 'shared', 'own'] as const).map(zone => ({
                zone,
                bytes: flowBytes(detail.zones[zone]),
                empty: detail.zones[zone] <= 0,
            })),
            middles: lines(detail.middles),
            sources: lines(target ? detail.beyondBoot : detail.sources),
            targets: lines(detail.targets),
            members,
            screen,
            /** Where the report already says more about it. */
            search: source?.kind === 'package' ? id : null,
            boot: (source?.bootBytes ?? 0) > 0 || id === FLOW_IDS.boot,
            shared: middle?.kind === 'shared' ? id : null,
        };
    });

    protected pin(id: string | null): void {
        this.pinned.set(id);
        this.nav.setParam('pin', id ?? '');
    }

    protected setView(view: View): void {
        this.view.set(view);
        this.nav.setParam('view', view);
    }

    protected seeInBoot(id: string): void {
        this.nav.go('boot', id === FLOW_IDS.boot || id === FLOW_IDS.own ? undefined : id);
    }

    private screenLabel(source: string): string {
        return this.store.analysis()?.screens.find(screen => screen.source === source)?.label ?? source;
    }

    private viewParam(): View {
        const value = this.nav.param('view');
        if (value === 'chart' || value === 'table') {
            return value;
        }
        // A test DOM has no `matchMedia` (see the theme service): there the diagram opens.
        if (typeof matchMedia !== 'function') {
            return 'chart';
        }
        return matchMedia(NARROW).matches ? 'table' : 'chart';
    }
}
