/**
 * The signals that read `analysis.insights()`: the figures that were inside the metafile all along.
 *
 * They are in their own file for the reason the other groups of signals are — `requests.ts` holds
 * the two counted in round trips, `shipped.ts` what travels without being screen code — so that
 * `findings.ts` stays the list of what the report has always said.
 *
 * Every one of them names everything it found. A list of seven cycles with four of them printed is
 * a list that has to be checked somewhere else, which is the thing this tool exists not to do.
 */

import { type Analysis } from '../analysis/analysis.types';
import { type Cycle } from '../analysis/insights.types';
import { type Criteria } from '../criteria/criteria.types';
import { baseName, formatBytes } from '../format/format.utils';
import { type Lang } from '../i18n/ui-strings';
import { type Finding } from './finding.types';
import { mono } from './finding-html';
import { TEXT } from './finding-text';

const named = (items: readonly string[]): string => items.map(item => mono(item)).join(', ');

/** A cycle as the circle somebody would draw: `checkout › shared › analytics › checkout`. */
const loop = (cycle: Cycle): string => cycle.steps.map(step => mono(step)).join(' › ');

export const buildGraphFindings = (analysis: Analysis, lang: Lang, c: Criteria): Finding[] => {
    const text = TEXT[lang];
    const insights = analysis.insights();
    const findings: Finding[] = [];

    // 1 · The `import()` that defers nothing. The classic silent failure of code splitting, and it
    //     lives on the edges of the graph, which is why no tool looking at chunks shows it.
    const mixed = insights.mixedImports;
    const worstMixed = mixed[0];
    if (worstMixed) {
        const eager = mixed.filter(entry => entry.inBoot).map(entry => entry.path);
        findings.push({
            severity: mixed.some(entry => entry.inBoot) ? 'high' : 'mid',
            target: { tab: 'search', key: worstMixed.label },
            kind: 'mixedImport',
            // Only the ones in the bootstrap have a first-load saving: a mixed import inside a lazy
            // chunk is still a mistake and still costs nothing before the first paint.
            saving: eager.length > 0 ? insights.exclusiveOf(eager) : 0,
            sources: eager,
            ...text.mixedImport({
                count: mixed.length,
                name: worstMixed.label,
                size: formatBytes(mixed.reduce((sum, entry) => sum + entry.bytes, 0)),
                inBoot: mixed.some(entry => entry.inBoot),
                list: mixed
                    .map(
                        entry =>
                            `${mono(entry.label)} (${formatBytes(entry.bytes)}${entry.inBoot ? ', bootstrap' : ''}) — ${named(
                                entry.staticImporters.map(file => baseName(file)),
                            )}`,
                    )
                    .join(' · '),
            }),
        });
    }

    // 2 · A barrel of the project's own. Only the ones whose exclusive weight clears the threshold:
    //     a barrel in front of code that arrives five other ways costs nothing and is not a finding.
    const barrels = insights.ownBarrels.filter(barrel => barrel.inBoot && barrel.exclusive >= c.barrelMinBytes);
    const worstBarrel = barrels[0];
    if (worstBarrel) {
        findings.push({
            severity: 'mid',
            target: { tab: 'boot', key: worstBarrel.path },
            kind: 'ownBarrel',
            saving: insights.exclusiveOf(barrels.map(barrel => barrel.path)),
            sources: barrels.map(barrel => barrel.path),
            ...text.ownBarrel({
                count: barrels.length,
                name: worstBarrel.path,
                pulls: worstBarrel.pulls,
                size: formatBytes(worstBarrel.exclusive),
                importers: named(worstBarrel.importers.map(file => baseName(file))),
                list: barrels
                    .map(
                        barrel =>
                            `${mono(barrel.path)} — ${barrel.reexports} re-exports, ${barrel.pulls} files, ${formatBytes(
                                barrel.exclusive,
                            )}`,
                    )
                    .join(' · '),
            }),
        });
    }

    // 3 · The same shape one level up: a package whose files arrive by the hundred through one door.
    const packages = insights.packageBarrels.filter(pkg => pkg.bytes >= c.bootPackageMinBytes);
    const worstPackage = packages[0];
    if (worstPackage) {
        findings.push({
            severity: worstPackage.inBoot ? 'mid' : 'info',
            target: { tab: worstPackage.inBoot ? 'boot' : 'search', key: worstPackage.name },
            kind: 'packageBarrel',
            ...text.packageBarrel({
                count: packages.length,
                name: worstPackage.name,
                files: worstPackage.files,
                entryPoints: worstPackage.entryPoints,
                size: formatBytes(worstPackage.bytes),
                importers: named(worstPackage.importers.map(file => baseName(file))),
                list: packages
                    .map(
                        pkg =>
                            `${mono(pkg.name)} — ${pkg.files} files in, ${pkg.entryPoints} imported from outside, ${formatBytes(
                                pkg.bytes,
                            )}${pkg.inBoot ? ' (bootstrap)' : ''}`,
                    )
                    .join(' · '),
            }),
        });
    }

    // 4 · Cycles. Architecture, measured rather than argued about, and ending in bytes: a cycle
    //     lengthens import chains and stops a bundler from tree-shaking either half of the loop.
    const cycles = insights.cycles;
    const folders = insights.folderCycles;
    const firstCycle = folders[0] ?? cycles[0];
    if (firstCycle) {
        findings.push({
            severity: cycles.some(cycle => cycle.inBoot) ? 'mid' : 'info',
            kind: 'cycles',
            ...text.cycles({
                files: cycles.length,
                folders: folders.length,
                worst: loop(firstCycle),
                inBoot: cycles.some(cycle => cycle.inBoot),
                folderList: folders.map(cycle => loop(cycle)).join(' · '),
                fileList: cycles.map(cycle => `${loop(cycle)} (${formatBytes(cycle.bytes)})`).join(' · '),
            }),
        });
    }

    // 5 · The same module in two chunks. Different from a package shipped in two versions, which
    //     the report already names: here both copies are the same code, twice.
    const twice = insights.paidTwice.filter(entry => entry.wasted > 0);
    const twiceBytes = insights.paidTwiceBytes;
    if (twice.length > 0 && twiceBytes >= c.paidTwiceMinBytes) {
        findings.push({
            severity: 'mid',
            target: { tab: 'search', key: twice[0]?.label ?? '' },
            kind: 'paidTwice',
            ...text.paidTwice({
                count: twice.length,
                size: formatBytes(twiceBytes),
                list: twice
                    .map(
                        entry =>
                            `${mono(entry.label)} ×${entry.copies} (${formatBytes(entry.wasted)}) — ${named(entry.chunks)}`,
                    )
                    .join(' · '),
            }),
        });
    }

    // 6 · Two screens that are the same screen. Either a shared chunk is missing or one of them is.
    const twins = insights.twins;
    const firstTwin = twins[0];
    if (firstTwin) {
        findings.push({
            severity: 'info',
            target: { tab: 'screens', key: firstTwin.a },
            kind: 'twinScreens',
            ...text.twinScreens({
                count: twins.length,
                a: firstTwin.labelA,
                b: firstTwin.labelB,
                pct: Math.round(firstTwin.overlap * 100),
                apart: formatBytes(firstTwin.apartBytes),
                list: twins
                    .map(
                        twin =>
                            `${mono(twin.labelA)} / ${mono(twin.labelB)} (${Math.round(twin.overlap * 100)} %, ${formatBytes(
                                twin.apartBytes,
                            )})`,
                    )
                    .join(' · '),
            }),
        });
    }

    // 7 · Whose code the first load is. Context, never a fault: a framework is somebody else's code.
    const { ownership } = insights;
    if (ownership.theirsRatio >= c.theirsRatio && ownership.theirs > 0) {
        findings.push({
            severity: 'info',
            target: { tab: 'boot', key: '' },
            kind: 'theirs',
            ...text.theirs({
                pct: Math.round(ownership.theirsRatio * 100),
                theirs: formatBytes(ownership.theirs),
                yours: formatBytes(ownership.yours),
                list: ownership.topPackages.map(pkg => `${mono(pkg.name)} (${formatBytes(pkg.bytes)})`).join(' · '),
            }),
        });
    }

    return findings;
};
