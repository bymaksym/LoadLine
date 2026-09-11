import { Component, computed, inject } from '@angular/core';
import { type SharedPackage } from '@core/multi/compare-builds';
import { ExplainComponent } from '@shared/explain/explain';
import { BytesPipe } from '@shared/pipes/bytes.pipe';
import { CompareStore } from '@state/compare.store';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { PanelHeaderComponent } from '../panel-header/panel-header';

/** How many rows of each list are drawn before the rest are folded away. */
const HEAD = 25;

/**
 * Several applications crossed with each other: what they ship twice, and what that costs.
 *
 * It is the one view of the report that is not about the build on screen, which is why it is pushed
 * to the end of the strip next to Criteria. Everything in it comes out of the same `analyze()` as
 * the rest — see `core/multi/compare-builds.ts` for why that mattered more than anything else here.
 */
@Component({
    selector: 'app-compare-tab',
    templateUrl: './compare-tab.html',
    styleUrl: './compare-tab.scss',
    imports: [PanelHeaderComponent, BytesPipe, ExplainComponent],
})
export class CompareTabComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly compare = inject(CompareStore);
    protected readonly store = inject(ReportStore);

    protected readonly matrix = computed(() => this.compare.report$());

    protected readonly builds = computed(() => this.compare.builds());

    /**
     * The packages worth a row: the ones whose extra copies weigh something.
     *
     * A package in two builds at 300 bytes each is in two builds and is not a finding. Sorting by
     * what the copies cost and cutting at nothing is the same rule the rest of the report follows:
     * the list is complete down to the point where a row stops being about bytes.
     */
    protected readonly shared = computed(() => this.matrix().shared.filter(entry => entry.duplicatedBytes > 0));

    protected readonly sharedHead = computed(() => this.shared().slice(0, HEAD));
    protected readonly sharedRest = computed(() => this.shared().length - this.sharedHead().length);

    protected readonly ownHead = computed(() => this.matrix().ownFiles.slice(0, HEAD));
    protected readonly ownRest = computed(() => this.matrix().ownFiles.length - this.ownHead().length);

    /** The bar of a build's row, against the heaviest of them. */
    protected percent(bytes: number): number {
        const highest = Math.max(1, ...this.matrix().totals.map(total => total.total));
        return (bytes / highest) * 100;
    }

    /** The version column, or the reason it is empty — which is not the same as "they agree". */
    protected versionsOf(entry: SharedPackage): string {
        const t = this.i18n.ui();
        if (entry.versions.length === 0) {
            return t.compareVersionUnknown;
        }
        return entry.versions.join(' · ');
    }

    protected onFiles(event: Event): void {
        const input = event.target as HTMLInputElement;
        if (input.files?.length) {
            void this.compare.add([...input.files]);
        }
        // Choosing the same file again has to fire `change` again.
        input.value = '';
    }
}
