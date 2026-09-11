/**
 * Who imports what, read from the source graph.
 *
 * Two maps come out of the same walk, and both answer the same kind of question — "who actually
 * imports this?" — for the two things a report points at: an npm package and a project file.
 * Without the second one, the signals could examine a library in the bootstrap and say nothing at
 * all about a project folder right next to it.
 */

import { packageOf } from '../format/format.utils';
import { type Metafile } from './metafile.types';

export interface ImportGraph {
    /** Package name → own files importing it directly. */
    packages: Map<string, Set<string>>;
    /** Own file → own files importing it directly. */
    ownFiles: Map<string, Set<string>>;
}

export const importGraphOf = (inputs: Metafile['inputs'], isOwn: (path: string) => boolean): ImportGraph => {
    const packages = new Map<string, Set<string>>();
    const ownFiles = new Map<string, Set<string>>();
    const add = (map: Map<string, Set<string>>, key: string, importer: string): void => {
        const importers = map.get(key) ?? new Set<string>();
        importers.add(importer);
        map.set(key, importers);
    };

    for (const [input, data] of Object.entries(inputs)) {
        if (!isOwn(input)) {
            continue;
        }

        const imports = data.imports ?? [];
        for (const imp of imports) {
            const pkg = packageOf(imp.path);
            if (pkg) {
                add(packages, pkg, input);
            } else if (isOwn(imp.path)) {
                add(ownFiles, imp.path, input);
            }
        }
    }

    return { packages, ownFiles };
};
