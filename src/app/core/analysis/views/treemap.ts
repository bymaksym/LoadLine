/**
 * The bundle as a map of rectangles: what `esbuild-visualizer` is good at, on Loadline's figures.
 *
 * A table answers "what is heavy"; a map answers "what is inside this chunk" in one look, which is
 * the question somebody has right after a table pointed at a chunk. The two readings need two
 * different scales, and mixing them is how other tools end up quoting raw module sizes as if they
 * were what travels:
 *
 * - **Between chunks, the area is the chunk's weight in the report's unit** — gzip or brotli when
 *   the folder was read — because that is what a browser downloads.
 * - **Inside a chunk, the area is each part's share of the chunk**, raw, because gzip compresses
 *   the file as a whole and "the compressed weight of one package inside a chunk" does not exist.
 *   A share is unit-free, so a chunk's rectangle can be divided by it honestly.
 *
 * The layout is the squarified one (Bruls, Huizing and van Wijk): rows of rectangles kept as close
 * to square as the weights allow, because a long thin sliver cannot carry a label and is read as
 * smaller than it is.
 */

import { formatBytes } from '../../format/format.utils';
import { type TreeNode } from '../analysis.types';

export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface Tile<T> {
    item: T;
    rect: Rect;
}

/** The worst aspect ratio of a row laid along a side of length `side`. Lower is squarer. */
const worst = (row: readonly number[], side: number): number => {
    const sum = row.reduce((total, value) => total + value, 0);
    if (sum <= 0 || side <= 0) {
        return Infinity;
    }
    const max = Math.max(...row);
    const min = Math.min(...row);
    const sideSquared = side * side;
    const sumSquared = sum * sum;
    return Math.max((sideSquared * max) / sumSquared, sumSquared / (sideSquared * min));
};

/**
 * Lays `items` out inside `rect`, each with an area proportional to its weight.
 *
 * Items weighing nothing are left out: a zero-area rectangle is not something anybody can see,
 * point at or read. The order of the result is the order of the weights, largest first, which is
 * also the order a keyboard should visit them in.
 */
export const squarify = <T>(items: readonly T[], weightOf: (item: T) => number, rect: Rect): Tile<T>[] => {
    const weighted = items
        .map(item => ({ item, weight: Math.max(0, weightOf(item)) }))
        .filter(entry => entry.weight > 0)
        .toSorted((a, b) => b.weight - a.weight);
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0 || rect.w <= 0 || rect.h <= 0) {
        return [];
    }

    // Weights as areas of this rectangle, so the row arithmetic is in pixels.
    const scale = (rect.w * rect.h) / total;
    const areas = weighted.map(entry => entry.weight * scale);
    const tiles: Tile<T>[] = [];
    let free = { ...rect };
    let start = 0;

    while (start < areas.length) {
        const side = Math.min(free.w, free.h);
        let end = start + 1;
        // Grow the row while adding the next item makes its worst rectangle squarer.
        while (end < areas.length && worst(areas.slice(start, end + 1), side) <= worst(areas.slice(start, end), side)) {
            end += 1;
        }

        const row = areas.slice(start, end);
        const rowArea = row.reduce((sum, area) => sum + area, 0);
        // The row runs along the shorter side, and takes as much of the longer one as its area asks.
        const horizontal = free.w >= free.h;
        const thickness = rowArea / side;
        let offset = 0;
        for (const [index, entry] of weighted.slice(start, end).entries()) {
            const length = (row[index] ?? 0) / thickness;
            tiles.push({
                item: entry.item,
                rect: horizontal
                    ? { x: free.x, y: free.y + offset, w: thickness, h: length }
                    : { x: free.x + offset, y: free.y, w: length, h: thickness },
            });
            offset += length;
        }

        free = horizontal
            ? { x: free.x + thickness, y: free.y, w: free.w - thickness, h: free.h }
            : { x: free.x, y: free.y + thickness, w: free.w, h: free.h - thickness };
        start = end;
    }

    return tiles;
};

/** One rectangle of the map, as the panel draws it. */
export interface MapNode {
    id: string;
    label: string;
    kind: TreeNode['kind'] | 'rest' | 'unattributed' | 'build';
    /** What the area is proportional to at its level: the report's unit for a chunk, raw inside one. */
    weight: number;
    /** The chunk's figure in the report's unit. Only chunks have one. */
    bytes: number | null;
    /** Raw bytes: the chunk on disk, or the part's raw weight inside its chunk. */
    raw: number;
    /**
     * The report's unit per raw byte of the chunk it belongs to: what its compressed figure over its
     * size on disk is. `1` in a raw report. It is what lets a part be read in the unit the chunks are
     * read in — see `figureOfNode`.
     */
    ratio: number;
    zone: NonNullable<TreeNode['zone']>;
    screens: number;
    /** Code of the project rather than of a package: drawn striped, so the two read apart. */
    own: boolean;
    children: MapNode[];
    /** Every label underneath, lower-cased, so a search matches a chunk by what it holds. */
    haystack: string;
}

/** Below this share of their level, items are folded into one "N more" rectangle. */
const REST_SHARE = 0.004;

const haystackOf = (node: TreeNode): string =>
    [node.label, ...node.children.map(child => haystackOf(child))].join('\n').toLowerCase();

/** A part of a chunk, and what is under it, all on the chunk's zone. */
const partOf = (
    node: TreeNode,
    zone: MapNode['zone'],
    screens: number,
    rest: (count: number) => string,
    ratio: number,
    own = node.kind === 'folder',
): MapNode => ({
    id: node.id,
    label: node.label,
    kind: node.kind,
    weight: node.bytes,
    bytes: null,
    raw: node.bytes,
    ratio,
    zone,
    screens,
    own,
    children: foldSmall(
        node.children.map(child => partOf(child, zone, screens, rest, ratio, own)),
        rest,
        node.id,
    ),
    haystack: haystackOf(node),
});

/**
 * Many small items as one rectangle, so a level of four hundred chunks stays readable. It opens
 * like any other, and inside it the small ones get the whole map to themselves.
 */
const foldSmall = (nodes: MapNode[], rest: (count: number) => string, parent: string): MapNode[] => {
    const total = nodes.reduce((sum, node) => sum + node.weight, 0);
    const big = nodes.filter(node => node.weight >= total * REST_SHARE);
    const small = nodes.filter(node => node.weight < total * REST_SHARE);
    if (small.length < 3) {
        return nodes;
    }

    const first = small[0];
    return [
        ...big,
        {
            id: `${parent}::rest`,
            label: rest(small.length),
            kind: 'rest',
            weight: small.reduce((sum, node) => sum + node.weight, 0),
            bytes: small.every(node => node.bytes !== null)
                ? small.reduce((sum, node) => sum + (node.bytes ?? 0), 0)
                : null,
            raw: small.reduce((sum, node) => sum + node.raw, 0),
            ratio: first?.ratio ?? 1,
            // A mix of zones takes the first one's colour; the detail says what is inside.
            zone: first?.zone ?? 'own',
            screens: 0,
            own: small.every(node => node.own),
            children: small,
            haystack: small.map(node => node.haystack).join('\n'),
        },
    ];
};

/**
 * The chunks of the analysis as a map: chunk → package or folder → file.
 *
 * @param unattributed the label for what a chunk holds beyond the files the metafile names — the
 *                     bundler's own wrapper code — so the parts of a chunk fill all of it.
 * @param rest         the label for the folded small items, given how many there are.
 */
export const mapOf = (
    tree: readonly TreeNode[],
    labels: { unattributed: string; rest: (count: number) => string },
): MapNode[] => {
    const chunks = tree.map((chunk): MapNode => {
        const zone = chunk.zone ?? 'own';
        const screens = chunk.screens ?? 0;
        const raw = chunk.rawBytes ?? chunk.bytes;
        const ratio = raw > 0 ? chunk.bytes / raw : 1;
        const parts = chunk.children.map(child => partOf(child, zone, screens, labels.rest, ratio));
        const named = parts.reduce((sum, part) => sum + part.weight, 0);
        // What the metafile does not attribute to any file. Only ever added, never subtracted:
        // when the parts add up to more than the file (Angular 22's chunk optimizer), each one's
        // share of the rectangle is still its share of the sum.
        const remainder = raw - named;
        const withRemainder =
            parts.length > 0 && remainder > raw * 0.02
                ? [
                      ...parts,
                      {
                          id: `${chunk.id}::unattributed`,
                          label: labels.unattributed,
                          kind: 'unattributed' as const,
                          weight: remainder,
                          bytes: null,
                          raw: remainder,
                          ratio,
                          zone,
                          screens,
                          own: false,
                          children: [],
                          haystack: '',
                      },
                  ]
                : parts;

        return {
            id: chunk.id,
            label: chunk.label,
            kind: 'chunk',
            weight: chunk.bytes,
            bytes: chunk.bytes,
            raw,
            ratio,
            zone,
            screens,
            own: false,
            children: foldSmall(withRemainder, labels.rest, chunk.id),
            haystack: haystackOf(chunk),
        };
    });

    return foldSmall(chunks, labels.rest, 'root');
};

/**
 * The figure a node is read by, in the report's unit. A chunk has its own; a part of one is its raw
 * share at the ratio its chunk compresses by, marked `≈`. Printed raw, the parts of a gzip map read
 * "excalidraw/subset 1,74 MB" inside a chunk of 0,7 MB, under a line saying the map was in gzip.
 */
export const figureOfNode = (node: MapNode): string =>
    node.bytes === null
        ? node.ratio === 1
            ? formatBytes(node.raw)
            : `≈${formatBytes(Math.round(node.raw * node.ratio))}`
        : formatBytes(node.bytes);

/** The node a path of ids leads to, and every node on the way: the breadcrumb. */
export const pathTo = (roots: readonly MapNode[], ids: readonly string[]): MapNode[] => {
    const trail: MapNode[] = [];
    let level: readonly MapNode[] = roots;
    for (const id of ids) {
        const next = level.find(node => node.id === id);
        if (!next) {
            break;
        }
        trail.push(next);
        level = next.children;
    }
    return trail;
};
