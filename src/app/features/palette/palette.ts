import { afterNextRender, Component, computed, type ElementRef, inject, signal, viewChild } from '@angular/core';
import { DensityService } from '@state/density.service';
import { ExportService } from '@state/export.service';
import { HistoryService } from '@state/history.service';
import { I18nService } from '@state/i18n.service';
import { PaletteService } from '@state/palette.service';
import { ReportStore } from '@state/report.store';
import { ReportNav } from '@state/report-nav.service';
import { REPORT_TABS, type ReportTab } from '@state/report-nav.types';
import { ThemeService } from '@state/theme.service';

/** One thing the palette can take you to, or do. */
interface Entry {
    key: string;
    kind: 'tab' | 'screen' | 'name' | 'action';
    label: string;
    hint: string;
    run: () => void;
}

/**
 * How many rows are drawn at once.
 *
 * The rule about grouping rather than trimming applies to the views: a table that finds a hundred
 * and sixty rows names all of them. This is not a view — it is a way of getting to one — and a list
 * of four thousand names under a search box is not a list anybody reads. It says how many matched
 * and the Search tab, which does name every one of them, is the first thing it offers.
 */
const SHOWN = 12;

/**
 * Jump anywhere: a tab, a screen, a package, or one of the handful of things the report does.
 *
 * Opened with `Ctrl`/`Cmd` + `K` or `/`, and with `?` for the shortcuts. It has no button anywhere
 * on the page and that is deliberate: it is a gesture the audience already has, and a control in
 * the header for it would be one more thing on screen for everybody who does not use it.
 */
@Component({
    selector: 'app-palette',
    templateUrl: './palette.html',
    styleUrl: './palette.scss',
})
export class PaletteComponent {
    // * SERVICES
    protected readonly i18n = inject(I18nService);
    protected readonly palette = inject(PaletteService);
    private readonly store = inject(ReportStore);
    private readonly historyService = inject(HistoryService);
    private readonly exports = inject(ExportService);
    private readonly nav = inject(ReportNav);
    private readonly theme = inject(ThemeService);
    private readonly density = inject(DensityService);

    // * ATTRIBUTES
    private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');
    protected readonly query = signal(this.palette.seed());
    /** Which row the arrows are on. Reset by every keystroke: the list under it has changed. */
    protected readonly cursor = signal(0);

    constructor() {
        afterNextRender(() => this.focus());
    }

    /** Everything the palette knows about, before anything is typed. */
    private readonly entries = computed<Entry[]>(() => {
        const t = this.i18n.ui();
        const analysis = this.store.analysis();

        const tabs: Entry[] = REPORT_TABS.map(tab => ({
            key: `tab:${tab}`,
            kind: 'tab' as const,
            label: this.tabLabel(tab),
            hint: t.paletteTab,
            run: () => this.nav.go(tab),
        }));

        const screens: Entry[] = (analysis?.screens ?? []).map(screen => ({
            key: `screen:${screen.source}`,
            kind: 'screen' as const,
            label: screen.label,
            hint: screen.source,
            run: () => this.nav.go('screens', screen.source),
        }));

        // Packages and files by name. They land on the search tab with the row already open, which
        // is where the answer is; the palette is the way in, not a second copy of that view.
        const names: Entry[] = this.store.searchIndex().entries.map(entry => ({
            key: `name:${entry.key}`,
            kind: 'name' as const,
            label: entry.key,
            hint: entry.kind === 'package' ? t.searchKindPackage : t.searchKindFile,
            run: () => this.nav.go('search', entry.key),
        }));

        return [...tabs, ...screens, ...names, ...this.actions()];
    });

    /** The handful of things the report does, so they are reachable without hunting for the button. */
    private actions(): Entry[] {
        const t = this.i18n.ui();
        return [
            {
                key: 'do:export',
                kind: 'action',
                label: t.exportJson,
                hint: t.paletteAction,
                run: () => this.exports.snapshot(),
            },
            {
                key: 'do:criteria',
                kind: 'action',
                label: t.criteriaExport,
                hint: t.paletteAction,
                run: () => this.exports.criteria(),
            },
            {
                key: 'do:keep',
                kind: 'action',
                label: t.historyKeep,
                hint: t.paletteAction,
                run: () => void this.historyService.keep(),
            },
            {
                key: 'do:theme',
                kind: 'action',
                label: t.themeBtn,
                hint: t.paletteAction,
                run: () => this.theme.toggle(),
            },
            {
                key: 'do:density',
                kind: 'action',
                label: t.densityCompact,
                hint: t.paletteAction,
                run: () => this.density.toggle(),
            },
            {
                key: 'do:lang',
                kind: 'action',
                label: this.i18n.lang() === 'es' ? 'English' : 'Español',
                hint: t.paletteAction,
                run: () => this.i18n.toggle(),
            },
        ];
    }

    /** Everything that matches, however many that is: the counter is honest about the total. */
    private readonly matches = computed<Entry[]>(() => {
        const query = this.query().trim().toLowerCase();
        if (!query) {
            // Nothing typed: the tabs and the actions, which are the short list worth offering.
            return this.entries().filter(entry => entry.kind === 'tab' || entry.kind === 'action');
        }

        const hits = this.entries().filter(entry => entry.label.toLowerCase().includes(query));
        // A name that starts with what was typed is what somebody meant; the rest follow.
        return hits.toSorted(
            (a, b) => Number(b.label.toLowerCase().startsWith(query)) - Number(a.label.toLowerCase().startsWith(query)),
        );
    });

    protected readonly rows = computed(() => this.matches().slice(0, SHOWN));
    protected readonly total = computed(() => this.matches().length);

    /** The shortcuts, as the `?` list. Written here because this is the only thing that has any. */
    protected readonly shortcuts = computed(() => {
        const t = this.i18n.ui();
        return [
            { keys: 'Ctrl / ⌘ + K', what: t.keyJump },
            { keys: '/', what: t.keySearch },
            { keys: '↑ ↓ · Enter', what: t.keyMove },
            { keys: 'Esc', what: t.keyClose },
            { keys: '?', what: t.keyHelp },
            { keys: '← →', what: t.keyTabs },
        ];
    });

    protected type(value: string): void {
        this.query.set(value);
        this.cursor.set(0);
    }

    protected onKey(event: KeyboardEvent): void {
        const rows = this.rows();
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            this.cursor.set((this.cursor() + step + rows.length) % Math.max(1, rows.length));
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            const entry = rows[this.cursor()];
            if (entry) {
                this.pick(entry);
            }
        }
    }

    protected pick(entry: Entry): void {
        entry.run();
        this.palette.close();
        this.query.set('');
        this.cursor.set(0);
    }

    /** A press on the backdrop and not on the panel means "away with it". */
    protected onBackdrop(event: MouseEvent): void {
        if (event.target === event.currentTarget) {
            this.palette.close();
        }
    }

    private focus(): void {
        this.box()?.nativeElement.focus();
    }

    protected tabLabel(tab: ReportTab): string {
        const t = this.i18n.ui();
        const labels: Record<ReportTab, string> = {
            findings: t.tabFindings,
            screens: t.tabScreens,
            measured: t.tabMeasured,
            boot: t.tabBoot,
            shared: t.tabShared,
            tree: t.tabTree,
            search: t.tabSearch,
            project: t.tabProject,
            situation: t.tabSituation,
            compare: t.tabCompare,
            criteria: t.tabCriteria,
        };
        return labels[tab];
    }
}
