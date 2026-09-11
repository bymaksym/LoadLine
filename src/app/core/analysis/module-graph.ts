/**
 * The source graph as something to walk quickly, and the three walks every insight is built on.
 *
 * `analysis.ts` walks `meta.inputs` directly, which is fine when it is done twice. The figures in
 * `insights.ts` walk it once per package, so the graph is turned into arrays of integers first:
 * the same breadth-first search over string keys of a `Record` is several times slower, and on a
 * two-megabyte metafile that is the difference between a report and a frozen tab.
 */

import { type Metafile } from './metafile.types';

/** An adjacency list over integers, with the strings on the side. */
export interface ModuleGraph {
    /** Every input of the metafile, in a fixed order. Its index is the node id. */
    nodes: string[];
    /** Path → node id. */
    index: ReadonlyMap<string, number>;
    /** Node → nodes it imports with a plain `import ... from` or a `require`. */
    statics: readonly number[][];
    /** Node → nodes it imports with `import()`. */
    dynamics: readonly number[][];
    /** Node → nodes importing it, either way. The inverse graph, for "who brings this in". */
    importedBy: readonly number[][];
}

/** Whether an edge keeps two files in the same chunk. A lazy boundary and an external do not. */
const travelsTogether = (kind: string, external?: boolean): boolean => !external && kind !== 'dynamic-import';

export const buildModuleGraph = (inputs: Metafile['inputs']): ModuleGraph => {
    const nodes = Object.keys(inputs);
    const index = new Map(nodes.map((path, id) => [path, id]));
    const statics: number[][] = nodes.map(() => []);
    const dynamics: number[][] = nodes.map(() => []);
    const importedBy: number[][] = nodes.map(() => []);

    /** One edge of one file. An external import names something outside the bundle: no node for it. */
    const link = (from: number, edge: { path: string; kind: string; external?: boolean }): void => {
        const to = index.get(edge.path);
        if (to === undefined || edge.external) {
            return;
        }

        (travelsTogether(edge.kind, edge.external) ? statics : dynamics)[from]?.push(to);
        importedBy[to]?.push(from);
    };

    const entries = [...nodes.entries()];
    for (const [from, path] of entries) {
        const imports = inputs[path]?.imports ?? [];
        for (const edge of imports) {
            link(from, edge);
        }
    }

    return { nodes, index, statics, dynamics, importedBy };
};

/**
 * What is reachable from a set of roots, following one kind of edge.
 *
 * `skip` is what makes the exclusive weight computable: walking the graph with a package taken out
 * and seeing what no longer arrives is the same question as "what does only this package bring
 * in", asked in the direction that has an answer.
 */
export const reachIds = (
    graph: ModuleGraph,
    roots: readonly number[],
    edges: readonly (readonly number[])[],
    skip?: ReadonlySet<number>,
): Uint8Array => {
    const seen = new Uint8Array(graph.nodes.length);
    const stack = roots.filter(root => !skip?.has(root));

    while (stack.length > 0) {
        const node = stack.pop();
        if (node === undefined || seen[node] === 1) {
            continue;
        }

        seen[node] = 1;
        const next = edges[node] ?? [];
        const wanted = next.filter(other => seen[other] === 0 && !skip?.has(other));
        stack.push(...wanted);
    }

    return seen;
};

/** The bookkeeping one run of Tarjan's algorithm carries. */
interface TarjanState {
    order: Int32Array;
    low: Int32Array;
    onStack: Uint8Array;
    /** Nodes of components not closed yet, in the order they were first seen. */
    open: number[];
    components: number[][];
    next: number;
}

/**
 * Pops one component off the open stack, up to and including `root`.
 *
 * A component of a single node is only a cycle when the node imports itself, which is rare and
 * real: a file re-exporting from its own path through an alias.
 */
const closeComponent = (state: TarjanState, root: number, edges: readonly (readonly number[])[]): void => {
    const found: number[] = [];
    let member = state.open.pop();
    while (member !== undefined) {
        state.onStack[member] = 0;
        found.push(member);
        if (member === root) {
            break;
        }
        member = state.open.pop();
    }

    const selfEdge = found.length === 1 && (edges[root] ?? []).includes(root);
    if (found.length > 1 || selfEdge) {
        state.components.push(found);
    }
};

/** The walk out of one root, with an explicit stack of "node, and how far through its edges". */
const walkFrom = (state: TarjanState, root: number, edges: readonly (readonly number[])[]): void => {
    const frames: { node: number; edge: number }[] = [{ node: root, edge: 0 }];
    state.order[root] = state.low[root] = state.next++;
    state.open.push(root);
    state.onStack[root] = 1;

    while (frames.length > 0) {
        const frame = frames.at(-1);
        if (!frame) {
            return;
        }

        const outgoing = edges[frame.node] ?? [];
        if (frame.edge < outgoing.length) {
            const child = outgoing[frame.edge++] ?? 0;
            if (state.order[child] === -1) {
                state.order[child] = state.low[child] = state.next++;
                state.open.push(child);
                state.onStack[child] = 1;
                frames.push({ node: child, edge: 0 });
            } else if (state.onStack[child] === 1) {
                state.low[frame.node] = Math.min(state.low[frame.node] ?? 0, state.order[child] ?? 0);
            }
            continue;
        }

        frames.pop();
        const parent = frames.at(-1);
        if (parent) {
            state.low[parent.node] = Math.min(state.low[parent.node] ?? 0, state.low[frame.node] ?? 0);
        }

        // A node whose lowest reachable order is its own closes a component.
        if (state.low[frame.node] === state.order[frame.node]) {
            closeComponent(state, frame.node, edges);
        }
    }
};

/**
 * The strongly connected components of a graph, iteratively.
 *
 * Tarjan's algorithm, written with an explicit stack rather than recursion: a bundle can nest
 * imports thousands deep — a barrel importing a barrel importing a barrel — and the recursive
 * version blows the JavaScript stack on exactly the projects this figure is about.
 *
 * @returns one array of node ids per component, in no particular order. Single nodes without a
 *          self-edge are left out: they are not cycles.
 */
export const stronglyConnected = (edges: readonly (readonly number[])[], count: number): number[][] => {
    const state: TarjanState = {
        order: new Int32Array(count).fill(-1),
        low: new Int32Array(count),
        onStack: new Uint8Array(count),
        open: [],
        components: [],
        next: 0,
    };

    for (let root = 0; root < count; root++) {
        if (state.order[root] === -1) {
            walkFrom(state, root, edges);
        }
    }

    return state.components;
};

/**
 * The shortest loop through a node inside its component: a breadth-first walk out of it that stops
 * the first time it comes back.
 *
 * A component of forty files is not something anybody can act on. The loop that closes through the
 * heaviest of them is, and it is what a person would draw on a whiteboard: `checkout → shared →
 * analytics → checkout`.
 */
export const shortestLoop = (
    edges: readonly (readonly number[])[],
    start: number,
    inside: ReadonlySet<number>,
): number[] => {
    const previous = new Map<number, number>();
    const queue: number[] = [start];
    const seen = new Set<number>([start]);

    /** The loop as it reads: from the start round to the node that closes it, and back to the start. */
    const loopThrough = (last: number): number[] => {
        const back: number[] = [];
        for (let step: number | undefined = last; step !== undefined; step = previous.get(step)) {
            back.push(step);
        }
        return [...back.toReversed(), start];
    };

    /** One step of the walk: the loop when this node closes it, `null` while it is still open. */
    const stepFrom = (node: number): number[] | null => {
        const outgoing = edges[node] ?? [];
        for (const next of outgoing) {
            if (next === start) {
                return loopThrough(node);
            }
            if (!inside.has(next) || seen.has(next)) {
                continue;
            }

            seen.add(next);
            previous.set(next, node);
            queue.push(next);
        }
        return null;
    };

    let head = 0;
    while (head < queue.length) {
        const loop = stepFrom(queue[head++] ?? start);
        if (loop) {
            return loop;
        }
    }

    return [start];
};
