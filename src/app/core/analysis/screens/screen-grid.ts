/**
 * Screens × packages: what each screen downloads from each package, as a grid.
 *
 * The screens table says how much a screen costs and the bootstrap tab what the first load is made
 * of; neither shows the one pattern that matters most across both: **a package every screen pays
 * for**. In a grid it is a column filled from top to bottom, and it jumps out without reading a
 * figure. The bootstrap's columns are full by definition — everybody downloads it — and the lazy
 * ones say whether a heavy library is one screen's business or everybody's.
 *
 * Raw minified bytes, like every breakdown inside a chunk: a compressed size does not exist per
 * file. Columns are capped and the tail folded into one, so a build with sixty packages is still a
 * grid somebody can read.
 */

import { type Analysis } from '../analysis.types';

export type GridColumnKind = 'package' | 'own' | 'rest';

export interface GridColumn {
    /** The package name; empty for `own` and `rest`, which the page names in its language. */
    name: string;
    kind: GridColumnKind;
    /** In the bootstrap — downloaded by every screen — or loaded with the screens that need it. */
    boot: boolean;
    /** Across every screen: what orders the columns. */
    total: number;
}

export interface GridRow {
    label: string;
    source: string;
    /** The screen's total in the report's unit, as the screens table shows it. */
    total: number;
    /** Raw bytes per column, in the order of `ScreenGrid.columns`. */
    cells: number[];
}

export interface ScreenGrid {
    columns: GridColumn[];
    rows: GridRow[];
    /** The largest cell, which the shading is scaled to. */
    max: number;
}

/** How many columns of each side are named before the rest are folded into one. */
const BOOT_COLUMNS = 6;
const LAZY_COLUMNS = 8;

/** The heaviest `limit` keys of a weight map, the rest summed into `rest` when there is any. */
const top = (weights: ReadonlyMap<string, number>, limit: number): { kept: string[]; folded: string[] } => {
    const sorted = [...weights].toSorted((a, b) => b[1] - a[1]).map(([key]) => key);
    return sorted.length <= limit + 1
        ? { kept: sorted, folded: [] }
        : { kept: sorted.slice(0, limit), folded: sorted.slice(limit) };
};

/**
 * Key of the project's own code, as one column. No package name can start with a parenthesis, so
 * it cannot collide with one.
 */
const OWN = '(own)';

export const screenGridOf = (analysis: Analysis): ScreenGrid => {
    const boot = new Set(analysis.bootChunks);

    // The bootstrap side: one weight per package, the project's folders as one column.
    const bootWeights = new Map<string, number>();
    for (const bucket of analysis.bootBuckets) {
        const key = bucket.isProjectCode ? OWN : bucket.name;
        bootWeights.set(key, (bootWeights.get(key) ?? 0) + bucket.bytes);
    }

    // The lazy side, per screen: what the chunks it loads hold, outside the bootstrap.
    const perScreen = analysis.screens.map(screen => {
        const chunks = new Set([...screen.ownChunks, ...screen.sharedChunks].filter(chunk => !boot.has(chunk)));
        const weights = new Map<string, number>();
        for (const module of analysis.modules) {
            for (const place of module.places) {
                if (!chunks.has(place.chunk)) {
                    continue;
                }
                const key = module.pkg ?? OWN;
                weights.set(key, (weights.get(key) ?? 0) + place.bytes);
            }
        }
        return weights;
    });

    const lazyTotals = new Map<string, number>();
    for (const weights of perScreen) {
        for (const [key, bytes] of weights) {
            lazyTotals.set(key, (lazyTotals.get(key) ?? 0) + bytes);
        }
    }

    const bootSide = top(bootWeights, BOOT_COLUMNS);
    const lazySide = top(lazyTotals, LAZY_COLUMNS);

    const column = (key: string, isBoot: boolean, total: number): GridColumn => ({
        name: key === OWN ? '' : key,
        kind: key === OWN ? 'own' : 'package',
        boot: isBoot,
        total,
    });
    const sum = (weights: ReadonlyMap<string, number>, keys: readonly string[]): number =>
        keys.reduce((total, key) => total + (weights.get(key) ?? 0), 0);

    const columns: GridColumn[] = [
        ...bootSide.kept.map(key => column(key, true, (bootWeights.get(key) ?? 0) * analysis.screens.length)),
        ...(bootSide.folded.length > 0
            ? [{ name: '', kind: 'rest' as const, boot: true, total: sum(bootWeights, bootSide.folded) }]
            : []),
        ...lazySide.kept.map(key => column(key, false, lazyTotals.get(key) ?? 0)),
        ...(lazySide.folded.length > 0
            ? [{ name: '', kind: 'rest' as const, boot: false, total: sum(lazyTotals, lazySide.folded) }]
            : []),
    ];

    const rows = analysis.screens.map((screen, index): GridRow => {
        const weights = perScreen[index] ?? new Map<string, number>();
        return {
            label: screen.label,
            source: screen.source,
            total: screen.total,
            cells: [
                ...bootSide.kept.map(key => bootWeights.get(key) ?? 0),
                ...(bootSide.folded.length > 0 ? [sum(bootWeights, bootSide.folded)] : []),
                ...lazySide.kept.map(key => weights.get(key) ?? 0),
                ...(lazySide.folded.length > 0 ? [sum(weights, lazySide.folded)] : []),
            ],
        };
    });

    return { columns, rows, max: Math.max(0, ...rows.flatMap(row => row.cells)) };
};
