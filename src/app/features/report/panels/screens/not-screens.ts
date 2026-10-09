import { Component, computed, inject } from '@angular/core';
import { routeStylesOf } from '@core/assets/assets';
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
        // A package cannot be counted as a screen: the screens are the project's own code, so the
        // button would do nothing. Every other kind can, which is the way out when the rules are wrong.
        const groups = [
            { kind: t.notScreenKind.block, help: t.blocksHelp, items: analysis.deferredBlocks, markable: true },
            { kind: t.notScreenKind.grouper, help: t.groupersHelp, items: analysis.routeGroupers, markable: true },
            { kind: t.notScreenKind.onDemand, help: t.onDemandHelp, items: analysis.lazyOnDemand, markable: true },
            { kind: t.notScreenKind.data, help: t.dataHelp, items: analysis.lazyData, markable: true },
            { kind: t.notScreenKind.package, help: t.packagesHelp, items: analysis.lazyPackages, markable: false },
            { kind: t.notScreenKind.worker, help: t.workersHelp, items: analysis.lazyWorkers, markable: true },
        ];

        return groups.flatMap(group =>
            group.items.map((item, index) => ({
                ...item,
                kind: group.kind,
                help: group.help,
                markable: group.markable,
                first: index === 0,
            })),
        );
    });

    /** How many entries were reclassified by hand: the table is not showing the rules' answer. */
    protected readonly marked = computed(() => this.store.marks().size);

    /**
     * Said where it could have been found and was not: a build read from its folder whose code has
     * no route table, where every lazy chunk is a screen and some are tabs or components.
     */
    protected readonly untabled = computed(() => {
        const analysis = this.store.analysis();
        return analysis?.routeTable === false && analysis.screens.length > 0;
    });

    /** The CSS of the lazy routes, which no total counts: named, so that is said rather than hidden. */
    protected readonly routeCss = computed(() => {
        const assets = this.store.assets();
        const styles = assets ? routeStylesOf(assets) : [];
        if (styles.length === 0) {
            return null;
        }
        const list = styles.length > 3 ? `${styles.slice(0, 3).join(', ')}, +${styles.length - 3}` : styles.join(', ');
        return this.i18n.ui().routeCss(styles.length, list);
    });
}
