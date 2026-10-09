import { Component, computed, inject, signal } from '@angular/core';
import { type TreeNode } from '@core/analysis/analysis.types';
import { shapeOf, type ZoneShape } from '@core/analysis/screens/shape';
import { formatBytes } from '@core/format/format.utils';
import { TreeNodeComponent } from '@shared/bundle-tree/tree-node';
import { pickSort, type Sort, sortSign } from '@shared/sort-header/sort.utils';
import { SortHeaderComponent } from '@shared/sort-header/sort-header';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { PanelHeaderComponent } from '../panel-header/panel-header';

/** What the buttons above the list filter by. `lazy` is the two zones that are not the bootstrap. */
type Zone = 'all' | 'boot' | 'lazy' | 'shared' | 'own';
type SortKey = 'name' | 'bytes';

/** One entry of the legend under the bar: a zone, what it weighs and how many files carry it. */
interface ShapeItem {
    zone: ZoneShape['zone'];
    label: string;
    size: string;
    files: number;
}

/** The bundle from the inside: zone filter, text filter and the chunk → package → file tree. */
@Component({
    selector: 'app-tree-tab',
    templateUrl: './tree-tab.html',
    styleUrl: './tree-tab.scss',
    imports: [PanelHeaderComponent, TreeNodeComponent, SortHeaderComponent],
})
export class TreeTabComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);

    // * CONSTANTS
    // In the order of the block above the list, so the word somebody just read is the word they press.
    protected readonly zones: Zone[] = ['all', 'boot', 'lazy', 'shared', 'own'];

    // * ATTRIBUTES
    protected readonly zone = signal<Zone>('all');
    protected readonly query = signal('');
    /** Named `order` and not `sort` on purpose: `this.sort()` reads as `Array#sort` to a linter. */
    protected readonly order = signal<Sort<SortKey>>({ key: 'bytes', dir: 'desc' });
    protected readonly tailOpen = signal(false);
    /**
     * Chunks kept at the top of the list, by id.
     *
     * The list is one common scale and it is ordered by size, so comparing two rows near each other
     * costs nothing; comparing row 2 with row 41 costs scrolling, and by the time the second one is
     * on screen the first is not. Pinning is the cheap answer to that — cheaper than a checkbox
     * column, because it is one control on the row somebody is already looking at.
     */
    private readonly pinned = signal<ReadonlySet<string>>(new Set());

    protected readonly tree = computed(() => this.store.analysis()?.tree ?? []);

    /** The three zones with their weight, before anything is filtered. */
    private readonly zoneShapes = computed(() => shapeOf(this.tree(), this.store.criteria()));

    /**
     * How the build is divided: one bar on the report's three colours and a legend entry per zone,
     * each saying **when** it comes down — eager or lazy, the split every bundler reports — and
     * **who pays** for it, which is the one only Loadline counts. The sentence under them says the
     * eager share as a proportion, so nobody has to add the lazy two up by hand.
     *
     * It is also the only reading of the bundle that does not depend on which row happens to be open.
     */
    protected readonly shape = computed(() => {
        const t = this.i18n.ui();
        const zones = this.zoneShapes();
        // Null rather than an empty block: it has nothing to say before a build is loaded.
        if (zones.length === 0) {
            return null;
        }

        const total = zones.reduce((sum, zone) => sum + zone.bytes, 0);
        const eager = zones.find(zone => zone.zone === 'boot')?.bytes ?? 0;

        // Each stretch grows by its weight rather than taking a width in percent, so the 1 px gaps
        // between them come out of the stretches and the bar never overflows its track.
        const bar = zones.filter(zone => zone.bytes > 0).map(zone => ({ zone: zone.zone, grow: zone.bytes }));
        const items: ShapeItem[] = zones.map(zone => ({
            zone: zone.zone,
            label: t.shapeZone[zone.zone],
            size: formatBytes(zone.bytes),
            files: zone.files,
        }));

        return { items, bar, split: t.shapeSplit(Math.round((eager / (total || 1)) * 100)) };
    });

    /**
     * The sentence under the table: where the weight of a zone actually is. Said only when there
     * is something to say — a zone with a single chunk has nothing to concentrate.
     */
    protected readonly shapeNote = computed(() => {
        const t = this.i18n.ui();
        const c = this.store.criteria();
        const notes = shapeOf(this.tree(), c)
            .filter(zone => zone.files > 2)
            .map(zone => {
                const heavy = zone.concentration >= c.concentratedRatio;
                const crumbs = zone.crumbs >= c.manyCrumbs;
                if (!heavy && !crumbs) {
                    return null;
                }

                return t.shapeNote({
                    crumbMax: formatBytes(c.crumbMaxBytes),
                    zone: zone.zone,
                    share: Math.round(zone.concentration * 100),
                    heavy,
                    crumbs: crumbs ? zone.crumbs : 0,
                    files: zone.files,
                    crumbSize: formatBytes(zone.crumbBytes),
                });
            })
            .filter((note): note is string => !!note)
            // Each one is a sentence of its own, and some start with a figure or an article.
            .map(note => note.charAt(0).toUpperCase() + note.slice(1));

        return notes.join(' ');
    });

    /** Matches if the chunk name, one of its packages or folders, or any file inside contains the text. */
    protected readonly visibleTree = computed<TreeNode[]>(() => {
        const zone = this.zone();
        const query = this.query().trim().toLowerCase();

        return this.tree().filter(node => {
            const inZone = zone === 'all' || (zone === 'lazy' ? node.zone !== 'boot' : node.zone === zone);
            if (!inZone) {
                return false;
            }
            if (!query) {
                return true;
            }

            return (
                node.label.toLowerCase().includes(query) ||
                node.children.some(
                    group =>
                        group.label.toLowerCase().includes(query) ||
                        group.children.some(file => file.label.toLowerCase().includes(query)),
                )
            );
        });
    });

    /** The comparator the header is asking for, as one function both lists use. */
    private readonly comparator = computed<(a: TreeNode, b: TreeNode) => number>(() => {
        const { key, dir } = this.order();
        const sign = sortSign(dir);

        return key === 'name' ? (a, b) => sign * a.label.localeCompare(b.label) : (a, b) => sign * (a.bytes - b.bytes);
    });

    /** The list in the order the header asks for. Size descending is what it opens on. */
    private readonly ordered = computed<TreeNode[]>(() => this.visibleTree().toSorted(this.comparator()));

    /**
     * The pinned rows, above everything else.
     *
     * They come off the whole tree rather than off the filtered list, and that is the point: the
     * reason to pin a row is to keep looking at it **while** filtering or searching for another
     * one. A pin that a search box removes from the screen would not be a pin.
     */
    protected readonly pinnedRows = computed<TreeNode[]>(() => {
        const pins = this.pinned();
        return pins.size === 0
            ? []
            : this.tree()
                  .filter(node => pins.has(node.id))
                  .toSorted(this.comparator());
    });

    /**
     * The crumbs — chunks under the crumb line — held back into one row.
     *
     * Only while the list is ordered by size, which is the only order in which "the tail" is a
     * place: sorted by name they are scattered through the alphabet and folding them into a group
     * at the end would be folding an arbitrary set of rows.
     */
    private readonly split = computed(() => {
        const rows = this.ordered();
        if (this.order().key !== 'bytes' || this.order().dir !== 'desc') {
            return { head: rows, tail: [] as TreeNode[] };
        }

        const line = this.crumbLineBytes();
        const tail = rows.filter(node => node.bytes < line);
        // Two or three of them are not a tail; grouping those hides more than it saves.
        return tail.length > 3
            ? { head: rows.filter(node => node.bytes >= line), tail }
            : { head: rows, tail: [] as TreeNode[] };
    });

    // A pinned row is at the top; leaving it in the list as well would be showing it twice.
    protected readonly head = computed(() => this.split().head.filter(node => !this.pinned().has(node.id)));
    protected readonly tail = computed(() => this.split().tail.filter(node => !this.pinned().has(node.id)));

    protected readonly crumbBytes = computed(() =>
        formatBytes(this.tail().reduce((total, node) => total + node.bytes, 0)),
    );

    protected readonly crumbLine = computed(() => formatBytes(this.crumbLineBytes()));

    private readonly crumbLineBytes = computed(() => this.store.criteria().crumbMaxBytes);

    /**
     * The bar of every row is drawn against this. The pinned rows count towards it: they are on the
     * same screen as the rest, so a scale that ignored them would put two bars of different lengths
     * on two chunks of the same size.
     */
    protected readonly treeScale = computed(
        () => Math.max(0, ...this.ordered().map(node => node.bytes), ...this.pinnedRows().map(node => node.bytes)) || 1,
    );

    protected isPinned(node: TreeNode): boolean {
        return this.pinned().has(node.id);
    }

    protected togglePin(node: TreeNode): void {
        const next = new Set(this.pinned());
        if (!next.delete(node.id)) {
            next.add(node.id);
        }
        this.pinned.set(next);
    }

    protected pick(key: SortKey): void {
        this.order.set(pickSort(this.order(), key, key === 'name' ? 'asc' : 'desc'));
    }

    /** What a chunk's zone weighs in total, so each row can say how much of it that chunk is. */
    protected zoneBytesOf(zone: TreeNode['zone']): number {
        return this.zoneShapes().find(entry => entry.zone === zone)?.bytes ?? 0;
    }

    protected zoneLabel(zone: Zone): string {
        const t = this.i18n.ui();
        const labels: Record<Zone, string> = {
            all: t.treeAll,
            boot: t.treeBoot,
            lazy: t.treeLazy,
            shared: t.treeShared,
            own: t.treeOwn,
        };
        return labels[zone];
    }

    /** Who pays for a zone, in a sentence. The filter buttons double as the legend of the colours. */
    protected zoneHelp(zone: Zone): string {
        const t = this.i18n.ui();
        const helps: Record<Zone, string> = {
            all: t.helpZoneAll,
            boot: t.helpZoneBoot,
            lazy: t.helpDelivery.lazy,
            shared: t.helpZoneShared,
            own: t.helpZoneOwn,
        };
        return helps[zone];
    }
}
