import { Component, computed, inject, input, output, signal } from '@angular/core';
import { type TreeNode } from '@core/analysis/analysis.types';
import { deliveryOf } from '@core/analysis/delivery';
import { filesOfChunk } from '@core/analysis/path-tree';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ExplainComponent } from '../explain/explain';
import { PathTreeComponent } from '../path-tree/path-tree';
import { BytesPipe } from '../pipes/bytes.pipe';

/**
 * A chunk of the bundle: its row (who pays for it, bar, size) and, when opened, its files as a
 * folder tree. The tree is only mounted on expand, so a thousand closed files cost nothing.
 */
@Component({
    selector: 'app-tree-node',
    templateUrl: './tree-node.html',
    styleUrl: './tree-node.scss',
    imports: [BytesPipe, PathTreeComponent, ExplainComponent],
})
export class TreeNodeComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    private readonly store = inject(ReportStore);

    // * INPUTS
    readonly node = input.required<TreeNode>();
    /** Bytes of the largest chunk: the bar shares one scale across the whole list. */
    readonly scale = input.required<number>();
    /** Bytes of everything in this chunk's zone, to say how much of it this one chunk is. */
    readonly zoneBytes = input(0);
    /** Whether this row is being kept at the top of the list. */
    readonly pinned = input(false);

    // * OUTPUTS
    /** Asks the list to keep this row at the top, or to stop. The list owns which rows are pinned. */
    readonly pinToggled = output<void>();

    // * ATTRIBUTES
    protected readonly open = signal(false);

    protected readonly files = computed(() => filesOfChunk(this.node()));

    /**
     * The chunk's size on disk, shown under the main figure only when that one is compressed. The
     * breakdown inside the chunk is raw and cannot be anything else — gzip works on the whole file,
     * so there is no such thing as the compressed share of one module — and without both figures
     * side by side the row and its contents look like they contradict each other.
     */
    protected readonly rawSize = computed(() => {
        const raw = this.node().rawBytes ?? 0;
        return this.store.compressed() && raw > 0 ? raw : 0;
    });

    protected readonly sharePercent = computed(() => {
        const scale = this.scale();
        return scale > 0 ? Math.min(100, (this.node().bytes / scale) * 100) : 0;
    });

    /**
     * When the chunk comes down and who pays for it, in one tag: "eager", or "lazy · 26 screens".
     *
     * On a bootstrap chunk the two are the same fact and the tag says it once. On a lazy one they
     * are not, and putting them side by side is the reason for the tag: "lazy" is what the bundler
     * chunk 26 of 30 screens import, and it comes down on almost every visit.
     */
    protected readonly whoPays = computed(() => {
        const node = this.node();
        const t = this.i18n.ui();
        const when = t.tagDelivery[deliveryOf(node.zone ?? 'own')];
        return node.zone === 'boot' ? when : `${when} · ${t.treeScreens(node.screens ?? 0)}`;
    });

    /** Who pays for the chunk, in a sentence: the zone square and its tag are colour plus two words. */
    protected readonly zoneHelp = computed(() => {
        const t = this.i18n.ui();
        const zone = this.node().zone;
        if (zone === 'boot') {
            return t.helpZoneBoot;
        }
        return zone === 'shared' ? t.helpZoneShared : t.helpZoneOwn;
    });

    /** The bar is measured against the largest chunk on screen, which is worth saying out loud. */
    protected readonly barHelp = computed(() => this.i18n.ui().helpTreeBar(Math.round(this.sharePercent())));

    /**
     * How much of its zone this chunk holds, when that is a lot. Zone and size are already on the
     * row; what is missing is the division of one by the other, which is what says whether a row is
     * where the weight is or one of forty that are not.
     */
    protected readonly share = computed(() => {
        const total = this.zoneBytes();
        const ratio = total > 0 ? this.node().bytes / total : 0;
        return ratio >= this.store.criteria().heavyInZoneRatio ? Math.round(ratio * 100) : 0;
    });

    protected readonly barColour = computed(() => {
        const zone = this.node().zone;
        if (zone === 'boot') {
            return 'var(--seg-boot)';
        }
        return zone === 'shared' ? 'var(--seg-shared)' : 'var(--seg-own)';
    });
}
