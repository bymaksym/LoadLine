import { Component, inject, input } from '@angular/core';
import { I18nService } from '@state/i18n.service';

/**
 * An import chain, drawn: `main.ts › app.config.ts › chart.js`, last step in bold.
 *
 * The same eight lines of markup lived in the search tab and in the bootstrap tab, and the question
 * they answer — "why is this here" — is the one that follows every finding in the report, wherever
 * it is read. One component is what lets the tree and the screens table answer it too without a
 * third copy drifting from the first two.
 *
 * It takes the steps rather than a name because two callers already have them computed: the search
 * index carries the chain of every entry, and a duplicate carries one per copy. Resolving a name is
 * `whyHere()` in the core, and it is the caller that knows which of the two it holds.
 */
@Component({
    selector: 'app-chain',
    template: `
        @if (steps(); as chain) {
            <p class="chain">
                @for (step of chain; track $index; let last = $last) {
                    <span class="mono" [class.chain__end]="last">{{ step }}</span>
                    @if (!last) {
                        <span aria-hidden="true" class="chain__sep">›</span>
                    }
                }
            </p>
        } @else {
            <p class="chain muted">{{ none() || i18n.ui().searchChainNone }}</p>
        }
    `,
    styles: `
        :host {
            display: block;
        }

        /* One step per file, the last one in bold. Wraps as a paragraph rather than scrolling. */
        .chain {
            margin: 0 0 0.4rem;
            font-size: var(--fs-body);
            line-height: 1.7;
            overflow-wrap: anywhere;
        }

        .chain__sep {
            margin: 0 0.35rem;
            font-weight: 700;
            color: var(--muted);
        }

        .chain__end {
            font-weight: 700;
        }
    `,
})
export class ChainComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);

    // * INPUTS
    /** The chain as readable steps. `null` when nothing reaches this name from the entry point. */
    readonly steps = input.required<string[] | null>();
    /** What to say instead when there is no chain. The general sentence when nothing is given. */
    readonly none = input('');
}
