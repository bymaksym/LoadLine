import { Component, inject, input, signal } from '@angular/core';
import { I18nService } from '@state/i18n.service';

/**
 * The opening of every panel: what the tab is, the toggle for its "how to read this" note, and one
 * line saying what it answers. Twelve panels rendered the same markup with three different strings.
 *
 * The note is closed on every tab that opens. It used to be one open-or-closed answer for the whole
 * report, which left a paragraph about the previous tab's columns open over a tab that has none of
 * them; the toggle sits next to the title, one click away, on every tab.
 *
 * The host disappears from the layout (`display: contents`) so the panel's own spacing rules keep
 * applying to the header and the note as if they were written in place.
 */
@Component({
    selector: 'app-panel-header',
    template: `
        <div class="panel__head">
            <div class="panel__title">
                <h2>{{ title() }}</h2>
                <button
                    class="panel__help-btn"
                    type="button"
                    [attr.aria-controls]="noteId"
                    [attr.aria-expanded]="open()"
                    (click)="open.set(!open())"
                >
                    <span aria-hidden="true" class="panel__help-mark">?</span>{{ i18n.ui().howTo }}
                </button>
            </div>
            <p>{{ subtitle() }}</p>
        </div>

        <div class="panel__help" [hidden]="!open()" [id]="noteId" [innerHTML]="howTo()"></div>
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
    protected readonly open = signal(false);
    /** One panel is on screen at a time, so one id is enough for the toggle to point at its note. */
    protected readonly noteId = 'panel-help';

    // * INPUTS
    readonly title = input.required<string>();
    readonly subtitle = input.required<string>();
    /** The help text, already translated. It carries markup, so it is bound as HTML. */
    readonly howTo = input.required<string>();
}
