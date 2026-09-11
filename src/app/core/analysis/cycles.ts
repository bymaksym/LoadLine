/**
 * Cycles in the import graph: `checkout → shared → analytics → checkout`.
 *
 * This is architecture, and architecture is normally somewhere you can only have an opinion. Here
 * it comes out of the same graph as the bytes and ends in bytes: a cycle lengthens import chains —
 * the round trips the report already counts — and it is what stops a bundler from tree-shaking a
 * module, because it cannot prove which half of the loop is needed first.
 *
 * Two readings of the same fact. **By file** is what a person fixes: one import to move. **By
 * folder** is what a person writes a rule about, and it is the one that survives a refactor, since
 * `checkout` importing `shared` importing `checkout` stays true however the files are renamed.
 */

import { projectFolderOf } from '../format/format.utils';
import { type Cycle } from './insights.types';
import { type ModuleGraph, shortestLoop, stronglyConnected } from './module-graph';

export interface CycleInput {
    graph: ModuleGraph;
    isOwn: (path: string) => boolean;
    shippedBytesOf: (path: string) => number;
    inBoot: (path: string) => boolean;
    label: (path: string) => string;
}

/**
 * Cycles between files.
 *
 * A strongly connected component of forty files is not something anybody can act on, so what is
 * reported per component is the shortest loop through its heaviest member: the circle somebody
 * would draw on a whiteboard, with the file that costs the most on it.
 *
 * Only the project's own files. A cycle inside `node_modules` is real and is not this project's to
 * fix, and reporting it would bury the ones that are.
 */
export const fileCycles = (input: CycleInput): Cycle[] => {
    const { graph } = input;
    // The own-code subgraph, kept at full width so node ids still index the original arrays.
    const own = graph.nodes.map((path, id) =>
        input.isOwn(path) ? (graph.statics[id] ?? []).filter(next => input.isOwn(graph.nodes[next] ?? '')) : [],
    );

    return stronglyConnected(own, graph.nodes.length)
        .map((component): Cycle => {
            const inside = new Set(component);
            const bytes = component.reduce((sum, id) => sum + input.shippedBytesOf(graph.nodes[id] ?? ''), 0);
            const heaviest =
                component.toSorted(
                    (a, b) => input.shippedBytesOf(graph.nodes[b] ?? '') - input.shippedBytesOf(graph.nodes[a] ?? ''),
                )[0] ?? component[0];

            return {
                steps: shortestLoop(own, heaviest ?? 0, inside).map(id => input.label(graph.nodes[id] ?? '')),
                size: component.length,
                bytes,
                inBoot: component.some(id => input.inBoot(graph.nodes[id] ?? '')),
            };
        })
        .toSorted((a, b) => Number(b.inBoot) - Number(a.inBoot) || b.bytes - a.bytes);
};

/**
 * The same thing between folders of the project, which is the level a rule gets written at.
 *
 * A folder graph is tiny — tens of nodes — so every cycle in it is short enough to print whole.
 */
export const folderCycles = (input: CycleInput): Cycle[] => {
    const { graph } = input;
    const folders: string[] = [];
    const index = new Map<string, number>();
    const idOf = (folder: string): number => {
        const existing = index.get(folder);
        if (existing !== undefined) {
            return existing;
        }
        const id = folders.length;
        folders.push(folder);
        index.set(folder, id);
        return id;
    };

    const bytes = new Map<string, number>();
    const boot = new Set<string>();
    const edges = new Map<number, Set<number>>();

    /** One own file: its folder's weight, and an edge per folder it imports something from. */
    const place = (id: number, path: string): void => {
        if (!input.isOwn(path)) {
            return;
        }

        const from = projectFolderOf(path);
        const fromId = idOf(from);
        bytes.set(from, (bytes.get(from) ?? 0) + input.shippedBytesOf(path));
        if (input.inBoot(path)) {
            boot.add(from);
        }

        const outgoing = graph.statics[id] ?? [];
        const targets = outgoing
            .map(next => graph.nodes[next] ?? '')
            .filter(target => input.isOwn(target))
            .map(target => projectFolderOf(target))
            // A folder importing itself is not a cycle between folders, it is a folder.
            .filter(to => to !== from);

        const set = edges.get(fromId) ?? new Set<number>();
        for (const to of targets) {
            set.add(idOf(to));
        }
        edges.set(fromId, set);
    };

    for (const [id, path] of graph.nodes.entries()) {
        place(id, path);
    }

    const adjacency = folders.map((_, id) => [...(edges.get(id) ?? [])]);

    return stronglyConnected(adjacency, folders.length)
        .map((component): Cycle => {
            const inside = new Set(component);
            const heaviest =
                component.toSorted(
                    (a, b) => (bytes.get(folders[b] ?? '') ?? 0) - (bytes.get(folders[a] ?? '') ?? 0),
                )[0] ?? component[0];

            return {
                steps: shortestLoop(adjacency, heaviest ?? 0, inside).map(id => folders[id] ?? ''),
                size: component.length,
                bytes: component.reduce((sum, id) => sum + (bytes.get(folders[id] ?? '') ?? 0), 0),
                inBoot: component.some(id => boot.has(folders[id] ?? '')),
            };
        })
        .toSorted((a, b) => Number(b.inBoot) - Number(a.inBoot) || b.bytes - a.bytes);
};
