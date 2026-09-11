/**
 * Searching the bundle by name.
 *
 * The rest of the report answers "what is heavy". The question that actually turns up is the other
 * way round — "are we still shipping `moment`?" — and until now it could only be answered by
 * opening chunk after chunk. This turns a name into: which chunks carry it, how much in each one,
 * which screens pay for it and which import brings it in.
 *
 * Files of `node_modules` are grouped by package, because that is the unit a decision is taken
 * about; project files stay one per file, because that is the unit that gets edited.
 */

import { chainSteps, screenLabel } from '../format/format.utils';
import { type Analysis, type ModulePlace, type Zone } from './analysis.types';
import { mergePathItems } from './path-tree';
import { type IndexEntry, type SearchIndex, type SearchResult } from './search.types';

const MIN_QUERY = 2;

/** Where the weight is: the zone of the heaviest chunk it lands in. */
const mainZone = (places: ModulePlace[]): Zone => places.toSorted((a, b) => b.bytes - a.bytes)[0]?.zone ?? 'own';

/** What the bootstrap carries of it, which is the part nobody can avoid downloading. */
const bootBytesOf = (places: ModulePlace[]): number =>
    places.filter(place => place.zone === 'boot').reduce((sum, place) => sum + place.bytes, 0);

/** One row per chunk: a package with forty files in the same chunk is one place, not forty. */
const mergePlaces = (places: ModulePlace[]): ModulePlace[] => {
    const byChunk = new Map<string, ModulePlace>();
    for (const place of places) {
        const existing = byChunk.get(place.chunk);
        if (existing) {
            existing.bytes += place.bytes;
        } else {
            byChunk.set(place.chunk, { ...place });
        }
    }

    return [...byChunk.values()].toSorted((a, b) => b.bytes - a.bytes);
};

/**
 * Prepares the index once per analysis, so typing only filters strings. Everything it needs is
 * already in memory: the module list and the import graph the per-screen figure is computed from.
 */
export const buildSearchIndex = (analysis: Analysis): SearchIndex => {
    const screenLabels = new Map(analysis.screens.map(screen => [screen.source, screen.label]));
    const dupesByName = new Map(analysis.duplicates.map(dupe => [dupe.name, dupe]));

    /** The screens loading a set of chunks, without repeats. */
    const screensOf = (places: ModulePlace[]): { source: string; label: string }[] => {
        const sources = new Set<string>();
        for (const place of places) {
            const loaders = analysis.chunkScreens.get(place.chunk) ?? [];
            for (const source of loaders) {
                sources.add(source);
            }
        }

        return [...sources]
            .map(source => ({ source, label: screenLabels.get(source) ?? screenLabel(source) }))
            .toSorted((a, b) => a.label.localeCompare(b.label));
    };

    interface PackageGroup {
        files: { path: string; label: string; bytes: number }[];
        bytes: number;
        places: ModulePlace[];
    }

    const packages = new Map<string, PackageGroup>();
    const files: IndexEntry[] = [];

    for (const module of analysis.modules) {
        if (module.pkg) {
            const group = packages.get(module.pkg) ?? { files: [], bytes: 0, places: [] };
            group.files.push({ path: module.path, label: module.label, bytes: module.bytes });
            group.bytes += module.bytes;
            group.places.push(...module.places);
            packages.set(module.pkg, group);
            continue;
        }

        const chain = analysis.chainTo(module.path);
        const inBoot = module.places.some(place => place.zone === 'boot');
        const bootBytes = bootBytesOf(module.places);

        files.push({
            kind: 'file',
            key: module.path,
            bytes: module.bytes,
            files: 1,
            zone: mainZone(module.places),
            inBoot,
            bootBytes,
            places: module.places,
            // Only what is wholly in the bootstrap has nothing to say about screens.
            screens: bootBytes === module.bytes ? [] : screensOf(module.places),
            chain: chain ? chainSteps(chain) : null,
            copies: [],
            contents: [],
            matchedFiles: [],
            haystack: module.path.toLowerCase(),
            fileNames: [],
        });
    }

    const packageEntries: IndexEntry[] = [...packages].map(([name, group]) => {
        // The chain of the heaviest file of the package: the one worth looking at first.
        const heaviest = group.files.toSorted((a, b) => b.bytes - a.bytes)[0];
        const chain = heaviest ? analysis.chainTo(heaviest.path) : null;
        const inBoot = group.places.some(place => place.zone === 'boot');
        const bootBytes = bootBytesOf(group.places);

        return {
            kind: 'package' as const,
            key: name,
            bytes: group.bytes,
            files: group.files.length,
            zone: mainZone(group.places),
            inBoot,
            bootBytes,
            places: mergePlaces(group.places),
            screens: bootBytes === group.bytes ? [] : screensOf(group.places),
            chain: chain ? chainSteps(chain) : null,
            copies: dupesByName.get(name)?.copies ?? [],
            contents: mergePathItems(group.files.map(file => ({ path: file.label, bytes: file.bytes }))),
            matchedFiles: [],
            haystack: name.toLowerCase(),
            fileNames: group.files.map(file => file.label.toLowerCase()),
        };
    });

    const entries = [...packageEntries, ...files].toSorted((a, b) => b.bytes - a.bytes);
    return { entries, total: entries.length };
};

/**
 * The results for a query. A package matches by its own name or by the name of any file inside it,
 * so `md5` finds `crypto-js` even though the package is not called that.
 *
 * Every match comes back, and every file inside each match comes with it. There used to be a cap
 * of eighty results and twelve files each, which meant a search for a name that is everywhere
 * answered "80 of 400" and left the reader to guess whether the one they wanted was among the 320.
 * Somebody typing a name into this box is looking for something to fix; the list being long is not
 * the failure, the list being incomplete is.
 */
export const queryIndex = (index: SearchIndex, rawQuery: string): SearchResult[] => {
    const query = rawQuery.trim().toLowerCase();
    if (query.length < MIN_QUERY) {
        return [];
    }

    const results: SearchResult[] = [];
    for (const entry of index.entries) {
        const byName = entry.haystack.includes(query);
        const matchedFiles = byName ? [] : entry.fileNames.filter(name => name.includes(query));
        if (!byName && matchedFiles.length === 0) {
            continue;
        }

        results.push({ ...entry, matchedFiles });
    }

    return results;
};

/** How many names match, without building the results: for the tab counter. */
export const countMatches = (index: SearchIndex, rawQuery: string): number => {
    const query = rawQuery.trim().toLowerCase();
    if (query.length < MIN_QUERY) {
        return 0;
    }

    return index.entries.filter(
        entry => entry.haystack.includes(query) || entry.fileNames.some(name => name.includes(query)),
    ).length;
};
