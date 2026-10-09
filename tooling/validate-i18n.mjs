/**
 * Finds the strings of the page nothing reads any more: keys of `UiStrings` that no file outside
 * the dictionaries mentions.
 *
 * The compiler already holds the other half. `en.ts` and `es.ts` are typed against `UiStrings`, so
 * a key one of them lacks, or one the contract does not declare, is a type error. What nothing
 * checks is a key still declared and translated twice after the control that showed it is gone:
 * text that keeps being maintained, spell-checked and read by whoever edits the dictionaries, for a
 * page that never shows it. The first run (02/10/2026) found four of them, all from an older layout.
 *
 * A key counts as read when its name appears after a dot (`t.tabMap`, `ui()?.tabMap`) or as a
 * quoted string (a key picked by name). The dictionaries never index themselves with a name
 * assembled at run time; if that ever changes, this script has to learn about it.
 *
 * Usage: node tooling/validate-i18n.mjs
 * Exit code 1 when a key is not read anywhere.
 */
// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { styleText } from 'node:util';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const I18N = join(ROOT, 'src', 'app', 'core', 'i18n');
const DICTIONARIES = new Set(['en.ts', 'es.ts', 'ui-strings.ts']);

/**
 * The members of `export interface UiStrings`, top level only: a signature that wraps over several
 * lines has its parameters deeper, and those are not keys.
 */
const keysOf = () => {
    const source = readFileSync(join(I18N, 'ui-strings.ts'), 'utf8');
    const start = source.indexOf('{', source.indexOf('export interface UiStrings'));
    let depth = 0;
    let end = start;
    for (; end < source.length; end++) {
        if (source[end] === '{') {
            depth++;
        } else if (source[end] === '}') {
            depth--;
            if (depth === 0) {
                break;
            }
        }
    }
    const body = source.slice(start, end);
    return [...body.matchAll(/^ {4}(?:readonly )?([A-Za-z_$][\w$]*)\??\s*[:(]/gm)].map(match => match[1] ?? '');
};

/**
 * Every `.ts` and `.html` file under the page and the command, the dictionaries left out.
 *
 * @param {string} folder
 * @returns {string[]}
 */
const filesUnder = folder =>
    readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) {
            return filesUnder(path);
        }
        const isSource = /\.(?:ts|html)$/.test(entry.name);
        const isDictionary = folder === I18N && DICTIONARIES.has(basename(path));
        return isSource && !isDictionary ? [path] : [];
    });

const sources = [...filesUnder(join(ROOT, 'src')), ...filesUnder(join(ROOT, 'cli'))]
    .map(path => readFileSync(path, 'utf8'))
    .join('\n');

/** @param {string} key */
const isRead = key => {
    const name = key.replaceAll('$', String.raw`\$`);
    return new RegExp(String.raw`[.?]${name}\b|['"${'`'}]${name}['"${'`'}]`).test(sources);
};

const keys = keysOf();
const unread = keys.filter(key => !isRead(key));

if (unread.length === 0) {
    console.log(styleText('green', `All ${keys.length} keys of UiStrings are read somewhere.`));
    process.exit(0);
}

console.log(
    styleText('red', `${unread.length} of ${keys.length} keys of UiStrings are not read anywhere:`),
    `\n${unread.map(key => `  ${key}`).join('\n')}`,
    '\nRemove them from src/app/core/i18n/ui-strings.ts, en.ts and es.ts, or use them.',
);
process.exit(1);
