/**
 * Three things that ship inside the bundle without being code anybody wrote for this screen. None
 * of them is found by looking at what is heavy — they are small enough to hide in a treemap and
 * they are all avoidable, which is why they are worth naming:
 *
 * - **Every language of a library, to use one.** The classic 90 % cut: a date library that ships
 *   its whole `locale/` folder.
 * - **Data shipped as code.** An `import` of a `.json` embeds the file in a chunk of JavaScript
 *   instead of referencing it.
 * - **The source maps left in the deployed folder.** Not weight — whoever downloads them has the
 *   original source.
 *
 * The rules use folder conventions and file extensions, never a list of package names: a list would
 * be wrong for the library that comes out next year and right only for the ones in fashion today.
 */

import { type Analysis, type ModuleEntry, type SplitDrift } from '../analysis/analysis.types';
import { type Criteria } from '../criteria/criteria.types';
import { formatBytes } from '../format/format.utils';
import { type Lang } from '../i18n/ui-strings';
import { type Finding } from './finding.types';
import { TEXT } from './finding-text';

/**
 * A file named after a language: `es.js`, `pt-BR.json`, `zh-Hant.mjs`. Counting **codes** and not
 * files is what keeps the count right — `date-fns` splits one language across ten files under
 * `locale/en-US/_lib/`, and counting those would report ten languages where there is one.
 */
const LOCALE_CODE = /^([a-z]{2,3})(-[A-Za-z0-9]{2,8})?$/;

/**
 * What a library calls the folder it keeps its languages in. `locale` and `locales` were the whole
 * list, which quietly meant that a package shipping them under `i18n/` — which plenty do — raised
 * nothing at all.
 */
const LOCALE_FOLDERS = new Set(['locale', 'locales', 'i18n', 'lang', 'langs', 'languages', 'translations']);

/**
 * The language a file belongs to, if it belongs to one. Libraries name it in two places and both
 * are needed: `moment/locale/es.js` and `primelocale/es.json` put it in the file name,
 * `date-fns/locale/es/index.js` puts it in the folder right after `locale/`.
 */
const localeOf = (path: string): string | null => {
    const parts = path.split('/');
    const marker = parts.findIndex(part => LOCALE_FOLDERS.has(part));
    const candidates = marker === -1 ? [parts.at(-1)] : [parts[marker + 1], parts.at(-1)];

    for (const candidate of candidates) {
        const code = (candidate ?? '').replace(/\.[^.]+$/, '');
        if (LOCALE_CODE.test(code)) {
            return code;
        }
    }

    return null;
};

const sum = (modules: ModuleEntry[]): number => modules.reduce((total, module) => total + module.bytes, 0);

/** The worst place a set of files lands: the bootstrap is the one everybody pays for. */
const inBoot = (modules: ModuleEntry[]): boolean =>
    modules.some(module => module.places.some(place => place.zone === 'boot'));

/**
 * Languages of a library, shipped whole. Grouped by package because that is the unit the decision
 * is about: one `moment` shipping 130 locales is one finding, not 130.
 */
const localePackages = (analysis: Analysis, c: Criteria) => {
    const byPackage = new Map<string, ModuleEntry[]>();

    for (const module of analysis.modules) {
        if (module.pkg && localeOf(module.path)) {
            byPackage.set(module.pkg, [...(byPackage.get(module.pkg) ?? []), module]);
        }
    }

    return [...byPackage]
        .map(([pkg, modules]) => ({
            pkg,
            modules,
            bytes: sum(modules),
            codes: new Set(modules.map(module => localeOf(module.path))).size,
        }))
        .filter(entry => entry.codes >= c.minLocales && entry.bytes >= c.shippedMinBytes)
        .toSorted((a, b) => b.bytes - a.bytes);
};

const localeFinding = (analysis: Analysis, lang: Lang, c: Criteria): Finding | null => {
    const text = TEXT[lang];
    const worst = localePackages(analysis, c);

    const top = worst[0];
    if (!top) {
        return null;
    }

    const boot = worst.some(entry => inBoot(entry.modules));
    // Every language file, whichever package it belongs to: the fix is one import per package and
    // what it takes off is what those files weigh where they land.
    const files = worst.flatMap(entry => entry.modules.map(module => module.path));
    return {
        severity: boot ? 'mid' : 'info',
        target: { tab: 'search', key: top.pkg },
        kind: 'locales',
        saving: boot ? analysis.insights().exclusiveOf(files) : 0,
        sources: boot ? files : [],
        ...text.locales({
            packages: worst.map(entry => ({
                name: entry.pkg,
                files: entry.codes,
                size: formatBytes(entry.bytes),
            })),
            size: formatBytes(worst.reduce((total, entry) => total + entry.bytes, 0)),
            boot,
        }),
    };
};

/** Files that are data, embedded in a chunk because somebody imported them instead of asking for them. */
const dataFinding = (analysis: Analysis, lang: Lang, c: Criteria, counted: ReadonlySet<string>): Finding | null => {
    const text = TEXT[lang];
    // Whatever the languages signal already reported is not reported twice with different advice.
    const data = analysis.modules.filter(module => module.path.endsWith('.json') && !counted.has(module.path));
    const bytes = sum(data);
    if (data.length === 0 || bytes < c.shippedMinBytes) {
        return null;
    }

    const heaviest = data.toSorted((a, b) => b.bytes - a.bytes);
    const boot = inBoot(data);
    const files = data.map(module => module.path);
    return {
        severity: boot ? 'mid' : 'info',
        target: { tab: 'search', key: heaviest[0]?.label ?? '' },
        kind: 'dataAsCode',
        saving: boot ? analysis.insights().exclusiveOf(files) : 0,
        sources: boot ? files : [],
        ...text.dataAsCode({
            count: data.length,
            size: formatBytes(bytes),
            items: heaviest.map(module => ({ name: module.label, size: formatBytes(module.bytes) })),
            boot,
        }),
    };
};

/** The two signals that come out of the analysis alone. */
export const buildShippedFindings = (analysis: Analysis, lang: Lang, c: Criteria): Finding[] => {
    const asLocales = new Set(localePackages(analysis, c).flatMap(entry => entry.modules.map(module => module.path)));

    return [localeFinding(analysis, lang, c), dataFinding(analysis, lang, c, asLocales)].filter(
        (finding): finding is Finding => !!finding,
    );
};

/**
 * What the build folder itself gives away. Conditional on purpose: the folder dropped here may be a
 * local build rather than the one that gets deployed, and the report says so instead of accusing.
 */
/**
 * A screen row nobody can identify: `chunk-Brh4_81T`, `0fPdmq0U`.
 *
 * The `chunk-` prefix is decisive on its own — no one names a route that, and it is what Angular
 * writes for every lazy chunk. Past that the test is deliberately strict: mixed case **and** a
 * digit, so a screen that really is called `Dashboard` is never mistaken for a hash. Missing one is
 * a hint not given; claiming one wrongly is the report calling a real name gibberish.
 */
const unnamedScreen = (label: string): boolean => {
    const rest = label.replace(/^chunk[-._]/i, '');
    if (rest !== label) {
        return true;
    }
    return /^[\dA-Za-z_-]{6,}$/.test(rest) && /[a-z]/.test(rest) && /[A-Z]/.test(rest) && /\d/.test(rest);
};

/**
 * How far the two measurements of the same chunks have to be apart before it is worth a line.
 *
 * A per-file breakdown never lands exactly on the file: a bundler's own runtime is in the output
 * and belongs to no input. Measured on an Angular 17 build the sum is 99 % of the file, which is
 * that overhead and nothing else. At five per cent something other than rounding is going on, and
 * at fifteen every figure measured inside a chunk is wrong by enough to change what somebody does
 * about it — that is where it stops being a note and becomes the first thing to fix.
 */
const DRIFT_WORTH_SAYING = 0.05;
const DRIFT_WORTH_ACTING_ON = 0.15;

/**
 * And how many bytes apart, which is the half a percentage cannot express.
 *
 * That overhead — the module wrapper, the banners, the `sourceMappingURL` line — is a fixed cost per
 * chunk and not a proportion of one. A plain esbuild build of five chunks weighing 90 to 330 bytes
 * each came out at **59 %**, which read as a `mid` on a build where nothing whatsoever was wrong:
 * 395 bytes of wrapper across five tiny chunks. On anything the size of a real application the same
 * 395 bytes are invisible. So the ratio says whether it matters and this says whether it is real,
 * and both have to agree before a line is printed.
 */
const DRIFT_OVERHEAD_PER_CHUNK = 1024;

/**
 * The report's own margin of error, when it has one and can measure it.
 *
 * Every figure taken from *inside* a chunk is a sum of per-file weights, and the chunk's own weight
 * is a second measurement of the same thing. When they disagree the first set is wrong by exactly
 * that ratio — measured here at 125 % on three Angular 22 builds, where the metafile is written
 * before a later pass shrinks the output — while the headline weight beside it stays exact. Nothing
 * said so, and a quarter is enough to change which row somebody spends an afternoon on.
 */
const driftFinding = (drift: SplitDrift | null, lang: Lang): Finding[] => {
    if (!drift) {
        return [];
    }

    const off = Math.abs(drift.ratio - 1);
    const bytes = Math.abs(drift.measured - drift.file);
    if (off < DRIFT_WORTH_SAYING || bytes < DRIFT_OVERHEAD_PER_CHUNK * drift.chunks) {
        return [];
    }

    return [
        {
            severity: off >= DRIFT_WORTH_ACTING_ON ? 'mid' : 'info',
            kind: 'splitDrift',
            ...TEXT[lang].splitDrift({
                percent: Math.round(drift.ratio * 100),
                off: Math.round(off * 100),
                high: drift.ratio > 1,
                chunks: drift.chunks,
                file: formatBytes(drift.file),
                measured: formatBytes(drift.measured),
            }),
        },
    ];
};

export const buildFolderFindings = (
    build: { sourceMaps: number; derived: boolean; screens?: readonly string[]; drift?: SplitDrift | null },
    lang: Lang,
): Finding[] => {
    // The drift is about the metafile, not about the folder, so it is raised whichever way in was
    // used and whether or not the maps are there: the early returns below are about the folder.
    const drift = driftFinding(build.drift ?? null, lang);

    if (build.sourceMaps > 0) {
        return [
            ...drift,
            { severity: 'info', kind: 'sourceMaps', ...TEXT[lang].sourceMaps({ count: build.sourceMaps }) },
        ];
    }

    if (!build.derived) {
        return drift;
    }

    /**
     * The other half of the same fact, and the one nothing said out loud. A folder read without
     * maps knows what a chunk weighs and not what is inside it, so every screen is named after its
     * chunk file — on a real build that means rows called `0fPdmq0U`, and nothing in the report
     * explained why or what to do about it. Only for a folder: a `stats.json` names every file
     * whether or not the build shipped maps.
     *
     * It said it as context, at the bottom, in a card about source maps — and on a real Angular
     * application with eighteen screens, all eighteen rows unreadable, that is the finding that
     * decides whether the table can be used at all. When every row is a hash it is named as what it
     * is and it stops being a footnote.
     */
    const unnamed = (build.screens ?? []).filter(label => unnamedScreen(label)).length;
    const blind = unnamed > 0 && unnamed === (build.screens ?? []).length;

    return [
        ...drift,
        {
            severity: blind ? 'mid' : 'info',
            kind: 'noSourceMaps',
            ...TEXT[lang].noSourceMaps({ unnamed: blind ? unnamed : 0 }),
        },
    ];
};
