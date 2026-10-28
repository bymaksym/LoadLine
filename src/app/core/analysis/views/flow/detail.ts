/**
 * One node of the flow read back as figures — what the panel under the diagram and the table say —
 * and how much of each ribbon to light while somebody looks at it.
 */

import { formatBytes } from '../../../format/format.utils';
import { type Zone } from '../../analysis.types';
import { add, FLOW_IDS } from './fine';
import { type FlowDetail, type FlowLink, type FlowModel } from './flow.types';

const ranked = (sums: Map<string, number>): { id: string; bytes: number }[] =>
    [...sums]
        .filter(([, bytes]) => bytes > 0)
        .map(([id, bytes]) => ({ id, bytes }))
        .toSorted((a, b) => b.bytes - a.bytes);

/**
 * Everything the model knows about one node, as figures: where its bytes live, what feeds it and
 * which screens it reaches. `null` for an id that is not a node of the model.
 */
export const flowDetailOf = (model: FlowModel, id: string): FlowDetail | null => {
    const column = model.sources.some(node => node.id === id)
        ? 'source'
        : model.middles.some(node => node.id === id)
          ? 'middle'
          : model.targets.some(node => node.id === id)
            ? 'target'
            : null;
    if (column === null) {
        return null;
    }

    const zones: Record<Zone, number> = { boot: 0, shared: 0, own: 0 };
    const sources = new Map<string, number>();
    const middles = new Map<string, number>();
    const targets = new Map<string, number>();
    const beyondBoot = new Map<string, number>();

    for (const link of model.inLinks) {
        if (column === 'source' && link.from === id) {
            zones[link.zone] += link.bytes;
            add(middles, link.to, link.bytes);
        } else if (column === 'middle' && link.to === id) {
            zones[link.zone] += link.bytes;
            add(sources, link.from, link.bytes);
        }
    }
    for (const link of model.outLinks) {
        if (column === 'middle' && link.from === id) {
            add(targets, link.to, link.bytes);
        } else if (column === 'target' && link.to === id) {
            zones[link.zone] += link.bytes;
            add(middles, link.from, link.bytes);
        }
    }
    for (const path of model.paths) {
        if (column === 'source' && path.source === id) {
            add(targets, path.target, path.bytes);
        } else if (column === 'target' && path.target === id) {
            add(sources, path.source, path.bytes);
            if (path.middle !== FLOW_IDS.boot) {
                add(beyondBoot, path.source, path.bytes);
            }
        }
    }

    return {
        zones,
        sources: ranked(sources),
        middles: ranked(middles),
        targets: ranked(targets),
        beyondBoot: ranked(beyondBoot),
    };
};

/**
 * How much of each ribbon to light while one node is looked at, as a fraction of its width: the
 * whole ribbon when it touches the node, and otherwise the part of it that comes from or goes to
 * that node. Hovering `chart.js` lights all of its own ribbons and, on the other side of the shared
 * chunk, the band of each screen's ribbon that is `chart.js` — not the whole chunk.
 *
 * Keyed by `from`, a NUL, and `to`. A ribbon absent from the map is not lit.
 */
export const litFractions = (model: FlowModel, id: string): Map<string, number> => {
    const lit = new Map<string, number>();
    const key = (link: FlowLink): string => `${link.from}\0${link.to}`;
    const through = new Map<string, number>();
    const isSource = model.sources.some(node => node.id === id);
    const isTarget = model.targets.some(node => node.id === id);

    for (const path of model.paths) {
        if (isSource && path.source === id) {
            add(through, `${path.middle}\0${path.target}`, path.bytes);
        } else if (isTarget && path.target === id) {
            add(through, `${path.source}\0${path.middle}`, path.bytes);
        }
    }

    for (const link of [...model.inLinks, ...model.outLinks]) {
        const touches = link.from === id || link.to === id;
        const part = touches ? link.bytes : (through.get(key(link)) ?? 0);
        if (part > 0 && link.bytes > 0) {
            lit.set(key(link), Math.min(1, part / link.bytes));
        }
    }
    return lit;
};

/** A figure in the report's unit, rounded: a package's share of a chunk is never a whole byte. */
export const flowBytes = (bytes: number): string => formatBytes(Math.round(bytes));
