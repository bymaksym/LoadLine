import { Service, signal } from '@angular/core';

/** What the palette is showing: the list of things to jump to, or the list of shortcuts. */
export type PaletteMode = 'jump' | 'keys';

/** Fields where a keystroke is text and not a shortcut. */
const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * The keyboard: `Ctrl`/`Cmd` + `K` to jump anywhere, `/` to search, `?` for the list of shortcuts.
 *
 * Since the redesign of 02/10/2026 it also has one button, in the header, labelled with the keys:
 * the people who already have `Ctrl+K` in their fingers from five other tools do not need it, and
 * everybody else had no way of knowing the palette was there. `?` still lists the shortcuts.
 *
 * A keystroke inside a field is text: the four filter boxes and the paste area of Measured would
 * otherwise stop accepting a `/` or a `?`.
 */
@Service()
export class PaletteService {
    readonly open = signal(false);
    readonly mode = signal<PaletteMode>('jump');
    /** What the box starts with, so `/` opens it already looking for a name. */
    readonly seed = signal('');

    constructor() {
        addEventListener('keydown', event => this.onKey(event));
    }

    show(mode: PaletteMode, seed = ''): void {
        this.mode.set(mode);
        this.seed.set(seed);
        this.open.set(true);
    }

    close(): void {
        this.open.set(false);
    }

    private onKey(event: KeyboardEvent): void {
        if (event.key === 'Escape' && this.open()) {
            this.close();
            return;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            this.show('jump');
            return;
        }

        const target = event.target as HTMLElement | null;
        if (
            event.ctrlKey ||
            event.metaKey ||
            event.altKey ||
            TYPING.has(target?.tagName ?? '') ||
            target?.isContentEditable
        ) {
            return;
        }

        if (event.key === '/') {
            event.preventDefault();
            this.show('jump');
            return;
        }

        if (event.key !== '?') {
            return;
        }

        event.preventDefault();
        this.show('keys');
    }
}
