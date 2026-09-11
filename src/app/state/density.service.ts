import { Service, signal } from '@angular/core';
import { readLocal, writeLocal } from '../core/session/local-store';

type Density = 'comfortable' | 'compact';

const KEY = 'loadline.density';

/**
 * How much air the rows get.
 *
 * The audience is developers reading tables of a hundred and sixty rows on wide screens, where more
 * rows on screen is more information and not less. It is deliberately the whole page and not a
 * setting per table: nine switches answering the same question is the thing this interface keeps
 * being told not to do.
 *
 * It changes spacing and nothing else — no column, no figure, no colour — so there is nothing it
 * can hide, which is what lets it be a one-press control with no explanation attached.
 *
 * Unlike the theme, the choice is remembered: the theme follows the system when nobody has said
 * otherwise, and there is no system preference for this one.
 */
@Service()
export class DensityService {
    readonly density = signal<Density>('comfortable');

    constructor() {
        if (readLocal(KEY) === 'compact') {
            this.apply('compact');
        }
    }

    toggle(): void {
        this.apply(this.density() === 'compact' ? 'comfortable' : 'compact');
    }

    private apply(next: Density): void {
        this.density.set(next);
        if (next === 'compact') {
            document.documentElement.dataset['density'] = 'compact';
        } else {
            delete document.documentElement.dataset['density'];
        }

        writeLocal(KEY, next);
    }
}
