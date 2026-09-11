import { Component, computed, inject, signal } from '@angular/core';
import { type Mode } from '@core/criteria/criteria.types';
import { copyText } from '@shared/clipboard.utils';
import { ExportService } from '@state/export.service';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';

type Zone = 'stats' | 'dist' | 'baseline' | 'context';

/**
 * The drop zones: the metafile (required), the build folder, the previous measurement and the
 * project context (all optional).
 *
 * As soon as there is a report they fold into a single status line with their buttons, so the
 * report starts at the top. The file `input`s are outside that fold: both modes share them.
 */
@Component({
    selector: 'app-intake-page',
    templateUrl: './intake.page.html',
    styleUrl: './intake.page.scss',
})
export class IntakePageComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);
    private readonly exports = inject(ExportService);

    // * ATTRIBUTES
    /** Which zone a drag is hovering, so only that one highlights. */
    protected readonly dragging = signal<Zone | null>(null);
    protected readonly expandedByUser = signal(false);
    /** "Copied" on the diagnostics button, back to its label after a moment. */
    protected readonly copiedDiagnostics = signal(false);
    private readonly distIssue = signal<'empty' | 'unsupported' | null>(null);

    /** Folded as soon as there is a report, unless the person asks to see the zones. */
    protected readonly compact = computed(() => !!this.store.analysis() && !this.expandedByUser());

    protected readonly statsStatus = computed(() => {
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
        return this.store.derived()
            ? t.statsFromFolder(info.name, info.outputs)
            : t.statsLoaded(info.name, info.outputs);
    });

    protected readonly distStatus = computed(() => {
        const t = this.i18n.ui();
        // Walking the import graph is the one wait that freezes the page — about a second on a big
        // application — so it is the one that most needs saying out loud. See
        // `scripts/measure-analysis.mjs` for why it is this half and not the compressing.
        if (this.store.phase() === 'read') {
            return t.distReading;
        }

        const progress = this.store.progress();
        if (progress) {
            return t.distWorking(progress.done, progress.total);
        }
        if (this.store.working()) {
            return t.distWorking(0, 0);
        }

        const issue = this.distIssue();
        if (issue) {
            return issue === 'empty' ? t.distNoFiles : t.distNoApi;
        }

        const files = this.store.distFiles();
        if (!files) {
            return t.distIdle;
        }

        const maps = this.store.mapFiles();
        const parts = [maps ? t.distLoadedMaps(files, maps) : t.distLoaded(files)];
        if (this.store.hasBrotli()) {
            parts.push(t.distLoadedBrotli);
        }
        // Saying the page was read is what explains why the round trips of the first load are
        // there. Its absence is explained where the figure would be, in the screens tab.
        if (this.store.announced()) {
            parts.push(t.distLoadedIndex);
        }
        return parts.join(' · ');
    });

    /** In the compact bar what matters is the state of the figures, not of the folder. */
    protected readonly compactDist = computed(() => {
        if (this.store.working() || this.distIssue()) {
            return this.distStatus();
        }

        const t = this.i18n.ui();
        return this.store.compressed() ? t.intakeCompressed(this.store.unit()) : t.intakeRaw;
    });

    /**
     * Raw figures are not one more fact on a line of middle dots: they are the most important
     * caveat on the page. Without the folder every number the reader is looking at is well above
     * what people actually download, and that used to be grey text with the same weight as
     * "baseline: prev.json".
     */
    protected readonly distTone = computed(() => {
        if (this.distIssue()) {
            return 'error';
        }
        // Only once there is a report: before one is loaded there are no figures to be wrong about,
        // and an orange line on an empty page is a warning about nothing.
        const raw = !!this.store.analysis() && !this.store.compressed() && !this.store.working();
        return raw ? 'warn' : null;
    });

    protected readonly baselineStatus = computed(() => {
        const t = this.i18n.ui();
        if (this.store.baselineWorking()) {
            return t.baselineWorking;
        }

        const error = this.store.baselineError();
        if (error) {
            return t.baselineError(error);
        }

        const baseline = this.store.baseline();
        if (!baseline) {
            return t.baselineIdle;
        }
        if (this.store.comparisonBlocked()) {
            return t.baselineModeMismatch;
        }

        const units: Record<Mode, string> = { raw: t.unitRaw, gzip: t.unitGzip, brotli: t.unitBrotli };
        const mode = units[baseline.mode];
        return t.baselineLoaded(baseline.name, mode, baseline.screens.length);
    });

    protected readonly baselineTone = computed(() =>
        this.store.baselineError() || this.store.comparisonBlocked() ? 'error' : null,
    );

    protected readonly contextStatus = computed(() => {
        const t = this.i18n.ui();
        const info = this.store.contextInfo();
        if (!info) {
            return t.contextIdle;
        }

        const parts = [];
        if (info.files.length > 0) {
            parts.push(t.contextLoaded(info.files));
        }
        if (info.ignored.length > 0) {
            parts.push(t.contextIgnored(info.ignored));
        }
        return parts.join(' · ');
    });

    protected readonly contextTone = computed(() => {
        const info = this.store.contextInfo();
        return info && info.files.length === 0 ? 'error' : null;
    });

    /** The shape of what was loaded, with every path hashed: what a failure can be reported with. */
    protected async copyDiagnostics(): Promise<void> {
        if (!(await copyText(this.exports.diagnostics()))) {
            return;
        }

        this.copiedDiagnostics.set(true);
        setTimeout(() => this.copiedDiagnostics.set(false), 1800);
    }

    protected onDragOver(event: DragEvent, zone: Zone): void {
        event.preventDefault();
        event.stopPropagation();
        this.dragging.set(zone);
    }

    /**
     * A drop goes to the zone it landed on. Files are still sniffed: `angular.json` dropped on the
     * stats zone is context, and a Loadline export dropped anywhere is a baseline.
     */
    protected onDrop(event: DragEvent, zone: Zone): void {
        event.preventDefault();
        event.stopPropagation();
        this.dragging.set(null);

        const files = [...(event.dataTransfer?.files ?? [])];
        if (files.length === 0) {
            return;
        }

        if (zone === 'context') {
            void this.store.loadContext(files);
        } else {
            void this.store.loadAny(files, zone === 'baseline');
        }
    }

    protected onStats(event: Event): void {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
            void this.store.loadStats(file);
        }
    }

    protected onBaseline(event: Event): void {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (file) {
            void this.store.loadBaseline(file);
        }
    }

    protected onBaselineDist(event: Event): void {
        const input = event.target as HTMLInputElement;
        const files = input.files;
        if (files?.length) {
            void this.store.loadBaselineDist(files);
        }
        input.value = '';
    }

    protected onContext(event: Event): void {
        const input = event.target as HTMLInputElement;
        const files = input.files;
        if (files?.length) {
            void this.store.loadContext([...files]);
        }
        // Choosing the same file again has to fire `change` again.
        input.value = '';
    }

    protected onDist(event: Event): void {
        const files = (event.target as HTMLInputElement).files;
        if (!files?.length) {
            return;
        }

        this.distIssue.set(null);
        void this.store.loadDist(files).then(result => {
            this.distIssue.set(result === 'ok' ? null : result);
        });
    }

    /**
     * The folder through the picker that can hold on to it. Only offered where that is real: see
     * `canPickFolder`. Cancelling the dialog is not a failure and says nothing.
     */
    protected pickDist(): void {
        this.distIssue.set(null);
        void this.store.pickDist().then(result => {
            this.distIssue.set(result === 'ok' || result === 'cancelled' ? null : result);
        });
    }

    /** The same folder again, after a rebuild. */
    protected reread(): void {
        this.distIssue.set(null);
        void this.store.rereadDist().then(result => {
            this.distIssue.set(result === 'ok' || result === 'cancelled' ? null : result);
        });
    }

    /**
     * Removing what was loaded. The `input` is emptied as well, so choosing the very same file
     * again still fires `change` and loads it back.
     */
    protected removeStats(): void {
        this.store.clearStats();
        this.distIssue.set(null);
        this.expandedByUser.set(false);
        this.reset('statsInput');
        this.reset('distInput');
    }

    protected removeDist(): void {
        this.store.clearDist();
        this.distIssue.set(null);
        this.reset('distInput');
    }

    private reset(inputId: string): void {
        const input = document.querySelector<HTMLInputElement>(`#${inputId}`);
        if (input) {
            input.value = '';
        }
    }

    /** The `label` acts as a button, so it has to respond to the keyboard. */
    protected activate(event: KeyboardEvent, inputId: string): void {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        document.querySelector<HTMLInputElement>(`#${inputId}`)?.click();
    }
}
