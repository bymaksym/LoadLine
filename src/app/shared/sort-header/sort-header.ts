import { Component, computed, input, output } from '@angular/core';
import { ExplainComponent } from '../explain/explain';
import { type SortDir } from './sort.utils';

/**
 * A column header that sorts. It replaces the row of buttons the screens table used to carry above
 * it, and gives the other three tables an ordering they never had.
 *
 * It is an attribute component (`<th app-sort>`, `<span app-sort>`) so the markup around it stays
 * what it was: a real `th` inside a real `tr`, or a cell of the screens grid. The label is
 * projected, because a header can carry more than a word.
 *
 * What the column *means* used to be the second half of the sort button's `title`, so the only way
 * to read it was to hover a mouse over the control that re-sorts the table when pressed. It is now
 * its own mark next to the header, which is the same one every explained figure on the page has.
 */
@Component({
    selector: 'th[app-sort], span[app-sort]',
    template: `
        <button class="sort-th" type="button" [attr.title]="sortLabel()" (click)="pick.emit()">
            <ng-content />
            <span aria-hidden="true" class="sort-th__dir">{{ arrow() }}</span>
        </button>
        <!-- What the column means, outside the sort button rather than glued to its tooltip. -->
        @if (help(); as text) {
            <app-explain [text]="text" />
        }
    `,
    imports: [ExplainComponent],
    host: {
        '[attr.aria-sort]': 'ariaSort()',
        '[class.is-sorted]': 'active()',
    },
})
export class SortHeaderComponent {
    // * INPUTS
    readonly active = input(false);
    readonly dir = input<SortDir>('desc');
    /** What the column means. Joined with the invitation to sort, which is the other half. */
    readonly help = input('');
    /** "Sort by this column", already translated: this component holds no strings of its own. */
    readonly sortLabel = input.required<string>();

    // * OUTPUTS
    readonly pick = output<void>();

    /**
     * The arrow is drawn on every header, faint until the column is the one sorting: a mark that
     * only appears once you have already pressed is a mark that never invited the press.
     */
    protected readonly arrow = computed(() => (this.dir() === 'asc' ? '↑' : '↓'));

    protected readonly ariaSort = computed(() => {
        if (!this.active()) {
            return 'none';
        }
        return this.dir() === 'asc' ? 'ascending' : 'descending';
    });
}
