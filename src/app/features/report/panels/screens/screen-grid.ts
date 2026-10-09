import { Component, computed, inject } from '@angular/core';
import { type GridColumn, screenGridOf } from '@core/analysis/screens/screen-grid';
import { formatBytes, formatCount } from '@core/format/format.utils';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';

/** The shading steps, lightest first. `empty` is a cell of zero bytes: no colour at all. */
const STEPS = ['s1', 's2', 's3', 's4', 's5', 's6'] as const;
type Step = (typeof STEPS)[number] | 'empty';

interface CellView {
    step: Step;
    /** The figure printed in the cell: kB without decimals, a handful of characters at most. */
    short: string;
    /** The same cell as a sentence, for the tooltip and for a screen reader. */
    label: string;
    /** The first lazy column: the cell draws the line between the bootstrap and the rest. */
    split: boolean;
}

interface ColumnView {
    name: string;
    split: boolean;
}

/**
 * Which step a cell falls in, by its share of the largest cell.
 *
 * On the square root of the share rather than the share itself: the bootstrap's framework is often
 * ten times any lazy package, and on a straight scale every lazy column would be the same faintest
 * step — exactly the columns the grid is there to tell apart.
 */
const stepOf = (bytes: number, max: number): Step => {
    if (bytes <= 0 || max <= 0) {
        return 'empty';
    }
    const index = Math.ceil(Math.sqrt(bytes / max) * STEPS.length);
    return STEPS[Math.min(STEPS.length, Math.max(1, index)) - 1] ?? 's6';
};

/** The cell's figure, short enough for a narrow column: `<1k`, `245k`, `1.2M`. */
const shortSize = (bytes: number): string => {
    const kilobytes = bytes / 1024;
    if (kilobytes < 1) {
        return '<1k';
    }
    return Math.round(kilobytes) < 1000 ? `${Math.round(kilobytes)}k` : `${formatCount(kilobytes / 1024)}M`;
};

/**
 * Screens × packages: one row per screen, one column per package, each cell shaded by what that
 * screen downloads from it. A column full from top to bottom is something every screen pays for.
 * Hidden under two screens: a grid of one row compares nothing.
 */
@Component({
    selector: 'app-screen-grid',
    templateUrl: './screen-grid.html',
    styleUrl: './screen-grid.scss',
})
export class ScreenGridComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);

    // * CONSTANTS
    protected readonly steps = STEPS;

    // * ATTRIBUTES
    protected readonly grid = computed(() => {
        const analysis = this.store.analysis();
        if (!analysis || analysis.screens.length < 2) {
            return null;
        }

        const grid = screenGridOf(analysis);
        if (grid.columns.length === 0) {
            return null;
        }

        const t = this.i18n.ui();
        const nameOf = (column: GridColumn): string => {
            if (column.kind === 'own') {
                return t.gridOwn;
            }
            return column.kind === 'rest' ? t.gridRest : column.name;
        };
        const boot = grid.columns.filter(column => column.boot).length;
        // The bootstrap's columns come first, so the first lazy one is right after them — and only
        // draws a line when there is a bootstrap side for it to separate from.
        const isSplit = (index: number): boolean => boot > 0 && index === boot;

        const columns: ColumnView[] = grid.columns.map((column, index) => ({
            name: nameOf(column),
            split: isSplit(index),
        }));

        const rows = grid.rows.map(row => ({
            label: row.label,
            source: row.source,
            total: formatBytes(row.total),
            cells: row.cells.map((bytes, index): CellView => ({
                step: stepOf(bytes, grid.max),
                short: bytes > 0 ? shortSize(bytes) : '',
                label: bytes > 0 ? t.gridCell(row.label, formatBytes(bytes), columns[index]?.name ?? '') : '',
                split: isSplit(index),
            })),
        }));

        return { boot, lazy: grid.columns.length - boot, columns, rows };
    });
}
