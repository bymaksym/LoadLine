/**
 * Barrel files, the two kinds.
 *
 * **Yours.** An `index.ts` that re-exports a folder. Somebody writes `import { formatMoney } from
 * '@app/shared'` for one function and forty files arrive, because the barrel names all forty and
 * nothing downstream can tell which one was wanted. It is *the* problem of large Angular
 * applications and no analyser names it, because every one of them stops at the package boundary
 * and this lives inside the project.
 *
 * **Theirs.** The same shape one level up: `lodash` ships six hundred files when what was written
 * was `import { debounce } from 'lodash'`. What identifies it is not the file count on its own —
 * a big library is allowed to be big — but the gap between how many of its files ship and how many
 * of them anything outside the package actually imports.
 *
 * Neither figure needs a file the tool does not already read: the metafile names every input, its
 * imports and who imports it.
 */

import { packageOf } from '../format/format.utils';
import { type Barrel, type PackageBarrel } from './insights.types';
import { type Metafile } from './metafile.types';
import { type ModuleGraph, reachIds } from './module-graph';

/**
 * How many bytes of source one re-export line is worth.
 *
 * A barrel cannot be recognised from the metafile by what it says, only by its shape: many imports
 * and hardly any source of its own. `export * from './button';` is about forty characters, and a
 * file averaging under this much source per import is not doing anything else. The bound is
 * deliberately loose — a barrel with a licence header at the top is still a barrel.
 */
const BYTES_PER_REEXPORT = 160;

export interface BarrelInput {
    graph: ModuleGraph;
    inputs: Metafile['inputs'];
    isOwn: (path: string) => boolean;
    /** What a source file weighs across every chunk it lands in. `0` when it ships nothing. */
    shippedBytesOf: (path: string) => number;
    /** Whether a source file ends up in the bootstrap. */
    inBoot: (path: string) => boolean;
    /** What the first load would lose without a file: `exclusiveWeigher(...).of`. */
    exclusiveOf: (files: Iterable<string>) => number;
    /** From how many re-exports a file is worth calling a barrel. */
    minReexports: number;
    label: (path: string) => string;
}

/** Own files whose shape is "a list of re-exports and nothing else". */
export const ownBarrels = (input: BarrelInput): Barrel[] => {
    const { graph, inputs, isOwn, shippedBytesOf, minReexports } = input;

    /** A file whose shape says "a list of re-exports": many imports, almost no source of its own. */
    const isBarrel = (id: number, path: string): boolean => {
        const data = inputs[path];
        if (!data || !isOwn(path)) {
            return false;
        }

        const reexports = graph.statics[id]?.length ?? 0;
        return reexports >= minReexports && data.bytes <= reexports * BYTES_PER_REEXPORT;
    };

    /**
     * What arrives behind the barrel. Static edges only: what it costs is what comes down with
     * whoever imports it, and a lazy boundary inside is exactly the part that does not.
     */
    const describe = (id: number, path: string): Barrel => {
        const behind = reachIds(graph, [id], graph.statics);
        let pulls = 0;
        let bytes = 0;
        for (const [other, otherPath] of graph.nodes.entries()) {
            pulls += behind[other] ?? 0;
            bytes += (behind[other] ?? 0) * shippedBytesOf(otherPath);
        }

        return {
            path,
            label: input.label(path),
            reexports: graph.statics[id]?.length ?? 0,
            pulls,
            bytes,
            exclusive: input.exclusiveOf([path]),
            importers: (graph.importedBy[id] ?? []).map(other => graph.nodes[other] ?? '').filter(Boolean),
            inBoot: input.inBoot(path),
        };
    };

    // The one that drags the most, first: that is the import worth rewriting.
    return graph.nodes
        .map((path, id) => (isBarrel(id, path) ? describe(id, path) : null))
        .filter(barrel => barrel !== null)
        .toSorted((a, b) => b.exclusive - a.exclusive || b.bytes - a.bytes || b.pulls - a.pulls);
};

export interface PackageBarrelInput {
    graph: ModuleGraph;
    shippedBytesOf: (path: string) => number;
    inBoot: (path: string) => boolean;
    /** Package name → own files importing it directly, as the analysis already computes it. */
    importersOf: (pkg: string) => string[];
    /** From how many files a package is worth measuring at all: two files is not a barrel. */
    minFiles: number;
    /** How many times more files than entry points before the gap is worth a line. */
    minRatio: number;
}

/**
 * Packages that ship many more files than anything outside them imports.
 *
 * `entryPoints` is the honest half of the measurement: the metafile records which file of the
 * package something outside it imported, so `lodash/debounce` and `lodash` are told apart without
 * guessing. What it cannot say is how much of what arrived is used — that would need the symbol
 * table — so the report says what came in and what the entry points themselves weigh, and stops
 * there rather than promising a saving it cannot measure.
 */
export const packageBarrels = (input: PackageBarrelInput): PackageBarrel[] => {
    const { graph, shippedBytesOf } = input;

    interface Tally {
        files: Set<string>;
        entries: Set<string>;
        bytes: number;
        entryBytes: number;
        inBoot: boolean;
    }
    const byPackage = new Map<string, Tally>();

    /** One file of one package, added to its package's tally. */
    const count = (id: number, path: string): void => {
        const pkg = packageOf(path);
        const bytes = shippedBytesOf(path);
        if (!pkg || bytes <= 0) {
            return;
        }

        const tally = byPackage.get(pkg) ?? {
            files: new Set<string>(),
            entries: new Set<string>(),
            bytes: 0,
            entryBytes: 0,
            inBoot: false,
        };
        tally.files.add(path);
        tally.bytes += bytes;
        tally.inBoot ||= input.inBoot(path);

        // Imported from outside its own package: that is what "entry point" means here. A file
        // another file of the same package imports is an internal detail, not a way in.
        const fromOutside = (graph.importedBy[id] ?? []).some(other => packageOf(graph.nodes[other] ?? '') !== pkg);
        if (fromOutside) {
            tally.entries.add(path);
            tally.entryBytes += bytes;
        }

        byPackage.set(pkg, tally);
    };

    for (const [id, path] of graph.nodes.entries()) {
        count(id, path);
    }

    return [...byPackage]
        .map(([name, tally]): PackageBarrel => ({
            name,
            files: tally.files.size,
            entryPoints: tally.entries.size,
            bytes: tally.bytes,
            entryBytes: tally.entryBytes,
            inBoot: tally.inBoot,
            importers: input.importersOf(name),
        }))
        .filter(
            pkg => pkg.files >= input.minFiles && pkg.entryPoints > 0 && pkg.files >= pkg.entryPoints * input.minRatio,
        )
        .toSorted((a, b) => Number(b.inBoot) - Number(a.inBoot) || b.bytes - a.bytes);
};
