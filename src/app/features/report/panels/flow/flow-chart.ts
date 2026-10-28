import {
    afterNextRender,
    Component,
    computed,
    DestroyRef,
    type ElementRef,
    inject,
    input,
    model,
    signal,
    viewChild,
} from '@angular/core';
import { type Zone } from '@core/analysis/analysis.types';
import { flowBytes, litFractions } from '@core/analysis/views/flow/detail';
import { type FlowLayout, type FlowModel, type PlacedLink } from '@core/analysis/views/flow/flow.types';
import { layoutFlow, ribbonPath, spreadLabels } from '@core/analysis/views/flow/layout';
import { I18nService } from '@state/i18n.service';
import { nodeName, reachText } from './flow-labels';

/** The drawing's proportions, in px. Labels are monospace, so their room is counted in characters. */
const NODE_W = 12;
const LEFT_LABELS = 204;
const RIGHT_LABELS = 212;
const MIDDLE_LABELS = 232;
/** Below this the diagram stops shrinking and its own box scrolls sideways; the page never does. */
const MIN_WIDTH = 760;
const HEAD = 30;
const GAP = 10;
const MIN_NODE = 3;
/** Between two labels of a column: two lines of `--fs-note` and a little air. */
const LABEL_STEP = 34;
const MIN_HEIGHT = 420;
/** How much taller than its minimum the drawing may grow to keep every label beside its bar. */
const MAX_GROWTH = 1.8;
/** One character of `--font-data` at `--fs-note` (12 px): JetBrains Mono is 0.6 em wide. */
const CHAR = 7.3;
/** What each column's label lines start from, beside its bar. */
const LABEL_PAD = 16;
/** A label further than this from its bar's middle gets a line to it. */
const LEADER_MIN = 4;
/** Room around a label's two lines on its plate: the first line's capitals and the last's descenders. */
const PLATE_PAD = 3;
const PLATE_ABOVE = 13;
const PLATE_BELOW = 16;

interface DrawnNode {
    id: string;
    column: 0 | 1 | 2;
    x: number;
    y: number;
    h: number;
    zone: Zone | null;
    name: string;
    fullName: string;
    figure: string;
    /** Where its two label lines go, and which way they run from it. */
    labelX: number;
    labelY: number;
    anchor: 'start' | 'end';
    /**
     * The areas that answer the pointer: the bar, a little wider than drawn, and the label. Two
     * boxes rather than the one around both: a label pushed away from a 3 px bar made that box
     * tall enough to cover its neighbour's label, and a click on the neighbour pinned this one.
     */
    hits: { x: number; y: number; w: number; h: number }[];
    /**
     * The box behind the label in the surface's colour, so no ribbon or band runs through its
     * letters. Monospace, so its width is counted in characters, as the label's room is.
     */
    plate: { x: number; y: number; w: number; h: number };
    /** From the label to its bar, when the label had to move away from it. `null` when it sits beside it. */
    leader: { x1: number; y1: number; x2: number; y2: number } | null;
    aria: string;
}

interface DrawnRibbon {
    key: string;
    zone: Zone;
    d: string;
    title: string;
    link: PlacedLink;
}

const clip = (text: string, room: number): string => {
    const fits = Math.max(4, Math.floor(room / CHAR));
    return text.length > fits ? `${text.slice(0, fits - 1)}…` : text;
};

/** Where each label of a layout goes: beside the middle of its bar, pushed apart to one per row. */
const labelYs = (layout: FlowLayout, height: number): Map<string, number> => {
    const ys = new Map<string, number>();
    for (const column of [0, 1, 2] as const) {
        const placed = layout.nodes.filter(node => node.column === column);
        const spread = spreadLabels(
            placed.map(node => node.y + node.h / 2),
            LABEL_STEP,
            LABEL_STEP / 2 - 2,
            height - LABEL_STEP / 2 + 2,
        );
        for (const [index, node] of placed.entries()) {
            ys.set(node.id, spread[index] ?? node.y);
        }
    }
    return ys;
};

/** How far the furthest label sits from its bar: 0 when every label is level with some part of it. */
const driftOf = (layout: FlowLayout, ys: ReadonlyMap<string, number>): number =>
    Math.max(
        0,
        ...layout.nodes.map(node => {
            const y = ys.get(node.id) ?? node.y;
            return Math.max(0, node.y - y, y - (node.y + node.h));
        }),
    );

/**
 * The flow diagram: packages, where their bytes live, and the screens that download them, as
 * ribbons as wide as the bytes they carry. Hand-written SVG: a chart library would be a runtime
 * dependency of a page that has none, and this is a few hundred paths.
 *
 * Every node is a button. Hovering or focusing one lights the part of every ribbon that is that
 * node's — a package's band of each screen's ribbon, not the whole ribbon — and dims the rest;
 * clicking or Enter pins it, which is what the panel under the diagram reads; Escape clears.
 */
@Component({
    selector: 'app-flow-chart',
    templateUrl: './flow-chart.html',
    styleUrl: './flow-chart.scss',
})
export class FlowChartComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    private readonly destroyRef = inject(DestroyRef);

    // * INPUTS
    readonly flow = input.required<FlowModel>();
    /** The node pinned by a click or Enter. Two-way: the panel under the diagram reads it and can clear it. */
    readonly pinned = model<string | null>(null);

    // * ATTRIBUTES
    private readonly box = viewChild<ElementRef<HTMLElement>>('box');
    private readonly width = signal(0);
    /** The node under the pointer or with focus: a preview, which the pin outlasts. */
    readonly hovered = signal<string | null>(null);
    protected readonly active = computed(() => this.hovered() ?? this.pinned());

    constructor() {
        afterNextRender(() => {
            const box = this.box()?.nativeElement;
            if (!box) {
                return;
            }
            this.width.set(box.clientWidth);
            const observer = new ResizeObserver(entries => {
                const rect = entries[0]?.contentRect;
                if (rect) {
                    this.width.set(Math.round(rect.width));
                }
            });
            observer.observe(box);
            this.destroyRef.onDestroy(() => observer.disconnect());
        });
    }

    protected readonly drawWidth = computed(() => Math.max(MIN_WIDTH, this.width()));

    /**
     * The drawing at the shortest height where every label sits beside its bar. It starts tall
     * enough for each label of the longest column to have its two lines, and grows while a label
     * still has to sit more than half a row away from what it names, which is what a run of small
     * packages under a large one does (the Angular packages under `@angular/core`): with a fixed
     * height their labels slid a whole row and "your code" ended up beside `ag-grid-community`.
     */
    private readonly fitted = computed(() => {
        const flow = this.flow();
        const most = Math.max(flow.sources.length, flow.middles.length, flow.targets.length);
        const base = Math.round(Math.max(MIN_HEIGHT, most * LABEL_STEP + GAP));
        const frame = { columns: this.columns(), nodeWidth: NODE_W, gap: GAP, minNode: MIN_NODE };

        let height = base;
        let layout = layoutFlow(flow, { ...frame, height });
        let ys = labelYs(layout, height);
        while (driftOf(layout, ys) > LABEL_STEP / 2 && height < base * MAX_GROWTH) {
            height = Math.round(height * 1.12);
            layout = layoutFlow(flow, { ...frame, height });
            ys = labelYs(layout, height);
        }
        return { height, layout, ys };
    });

    protected readonly plotHeight = computed(() => this.fitted().height);

    protected readonly svgHeight = computed(() => this.plotHeight() + HEAD);
    protected readonly head = HEAD;

    /** Where each column's bar starts: the left after its labels, the middle a little left of centre, the right before its labels. */
    protected readonly columns = computed((): [number, number, number] => {
        const width = this.drawWidth();
        const right = width - RIGHT_LABELS - NODE_W;
        const middle = Math.round(LEFT_LABELS + (right - LEFT_LABELS - MIDDLE_LABELS) * 0.55);
        return [LEFT_LABELS, middle, right];
    });

    private readonly layout = computed(() => this.fitted().layout);

    protected readonly nodes = computed<DrawnNode[]>(() => {
        const flow = this.flow();
        const t = this.i18n.ui();
        const layout = this.layout();
        const [left, middle, right] = this.columns();
        const rooms = [LEFT_LABELS - LABEL_PAD * 2, MIDDLE_LABELS, RIGHT_LABELS - LABEL_PAD];

        const zoneOf = new Map(flow.middles.map(node => [node.id, node.zone]));
        const figureOf = (id: string, column: 0 | 1 | 2): { figure: string; aria: string } => {
            if (column === 0) {
                const source = flow.sources.find(node => node.id === id);
                const reach = source ? reachText(source, flow.screens, t) : '';
                const size = flowBytes(source?.bytes ?? 0);
                return { figure: `${size} · ${reach}`, aria: `${size}, ${reach}` };
            }
            if (column === 1) {
                const node = flow.middles.find(entry => entry.id === id);
                const size = flowBytes(node?.bytes ?? 0);
                const reach =
                    node?.kind === 'own'
                        ? t.flowOneEach
                        : node && node.screens >= flow.screens && flow.screens > 1
                          ? t.flowReachAll
                          : t.flowReach(node?.screens ?? 0);
                return { figure: `${size} · ${reach}`, aria: `${size}, ${reach}` };
            }
            const node = flow.targets.find(entry => entry.id === id);
            const parts = node ? [node.boot, node.shared, node.own].map(bytes => flowBytes(bytes)).join(' + ') : '';
            const total = flowBytes(node?.total ?? 0);
            return {
                figure: parts,
                aria: `${total}: ${t.treeBoot} ${flowBytes(node?.boot ?? 0)} + ${t.colShared} ${flowBytes(node?.shared ?? 0)} + ${t.colOwn} ${flowBytes(node?.own ?? 0)}`,
            };
        };

        const { ys } = this.fitted();
        const drawn: DrawnNode[] = [];
        for (const column of [0, 1, 2] as const) {
            const placed = layout.nodes.filter(node => node.column === column);
            const labelX = column === 0 ? left - LABEL_PAD : (column === 1 ? middle : right) + NODE_W + LABEL_PAD;
            for (const node of placed) {
                const fullName = nodeName(flow, node.id, t);
                const total =
                    column === 2 ? flowBytes(flow.targets.find(entry => entry.id === node.id)?.total ?? 0) : '';
                const room = rooms[column] ?? 120;
                const name =
                    column === 2
                        ? `${clip(fullName, room - (total.length + 1) * CHAR)} ${total}`
                        : clip(fullName, room);
                const { figure, aria } = figureOf(node.id, column);
                const labelY = ys.get(node.id) ?? node.y;
                const labelTop = labelY - LABEL_STEP / 2 + 1;
                const labelBox =
                    column === 0
                        ? { x: 0, y: labelTop, w: left - 2, h: LABEL_STEP - 2 }
                        : { x: node.x + NODE_W + 2, y: labelTop, w: LABEL_PAD + room, h: LABEL_STEP - 2 };
                const barBox = { x: node.x - 3, y: node.y - 2, w: NODE_W + 6, h: node.h + 4 };
                // The block of two lines is centred a little under `labelY`; the bar is met where it is nearest.
                const blockY = labelY + 2;
                const nearest = Math.min(node.y + node.h, Math.max(node.y, blockY));
                const leader =
                    Math.abs(blockY - (node.y + node.h / 2)) > LEADER_MIN && Math.abs(blockY - nearest) > 1
                        ? column === 0
                            ? { x1: labelX + 4, y1: blockY, x2: node.x - 2, y2: nearest }
                            : { x1: labelX - 4, y1: blockY, x2: node.x + NODE_W + 2, y2: nearest }
                        : null;
                const shown = clip(figure, room);
                const plateW = Math.max(name.length, shown.length) * CHAR + 2 * PLATE_PAD;
                const plate = {
                    x: column === 0 ? labelX - plateW + PLATE_PAD : labelX - PLATE_PAD,
                    y: labelY - PLATE_ABOVE - PLATE_PAD,
                    w: plateW,
                    h: PLATE_ABOVE + PLATE_BELOW + PLATE_PAD,
                };
                drawn.push({
                    id: node.id,
                    column,
                    x: node.x,
                    y: node.y,
                    h: node.h,
                    zone: column === 1 ? (zoneOf.get(node.id) ?? null) : null,
                    name,
                    fullName,
                    figure: shown,
                    labelX,
                    labelY,
                    anchor: column === 0 ? 'end' : 'start',
                    hits: [barBox, labelBox],
                    plate,
                    leader,
                    aria: `${fullName}, ${aria}`,
                });
            }
        }
        return drawn;
    });

    protected readonly ribbons = computed<DrawnRibbon[]>(() => {
        const flow = this.flow();
        const t = this.i18n.ui();
        const layout = this.layout();
        return [...layout.inLinks, ...layout.outLinks].map(link => ({
            key: `${link.from}\0${link.to}`,
            zone: link.zone,
            d: ribbonPath(link),
            title: `${nodeName(flow, link.from, t)} → ${nodeName(flow, link.to, t)} · ${flowBytes(link.bytes)}`,
            link,
        }));
    });

    /** How much of each ribbon the active node lights. Empty when nothing is active. */
    private readonly lit = computed(() => {
        const id = this.active();
        return id ? litFractions(this.flow(), id) : new Map<string, number>();
    });

    /** The bands drawn over the dimmed ribbons: the part of each that belongs to the active node. */
    protected readonly bands = computed(() => {
        const lit = this.lit();
        return this.ribbons().flatMap(ribbon => {
            const share = lit.get(ribbon.key);
            return share === undefined
                ? []
                : [{ key: ribbon.key, zone: ribbon.zone, d: ribbonPath(ribbon.link, 0, share) }];
        });
    });

    /** The nodes the active one reaches, through any lit ribbon. Everything else is dimmed. */
    private readonly reached = computed(() => {
        const id = this.active();
        const reached = new Set<string>(id ? [id] : []);
        for (const key of this.lit().keys()) {
            const [from = '', to = ''] = key.split('\0', 2);
            reached.add(from);
            reached.add(to);
        }
        return reached;
    });

    protected isDim(id: string): boolean {
        return this.active() !== null && !this.reached().has(id);
    }

    protected isLit(key: string): boolean {
        return this.lit().has(key);
    }

    protected readonly headings = computed(() => {
        const t = this.i18n.ui();
        const [left, middle, right] = this.columns();
        return [
            { text: t.flowColSources, x: left + NODE_W, anchor: 'end' },
            { text: t.flowColMiddles, x: middle, anchor: 'start' },
            { text: t.flowColTargets, x: right, anchor: 'start' },
        ];
    });

    protected toggle(id: string): void {
        this.pinned.set(this.pinned() === id ? null : id);
    }

    protected onKey(event: KeyboardEvent, id: string): void {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.toggle(id);
        } else if (event.key === 'Escape') {
            // Nothing pinned, nothing previewed; the focus stays where it was.
            this.pinned.set(null);
            this.hovered.set(null);
        }
    }

    protected leave(id: string): void {
        if (this.hovered() === id) {
            this.hovered.set(null);
        }
    }
}
