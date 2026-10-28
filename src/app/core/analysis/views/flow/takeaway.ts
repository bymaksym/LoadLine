/**
 * The one sentence under the flow diagram, worked out from its figures rather than written: the
 * reason to look at the diagram at all.
 *
 * In order of how much it changes a plan: a package carried to screens whose code does not import
 * it, then what makes the heaviest screen heavy, then — when every screen is the same bootstrap and
 * little else — the heaviest part of that. A build whose chunks name nothing inside them (a folder
 * without source maps) still gets the heaviest screen and its three parts.
 */

import { type Analysis, type ModulePlace } from '../../analysis.types';
import { type Fine, FLOW_IDS, reachCount, RESERVED } from './fine';
import { type FlowTakeaway } from './flow.types';

/**
 * A package worth a sentence: at least this share of the build. Below it, "downloaded by six
 * screens that do not import it" is true and is a few kilobytes.
 */
const TAKEAWAY_MIN_SHARE = 0.01;

/**
 * The screens whose files import a package directly, or `'all'` when one of those files is in the
 * bootstrap. `null` when nothing says who imports it — a folder read without its metafile, or a
 * package only another package brings in — and then no sentence is made about who needs it.
 *
 * "Imports it directly" is what the sentence claims, and all it claims: a screen can still reach
 * the package through another package, which the graph of the analysis does not keep.
 */
const importersOf = (
    analysis: Analysis,
    name: string,
    placesOf: ReadonlyMap<string, readonly ModulePlace[]>,
): Set<string> | 'all' | null => {
    const importers = analysis.packageImporters.get(name);
    if (!importers || importers.size === 0) {
        return null;
    }

    const screens = new Set<string>();
    for (const file of importers) {
        const places = placesOf.get(file) ?? [];
        if (places.some(place => place.zone === 'boot')) {
            return 'all';
        }
        for (const place of places) {
            const loaders = analysis.chunkScreens.get(place.chunk) ?? [];
            for (const source of loaders) {
                screens.add(source);
            }
        }
    }
    return screens.size > 0 ? screens : null;
};

type Misplaced = Extract<FlowTakeaway, { kind: 'misplaced' }>;

/** The package the most screens download for nothing, weighted by its size. */
const misplacedOf = (analysis: Analysis, fine: Fine, build: number): Misplaced | null => {
    const n = analysis.screens.length;
    const labelOf = new Map(analysis.screens.map(screen => [screen.source, screen.label]));
    const placesOf = new Map(analysis.modules.map(module => [module.path, module.places]));

    let found: Misplaced | null = null;
    let worst = 0;
    for (const [key, bytes] of fine.bytes) {
        if (RESERVED.has(key) || bytes < build * TAKEAWAY_MIN_SHARE) {
            continue;
        }
        const importers = importersOf(analysis, key, placesOf);
        if (importers === null || importers === 'all') {
            continue;
        }
        const downloads = reachCount(fine.reach.get(key), n);
        const waste = bytes * (downloads - importers.size);
        if (downloads <= importers.size || waste <= worst) {
            continue;
        }
        worst = waste;
        found = {
            kind: 'misplaced',
            source: key,
            own: false,
            bytes,
            where: (fine.bootBytes.get(key) ?? 0) > 0 ? 'boot' : 'shared',
            importers: [...importers]
                .map(source => labelOf.get(source) ?? source)
                .toSorted((a, b) => a.localeCompare(b)),
            downloads,
        };
    }
    return found;
};

/** What the heaviest screen downloads on top of the bootstrap, and the one source that is most of it. */
const driverOf = (analysis: Analysis, fine: Fine): Extract<FlowTakeaway, { kind: 'driver' }> | null => {
    const heaviest = analysis.screens[0];
    if (!heaviest || heaviest.shared + heaviest.own <= 0) {
        return null;
    }

    const lazy = new Set([...heaviest.ownChunks, ...heaviest.sharedChunks]);
    const added = new Map<string, { shared: number; own: number }>();
    for (const chunk of fine.chunks) {
        if (!lazy.has(chunk.file)) {
            continue;
        }
        for (const [key, bytes] of chunk.parts) {
            const sum = added.get(key) ?? { shared: 0, own: 0 };
            sum[chunk.zone === 'shared' ? 'shared' : 'own'] += bytes;
            added.set(key, sum);
        }
    }

    const [top] = [...added]
        .filter(([key]) => key !== FLOW_IDS.unattributed && key !== FLOW_IDS.unknown)
        .toSorted((a, b) => b[1].shared + b[1].own - (a[1].shared + a[1].own));
    if (!top) {
        return null;
    }

    const [key, sum] = top;
    return {
        kind: 'driver',
        source: key,
        own: key === FLOW_IDS.own,
        bytes: sum.shared + sum.own,
        screen: heaviest.label,
        total: heaviest.total,
        where: sum.shared > sum.own ? 'shared' : 'own',
        downloads: reachCount(fine.reach.get(key), analysis.screens.length),
    };
};

/** When nothing inside the chunks is named, all there is to say is what the heaviest screen is made of. */
const screenOf = (analysis: Analysis): FlowTakeaway | null => {
    const heaviest = analysis.screens[0];
    return heaviest
        ? {
              kind: 'screen',
              screen: heaviest.label,
              total: heaviest.total,
              boot: heaviest.boot,
              shared: heaviest.shared,
              own: heaviest.own,
          }
        : null;
};

export const takeawayOf = (analysis: Analysis, fine: Fine): FlowTakeaway | null => {
    let build = 0;
    for (const bytes of fine.bytes.values()) {
        build += bytes;
    }
    if (build <= 0) {
        return null;
    }

    const lead = misplacedOf(analysis, fine, build) ?? driverOf(analysis, fine);
    if (lead) {
        return lead;
    }

    const [boot] = [...fine.bootBytes]
        .filter(([key]) => key !== FLOW_IDS.unattributed && key !== FLOW_IDS.unknown)
        .toSorted((a, b) => b[1] - a[1]);
    return boot
        ? {
              kind: 'boot',
              source: boot[0],
              own: boot[0] === FLOW_IDS.own,
              bytes: boot[1],
              boot: analysis.bootBytes,
              screens: analysis.screens.length,
          }
        : screenOf(analysis);
};
