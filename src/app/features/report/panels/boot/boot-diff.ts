import { Component, computed, effect, type ElementRef, inject, signal, viewChild } from '@angular/core';
import { type Rect, squarify } from '@core/analysis/views/treemap';
import { type BootCause } from '@core/baseline/baseline.types';
import { type BootDiff, bootDiffOf, type DiffChange, type DiffTile } from '@core/baseline/boot-diff';
import { formatBytes, formatDelta } from '@core/format/format.utils';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';

/** Every way a part can have moved, the one that left the map included: what the legend lists. */
type Change = DiffChange | 'gone';

/** One rectangle as drawn: where it goes, and what it says to the eye and to a screen reader. */
interface DrawnTile {
    tile: DiffTile;
    rect: Rect;
    /** Room for the name; and below it, for the figures. */
    named: boolean;
    sized: boolean;
    /** What it weighs now, raw: the figure its area is drawn from. */
    size: string;
    /** How it moved, signed, in the report's unit. `''` when it did not. */
    delta: string;
    /** The whole rectangle in one sentence: name, size and change. */
    label: string;
}

/** Room a tile needs for each thing it can show. Under these it shows less rather than overflow. */
const NAME_MIN = { w: 46, h: 18 };
const SIZE_MIN_H = 36;

/**
 * What changed in the bootstrap since the baseline, as a map: the bootstrap as it is now, one
 * rectangle per package and own-code folder, sized by what it weighs and coloured by how it moved.
 *
 * The numbers of a comparison say how much; this says where. A bootstrap that grew by 40 kB because
 * one package doubled reads differently from one that grew a little everywhere, and a list of
 * causes sorted by size hides that the grown package is a tenth of the whole.
 *
 * The rectangles are a figure, not controls: a list of items laid out with absolute positions, each
 * one carrying its sentence for a screen reader, so the map is read as the list it is.
 */
@Component({
    selector: 'app-boot-diff',
    templateUrl: './boot-diff.html',
    styleUrl: './boot-diff.scss',
})
export class BootDiffComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);

    // * CONSTANTS
    protected readonly changes: Change[] = ['grew', 'new', 'shrank', 'same', 'gone'];

    // * ATTRIBUTES
    private readonly frame = viewChild<ElementRef<HTMLElement>>('frame');
    protected readonly width = signal(0);

    constructor() {
        // The frame only exists while there are tiles to draw, so it is watched for as it comes and goes.
        // An observer reports the size it starts with, which is what sets the first width.
        effect(onCleanup => {
            const frame = this.frame()?.nativeElement;
            if (!frame) {
                return;
            }
            const observer = new ResizeObserver(entries => {
                const box = entries[0]?.contentRect;
                if (box) {
                    this.width.set(Math.round(box.width));
                }
            });
            observer.observe(frame);
            onCleanup(() => observer.disconnect());
        });
    }

    protected readonly diff = computed<BootDiff | null>(() => {
        const analysis = this.store.analysis();
        const comparison = this.store.comparison();
        return analysis && comparison ? bootDiffOf(analysis, comparison) : null;
    });

    /** The bootstrap before and after, in the report's unit, with the baseline it is measured against. */
    protected readonly subtitle = computed(() => {
        const comparison = this.store.comparison();
        if (!comparison) {
            return '';
        }
        const { before, after, diff } = comparison.boot;
        return this.i18n
            .ui()
            .diffSub(formatBytes(before), formatBytes(after), formatDelta(diff), comparison.baselineName);
    });

    /** Height follows width, within limits: tall enough to name the big parts, short enough to scroll past. */
    protected readonly height = computed(() => Math.round(Math.min(520, Math.max(240, this.width() * 0.5))));

    protected readonly tiles = computed<DrawnTile[]>(() => {
        const width = this.width();
        const diff = this.diff();
        if (width <= 0 || !diff) {
            return [];
        }

        return squarify(diff.tiles, tile => tile.bytes, { x: 0, y: 0, w: width, h: this.height() }).map(
            ({ item, rect }): DrawnTile => {
                // Size and change in the same unit, the report's: a raw size next to a gzip change
                // read as one figure in two units. The area stays raw, like every share in a chunk.
                const comparison = this.store.comparison();
                const shown = formatBytes(Math.round(item.bytes * (comparison?.causesRatio ?? 1)));
                const size = comparison?.causesEstimated ? `≈${shown}` : shown;
                const delta = item.change === 'same' ? '' : this.deltaOf(item.diff);
                return {
                    tile: item,
                    rect,
                    named: rect.w >= NAME_MIN.w && rect.h >= NAME_MIN.h,
                    sized: rect.w >= NAME_MIN.w && rect.h >= SIZE_MIN_H,
                    size,
                    delta,
                    label: this.i18n.ui().diffTile(this.nameOf(item), size, this.changeOf(item.change, delta)),
                };
            },
        );
    });

    /** A raw change in the report's unit, signed, and marked as an estimate when it is one. */
    protected deltaOf(diff: number): string {
        const comparison = this.store.comparison();
        const figure = formatDelta(Math.round(diff * (comparison?.causesRatio ?? 1)));
        return comparison?.causesEstimated ? `≈${figure}` : figure;
    }

    protected changeWord(change: Change): string {
        return this.i18n.ui().diffChange[change];
    }

    /** What left the bootstrap, said the way a tile says it. */
    protected goneLabel(cause: BootCause): string {
        return this.i18n.ui().diffTile(this.nameOf(cause), this.deltaOf(cause.diff), this.changeWord('gone'));
    }

    private nameOf(part: { name: string; own: boolean }): string {
        return part.own ? `${part.name} (${this.i18n.ui().diffOwn})` : part.name;
    }

    private changeOf(change: DiffChange, delta: string): string {
        const word = this.changeWord(change);
        return delta ? `${word} ${delta}` : word;
    }
}
