/**
 * The flow diagram placed in pixels: every node with its place, every ribbon with its two slots.
 *
 * **Two scales, on purpose.** The left and middle columns are bytes of the build, counted once,
 * and share one scale: a ribbon between them keeps its width end to end. The right column is what
 * each screen downloads, so a chunk five screens load reaches it five times; drawn on the same
 * scale, the right column of a build with twelve screens is about ten times taller than the left
 * one. So the screens have a scale of their own — their heights compare with each other and with
 * nothing else — and each middle node shares its height out among the screens that download it:
 * the bootstrap leaves in as many equal ribbons as there are screens.
 */

import {
    type FlowFrame,
    type FlowLayout,
    type FlowLink,
    type FlowModel,
    type PlacedLink,
    type PlacedNode,
} from './flow.types';

/**
 * Pixels per byte for one column: the largest scale at which its nodes, each at least `minNode`
 * tall, and the gaps between them fit in `height`. Nodes the floor lifts are taken out and the
 * scale worked out again for the rest, until none changes side.
 */
const scaleOf = (values: readonly number[], frame: FlowFrame): number => {
    const room = frame.height - Math.max(0, values.length - 1) * frame.gap;
    let floored = new Set<number>();
    for (let pass = 0; pass <= values.length; pass++) {
        const free = values.reduce((sum, value, index) => (floored.has(index) ? sum : sum + value), 0);
        const scale = free > 0 ? Math.max(0, room - floored.size * frame.minNode) / free : 0;
        const next = new Set(values.flatMap((value, index) => (value * scale < frame.minNode ? [index] : [])));
        if (next.size === floored.size) {
            return scale;
        }
        floored = next;
    }
    return 0;
};

/** One column stacked top to bottom on a scale, centred in the frame. */
const stack = (
    nodes: readonly { id: string; bytes: number }[],
    column: 0 | 1 | 2,
    scale: number,
    frame: FlowFrame,
): PlacedNode[] => {
    const heights = nodes.map(node => Math.max(frame.minNode, node.bytes * scale));
    const used = heights.reduce((sum, h) => sum + h, 0) + Math.max(0, nodes.length - 1) * frame.gap;
    let y = Math.max(0, (frame.height - used) / 2);
    return nodes.map((node, index) => {
        const h = heights[index] ?? frame.minNode;
        const placed: PlacedNode = { id: node.id, column, x: frame.columns[column], y, h };
        y += h + frame.gap;
        return placed;
    });
};

/**
 * Ribbons between two columns. Each node's edge is shared out among its ribbons in proportion to
 * their bytes, in the order of the nodes at their other end — so ribbons leave a node already
 * sorted the way they are going, and the slots always fill the node exactly.
 */
const ribbons = (
    links: readonly FlowLink[],
    placed: ReadonlyMap<string, PlacedNode>,
    frame: FlowFrame,
): PlacedLink[] => {
    const rank = (id: string): number => {
        const node = placed.get(id);
        return node ? node.y : Infinity;
    };
    const slots = (side: 'from' | 'to'): Map<FlowLink, { y: number; h: number }> => {
        const result = new Map<FlowLink, { y: number; h: number }>();
        // A loop rather than `Map.groupBy`: that is Node 21, and this runs on 20.19.
        const groups = new Map<string, FlowLink[]>();
        for (const link of links) {
            const group = groups.get(link[side]);
            if (group) {
                group.push(link);
            } else {
                groups.set(link[side], [link]);
            }
        }
        for (const [id, group] of groups) {
            const node = placed.get(id);
            if (!node) {
                continue;
            }
            const total = group.reduce((sum, link) => sum + link.bytes, 0);
            const other = side === 'from' ? 'to' : 'from';
            let y = node.y;
            const sorted = group.toSorted((a, b) => rank(a[other]) - rank(b[other]));
            for (const link of sorted) {
                const h = total > 0 ? (node.h * link.bytes) / total : 0;
                result.set(link, { y, h });
                y += h;
            }
        }
        return result;
    };

    const starts = slots('from');
    const ends = slots('to');
    return links.flatMap(link => {
        const from = placed.get(link.from);
        const to = placed.get(link.to);
        const start = starts.get(link);
        const end = ends.get(link);
        return from && to && start && end
            ? [{ ...link, x0: from.x + frame.nodeWidth, y0: start.y, h0: start.h, x1: to.x, y1: end.y, h1: end.h }]
            : [];
    });
};

/**
 * The drawing: every node with its place, every ribbon with its two slots.
 *
 * The left and middle columns share one scale — they are the same bytes, counted once, and a
 * ribbon between them keeps its width end to end. The right column has its own (see the top of
 * this file), so a ribbon into a screen changes width on the way, and the screens' heights compare
 * with each other and with nothing else.
 */
export const layoutFlow = (model: FlowModel, frame: FlowFrame): FlowLayout => {
    const left = scaleOf(
        model.sources.map(node => node.bytes),
        frame,
    );
    const middle = scaleOf(
        model.middles.map(node => node.bytes),
        frame,
    );
    const shared = Math.min(left, middle);
    const right = scaleOf(
        model.targets.map(node => node.total),
        frame,
    );

    const nodes = [
        ...stack(model.sources, 0, shared, frame),
        ...stack(model.middles, 1, shared, frame),
        ...stack(
            model.targets.map(node => ({ id: node.id, bytes: node.total })),
            2,
            right,
            frame,
        ),
    ];
    const placed = new Map(nodes.map(node => [node.id, node]));
    const width = frame.columns[2] + frame.nodeWidth;

    return {
        nodes,
        inLinks: ribbons(model.inLinks, placed, frame),
        outLinks: ribbons(model.outLinks, placed, frame),
        width,
        height: frame.height,
    };
};

const r1 = (value: number): number => Math.round(value * 10) / 10;

/**
 * The outline of a ribbon, or of the band `[from, to]` of it (fractions of its width): two cubic
 * curves, top and bottom, joined at the ends. The band is how a highlight draws the part of a
 * ribbon that belongs to one package without drawing a second ribbon beside it.
 */
export const ribbonPath = (link: PlacedLink, from = 0, to = 1): string => {
    const mid = r1((link.x0 + link.x1) / 2);
    const [x0, x1] = [r1(link.x0), r1(link.x1)];
    const top0 = r1(link.y0 + link.h0 * from);
    const bottom0 = r1(link.y0 + link.h0 * to);
    const top1 = r1(link.y1 + link.h1 * from);
    const bottom1 = r1(link.y1 + link.h1 * to);
    return (
        `M${x0},${top0}C${mid},${top0} ${mid},${top1} ${x1},${top1}` +
        `L${x1},${bottom1}C${mid},${bottom1} ${mid},${bottom0} ${x0},${bottom0}Z`
    );
};

/**
 * Where each label of a column goes: next to the centre of its node, pushed apart until two of them
 * are at least `gap` apart, and kept inside `[top, bottom]`. A forward pass pushes down, a backward
 * one pulls back what the bottom edge does not hold.
 */
export const spreadLabels = (centres: readonly number[], gap: number, top: number, bottom: number): number[] => {
    const ys = centres.map(centre => centre);
    for (let index = 0; index < ys.length; index++) {
        ys[index] = Math.max(ys[index] ?? 0, index === 0 ? top : (ys[index - 1] ?? top) + gap);
    }
    for (let index = ys.length - 1; index >= 0; index--) {
        ys[index] = Math.min(ys[index] ?? 0, index === ys.length - 1 ? bottom : (ys[index + 1] ?? bottom) - gap);
    }
    return ys.map(y => Math.max(top, y));
};
