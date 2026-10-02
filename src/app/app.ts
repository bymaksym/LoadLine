import { Component, inject } from '@angular/core';
import { type EmbeddedBuild, filesOf, isEmbeddedBuild } from './core/intake/embedded';
import { IntakePageComponent } from './features/intake/intake.page';
import { PaletteComponent } from './features/palette/palette';
import { ReportPageComponent } from './features/report/report.page';
import { DensityService } from './state/density.service';
import { I18nService } from './state/i18n.service';
import { PaletteService } from './state/palette.service';
import { ReportStore } from './state/report.store';
import { ThemeService } from './state/theme.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.html',
    styleUrl: './app.scss',
    imports: [IntakePageComponent, ReportPageComponent, PaletteComponent],
})
export class App {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly theme = inject(ThemeService);
    protected readonly density = inject(DensityService);
    protected readonly palette = inject(PaletteService);
    protected readonly store = inject(ReportStore);

    constructor() {
        // A page written by `loadline --html` carries its build inside it: it opens on the report,
        // in the language the command was asked for, with nothing to drag in.
        const build = embeddedBuild();
        if (!build) {
            return;
        }

        this.i18n.use(build.lang);
        void loadEmbedded(this.store, build);
    }
}

/**
 * The files go in through the same doors a drop uses — the context, the lock, the audit and
 * `loadline.json` first, then the stats, the folder and the baseline — so the page analyses the same
 * bytes the command did and cannot disagree with it.
 */
const loadEmbedded = async (store: ReportStore, build: EmbeddedBuild): Promise<void> => {
    await store.loadAny(build.extras.map(file => new File([file.text], file.name)));
    if (build.stats) {
        await store.loadStats(new File([build.stats.text], build.stats.name));
    }
    if (build.folder) {
        await store.loadDist(filesOf(build.folder));
    }
    if (build.baseline) {
        await store.loadBaseline(new File([build.baseline.text], build.baseline.name));
    }
};

/** The build `loadline --html` wrote into this page, or `null` for the page as it ships. */
const embeddedBuild = (): EmbeddedBuild | null => {
    const text = document.querySelector('#loadline-build')?.textContent;
    if (!text) {
        return null;
    }
    try {
        const parsed: unknown = JSON.parse(text);
        return isEmbeddedBuild(parsed) ? parsed : null;
    } catch {
        return null;
    }
};
