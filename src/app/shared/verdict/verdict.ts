import { Component, computed, inject, input } from '@angular/core';
import { type Verdict } from '@core/criteria/criteria.types';
import { I18nService } from '@state/i18n.service';

/**
 * Rating tag: "good", "fair" or "bad", with the applied criterion on hover.
 * The colour accompanies, but the word is what informs: nothing relies on colour alone.
 *
 * This is the one badge on the page that keeps its `title` rather than taking the explain mark
 * every other rated figure now carries, and the reason is structural: it is only ever drawn inside
 * a summary tile, and a tile is a `button`. A `button` inside a `button` is reparented by the HTML
 * parser, so the mark cannot go here. The rules those tiles are coloured by are written out once
 * instead, in the line of metadata above them, which is not inside any control.
 */
@Component({
    selector: 'app-verdict',
    template: '<span class="tag" [class]="\'tag \' + cls()" [title]="hint()">{{ label() }}</span>',
    styles: `
        :host {
            display: inline-block;
        }
    `,
})
export class VerdictComponent {
    // * SERVICES
    private readonly i18n = inject(I18nService);

    // * INPUTS
    readonly verdict = input.required<Verdict>();
    /** The criterion in words ("Good up to 170 kB · …"). Shown as a tooltip. */
    readonly rule = input('');
    /**
     * What moves this particular figure, in one sentence. It joins the criterion in the tooltip
     * only when the rating is not good: on a green figure the answer to "how do I fix this" is
     * "nothing", and saying it anyway makes the tooltip less useful.
     */
    readonly advice = input('');

    protected readonly hint = computed(() => {
        const rule = this.rule();
        const advice = this.advice();
        if (!advice || this.verdict() === 'good') {
            return rule;
        }
        return rule ? `${rule}\n\n${advice}` : advice;
    });

    protected readonly label = computed(() => {
        const t = this.i18n.ui();
        const verdict = this.verdict();
        if (verdict === 'good') {
            return t.verdictGood;
        }
        return verdict === 'ok' ? t.verdictOk : t.verdictBad;
    });

    protected readonly cls = computed(() => {
        const verdict = this.verdict();
        if (verdict === 'good') {
            return 'tag--ok';
        }
        return verdict === 'ok' ? 'tag--warn' : 'tag--crit';
    });
}
