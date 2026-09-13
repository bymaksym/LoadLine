import { Component, inject, input, signal } from '@angular/core';
import { I18nService } from '@state/i18n.service';

/**
 * Whether the "how to read this" note is open — one answer for the whole report, not one per tab.
 *
 * There are nine of these boxes and they used to be nine separate closed `details`: somebody who
 * wanted the reading notes had to open them again in every view, and somebody who did not want
 * them saw the same unopened box nine times. It is the same control answering the same question,
 * so it holds the same state. It lives for the session, which is as long as the report does.
 */
const helpOpen = signal(false);

/**
 * The opening of every panel: what the tab is, one line saying what it answers, and the collapsed
 * "how to read this" note. Nine panels rendered the same markup with three different strings.
 *
 * The host disappears from the layout (`display: contents`) so the panel's own spacing rules keep
 * applying to the header and the note as if they were written in place.
 */
@Component({
    selector: 'app-panel-header',
    template: `
        <div class="panel__head">
            <h2>{{ title() }}</h2>
            <p>{{ subtitle() }}</p>
        </div>

        <details class="howto" [open]="open()" (toggle)="open.set($any($event.target).open)">
            <summary>{{ i18n.ui().howTo }}</summary>
            <div class="howto__body" [innerHTML]="howTo()"></div>
        </details>
    `,
    styles: `
        :host {
            display: contents;
        }
    `,
})
export class PanelHeaderComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);

    // * ATTRIBUTES
    protected readonly open = helpOpen;

    // * INPUTS
    readonly title = input.required<string>();
    readonly subtitle = input.required<string>();
    /** The help text, already translated. It carries markup, so it is bound as HTML. */
    readonly howTo = input.required<string>();
}
