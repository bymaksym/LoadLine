import { Service, signal } from '@angular/core';

type Theme = 'light' | 'dark';

/**
 * Page theme. By default it follows the system's and nothing is stamped on the document; pressing
 * the button pins one, which is what makes it win over the system preference.
 */
@Service()
export class ThemeService {
    readonly forced = signal<Theme | null>(null);

    toggle(): void {
        const isDark =
            this.forced() === 'dark' || (this.forced() === null && matchMedia('(prefers-color-scheme: dark)').matches);
        const next: Theme = isDark ? 'light' : 'dark';

        this.forced.set(next);
        document.documentElement.dataset['theme'] = next;
    }
}
