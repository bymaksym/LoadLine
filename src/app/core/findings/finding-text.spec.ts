/**
 * A guard over the copy itself, rather than over what any one signal says.
 *
 * `body` and `fix` are HTML on purpose — they carry `<strong>` and `<span class="mono">` — and
 * every renderer that cannot show markup runs them through `plainText`. **`chip` and `title` do
 * not get that treatment anywhere**: the terminal, the markdown, the pull-request comment and the
 * SARIF message all print them verbatim. A `mono()` in a title therefore reaches a terminal as
 * literal `<span class="mono">`, which is how the ranked list came to print markup at somebody.
 *
 * It reads the functions' own source rather than calling them, because calling them would mean
 * inventing arguments for sixty signals and the ones nobody invented would be the ones that broke.
 * The source it sees is the **transpiled** one, where `mono(x)` has become something on the shape
 * of `(0, module.mono)(x)` — so the pattern has to catch that spelling too, and the last test
 * below is what stops the guard quietly ceasing to catch anything.
 */

import { describe, expect, it } from 'vitest';
import { plainText } from './finding-plain';
import { TEXT } from './finding-text';

/** A `chip:` or `title:` property, up to the end of its line. Both are plain text everywhere. */
const PLAIN_FIELDS = /^\s*(?:chip|title):.*$/gm;

/** What only `body` and `fix` are allowed to carry. `mono)(` is the call after transpiling. */
const MARKUP = /mono\)?\(|<span|<strong|<em\b|&lt;/;

/** The offending `chip:`/`title:` lines of one function's source, if any. */
const markupIn = (source: string): string[] =>
    [...source.matchAll(PLAIN_FIELDS)].map(match => match[0].trim()).filter(line => MARKUP.test(line));

/** Every signal's copy in both languages, as the source of the function that builds it. */
const sources = (): { signal: string; source: string }[] =>
    Object.entries(TEXT).flatMap(([lang, dictionary]) =>
        Object.entries(dictionary)
            .filter(([, value]) => typeof value === 'function')
            .map(([signal, value]) => ({ signal: `${lang}.${signal}`, source: String(value) })),
    );

describe('finding copy · chips and titles are plain text', () => {
    it('never puts markup in a title or a chip', () => {
        const offenders = sources().flatMap(({ signal, source }) => markupIn(source).map(line => `${signal}: ${line}`));

        expect(offenders).toEqual([]);
    });

    it('is checking something: the fields it looks for are really in there', () => {
        // Without this, a rename of `title` would turn the guard above into a test that passes by
        // finding nothing at all.
        const found = sources().filter(({ source }) => markupIn(`${source}\n    title: <span>x</span>`).length > 0);

        expect(found.length).toBeGreaterThan(50);
    });

    it('catches markup in both spellings, so the guard cannot go quietly blind', () => {
        // As written in the file, and as the transpiler leaves it. A change of bundler that
        // rewrites the call differently again fails here rather than in a terminal.
        expect(markupIn("    chip: mono('a'),")).toHaveLength(1);
        expect(markupIn('    chip: (0, __vite_ssr_import_0__.mono)("a"),')).toHaveLength(1);
        expect(markupIn('    title: \'<span class="mono">a</span>\',')).toHaveLength(1);
        // And leaves the two fields that are allowed to carry it alone.
        expect(markupIn("    body: mono('a'),")).toEqual([]);
        expect(markupIn("    fix: '<strong>a</strong>',")).toEqual([]);
    });
});

/**
 * The other half of the same failure: `body` and `fix` **are** run through `plainText`, and it
 * strips tags by name. Copy that reaches for a tag the stripper has never heard of therefore
 * prints as itself, in a terminal, in a CI log and in a pull-request comment — which is exactly
 * what `<em>` did after it was written into one signal and nowhere else.
 *
 * So rather than trusting the two lists to stay in step, this walks every string of copy there is
 * and asks the stripper to prove it removes each tag it finds.
 *
 * **What counts as a tag here is one that closes.** Several tags in this file are being quoted
 * rather than used — `<link rel="preconnect">`, `<base href>`, `<head>` — and those have to reach a
 * terminal intact, because a reader being told to add a tag needs to see the tag. Markup comes in
 * pairs and a quoted tag name does not, so the closing form is what tells the two apart. The cost
 * of that rule is a void element used as markup — a `<br>` — which nothing here has and which
 * would slip through; the day one appears, this is the comment that has to change.
 */
const CLOSING_TAG = /<\/([a-z][a-z0-9]*)\s*>/g;

/** Every tag name the copy really uses as markup, in either language. */
const tagsUsed = (): string[] => {
    const names = new Set<string>();
    for (const { source } of sources()) {
        for (const match of source.matchAll(CLOSING_TAG)) {
            names.add((match[1] ?? '').toLowerCase());
        }
    }

    return [...names].toSorted((a, b) => a.localeCompare(b));
};

describe('finding copy · every tag it uses is one plainText removes', () => {
    it('leaves no markup behind for a terminal to print', () => {
        const survives = tagsUsed().filter(tag => plainText(`<${tag}>x</${tag}>`) !== 'x');

        expect(survives).toEqual([]);
    });

    it('is checking something: the copy really does carry tags', () => {
        // Named rather than counted, so adding a fourth kind of markup is a decision somebody
        // takes here as well as in the stripper.
        expect(tagsUsed()).toEqual(['em', 'span', 'strong']);
    });

    it('would fail on a tag nobody added to the stripper', () => {
        // The shape of the bug, written out: if this ever passes, the guard above proves nothing.
        expect(plainText('<mark>x</mark>')).not.toBe('x');
    });
});
