/**
 * A project folder in the bootstrap whose consumers are lazy screens.
 *
 * The report already asks this of npm packages — a library everybody downloads because one lazy
 * screen registers it — and the same thing happens with project code, where no signal covered it.
 *
 * **Why by folder and not by file.** Tried against a real build first: the business layer was in the
 * bootstrap across thirty files of one to three kilobytes each. Every one of them is far below any
 * size worth naming, and together they are a layer that should not be there. A per-file rule finds
 * nothing; the folder is the unit the problem has.
 *
 * The fix is also different from the package one. A package moves by changing where it is
 * registered. A project folder is usually one layer depending on another at build time, and what
 * matters is the list of files keeping it in the bootstrap: moving the first and leaving the other
 * two changes nothing, which is the mistake this signal exists to prevent.
 */

import { type Analysis, type ModuleEntry } from '../analysis/analysis.types';
import { type Criteria } from '../criteria/criteria.types';
import { formatBytes, projectFolderOf } from '../format/format.utils';
import { type Lang } from '../i18n/ui-strings';
import { type Finding } from './finding.types';
import { mono } from './finding-html';
import { TEXT } from './finding-text';

const inBoot = (module: ModuleEntry): boolean => module.places.some(place => place.zone === 'boot');

interface Candidate {
    folder: string;
    bytes: number;
    /** Lazy screens importing something in the folder. */
    lazy: string[];
    /** What holds it in the bootstrap: importers from outside the folder that are not screens. */
    keeping: string[];
}

const candidatesOf = (analysis: Analysis, c: Criteria): Candidate[] => {
    const screens = new Set(analysis.screens.map(screen => screen.source));
    const bytesOf = new Map(
        analysis.bootBuckets.filter(bucket => bucket.isProjectCode).map(bucket => [bucket.name, bucket.bytes]),
    );

    const byFolder = new Map<string, ModuleEntry[]>();
    for (const module of analysis.modules) {
        if (module.pkg || !inBoot(module)) {
            continue;
        }

        const folder = projectFolderOf(module.path);
        byFolder.set(folder, [...(byFolder.get(folder) ?? []), module]);
    }

    return (
        [...byFolder]
            .map(([folder, modules]) => {
                // Files of the folder import each other constantly: that says nothing about who wants it.
                const importers = [
                    ...new Set(modules.flatMap(module => [...(analysis.ownImporters.get(module.path) ?? [])])),
                ].filter(file => projectFolderOf(file) !== folder);

                return {
                    folder,
                    bytes: bytesOf.get(folder) ?? 0,
                    lazy: importers.filter(file => screens.has(file)),
                    keeping: importers.filter(file => !screens.has(file)),
                };
            })
            // The structural condition is per folder; the size floor is not. Tried against a real
            // build: the business layer was there as six folders of one to eight kilobytes each, so a
            // floor applied folder by folder finds nothing and the layer stays invisible.
            .filter(
                entry =>
                    entry.lazy.length > 0 &&
                    entry.keeping.length > 0 &&
                    entry.keeping.length <= c.bootPackageMaxImporters,
            )
            .toSorted((a, b) => b.bytes - a.bytes)
    );
};

export const buildOwnInBootFindings = (analysis: Analysis, lang: Lang, c: Criteria): Finding[] => {
    const text = TEXT[lang];
    const candidates = candidatesOf(analysis, c);
    const bytes = candidates.reduce((sum, entry) => sum + entry.bytes, 0);
    const first = candidates[0];
    // One folder of two kilobytes is not worth naming. The same layer across six of them is. The
    // floor is a criterion of its own rather than a fraction of the package one: a folder of yours
    // in the bootstrap is a coupling problem before it is a weight problem, and whoever wants to
    // move one line should not have to move the other.
    if (!first || bytes < c.ownFolderMinBytes) {
        return [];
    }

    const insights = analysis.insights();
    const files = candidates.flatMap(entry => insights.filesByBucket.get(entry.folder) ?? []);

    return [
        {
            severity: 'mid',
            target: { tab: 'boot', key: first.folder },
            kind: 'ownInBoot',
            saving: insights.exclusiveOf(files),
            sources: files,
            ...text.ownInBoot({
                count: candidates.length,
                name: first.folder,
                size: formatBytes(bytes),
                list: candidates
                    .map(
                        entry =>
                            `${mono(entry.folder)} (${formatBytes(entry.bytes)}) — ${text.ownInBootKept(
                                entry.keeping.map(file => mono(file)).join(', '),
                                entry.lazy.length,
                            )}`,
                    )
                    .join(' · '),
            }),
        },
    ];
};
