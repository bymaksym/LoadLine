/**
 * Checks that every class a template names has a rule that can actually reach it.
 *
 * Stylelint reads one stylesheet at a time and cannot know this. Angular's emulated encapsulation
 * stamps each component's styles with that component's own attribute, so a rule written in one
 * component's stylesheet does not reach another component's DOM — no matter that the two spell the
 * class the same way. A class a template uses therefore has to be declared either in that
 * component's own styles or in the global stylesheet, and anywhere else it is markup naming a look
 * that never arrives. Nothing fails: the page just draws it wrong, quietly, which is why this is a
 * check and not a reading.
 *
 * It was written after finding four of them at once: `.dot-v--after`, a modifier of a global block
 * declared inside `screens-tab.scss`, so the two other panels that ask for it draw the rating
 * marker on the wrong side; `.detail__title` written twice and missing in the third panel that
 * uses it; and `.muted` copied into five stylesheets and forgotten in two more.
 *
 * Usage: node scripts/check-styles.mjs
 * Exit code 1 when a template names a class its scope cannot reach.
 */
// @ts-check
import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const GLOBAL_STYLESHEET = 'src/styles.scss';
const BACKTICK = String.fromCharCode(96);
/** @param {string} p */
const norm = p => p.replaceAll('\\', '/');

/**
 * Every class a stylesheet declares, with `&` resolved against its parents first: written as
 * `&__size` inside `.tree`, the class is `.tree__size` and nothing in the text says so.
 *
 * @param {string} source
 * @returns {Set<string>}
 */
function classesIn(source) {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
    /** @type {Set<string>} */
    const found = new Set();
    /** @type {string[][]} */
    const stack = [['']];
    let buffer = '';

    for (const character of css) {
        if (character === '{') {
            const selector = buffer.trim();
            buffer = '';
            // The empty selector is what the stack starts with, so it is also what it falls back
            // to: a stylesheet with one `}` too many leaves nothing above, and the classes after
            // it belong to no parent rather than to the last one that happened to be there.
            const parents = stack.at(-1) ?? [''];

            // An at-rule (@media, @supports, @include) is transparent: what nests inside it still
            // belongs to the selectors around it.
            if (selector.startsWith('@')) {
                stack.push(parents);
                continue;
            }

            /** @type {string[]} */
            const resolved = [];
            for (const parent of parents) {
                for (const part of selector
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean)) {
                    resolved.push(
                        part.includes('&') ? part.replaceAll('&', parent) : (parent ? parent + ' ' : '') + part,
                    );
                }
            }
            stack.push(resolved);

            for (const one of resolved) {
                for (const match of one.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
                    if (match[1]) found.add(match[1]);
                }
            }
        } else if (character === '}') {
            buffer = '';
            if (stack.length > 1) stack.pop();
        } else if (character === ';') {
            buffer = '';
        } else {
            buffer += character;
        }
    }

    return found;
}

/**
 * Every class a template names: in `class=`, in a `[class.x]` binding, and the stem of a name the
 * component finishes at runtime (`'row__zone row__zone--' + zone`), which can only be checked as a
 * prefix.
 *
 * @param {string} source
 */
function usedIn(source) {
    const html = source.replace(/<!--[\s\S]*?-->/g, ' ');
    /** @type {Set<string>} */
    const names = new Set();
    /** @type {Set<string>} */
    const stems = new Set();

    for (const match of html.matchAll(/\bclass\s*=\s*"([^"]*)"/g)) {
        for (const token of (match[1] ?? '').split(/[\s{}]+/)) {
            if (/^[_a-zA-Z][\w-]*$/.test(token)) names.add(token);
        }
    }
    for (const match of html.matchAll(/\[class\.([\w-]+)\]/g)) {
        if (match[1]) names.add(match[1]);
    }
    for (const match of html.matchAll(/'([^']*(?:__|--))'/g)) {
        const stem = (match[1] ?? '').trim().split(/\s+/).at(-1);
        if (stem && /^[a-z][\w-]*(?:__|--)$/.test(stem)) stems.add(stem);
    }

    return { names, stems };
}

/**
 * The body of a `template:` or `styles:` backtick literal, `${…}` holes and all.
 *
 * @param {string} source
 * @param {string} key
 * @returns {string[]}
 */
function literalsOf(source, key) {
    /** @type {string[]} */
    const bodies = [];
    const opening = new RegExp(key + '[ ]*:[ ]*' + BACKTICK, 'g');
    let match;

    while ((match = opening.exec(source))) {
        let i = match.index + match[0].length;
        const start = i;
        let holes = 0;

        for (; i < source.length; i++) {
            if (source.charCodeAt(i) === 92) {
                i++;
            } else if (source[i] === '$' && source[i + 1] === '{') {
                holes++;
                i++;
            } else if (source[i] === '}' && holes > 0) {
                holes--;
            } else if (source[i] === BACKTICK && holes === 0) {
                break;
            }
        }

        bodies.push(source.slice(start, i));
    }

    return bodies;
}

/** The global stylesheet and everything it `@use`s, which is what every component can count on. */
function globalClasses() {
    const found = new Set();
    const seen = new Set();

    (function pull(file) {
        if (seen.has(file) || !existsSync(file)) return;
        seen.add(file);

        const source = readFileSync(file, 'utf8');
        for (const one of classesIn(source)) found.add(one);

        for (const match of source.matchAll(/@use\s+'([^']+)'/g)) {
            if (!match[1]) continue;
            const base = norm(join(dirname(file), match[1]));
            const folder = base.slice(0, base.lastIndexOf('/'));
            const name = base.slice(base.lastIndexOf('/') + 1);
            for (const candidate of [`${base}.scss`, `${folder}/_${name}.scss`]) {
                if (existsSync(candidate)) pull(candidate);
            }
        }
    })(GLOBAL_STYLESHEET);

    return found;
}

const global = globalClasses();
const problems = [];
let checked = 0;

for (const file of globSync('src/**/*.ts').map(norm)) {
    if (file.endsWith('.spec.ts')) continue;

    const source = readFileSync(file, 'utf8');
    if (!source.includes('@Component')) continue;

    const reachable = new Set(global);
    /** Where the template is, and its text. @type {[string, string][]} */
    const templates = [];

    for (const match of source.matchAll(/styleUrls?\s*:\s*\[?\s*'([^']+)'/g)) {
        if (!match[1]) continue;
        const sheet = resolve(dirname(file), match[1]);
        if (existsSync(sheet)) for (const one of classesIn(readFileSync(sheet, 'utf8'))) reachable.add(one);
    }
    for (const body of literalsOf(source, 'styles')) {
        for (const one of classesIn(body)) reachable.add(one);
    }

    for (const match of source.matchAll(/templateUrl\s*:\s*'([^']+)'/g)) {
        if (!match[1]) continue;
        const template = resolve(dirname(file), match[1]);
        if (existsSync(template)) templates.push([norm(match[1]), readFileSync(template, 'utf8')]);
    }
    for (const body of literalsOf(source, 'template')) templates.push(['(inline template)', body]);

    for (const [where, body] of templates) {
        checked++;
        const { names, stems } = usedIn(body);
        const declared = [...reachable];

        const missing = [...names].filter(name => {
            if (reachable.has(name)) return false;
            // A block named in the markup only so its parts have something to hang on —
            // `budget-row` with a `budget-row--built` that is styled — is not a missing rule.
            if (declared.some(one => one.startsWith(name + '--') || one.startsWith(name + '__'))) return false;
            return [...stems].every(stem => !name.startsWith(stem));
        });
        for (const stem of stems) {
            if (!declared.some(one => one.startsWith(stem))) missing.push(stem + '…');
        }

        if (missing.length > 0) problems.push({ file, where, missing: [...new Set(missing)].sort() });
    }
}

if (problems.length === 0) {
    console.log(`Styles in scope: ${checked} templates, every class they name has a rule that reaches it.`);
    process.exit(0);
}

console.error('Classes named by a template that no rule in its scope declares:\n');
for (const problem of problems) {
    const where = problem.where.startsWith('(') ? `${problem.file} ${problem.where}` : problem.where;
    console.error(`  ${where}`);
    console.error(`      ${problem.missing.join(', ')}\n`);
}
console.error('Either the rule belongs in the global stylesheet (src/styles/) because more than one');
console.error('component wants it, or it belongs in this component and is not there.');
process.exit(1);
