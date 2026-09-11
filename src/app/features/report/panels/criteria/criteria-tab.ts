import { Component, computed, inject } from '@angular/core';
import { CRITERIA_FIELDS, fromField, RECOMMENDED, toField } from '@core/criteria/criteria';
import { type CriteriaField, type CriteriaKey, type Unit } from '@core/criteria/criteria.types';
import { ExplainComponent } from '@shared/explain/explain';
import { CriteriaService } from '@state/criteria.service';
import { ExportService } from '@state/export.service';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { PanelHeaderComponent } from '../panel-header/panel-header';

type Group = CriteriaField['group'];

/** The thresholds used to rate and to flag, editable. Every field shows its recommended value. */
@Component({
    selector: 'app-criteria-tab',
    templateUrl: './criteria-tab.html',
    styleUrl: './criteria-tab.scss',
    imports: [PanelHeaderComponent, ExplainComponent],
})
export class CriteriaTabComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);
    protected readonly exports = inject(ExportService);
    protected readonly criteria = inject(CriteriaService);

    // * CONSTANTS
    protected readonly groups: Group[] = ['sizes', 'shared', 'signals', 'shape', 'context'];
    protected readonly toField = toField;

    protected readonly recommended = computed(() => RECOMMENDED[this.store.mode()]);

    protected fieldsOf(group: Group): CriteriaField[] {
        return CRITERIA_FIELDS.filter(field => field.group === group);
    }

    protected groupTitle(group: Group): string {
        const t = this.i18n.ui();
        const titles: Record<Group, string> = {
            sizes: t.critGroupSizes,
            shared: t.critGroupShared,
            signals: t.critGroupSignals,
            shape: t.critGroupShape,
            context: t.critGroupContext,
        };
        return titles[group];
    }

    protected unitLabel(unit: Unit): string {
        const t = this.i18n.ui();
        const labels: Record<Unit, string> = {
            kb: t.unitKb,
            pct: t.unitPct,
            x: t.unitTimes,
            files: t.unitFiles,
            chunks: t.unitChunks,
            screens: t.unitScreens,
            langs: t.unitLangs,
            importers: t.unitImporters,
            trips: t.unitTrips,
            ms: t.unitMs,
        };
        return labels[unit];
    }

    /**
     * Why a size threshold does or does not move when the report switches to compressed figures.
     * Only on sizes, and only when it is not the obvious case: a chunk threshold in the unit of the
     * report needs no explaining, and the other two do — one of them is why the same build used to
     * raise a different number of signals depending on which folder had been dropped.
     */
    protected scaleNote(field: CriteriaField): string {
        return field.scale && field.scale !== 'chunk' ? this.i18n.ui().critScale[field.scale] : '';
    }

    /**
     * Where this threshold's number came from. Unlike the note above it, this one is shown on every
     * field including the conventions — especially the conventions: the whole value of the label is
     * that a reader can see at a glance how much of the list is a line somebody drew.
     */
    protected fromLabel(field: CriteriaField): string {
        return this.i18n.ui().critFrom[field.from];
    }

    protected fromHelp(field: CriteriaField): string {
        return this.i18n.ui().critFromHelp[field.from];
    }

    protected recommendedText(field: CriteriaField): string {
        const rec = this.recommended();
        const unit = this.unitLabel(field.unit);
        const first = toField(rec[field.key], field.unit);

        return field.pairWith ? `${first} / ${toField(rec[field.pairWith], field.unit)} ${unit}` : `${first} ${unit}`;
    }

    protected set(key: CriteriaKey, unit: Unit, event: Event): void {
        const raw = Number((event.target as HTMLInputElement).value);
        const clamped = unit === 'pct' ? Math.min(100, Math.max(0, raw)) : raw;

        this.criteria.set(this.store.mode(), key, fromField(clamped, unit));
    }
}
