import { Component, computed, inject, input, signal } from '@angular/core';
import { type ChunkInfo, type ScreenCost } from '@core/analysis/analysis.types';
import { filesOfChunk } from '@core/analysis/path-tree';
import { type PathItem } from '@core/analysis/path-tree.types';
import { granularityOf } from '@core/analysis/shape';
import { whyHere } from '@core/analysis/why-here';
import { formatBytes } from '@core/format/format.utils';
import { ChainComponent } from '@shared/chain/chain';
import { copyText } from '@shared/clipboard.utils';
import { ExplainComponent } from '@shared/explain/explain';
import { PathTreeComponent } from '@shared/path-tree/path-tree';
import { BytesPipe } from '@shared/pipes/bytes.pipe';
import { I18nService } from '@state/i18n.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';

/**
 * What one screen is made of, under its row: where it comes from, why it is in the build, the three
 * parts of its total, how many round trips it takes and which chunks it pulls.
 *
 * A component of its own because the screens table had grown past the size its own stylesheet rule
 * allowed, and of the two halves this is the one that is a different question: the table compares
 * screens, and this answers one.
 */
@Component({
    selector: 'app-screen-detail',
    templateUrl: './screen-detail.html',
    styleUrl: './screen-detail.scss',
    imports: [BytesPipe, PathTreeComponent, ChainComponent, ExplainComponent],
})
export class ScreenDetailComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly store = inject(ReportStore);
    protected readonly nav = inject(ReportNav);

    // * INPUTS
    readonly screen = input.required<ScreenCost>();

    // * ATTRIBUTES
    /** The chunk of this screen whose files are being shown. */
    protected readonly expandedChunk = signal<string | null>(null);
    /** "Copied" on the button, for as long as somebody needs to see the click did something. */
    protected readonly copied = signal(false);

    private readonly treeById = computed(
        () => new Map((this.store.analysis()?.tree ?? []).map(node => [node.id, node])),
    );

    /**
     * What one screen downloads, read as a shape: thirty files where four are 85 % of the weight is
     * not "thirty files". It is the per-screen half of what the Tree tab says about the build.
     */
    protected granularity(screen: ScreenCost): string {
        const analysis = this.store.analysis();
        if (!analysis) {
            return '';
        }

        const chunks = [...analysis.bootChunks, ...screen.ownChunks, ...screen.sharedChunks];
        const c = this.store.criteria();
        const shape = granularityOf(
            chunks.map(file => analysis.chunkOf(file)?.bytes ?? 0),
            c,
        );
        return this.i18n.ui().screenShape({
            crumbMax: formatBytes(c.crumbMaxBytes),
            files: shape.files,
            heavy: shape.heavy,
            share: Math.round(shape.heavyShare * 100),
            crumbs: shape.crumbs,
            crumbSize: formatBytes(shape.crumbBytes),
        });
    }

    /**
     * Why this screen is in the build: the chain of imports from the entry point down to it. Worked
     * out here rather than in the table, because only the open row asks and a chain is a walk of
     * the graph.
     */
    protected chainOf(source: string): string[] | null {
        const analysis = this.store.analysis();
        return analysis ? (whyHere(analysis, source)?.steps ?? null) : null;
    }

    /**
     * This row as one line of text, for pasting into the chat where the decision is being argued.
     *
     * The report already exports the whole table as Markdown, and the whole table is not what
     * anybody pastes into a thread about one screen. Tab-separated, so it lands as a row in a
     * spreadsheet and as plain text everywhere else.
     */
    protected async copyRow(screen: ScreenCost): Promise<void> {
        const t = this.i18n.ui();
        const unit = this.store.unit();
        const line = [
            screen.label,
            `${t.treeBoot} ${formatBytes(screen.boot)}`,
            `${t.colShared} ${formatBytes(screen.shared)}`,
            `${t.colOwn} ${formatBytes(screen.own)}`,
            `${t.colTotal} ${formatBytes(screen.total)} (${unit})`,
            `${t.colWaves} ${screen.waves}`,
            screen.source,
        ].join('\t');

        if (await copyText(line)) {
            this.copied.set(true);
            setTimeout(() => this.copied.set(false), 1800);
        }
    }

    /**
     * Takes a row out of the table by hand. Whether something is a screen or a piece of one is
     * decided partly by reading file names, so it can be wrong in a project that names them another
     * way; this is the way out that does not need Loadline to learn one more convention.
     */
    protected markBlock(screen: ScreenCost): void {
        this.store.markAs(screen.source, 'block');
    }

    protected toggleChunk(file: string): void {
        this.expandedChunk.set(this.expandedChunk() === file ? null : file);
    }

    protected filesOf(file: string): PathItem[] {
        return filesOfChunk(this.treeById().get(file));
    }

    /** The routes file(s) that lazy-load this screen: where its providers would go. */
    protected loadersOf(source: string): string[] {
        return this.store.analysis()?.screenLoaders.get(source) ?? [];
    }

    /**
     * Which round trip a chunk of this screen arrives in. The screen's own entry is the first;
     * anything it statically imports cannot be asked for until that one has arrived and been read.
     */
    protected waveOf(screen: ScreenCost, file: string): number {
        return screen.chunkWaves.get(file) ?? 1;
    }

    protected chunkRows(files: string[]): ChunkInfo[] {
        const analysis = this.store.analysis();
        if (!analysis) {
            return [];
        }

        return files
            .map(file => analysis.chunkOf(file))
            .filter((chunk): chunk is ChunkInfo => !!chunk)
            .toSorted((a, b) => b.bytes - a.bytes);
    }
}
