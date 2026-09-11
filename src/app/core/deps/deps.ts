/**
 * Reading a lock file and an audit report, and crossing them with what ships.
 *
 * Three lock formats, because a project has whichever one its package manager writes and asking
 * somebody to convert theirs would be worse than reading all three:
 *
 * - `package-lock.json` (npm): a `packages` object keyed by install path, or the older `dependencies`
 *   tree. Both are read.
 * - `pnpm-lock.yaml`: YAML, and read with regular expressions rather than a YAML parser — the same
 *   decision `index-html.ts` makes about the DOM. A parser would be the only runtime dependency of
 *   a tool whose point is that it has none, and what is wanted here is two fields per entry.
 * - `yarn.lock`: its own format, close enough to the pnpm reading to share the walk.
 *
 * Everything a lock file cannot say is left unsaid. There is no version resolution here, no range
 * matching, no guessing: an advisory is attributed to a package by name, and the version is shown
 * so whoever reads it can judge.
 */

import { type ModuleEntry } from '../analysis/analysis.types';
import { type Advisory, type DepsReport, type LockedPackage, type Severity } from './deps.types';

/** `  /lodash@4.17.21:` in pnpm, `"node_modules/lodash": {` in npm, `lodash@^4.0.0:` in yarn. */
const PNPM_ENTRY = /^ {2}\/?((?:@[^/@]+\/)?[^@/\s]+)@([^(:\s]+)/;
const YARN_ENTRY = /^"?((?:@[^/@]+\/)?[^@/\s]+)@[^:]*:?$/;
const YARN_VERSION = /^\s+version:?\s+"?([^"\s]+)"?/;

const SEVERITIES = new Set<string>(['critical', 'high', 'moderate', 'low', 'info']);

interface NpmLock {
    packages?: Record<string, { version?: string }>;
    dependencies?: Record<string, { version?: string; requires?: Record<string, string> }>;
}

/** The package name out of an npm lock key: `node_modules/a/node_modules/b` → `b`. */
const nameFromPath = (path: string): string | null => {
    const marker = path.lastIndexOf('node_modules/');
    if (marker === -1) {
        return null;
    }
    const rest = path.slice(marker + 'node_modules/'.length);
    const parts = rest.split('/');
    return (parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]) ?? null;
};

const readNpmLock = (lock: NpmLock): LockedPackage[] => {
    const found = new Map<string, LockedPackage>();

    const installed = Object.entries(lock.packages ?? {});
    for (const [path, entry] of installed) {
        const name = nameFromPath(path);
        if (name && entry.version) {
            found.set(`${name}@${entry.version}`, { name, version: entry.version, requiredBy: [] });
        }
    }

    // The older format, for a lock file written before npm 7. Same two fields, one level in.
    const older = Object.entries(lock.dependencies ?? {});
    for (const [name, entry] of older) {
        if (entry.version) {
            found.set(`${name}@${entry.version}`, { name, version: entry.version, requiredBy: [] });
        }
    }

    return [...found.values()];
};

/**
 * The pnpm and yarn formats, read line by line.
 *
 * Regular expressions rather than a YAML parser, on purpose and for the same reason `index-html.ts`
 * does not use `DOMParser`: what is wanted is two fields per entry, and a parser would be the only
 * runtime dependency of a tool whose whole point is having none.
 */
const readYamlLock = (text: string): LockedPackage[] => {
    const found = new Map<string, LockedPackage>();
    const lines = text.split('\n');
    let pending: string | null = null;

    for (const line of lines) {
        const pnpm = PNPM_ENTRY.exec(line);
        if (pnpm?.[1] && pnpm[2]) {
            found.set(`${pnpm[1]}@${pnpm[2]}`, { name: pnpm[1], version: pnpm[2], requiredBy: [] });
            pending = null;
            continue;
        }

        // yarn writes the name on one line and the version on the next.
        const version = YARN_VERSION.exec(line);
        if (pending && version?.[1]) {
            found.set(`${pending}@${version[1]}`, { name: pending, version: version[1], requiredBy: [] });
            pending = null;
            continue;
        }

        pending = YARN_ENTRY.exec(line)?.[1] ?? null;
    }

    return [...found.values()];
};

/** Whichever format was dropped. `null` when it is none of them. */
export const readLock = (name: string, text: string): LockedPackage[] | null => {
    if (/package-lock\.json$|npm-shrinkwrap\.json$/i.test(name)) {
        try {
            return readNpmLock(JSON.parse(text) as NpmLock);
        } catch {
            return null;
        }
    }

    return /lock\.ya?ml$|yarn\.lock$/i.test(name) ? readYamlLock(text) : null;
};

interface AuditJson {
    /** npm 7+ and pnpm: keyed by package name. */
    vulnerabilities?: Record<
        string,
        {
            severity?: string;
            via?: (string | { title?: string; url?: string; range?: string })[];
            fixAvailable?: unknown;
        }
    >;
    /** npm 6 and the audit endpoint: a list of advisories. */
    advisories?: Record<string, { module_name?: string; severity?: string; title?: string; url?: string }>;
}

/**
 * The audit report, in either shape npm and pnpm write.
 *
 * Nothing here checks a version range against a version: an advisory is attributed to a package by
 * name, and the range is printed so whoever reads it can judge. Matching ranges properly needs a
 * semver implementation, and being approximately right about whether somebody is vulnerable is
 * worse than being explicit about what is and is not known.
 */
export const readAudit = (text: string): Advisory[] | null => {
    let parsed: AuditJson;
    try {
        parsed = JSON.parse(text) as AuditJson;
    } catch {
        return null;
    }

    const found: Advisory[] = [];
    const severityOf = (value: string | undefined): Severity =>
        SEVERITIES.has(value ?? '') ? (value as Severity) : 'info';

    const reported = Object.entries(parsed.vulnerabilities ?? {});
    for (const [name, entry] of reported) {
        const detail = (entry.via ?? []).find(via => typeof via === 'object');
        found.push({
            package: name,
            severity: severityOf(entry.severity),
            title: detail?.title ?? name,
            url: detail?.url ?? null,
            range: detail?.range ?? null,
            // npm's `fixAvailable` is either `false` or an object naming a package and a version
            // to move to — which is not the same as "this advisory is fixed in X". Rather than
            // reword it into something it does not say, it is left out.
            fixedIn: null,
        });
    }

    const legacy = Object.values(parsed.advisories ?? {});
    for (const entry of legacy) {
        if (entry.module_name) {
            found.push({
                package: entry.module_name,
                severity: severityOf(entry.severity),
                title: entry.title ?? entry.module_name,
                url: entry.url ?? null,
                range: null,
                fixedIn: null,
            });
        }
    }

    return found.length > 0 || parsed.vulnerabilities || parsed.advisories ? found : null;
};

const RANK: Record<Severity, number> = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };

export interface DepsInput {
    lock: LockedPackage[] | null;
    advisories: Advisory[] | null;
    modules: readonly ModuleEntry[];
    boot: ReadonlySet<string>;
    /** Names in the project's own `package.json`, to tell a direct dependency from a transitive one. */
    direct: ReadonlySet<string>;
}

/**
 * The crossing. What every figure here is about is the word **shipped**: an advisory whose package
 * never reaches a browser is real and is not what this report is for.
 */
export const readDeps = (input: DepsInput): DepsReport => {
    const shippedBytes = new Map<string, { bytes: number; inBoot: boolean }>();
    for (const module of input.modules) {
        if (!module.pkg) {
            continue;
        }
        const entry = shippedBytes.get(module.pkg) ?? { bytes: 0, inBoot: false };
        entry.bytes += module.bytes;
        entry.inBoot ||= module.places.some(place => input.boot.has(place.chunk));
        shippedBytes.set(module.pkg, entry);
    }

    const byName = new Map<string, LockedPackage[]>();
    const locked = input.lock ?? [];
    for (const entry of locked) {
        byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry]);
    }

    const advisories = input.advisories ?? [];
    const shipped = advisories
        .filter(advisory => shippedBytes.has(advisory.package))
        .map(advisory => {
            const where = shippedBytes.get(advisory.package);
            return {
                ...advisory,
                bytes: where?.bytes ?? 0,
                inBoot: where?.inBoot ?? false,
                chain: byName.get(advisory.package)?.[0]?.requiredBy ?? [],
            };
        })
        .toSorted((a, b) => Number(b.inBoot) - Number(a.inBoot) || RANK[a.severity] - RANK[b.severity]);

    return {
        lockRead: input.lock !== null,
        auditRead: input.advisories !== null,
        shipped,
        notShipped: advisories.filter(advisory => !shippedBytes.has(advisory.package)),
        transitive: [...shippedBytes]
            .filter(([name]) => input.direct.size > 0 && !input.direct.has(name))
            .map(([name, entry]) => ({
                name,
                bytes: entry.bytes,
                inBoot: entry.inBoot,
                chain: byName.get(name)?.[0]?.requiredBy ?? [],
            }))
            .toSorted((a, b) => b.bytes - a.bytes),
        multipleVersions: [...byName]
            .filter(([name, entries]) => entries.length > 1 && shippedBytes.has(name))
            .map(([name, entries]) => ({ name, versions: entries.map(entry => entry.version) })),
    };
};
