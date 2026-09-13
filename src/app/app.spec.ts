/**
 * The smoke test of the interface.
 *
 * Everything else in this repository tests the core, and the core is not where the value is: the
 * two failures anybody would actually notice are **a blank report** and **numbers that moved**.
 * Neither shows up in a unit test of `analyze()`, because both happen between the analysis and the
 * screen — a template that throws, a signal that stopped being read, a figure bound to the wrong
 * field.
 *
 * So this loads the built-in example through the same button a person presses, waits for the page
 * to paint, and reads half a dozen figures back off the DOM. It is deliberately not forty
 * assertions: the point is that the whole path from a metafile to rendered text still works.
 */

import { provideZonelessChangeDetection } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';
import { CompareStore } from './state/compare.store';
import { DensityService } from './state/density.service';
import { PaletteService } from './state/palette.service';
import { ReportStore } from './state/report.store';
import { ReportNav } from './state/report-nav.service';
import { REPORT_TABS } from './state/report-nav.types';

const textOf = (fixture: ComponentFixture<App>, selector: string): string =>
    (fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent?.trim() ?? '';

const countOf = (fixture: ComponentFixture<App>, selector: string): number =>
    (fixture.nativeElement as HTMLElement).querySelectorAll(selector).length;

describe('the page, with the example loaded', () => {
    let fixture: ComponentFixture<App>;
    let store: ReportStore;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [App],
            providers: [provideZonelessChangeDetection()],
        }).compileComponents();

        fixture = TestBed.createComponent(App);
        store = TestBed.inject(ReportStore);
        fixture.detectChanges();
    });

    it('shows the drop zones and no report until something is loaded', () => {
        expect(countOf(fixture, 'app-intake-page')).toBe(1);
        expect(countOf(fixture, 'app-report-page')).toBe(0);
    });

    it('paints the report, with the figures the example was built to produce', async () => {
        store.loadSample();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(countOf(fixture, 'app-report-page')).toBe(1);

        // The headline: 568 140 raw bytes across four bootstrap chunks. If this moves, either the
        // walk of the import graph changed or the example did.
        expect(textOf(fixture, '.tile--hero .tile__figure')).toContain('555 kB');
        expect(textOf(fixture, '.tile--hero .tile__sub')).toContain('4');

        // Eight screens, and the widget deferred inside one of them is not a ninth.
        expect(store.analysis()?.screens).toHaveLength(8);
        expect(store.analysis()?.deferredBlocks).toHaveLength(1);
    });

    it('says out loud that this is not your build', async () => {
        store.loadSample();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(textOf(fixture, 'app-intake-page .loadbar__status')).toContain('Example build');
    });

    /**
     * A template that throws takes the whole page with it, and eight of the nine tabs are only ever
     * rendered after a click. Walking them here is what turns "the report painted" into "the report
     * painted, all of it".
     */
    it('renders every tab of the report', async () => {
        store.loadSample();
        const nav = TestBed.inject(ReportNav);

        for (const tab of REPORT_TABS) {
            nav.go(tab);
            await fixture.whenStable();
            fixture.detectChanges();

            expect(countOf(fixture, `app-${tab}-tab`), `the ${tab} tab rendered nothing`).toBe(1);
        }
    });

    /**
     * The one interaction of the tree that a rendering test can check: pinning a chunk moves it out
     * of the list and into the block above it, which is where two distant rows become comparable.
     */
    it('keeps a pinned chunk above the list', async () => {
        store.loadSample();
        TestBed.inject(ReportNav).go('tree');
        await fixture.whenStable();
        fixture.detectChanges();

        expect(countOf(fixture, '.tree__pins')).toBe(0);
        const before = countOf(fixture, 'app-tree-node');

        (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(':scope .row__pin')?.click();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(countOf(fixture, '.tree__pins app-tree-node')).toBe(1);
        // Moved, not copied: a row shown twice would be two bars for one chunk.
        expect(countOf(fixture, 'app-tree-node')).toBe(before);
    });

    /**
     * The mark that answers "where does this figure come from".
     *
     * It replaced some sixty `title` attributes, which is the one kind of explanation a touch screen
     * never shows. What a rendering test can check is the part that used to be impossible: that
     * pressing it puts the sentence in the DOM, and pressing it again takes it away.
     */
    it('opens an explanation where a `title` used to be, and closes it again', async () => {
        store.loadSample();
        TestBed.inject(ReportNav).go('screens');
        await fixture.whenStable();
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        expect(countOf(fixture, 'app-explain .explain__bubble')).toBe(0);

        const mark = host.querySelector<HTMLButtonElement>(':scope app-explain .explain__btn');
        expect(mark, 'no explanation mark on the screens tab').toBeTruthy();

        mark?.click();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(countOf(fixture, 'app-explain .explain__bubble')).toBe(1);
        expect(textOf(fixture, 'app-explain .explain__bubble').length).toBeGreaterThan(10);

        mark?.click();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(countOf(fixture, 'app-explain .explain__bubble')).toBe(0);
    });

    /**
     * The palette has no control anywhere on the page, so the only thing that can prove it exists is
     * the keystroke. `?` opens the shortcuts and Ctrl+K opens the jump list, which is the whole of
     * what it promises.
     */
    it('opens from the keyboard, which is the only way it opens', async () => {
        store.loadSample();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(countOf(fixture, 'app-palette')).toBe(0);

        dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
        await fixture.whenStable();
        fixture.detectChanges();
        expect(countOf(fixture, 'app-palette .keys')).toBe(1);

        TestBed.inject(PaletteService).close();
        dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
        await fixture.whenStable();
        fixture.detectChanges();

        // With nothing typed it offers the tabs and the handful of things the report does.
        expect(countOf(fixture, 'app-palette .palette__row')).toBeGreaterThan(REPORT_TABS.length);
    });

    it('finds a screen by name from the palette', async () => {
        store.loadSample();
        await fixture.whenStable();
        fixture.detectChanges();

        TestBed.inject(PaletteService).show('jump');
        await fixture.whenStable();
        fixture.detectChanges();

        const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(':scope .palette__box');
        box!.value = 'reports';
        box?.dispatchEvent(new Event('input'));
        await fixture.whenStable();
        fixture.detectChanges();

        expect(textOf(fixture, '.palette__row')).toContain('reports');
    });

    /** Compact mode changes the spacing and nothing else, so what it can be checked by is the stamp. */
    it('stamps the density on the document and takes it off again', () => {
        const density = TestBed.inject(DensityService);
        expect(document.documentElement.dataset['density']).toBeUndefined();

        density.toggle();
        expect(document.documentElement.dataset['density']).toBe('compact');

        density.toggle();
        expect(document.documentElement.dataset['density']).toBeUndefined();
    });

    /**
     * "Why is this here", opened from a file of the tree. The leaf marker **is** the control, so
     * what this checks is that pressing it produces a chain and not an empty box.
     */
    it('answers why a file is in the build, from the tree', async () => {
        store.loadSample();
        TestBed.inject(ReportNav).go('tree');
        await fixture.whenStable();
        fixture.detectChanges();

        const host = fixture.nativeElement as HTMLElement;
        host.querySelector<HTMLButtonElement>(':scope app-tree-node .twist')?.click();
        await fixture.whenStable();
        fixture.detectChanges();

        const leaf = host.querySelector<HTMLButtonElement>(':scope app-path-node .twist--leaf');
        expect(leaf, 'no file row in the open chunk').toBeTruthy();

        leaf?.click();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(countOf(fixture, 'app-path-node .why app-chain')).toBe(1);
        expect(textOf(fixture, 'app-path-node .why .chain').length).toBeGreaterThan(0);
    });

    /**
     * The comparison, with the build on screen added twice. It is a degenerate case on purpose:
     * everything is duplicated, so every list has to say so rather than come back empty.
     */
    it('crosses two builds and says what the extra copies cost', async () => {
        store.loadSample();
        await fixture.whenStable();

        const compare = TestBed.inject(CompareStore);
        compare.addCurrent();
        compare.addCurrent();

        TestBed.inject(ReportNav).go('compare');
        await fixture.whenStable();
        fixture.detectChanges();

        expect(compare.report$().totals).toHaveLength(2);
        expect(compare.report$().duplicatedBytes).toBeGreaterThan(0);
        // Two applications with the same name would be two columns nobody can tell apart.
        expect(new Set(compare.builds().map(build => build.name)).size).toBe(2);
        expect(textOf(fixture, 'app-compare-tab .lead-figure').length).toBeGreaterThan(0);
    });

    it('lists the screens, heaviest first, in the screens tab', async () => {
        store.loadSample();
        TestBed.inject(ReportNav).go('screens');
        await fixture.whenStable();
        fixture.detectChanges();

        const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(':scope app-screens-tab .screen');
        expect(rows).toHaveLength(8);
        expect(rows[0]?.textContent).toContain('reports');
    });
});
