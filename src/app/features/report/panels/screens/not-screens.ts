import { Component, computed, inject } from '@angular/core';
import { ExplainComponent } from '@shared/explain/explain';
import { BytesPipe } from '@shared/pipes/bytes.pipe';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';

/**
 * The lazy entries the screens table has no row for, one line each: a piece of a screen (a `@defer`,
 * a `lazy()` inside a component), a file that only groups routes, and data — a language file, a
 * table — which is the one that turned a real application's table of one screen into sixty-one.
 *
 * Naming them one by one, instead of counting them, is what makes each one correctable. Telling a
 * screen from a piece of one is partly done by reading file names, and no set of names fits every
 * project: rather than keep adding names to an expression that will always be one convention
 * behind, the row carries the way to say Loadline got it wrong.
 */
@Component({
    selector: 'app-not-screens',
    templateUrl: './not-screens.html',
    styleUrl: './not-screens.scss',
    imports: [BytesPipe, ExplainComponent],
})
export class NotScreensComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);

    // * ATTRIBUTES
    /**
     * Every entry, in the order of its kind: lazy blocks, files that group routes, data. Each one
     * carries the name of its kind, and the first of each kind the explanation of it.
     */
    protected readonly items = computed(() => {
        const analysis = this.store.analysis();
        if (!analysis) {
            return [];
        }

        const t = this.i18n.ui();
        const groups = [
            { kind: t.notScreenKind.block, help: t.blocksHelp, items: analysis.deferredBlocks },
            { kind: t.notScreenKind.grouper, help: t.groupersHelp, items: analysis.routeGroupers },
            { kind: t.notScreenKind.data, help: t.dataHelp, items: analysis.lazyData },
        ];

        return groups.flatMap(group =>
            group.items.map((item, index) => ({ ...item, kind: group.kind, help: group.help, first: index === 0 })),
        );
    });

    /** How many entries were reclassified by hand: the table is not showing the rules' answer. */
    protected readonly marked = computed(() => this.store.marks().size);
}
