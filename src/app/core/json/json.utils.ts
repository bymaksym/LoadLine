/**
 * Reading what `JSON.parse` hands back.
 *
 * `JSON.parse` is typed `any`, so every file read from disk, every dropped file and every
 * `localStorage` key enters the program as a value the compiler will agree to anything about. The
 * habit this project already had was to annotate the result `: unknown` and then assert the shape
 * it was hoped to be, which moves the lie one line down rather than removing it: an `as AuditJson`
 * over `JSON.parse('null')` type-checks and then throws on the first property read.
 *
 * These are the two checks that make the assertion true instead of hopeful. They are deliberately
 * shallow — one level, no schema language, no dependency — because the shapes being read are
 * other tools' output, and the parts of them this project uses are one or two fields deep.
 */

/**
 * The value as an object with string keys, or `null` when it is not one.
 *
 * `null`, a list, a string and a number all fail: each of them is valid JSON and none of them has
 * the fields the caller is about to read. Lists are rejected on purpose — `Object.entries` of one
 * succeeds and yields its indices, which is how `{"vulnerabilities": "oops"}` used to turn into
 * four findings named `0`, `1`, `2` and `3`.
 *
 * The assertion after the check is the sound kind: `typeof value === 'object'` plus the two
 * exclusions is exactly the evidence `Record<string, unknown>` claims.
 */
export const asRecord = (value: unknown): Record<string, unknown> | null =>
    typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/** The value as a list of unknowns, or `null` when it is not a list. */
export const asArray = (value: unknown): unknown[] | null => (Array.isArray(value) ? value : null);

/** The value as a string, or `null`. For fields another tool may have left out or written wrong. */
export const asText = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/**
 * One member of a union of string literals, checked against the union's own members.
 *
 * This is what replaces `value as Mode` at the edges where a flag, a URL parameter or a stored key
 * arrives as a `string` and is wanted as one of a handful of literals. The set carries the literal
 * type, so adding a member to the union without adding it to the set is a compile error rather
 * than a value that silently stops being recognised.
 */
export const asMember = <T extends string>(value: string, members: ReadonlySet<T>): T | null =>
    (members as ReadonlySet<string>).has(value) ? (value as T) : null;

/**
 * One key of an object whose keys ARE the union, checked against that object.
 *
 * The difference from `asMember` is where the list of allowed values comes from: this takes the
 * `Record<T, ...>` the code already has -- a table of column widths, a dictionary of labels -- so
 * there is no second list to keep in step with the first. A union that gains a member gains it
 * here too, because the record would not compile without it.
 */
export const asKeyOf = <T extends string>(value: string, shape: Record<T, unknown>): T | null =>
    Object.hasOwn(shape, value) ? (value as T) : null;
