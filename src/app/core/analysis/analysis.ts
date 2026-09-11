import { RECOMMENDED } from '../criteria/criteria';
import { type Criteria } from '../criteria/criteria.types';
import { baseName, packageOf, projectFolderOf, screenLabel, shortName } from '../format/format.utils';
import {
    type Analysis,
    type BucketSlice,
    type ChunkInfo,
    type CommonJsPackage,
    type DuplicateCopy,
    type DuplicatePackage,
    type ModuleEntry,
    type ModulePlace,
    type ScreenCost,
    type ScreenMark,
    type TreeNode,
    type Zone,
} from './analysis.types';
import { chunkImportersOf } from './blast';
import { depthOf, startupOf, wavesFrom, widthOf } from './delivery';
import { browserSide, classifyLazyEntries, labelledByWeight, lazyLoadersOf } from './entries';
import { importGraphOf } from './importers';
import { graphInsightsOf } from './insights';
import { type GraphInsights } from './insights.types';
import { type Metafile } from './metafile.types';
import { splitDriftOf } from './split-drift';

interface FileEntry {
    label: string;
    bytes: number;
}

interface Group {
    bytes: number;
    files: FileEntry[];
    /**
     * An npm package rather than a folder of the project. Recorded here because this is where it
     * is known: once the key is `primeng`, nothing in the string says whether it came from
     * `node_modules` or from a project folder called the same.
     */
    isPackage: boolean;
}

/** pnpm writes the version into the path, which is what puts a number on each copy. */
const PNPM_COPY = /node_modules\/\.pnpm\/((?:@[^+]+\+)?[^@]+)@([^/]+)\//;

/**
 * Which installed copy of a package a file belongs to.
 *
 * The identity of a copy is **where it is installed**: everything before the last `node_modules/`
 * of its path. That one rule covers the two layouts. pnpm gives every copy its own directory with
 * the version in the name, so the version comes out as a bonus; npm and yarn hoist one copy to the
 * top and nest the rest inside whoever asked for them, and the path says who that is but never the
 * version.
 *
 * It used to read the pnpm path only. The consequence was not a worse signal but a missing one:
 * the same project analysed by somebody using npm reported no duplicates at all, because the
 * second copy sits at `node_modules/a/node_modules/lodash/` and nothing there matched.
 *
 * @returns `null` for project code, which has no copies.
 */
const copyOf = (input: string, pkg: string): { at: string; version: string | null; under: string | null } | null => {
    const marker = input.lastIndexOf('node_modules/');
    if (marker === -1) {
        return null;
    }

    // '' when the package is installed at the top level, which is a copy like any other.
    const at = input.slice(0, marker);
    const pnpm = PNPM_COPY.exec(at);
    const pnpmName = pnpm?.[1]?.replace('+', '/');
    // A pnpm directory named after another package holds this one as that package's dependency:
    // the version in the path is that other package's, not this one's.
    const own = pnpmName === pkg;

    // Where a nested copy lives. `packageOf` names it when the path goes through `node_modules/`,
    // which is npm's and yarn's case; a copy installed outside it — a `file:` dependency, a package
    // of a monorepo — has no package name in its path, and calling that one "the top-level copy"
    // is exactly wrong. The folder is what identifies it, so the folder is what gets said.
    const folder = at.replaceAll(/^[./]+|\/+$/g, '');

    return {
        at,
        version: own ? (pnpm?.[2] ?? null) : null,
        under: own || !at ? null : (pnpmName ?? packageOf(at) ?? (folder || null)),
    };
};

/**
 * Analyses a metafile.
 *
 * @param meta      the `stats.json`
 * @param gzip      compressed sizes by file name, when the build folder has been loaded. Its keys
 *                  are also the answer to "which files does that folder hold", which is how an
 *                  output belonging to the server side of the same build is told apart from one a
 *                  browser downloads — see `browserSide`.
 * @param exact     bytes per file inside each chunk, read from the source maps of the build folder,
 *                  keyed by chunk file name. A second measurement of what the metafile already says.
 * @param announced file names `index.html` tells the browser to fetch before parsing anything: the
 *                  entry script and the `modulepreload` links. Only that page distinguishes a
 *                  bootstrap chunk asked for at once from one found a round trip later.
 * @param marks     lazy entries somebody reclassified by hand, source file to what it should be.
 *                  A mark wins over every rule: the rules read file names for part of the job, and
 *                  whoever is looking at the report knows their project better than a regular
 *                  expression does.
 * @param limits    the only criterion the analysis itself needs: what a file that just groups
 *                  routes may weigh. It comes in from outside so it can be edited with the rest
 *                  instead of being a constant here, and it arrives on its own rather than as the
 *                  whole criteria object so that editing any other threshold does not walk the
 *                  graph again.
 * @param parallel  chunks the loader asks for in the same round trip as a lazy one, when the build
 *                  writes that list into the call. Vite does; esbuild does not, and there the map
 *                  is empty and nothing changes.
 */
export const analyze = (
    meta: Metafile,
    gzip: Map<string, number> | null,
    exact: Map<string, Map<string, number>> | null = null,
    announced: ReadonlySet<string> | null = null,
    marks: ReadonlyMap<string, ScreenMark> | null = null,
    limits: Pick<Criteria, 'grouperMaxBytes'> = RECOMMENDED.raw,
    parallel: ReadonlyMap<string, readonly string[]> | null = null,
): Analysis => {
    // The keys of `gzip` are every asset of the build folder: the measured answer to what a
    // browser can actually download, which is what tells the two sides of an SSR build apart.
    const { outputs, serverOutputs } = browserSide(meta.outputs, gzip ? new Set(gzip.keys()) : null);
    const inputs = meta.inputs ?? {};
    // `.mjs` is what esbuild writes with `--out-extension:.js=.mjs`, and what several setups ship.
    // Filtering on `.js` alone left those builds with no entry at all and threw `NO_ENTRIES`.
    const isJs = (file: string) => /\.m?js$/.test(file);
    const isOwn = (input: string) => !/node_modules/.test(input);
    /** Source-graph edges that keep files in the same chunk: anything but a lazy boundary or an external. */
    const travelsTogether = (imp: { kind: string; external?: boolean }) =>
        !imp.external && imp.kind !== 'dynamic-import';

    /**
     * How many bytes of a file are inside a chunk. The metafile's figure is already the minified
     * one; the source map of that chunk, when the folder brought it, is preferred simply because
     * it was measured on the generated file itself.
     */
    const bytesIn = (chunk: string, input: string): number => {
        const measured = exact?.get(baseName(chunk))?.get(input);
        return typeof measured === 'number' ? measured : (outputs[chunk]?.inputs?.[input]?.bytesInOutput ?? 0);
    };

    /**
     * The same figure, with "nobody measured this chunk" told apart from "it weighs nothing". A
     * folder read without source maps knows what a chunk weighs and not what is inside it, and the
     * rules that read a file's own weight have to know the difference before they fire.
     */
    const ownBytesIn = (chunk: string, input: string): number | null => {
        const measured = exact?.get(baseName(chunk));
        if (measured) {
            return measured.get(input) ?? 0;
        }

        const inside = outputs[chunk]?.inputs;
        return inside ? (inside[input]?.bytesInOutput ?? 0) : null;
    };

    /** Files of a chunk with their bytes, skipping the empty ones. */
    const inputsOf = (chunk: string): [string, number][] =>
        Object.keys(outputs[chunk]?.inputs ?? {})
            .map((input): [string, number] => [input, bytesIn(chunk, input)])
            .filter(([, bytes]) => bytes > 0);

    const mainContentOf = (chunk: string): string => {
        const top = inputsOf(chunk).toSorted((a, b) => b[1] - a[1])[0];
        return top ? shortName(top[0]) : '';
    };

    // An output is a lazy entry if somebody imports it dynamically.
    const lazyTargets = new Set(
        Object.values(outputs)
            .flatMap(output => output.imports ?? [])
            .filter(imp => imp.kind === 'dynamic-import')
            .map(imp => imp.path),
    );

    /**
     * What is reachable following ONLY static imports: that is what is downloaded together.
     * Following dynamic ones would mix everything and always return the whole bundle.
     */
    const reach = (start: string): Set<string> => {
        const seen = new Set<string>();
        const stack = [start];

        while (stack.length > 0) {
            const file = stack.pop();
            const output = file ? outputs[file] : undefined;
            if (!file || !output || seen.has(file)) {
                continue;
            }

            seen.add(file);
            const imports = output.imports ?? [];
            for (const imp of imports) {
                if (imp.kind === 'import-statement') {
                    stack.push(imp.path);
                }
            }
        }

        return seen;
    };

    const lazyLoaders = lazyLoadersOf(inputs, isOwn);

    const entries = Object.entries(outputs).filter(([file, out]) => out.entryPoint && isJs(file));
    if (entries.length === 0) {
        throw new Error('NO_ENTRIES');
    }

    const rootCandidates = entries.filter(([file]) => !lazyTargets.has(file));
    if (rootCandidates.length === 0) {
        throw new Error('NO_MAIN');
    }

    // There may be stray entries (a library worker): the main one is the one that reaches the most.
    const main = rootCandidates.map(([file]) => [file, reach(file).size] as const).toSorted((a, b) => b[1] - a[1])[0];
    if (!main) {
        throw new Error('NO_MAIN');
    }

    /**
     * The bootstrap is the main entry plus any other entry chunk the page starts as well.
     *
     * An application does not have to have one entry. Angular's polyfills are a second one, and
     * SvelteKit starts two — its router and the application — from a script inside the page. Taking
     * only the main one left those chunks out of the figure everybody pays and made the two
     * readings of the bootstrap disagree, which is a report that is wrong without saying so.
     *
     * What decides is the page: a stray entry nobody announces (a worker, a library build) is not
     * downloaded on the first load and stays out, which is why the union is not over every entry.
     */
    const alsoStarted = announced
        ? rootCandidates.filter(([file]) => file !== main[0] && announced.has(baseName(file)))
        : [];
    const boot = new Set([main[0], ...alsoStarted.map(([file]) => file)].flatMap(file => [...reach(file)]));

    /**
     * Everything the browser can get to from where the application starts, following both kinds of
     * import. What is left over is in the folder and in no figure of this report: a service worker,
     * a chunk imported by a path built at run time, or the leftovers of a previous build in a
     * folder nobody cleaned. The first two are facts about the build; the third makes every number
     * here read low, and all three were invisible.
     */
    const reachAll = (seeds: readonly string[]): Set<string> => {
        const seen = new Set<string>();
        const stack = [...seeds];

        while (stack.length > 0) {
            const file = stack.pop();
            const output = file ? outputs[file] : undefined;
            if (!file || !output || seen.has(file)) {
                continue;
            }

            seen.add(file);
            const imports = output.imports ?? [];
            for (const imp of imports) {
                stack.push(imp.path);
            }
        }

        return seen;
    };

    const reachable = reachAll([main[0], ...alsoStarted.map(([file]) => file)]);
    const unreachable = Object.keys(outputs)
        .filter(file => isJs(file) && !reachable.has(file))
        .map(file => ({ file, bytes: outputs[file]?.bytes ?? 0 }));

    const lazyOwnEntries = entries
        .filter(([file]) => lazyTargets.has(file))
        // And reachable from where the application starts. A chunk only some other unreachable
        // chunk imports is not a screen of this build: it is what a previous build left in a folder
        // nobody cleaned, and it used to take a row of the table and push a real screen out of it.
        .filter(([file]) => reachable.has(file))
        .map(([file, out]) => ({ chunk: file, source: out.entryPoint ?? '', set: reach(file) }))
        // A screen is project code: an `await import('xlsx')` also produces a lazy entry and is not one.
        .filter(entry => !/node_modules/.test(entry.source));

    // Which of them are screens, which are pieces of one and which only group routes. The three
    // rules and their reasons are in `entries.ts`; a mark, when there is one, overrules them.
    const kinds = classifyLazyEntries(lazyOwnEntries, {
        inputs,
        outputs,
        ownBytesOf: ownBytesIn,
        loaders: lazyLoaders,
        marks,
        grouperMaxBytes: limits.grouperMaxBytes,
    });

    // How many screens each lazy chunk appears in. Every shared-chunk figure builds on this counter.
    const screenCount = new Map<string, number>();
    const chunkScreens = new Map<string, string[]>();
    for (const entry of kinds.screens) {
        const lazyChunks = [...entry.set].filter(chunk => !boot.has(chunk));
        for (const chunk of lazyChunks) {
            screenCount.set(chunk, (screenCount.get(chunk) ?? 0) + 1);
            chunkScreens.set(chunk, [...(chunkScreens.get(chunk) ?? []), entry.source]);
        }
    }

    const zoneOf = (chunk: string): Zone => {
        if (boot.has(chunk)) {
            return 'boot';
        }
        return (screenCount.get(chunk) ?? 0) > 1 ? 'shared' : 'own';
    };

    const sizeOf = (chunk: string): number => {
        const compressed = gzip?.get(baseName(chunk));
        return typeof compressed === 'number' ? compressed : (outputs[chunk]?.bytes ?? 0);
    };
    const sumOf = (chunks: Iterable<string>): number => [...chunks].reduce((total, c) => total + sizeOf(c), 0);

    const bootBytes = sumOf(boot);
    const bootRawBytes = [...boot].reduce((total, chunk) => total + (outputs[chunk]?.bytes ?? 0), 0);

    const screens: ScreenCost[] = kinds.screens
        .map(entry => {
            const lazy = [...entry.set].filter(chunk => !boot.has(chunk));
            const own = lazy.filter(chunk => screenCount.get(chunk) === 1);
            const shared = lazy.filter(chunk => (screenCount.get(chunk) ?? 0) > 1);
            // The bootstrap is already there when the router navigates, so it ends the walk: what
            // is being counted is the round trips this screen adds on top of an app already running.
            // What the loader asks for alongside the entry chunk starts in the same trip as it: a
            // build that ships that list has already paid for those files by the time it parses.
            const together = parallel?.get(entry.chunk) ?? [];
            const chunkWaves = wavesFrom(outputs, [entry.chunk, ...together], boot);

            return {
                label: screenLabel(entry.source),
                source: entry.source,
                files: boot.size + lazy.length,
                boot: bootBytes,
                shared: sumOf(shared),
                own: sumOf(own),
                total: bootBytes + sumOf(lazy),
                ownChunks: own,
                sharedChunks: shared,
                waves: depthOf(chunkWaves),
                // Depth says how many trips; width says whether any of them can be shortened. A
                // screen three trips deep whose widest trip carries one file is a chain worth
                // breaking; one whose widest carries nine is a fan-out, and the fix is different.
                width: widthOf(chunkWaves),
                chunkWaves,
            };
        })
        .toSorted((a, b) => b.total - a.total);

    // What the first load costs in round trips. Only `index.html` can say, so without it the
    // figure is absent rather than assumed.
    const startup = announced ? startupOf(outputs, boot, announced) : null;

    const chunkInfo = (file: string): ChunkInfo => ({
        file,
        name: baseName(file),
        bytes: sizeOf(file),
        screens: screenCount.get(file) ?? 0,
        mainContent: mainContentOf(file),
    });

    const sharedChunks = [...screenCount]
        .filter(([, count]) => count > 1)
        .map(([file]) => chunkInfo(file))
        .toSorted((a, b) => b.screens - a.screens || b.bytes - a.bytes);

    // --- Bootstrap breakdown by package and folder ---------------------------------------------
    const buckets = new Map<string, BucketSlice>();
    let bootBucketTotal = 0;

    /**
     * The source files behind each bucket, and what each of them weighs in the bootstrap. The
     * breakdown itself only ever needed the totals; the exclusive weight needs to know which files
     * to take out of the graph, and there is nothing in the name `primeng` that says which those are.
     */
    const bucketFiles = new Map<string, string[]>();
    const bootBytesByInput = new Map<string, number>();

    const bootInputs = [...boot].flatMap(chunk => inputsOf(chunk));
    for (const [input, bytes] of bootInputs) {
        const pkg = packageOf(input);
        const name = pkg ?? projectFolderOf(input);
        const existing = buckets.get(name);

        if (existing) {
            existing.bytes += bytes;
        } else {
            buckets.set(name, { name, bytes, isProjectCode: !pkg });
        }

        // A file can sit in two bootstrap chunks; the bucket lists it once and adds both weights.
        const files = bucketFiles.get(name) ?? [];
        if (!bootBytesByInput.has(input)) {
            files.push(input);
            bucketFiles.set(name, files);
        }
        bootBytesByInput.set(input, (bootBytesByInput.get(input) ?? 0) + bytes);

        bootBucketTotal += bytes;
    }

    // --- Where every file of the bundle lands: the index the search looks through ---------------
    const inputChunks = new Map<string, string[]>();
    for (const [chunk, output] of Object.entries(outputs)) {
        const chunkInputs = Object.keys(output.inputs ?? {});
        for (const input of chunkInputs) {
            inputChunks.set(input, [...(inputChunks.get(input) ?? []), chunk]);
        }
    }

    const modules: ModuleEntry[] = [...inputChunks]
        .map(([path, chunks]): ModuleEntry => {
            const places = chunks
                .map((chunk): ModulePlace => ({
                    chunk,
                    chunkName: baseName(chunk),
                    bytes: bytesIn(chunk, path),
                    zone: zoneOf(chunk),
                    screens: boot.has(chunk) ? 0 : (screenCount.get(chunk) ?? 0),
                }))
                .filter(place => place.bytes > 0)
                .toSorted((a, b) => b.bytes - a.bytes);

            return {
                path,
                label: shortName(path),
                pkg: packageOf(path),
                bytes: places.reduce((sum, place) => sum + place.bytes, 0),
                places,
            };
        })
        .filter(entry => entry.places.length > 0)
        .toSorted((a, b) => b.bytes - a.bytes);

    const moduleByPath = new Map(modules.map(entry => [entry.path, entry]));

    // --- Data for the signals ------------------------------------------------------------------
    const { packages: packageImporters, ownFiles: ownImporters } = importGraphOf(inputs, isOwn);

    // The import chain from the entry to each package, breadth-first over static imports of the
    // source graph. Breadth-first gives the shortest one: the import someone has to look at.
    const bootChains = new Map<string, string[]>();
    const mainSource = outputs[main[0]]?.entryPoint;
    if (mainSource && inputs[mainSource]) {
        const previous = new Map<string, string | null>([[mainSource, null]]);
        const queue = [mainSource];
        const enqueue = (from: string, path: string): void => {
            if (previous.has(path)) {
                return;
            }

            previous.set(path, from);
            queue.push(path);
        };

        // The array iterator sees what gets pushed while iterating: this is the BFS queue.
        for (const file of queue) {
            const pkg = packageOf(file);
            if (pkg && !bootChains.has(pkg)) {
                const chain: string[] = [];
                for (let step: string | null = file; step; step = previous.get(step) ?? null) {
                    chain.unshift(step);
                }
                bootChains.set(pkg, chain);
            }

            const imports = (inputs[file]?.imports ?? []).filter(imp => travelsTogether(imp));
            for (const imp of imports) {
                enqueue(file, imp.path);
            }
        }
    }

    /**
     * The same walk, this time crossing lazy boundaries too. `bootChains` answers "how does this
     * get into the bootstrap"; this one answers "what brings this file in at all", which is the
     * question asked of a file that is only inside one screen.
     */
    const cameFrom = new Map<string, string | null>();
    if (mainSource && inputs[mainSource]) {
        cameFrom.set(mainSource, null);
        const pending = [mainSource];
        const visit = (from: string, path: string): void => {
            if (cameFrom.has(path)) {
                return;
            }

            cameFrom.set(path, from);
            pending.push(path);
        };

        for (const file of pending) {
            const imports = (inputs[file]?.imports ?? []).filter(imp => !imp.external);
            for (const imp of imports) {
                visit(file, imp.path);
            }
        }
    }

    const chainTo = (path: string): string[] | null => {
        if (!cameFrom.has(path)) {
            return null;
        }

        const chain: string[] = [];
        for (let step: string | null = path; step; step = cameFrom.get(step) ?? null) {
            chain.unshift(step);
        }
        return chain;
    };

    // Who lazy-loads each screen: the routes file. That is where a route's providers go. It is the
    // same map that told screens and deferred blocks apart, further up.
    const screenLoaders = lazyLoaders;

    /** Who imports a given set of files: own files, and the packages that do when no own file does. */
    const importersOf = (targets: Set<string>): { importers: string[]; viaPackages: string[] } => {
        const own = new Set<string>();
        const via = new Set<string>();

        for (const [input, data] of Object.entries(inputs)) {
            if (targets.has(input) || (data.imports ?? []).every(imp => !targets.has(imp.path))) {
                continue;
            }

            if (isOwn(input)) {
                own.add(input);
                continue;
            }

            const pkg = packageOf(input);
            if (pkg) {
                via.add(pkg);
            }
        }

        return { importers: [...own], viaPackages: [...via] };
    };

    // CommonJS packages: esbuild says so per file (`format`). Grouped by package, with where they land.
    const cjsByPackage = new Map<string, { bytes: number; files: number; chunks: Set<string> }>();
    for (const [input, data] of Object.entries(inputs)) {
        const pkg = data.format === 'cjs' ? packageOf(input) : null;
        if (!pkg) {
            continue;
        }

        const entry = cjsByPackage.get(pkg) ?? { bytes: 0, files: 0, chunks: new Set<string>() };
        const chunks = inputChunks.get(input) ?? [];
        entry.files += 1;
        for (const chunk of chunks) {
            entry.bytes += bytesIn(chunk, input);
            entry.chunks.add(chunk);
        }
        cjsByPackage.set(pkg, entry);
    }

    const packagesImporting = (target: string): string[] => {
        const found = new Set<string>();
        for (const [input, data] of Object.entries(inputs)) {
            const from = packageOf(input);
            if (!from || from === target) {
                continue;
            }
            if ((data.imports ?? []).some(imp => packageOf(imp.path) === target)) {
                found.add(from);
            }
        }
        return [...found];
    };

    const commonJs: CommonJsPackage[] = [...cjsByPackage]
        .filter(([, entry]) => entry.chunks.size > 0)
        .map(([name, entry]): CommonJsPackage => {
            const chunks = [...entry.chunks];
            const inBoot = chunks.some(chunk => boot.has(chunk));
            const screenHits = Math.max(0, ...chunks.map(chunk => screenCount.get(chunk) ?? 0));
            const importers = [...(packageImporters.get(name) ?? [])];

            return {
                name,
                bytes: entry.bytes,
                files: entry.files,
                zone: inBoot ? 'boot' : screenHits > 1 ? 'shared' : 'own',
                screens: inBoot ? 0 : screenHits,
                importers,
                viaPackages: importers.length > 0 ? [] : packagesImporting(name),
            };
        })
        .toSorted((a, b) => Number(b.zone === 'boot') - Number(a.zone === 'boot') || b.bytes - a.bytes);

    // --- Packages shipped in more than one version ----------------------------------------------
    // Each copy is followed separately: knowing there are two says nothing about what to do, and
    // the answer depends on whether they come in through the project's dependencies or theirs.
    interface CopyFiles {
        version: string | null;
        under: string | null;
        paths: string[];
    }
    const copiesByPackage = new Map<string, Map<string, CopyFiles>>();
    for (const input of Object.keys(inputs)) {
        const name = packageOf(input);
        const copy = name ? copyOf(input, name) : null;
        if (!name || !copy) {
            continue;
        }

        const byPlace = copiesByPackage.get(name) ?? new Map<string, CopyFiles>();
        const existing = byPlace.get(copy.at) ?? { version: copy.version, under: copy.under, paths: [] };
        existing.paths.push(input);
        byPlace.set(copy.at, existing);
        copiesByPackage.set(name, byPlace);
    }

    const worstZone = (zones: Zone[]): Zone => {
        if (zones.includes('boot')) {
            return 'boot';
        }
        return zones.includes('shared') ? 'shared' : 'own';
    };

    const duplicates: DuplicatePackage[] = [...copiesByPackage]
        .map(([name, byPlace]): DuplicatePackage => {
            const copies = [...byPlace]
                .map(([at, copy]): DuplicateCopy => {
                    const shipped = copy.paths.map(path => moduleByPath.get(path)).filter(entry => !!entry);
                    const places = shipped.flatMap(entry => entry.places);
                    const heaviest = shipped.toSorted((a, b) => b.bytes - a.bytes)[0];
                    const { importers, viaPackages } = importersOf(new Set(copy.paths));

                    return {
                        at,
                        version: copy.version,
                        under: copy.under,
                        bytes: shipped.reduce((sum, entry) => sum + entry.bytes, 0),
                        files: shipped.length,
                        zone: worstZone(places.map(place => place.zone)),
                        screens: Math.max(0, ...places.map(place => place.screens)),
                        chain: heaviest ? chainTo(heaviest.path) : null,
                        importers,
                        viaPackages: viaPackages.filter(pkg => pkg !== name),
                    };
                })
                // A copy resolved but tree-shaken away entirely is not paid twice.
                .filter(copy => copy.bytes > 0)
                .toSorted((a, b) => Number(b.zone === 'boot') - Number(a.zone === 'boot') || b.bytes - a.bytes);

            return {
                name,
                copies,
                bytes: copies.reduce((sum, copy) => sum + copy.bytes, 0),
                inBoot: copies.some(copy => copy.zone === 'boot'),
            };
        })
        .filter(pkg => pkg.copies.length > 1)
        .toSorted((a, b) => Number(b.inBoot) - Number(a.inBoot) || b.bytes - a.bytes);

    // Every own file of the bootstrap, heaviest first. Which of them is "large" is a criterion and
    // is applied where the signal is written, so moving that threshold does not re-read the graph.
    const ownFilesInBoot = bootInputs
        .filter(([input]) => isOwn(input))
        .map(([path, bytes]) => ({ path, bytes }))
        .toSorted((a, b) => b.bytes - a.bytes);

    // --- Tree ----------------------------------------------------------------------------------
    const groupsOf = (file: string): Map<string, Group> => {
        const groups = new Map<string, Group>();
        const fileInputs = inputsOf(file);

        for (const [input, bytes] of fileInputs) {
            const pkg = packageOf(input);
            const key = pkg ?? projectFolderOf(input);
            const group = groups.get(key) ?? { bytes: 0, files: [], isPackage: pkg !== null };

            group.bytes += bytes;
            group.files.push({ label: pkg ? shortName(input) : input, bytes });
            groups.set(key, group);
        }

        return groups;
    };

    const buildTree = (files: string[], zone: TreeNode['zone']): TreeNode[] =>
        files
            .map((file): TreeNode => ({
                id: file,
                label: baseName(file),
                bytes: sizeOf(file),
                rawBytes: outputs[file]?.bytes ?? 0,
                kind: 'chunk',
                zone,
                screens: screenCount.get(file) ?? 0,
                children: [...groupsOf(file)]
                    .toSorted((a, b) => b[1].bytes - a[1].bytes)
                    .map(([name, group]): TreeNode => ({
                        id: `${file}::${name}`,
                        label: name,
                        bytes: group.bytes,
                        kind: group.isPackage ? 'package' : 'folder',
                        children: group.files
                            .toSorted((a, b) => b.bytes - a.bytes)
                            .map((child): TreeNode => ({
                                id: `${file}::${name}::${child.label}`,
                                label: child.label,
                                bytes: child.bytes,
                                kind: 'file',
                                children: [],
                            })),
                    })),
            }))
            .toSorted((a, b) => b.bytes - a.bytes);

    const sharedFiles = sharedChunks.map(c => c.file);
    const ownFiles = [...screenCount].filter(([, n]) => n === 1).map(([file]) => file);

    const tree: TreeNode[] = [
        ...buildTree([...boot], 'boot'),
        ...buildTree(sharedFiles, 'shared'),
        ...buildTree(ownFiles, 'own'),
    ];

    const chunkCache = new Map<string, ChunkInfo>();

    /**
     * The figures that come out of the same graph and were not being computed: exclusive weight,
     * barrels, cycles, mixed imports, bytes paid twice, twin screens.
     *
     * Worked out on first use rather than here. They cost one walk of the graph per bootstrap
     * bucket, and the analysis is run twice on every report — once in the unit being shown, once in
     * raw bytes so a raw baseline has something to compare against — while only one of the two is
     * ever asked for these. Memoised, so the signals and the panels share the one computation.
     */
    let computed: GraphInsights | null = null;
    const insights = (): GraphInsights => {
        computed ??= graphInsightsOf({
            inputs,
            roots: [mainSource, ...alsoStarted.map(([, out]) => out.entryPoint)].filter(
                file => typeof file === 'string',
            ),
            isOwn,
            modules,
            boot,
            bootBytesOf: file => bootBytesByInput.get(file) ?? 0,
            screens,
            sizeOf,
            filesByBucket: bucketFiles,
            packageImporters,
        });
        return computed;
    };

    return {
        insights,
        bootBytes,
        bootRawBytes,
        bootFiles: boot.size,
        bootChunks: [...boot],
        startup,
        allChunks: Object.keys(outputs).filter(file => isJs(file)),
        bootBuckets: [...buckets.values()].toSorted((a, b) => b.bytes - a.bytes),
        bootBucketTotal,
        serverOutputs,
        deferredBlocks: labelledByWeight(kinds.blocks, screenLabel, sizeOf),
        routeGroupers: labelledByWeight(kinds.groupers, screenLabel, sizeOf),
        lazyData: labelledByWeight(kinds.data, screenLabel, sizeOf),
        unreachable,
        marks: marks ?? new Map<string, ScreenMark>(),
        screens,
        sharedChunks,
        chunkScreens,
        tree,
        chunkImporters: chunkImportersOf(outputs),
        packageImporters,
        ownImporters,
        bootChains,
        screenLoaders,
        commonJs,
        duplicates,
        ownFilesInBoot,
        modules,
        chainTo,
        splitSource: exact && exact.size > 0 ? 'sourcemap' : 'metafile',
        splitDrift: splitDriftOf(outputs, exact ?? null),
        chunkOf: file => {
            const cached = chunkCache.get(file);
            if (cached) {
                return cached;
            }

            const info = chunkInfo(file);
            chunkCache.set(file, info);
            return info;
        },
    };
};
