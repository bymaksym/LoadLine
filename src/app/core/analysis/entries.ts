/**
 * Which outputs the browser actually downloads, and which lazy entries are screens.
 *
 * Both questions used to have an obvious answer and no longer do: a build with server-side
 * rendering writes both sides into one metafile, and a deferred block (`@defer`, a `lazy()` inside
 * a component) produces a lazy entry that looks exactly like a route's. Getting either wrong moves
 * every figure in the report, so they are kept here, apart and tested.
 */

import { type Criteria } from '../criteria/criteria.types';
import { baseName, ROUTE_SUFFIXES, SOURCE_EXTENSION, VIEW_SUFFIXES } from '../format/format.utils';
import { type ScreenMark } from './analysis.types';
import { type Metafile, type MetafileImport } from './metafile.types';

/**
 * Where a server build lands **when the path says so**. Angular used to write `server/` into the
 * metafile and most SSR setups still do, but this is only half the answer now: Angular 22 writes
 * `main.server.mjs`, `server.mjs` and a dozen shared chunks with no folder in front of them, and a
 * name rule cannot see those without becoming a list of conventions. The other half is
 * `holdsBrowserSide` below, which does not read names at all.
 */
const SERVER_OUTPUT = /(^|\/)server\//;

/** A file that only groups routes: it owns no code of its own. `.jsx`/`.tsx` for the React case. */
export const ROUTE_FILE = new RegExp(String.raw`\.(?:${ROUTE_SUFFIXES.join('|')})\.${SOURCE_EXTENSION}$`);

/**
 * A lazy entry that is data rather than a screen: `import('./locales/es.json')`, a table of
 * countries, a dictionary. Nobody navigates to one, and counting them as screens is not a rounding
 * error — Excalidraw lazy-loads fifty languages, and its screens table came out with sixty-one rows
 * for an application that has one screen.
 *
 * Two ways in, because a JSON chunk usually ships without a source map and then the only thing left
 * is what the bundler called the file: the source itself ends in `.json`, or the chunk is named
 * after the JSON it holds (`ru-RU.json-CCWdKmrX.js`, which is Vite's and Rollup's naming). The
 * extension is the file's own, not a convention somebody here chose.
 */
const DATA_ENTRY = /\.json$|\.json-[\w-]+\.m?js$/;

/**
 * A view: what Angular calls a component or a page, and what any framework defers inside one.
 *
 * The list of suffixes is the same one that reads a screen's name off its file. They had drifted:
 * `user.view.ts` counted as a view here while the label only knew how to strip `.page` and
 * `.component`, so that screen was listed as `user.view`.
 */
const VIEW_FILE = new RegExp(String.raw`\.(?:${VIEW_SUFFIXES.join('|')})\.${SOURCE_EXTENSION}$`);

/**
 * The browser side of a build. Nobody downloads the server bundle, and it is usually the bigger of
 * the two, so leaving it in would make the main entry — "the one that reaches the most" — be the
 * server's, and the whole report would be about code no browser ever asks for.
 *
 * Two rules, and the second is the one that holds:
 *
 * 1. The path says `server/`. Cheap, and all there was for a long time.
 * 2. **The browser folder does not hold the file.** When somebody points at the folder the browser
 *    is served — which is what `--dist` and the drop zone both take — that folder *is* the answer
 *    to "what does a browser download", measured rather than named. An output of the build that is
 *    not a file in it is not something anybody downloads, whatever it is called.
 *
 * The second rule is what an Angular 22 build with SSR needs: it writes `main.server.mjs`,
 * `server.mjs`, `polyfills.server.mjs` and nine shared chunks into the same metafile as the browser
 * ones, with no folder in front of any of them. Read with rule 1 alone, that build came out with
 * six screens where it has three — every screen counted once per side — a bootstrap of 744 kB
 * where it is 105, and `express`'s dependencies reported as duplicate packages the browser pays
 * for twice.
 *
 * @param inFolder base names of the files the build folder holds, or `null` when no folder was
 *                 given and only rule 1 can be applied.
 *
 * How many outputs were left out is returned, so the reader knows this happened instead of
 * wondering why the figures do not match the folder.
 */
export const browserSide = (
    all: Metafile['outputs'],
    inFolder: ReadonlySet<string> | null = null,
): { outputs: Metafile['outputs']; serverOutputs: number } => {
    const files = Object.keys(all);
    const elsewhere = (file: string) =>
        SERVER_OUTPUT.test(file) || (inFolder !== null && !inFolder.has(baseName(file)));
    const server = files.filter(file => elsewhere(file));

    // Leaving everything out is never the answer. It means either a metafile of nothing but server
    // outputs — somebody analysing their server bundle on purpose — or a folder from a different
    // build than the stats file, where every name mismatches. Both are better read whole than
    // reported as an empty application.
    if (server.length === 0 || server.length === files.length) {
        return { outputs: all, serverOutputs: 0 };
    }

    const outputs = Object.fromEntries(files.filter(file => !elsewhere(file)).map(file => [file, all[file]!]));
    return { outputs, serverOutputs: server.length };
};

/**
 * Own source files that lazily import each file. Who pulls something in is what says whether it is
 * a screen of its own or a piece of one, so it is worked out before the screens are decided — and
 * it doubles as "who lazy-loads this screen", which is where a route's providers go.
 */
export const lazyLoadersOf = (inputs: Metafile['inputs'], isOwn: (path: string) => boolean): Map<string, string[]> => {
    const loaders = new Map<string, string[]>();

    for (const [input, data] of Object.entries(inputs)) {
        if (!isOwn(input)) {
            continue;
        }

        const imports = data.imports ?? [];
        for (const imp of imports) {
            if (imp.kind === 'dynamic-import') {
                loaders.set(imp.path, [...(loaders.get(imp.path) ?? []), input]);
            }
        }
    }

    return loaders;
};

/**
 * Whether a lazy entry only groups routes rather than being one of them. It is measured, not read
 * off the file name: a file that adds practically no bytes of its own to its chunk, holds nothing
 * but dynamic imports and produces a chunk no other file is grouped with has no screen inside it —
 * what it loads is the screen.
 *
 * The three conditions are all needed, and being strict is the point: mistaking a screen for a
 * grouper loses a row of the report, which is the expensive direction to be wrong in. A screen can
 * be small, and a screen can defer a widget and nothing else; what it cannot do is be all three at
 * once, because its own imports are what its chunk carries.
 *
 * `*.routes.ts` still passes by name. Not because the rule needs it — this is what stops the
 * detection from depending on a naming convention that Angular's own style guide is dropping — but
 * because a routes file with a guard or a provider in it has a static import and would otherwise
 * turn into a screen row where there was none before.
 */
export const isRouteGrouper = (
    entry: {
        source: string;
        /**
         * What the file itself contributes to its chunk, from `bytesInOutput`. `null` when nothing
         * measured it — a folder read without source maps knows the weight of a chunk and not of
         * what is inside it — and then the rule does not fire. Reading "not measured" as "weighs
         * nothing" would turn a small screen into a grouper and drop its row from the report, which
         * is the expensive direction to be wrong in.
         */
        ownBytes: number | null;
        /** The file's imports in the source graph. */
        imports: readonly MetafileImport[];
        /** The imports of the chunk it produces: a grouping chunk pulls nothing along with it. */
        chunkImports: readonly MetafileImport[];
    },
    /**
     * What a grouping file is allowed to weigh inside its own chunk. A table of routes compiles to
     * paths and arrow functions and nothing else; a screen carries at least a template. The
     * recommended kibibyte is well above the first and well below the second, and it is a criterion
     * rather than a constant of this file so it can be moved for a project that sits between them.
     */
    grouperMaxBytes: Criteria['grouperMaxBytes'],
): boolean => {
    const lazyOnly = (imports: readonly MetafileImport[]) => imports.every(imp => imp.kind === 'dynamic-import');

    return (
        ROUTE_FILE.test(entry.source) ||
        (entry.ownBytes !== null &&
            entry.ownBytes <= grouperMaxBytes &&
            // More than one, because a file that groups routes groups several of them. With a
            // single dynamic import there is nothing left to tell a grouping file from a small
            // screen that defers one widget — which is what a Nuxt page turned out to be, and it
            // disappeared from the screens table while the widget took its row.
            entry.imports.length > 1 &&
            lazyOnly(entry.imports) &&
            lazyOnly(entry.chunkImports))
    );
};

/**
 * Whether a lazy entry is a piece of a screen rather than a screen. As deferred blocks become the
 * normal way to split a page, counting them as screens would inflate the count and lower the median
 * with things nobody ever enters.
 *
 * The evidence has to be positive: it is a block only when **every** file that lazily imports it is
 * a view, or is itself one of these lazy entries. Anything else stays a screen, which is what it
 * was before this rule existed.
 *
 * This half is still read off the file name, and the report says so: what a framework calls a view
 * is not measurable from the graph the way a grouping file is. Rather than keep adding names to the
 * expression, the screens table lets a row be reclassified by hand.
 *
 * @param loaders     own files that lazily import this source
 * @param lazySources sources of every own lazy entry, to catch a screen deferring another one
 */
export const isDeferredBlock = (loaders: string[], lazySources: ReadonlySet<string>): boolean =>
    loaders.length > 0 && loaders.every(file => VIEW_FILE.test(file) || lazySources.has(file));

/**
 * What every lazy entry of the project code is: a screen, a piece of one, a file that only groups
 * routes, or data. The answers are worked out together because they depend on each other — a
 * grouping file has to leave before the rest are decided, or the screens under it would look like
 * pieces of it.
 *
 * @param read the build and what has been said about it: the metafile's two halves, how many bytes
 *             an entry contributes to its chunk, who lazy-loads each source, and the marks.
 */
export const classifyLazyEntries = <T extends { chunk: string; source: string }>(
    entries: readonly T[],
    read: {
        inputs: Metafile['inputs'];
        outputs: Metafile['outputs'];
        /** What an entry weighs inside its own chunk, or `null` when nothing measured it. */
        ownBytesOf: (chunk: string, input: string) => number | null;
        loaders: Map<string, string[]>;
        marks: ReadonlyMap<string, ScreenMark> | null;
        grouperMaxBytes: Criteria['grouperMaxBytes'];
    },
): { screens: T[]; blocks: T[]; groupers: T[]; data: T[] } => {
    const grouping = new Set(
        entries
            .filter(entry =>
                isRouteGrouper(
                    {
                        source: entry.source,
                        ownBytes: read.ownBytesOf(entry.chunk, entry.source),
                        imports: read.inputs[entry.source]?.imports ?? [],
                        chunkImports: read.outputs[entry.chunk]?.imports ?? [],
                    },
                    read.grouperMaxBytes,
                ),
            )
            .map(entry => entry.source),
    );

    /**
     * What counts as "a lazy entry deferring another one", which is half of what makes something a
     * block. The grouping files are left out, marks aside: a screen reached through a lazy routes
     * file is still a screen, and a grouping file somebody promoted to a screen by hand is still a
     * list of somewhere-elses — counting it as a loader would turn every screen under it into a
     * piece of it, which is twelve rows of a real report disappearing on one click.
     */
    const lazySources = new Set(entries.filter(entry => !grouping.has(entry.source)).map(entry => entry.source));

    const kindOf = (entry: T): 'screens' | 'blocks' | 'groupers' | 'data' => {
        const mark = read.marks?.get(entry.source);
        if (mark) {
            return mark === 'block' ? 'blocks' : 'screens';
        }
        // Data first: a language file is not a screen, not a piece of one and not a routes file,
        // and it is the one of the four that can be told from the file itself.
        if (DATA_ENTRY.test(entry.source)) {
            return 'data';
        }
        if (grouping.has(entry.source)) {
            return 'groupers';
        }
        return isDeferredBlock(read.loaders.get(entry.source) ?? [], lazySources) ? 'blocks' : 'screens';
    };

    const kinds: { screens: T[]; blocks: T[]; groupers: T[]; data: T[] } = {
        screens: [],
        blocks: [],
        groupers: [],
        data: [],
    };
    for (const entry of entries) {
        kinds[kindOf(entry)].push(entry);
    }

    return kinds;
};

/** Lazy entries as the report lists them: name and weight, heaviest first. */
export const labelledByWeight = (
    entries: { source: string; chunk: string }[],
    label: (source: string) => string,
    sizeOf: (chunk: string) => number,
): { source: string; label: string; bytes: number }[] =>
    entries
        .map(entry => ({ source: entry.source, label: label(entry.source), bytes: sizeOf(entry.chunk) }))
        .toSorted((a, b) => b.bytes - a.bytes);
