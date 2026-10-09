import { Component, computed, inject } from '@angular/core';
import { writeConfig } from '@core/config/loadline-config';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';

/**
 * The way past a page that starts the application in a way nothing here reads, without writing a
 * `loadline.json`: what `build.entries` says, asked for where the problem is said. It is applied the
 * way a dropped file is, so the folder is read again with it and an exported file carries it.
 */
@Component({
    selector: 'app-entry-form',
    templateUrl: './entry-form.html',
    styleUrl: './entry-form.scss',
})
export class EntryFormComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    private readonly store = inject(ReportStore);

    // * ATTRIBUTES
    /** The folder was read and its page names no script this reads: the one case this is for. */
    protected readonly noPage = computed(() => this.store.error()?.includes(this.i18n.ui().errNoPage) === true);

    // * METHODS
    protected setEntry(event: Event, value: string): void {
        event.preventDefault();
        const entry = value.trim();
        if (!entry) {
            return;
        }
        const config = this.store.config();
        const entries = [...(config?.build?.entries ?? []), entry];
        void this.store.applyConfig(writeConfig({ ...config, build: { ...config?.build, entries } }));
    }
}
