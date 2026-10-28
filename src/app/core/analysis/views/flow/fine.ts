/**
 * Every chunk a screen downloads, read part by part before anything is folded: the grain the flow
 * diagram, its sentence and its table are all worked out from.
 *
 * **The parts of a chunk are raw.** Gzip compresses a file as a whole, so a package's compressed
 * weight inside a chunk does not exist (`HOW-IT-WORKS.md` §2.5). A package's figure here is its
 * raw share of each chunk at the ratio that chunk compresses by — the treemap's `≈` figure — and
 * what the metafile attributes to no file is a part of its own, so every chunk's bytes are all
 * accounted for and the columns add up.
 */

import { type Analysis, type TreeNode, type Zone } from '../../analysis.types';

/**
 * The ids of the nodes that are not a package, a chunk or a screen. `#` cannot be in an npm name,
 * and `@` can: it starts every scoped one, which is how `@angular/core` once went missing here.
 */
export const FLOW_IDS = {
    own: '#own',
    unattributed: '#unattributed',
    morePackages: '#more-packages',
    boot: '#boot',
    moreShared: '#more-shared',
    ownChunks: '#own-chunks',
    moreScreens: '#more-screens',
    /** The only target of a build with no lazy screen: the page itself. */
    app: '#app',
} as const;

export const RESERVED: ReadonlySet<string> = new Set(Object.values(FLOW_IDS));

/** One chunk as the flow reads it: who fills it, how much, and which screens download it. */
export interface ChunkFlow {
    file: string;
    zone: Zone;
    bytes: number;
    screens: number;
    /** Source key (a package name, `FLOW_IDS.own` or `FLOW_IDS.unattributed`) → bytes in the report's unit. */
    parts: Map<string, number>;
    /** Screen sources downloading it. Every screen for the bootstrap. */
    downloadedBy: readonly string[];
}

export interface Fine {
    chunks: ChunkFlow[];
    /** Each source key's bytes in the build, and the part of them in the bootstrap. */
    bytes: Map<string, number>;
    bootBytes: Map<string, number>;
    /** Screens downloading each source; `'all'` when part of it is in the bootstrap. */
    reach: Map<string, Set<string> | 'all'>;
}

export const add = <K>(map: Map<K, number>, key: K, bytes: number): void => {
    map.set(key, (map.get(key) ?? 0) + bytes);
};

/**
 * The parts of a chunk in the report's unit: each package's raw share of the chunk, at the ratio
 * the chunk compresses by, and the rest of the chunk — the bundler's wrapper — as unattributed.
 *
 * When the parts add up to more than the file, which Angular's chunk optimizer does (§3.23), each
 * one's share is still its share of the sum: the chunk is never made to weigh more than it does.
 */
const partsOf = (chunk: TreeNode): Map<string, number> => {
    const parts = new Map<string, number>();
    const raw = chunk.rawBytes ?? chunk.bytes;
    const named = chunk.children.reduce((sum, child) => sum + child.bytes, 0);
    const scale = named > 0 ? chunk.bytes / Math.max(raw, named) : 0;

    for (const child of chunk.children) {
        add(parts, child.kind === 'package' ? child.label : FLOW_IDS.own, child.bytes * scale);
    }

    const rest = chunk.bytes - named * scale;
    if (rest > 0.5) {
        parts.set(FLOW_IDS.unattributed, rest);
    }
    return parts;
};

/** Every chunk any screen downloads, read part by part, before anything is folded. */
export const fineOf = (analysis: Analysis): Fine => {
    const everyone = analysis.screens.map(screen => screen.source);
    const chunks = analysis.tree.map((chunk): ChunkFlow => ({
        file: chunk.id,
        zone: chunk.zone ?? 'own',
        bytes: chunk.bytes,
        screens: chunk.screens ?? 0,
        parts: partsOf(chunk),
        downloadedBy: chunk.zone === 'boot' ? everyone : (analysis.chunkScreens.get(chunk.id) ?? []),
    }));

    const bytes = new Map<string, number>();
    const bootBytes = new Map<string, number>();
    const reach = new Map<string, Set<string> | 'all'>();
    for (const chunk of chunks) {
        for (const [key, part] of chunk.parts) {
            add(bytes, key, part);
            if (chunk.zone === 'boot') {
                add(bootBytes, key, part);
                reach.set(key, 'all');
                continue;
            }
            const seen = reach.get(key) ?? new Set<string>();
            if (seen === 'all') {
                continue;
            }
            for (const source of chunk.downloadedBy) {
                seen.add(source);
            }
            reach.set(key, seen);
        }
    }
    return { chunks, bytes, bootBytes, reach };
};

/** How many screens a reach stands for. */
export const reachCount = (reach: Set<string> | 'all' | undefined, screens: number): number =>
    reach === 'all' ? screens : (reach?.size ?? 0);
