import { effect, ElementRef, inject, untracked } from '@angular/core';
import { ReportNav } from '@state/report-nav.service';
import { type ReportTab } from '@state/report-nav.types';

/** How long the row stays highlighted after being scrolled to. Matches the CSS animation. */
const HIGHLIGHT_MS = 1700;

/**
 * Scrolls to the row carrying `data-key` and highlights it for a moment. Deferred by a tick so the
 * row asked for is already painted: it is usually inside a section that has just been expanded.
 */
const scrollToKey = (host: HTMLElement, key: string): void => {
    setTimeout(() => {
        const row = host.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
        if (!row) {
            return;
        }

        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        row.classList.add('is-focus');
        setTimeout(() => row.classList.remove('is-focus'), HIGHLIGHT_MS);
    });
};

/**
 * Wires a panel to the report's navigation: a signal or a summary tile asking to "see the chunk"
 * switches to this tab and names an element, and the panel has to open it and take the reader
 * there. `prepare` is the part only the panel knows — which row to expand, which filter to clear.
 *
 * Call it from the constructor: it injects, so it needs an injection context.
 */
export const revealOnFocus = (tab: ReportTab, prepare?: (key: string) => void): void => {
    const nav = inject(ReportNav);
    const host = inject<ElementRef<HTMLElement>>(ElementRef);

    effect(() => {
        const focus = nav.focus();
        if (focus?.tab !== tab) {
            return;
        }

        untracked(() => {
            prepare?.(focus.key);
            // Cleared straight away: the request has been served, and leaving it set would make the
            // next visit to this tab jump again.
            nav.focus.set(null);
            scrollToKey(host.nativeElement, focus.key);
        });
    });
};
