/**
 * Signal text without its markup. The signals carry HTML on purpose (`finding-html.ts`), and a
 * terminal or a JSON payload has no use for it: printing `<span class="mono">rxjs</span>` in a CI
 * log is worse than printing nothing.
 *
 * The tags are stripped by name rather than with a catch-all `<...>` pattern: a version range like
 * `>=17 <19` inside a signal would otherwise lose half of itself.
 *
 * **Stripping by name has one failure mode, and it is silent**: copy that reaches for a tag nobody
 * added here prints as itself in a terminal. That is how `<em>` got into a CI log — written into
 * one signal, correct in the page, literal everywhere else. `finding-text.spec.ts` now walks every
 * string of copy and fails on any tag this list does not know, so the next one is caught here
 * rather than by somebody reading the output.
 */

const TAGS = /<\/?(?:strong|em|span)(?: class="mono")?>/g;

/**
 * The escapes a signal writes when it quotes markup instead of using it. `<link rel="modulepreload">`
 * has to reach the page as text — written raw it would be injected as a real element — and has to
 * reach a terminal as the tag itself, because `&lt;link&gt;` in a CI log helps nobody.
 */
const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&amp;': '&' };

export const plainText = (html: string): string =>
    html.replaceAll(TAGS, '').replaceAll(/&(?:lt|gt|quot|#39|amp);/g, entity => ENTITIES[entity] ?? entity);
