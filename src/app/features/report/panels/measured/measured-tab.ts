import { Component, computed, inject } from '@angular/core';
import { type Zone } from '@core/analysis/analysis.types';
import { deliveryOf } from '@core/analysis/screens/delivery';
import { formatDelta } from '@core/format/format.utils';
import { isStale, type MeasuredWave, OBSERVED_FRESH_DAYS } from '@core/measurement/observed';
import { ExplainComponent } from '@shared/explain/explain';
import { BytesPipe } from '@shared/pipes/bytes.pipe';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';
import { PanelHeaderComponent } from '../panel-header/panel-header';
import { MeasuredIntakeComponent } from './measured-intake';

/** Today, as `YYYY-MM-DD`: what a measurement's age is compared against. */
const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * The browser's measurement against the computed report. Everywhere else Loadline walks the import
 * graph; here it compares that walk against what actually came down the wire.
 */
@Component({
    selector: 'app-measured-tab',
    templateUrl: './measured-tab.html',
    styleUrl: './measured-tab.scss',
    imports: [PanelHeaderComponent, BytesPipe, ExplainComponent, MeasuredIntakeComponent],
})
export class MeasuredTabComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);
    protected readonly nav = inject(ReportNav);

    // * CONSTANTS
    protected readonly freshDays = OBSERVED_FRESH_DAYS;

    // * ATTRIBUTES
    protected readonly screens = computed(() => this.store.analysis()?.screens ?? []);
    protected readonly url = computed(() => this.store.measurementUrl());

    /** The environment that one paste observed. Shown as facts with their limits, never as defaults. */
    protected readonly observed = computed(() => this.store.observed());

    /** Whether the channel figures are old enough that resting anything on them is a mistake. */
    protected readonly staleFact = computed(() => isStale(this.observed()?.takenAt ?? null, today()));

    /** The label of the screen Loadline worked out, so the "auto" option says which one it picked. */
    protected readonly autoLabel = computed(() => {
        const t = this.i18n.ui();
        const report = this.store.measured();
        if (!report) {
            return t.measureAuto;
        }
        return report.screen ? `${t.measureAuto}: ${report.screen.label}` : t.measureRootOnly;
    });

    protected readonly diffText = computed(() => {
        const report = this.store.measured();
        if (!report) {
            return '';
        }

        const diff = report.measured - report.computed;
        return diff === 0 ? this.i18n.ui().measureSame : formatDelta(diff);
    });

    /** The other half of the difference: files, which is often where it shows up first. */
    protected readonly diffFiles = computed(() => {
        const report = this.store.measured();
        if (!report) {
            return '';
        }

        const diff = report.measuredFiles - report.computedFiles;
        return diff === 0 ? '' : `${diff > 0 ? '+' : '−'}${this.i18n.ui().measureFiles(Math.abs(diff))}`;
    });

    protected readonly diffTone = computed(() => {
        const report = this.store.measured();
        if (!report) {
            return null;
        }

        const diff = report.measured - report.computed;
        return diff === 0 ? 'same' : diff > 0 ? 'up' : 'down';
    });

    /** The widest batch: depth and width are different problems, and one figure hides which. */
    protected widest(waves: readonly MeasuredWave[]): number {
        return Math.max(0, ...waves.map(wave => wave.files.length));
    }

    protected labelOf(source: string): string {
        return this.screens().find(screen => screen.source === source)?.label ?? source;
    }

    protected pick(value: string): void {
        this.store.setMeasurementPick(value || null);
    }

    /**
     * When the computation says a chunk comes down. Next to a measurement it earns its place: an
     * "extra" chunk tagged lazy is one the browser asked for that nothing statically imports, which
     * is exactly the router-before-guard case this tab exists to catch.
     */
    protected deliveryLabel(zone: Zone): string {
        const t = this.i18n.ui();
        return t.tagDelivery[deliveryOf(zone)];
    }

    protected deliveryHelp(zone: Zone): string {
        const t = this.i18n.ui();
        return t.helpDelivery[deliveryOf(zone)];
    }
}
