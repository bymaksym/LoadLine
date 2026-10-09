import { computed, inject, Service, signal } from '@angular/core';
import { toolLabel } from '../core/analysis/tool';
import { blindBoot } from '../core/whatif/defer';
import { I18nService } from './i18n.service';
import { ReportStore } from './report.store';

/**
 * Which of the two screens is on: the front page, where files are loaded, or the report.
 *
 * With nothing loaded there is only the front page. Once there is a report it takes the screen, and
 * the front page comes back on request — from the mark or the build chip in the header — instead of
 * sitting folded above the report as a second set of controls for the same files.
 */
@Service()
export class HomeService {
    // * SERVICES
    private readonly i18n = inject(I18nService);
    private readonly store = inject(ReportStore);

    // * ATTRIBUTES
    private readonly asked = signal(false);

    /** The front page is on when there is no report, or when somebody asked for it. */
    readonly open = computed(() => !this.store.analysis() || this.asked());

    /**
     * Which build the figures are about, in one line: the header chip and the front page both
     * say it, and it used to be worked out in the front page only.
     */
    readonly statsStatus = computed(() => {
        const t = this.i18n.ui();
        const error = this.store.error();
        if (error) {
            return t.statsError(error);
        }

        const info = this.store.statsInfo();
        if (!info) {
            return t.statsIdle;
        }
        // The example is real analysis of a build that does not exist. Saying which build a figure
        // is about is the whole job of this line, and here the answer is "not yours".
        if (this.store.isSample()) {
            return t.sampleLoaded(info.outputs);
        }

        // Saying where the graph came from is not decoration: read from the folder it is the
        // chunks talking, and what a chunk carries inside is only known if the maps were there.
        // Without the maps it says so here, where the report starts, and not only in a card further
        // down: every "—" in the savings column depends on it.
        const analysis = this.store.analysis();
        const line = this.store.derived()
            ? t.statsFromFolder(info.name, info.outputs, !!analysis && blindBoot(analysis))
            : t.statsLoaded(info.name, info.outputs);
        // What wrote it, as the command's lead says it: proper names, the same in both languages.
        const tool = analysis ? toolLabel(analysis.tool) : null;
        return tool ? `${line} · ${tool}` : line;
    });

    show(): void {
        this.asked.set(true);
    }

    /** Back to the report. Loading a new build lands there too: see the intake page. */
    hide(): void {
        this.asked.set(false);
    }
}
