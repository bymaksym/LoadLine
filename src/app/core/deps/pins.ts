/**
 * Whether a duplicated package can be deduplicated at all.
 *
 * "Force the resolution with an override" is the right advice when the two ranges overlap and the
 * wrong one when a dependency **pins** an exact version: `@firebase/app` asks for `idb` at exactly
 * `7.1.1`, and the only way to collapse that copy onto another is to hand Firebase a version it
 * was never released against. When the two copies are a major version apart, that is a breaking
 * change inside somebody else's package, and the report used to suggest it without a word.
 *
 * The ranges come from what the project already has: a `package-lock.json` or a `yarn.lock` write
 * each package's declared dependencies, and the command reads the `package.json` of the parent in
 * `node_modules` when the lock is pnpm's, which records resolved versions only. Nothing is fetched.
 */

import { type DuplicatePackage } from '../analysis/analysis.types';
import { type LockedPackage } from './deps.types';

/** Package name → its declared dependencies, name → range as written. */
export type Declared = ReadonlyMap<string, Readonly<Record<string, string>>>;

/** One copy held in place by a parent that asks for that exact version and nothing else. */
export interface Pin {
    /** The package that pins it. */
    parent: string;
    /** The range as the parent declares it: `7.1.1`, `=7.1.1`. */
    range: string;
    /** The version that range names. */
    version: string;
    /** Another copy of the same package is on a different major: collapsing them is a breaking change. */
    majorApart: boolean;
}

/** `7.1.1`, `=7.1.1`, `v7.1.1`, `npm:7.1.1`: a single version, no range operator anywhere. */
const EXACT = /^(?:npm:)?[=v]?(\d+)\.(\d+)\.(\d+)(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;

const majorOf = (version: string | null): string | null => /^(?:npm:)?[=v]?(\d+)\./.exec(version ?? '')?.[1] ?? null;

/** What the lock file itself says each package declares. npm and yarn write it; pnpm does not. */
export const declaredFromLock = (lock: readonly LockedPackage[] | null): Map<string, Record<string, string>> => {
    const declared = new Map<string, Record<string, string>>();
    const entries = lock ?? [];
    for (const entry of entries) {
        if (entry.declares && Object.keys(entry.declares).length > 0) {
            declared.set(entry.name, { ...declared.get(entry.name), ...entry.declares });
        }
    }
    return declared;
};

/** The pins of each duplicated package, by package name. Empty when nothing is pinned. */
export const pinsOf = (duplicates: readonly DuplicatePackage[], declared: Declared | null): Map<string, Pin[]> => {
    const found = new Map<string, Pin[]>();
    if (!declared || declared.size === 0) {
        return found;
    }

    /** The pin one parent puts on one copy, or `null` when what it declares is a range. */
    const pinOf = (dupe: DuplicatePackage, copy: DuplicatePackage['copies'][number], parent: string): Pin | null => {
        const range = declared.get(parent)?.[dupe.name]?.trim();
        const exact = range ? EXACT.exec(range) : null;
        if (!range || !exact) {
            return null;
        }
        const others = dupe.copies.filter(other => other !== copy).map(other => majorOf(other.version));
        return {
            parent,
            range,
            version: `${exact[1]}.${exact[2]}.${exact[3]}`,
            majorApart: others.some(major => major !== null && major !== exact[1]),
        };
    };

    for (const dupe of duplicates) {
        const pins = dupe.copies
            .flatMap(copy => copy.viaPackages.map(parent => pinOf(dupe, copy, parent)))
            .filter((pin): pin is Pin => pin !== null);
        if (pins.length > 0) {
            found.set(dupe.name, pins);
        }
    }

    return found;
};
