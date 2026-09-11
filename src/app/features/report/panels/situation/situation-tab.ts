import { Component, computed, inject } from '@angular/core';
import { writeConfig } from '@core/config/loadline-config';
import { formatCount } from '@core/format/format.utils';
import {
    deploysPerWeek,
    importsChannel,
    invalidationsPerWeek,
    isStaleSituation,
    QUESTIONS,
    returningShare,
    sessionBreadth,
    SITUATION_FRESH_DAYS,
} from '@core/situation/situation';
import { type Question, type RawKey, type SituationKey } from '@core/situation/situation.types';
import { download } from '@shared/download.utils';
import { ExplainComponent } from '@shared/explain/explain';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';
import { SituationService } from '@state/situation.service';
import { PanelHeaderComponent } from '../panel-header/panel-header';

/**
 * The five questions, and the raw controls next to them.
 *
 * Two decisions about the form are worth stating, because both were the other way round first:
 *
 * **The words come first and the number second.** People know "we ship most days"; almost nobody
 * knows their releases per week without looking it up. Asking for the figure first produces either
 * a guess typed with two decimal places or an empty form, and the guess is worse — it arrives
 * looking like a measurement. So the bands are the question and the figures are an option, sitting
 * next to them for whoever has the query open in another window.
 *
 * **Every question says what it is really asking.** Under each one is the metric it stands for and
 * where to find it. That is what stops the form being a personality quiz: an answer nobody can
 * check is an answer nobody should be moving a colour with, and naming the query makes it
 * checkable later even when it was picked from memory today.
 */
@Component({
    selector: 'app-situation-tab',
    templateUrl: './situation-tab.html',
    styleUrl: './situation-tab.scss',
    imports: [PanelHeaderComponent, ExplainComponent],
})
export class SituationTabComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly situation = inject(SituationService);
    protected readonly store = inject(ReportStore);
    protected readonly nav = inject(ReportNav);

    // * CONSTANTS
    protected readonly questions = QUESTIONS;
    protected readonly total = QUESTIONS.length;
    protected readonly freshDays = SITUATION_FRESH_DAYS;

    /**
     * The multiplication the middle two questions exist to produce, as three strings.
     *
     * `null` while either half is missing, which is the state the report has been in all along and
     * is not a failure — the copy for it says what is missing rather than showing a zero.
     */
    protected readonly cost = computed(() => {
        const situation = this.situation.situation();
        const perWeek = invalidationsPerWeek(situation);
        if (perWeek === null) {
            return null;
        }

        return {
            deploys: formatCount(deploysPerWeek(situation) ?? 0),
            returning: `${Math.round((returningShare(situation) ?? 0) * 100)} %`,
            perWeek: formatCount(perWeek),
        };
    });

    protected readonly breadth = computed(() => sessionBreadth(this.situation.situation()));

    protected readonly stale = computed(() =>
        isStaleSituation(this.situation.situation(), new Date().toISOString().slice(0, 10)),
    );

    /**
     * Whether this question is answered with this option.
     *
     * **`unknown` is never one.** It is the starting value of all five, so asking whether the value
     * equals the option drew "I don't know" as the chosen answer on a form nobody had touched —
     * next to a counter that said "unanswered". Both cannot be true, and the model settles which:
     * nothing downstream tells "nobody looked" from "somebody said they do not know", so the page
     * must not either. What the button does instead is take an answer back.
     */
    protected picked(key: SituationKey, option: string): boolean {
        return option !== 'unknown' && this.situation.situation()[key] === option;
    }

    /** Whether this question is still open, which is what the row has to say now that no option does. */
    protected open(key: SituationKey): boolean {
        return this.situation.situation()[key] === 'unknown';
    }

    protected label(key: SituationKey, option: string): string {
        return this.i18n.ui().sitOption[key][option] ?? option;
    }

    /** The raw figure of a question, as the input shows it. Empty when nobody typed one. */
    protected rawValue(key: RawKey): number | string {
        return this.situation.situation()[key] ?? '';
    }

    protected setRaw(key: RawKey, event: Event): void {
        const raw = (event.target as HTMLInputElement).value;
        this.situation.setRaw(key, raw.trim() === '' ? null : Number(raw));
    }

    /**
     * Whether the fourth question is being asked at all.
     *
     * With RUM it is not. The p75 of protocol and round trip is already being collected from real
     * sessions, and a band picked from memory is strictly worse than a figure they have — so the
     * options are replaced by the sentence saying where to get it.
     */
    protected asksConnection(): boolean {
        return !importsChannel(this.situation.situation());
    }

    protected onWho(event: Event): void {
        this.situation.setWho((event.target as HTMLInputElement).value);
    }

    protected onWhen(event: Event): void {
        this.situation.setWhen((event.target as HTMLInputElement).value);
    }

    protected onRum(event: Event): void {
        this.situation.setRum((event.target as HTMLInputElement).checked);
    }

    protected trackQuestion(_index: number, question: Question): string {
        return question.key;
    }

    /**
     * The answers as the file the command reads.
     *
     * Only the situation block goes in: this page does not know what else the project's own
     * `loadline.json` says, and writing a whole file from here would silently drop somebody's
     * gates and acceptances. It is a block to merge, and the button says so.
     */
    protected export(): void {
        download('loadline.json', writeConfig({ situation: this.situation.situation() }), 'application/json');
    }
}
