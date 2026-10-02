import { Component, inject, input, output } from '@angular/core';
import { type MapNode } from '@core/analysis/treemap';
import { formatBytes } from '@core/format/format.utils';
import { ExplainComponent } from '@shared/explain/explain';
import { BytesPipe } from '@shared/pipes/bytes.pipe';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';

/** A share as people read it: one decimal under ten per cent, none above. */
export const percent = (part: number, whole: number): string => {
    if (whole <= 0) {
        return '0 %';
    }
    const share = (part / whole) * 100;
    return `${share >= 10 ? share.toFixed(0) : share.toFixed(1)} %`;
};

/**
 * What the rectangle under the pointer, or with the focus, is — in words, which is the part of a
 * treemap a rectangle cannot say: its figure, its share of what holds it and of everything, who
 * pays for it, and the heaviest of what it holds as a list that reads where small boxes do not.
 */
@Component({
    selector: 'app-map-detail',
    templateUrl: './map-detail.html',
    styleUrl: './map-detail.scss',
    imports: [BytesPipe, ExplainComponent],
})
export class MapDetailComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);

    // * INPUTS
    /** What to describe. `null` when nothing is under the pointer and the map is at the top. */
    readonly node = input.required<MapNode | null>();
    /** The node the map is open on, so the panel does not offer to open it again. */
    readonly current = input.required<MapNode | null>();
    /** The whole map, to say what a node is a share of. */
    readonly roots = input.required<readonly MapNode[]>();
    readonly canGoUp = input(false);

    // * OUTPUTS
    readonly opened = output<MapNode>();
    readonly upped = output();
    readonly found = output<MapNode>();

    /** The figure a node is read by: the report's unit for a chunk, raw for anything inside one. */
    protected figureOf(node: MapNode): string {
        return formatBytes(node.bytes ?? node.raw);
    }

    /** Where in the build this node sits, as a share of its level and of everything. */
    protected sharesOf(node: MapNode): string[] {
        const t = this.i18n.ui();
        const parent = this.parentOf(node);
        const all = this.roots().reduce((sum, root) => sum + root.weight, 0);
        const lines: string[] = [];
        if (parent) {
            const whole = parent.children.reduce((sum, child) => sum + child.weight, 0);
            lines.push(t.mapShareOfParent(percent(node.weight, whole), parent.label));
        }
        // The whole build is all of the JavaScript by definition: "100 %" says nothing.
        if (node.bytes !== null && node.kind !== 'build') {
            lines.push(t.mapShareOfAll(percent(node.bytes, all)));
        }
        return lines;
    }

    /** The heaviest few things inside, for the panel: a list reads where small rectangles do not. */
    protected contentsOf(node: MapNode): { node: MapNode; share: string; width: number }[] {
        const total = node.children.reduce((sum, child) => sum + child.weight, 0);
        const top = node.children.slice(0, 6);
        const max = top[0]?.weight ?? 0;
        return top.map(child => ({
            node: child,
            share: percent(child.weight, total),
            width: max > 0 ? (child.weight / max) * 100 : 0,
        }));
    }

    /** Who pays for it, in the words the rest of the report uses. */
    protected whoPays(node: MapNode): string {
        const t = this.i18n.ui();
        return node.zone === 'boot' ? t.tagDelivery.eager : `${t.tagDelivery.lazy} · ${t.treeScreens(node.screens)}`;
    }

    private parentOf(node: MapNode): MapNode | null {
        const search = (level: readonly MapNode[], parent: MapNode | null): MapNode | null | undefined => {
            for (const candidate of level) {
                if (candidate === node) {
                    return parent;
                }
                const found = search(candidate.children, candidate);
                if (found !== undefined) {
                    return found;
                }
            }
            return undefined;
        };
        return search(this.roots(), null) ?? null;
    }
}
