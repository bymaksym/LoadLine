import { afterNextRender, Component, computed, type ElementRef, inject, signal, viewChild } from '@angular/core';
import { type Zone } from '@core/analysis/analysis.types';
import { type BlastRadius, blastRadiusOf } from '@core/analysis/blast';
import { queryIndex } from '@core/analysis/search';
import { type SearchResult } from '@core/analysis/search.types';
import { baseName, chainSteps, projectFolderOf } from '@core/format/format.utils';
import { pct } from '@core/i18n/ui-strings';
import { ChainComponent } from '@shared/chain/chain';
import { ExplainComponent } from '@shared/explain/explain';
import { PathTreeComponent } from '@shared/path-tree/path-tree';
import { BytesPipe } from '@shared/pipes/bytes.pipe';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';
import { PanelHeaderComponent } from '../panel-header/panel-header';
import { revealOnFocus } from '../reveal-on-focus.utils';

/** How many names the tab shows before anything is typed. */
const HEAVIEST = 10;

/**
 * The global search: a name in, and where it is in the bundle out.
 *
 * It is the only view driven by what the person is looking for instead of by what is heavy, so it
 * opens on the heaviest handful rather than on everything — or on nothing, which is what it used
 * to do.
 */
@Component({
    selector: 'app-search-tab',
    templateUrl: './search-tab.html',
    styleUrl: './search-tab.scss',
    imports: [PanelHeaderComponent, BytesPipe, PathTreeComponent, ChainComponent, ExplainComponent],
})
export class SearchTabComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);
    protected readonly nav = inject(ReportNav);

    // * ATTRIBUTES
    private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');
    /**
     * What is being looked for, started from the address and written back to it.
     *
     * A link to this tab is a link to a search box; a link to `#search?q=lodash` is the thing
     * somebody was actually pointing at, which is what makes a report shareable at all.
     */
    protected readonly query = signal(this.nav.param('q'));

    /** Typing writes the address, so the back button leaves the tab rather than the last keystroke. */
    protected search(value: string): void {
        this.query.set(value);
        this.nav.setParam('q', value);
    }
    protected readonly expanded = signal<string | null>(null);

    protected readonly index = computed(() => this.store.searchIndex());

    private readonly results = computed<SearchResult[]>(() => queryIndex(this.index(), this.query()));

    /** Which list is on screen: what was searched for, or the heaviest names as a starting point. */
    protected readonly showing = computed<'results' | 'heaviest'>(() =>
        this.query().trim().length === 0 ? 'heaviest' : 'results',
    );

    /**
     * The rows drawn. With nothing typed those are the ten heaviest names in the bundle: the tab
     * used to open on a blank page with a single line saying how many names there were to search,
     * and the ten anybody would look at first are already in the index.
     */
    protected readonly rows = computed<SearchResult[]>(() =>
        this.showing() === 'heaviest'
            ? this.index()
                  .entries.toSorted((a, b) => b.bytes - a.bytes)
                  .slice(0, HEAVIEST)
            : this.results(),
    );

    protected readonly status = computed(() => {
        const text = this.query().trim();
        if (text.length < 2) {
            return '';
        }

        const t = this.i18n.ui();
        return t.searchFound(this.results().length, this.store.searchMatches(text));
    });

    constructor() {
        // A signal can hand a name over: "search it in the bundle" fills the box and opens the row.
        revealOnFocus('search', key => {
            this.query.set(key);
            this.expanded.set(key);
        });

        // The tab does one thing, and it used to open with the cursor nowhere near the box.
        afterNextRender(() => this.box()?.nativeElement.focus());
    }

    /**
     * A name split around what was searched for, so the match can be marked. Three long paths that
     * all contain `primeng` somewhere are three paths to scan by eye without this.
     */
    protected parts(text: string): { before: string; hit: string; after: string } {
        const query = this.query().trim();
        const at = query.length >= 2 ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
        if (at < 0) {
            return { before: text, hit: '', after: '' };
        }

        return {
            before: text.slice(0, at),
            hit: text.slice(at, at + query.length),
            after: text.slice(at + query.length),
        };
    }

    protected toggle(row: SearchResult): void {
        this.expanded.set(this.expanded() === row.key ? null : row.key);
    }

    /**
     * The name the bootstrap tab uses for this result. It groups npm code by package and project
     * code by project folder, so a file has to hand over its folder: asking for the file path would
     * land on a row that does not exist there.
     */
    protected bootKey(row: SearchResult): string {
        return row.kind === 'package' ? row.key : projectFolderOf(row.key);
    }

    /** A chain of raw paths as readable steps. `null` when there is no chain to show. */
    /**
     * What touching this file costs: which chunks it invalidates and who re-downloads them.
     *
     * It is the question that follows every finding — "is this change small?" — and the answer is
     * not about the file. One line changed in a file inside the bootstrap chunk is re-downloaded by
     * everybody who had the previous build; the same line in a file one screen loads costs the
     * people who open that screen.
     */
    protected blast(row: SearchResult): BlastRadius | null {
        const analysis = this.store.analysis();
        // Only for a file. A package lands in as many chunks as it has files, and "changing lodash"
        // is not a thing anybody does — the question is about a file somebody is about to edit.
        return analysis && row.kind === 'file' ? blastRadiusOf(analysis, row.key) : null;
    }

    /** For the cascade line: whether what it reaches on top is, between the two, every screen there is. */
    protected screenCount(): number {
        return this.store.analysis()?.screens.length ?? 0;
    }

    protected readonly pct = pct;

    /** Output paths carry the build folder; the cascade line is about the file, not the folder. */
    protected readonly fileName = baseName;

    protected steps(chain: string[] | null): string[] | null {
        return chain ? chainSteps(chain) : null;
    }

    protected zoneLabel(zone: Zone): string {
        const t = this.i18n.ui();
        const labels: Record<Zone, string> = { boot: t.treeBoot, shared: t.treeShared, own: t.treeOwn };
        return labels[zone];
    }
}
