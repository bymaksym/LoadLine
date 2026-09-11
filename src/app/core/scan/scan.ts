/**
 * The rest of what reading the build says: development leftovers, licences, third-party services,
 * and what a deployed source map gives away.
 *
 * The three of them share one property worth stating: they are all **free**. The chunk text is
 * already in memory for the compressed sizes, the metafile already names every input, and the maps
 * were already parsed for the per-file weights. None of this costs a request, a registry lookup or
 * a byte leaving the machine.
 */

import { type ModuleEntry } from '../analysis/analysis.types';
import { isSourceMap, segmentsOf, sourceAt } from '../analysis/sourcemap';
import { packageOf } from '../format/format.utils';
import { categoryOf } from './catalog';
import {
    type Leftover,
    type LicenceClass,
    type LicenceFound,
    type ScanReport,
    type SourceMapExposure,
    type ThirdPartyGroup,
} from './scan.types';
import { findSecrets } from './secrets';

/** The legal comments a minifier keeps on purpose: `/*!` and anything with `@license`. */
const LEGAL_COMMENT = /\/\*[!*][\S\s]*?\*\//g;

/**
 * Licence identifiers, and how each one has to be treated.
 *
 * The classification is the point, not the name: "you ship GPL code" is only useful next to "and
 * that is the kind that has conditions". Ordered longest-first so `AGPL-3.0` is not read as `GPL`.
 */
const LICENCES: { id: string; pattern: RegExp; class: LicenceClass }[] = [
    { id: 'AGPL', pattern: /\bAGPL(?:-\d(?:\.\d)?)?\b/i, class: 'strongCopyleft' },
    { id: 'LGPL', pattern: /\bLGPL(?:-\d(?:\.\d)?)?\b/i, class: 'weakCopyleft' },
    { id: 'GPL', pattern: /\bGPL(?:-\d(?:\.\d)?)?\b/i, class: 'strongCopyleft' },
    { id: 'SSPL', pattern: /\bSSPL\b/i, class: 'strongCopyleft' },
    { id: 'MPL', pattern: /\bMPL(?:-\d(?:\.\d)?)?\b/i, class: 'weakCopyleft' },
    { id: 'EPL', pattern: /\bEPL(?:-\d(?:\.\d)?)?\b/i, class: 'weakCopyleft' },
    { id: 'CC-BY-NC', pattern: /\bCC[ -]BY[ -]NC\b/i, class: 'nonCommercial' },
    { id: 'MIT', pattern: /\bMIT\b/, class: 'permissive' },
    { id: 'Apache-2.0', pattern: /\bApache(?:[ -]License)?[ -]?2\.0\b/i, class: 'permissive' },
    { id: 'BSD', pattern: /\bBSD(?:-\d-Clause)?\b/i, class: 'permissive' },
    { id: 'ISC', pattern: /\bISC\b/, class: 'permissive' },
];

/**
 * Leftovers read from the **text** of the build.
 *
 * Only these two, and that is a correction rather than a limitation. A development build used to be
 * detected by searching the chunks for `react-dom.development` and `__vite_ping` — and the first
 * thing that found was Loadline's own bundle, which carries those strings precisely because it is
 * the tool that looks for them. Any project holding a linter rule, a piece of documentation or
 * another scanner would have got the same wrong answer, stated with the same confidence.
 *
 * `console.log` and `debugger` stay here, but no longer on the strength of the substring alone.
 * "A false one costs nothing" turned out to be wrong in the one place it mattered: `@angular/core`
 * ships a console service whose body is literally `log(n){console.log(n)}`, so every Angular
 * application ever read — five out of five, probes and real projects — was told it had a
 * development leftover in it, pointing at framework code nobody can remove. When there is a source
 * map, the position of each match is resolved to the file it came from and only the project's own
 * ones are counted. When there is not, the count is kept and marked unattributed, and the report
 * says so rather than claiming an author it cannot know.
 */
const DEV_MARKERS: { kind: Leftover['kind']; pattern: RegExp }[] = [
    { kind: 'consoleLogs', pattern: /\bconsole\.log\(/g },
    { kind: 'debugger', pattern: /\bdebugger\b\s*[;}]/g },
];

/**
 * Leftovers read from the **inputs** the metafile names: a fact about what was compiled rather than
 * a guess about what the output says.
 *
 * A file called `react-dom.development.js` is in the bundle or it is not. The string
 * `react-dom.development` appearing somewhere inside a chunk means nothing at all.
 */
const DEV_INPUTS: { kind: Leftover['kind']; pattern: RegExp }[] = [
    { kind: 'reactDev', pattern: /\/(?:react-dom|react|scheduler)[^/]*\/.*\.development\.js$/i },
    { kind: 'devServer', pattern: /node_modules\/(?:webpack-dev-server|sockjs-client|vite\/dist\/client)\//i },
    { kind: 'testFiles', pattern: /\.(?:spec|test|stories|story|cy|e2e)\.[jt]sx?$/i },
];

const licencesOf = (texts: ReadonlyMap<string, string>): LicenceFound[] => {
    const found = new Map<string, LicenceFound>();

    // Only the first identifier of each comment: a licence header that mentions MIT while granting
    // Apache would otherwise be counted as both.
    const record = (chunk: string, comment: string): void => {
        const licence = LICENCES.find(entry => entry.pattern.test(comment));
        if (!licence) {
            return;
        }

        const entry = found.get(licence.id) ?? { id: licence.id, class: licence.class, chunks: [], packages: [] };
        if (!entry.chunks.includes(chunk)) {
            entry.chunks.push(chunk);
        }
        // The package name, when the comment carries one. Most do: a bundler copies the header of
        // the file it came from, and those usually start with the library's own name.
        const named = /(?:^|\s)((?:@[\w.-]+\/)?[a-z][\w.-]{2,})(?:\s+v?\d|\.js|\s+\|)/i.exec(comment)?.[1];
        if (named && !entry.packages.includes(named)) {
            entry.packages.push(named);
        }

        found.set(licence.id, entry);
    };

    for (const [chunk, text] of texts) {
        for (const [comment] of text.matchAll(LEGAL_COMMENT)) {
            record(chunk, comment);
        }
    }

    const rank: Record<LicenceClass, number> = {
        strongCopyleft: 0,
        nonCommercial: 1,
        weakCopyleft: 2,
        unknown: 3,
        permissive: 4,
    };
    return [...found.values()].toSorted((a, b) => rank[a.class] - rank[b.class]);
};

const leftoversOf = (
    texts: ReadonlyMap<string, string>,
    modules: readonly ModuleEntry[],
    maps: readonly { name: string; text: string }[],
): Leftover[] => {
    const found: Leftover[] = [];
    const readers = new Map<string, ((index: number) => string | null) | null>();

    /**
     * Where a position of a chunk came from, when the chunk has a map next to it. Built once per
     * chunk and only for a chunk something matched in, so a build nobody has a leftover in pays
     * nothing for this.
     */
    const readerFor = (chunk: string, text: string): ((index: number) => string | null) | null => {
        if (readers.has(chunk)) {
            return readers.get(chunk) ?? null;
        }

        const map = maps.find(entry => entry.name === `${chunk}.map`);
        let reader: ((index: number) => string | null) | null = null;
        try {
            const parsed: unknown = map ? JSON.parse(map.text) : null;
            if (isSourceMap(parsed)) {
                const segments = segmentsOf(parsed);
                // Line starts once, so resolving a position is a binary search rather than a
                // count of newlines from the top of a minified megabyte.
                const starts = [0];
                for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
                    starts.push(i + 1);
                }
                reader = (index: number): string | null => {
                    let low = 0;
                    let high = starts.length - 1;
                    while (low < high) {
                        const middle = Math.ceil((low + high) / 2);
                        if ((starts[middle] ?? 0) <= index) {
                            low = middle;
                        } else {
                            high = middle - 1;
                        }
                    }
                    return sourceAt(segments, low, index - (starts[low] ?? 0));
                };
            }
        } catch {
            // A map that will not parse says nothing about the build, only about the file.
        }

        readers.set(chunk, reader);
        return reader;
    };

    /**
     * How many of a marker's matches in one chunk are the project's own, and whether that could be
     * decided at all. Without a map the honest answer is "all of them, and I do not know whose".
     */
    const countIn = (chunk: string, text: string, pattern: RegExp): { count: number; attributed: boolean } => {
        const hits = [...text.matchAll(pattern)];
        if (hits.length === 0) {
            return { count: 0, attributed: true };
        }

        const reader = readerFor(chunk, text);
        if (!reader) {
            return { count: hits.length, attributed: false };
        }

        const mine = hits.filter(hit => {
            const source = reader(hit.index);
            return source !== null && !source.includes('node_modules');
        });
        return { count: mine.length, attributed: true };
    };

    for (const { kind, pattern } of DEV_MARKERS) {
        let count = 0;
        let attributed = true;
        const where: string[] = [];
        for (const [chunk, text] of texts) {
            const hits = countIn(chunk, text, pattern);
            attributed &&= hits.attributed;
            if (hits.count > 0) {
                count += hits.count;
                where.push(chunk);
            }
        }
        if (count > 0) {
            found.push({ kind, count, where, attributed });
        }
    }

    // These are read from the inputs the metafile names rather than from the text of a chunk, so
    // there is nothing to attribute: the file is in the build or it is not.
    for (const { kind, pattern } of DEV_INPUTS) {
        const hit = modules.filter(module => pattern.test(module.path));
        if (hit.length > 0) {
            found.push({ kind, count: hit.length, where: hit.map(module => module.label), attributed: true });
        }
    }

    return found;
};

/**
 * How much of the first load is a service rather than the application.
 *
 * The list this reads is in `catalog.ts`, with the argument for why a list is the right tool for
 * this one question and the wrong one everywhere else in this project.
 */
const thirdPartyOf = (modules: readonly ModuleEntry[], boot: ReadonlySet<string>): ThirdPartyGroup[] => {
    const byCategory = new Map<string, Map<string, { bytes: number; inBoot: boolean }>>();

    for (const module of modules) {
        const pkg = module.pkg ?? packageOf(module.path);
        const category = pkg ? categoryOf(pkg) : null;
        if (!pkg || !category) {
            continue;
        }

        const packages = byCategory.get(category) ?? new Map<string, { bytes: number; inBoot: boolean }>();
        const entry = packages.get(pkg) ?? { bytes: 0, inBoot: false };
        entry.bytes += module.bytes;
        entry.inBoot ||= module.places.some(place => boot.has(place.chunk));
        packages.set(pkg, entry);
        byCategory.set(category, packages);
    }

    return [...byCategory]
        .map(([category, packages]): ThirdPartyGroup => {
            const list = [...packages]
                .map(([name, entry]) => ({ name, bytes: entry.bytes, inBoot: entry.inBoot }))
                .toSorted((a, b) => b.bytes - a.bytes);

            return {
                category,
                packages: list,
                bytes: list.reduce((sum, pkg) => sum + pkg.bytes, 0),
                bootBytes: list.filter(pkg => pkg.inBoot).reduce((sum, pkg) => sum + pkg.bytes, 0),
            };
        })
        .toSorted((a, b) => b.bootBytes - a.bootBytes || b.bytes - a.bytes);
};

/**
 * What a deployed source map actually gives away.
 *
 * The report has warned that maps are in the folder for a while, and that sentence gets ignored,
 * because "you have source maps published" sounds like a configuration nicety. "You have 1.400
 * files of your source published, here are the paths" does not, and it is the same fact.
 */
export const exposureOf = (maps: readonly { name: string; text: string }[]): SourceMapExposure | null => {
    if (maps.length === 0) {
        return null;
    }

    const paths = new Set<string>();
    let hasContent = false;
    let envReferences = 0;

    for (const map of maps) {
        try {
            const parsed = JSON.parse(map.text) as { sources?: string[]; sourcesContent?: (string | null)[] };
            const sources = parsed.sources ?? [];
            for (const source of sources) {
                if (!source.includes('node_modules')) {
                    paths.add(source.replace(/^(?:\.\.\/)+/, ''));
                }
            }

            const contents = parsed.sourcesContent ?? [];
            hasContent ||= contents.some(content => typeof content === 'string' && content.length > 0);
            for (const content of contents) {
                envReferences += [...(content ?? '').matchAll(/\bprocess\.env\.[A-Z][\dA-Z_]{2,}/g)].length;
            }
        } catch {
            // A map that will not parse says nothing about the build, only about the file.
        }
    }

    return { maps: maps.length, ownFiles: paths.size, hasContent, paths: [...paths], envReferences };
};

export interface ScanInput {
    /** Chunk name → text. Scripts and stylesheets: what a browser actually downloads. */
    texts: ReadonlyMap<string, string>;
    modules: readonly ModuleEntry[];
    boot: ReadonlySet<string>;
    /** The `.js.map` files, with their text. Empty when the folder carried none. */
    maps: readonly { name: string; text: string }[];
}

export const scanBuild = (input: ScanInput): ScanReport => ({
    secrets: findSecrets(input.texts),
    leftovers: leftoversOf(input.texts, input.modules, input.maps),
    licences: licencesOf(input.texts),
    thirdParty: thirdPartyOf(input.modules, input.boot),
    exposure: exposureOf(input.maps),
});
