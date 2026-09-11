import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { type PathNode } from '@core/analysis/path-tree.types';
import { whyHere } from '@core/analysis/why-here';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ChainComponent } from '../chain/chain';
import { BytesPipe } from '../pipes/bytes.pipe';
import { type ForceOpen } from './path-tree';

/**
 * A folder or a file of the path tree, recursive. Children are only mounted when open.
 *
 * `open` is a `linkedSignal`: it starts from the automatic value (or from the last "all open /
 * closed" order) and the person can change it by hand until the next order.
 */
@Component({
    selector: 'app-path-node',
    templateUrl: './path-node.html',
    styleUrl: './path-node.scss',
    imports: [BytesPipe, ChainComponent],
})
export class PathNodeComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    private readonly store = inject(ReportStore);

    // * INPUTS
    readonly node = input.required<PathNode>();
    readonly depth = input(0);
    readonly siblings = input(1);
    readonly scale = input.required<number>();
    readonly autoOpenDepth = input(0);
    readonly force = input<ForceOpen | null>(null);

    // * ATTRIBUTES
    /** Open if a general order says so; otherwise, if the level is shallow or it is an only child. */
    protected readonly open = linkedSignal(
        () => this.force()?.open ?? (this.depth() < this.autoOpenDepth() || this.siblings() === 1),
    );

    /**
     * Whether this file is showing why it is here. A signal of its own rather than `open`, because
     * `open` is what "expand all" drives: a small tree opens every level on its own, and that would
     * have printed the chain of forty files nobody asked about under a folder somebody did.
     */
    protected readonly whyOpen = signal(false);

    /**
     * The import chain to this file, worked out only once it is asked for.
     *
     * A chain is a walk of the graph. Computing one per row would be four thousand walks to draw a
     * tree, so nothing happens until the row is opened — which is also the only moment anybody has
     * asked the question.
     */
    protected readonly chain = computed<string[] | null>(() => {
        const analysis = this.store.analysis();
        if (!analysis || !this.whyOpen()) {
            return null;
        }

        return whyHere(analysis, this.node().id)?.steps ?? null;
    });

    protected readonly sharePercent = computed(() => {
        const scale = this.scale();
        return scale > 0 ? Math.min(100, (this.node().bytes / scale) * 100) : 0;
    });
}
