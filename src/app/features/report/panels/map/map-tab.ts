import {
    afterNextRender,
    Component,
    computed,
    DestroyRef,
    type ElementRef,
    inject,
    signal,
    viewChild,
} from '@angular/core';
import { type MapNode, mapOf, pathTo, type Rect, squarify } from '@core/analysis/treemap';
import { formatBytes } from '@core/format/format.utils';
import { BytesPipe } from '@shared/pipes/bytes.pipe';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';
import { PanelHeaderComponent } from '../panel-header/panel-header';
import { MapDetailComponent, percent } from './map-detail';

type Zone = 'all' | 'boot' | 'shared' | 'own';

/** One rectangle as drawn: where it goes, what it says, and the parts drawn inside it. */
interface DrawnTile {
    node: MapNode;
    rect: Rect;
    /** Room for the name; and below it, for the figure. */
    named: boolean;
    sized: boolean;
    /** The parts drawn inside, in the tile's own coordinates. Empty when it is too small for them. */
    inner: { node: MapNode; rect: Rect; named: boolean; sized: boolean; hit: boolean }[];
    /** Lit by the search, or dimmed because something else is. `null` when nothing is searched. */
    hit: boolean | null;
    share: string;
}

/** Room a tile needs for each thing it can show. Under these it shows less rather than overflow. */
const NAME_MIN = { w: 46, h: 18 };
const SIZE_MIN_H = 36;
const NEST_MIN = { w: 96, h: 70 };
/** The strip a nested tile keeps for its own name, above its parts. */
const HEAD = 20;
const PAD = 3;

/**
 * The bundle as a map: one rectangle per chunk, sized by what it weighs, and inside each one what
 * fills it. It is what `esbuild-visualizer` is good at — opening a chunk and seeing at a glance what
 * is in it — drawn on Loadline's figures: the area between chunks is the report's unit, the area
 * inside one is each part's raw share, and the colour is who pays for it.
 *
 * Rectangles are buttons laid out with absolute positions rather than an SVG: each one can take
 * focus, carries a name a screen reader reads, and clips its own label without measuring text.
 */
@Component({
    selector: 'app-map-tab',
    templateUrl: './map-tab.html',
    styleUrl: './map-tab.scss',
    imports: [PanelHeaderComponent, MapDetailComponent, BytesPipe],
})
export class MapTabComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);
    protected readonly nav = inject(ReportNav);
    private readonly destroyRef = inject(DestroyRef);

    // * CONSTANTS
    protected readonly zones: Zone[] = ['all', 'boot', 'shared', 'own'];

    // * ATTRIBUTES
    private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
    protected readonly width = signal(0);
    protected readonly zone = signal<Zone>(this.zoneParam());
    protected readonly query = signal(this.nav.param('q'));
    /** Ids from the root to the node being looked at. Empty is every chunk. */
    protected readonly trail = signal<string[]>(this.nav.param('at') ? this.nav.param('at').split('>') : []);
    /** What the detail panel describes: the tile under the pointer or with focus. */
    protected readonly picked = signal<MapNode | null>(null);

    constructor() {
        afterNextRender(() => {
            const frame = this.frame()?.nativeElement;
            if (!frame) {
                return;
            }
            this.width.set(frame.clientWidth);
            const observer = new ResizeObserver(entries => {
                const box = entries[0]?.contentRect;
                if (box) {
                    this.width.set(Math.round(box.width));
                }
            });
            observer.observe(frame);
            this.destroyRef.onDestroy(() => observer.disconnect());
        });
    }

    /** Every chunk of the build, as the map's top level. */
    protected readonly roots = computed<MapNode[]>(() => {
        const tree = this.store.analysis()?.tree ?? [];
        const t = this.i18n.ui();
        return mapOf(tree, { unattributed: t.mapUnattributed, rest: t.mapRest });
    });

    /** Only the zone asked for, at the top level: the rest of the levels belong to one chunk anyway. */
    private readonly filteredRoots = computed<MapNode[]>(() => {
        const zone = this.zone();
        const roots = this.roots();
        if (zone === 'all') {
            return roots;
        }
        // A folded group can mix zones: it is opened and filtered by what is inside.
        return roots.flatMap(node =>
            node.kind === 'rest'
                ? node.children.filter(child => child.zone === zone)
                : node.zone === zone
                  ? [node]
                  : [],
        );
    });

    protected readonly path = computed(() => pathTo(this.filteredRoots(), this.trail()));

    /** The node being looked at: `null` at the top, where the whole build is shown. */
    protected readonly current = computed(() => this.path().at(-1) ?? null);

    /** Whether the area at this level is the report's unit (between chunks) or a raw share (inside one). */
    protected readonly inside = computed(() => this.current() !== null && this.current()?.kind !== 'rest');

    private readonly level = computed<MapNode[]>(() => this.current()?.children ?? this.filteredRoots());

    /** What the percentages of this level are of. */
    private readonly levelTotal = computed(() => this.level().reduce((sum, node) => sum + node.weight, 0));

    /** Height follows width, within limits a page can hold: wide enough to read, short enough to scroll past. */
    protected readonly height = computed(() => Math.round(Math.min(680, Math.max(340, this.width() * 0.58))));

    private readonly needle = computed(() => this.query().trim().toLowerCase());

    protected readonly tiles = computed<DrawnTile[]>(() => {
        const width = this.width();
        if (width <= 0) {
            return [];
        }

        const height = this.height();
        const needle = this.needle();
        const total = this.levelTotal();
        const matches = (node: MapNode): boolean | null => (needle ? node.haystack.includes(needle) : null);

        return squarify(this.level(), node => node.weight, { x: 0, y: 0, w: width, h: height }).map(
            ({ item, rect }): DrawnTile => {
                const nest = rect.w >= NEST_MIN.w && rect.h >= NEST_MIN.h && item.children.length > 0;
                const room: Rect = { x: PAD, y: HEAD, w: rect.w - PAD * 2, h: rect.h - HEAD - PAD };
                return {
                    node: item,
                    rect,
                    named: rect.w >= NAME_MIN.w && rect.h >= NAME_MIN.h,
                    sized: rect.w >= NAME_MIN.w && rect.h >= SIZE_MIN_H && !nest,
                    inner: nest
                        ? squarify(item.children, child => child.weight, room).map(inner => ({
                              node: inner.item,
                              rect: inner.rect,
                              named: inner.rect.w >= NAME_MIN.w && inner.rect.h >= NAME_MIN.h,
                              sized: inner.rect.w >= NAME_MIN.w + 20 && inner.rect.h >= SIZE_MIN_H,
                              hit: !!needle && inner.item.haystack.includes(needle),
                          }))
                        : [],
                    hit: matches(item),
                    share: percent(item.weight, total),
                };
            },
        );
    });

    protected readonly hits = computed(() => this.tiles().filter(tile => tile.hit === true).length);

    /** What the area means at this level, said above the map: the one thing a treemap never says. */
    protected readonly areaNote = computed(() => {
        const t = this.i18n.ui();
        if (this.inside()) {
            return t.mapAreaInside;
        }
        const units = { raw: t.unitRaw, gzip: t.unitGzip, brotli: t.unitBrotli };
        return t.mapAreaRoot(units[this.store.mode()]);
    });

    // --- what the detail panel says -------------------------------------------------------------

    /**
     * The whole build as one node, for the panel at the top level: what it weighs, how many chunks,
     * and the heaviest of them. An empty panel was the first thing anybody opening the tab saw.
     */
    private readonly build = computed<MapNode>(() => {
        const roots = this.filteredRoots();
        return {
            id: 'build',
            label: this.i18n.ui().mapRoot,
            kind: 'build',
            weight: roots.reduce((sum, node) => sum + node.weight, 0),
            bytes: roots.reduce((sum, node) => sum + (node.bytes ?? 0), 0),
            raw: roots.reduce((sum, node) => sum + node.raw, 0),
            zone: 'boot',
            screens: 0,
            own: false,
            children: roots,
            haystack: '',
        };
    });

    protected readonly detail = computed(() => this.picked() ?? this.current() ?? this.build());

    /** The figure a node is read by: the report's unit for a chunk, raw for anything inside one. */
    protected figureOf(node: MapNode): string {
        return formatBytes(node.bytes ?? node.raw);
    }

    // --- moving around --------------------------------------------------------------------------

    /**
     * A press on a tile, or on a part drawn inside it. The parts are a picture rather than controls
     * — the tile is the one button, so the keyboard has one stop per rectangle — and which part was
     * pressed is read off the element under the pointer.
     */
    protected openAt(tile: DrawnTile, event: MouseEvent): void {
        this.open(this.cellAt(tile, event) ?? tile.node);
    }

    /** The detail follows the pointer down into the parts of a tile. */
    protected pointAt(tile: DrawnTile, event: MouseEvent): void {
        const node = this.cellAt(tile, event) ?? tile.node;
        if (this.picked() !== node) {
            this.picked.set(node);
        }
    }

    private cellAt(tile: DrawnTile, event: MouseEvent): MapNode | null {
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cell]') : null;
        const id = target?.dataset['cell'];
        return id ? (tile.inner.find(cell => cell.node.id === id)?.node ?? null) : null;
    }

    protected canOpen(node: MapNode): boolean {
        return node.children.length > 0;
    }

    protected open(node: MapNode): void {
        if (!this.canOpen(node)) {
            this.picked.set(node);
            return;
        }
        // A part drawn inside a tile is opened through its tile, so the crumbs stay a real path.
        const level = this.level();
        const owner = level.includes(node) ? null : level.find(tile => tile.children.includes(node));
        this.go([...this.trail(), ...(owner ? [owner.id] : []), node.id]);
    }

    protected up(): void {
        if (this.trail().length > 0) {
            this.go(this.trail().slice(0, -1));
        }
    }

    protected go(trail: string[]): void {
        this.trail.set(trail);
        this.picked.set(null);
        this.nav.setParam('at', trail.join('>'));
    }

    protected onKey(event: KeyboardEvent): void {
        if (!((event.key === 'Escape' || event.key === 'Backspace') && this.trail().length > 0)) {
            return;
        }

        event.preventDefault();
        this.up();
    }

    protected setZone(zone: Zone): void {
        this.zone.set(zone);
        this.nav.setParam('zone', zone === 'all' ? '' : zone);
        this.go([]);
    }

    protected setQuery(value: string): void {
        this.query.set(value);
        this.nav.setParam('q', value);
    }

    /** The search tab knows every chunk a name is in; the map only knows the one being looked at. */
    protected findIt(node: MapNode): void {
        this.nav.go('search');
        this.nav.setParam('q', node.label.replace(/^.*\//, ''));
    }

    protected zoneLabel(zone: Zone): string {
        const t = this.i18n.ui();
        const labels: Record<Zone, string> = {
            all: t.treeAll,
            boot: t.treeBoot,
            shared: t.treeShared,
            own: t.treeOwn,
        };
        return labels[zone];
    }

    /** What a rectangle says to somebody who cannot see it: name, figure, share. */
    protected ariaOf(tile: DrawnTile): string {
        const t = this.i18n.ui();
        return `${tile.node.label}, ${t.mapKind[tile.node.kind]}, ${this.figureOf(tile.node)}, ${tile.share}`;
    }

    private zoneParam(): Zone {
        const value = this.nav.param('zone');
        return this.zones.find(zone => zone === value) ?? 'all';
    }
}
