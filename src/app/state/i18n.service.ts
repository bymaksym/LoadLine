import { computed, Service, signal } from '@angular/core';
import { setNumberLang } from '../core/format/format.utils';
import { UI } from '../core/i18n/ui';
import { type Lang } from '../core/i18n/ui-strings';
import { readLocal, writeLocal } from '../core/session/local-store';

const STORAGE_KEY = 'loadline-lang';

const initialLang = (): Lang => {
    const saved = readLocal(STORAGE_KEY);
    if (saved === 'es' || saved === 'en') {
        return saved;
    }

    // Without a stored choice the browser decides.
    return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
};

/** UI language. Starts from the browser's and remembers the choice. */
@Service()
export class I18nService {
    readonly lang = signal<Lang>(initialLang());

    /** The strings of the active language. Everything that paints reads from here. */
    readonly ui = computed(() => UI[this.lang()]);

    constructor() {
        // `index.html` ships with one language written in. Without this the attribute keeps saying
        // Spanish to a screen reader while the page paints English, until the button is pressed.
        document.documentElement.lang = this.lang();
        setNumberLang(this.lang());
    }

    toggle(): void {
        const next: Lang = this.lang() === 'es' ? 'en' : 'es';

        this.lang.set(next);
        setNumberLang(next);
        document.documentElement.lang = next;
        writeLocal(STORAGE_KEY, next);
    }
}
