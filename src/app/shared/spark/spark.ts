import { Component, computed, input } from '@angular/core';

/** One bar: what it is worth, and the sentence that names it when the pointer stops on it. */
export interface SparkBar {
    /** `null` is a measurement this thing was not in. It leaves a gap rather than a bar at zero. */
    value: number | null;
    title: string;
}

/**
 * A line of measurements, drawn as bars and not as a chart.
 *
 * Deliberately not a chart: twenty points need no axes, and axes would make it look like a
 * dashboard — which is the one thing this must not look like, because what it draws lives in one
 * browser and a dashboard invites reading one machine's memory as the team's. The sentence next to
 * it says which it is; this only draws the shape.
 *
 * The whole picture goes into one `aria-label`, because twenty bars read out one at a time is not
 * a line, it is twenty numbers.
 */
@Component({
    selector: 'app-spark',
    template: `
        <div class="spark" role="img" [attr.aria-label]="label()">
            @for (bar of bars(); track $index) {
                @if (bar.value === null) {
                    <span class="spark__gap" [title]="bar.title"></span>
                } @else {
                    <span class="spark__bar" [style.height.%]="height(bar.value)" [title]="bar.title"></span>
                }
            }
        </div>
    `,
    styles: `
        :host {
            display: block;
        }

        .spark {
            display: flex;
            gap: 2px;
            align-items: flex-end;

            height: 64px;
            margin-top: var(--sp-3);
        }

        .spark__bar {
            flex: 1 1 auto;
            min-width: 4px;
            border-radius: 2px 2px 0 0;
            background: var(--spark-tone, var(--seg-boot));
        }

        /* A measurement this thing was not in. Dashes at the floor: absent, not weightless. */
        .spark__gap {
            flex: 1 1 auto;
            align-self: flex-end;

            min-width: 4px;
            height: 2px;

            background: var(--line-strong);
        }
    `,
    host: { '[style.--spark-tone]': 'tone()' },
})
export class SparkComponent {
    // * INPUTS
    readonly bars = input.required<SparkBar[]>();
    /** The whole line in words: twenty bars are one picture, not twenty things to read out. */
    readonly label = input.required<string>();
    /** The colour of the bars, so the second line is not the same line drawn twice. */
    readonly tone = input('var(--seg-boot)');

    /** The tallest bar marks 100 %. Below four per cent nothing is visible, so that is the floor. */
    private readonly highest = computed(() =>
        Math.max(
            1,
            ...this.bars()
                .map(bar => bar.value ?? 0)
                .filter(Boolean),
        ),
    );

    protected height(value: number): number {
        return Math.max(4, (value / this.highest()) * 100);
    }
}
