import { type TreeNode } from './analysis.types';
import { type PathItem, type PathNode } from './path-tree.types';

interface Draft {
    name: string;
    bytes: number;
    files: number;
    isFile: boolean;
    children: Map<string, Draft>;
}

const finish = (draft: Draft, prefix: string): PathNode => {
    let node = draft;
    let name = draft.name;

    // Collapse chains: folder -> only subfolder -> only subfolder...
    while (!node.isFile && node.children.size === 1) {
        const [only] = node.children.values();
        if (!only || only.isFile) {
            break;
        }

        name = name ? `${name}/${only.name}` : only.name;
        node = only;
    }

    const id = prefix ? `${prefix}/${name}` : name;
    const children = [...node.children.values()].map(child => finish(child, id)).toSorted((a, b) => b.bytes - a.bytes);

    return { id, name, bytes: node.bytes, files: node.files, isFile: node.isFile, children };
};

/**
 * Turns a list of paths into a folder tree.
 *
 * - A folder with a single subfolder and no files collapses into it (`src/app/features`), so
 *   three empty levels do not have to be opened before anything shows.
 * - Children go by weight, heaviest first, folders and files mixed: what weighs goes on top.
 */
export const buildPathTree = (items: PathItem[]): PathNode[] => {
    const root: Draft = { name: '', bytes: 0, files: 0, isFile: false, children: new Map() };

    for (const item of items) {
        const parts = item.path.split('/').filter(Boolean);
        let node = root;

        for (const [index, part] of parts.entries()) {
            const isFile = index === parts.length - 1;
            const child = node.children.get(part) ?? { name: part, bytes: 0, files: 0, isFile, children: new Map() };

            node.children.set(part, child);
            child.bytes += item.bytes;
            child.files += 1;
            node = child;
        }
    }

    // The root never collapses: if everything is under `@angular`, that level has to be visible.
    return [...root.children.values()].map(child => finish(child, '')).toSorted((a, b) => b.bytes - a.bytes);
};

/** The files of a chunk of the analysis tree, ready for `buildPathTree`. */
export const filesOfChunk = (chunk: TreeNode | undefined): PathItem[] => {
    if (!chunk) {
        return [];
    }

    return chunk.children.flatMap(group =>
        group.children.length > 0
            ? group.children.map(file => ({ path: file.label, bytes: file.bytes }))
            : [{ path: group.label, bytes: group.bytes }],
    );
};

/** Adds up repeated files (the same file in several chunks) so the tree does not count them twice. */
export const mergePathItems = (items: PathItem[]): PathItem[] => {
    const merged = new Map<string, number>();
    for (const item of items) {
        merged.set(item.path, (merged.get(item.path) ?? 0) + item.bytes);
    }

    return [...merged].map(([path, bytes]) => ({ path, bytes }));
};
