/**
 * Reading the command line. No dependency for this on purpose: the whole surface is a handful of
 * long flags, and an argument parser would be the only runtime dependency of a tool whose point is
 * that it does not need one.
 */

import { MODES as MODE_LIST } from '../src/app/core/criteria/criteria';
import { type Mode } from '../src/app/core/criteria/criteria.types';
import { type Lang, LANGS as LANG_LIST } from '../src/app/core/i18n/ui-strings';
import { asMember } from '../src/app/core/json/json.utils';
import { parseSize } from '../src/app/core/project/project-context';
import { type FailOn, type Options, type OutputFormat, type ParsedArgs } from './args.types';
import { ERROR_TEXT, type ErrorStrings } from './text/text-errors';

// The two lists the page also uses. Written out again here, they drifted: adding a language would
// have been accepted by the page and rejected by the command.
const MODES: ReadonlySet<Mode> = new Set<Mode>(MODE_LIST);
const LANGS: ReadonlySet<Lang> = new Set<Lang>(LANG_LIST);
const FORMATS: ReadonlySet<OutputFormat> = new Set<OutputFormat>([
    'text',
    'json',
    'markdown',
    'pr-comment',
    'sarif',
    'summary',
    'agent',
    'badge',
]);
const SEVERITIES: ReadonlySet<FailOn> = new Set<FailOn>(['high', 'mid', 'none']);

/** Flags that take a value. Everything else is a switch, which is how a missing value gets caught. */
const WITH_VALUE = new Set([
    '--dist',
    '--entry',
    '--baseline',
    '--export',
    '--project',
    '--mode',
    '--lang',
    '--format',
    '--criteria',
    '--config',
    '--lock',
    '--audit',
    '--what-if',
    '--why',
    '--max-boot',
    '--max-screen',
    '--max-own',
    '--max-growth',
    '--max-growth-pct',
    '--fail-on',
    '--html',
]);

const EMPTY: Options = {
    target: '',
    dist: null,
    baseline: null,
    export: null,
    project: null,
    mode: null,
    criteria: null,
    config: null,
    lock: null,
    audit: null,
    whatIf: [],
    why: [],
    entries: [],
    lang: 'en',
    format: 'text',
    gates: {
        maxBoot: null,
        maxScreen: null,
        screenLimits: {},
        maxOwn: null,
        maxGrowth: null,
        maxGrowthRatio: null,
        failOn: 'none',
        failOnNewPackage: false,
        failOnSignals: [],
    },
    color: true,
    help: false,
    version: false,
    selfCheck: false,
    printConfig: false,
    html: null,
    open: false,
    cache: true,
};

/** A percentage as it is written on the command line (`10`) into the fraction the code compares. */
const parsePercent = (value: string): number | null => {
    const number = Number(value.replace('%', ''));
    return Number.isFinite(number) && number >= 0 ? number / 100 : null;
};

/** The flags that take a size, and the gate each one sets. */
const SIZE_GATES = {
    '--max-boot': 'maxBoot',
    '--max-screen': 'maxScreen',
    '--max-own': 'maxOwn',
    '--max-growth': 'maxGrowth',
} as const;

/** Below this a bare number is a size somebody meant in kilobytes: no bootstrap is that small. */
const BARE_FLOOR = 1000;

/**
 * A size for a gate, or the message saying why not. A number with no unit is bytes, as Angular
 * reads it — and `--max-boot 350` then failed every build with "over the 350 B allowed", which
 * looks like a broken tool rather than a typo. Small enough to be that typo, it is refused with
 * both spellings it could have meant.
 */
const gateSize = (flag: string, value: string, t: ErrorStrings): number | string => {
    const bytes = parseSize(value);
    if (bytes === null) {
        return t.badSize(flag, value);
    }
    const typed = value.trim();
    const typo = bytes < BARE_FLOOR && /^\d+(?:\.\d+)?$/.test(typed);
    return typo ? t.bareSize(flag, typed) : bytes;
};

/**
 * Applies one flag to the options. Returns the message when the value cannot be used, so every
 * rejection names the flag it was about instead of saying "invalid arguments".
 */
const apply = (options: Options, flag: string, value: string, positional: string[], t: ErrorStrings): string | null => {
    switch (flag) {
        case '-h':
        case '--help': {
            options.help = true;
            return null;
        }
        case '-V':
        case '--version': {
            options.version = true;
            return null;
        }
        case '--no-color': {
            options.color = false;
            return null;
        }
        case '--self-check': {
            options.selfCheck = true;
            return null;
        }
        case '--print-config': {
            options.printConfig = true;
            return null;
        }
        case '--html': {
            options.html = value;
            return null;
        }
        case '--open': {
            options.open = true;
            return null;
        }
        case '--no-cache': {
            options.cache = false;
            return null;
        }
        case '--dist': {
            options.dist = value;
            return null;
        }
        case '--baseline': {
            options.baseline = value;
            return null;
        }
        case '--export': {
            options.export = value;
            return null;
        }
        case '--project': {
            options.project = value;
            return null;
        }
        case '--criteria': {
            options.criteria = value;
            return null;
        }
        case '--config': {
            options.config = value;
            return null;
        }
        case '--lock': {
            options.lock = value;
            return null;
        }
        case '--audit': {
            options.audit = value;
            return null;
        }
        case '--what-if': {
            options.whatIf.push(value);
            return null;
        }
        case '--why': {
            options.why.push(value);
            return null;
        }
        case '--entry': {
            options.entries.push(value);
            return null;
        }
        case '--fail-on-new-package': {
            options.gates.failOnNewPackage = true;
            return null;
        }
        case '--mode': {
            const mode = asMember(value, MODES);
            if (mode === null) {
                return t.badMode(value);
            }
            options.mode = mode;
            return null;
        }
        case '--lang': {
            const lang = asMember(value, LANGS);
            if (lang === null) {
                return t.badLang(value);
            }
            options.lang = lang;
            return null;
        }
        case '--format': {
            const format = asMember(value, FORMATS);
            if (format === null) {
                return t.badFormat(value);
            }
            options.format = format;
            return null;
        }
        case '--fail-on': {
            const failOn = asMember(value, SEVERITIES);
            if (failOn === null) {
                return t.badFailOn(value);
            }
            options.gates.failOn = failOn;
            options.gates.failOnTyped = true;
            return null;
        }
        case '--max-boot':
        case '--max-screen':
        case '--max-own':
        case '--max-growth': {
            const size = gateSize(flag, value, t);
            if (typeof size === 'string') {
                return size;
            }
            options.gates[SIZE_GATES[flag]] = size;
            return null;
        }
        case '--max-growth-pct': {
            options.gates.maxGrowthRatio = parsePercent(value);
            return options.gates.maxGrowthRatio === null ? t.badPct(value) : null;
        }
        default: {
            if (flag.startsWith('-')) {
                return t.unknownFlag(flag);
            }
            positional.push(flag);
            return null;
        }
    }
};

/** `--flag=value` and `--flag value` are the same thing; this turns the first into the second. */
const expand = (argv: string[]): string[] =>
    argv.flatMap(argument => {
        const equals = argument.startsWith('--') ? argument.indexOf('=') : -1;
        return equals > 0 ? [argument.slice(0, equals), argument.slice(equals + 1)] : [argument];
    });

export const parseArgs = (argv: string[]): ParsedArgs => {
    // The lists are fresh too: spread, they would be EMPTY's own arrays, and every parse after the
    // first would push onto what the previous one asked.
    const options: Options = { ...EMPTY, whatIf: [], why: [], entries: [], gates: { ...EMPTY.gates } };
    const args = expand(argv);
    const positional: string[] = [];
    // Looked for before anything else, so a mistake in the flags that come before it is already
    // said in the language asked for. One it cannot read is the first mistake, said in English.
    const asked = asMember(args[args.indexOf('--lang') + 1] ?? '', LANGS);
    const lang = args.includes('--lang') && asked ? asked : 'en';
    const t = ERROR_TEXT[lang];

    for (let index = 0; index < args.length; index++) {
        const flag = args[index] ?? '';
        const takesValue = WITH_VALUE.has(flag);
        const value = takesValue ? args[++index] : undefined;
        if (takesValue && value === undefined) {
            return { ok: false, lang, message: t.needsValue(flag) };
        }

        const failed = apply(options, flag, value ?? '', positional, t);
        if (failed) {
            return { ok: false, lang, message: failed };
        }
    }

    if (options.help || options.version || options.printConfig) {
        return { ok: true, options };
    }

    const target = positional[0];
    if (!target) {
        return { ok: false, lang, message: t.missingTarget };
    }
    if (positional.length > 1) {
        return { ok: false, lang, message: t.unexpected(positional[1] ?? '') };
    }
    return options.open && !options.html
        ? { ok: false, lang, message: t.openNeedsHtml }
        : { ok: true, options: { ...options, target } };
};
