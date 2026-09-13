import { computed, Service, signal } from '@angular/core';
import { setNumberLang } from '../core/format/format.utils';
import { UI } from '../core/i18n/ui';
import { type Lang } from '../core/i18n/ui-strings';
import { readLocal, writeLocal } from '../core/session/local-store';

const STORAGE_KEY = 'loadline.lang';

/**
 * English, unless this browser has been told otherwise.
 *
 * It used to follow `navigator.language`, which meant a Spanish machine opened the tool in Spanish
 * even when everything around it — the repository, the bundle names, the build output being read —
 * was in English. Guessing from the machine answers the wrong question: the language of the person
 * is not the language of the work. So the default is the one the documentation and the command are
 * written in, and the button is what changes it.
 */
const initialLang = (): Lang => (readLocal(STORAGE_KEY) === 'es' ? 'es' : 'en');

/** UI language. Starts in English and remembers the choice. */
@Service()
export class I18nService {
    readonly lang = signal<Lang>(initialLang());

    /** The strings of the active language. Everything that paints reads from here. */
    readonly ui = computed(() => UI[this.lang()]);

    constructor() {
        // `index.html` ships with one language written in. Without this the attribute keeps saying
        // English to a screen reader while the page paints Spanish, until the button is pressed.
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
