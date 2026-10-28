/**
 * The order of each column of the flow diagram: the one that crosses the fewest ribbons, found with
 * the barycentre heuristic — the simplest one that takes most crossings out of a layered drawing —
 * and the nodes that stand for "the rest" kept at the bottom, where a reader looks for them.
 */

import { type FlowLink } from './flow.types';

/**
 * Orders `ids` by the weighted mean position of what they connect to on the other column. Ties,
 * and nodes with no ribbon to that column, keep the order given.
 */
const byBarycentre = (
    ids: readonly string[],
    links: readonly FlowLink[],
    side: 'from' | 'to',
    other: readonly string[],
): string[] => {
    const position = new Map(other.map((id, index) => [id, index]));
    const sums = new Map<string, { weighted: number; bytes: number }>();
    for (const link of links) {
        const self = side === 'from' ? link.from : link.to;
        const at = position.get(side === 'from' ? link.to : link.from);
        if (at === undefined) {
            continue;
        }
        const sum = sums.get(self) ?? { weighted: 0, bytes: 0 };
        sum.weighted += at * link.bytes;
        sum.bytes += link.bytes;
        sums.set(self, sum);
    }

    const centre = (id: string): number => {
        const sum = sums.get(id);
        return sum && sum.bytes > 0 ? sum.weighted / sum.bytes : Infinity;
    };
    return ids
        .map((id, index) => ({ id, index, centre: centre(id) }))
        .toSorted((a, b) => a.centre - b.centre || a.index - b.index)
        .map(entry => entry.id);
};

/** Ids in the order given, with the ones that must stay at an end put back there. */
const pinned = (ordered: readonly string[], ends: { first: readonly string[]; last: readonly string[] }): string[] => [
    ...ends.first.filter(id => ordered.includes(id)),
    ...ordered.filter(id => !ends.first.includes(id) && !ends.last.includes(id)),
    ...ends.last.filter(id => ordered.includes(id)),
];

/**
 * How many pairs of ribbons cross between two columns, given the order of each. Two ribbons cross
 * when their ends are in opposite orders; two that share an end do not.
 */
export const crossingsOf = (links: readonly FlowLink[], left: readonly string[], right: readonly string[]): number => {
    const l = new Map(left.map((id, index) => [id, index]));
    const r = new Map(right.map((id, index) => [id, index]));
    const ends = links
        .map(link => [l.get(link.from), r.get(link.to)] as const)
        .filter((pair): pair is readonly [number, number] => pair[0] !== undefined && pair[1] !== undefined);

    let count = 0;
    for (let i = 0; i < ends.length; i++) {
        for (let j = i + 1; j < ends.length; j++) {
            const [a0 = 0, a1 = 0] = ends[i] ?? [];
            const [b0 = 0, b1 = 0] = ends[j] ?? [];
            if ((a0 - b0) * (a1 - b1) < 0) {
                count += 1;
            }
        }
    }
    return count;
};

export interface ColumnEnds {
    first: readonly string[];
    last: readonly string[];
}

/**
 * The three columns in drawing order. Two sweeps between the middle and the right — each ordered by
 * where its ribbons go on the other — then the left by where its ribbons go in the middle. The
 * screens start heaviest first, so a tie leaves the heavy ones on top.
 */
export const orderColumns = (
    columns: { sources: readonly string[]; middles: readonly string[]; targets: readonly string[] },
    links: { inLinks: readonly FlowLink[]; outLinks: readonly FlowLink[] },
    ends: { sources: ColumnEnds; middles: ColumnEnds; targets: ColumnEnds },
): { sources: string[]; middles: string[]; targets: string[] } => {
    let targets = [...columns.targets];
    let middles = [...columns.middles];
    for (let sweep = 0; sweep < 2; sweep++) {
        middles = pinned(byBarycentre(middles, links.outLinks, 'from', targets), ends.middles);
        targets = pinned(byBarycentre(targets, links.outLinks, 'to', middles), ends.targets);
    }
    const sources = pinned(byBarycentre(columns.sources, links.inLinks, 'from', middles), ends.sources);
    return { sources, middles, targets };
};
