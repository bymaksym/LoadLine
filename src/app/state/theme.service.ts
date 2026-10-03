import { computed, Service, signal } from '@angular/core';

type Theme = 'light' | 'dark';

/**
 * Page theme. By default it follows the system's and nothing is stamped on the document; pressing
 * the button pins one, which is what makes it win over the system preference.
 */
@Service()
export class ThemeService {
    readonly forced = signal<Theme | null>(null);

    /** The system's preference, kept current: the button names the theme it switches to. */
    private readonly systemDark = signal(false);

    readonly dark = computed(() => this.forced() === 'dark' || (this.forced() === null && this.systemDark()));

    constructor() {
        // A test DOM has no `matchMedia`: there the system preference is light, which is what it is
        // anyway when nobody says otherwise.
        if (typeof matchMedia !== 'function') {
            return;
        }

        const query = matchMedia('(prefers-color-scheme: dark)');
        this.systemDark.set(query.matches);
        query.addEventListener('change', event => this.systemDark.set(event.matches));
    }

    toggle(): void {
        const next: Theme = this.dark() ? 'light' : 'dark';

        this.forced.set(next);
        document.documentElement.dataset['theme'] = next;
    }
}
