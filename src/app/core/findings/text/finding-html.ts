import { packageOf } from '../../format/format.utils';

/**
 * The two bits of markup every signal is written with. Signal text carries HTML on purpose: a file
 * name or a version number set apart from the sentence is what makes it findable at a glance.
 */

/** A name as code: a file, a package, a configuration key. */
export const mono = (text: string): string => `<span class="mono">${text}</span>`;

/** An import chain as HTML: each step in monospace, joined by a separator. */
export const chainHtml = (steps: string[]): string => steps.map(step => mono(step)).join(' › ');

/**
 * A chain of source files as HTML, with every step a dynamic `import()` reaches marked as one:
 * `main.ts › teams.service.ts › import() › @microsoft/teams-js`. Files of one package collapse into
 * the package, as `chainSteps` does; the mark goes before the step the `import()` first enters.
 */
export const chainHtmlOf = (chain: readonly string[], lazy: ((file: string) => boolean) | undefined): string => {
    const steps: { name: string; lazy: boolean }[] = [];
    for (const file of chain) {
        const name = packageOf(file) ?? file;
        const last = steps.at(-1);
        if (last?.name === name) {
            last.lazy ||= !!lazy?.(file);
        } else {
            steps.push({ name, lazy: !!lazy?.(file) });
        }
    }
    return steps
        .map((step, index) => `${index > 0 && step.lazy ? `${mono('import()')} › ` : ''}${mono(step.name)}`)
        .join(' › ');
};

/**
 * A list of names cut to the first few, with how many were left out. For the lists that grow with
 * the project rather than with the problem: the hundred files importing `@angular/core` pasted into
 * one paragraph said nothing the first five did not.
 */
export const fewNamed = (items: readonly string[], more: (count: number) => string, max = 5): string => {
    const shown = items
        .slice(0, max)
        .map(item => mono(item))
        .join(', ');
    return items.length > max ? `${shown} ${more(items.length - max)}` : shown;
};

/**
 * Text somebody wrote in `loadline.json`, made safe to put into a signal's HTML. Every other piece
 * of a signal is written here or read from a build; this one is free text from a person, and a
 * `<` in a reason would otherwise open a tag on the page and vanish from the terminal.
 */
export const escapeHtml = (text: string): string =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
