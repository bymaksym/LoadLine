/** The shapes of the folder tree built from a chunk's files. */

/** A file with its weight, as it comes out of a chunk. */
export interface PathItem {
    path: string;
    bytes: number;
}

/** Node of the folder tree: a folder (or chain of folders) or a file. */
export interface PathNode {
    id: string;
    /** What gets painted: `users.page.ts`, or `src/app/features` when it is a collapsed chain. */
    name: string;
    bytes: number;
    /** Files under this node. 1 for files. */
    files: number;
    isFile: boolean;
    children: PathNode[];
}
