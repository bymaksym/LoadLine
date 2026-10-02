/**
 * The two bits of markup every signal is written with. Signal text carries HTML on purpose: a file
 * name or a version number set apart from the sentence is what makes it findable at a glance.
 */

/** A name as code: a file, a package, a configuration key. */
export const mono = (text: string): string => `<span class="mono">${text}</span>`;

/** An import chain as HTML: each step in monospace, joined by a separator. */
export const chainHtml = (steps: string[]): string => steps.map(step => mono(step)).join(' › ');

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
