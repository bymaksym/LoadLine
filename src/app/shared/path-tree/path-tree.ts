import { Component, computed, inject, input, signal } from '@angular/core';
import { buildPathTree } from '@core/analysis/path-tree';
import { type PathItem } from '@core/analysis/path-tree.types';
import { formatBytes } from '@core/format/format.utils';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ExplainComponent } from '../explain/explain';
import { BytesPipe } from '../pipes/bytes.pipe';
import { PathNodeComponent } from './path-node';

/** "Expand all" or "collapse all" order: the number changes so the same order can be repeated. */
export interface ForceOpen {
    open: boolean;
    seq: number;
}

/**
 * List of files as a collapsible folder tree. Everything is shown: nothing is cut off.
 *
 * Levels open on their own while the tree is small; past a certain size only the first one, and the
 * buttons at the top open or close everything at once.
 */
@Component({
    selector: 'app-path-tree',
    templateUrl: './path-tree.html',
    styleUrl: './path-tree.scss',
    imports: [BytesPipe, PathNodeComponent, ExplainComponent],
})
export class PathTreeComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    private readonly store = inject(ReportStore);

    // * INPUTS
    readonly items = input.required<PathItem[]>();
    /**
     * Raw size of what contains these files, when there is one. The breakdown never adds up to it:
     * the bundler's own code — the module wrapper, the banners — belongs to no input file and is
     * left out rather than shared around. Given it, the head says how much that is.
     */
    readonly rawTotal = input<number | null>(null);

    // * ATTRIBUTES
    protected readonly force = signal<ForceOpen | null>(null);
    private seq = 0;

    protected readonly roots = computed(() => buildPathTree(this.items()));

    protected readonly total = computed(() => ({
        files: this.items().length,
        bytes: this.items().reduce((sum, item) => sum + item.bytes, 0),
    }));

    /** Bytes of the container that belong to no file of the breakdown. Zero when there are none. */
    private readonly unattributed = computed(() => {
        const raw = this.rawTotal();
        return raw === null ? 0 : Math.max(0, raw - this.total().bytes);
    });

    /**
     * What the head has to add for its figure to be readable: the unit, when the report is in
     * compressed figures and this breakdown therefore is not, and what the container weighs over
     * the sum of its files. One piece of text so the parts never end up glued together.
     */
    protected readonly note = computed<{ text: string; help: string } | null>(() => {
        const t = this.i18n.ui();
        const rest = this.unattributed();
        const parts: string[] = [];
        const help: string[] = [];

        if (this.store.compressed()) {
            parts.push(t.unitRaw);
            help.push(t.pathRawHelp);
        }
        if (rest > 0) {
            parts.push(t.pathUnattributed(formatBytes(rest)));
            help.push(t.pathUnattributedHelp);
        }

        // The leading separator is part of the text: between two elements the template collapses
        // whitespace away, and the figures would end up glued to it.
        return parts.length > 0 ? { text: `· ${parts.join(' · ')}`, help: help.join(' ') } : null;
    });

    /** Each node's bar is measured against the largest root node. */
    protected readonly scale = computed(() => this.roots()[0]?.bytes ?? 1);

    /** Small: everything open. Medium: the first level. Large: only what is asked for. */
    protected readonly autoOpenDepth = computed(() => {
        const files = this.items().length;
        if (files <= 30) {
            return Infinity;
        }
        return files <= 200 ? 1 : 0;
    });

    protected forceAll(open: boolean): void {
        this.force.set({ open, seq: ++this.seq });
    }
}
