/**
 * What touching one file costs: which chunks it invalidates and which screens re-download.
 *
 * It answers the question that follows every finding — "is this change small?" — and the answer is
 * not about the file. A one-line change in a file that sits in the bootstrap chunk invalidates that
 * chunk for every visitor who had the previous build cached, and a one-line change in a file only
 * one screen loads costs the people who open that screen. Same diff, two different bills.
 *
 * It is also half the answer about caching: what a deploy makes somebody download again starts
 * here, one file at a time.
 *
 * **And the chunks holding the file are only the first half of the bill.** A bundler writes the
 * hashed name of every chunk it imports into the importing chunk's own bytes, so a chunk whose
 * hash moves drags along everything naming it, which drags along everything naming *that*. The
 * usual shape is not a chain but a hub: one shared chunk — the framework runtime, the `index` —
 * that every route imports and that reaches every route back, so a change to one leaf moves the
 * hub and the hub moves the lot. Both figures are reported, never the second on its own: without
 * "and without the cascade it would have been three chunks" the big number is alarm rather than
 * diagnosis, and it is a property of how the bundler writes specifiers, not of anybody's code.
 */

import { type Analysis, type ModulePlace } from './analysis.types';
import { type Metafile } from './metafile.types';

/** What the hash cascade adds on top of the chunks that actually hold the changed file. */
export interface Cascade {
    /** Chunks invalidated only because a name written inside them moved. */
    chunks: string[];
    /** Bytes of those, in the unit of the report. On top of `invalidatedBytes`, never including it. */
    bytes: number;
    /**
     * `(invalidatedBytes + bytes)` over every JavaScript byte of the build: the share of what a
     * returning visitor had cached that this one change throws away. `0` when the build has no
     * bytes to speak of.
     */
    share: number;
    /** Screens that re-download only because of the cascade, and not because of the chunks themselves. */
    screens: string[];
    /**
     * The chunk of this cascade that carries the most other names inside it, with how many.
     *
     * Worth naming on its own because it is where the shape comes from. Vite's `__vite__mapDeps` is
     * a literal array of hashed names in one file, and that file is itself imported by several of
     * the ones it lists: any change anywhere in the array moves this chunk, and this chunk moving
     * moves everything that imports it. Saying "this file names 42 others" is a different sentence
     * from "87 % was invalidated", and it is the one that points somewhere.
     *
     * `null` when the cascade is empty or nothing in it names more than one other chunk.
     */
    hub: { chunk: string; names: number } | null;
}

/** How exposed a build is to the cascade at all, as a property of its topology. */
export type CascadeRisk = 'low' | 'mid' | 'high';

/**
 * The shape of the build's own exposure, rather than the bill for one file.
 *
 * This exists because "webpack never has this problem" is the kind of half-true that ends a
 * discussion. What webpack does is emit a **runtime chunk**: one tiny file that holds the map of
 * hashed names, so the names live in one place and the other chunks do not carry each other's.
 * That works — with the footnote that the runtime chunk itself changes on every deploy, so it has
 * to be tiny and inlined into the page, and a build that emits one and then serves it as a
 * separate cacheable file has kept the cost and lost the benefit.
 *
 * The honest formulation is therefore not a bundler name but a topology, which any build can be
 * measured against:
 *
 * - `low` — the names are concentrated in one small chunk that nearly everything imports. That is
 *   the runtime-chunk shape, whoever emitted it.
 * - `high` — one large chunk both names most of the build and is imported by most of it: the hub,
 *   where one leaf moves everything.
 * - `mid` — anything else. Names are spread about, so a change travels but does not reach the lot.
 */
export interface CascadeShape {
    risk: CascadeRisk;
    /** The chunk the names are concentrated in, when there is one. */
    hub: string | null;
    /** How many other chunks it names. */
    names: number;
    /** How many chunks name it: the other half of "hub", and what makes a change reach back down. */
    named: number;
    /** Its bytes, which is what tells a runtime chunk from a vendor bundle. */
    bytes: number;
}

export interface BlastRadius {
    path: string;
    /** The chunks holding it: what a change to this file invalidates directly. */
    places: ModulePlace[];
    /** Bytes of those chunks, in the unit of the report: what has to be downloaded again. */
    invalidatedBytes: number;
    /** Whether one of them is a bootstrap chunk, which is the case that costs everybody. */
    inBoot: boolean;
    /** Screens that would re-download something. Sources, so the UI can link to their rows. */
    screens: string[];
    /**
     * Whether every screen is affected. `true` either because the file is in the bootstrap or
     * because the chunks holding it are between them loaded by all of them.
     */
    everyScreen: boolean;
    /** The rest of the bill, kept apart so the two figures are always read as a pair. */
    cascade: Cascade;
}

/**
 * The reverse edges the cascade travels along: for each chunk, the chunks that carry its file name
 * inside them.
 *
 * Both kinds of import, on purpose. What invalidates a chunk is not what the browser fetches next
 * but what is written in its bytes, and `import('./screen-A1B2.js')` puts the hashed name of a lazy
 * chunk in its parent just as plainly as a static import does — which is the whole of what Vite's
 * `__vite__mapDeps` array is.
 */
export const chunkImportersOf = (outputs: Metafile['outputs']): Map<string, string[]> => {
    const importers = new Map<string, string[]>();

    for (const [chunk, output] of Object.entries(outputs)) {
        // Externals name nothing of this build, and an import of a file the build does not emit
        // has no hash to move.
        const targets = (output.imports ?? []).filter(imp => !imp.external && outputs[imp.path]);

        for (const imp of targets) {
            const known = importers.get(imp.path);
            if (known) {
                if (!known.includes(chunk)) {
                    known.push(chunk);
                }
            } else {
                importers.set(imp.path, [chunk]);
            }
        }
    }

    return importers;
};

/**
 * Every chunk reachable backwards from `from` along those edges, excluding `from` itself.
 *
 * Breadth-first and marked on the way in, so the hub-and-spoke shape — where nearly everything
 * reaches nearly everything — is walked once and not once per path.
 */
const reachedBackwards = (analysis: Analysis, from: ReadonlySet<string>): string[] => {
    const seen = new Set(from);
    const out: string[] = [];
    const queue = [...from];

    const reach = (chunk: string): void => {
        if (seen.has(chunk)) {
            return;
        }

        seen.add(chunk);
        out.push(chunk);
        queue.push(chunk);
    };

    // The array iterator sees what `reach` pushes while iterating: this is the breadth-first queue.
    for (const chunk of queue) {
        const importers = analysis.chunkImporters.get(chunk) ?? [];

        for (const importer of importers) {
            reach(importer);
        }
    }

    return out;
};

/**
 * How many other chunks each chunk names inside itself: the out-degree of the same edges the
 * cascade travels backwards along.
 *
 * `chunkImporters` is keyed the other way — target to the chunks naming it — because that is the
 * direction a cascade spreads. This is the same map read forwards, and it is what says which file
 * is the one carrying everybody's names.
 */
const namesPerChunk = (analysis: Analysis): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const naming of analysis.chunkImporters.values()) {
        for (const chunk of naming) {
            counts.set(chunk, (counts.get(chunk) ?? 0) + 1);
        }
    }

    return counts;
};

/** Bytes under which a chunk full of names is a runtime map rather than a bundle of code. */
const RUNTIME_CHUNK_BYTES = 4 * 1024;

/** From what share of the build a chunk counts as "nearly everything names it". */
const HUB_SHARE = 0.5;

/**
 * What the build's own topology says about how far a change travels. See `CascadeShape`.
 */
export const cascadeShapeOf = (analysis: Analysis): CascadeShape => {
    const counts = namesPerChunk(analysis);
    const total = analysis.allChunks.length;
    const [hub, names] = [...counts].toSorted((a, b) => b[1] - a[1])[0] ?? [null, 0];
    const named = hub ? (analysis.chunkImporters.get(hub)?.length ?? 0) : 0;
    const bytes = hub ? (analysis.chunkOf(hub)?.bytes ?? 0) : 0;

    // A small file that names most of the build and is imported by most of it is the runtime-chunk
    // shape: the names live in one place, so nothing else carries anybody else's.
    const concentrated = total > 0 && names >= total * HUB_SHARE;
    const risk: CascadeRisk =
        !hub || !concentrated
            ? 'mid'
            : bytes <= RUNTIME_CHUNK_BYTES
              ? 'low'
              : named >= total * HUB_SHARE
                ? 'high'
                : 'mid';

    return { risk, hub, names, named, bytes };
};

/**
 * @returns `null` when the file ships no bytes: it was tree-shaken away, or it is a type-only
 *          module. Saying nothing is right there — a change to it invalidates nothing.
 */
export const blastRadiusOf = (analysis: Analysis, path: string): BlastRadius | null => {
    const entry = analysis.modules.find(module => module.path === path);
    if (!entry || entry.places.length === 0) {
        return null;
    }

    const boot = new Set(analysis.bootChunks);
    const inBoot = entry.places.some(place => boot.has(place.chunk));

    // Which screens load each chunk is already worked out for the shared-chunk figures; the
    // bootstrap is not in that map because it belongs to everybody, which is what `inBoot` says.
    const screens = new Set(entry.places.flatMap(place => analysis.chunkScreens.get(place.chunk) ?? []));

    const held = new Set(entry.places.map(place => place.chunk));
    const invalidatedBytes = [...held].reduce((sum, chunk) => sum + (analysis.chunkOf(chunk)?.bytes ?? 0), 0);

    const cascadeChunks = reachedBackwards(analysis, held);
    const cascadeBytes = cascadeChunks.reduce((sum, chunk) => sum + (analysis.chunkOf(chunk)?.bytes ?? 0), 0);
    const cascadeInBoot = cascadeChunks.some(chunk => boot.has(chunk));

    // Screens the cascade adds, and only those: a screen already re-downloading a chunk that holds
    // the file is not made worse by also re-downloading one that names it.
    const cascadeScreens = new Set(
        cascadeChunks.flatMap(chunk => analysis.chunkScreens.get(chunk) ?? []).filter(source => !screens.has(source)),
    );

    const buildBytes = analysis.allChunks.reduce((sum, chunk) => sum + (analysis.chunkOf(chunk)?.bytes ?? 0), 0);

    // Which of the dragged-in chunks carries the most names: the amplifier, with its own name on
    // it rather than described in the abstract.
    const counts = namesPerChunk(analysis);
    const [hubChunk, hubNames] = cascadeChunks
        .map(chunk => [chunk, counts.get(chunk) ?? 0] as const)
        .toSorted((a, b) => b[1] - a[1])[0] ?? [null, 0];

    return {
        path,
        places: entry.places,
        invalidatedBytes,
        inBoot,
        screens: inBoot ? analysis.screens.map(screen => screen.source) : [...screens],
        everyScreen: inBoot || (analysis.screens.length > 0 && screens.size === analysis.screens.length),
        cascade: {
            chunks: cascadeChunks,
            bytes: cascadeBytes,
            share: buildBytes > 0 ? (invalidatedBytes + cascadeBytes) / buildBytes : 0,
            screens:
                cascadeInBoot && !inBoot
                    ? analysis.screens.map(screen => screen.source).filter(source => !screens.has(source))
                    : [...cascadeScreens],
            // One name inside is an edge, not an amplifier: below two there is nothing to point at.
            hub: hubChunk && hubNames > 1 ? { chunk: hubChunk, names: hubNames } : null,
        },
    };
};
