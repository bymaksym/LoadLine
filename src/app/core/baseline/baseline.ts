/**
 * Comparing two builds. A figure alone says nothing: `1.017 kB` is neither good nor bad.
 * `950 → 1.017 in two weeks` is information.
 *
 * A snapshot is the small part of an analysis worth keeping: the bootstrap, which packages are in
 * it, and the cost of every screen. It is what gets exported to keep in the repo as a baseline,
 * and what a previous `stats.json` is reduced to when dropped as the baseline.
 */

import { type Analysis } from '../analysis/analysis.types';
import { unhashedName } from '../caching/caching';
import { MODES } from '../criteria/criteria';
import { type Mode } from '../criteria/criteria.types';
import { type Finding } from '../findings/finding.types';
import { baseName, projectFolderOf } from '../format/format.utils';
import {
    type BootCause,
    type Comparison,
    type Delta,
    type ScreenDelta,
    type Snapshot,
    type SnapshotFinding,
    type SnapshotPart,
    type SnapshotScreen,
} from './baseline.types';

const KNOWN_MODES = new Set<Mode>(MODES);

/** A signal reduced to what a comparison needs: which one it is and what it was about. */
const snapshotFinding = (finding: Finding): SnapshotFinding => ({
    kind: finding.kind,
    key: finding.target?.key ?? '',
    severity: finding.severity,
});

/**
 * What each screen loads beyond the bootstrap, by package and own folder, in raw bytes, keyed by
 * the screen's source. The same breakdown the bootstrap gets, so that a screen that grew can be put
 * down to what grew in it rather than left at "+120 kB".
 *
 * A screen whose chunks weigh something and break down into nothing is left out: that is a build
 * that did not say what is inside its chunks, and recording `[]` would make the next build, which
 * does say, read every package of the screen as new.
 */
const lazyPartsOf = (analysis: Analysis): Map<string, { parts: SnapshotPart[]; raw: number }> => {
    const inChunk = new Map<string, Map<string, SnapshotPart>>();
    for (const file of analysis.modules) {
        const own = file.pkg === null;
        const name = file.pkg ?? projectFolderOf(file.path);
        for (const place of file.places) {
            if (place.zone === 'boot') {
                continue;
            }
            const parts = inChunk.get(place.chunk) ?? new Map<string, SnapshotPart>();
            const part = parts.get(name) ?? { name, bytes: 0, own };
            parts.set(name, { ...part, bytes: part.bytes + place.bytes });
            inChunk.set(place.chunk, parts);
        }
    }
    // The tree is where a chunk's size on disk is kept whatever the report shows.
    const rawOf = new Map(analysis.tree.map(node => [node.id, node.rawBytes ?? 0]));

    const result = new Map<string, { parts: SnapshotPart[]; raw: number }>();
    for (const screen of analysis.screens) {
        const chunks = [...screen.ownChunks, ...screen.sharedChunks];
        const merged = new Map<string, SnapshotPart>();
        const inScreen = chunks.flatMap(chunk => [...(inChunk.get(chunk)?.values() ?? [])]);
        for (const part of inScreen) {
            const known = merged.get(part.name);
            merged.set(part.name, known ? { ...known, bytes: known.bytes + part.bytes } : part);
        }
        const parts = [...merged.values()].toSorted((a, b) => b.bytes - a.bytes);
        const raw = chunks.reduce((sum, chunk) => sum + (rawOf.get(chunk) ?? 0), 0);
        if (parts.length > 0 || raw === 0) {
            result.set(screen.source, { parts, raw });
        }
    }
    return result;
};

const screensOf = (analysis: Analysis): Snapshot['screens'] => {
    const lazy = lazyPartsOf(analysis);
    return analysis.screens.map(screen => {
        const breakdown = lazy.get(screen.source);
        return {
            source: screen.source,
            label: screen.label,
            total: screen.total,
            shared: screen.shared,
            own: screen.own,
            ...(breakdown && { lazyParts: breakdown.parts, lazyRaw: breakdown.raw }),
        };
    });
};

export const snapshotOf = (
    analysis: Analysis,
    mode: Mode,
    name: string,
    date = new Date(),
    findings: readonly Finding[] | null = null,
): Snapshot => ({
    tool: 'loadline',
    version: 1,
    name,
    date: date.toISOString(),
    mode,
    boot: analysis.bootBytes,
    bootPackages: analysis.bootBuckets
        .filter(bucket => !bucket.isProjectCode)
        .map(bucket => ({ name: bucket.name, bytes: bucket.bytes })),
    bootOwn: analysis.bootBuckets
        .filter(bucket => bucket.isProjectCode)
        .map(bucket => ({ name: bucket.name, bytes: bucket.bytes })),
    bootRaw: analysis.bootRawBytes,
    screens: screensOf(analysis),
    // Absent rather than empty when nobody passed any: an export that carries `[]` would claim the
    // build raised no signals, and the comparison would report every signal of the next one as new.
    ...(findings && { findings: findings.map(finding => snapshotFinding(finding)) }),
    // Every chunk with its hashed name, so the next build can work out what an update costs. It
    // comes from the analysis rather than from a parameter because it is not a decision: a snapshot
    // that does not carry the names cannot answer the one question this whole group is about.
    files: analysis.allChunks.map(file => {
        const chunk = analysis.chunkOf(file);
        // `content` is the largest source file inside the chunk, and it is here for the chunks
        // whose whole name is a hash: `ChDGvcpR.js` has no name left once the hash comes off, so
        // without it the next build cannot tell one that changed from one that arrived. Left out
        // rather than written empty when the build said nothing about what is inside its chunks.
        return {
            name: baseName(file),
            bytes: chunk?.bytes ?? 0,
            ...(chunk?.mainContent && { content: chunk.mainContent }),
        };
    }),
});

/** Tells a Loadline export apart from a metafile or anything else dropped by mistake. */
export const isSnapshot = (value: unknown): value is Snapshot => {
    if (!value || typeof value !== 'object') {
        return false;
    }

    const candidate = value as Partial<Snapshot>;
    return (
        (candidate.tool === 'loadline' || candidate.tool === 'tara') &&
        candidate.version === 1 &&
        !!candidate.mode &&
        KNOWN_MODES.has(candidate.mode) &&
        typeof candidate.boot === 'number' &&
        Array.isArray(candidate.screens) &&
        Array.isArray(candidate.bootPackages)
    );
};

const deltaOf = (before: number, after: number): Delta => ({
    before,
    after,
    diff: after - before,
    ratio: before > 0 ? (after - before) / before : 0,
});

/** Signals that only a comparison raises, so they cannot be new or gone against a baseline. */
const COMPARISON_ONLY: ReadonlySet<string> = new Set(['updateWeight']);

/** Below this a package that moved is noise between two builds, not a cause worth naming. */
const CAUSE_MIN_BYTES = 512;

/**
 * Packages and own folders that entered, left, grew or shrank between two breakdowns of the same
 * part of the build — the bootstrap, or what one screen loads beyond it — biggest first.
 */
const causesOf = (baseline: readonly SnapshotPart[], current: readonly SnapshotPart[]): BootCause[] => {
    const then = new Map(baseline.map(part => [part.name, part]));
    const now = new Map(current.map(part => [part.name, part]));

    const causes: BootCause[] = [];
    const names = new Set([...then.keys(), ...now.keys()]);
    for (const name of names) {
        const before = then.get(name)?.bytes ?? 0;
        const after = now.get(name)?.bytes ?? 0;
        const diff = after - before;
        if (Math.abs(diff) < CAUSE_MIN_BYTES) {
            continue;
        }
        const own = (now.get(name) ?? then.get(name))?.own ?? false;
        const change = then.has(name) ? (now.has(name) ? (diff > 0 ? 'grew' : 'shrank') : 'gone') : 'new';
        causes.push({ name, own, before, after, diff, change });
    }
    return causes.toSorted((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
};

/** The bootstrap's breakdown as parts: packages, and the own folders when they are to be compared. */
const bootPartsOf = (snapshot: Snapshot, withOwn: boolean): SnapshotPart[] => [
    ...snapshot.bootPackages.map(pkg => ({ name: pkg.name, bytes: pkg.bytes, own: false })),
    ...(withOwn ? (snapshot.bootOwn ?? []) : []).map(dir => ({ name: dir.name, bytes: dir.bytes, own: true })),
];

/**
 * Whether the snapshot knows what its bootstrap is made of. A folder read without source maps weighs
 * its chunks and cannot see inside them, and writes both lists empty: "nothing" where it means
 * "unknown". A bootstrap with bytes in it always holds something, so empty lists next to a figure
 * above zero can only mean the second. Compared as "nothing", a real build against one such export
 * reported `@angular/core` as a package that had just entered the bootstrap.
 */
const breakdownKnown = (snapshot: Snapshot): boolean =>
    snapshot.boot === 0 || snapshot.bootPackages.length > 0 || (snapshot.bootOwn?.length ?? 0) > 0;

/** Report unit per raw byte: what the part shows over what it weighs on disk. `null` with nothing on disk. */
const ratioOf = (shown: number, raw: number | undefined): number | null => (raw ? shown / raw : null);

/**
 * Which baseline screen each current screen is, by source file first and then — for the ones left —
 * by the name with the hash off and by the label, each only when it names one screen on each side.
 *
 * The source file is the whole answer when the build said what is inside its chunks. A folder read
 * without source maps knows a screen only by its chunk, `assets/Settings-B2c3D4e5.js`, and any edit
 * renames that: every screen of a Vite build came out new and gone at once, and a screen that grew
 * 14 kB passed `--max-growth 5kB` because no screen was ever compared.
 */
const pairScreens = (
    current: readonly SnapshotScreen[],
    baseline: readonly SnapshotScreen[],
): Map<string, SnapshotScreen> => {
    const pairs = new Map<string, SnapshotScreen>();
    const sources = new Map(baseline.map(screen => [screen.source, screen]));
    for (const screen of current) {
        const then = sources.get(screen.source);
        if (then) {
            pairs.set(screen.source, then);
        }
    }

    /** One way of telling two builds' screens are the same screen, after the source file has had its say. */
    type ScreenKey = (screen: SnapshotScreen) => string;
    const keys: ScreenKey[] = [screen => unhashedName(screen.source), screen => screen.label];
    for (const keyOf of keys) {
        const taken = new Set([...pairs.values()].map(screen => screen.source));
        const left = current.filter(screen => !pairs.has(screen.source));
        const leftBefore = baseline.filter(screen => !taken.has(screen.source));
        const count = (screens: readonly SnapshotScreen[]): Map<string, number> => {
            const counts = new Map<string, number>();
            for (const screen of screens) {
                counts.set(keyOf(screen), (counts.get(keyOf(screen)) ?? 0) + 1);
            }
            return counts;
        };
        const now = count(left);
        const then = count(leftBefore);
        const byKey = new Map(leftBefore.map(screen => [keyOf(screen), screen]));
        for (const screen of left) {
            const key = keyOf(screen);
            const match = byKey.get(key);
            if (match && now.get(key) === 1 && then.get(key) === 1) {
                pairs.set(screen.source, match);
            }
        }
    }
    return pairs;
};

/**
 * What changed between the baseline and now. Screens are matched by source file, then by name: a
 * screen renamed in the source shows as one gone and one new, because nothing says they are the same.
 */
export const compare = (current: Snapshot, baseline: Snapshot): Comparison => {
    const paired = pairScreens(current.screens, baseline.screens);
    const matched = new Set([...paired.values()].map(screen => screen.source));

    const screens = new Map<string, ScreenDelta>();
    for (const now of current.screens) {
        const source = now.source;
        const then = paired.get(source);
        if (!then) {
            continue;
        }

        // A screen's lazy part compresses by its own ratio, not the bootstrap's. The current one is
        // the unit being reported; the baseline's stands in for a screen that has nothing lazy left.
        const ratio = ratioOf(now.shared + now.own, now.lazyRaw) ?? ratioOf(then.shared + then.own, then.lazyRaw) ?? 1;
        screens.set(source, {
            source,
            label: now.label,
            total: deltaOf(then.total, now.total),
            lazy: deltaOf(then.shared + then.own, now.shared + now.own),
            // Both sides or nothing: against a baseline without the breakdown, every package of
            // the screen would read as new.
            causes: then.lazyParts && now.lazyParts ? causesOf(then.lazyParts, now.lazyParts) : null,
            causesRatio: ratio,
            causesEstimated: ratio !== 1,
        });
    }

    const beforePackages = new Map(baseline.bootPackages.map(pkg => [pkg.name, pkg]));
    const afterPackages = new Map(current.bootPackages.map(pkg => [pkg.name, pkg]));

    // A signal is the same signal when it is the same kind about the same thing. Severity is left
    // out of the identity on purpose: one that went from mid to high is not a new finding, it is
    // the same one getting worse, and the figures already say so.
    const findingsComparable = !!baseline.findings && !!current.findings;
    const idOf = (finding: SnapshotFinding): string => `${finding.kind}\0${finding.key}`;
    // A signal that only exists when there is something to compare with is new every time: the
    // export it is compared against was written without one. Counted, every comparison reported
    // "1 new: updateWeight", and `--fail-on mid` failed on it.
    const comparable = (finding: SnapshotFinding): boolean => !COMPARISON_ONLY.has(finding.kind);
    const raisedBefore = new Set((baseline.findings ?? []).map(finding => idOf(finding)));
    const raisedNow = new Set((current.findings ?? []).map(finding => idOf(finding)));

    // Own folders only when both sides carry them: against an older baseline every folder of the
    // project would read as new, and the first comparison after an upgrade would blame all of it.
    const withOwn = !!baseline.bootOwn && !!current.bootOwn;
    const raw = current.bootRaw ?? 0;
    // Both sides or nothing, as with the screens: one blind side would make every part new or gone.
    const known = breakdownKnown(baseline) && breakdownKnown(current);

    return {
        mode: current.mode,
        bootCauses: known ? causesOf(bootPartsOf(baseline, withOwn), bootPartsOf(current, withOwn)) : [],
        causesRatio: raw > 0 ? current.boot / raw : 1,
        causesEstimated: raw > 0 && raw !== current.boot,
        causesOwnKnown: withOwn,
        baselineName: baseline.name,
        baselineDate: baseline.date,
        boot: deltaOf(baseline.boot, current.boot),
        screens,
        newScreens: current.screens.filter(screen => !paired.has(screen.source)),
        goneScreens: baseline.screens.filter(screen => !matched.has(screen.source)),
        newBootPackages: known ? current.bootPackages.filter(pkg => !beforePackages.has(pkg.name)) : [],
        goneBootPackages: known ? baseline.bootPackages.filter(pkg => !afterPackages.has(pkg.name)) : [],
        findingsComparable,
        newFindings: findingsComparable
            ? (current.findings ?? []).filter(f => comparable(f) && !raisedBefore.has(idOf(f)))
            : [],
        goneFindings: findingsComparable
            ? (baseline.findings ?? []).filter(f => comparable(f) && !raisedNow.has(idOf(f)))
            : [],
    };
};
