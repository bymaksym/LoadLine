import { inject, Service } from '@angular/core';
import { snapshotOf } from '../core/baseline/baseline';
import { diagnosticsOf } from '../core/diagnostics/diagnostics';
import { markdownTable } from '../core/export/markdown-table.utils';
import { download } from '../shared/download.utils';
import { I18nService } from './i18n.service';
import { ReportStore } from './report.store';

/**
 * What leaves the page: the snapshot, the thresholds, the table as Markdown, and the thirty lines
 * somebody can paste into a public issue.
 *
 * Apart from `ReportStore` for the same reason the history is: the store is what has been loaded
 * and what derives from it, and none of this derives from anything — it is the four shapes the
 * report takes on its way out. Keeping them there is what pushed that file past its own ceiling.
 */
@Service()
export class ExportService {
    // * SERVICES
    private readonly store = inject(ReportStore);
    private readonly i18n = inject(I18nService);

    /**
     * The thresholds in force, as the file the command reads with `--criteria`.
     *
     * They were editable here and readable there and there was no way across: somebody tuned the
     * criteria on this page and their pipeline went on judging the build by the recommended ones.
     * The whole set is written, not only what was changed, so the file pins every threshold
     * whatever unit the command ends up resolving; the name carries the unit it was written in.
     */
    criteria(): void {
        const mode = this.store.mode();
        download(`loadline-criteria-${mode}.json`, JSON.stringify(this.store.criteria(), null, 4), 'application/json');
    }

    /** The snapshot of what is shown, in the mode shown, as a file to keep next to the code. */
    snapshot(): void {
        const analysis = this.store.analysis();
        if (!analysis) {
            return;
        }

        // With the signals and the file names: the first is what lets the next report say which of
        // them are new, the second what lets it say what an update costs.
        const snapshot = snapshotOf(
            analysis,
            this.store.mode(),
            this.store.statsInfo()?.name ?? 'stats.json',
            new Date(),
            this.store.ownFindings(),
        );
        const day = snapshot.date.slice(0, 10);
        download(`loadline-${day}-${this.store.mode()}.json`, JSON.stringify(snapshot, null, 2), 'application/json');
    }

    /** The screens table as Markdown, with the delta column when there is a baseline. */
    markdown(): string {
        const analysis = this.store.analysis();
        return analysis ? markdownTable(analysis, this.store.comparison(), this.i18n.ui(), this.store.unit()) : '';
    }

    /**
     * The thirty lines somebody can paste into a public issue. It is the only way a failure here is
     * ever reproducible: the file that would explain it is the one thing nobody can send.
     */
    diagnostics(): string {
        return diagnosticsOf({
            meta: this.store.metafile(),
            analysis: this.store.analysis(),
            error: this.store.error(),
            derived: this.store.derived(),
            announced: this.store.announced(),
            mode: this.store.mode(),
            mapFiles: this.store.mapFiles(),
        });
    }
}
