/**
 * The two bits of markup every signal is written with. Signal text carries HTML on purpose: a file
 * name or a version number set apart from the sentence is what makes it findable at a glance.
 */

/** A name as code: a file, a package, a configuration key. */
export const mono = (text: string): string => `<span class="mono">${text}</span>`;

/** An import chain as HTML: each step in monospace, joined by a separator. */
export const chainHtml = (steps: string[]): string => steps.map(step => mono(step)).join(' › ');
