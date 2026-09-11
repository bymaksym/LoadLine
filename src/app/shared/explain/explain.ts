import { Component, computed, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { I18nService } from '@state/i18n.service';

/** One id per instance, so a bubble and the thing it describes can point at each other. */
let counter = 0;

/**
 * Where a figure comes from: what was added up, what was left out, which threshold picked the
 * colour — said next to the figure, and reachable.
 *
 * This is the control the interface review left open. Sixty explanations lived in `title`
 * attributes, and a `title` does not exist on a touch screen, depends on the browser with a
 * keyboard, and cannot be read by somebody who does not know it is there. The audience is
 * developers, and the first reflex in front of a figure that looks wrong is not to believe it: a
 * tool that shows its arithmetic gets argued with, one that does not gets closed.
 *
 * It is deliberately one component used everywhere rather than a panel per view. The rule the
 * design review holds this page to is that the net balance of new controls stays near zero, and
 * sixty bespoke tooltips would break it sixty times over; one control, always the same shape,
 * always in the same place relative to what it explains, is a thing somebody learns once.
 *
 * The label it explains is projected, so the markup around it stays what it was: a table header, a
 * legend entry, a figure in a tile.
 */
@Component({
    selector: 'app-explain',
    template: `
        <ng-content />
        <button
            class="explain__btn"
            type="button"
            [attr.aria-controls]="id"
            [attr.aria-expanded]="open()"
            (click)="toggle($event)"
        >
            <span aria-hidden="true">?</span>
            <span class="sr-only">{{ label() }}</span>
        </button>
        @if (open()) {
            <span #bubble class="explain__bubble" role="tooltip" [id]="id">{{ text() }}</span>
        }
    `,
    styles: `
        :host {
            position: relative;
            display: inline;
        }

        /*
         * A small mark riding after the label. It is faint until the pointer or the caret is on the
         * thing it belongs to: sixty of these at full strength would be sixty things competing with
         * the figures they explain.
         */
        .explain__btn {
            cursor: help;

            width: 1.05em;
            height: 1.05em;
            margin-left: 0.25em;
            padding: 0;
            border: 1px solid currentcolor;
            border-radius: 50%;

            font: inherit;
            font-family: var(--font-ui);
            font-size: 0.75em;
            font-weight: 600;
            line-height: 1;
            color: inherit;
            vertical-align: baseline;

            opacity: 0.45;
            background: none;
        }

        :host(:hover) .explain__btn,
        .explain__btn:focus-visible,
        .explain__btn[aria-expanded='true'] {
            color: var(--accent);
            opacity: 1;
        }

        .explain__btn:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 2px;
        }

        /*
         * The explanation itself. It is absolutely positioned inside the host rather than put in the
         * top layer, so it stays anchored to the label without needing anchor positioning — which is
         * the one part of this that is not the same in every browser this tool has to open in.
         */
        .explain__bubble {
            position: absolute;
            z-index: 30;
            top: calc(100% + 0.35rem);
            left: 0;

            display: block;

            width: max-content;
            max-width: min(34rem, 70vw);
            padding: 0.5rem 0.7rem;
            border: 1px solid var(--line-strong);
            border-radius: var(--radius);

            font-family: var(--font-ui);
            font-size: var(--fs-body);
            font-weight: 400;
            line-height: 1.5;
            color: var(--ink);
            text-align: left;
            text-transform: none;
            letter-spacing: normal;
            /* Some explanations are two paragraphs: a rule, and what moves it. The break is kept
               without the text having to carry any markup. */
            white-space: pre-line;

            background: var(--surface);
            box-shadow: var(--shadow);
        }

        /*
         * Where it ends up sideways is not decided here. A mark in the last column of a wide table
         * needs the bubble to grow leftwards and one in the first column does not, and which is
         * which depends on the width of the window at the moment it opens — so it is measured on
         * open and shifted, below. The rule this replaced was an input set by hand at each call
         * site, and it was wrong in eleven places at 1425 px and in most of them at 760 px.
         */
    `,
    host: {
        // Escape closes it, and so does a press anywhere else: the same two gestures every
        // dismissable thing on the web has, so nothing here has to be learnt.
        '(keydown.escape)': 'close()',
        '(document:pointerdown)': 'closeIfOutside($event)',
    },
})
export class ExplainComponent {
    // * SERVICES
    private readonly i18n = inject(I18nService);
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

    // * INPUTS
    /** The explanation. Plain text: it is a sentence about a figure, not a document. */
    readonly text = input.required<string>();

    // * VIEW
    private readonly bubble = viewChild<ElementRef<HTMLElement>>('bubble');

    // * ATTRIBUTES
    protected readonly id = `explain-${++counter}`;
    protected readonly open = signal(false);

    constructor() {
        // The bubble exists only while it is open, so this runs once per opening: measure where it
        // landed, and slide it back inside the window if it hung off an edge. Writing the style
        // here rather than binding a signal is deliberate — the measurement has to be of the
        // unshifted box, and a binding would already have applied the previous shift to it.
        effect(() => {
            const el = this.bubble()?.nativeElement;
            if (!el) {
                return;
            }

            el.style.transform = '';
            const box = el.getBoundingClientRect();
            const room = document.documentElement.clientWidth;

            // Enough that the bubble does not sit flush against the edge of the window.
            const margin = 8;
            const overhang = box.right > room - margin ? room - margin - box.right : 0;
            // A bubble wider than the window is clamped to the left edge instead of pushed past it:
            // the start of the sentence is the half worth keeping.
            const shift = box.left + overhang < margin ? margin - box.left : overhang;

            el.style.transform = shift ? `translateX(${Math.round(shift)}px)` : '';
        });
    }

    /** What the button announces: the question it answers, with what it is about. */
    protected readonly label = computed(() => this.i18n.ui().explainBtn);

    protected toggle(event: Event): void {
        // The mark often sits inside a row or a header that is itself a button. Explaining a figure
        // is not asking for the row to open or the table to re-sort.
        event.stopPropagation();
        this.open.set(!this.open());
    }

    protected close(): void {
        this.open.set(false);
    }

    protected closeIfOutside(event: Event): void {
        if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
            this.open.set(false);
        }
    }
}
