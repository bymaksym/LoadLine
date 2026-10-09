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
import { asArray, asMember, asRecord, asText } from '../json/json.utils';
import { type Advisory, type DepsReport, type LockedPackage, type Severity } from './deps.types';
import { declaredFromLock } from './pins';

/** `  /lodash@4.17.21:` in pnpm, `"node_modules/lodash": {` in npm, `lodash@^4.0.0:` in yarn. */
const PNPM_ENTRY = /^ {2}\/?((?:@[^/@]+\/)?[^@/\s]+)@([^(:\s]+)/;
const YARN_ENTRY = /^"?((?:@[^/@]+\/)?[^@/\s]+)@[^:]*:?$/;
const YARN_VERSION = /^\s+version:?\s+"?([^"\s]+)"?/;

const SEVERITIES: ReadonlySet<Severity> = new Set<Severity>(['critical', 'high', 'moderate', 'low', 'info']);

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

/** One line of a JSON-lines file, or `null` for one that is not JSON. */
const safeJson = (line: string): unknown => {
    try {
        return JSON.parse(line);
    } catch {
        return null;
    }
};

/** The `version` of one lock entry, when the entry is an object carrying one. */
const versionOf = (entry: unknown): string | null => asText(asRecord(entry)?.['version']);

const readNpmLock = (lock: Record<string, unknown>): LockedPackage[] => {
    const found = new Map<string, LockedPackage>();

    const installed = Object.entries(asRecord(lock['packages']) ?? {});
    for (const [path, entry] of installed) {
        const name = nameFromPath(path);
        const version = versionOf(entry);
        if (!name || !version) {
            continue;
        }
        const declares = Object.fromEntries(
            Object.entries(asRecord(asRecord(entry)?.['dependencies']) ?? {}).filter(
                (pair): pair is [string, string] => typeof pair[1] === 'string',
            ),
        );
        found.set(`${name}@${version}`, { name, version, requiredBy: [], declares });
    }

    // The older format, for a lock file written before npm 7. Same two fields, one level in.
    const older = Object.entries(asRecord(lock['dependencies']) ?? {});
    for (const [name, entry] of older) {
        const version = versionOf(entry);
        if (version) {
            found.set(`${name}@${version}`, { name, version, requiredBy: [] });
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
const readYamlLock = (text: string, yarn: boolean): LockedPackage[] => {
    const found = new Map<string, LockedPackage>();
    const lines = text.split('\n');
    let pending: string | null = null;
    /** The yarn entry whose `dependencies:` block is being read, if one is. */
    let current: LockedPackage | null = null;
    let inDependencies = false;

    for (const line of lines) {
        // A yarn entry's own dependencies, with the range each one is declared at. pnpm writes a
        // block of the same shape under `snapshots:` with **resolved** versions, which would read
        // as every dependency pinned exactly — so this is only done for yarn.
        if (yarn && current) {
            if (/^ {2}dependencies:\s*$/.test(line)) {
                inDependencies = true;
                continue;
            }
            const dependency = /^ {4}"?((?:@[^\s"/]+\/)?[^\s":]+)"?:?\s+"?([^"\s]+)"?\s*$/.exec(line);
            if (inDependencies && dependency?.[1] && dependency[2]) {
                current.declares = { ...current.declares, [dependency[1]]: dependency[2] };
                continue;
            }
            if (!/^ {4}/.test(line)) {
                inDependencies = false;
            }
        }

        const pnpm = yarn ? null : PNPM_ENTRY.exec(line);
        if (pnpm?.[1] && pnpm[2]) {
            found.set(`${pnpm[1]}@${pnpm[2]}`, { name: pnpm[1], version: pnpm[2], requiredBy: [] });
            pending = null;
            continue;
        }

        // yarn writes the name on one line and the version on the next.
        const version = YARN_VERSION.exec(line);
        if (pending && version?.[1]) {
            current = { name: pending, version: version[1], requiredBy: [] };
            found.set(`${pending}@${version[1]}`, current);
            pending = null;
            continue;
        }

        const entry = YARN_ENTRY.exec(line)?.[1] ?? null;
        if (entry) {
            current = null;
            inDependencies = false;
        }
        pending = entry;
    }

    return [...found.values()];
};

/** Whichever format was dropped. `null` when it is none of them. */
export const readLock = (name: string, text: string): LockedPackage[] | null => {
    if (/package-lock\.json$|npm-shrinkwrap\.json$/i.test(name)) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch {
            return null;
        }
        const lock = asRecord(parsed);
        return lock ? readNpmLock(lock) : null;
    }

    return /lock\.ya?ml$|yarn\.lock$/i.test(name) ? readYamlLock(text, /yarn\.lock$/i.test(name)) : null;
};

/**
 * The audit report, in either shape npm and pnpm write.
 *
 * Nothing here checks a version range against a version: an advisory is attributed to a package by
 * name, and the range is printed so whoever reads it can judge. Matching ranges properly needs a
 * semver implementation, and being approximately right about whether somebody is vulnerable is
 * worse than being explicit about what is and is not known. The one exact comparison made is
 * between installed versions, when the report names them: see `affectsShipped`.
 */
export const readAudit = (text: string): Advisory[] | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        // `yarn audit --json` writes one object per line. The advisories in it are npm 6's, so they
        // are gathered into npm 6's shape and read like one; yarn repeats an advisory once per path
        // it is reached by, and the id keeps one of each.
        const advisories: Record<string, unknown> = {};
        for (const line of text.split('\n')) {
            const entry = asRecord(safeJson(line));
            const advisory =
                entry?.['type'] === 'auditAdvisory' ? asRecord(asRecord(entry['data'])?.['advisory']) : null;
            if (!advisory) {
                continue;
            }
            const id = advisory['id'];
            const key =
                typeof id === 'number' || typeof id === 'string' ? String(id) : `#${Object.keys(advisories).length}`;
            advisories[key] = advisory;
        }
        if (Object.keys(advisories).length === 0 && !text.includes('"auditSummary"')) {
            return null;
        }
        parsed = { advisories };
    }

    // An audit report is an object. `null`, a list and a bare number are all valid JSON, and the
    // shape this used to assert made reading a property off any of them a crash rather than a
    // rejection: `readAudit('null')` type-checked and threw.
    const report = asRecord(parsed);
    if (!report) {
        return null;
    }

    const found: Advisory[] = [];
    const severityOf = (value: unknown): Severity => asMember(asText(value) ?? '', SEVERITIES) ?? 'info';

    /** npm 7+ and pnpm: keyed by package name. */
    const reported = asRecord(report['vulnerabilities']);
    const byPackage = Object.entries(reported ?? {});
    for (const [name, value] of byPackage) {
        const entry = asRecord(value);
        if (!entry) {
            continue;
        }
        const detail = (asArray(entry['via']) ?? []).map(via => asRecord(via)).find(via => via !== null);
        found.push({
            package: name,
            severity: severityOf(entry['severity']),
            title: asText(detail?.['title']) ?? name,
            url: asText(detail?.['url']),
            range: asText(detail?.['range']) ?? asText(entry['range']),
            // npm's `fixAvailable` is either `false` or an object naming a package and a version
            // to move to — which is not the same as "this advisory is fixed in X". Rather than
            // reword it into something it does not say, it is left out.
            fixedIn: null,
        });
    }

    /** npm 6 and the audit endpoint: a list of advisories. */
    const legacy = asRecord(report['advisories']);
    const listed = Object.values(legacy ?? {});
    for (const value of listed) {
        const entry = asRecord(value);
        const module = asText(entry?.['module_name']);
        if (!entry || !module) {
            continue;
        }
        // pnpm writes this shape too, with what npm 6 left out: the range, what fixes it, and the
        // versions actually installed. Read as `null`, the report printed no range at all.
        const versions = (asArray(entry['findings']) ?? [])
            .map(finding => asText(asRecord(finding)?.['version']))
            .filter(version => version !== null);
        found.push({
            package: module,
            severity: severityOf(entry['severity']),
            title: asText(entry['title']) ?? module,
            url: asText(entry['url']),
            range: asText(entry['vulnerable_versions']),
            fixedIn: asText(entry['patched_versions']),
            ...(versions.length > 0 && { versions }),
        });
    }

    // Neither key present means this JSON was not an audit report at all, which is not the same
    // answer as an audit report with nothing in it.
    return found.length > 0 || reported !== null || legacy !== null ? found : null;
};

const RANK: Record<Severity, number> = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };

/**
 * The version of `pkg` a module path names, when pnpm laid it out: `.pnpm/devalue@6.0.2/…`.
 * `null` in every other layout, and when the segment is some other package's.
 */
const PNPM_SEGMENT = /\.pnpm\/((?:@[^/+]+\+)?[^@/]+)@([^/_]+)/;
const shippedVersionOf = (path: string, pkg: string): string | null => {
    const match = PNPM_SEGMENT.exec(path);
    return match?.[1]?.replace('+', '/') === pkg ? (match[2] ?? null) : null;
};

/**
 * Whether the advisory is about the copy that ships. Only answered "no" when both sides name exact
 * versions and they share none: an audit of a Nuxt app reported six advisories against
 * `devalue <=5.9.2` as in the first load, raised them to `high` and failed `--fail-on high`, while
 * the browser carried `devalue@6.0.2` and 5.9.2 was a copy only the server had. Anything less
 * certain than that stays reported, which is the side to be wrong on.
 */
const affectsShipped = (advisory: Advisory, shipped: ReadonlySet<string> | undefined): boolean =>
    !advisory.versions || !shipped || shipped.size === 0 || advisory.versions.some(version => shipped.has(version));

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
    const shippedVersions = new Map<string, Set<string>>();
    for (const module of input.modules) {
        if (!module.pkg) {
            continue;
        }
        const entry = shippedBytes.get(module.pkg) ?? { bytes: 0, inBoot: false };
        entry.bytes += module.bytes;
        entry.inBoot ||= module.places.some(place => input.boot.has(place.chunk));
        shippedBytes.set(module.pkg, entry);
        const version = shippedVersionOf(module.path, module.pkg);
        if (version) {
            shippedVersions.set(module.pkg, (shippedVersions.get(module.pkg) ?? new Set()).add(version));
        }
    }
    const ships = (advisory: Advisory): boolean =>
        shippedBytes.has(advisory.package) && affectsShipped(advisory, shippedVersions.get(advisory.package));

    const byName = new Map<string, LockedPackage[]>();
    const locked = input.lock ?? [];
    const parents = new Map<string, Set<string>>();
    for (const entry of locked) {
        byName.set(entry.name, [...(byName.get(entry.name) ?? []), entry]);
        const declared = Object.keys(entry.declares ?? {});
        for (const dependency of declared) {
            parents.set(dependency, (parents.get(dependency) ?? new Set()).add(entry.name));
        }
    }

    /**
     * The shortest chain from something the project asked for to the package that pulls `name` in,
     * walked up what each lock entry declares. Nothing filled `requiredBy`, so "each one comes with
     * the dependency chain that pulls it" was printed over chains that were always empty. Empty
     * still when the lock does not record what each entry declares (pnpm's does not here) or when
     * nothing the project asked for is up the chain.
     */
    const chainOf = (name: string): string[] => {
        const seen = new Set([name]);
        const queue: string[][] = [[name]];
        for (let path = queue.shift(); path; path = queue.shift()) {
            const above = parents.get(path[0] ?? '') ?? [];
            for (const parent of above) {
                if (seen.has(parent)) {
                    continue;
                }
                const longer = [parent, ...path];
                if (input.direct.has(parent)) {
                    return longer.slice(0, -1);
                }
                seen.add(parent);
                queue.push(longer);
            }
        }
        return byName.get(name)?.[0]?.requiredBy ?? [];
    };

    const advisories = input.advisories ?? [];
    const shipped = advisories
        .filter(advisory => ships(advisory))
        .map(advisory => {
            const where = shippedBytes.get(advisory.package);
            return {
                ...advisory,
                bytes: where?.bytes ?? 0,
                inBoot: where?.inBoot ?? false,
                chain: chainOf(advisory.package),
            };
        })
        .toSorted((a, b) => Number(b.inBoot) - Number(a.inBoot) || RANK[a.severity] - RANK[b.severity]);

    return {
        lockRead: input.lock !== null,
        auditRead: input.advisories !== null,
        shipped,
        notShipped: advisories.filter(advisory => !ships(advisory)),
        transitive: [...shippedBytes]
            .filter(([name]) => input.direct.size > 0 && !input.direct.has(name))
            .map(([name, entry]) => ({
                name,
                bytes: entry.bytes,
                inBoot: entry.inBoot,
                chain: chainOf(name),
            }))
            .toSorted((a, b) => b.bytes - a.bytes),
        multipleVersions: [...byName]
            .filter(([name, entries]) => entries.length > 1 && shippedBytes.has(name))
            .map(([name, entries]) => ({ name, versions: entries.map(entry => entry.version) })),
        declared: declaredFromLock(input.lock),
    };
};
