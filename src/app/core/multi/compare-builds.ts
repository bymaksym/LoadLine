/**
 * Several applications at once: microfrontends, and companies with five portals.
 *
 * The question is "is a shared package worth it", and today it is answered with opinions because
 * nobody has the bytes. This gives the bytes: which packages are in more than one of them, what the
 * second and third copies cost, whose own code is duplicated between them, and the expensive case —
 * the framework itself shipped two or three times, in two or three versions.
 *
 * **There is no second analysis here.** Every build goes through the same `analyze()` the single
 * report uses, and this crosses the results. That was the whole risk the idea named: doing it badly
 * means a second path through the analysis that drifts from the first, and the way not to do that
 * is to have no second path at all — a build is an `Analysis`, however many of them there are.
 */

import { type Analysis, type ModuleEntry } from '../analysis/analysis.types';

/** One application, as it arrives here: already analysed, and named after what it was loaded from. */
export interface Build {
    name: string;
    analysis: Analysis;
}

/** What one build weighs, for the row it gets at the top. */
export interface BuildTotals {
    name: string;
    boot: number;
    screens: number;
    /** Every chunk of the build added up: what the whole thing weighs on disk. */
    total: number;
}

/** A package as it looks across the builds. */
export interface SharedPackage {
    name: string;
    /** Bytes in each build, in the order the builds were given. `0` = not in that one. */
    bytes: number[];
    /** How many of the builds ship it. */
    builds: number;
    /** In how many of them it lands in the bootstrap, which is where a copy costs everybody. */
    inBoot: number;
    /**
     * What the extra copies cost: everything but the largest one.
     *
     * The largest and not the sum, because one copy of a package somebody uses is not waste — it is
     * the dependency. What a shared package would save is the others.
     */
    duplicatedBytes: number;
    /**
     * The versions found, when the installed paths carry them. pnpm writes the version into the
     * path; npm and yarn do not, so this is often empty and the report has to say so rather than
     * quietly report "one version" for something it never read.
     */
    versions: string[];
}

/** A file of somebody's own code that ships in more than one of the applications. */
export interface SharedOwnFile {
    path: string;
    builds: number;
    bytes: number;
    /** Same as above: what the copies past the first one add up to. */
    duplicatedBytes: number;
}

export interface MultiReport {
    totals: BuildTotals[];
    /** Packages in more than one build, by what the extra copies cost. */
    shared: SharedPackage[];
    /** Of those, the ones whose installed paths disagree about the version. */
    diverging: SharedPackage[];
    /** The expensive case: a framework shipped more than once. Idea 39 is this list. */
    frameworks: SharedPackage[];
    /** Own code shipped by more than one of them. */
    ownFiles: SharedOwnFile[];
    /** What every extra copy of everything adds up to: the ceiling on a shared package. */
    duplicatedBytes: number;
    /**
     * Whether any installed path carried a version at all. `false` means the version column is
     * empty because nothing could be read, not because everything agrees — a distinction that
     * decides whether somebody trusts the answer.
     */
    versionsKnown: boolean;
}

/**
 * The package names that make this worth doing.
 *
 * A list, and the same reasoning as the third-party catalogue: there is nothing about the shape of
 * `@angular/core` that says "framework", and the question — is the framework shipped twice — cannot
 * be answered from structure. Kept short, kept updatable in one commit, and consulting nothing.
 */
const FRAMEWORKS = [
    '@angular/',
    'react',
    'react-dom',
    'vue',
    '@vue/',
    'svelte',
    'solid-js',
    'preact',
    'rxjs',
    'zone.js',
    '@ngrx/',
    'redux',
    '@reduxjs/toolkit',
    'next',
    'nuxt',
];

const isFramework = (name: string): boolean =>
    FRAMEWORKS.some(entry => (entry.endsWith('/') ? name.startsWith(entry) : name === entry));

/**
 * The version pnpm writes into the installed path: `.pnpm/lodash@4.17.21/node_modules/lodash/…`.
 * `null` for every other layout, which is most of them.
 */
const versionIn = (path: string): string | null => /\.pnpm\/(?:@[^/]+\+)?[^@/]+@([^/_]+)/.exec(path)?.[1] ?? null;

/** What one build weighs: the bootstrap, the screens, and every chunk of it added up. */
const totalsOf = (build: Build): BuildTotals => {
    const { analysis } = build;
    const total = analysis.allChunks.reduce((sum, file) => sum + (analysis.chunkOf(file)?.bytes ?? 0), 0);
    return { name: build.name, boot: analysis.bootBytes, screens: analysis.screens.length, total };
};

interface Gathered {
    bytes: number[];
    inBoot: boolean[];
    versions: Set<string>;
}

const blank = (builds: number): Gathered => ({
    bytes: Array.from({ length: builds }, () => 0),
    inBoot: Array.from({ length: builds }, () => false),
    versions: new Set<string>(),
});

/** Everything past the largest copy: what a shared package would actually take off the total. */
const extraCopies = (bytes: readonly number[]): number => {
    const shipped = bytes.filter(Boolean);
    return shipped.reduce((sum, value) => sum + value, 0) - Math.max(0, ...shipped);
};

/**
 * The matrix. Two or more builds in, one report out.
 *
 * With fewer than two builds there is nothing to cross and it says so by coming back empty rather
 * than by pretending one application is a comparison with itself.
 */
export const compareBuilds = (builds: readonly Build[]): MultiReport => {
    const totals = builds.map(build => totalsOf(build));
    const empty: MultiReport = {
        totals,
        shared: [],
        diverging: [],
        frameworks: [],
        ownFiles: [],
        duplicatedBytes: 0,
        versionsKnown: false,
    };
    if (builds.length < 2) {
        return empty;
    }

    const packages = new Map<string, Gathered>();
    const ownFiles = new Map<string, number[]>();
    let versionsKnown = false;

    /** One file of one build, filed under its package or under its own path. */
    const gather = (module: ModuleEntry, index: number, boot: ReadonlySet<string>): void => {
        if (module.pkg) {
            const entry = packages.get(module.pkg) ?? blank(builds.length);
            entry.bytes[index] = (entry.bytes[index] ?? 0) + module.bytes;
            entry.inBoot[index] ||= module.places.some(place => boot.has(place.chunk));

            const version = versionIn(module.path);
            if (version) {
                versionsKnown = true;
                entry.versions.add(version);
            }

            packages.set(module.pkg, entry);
            return;
        }

        // Own code. The path is the identity: the same file in two applications is the same file,
        // and that is exactly the finding — it is being maintained twice and shipped twice. A file
        // only one of them has is not interesting here.
        const seen = ownFiles.get(module.path) ?? Array.from({ length: builds.length }, () => 0);
        seen[index] = (seen[index] ?? 0) + module.bytes;
        ownFiles.set(module.path, seen);
    };

    for (const [index, build] of builds.entries()) {
        const boot = new Set(build.analysis.bootChunks);
        for (const module of build.analysis.modules) {
            gather(module, index, boot);
        }
    }

    const shared: SharedPackage[] = [...packages]
        .map(([name, entry]) => ({
            name,
            bytes: entry.bytes,
            builds: entry.bytes.filter(Boolean).length,
            inBoot: entry.inBoot.filter(Boolean).length,
            duplicatedBytes: extraCopies(entry.bytes),
            versions: [...entry.versions].toSorted((a, b) => a.localeCompare(b)),
        }))
        .filter(entry => entry.builds > 1)
        .toSorted((a, b) => b.duplicatedBytes - a.duplicatedBytes);

    const own: SharedOwnFile[] = [...ownFiles]
        .map(([path, bytes]) => ({
            path,
            builds: bytes.filter(Boolean).length,
            bytes: Math.max(...bytes),
            duplicatedBytes: extraCopies(bytes),
        }))
        .filter(entry => entry.builds > 1)
        .toSorted((a, b) => b.duplicatedBytes - a.duplicatedBytes);

    return {
        totals,
        shared,
        // More than one version among the paths that carried one. A single version is agreement;
        // none read is not agreement, and that is what `versionsKnown` is for.
        diverging: shared.filter(entry => entry.versions.length > 1),
        frameworks: shared.filter(entry => isFramework(entry.name)),
        ownFiles: own,
        duplicatedBytes:
            shared.reduce((sum, entry) => sum + entry.duplicatedBytes, 0) +
            own.reduce((sum, entry) => sum + entry.duplicatedBytes, 0),
        versionsKnown,
    };
};
