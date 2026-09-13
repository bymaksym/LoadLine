import { computed, inject, Service, signal } from '@angular/core';
import { analyze } from '../core/analysis/analysis';
import { isMetafile } from '../core/analysis/metafile.types';
import { type Build, compareBuilds } from '../core/multi/compare-builds';
import { I18nService } from './i18n.service';
import { ReportStore } from './report.store';
import { errorMessage } from './report-messages.utils';

/**
 * The applications being compared with each other.
 *
 * A store of its own, and that is the whole design. `ReportStore` is **one** report — one
 * `stats.json`, one folder, one baseline — and the idea's own warning was that turning it into a
 * list is a block, while bolting a second one on badly is a second path through the analysis that
 * drifts from the first. Neither happens here: every build in this list went through the same
 * `analyze()` as the one on screen, and this holds nothing but the results and the crossing of
 * them. The report on screen does not know this exists.
 *
 * Raw figures only. A `stats.json` has no folder next to it to compress, so there is nothing to
 * compare in gzip; saying "raw" out loud is cheaper than a comparison in two different units.
 */
@Service()
export class CompareStore {
    // * SERVICES
    private readonly report = inject(ReportStore);
    private readonly i18n = inject(I18nService);

    // * ATTRIBUTES
    readonly builds = signal<Build[]>([]);
    readonly error = signal<string | null>(null);

    /** The matrix. Empty below two builds: one application is not a comparison with itself. */
    readonly report$ = computed(() => compareBuilds(this.builds()));

    readonly count = computed(() => this.builds().length);

    /**
     * Adds one or more `stats.json` files. Each one is analysed exactly as a dropped report is.
     *
     * A file that is not a metafile is named in the error rather than dropped in silence: with five
     * files going in at once, "one of these was not a build" has to say which one.
     */
    async add(files: Iterable<File>): Promise<void> {
        const added: Build[] = [];
        const rejected: string[] = [];

        for (const file of files) {
            try {
                const parsed: unknown = JSON.parse(await file.text());
                if (!isMetafile(parsed)) {
                    throw new Error('NO_OUTPUTS');
                }

                added.push({ name: this.nameFor(file, added), analysis: analyze(parsed, null) });
            } catch {
                rejected.push(file.name);
            }
        }

        if (added.length > 0) {
            this.builds.update(current => [...current, ...added]);
        }
        this.error.set(rejected.length > 0 ? this.i18n.ui().compareRejected(rejected) : null);
    }

    /**
     * The build already on screen, added to the comparison.
     *
     * It is asked for rather than automatic: the report and the comparison are two different
     * questions, and one of them quietly seeding the other is how somebody ends up comparing five
     * applications against a sixth they forgot was there.
     */
    addCurrent(): void {
        const analysis = this.report.analysis();
        if (!analysis) {
            return;
        }

        const name = this.report.statsInfo()?.name ?? 'stats.json';
        this.builds.update(current => [...current, { name: this.nameFor({ name }, current), analysis }]);
        this.error.set(null);
    }

    remove(index: number): void {
        this.builds.update(current => current.filter((_, i) => i !== index));
    }

    clear(): void {
        this.builds.set([]);
        this.error.set(null);
    }

    /**
     * What to call a build in the table.
     *
     * Five applications exported by five pipelines are five files called `stats.json`, and five
     * columns with the same heading are five columns nobody can tell apart. The folder above the
     * file is used when there is one, and a number is added when even that repeats.
     */
    private nameFor(file: { name: string; webkitRelativePath?: string }, alreadyAdded: readonly Build[]): string {
        const folder = file.webkitRelativePath?.split('/', 1)[0];
        const base = folder || file.name.replace(/\.json$/i, '');
        const taken = new Set([...this.builds(), ...alreadyAdded].map(build => build.name));
        if (!taken.has(base)) {
            return base;
        }

        let n = 2;
        while (taken.has(`${base} (${n})`)) {
            n++;
        }
        return `${base} (${n})`;
    }

    /** For the message when a file could not be read at all, in the words the rest of the page uses. */
    describe(error: unknown): string {
        return errorMessage(error, this.i18n.ui());
    }
}
