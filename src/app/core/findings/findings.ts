import { type Analysis } from '../analysis/analysis.types';
import { type Comparison } from '../baseline/baseline.types';
import { RECOMMENDED } from '../criteria/criteria';
import { type Criteria, type Mode } from '../criteria/criteria.types';
import { baseName, chainSteps, formatBytes, formatDelta, packageOf, projectFolderOf } from '../format/format.utils';
import { type Lang } from '../i18n/ui-strings';
import { type MeasuredReport } from '../measurement/measurement.types';
import { configurationBudgets, isZoneless, pipelineKnown } from '../project/project-context';
import { type ProjectContext } from '../project/project-context.types';
import { EMPTY_SITUATION } from '../situation/situation';
import { type Situation } from '../situation/situation.types';
import { buildCascadeShapeFindings } from './caching';
import { type Finding } from './finding.types';
import { chainHtml, mono } from './finding-html';
import { TEXT } from './finding-text';
import { buildGraphFindings } from './graph';
import { buildOwnInBootFindings } from './own-in-boot';
import { buildRequestFindings } from './requests';
import { buildShippedFindings } from './shipped';

const unitText = (lang: Lang, mode: Mode): string => {
    if (lang === 'es') {
        return mode === 'raw' ? 'en crudo' : mode === 'brotli' ? 'comprimidas en brotli' : 'comprimidas en gzip';
    }
    return mode === 'raw' ? 'raw' : mode === 'brotli' ? 'brotli-compressed' : 'gzip-compressed';
};

/**
 * @param c  the thresholds of every signal: the recommended ones (`RECOMMENDED`) or the ones the
 *           person has set. They are defined in `criteria.ts`, in one place, so they can be discussed
 *           and edited.
 */
export const buildFindings = (
    analysis: Analysis,
    lang: Lang,
    mode: Mode,
    c: Criteria = RECOMMENDED[mode],
    /**
     * What the team answered about the world this build ships into. It reaches exactly one signal
     * from here — the shape of the hash cascade, whose severity is not a property of the build —
     * and it defaults to nobody having answered, which is what every caller did before it existed.
     */
    situation: Situation = EMPTY_SITUATION,
): Finding[] => {
    const text = TEXT[lang];
    const findings: Finding[] = [];
    const totalScreens = analysis.screens.length;
    // The exclusive weight of every bucket, so the signals that name one can say what removing it
    // is actually worth rather than what it weighs. The two differ whenever anything is shared.
    const insights = analysis.insights();
    const filesOf = (bucket: string): string[] => insights.filesByBucket.get(bucket) ?? [];

    // 1 · A "lazy" chunk that almost everybody actually pays for.
    const worst = analysis.sharedChunks
        .filter(chunk => totalScreens > 0 && chunk.screens >= totalScreens * c.sharedRatio)
        .toSorted((a, b) => b.bytes - a.bytes)[0];

    if (worst && worst.bytes > c.sharedMinBytes) {
        findings.push({
            severity: 'high',
            target: { tab: 'shared', key: worst.file },
            kind: 'shared',
            ...text.shared({
                size: formatBytes(worst.bytes),
                screens: worst.screens,
                total: totalScreens,
                chunk: worst.name,
                top: worst.mainContent,
            }),
        });
    }

    // 2 · Bootstrap package whose real consumer is in a lazy screen.
    //     Few importers is NOT enough: the visual theme is also imported by a single file and it
    //     IS needed before painting. What identifies the candidate is where its consumer is.
    const lazySources = new Set(analysis.screens.map(screen => screen.source));
    const candidates = analysis.bootBuckets.filter(
        bucket => !bucket.isProjectCode && bucket.bytes >= c.bootPackageMinBytes,
    );

    for (const bucket of candidates) {
        const importers = analysis.packageImporters.get(bucket.name);
        if (!importers || importers.size > c.bootPackageMaxImporters) {
            continue;
        }

        const inLazyScreens = [...importers].filter(file => lazySources.has(file));
        if (inLazyScreens.length === 0) {
            continue;
        }

        // The chain says which import puts it in the bootstrap; its last own file is the one to edit.
        const chain = analysis.bootChains.get(bucket.name) ?? null;
        const entry = chain?.toReversed().find(file => !packageOf(file)) ?? null;
        // The routes files lazy-loading those screens: where the providers go.
        const routes = [...new Set(inLazyScreens.flatMap(file => analysis.screenLoaders.get(file) ?? []))];

        findings.push({
            severity: 'high',
            target: { tab: 'boot', key: bucket.name },
            kind: 'bootLazy',
            saving: insights.exclusive.get(bucket.name) ?? 0,
            sources: filesOf(bucket.name),
            ...text.bootLazy({
                pkg: bucket.name,
                size: formatBytes(bucket.bytes),
                files: importers.size,
                screens: inLazyScreens.map(file => mono(baseName(file))).join(', '),
                chain: chain ? chainHtml(chainSteps(chain)) : null,
                entry,
                routes: routes.length > 0 ? routes.map(file => mono(file)).join(', ') : null,
            }),
        });
    }

    // 3 · Own files too large inside the bootstrap: one signal listing all of them, no cut-off.
    const bigFiles = analysis.ownFilesInBoot.filter(file => file.bytes > c.bigOwnFileBytes);
    const first = bigFiles[0];
    if (first) {
        findings.push({
            severity: 'mid',
            target: { tab: 'boot', key: projectFolderOf(first.path) },
            kind: 'bigFile',
            saving: insights.exclusiveOf(bigFiles.map(file => file.path)),
            sources: bigFiles.map(file => file.path),
            ...text.bigFile({
                count: bigFiles.length,
                each: formatBytes(c.bigOwnFileBytes),
                name: baseName(first.path),
                size: formatBytes(bigFiles.reduce((sum, file) => sum + file.bytes, 0)),
                list: bigFiles.map(file => `${mono(file.path)} (${formatBytes(file.bytes)})`).join(' · '),
            }),
        });
    }

    // 4 · Two versions of the same package, each copy followed to whatever brings it in. Knowing
    // there are two says nothing about what to do: the fix depends on where each one comes from.
    const firstDupe = analysis.duplicates[0];
    if (firstDupe) {
        const list = analysis.duplicates
            .map(dupe => {
                const copies = dupe.copies
                    .map(copy =>
                        text.dupeCopy({
                            version: copy.version,
                            under: copy.under,
                            size: formatBytes(copy.bytes),
                            zone: text.dupeZone[copy.zone],
                            chain: copy.chain ? chainHtml(chainSteps(copy.chain)) : null,
                            own: copy.importers.length > 0 ? copy.importers.map(file => mono(file)).join(', ') : null,
                            via: copy.viaPackages.length > 0 ? copy.viaPackages.map(pkg => mono(pkg)).join(', ') : null,
                        }),
                    )
                    .join(' ');
                return `<strong>${dupe.name}</strong> — ${copies}`;
            })
            .join(' ');

        findings.push({
            severity: 'mid',
            target: { tab: 'search', key: firstDupe.name },
            kind: 'dupes',
            ...text.dupes({
                count: analysis.duplicates.length,
                list,
                viaDependency: analysis.duplicates.some(dupe => dupe.copies.some(copy => copy.importers.length === 0)),
                inBoot: analysis.duplicates.some(dupe => dupe.inBoot),
            }),
        });
    }

    // 5 · A screen much more expensive than the rest.
    if (analysis.screens.length >= c.heavyScreenMinScreens) {
        const owns = analysis.screens.map(screen => screen.own).toSorted((a, b) => a - b);
        const median = owns[Math.floor(owns.length / 2)] ?? 0;
        const heavy = analysis.screens.filter(
            screen => median > 0 && screen.own > median * c.heavyScreenFactor && screen.own > c.heavyScreenMinBytes,
        );

        // One finding, not one per screen: on a real application — immich, 166 screens — a loop
        // meant fifty-eight identical-looking cards in a row, which buries every other signal
        // there is. One card, and **all** of them named inside it: grouping is what makes the list
        // readable, and dropping rows is not the same thing. The worst one leads.
        const byOwn = heavy.toSorted((a, b) => b.own - a.own);
        const worstScreen = byOwn[0];
        if (worstScreen) {
            findings.push({
                severity: 'mid',
                target: { tab: 'screens', key: worstScreen.source },
                kind: 'heavy',
                ...text.heavy({
                    count: byOwn.length,
                    label: worstScreen.label,
                    own: formatBytes(worstScreen.own),
                    median: formatBytes(median),
                    list: byOwn
                        .slice(1)
                        .map(screen => `${mono(screen.label)} (${formatBytes(screen.own)})`)
                        .join(', '),
                }),
            });
        }
    }

    // 6 · What the report cannot reach, which is the one signal about the report itself.
    const unreachable = analysis.unreachable;
    if (unreachable.length > 0) {
        const unreachableBytes = unreachable.reduce((sum, chunk) => sum + chunk.bytes, 0);
        // `allChunks` is every chunk of the build, these among them, so the share is over that.
        const allBytes = analysis.allChunks.reduce((sum, file) => sum + (analysis.chunkOf(file)?.bytes ?? 0), 0);
        // Two service workers are a footnote; most of the build is not. The share is what decides,
        // because "12 chunks described out of 244" is a different statement from "you also ship a
        // service worker", and printing both the same way would bury the first.
        const most = allBytes > 0 && unreachableBytes > allBytes * c.sharedRatio;

        findings.push({
            severity: most ? 'mid' : 'info',
            kind: 'unreachable',
            ...text.unreachable({
                count: unreachable.length,
                total: analysis.allChunks.length,
                size: formatBytes(unreachableBytes),
                most,
                // All of them, heaviest first. This signal exists because a report described 12
                // chunks of 244 without saying so; naming four of the 232 would be the same
                // mistake one level down.
                list: unreachable
                    .toSorted((a, b) => b.bytes - a.bytes)
                    .map(chunk => mono(baseName(chunk.file)))
                    .join(', '),
            }),
        });
    }

    // 5a · Project code in the bootstrap whose consumer is a lazy screen: the same question
    //      signal 2 asks of npm packages, asked of project files. In `own-in-boot.ts`.
    //
    // 5b · What ships without being code for a screen: every language of a library, data embedded
    //      as code. Before the "clean" card on purpose — a bootstrap carrying 130 locales is not a
    //      clean breakdown. The rules are in `shipped.ts`.
    //
    // 5c · The one signal in requests instead of bytes: what a screen downloads in how many pieces.
    //
    // 5d · The eight figures that were inside the metafile and were not being read: exclusive
    //      weight, barrels, cycles, the `import()` that defers nothing, bytes paid twice, twin
    //      screens, whose code the first load is. In `graph.ts`. Its problems go here with the
    //      rest; its context — cycles nobody pays for, whose code this is — goes after "clean",
    //      because none of those makes a breakdown dirty.
    const graph = buildGraphFindings(analysis, lang, c);
    const isNote = (finding: Finding): boolean => finding.severity === 'info' || finding.severity === 'ok';

    findings.push(
        ...buildOwnInBootFindings(analysis, lang, c),
        ...buildShippedFindings(analysis, lang, c),
        ...buildRequestFindings(analysis, lang, c),
        ...buildCascadeShapeFindings(analysis, lang, situation),
        ...graph.filter(finding => !isNote(finding)),
    );

    if (findings.length === 0) {
        findings.push({ severity: 'ok', kind: 'clean', ...text.clean({ unit: unitText(lang, mode) }) });
    }

    // 6 · CommonJS packages, read from esbuild's `format` per file. A problem when everyone pays
    //     for them (bootstrap); context when only some screens do. After "clean" on purpose: a
    //     CommonJS library in one lazy screen does not make the breakdown dirty.
    const cjs = analysis.commonJs;
    if (cjs.length > 0) {
        const inBoot = cjs.find(pkg => pkg.zone === 'boot');
        findings.push({
            severity: inBoot ? 'mid' : 'info',
            target: inBoot ? { tab: 'boot', key: inBoot.name } : undefined,
            kind: 'commonJs',
            ...text.commonJs({
                count: cjs.length,
                size: formatBytes(cjs.reduce((sum, pkg) => sum + pkg.bytes, 0)),
                items: cjs.map(pkg => ({
                    name: pkg.name,
                    size: formatBytes(pkg.bytes),
                    zone: pkg.zone,
                    screens: pkg.screens,
                    importers: pkg.importers,
                    via: pkg.viaPackages,
                })),
            }),
        });
    }

    findings.push(...graph.filter(finding => isNote(finding)));

    return findings;
};

const pctOf = (ratio: number): number => Math.round(ratio * 100);

/**
 * Rows that share a value, in the order the first of each group appeared. Used where several
 * configurations produce the very same sentence: one card that names them all, not one each.
 */
const groupBy = <T, K>(rows: T[], keyOf: (row: T) => K): Map<K, T[]> => {
    const groups = new Map<K, T[]>();
    for (const row of rows) {
        const key = keyOf(row);
        groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    return groups;
};

const signed = formatDelta;

/**
 * What changed against the baseline. The bootstrap is compared on its own and the screens on
 * what they add beyond it: otherwise a bigger bootstrap would flag every screen at once.
 */
export const buildComparisonFindings = (comparison: Comparison, lang: Lang, c: Criteria): Finding[] => {
    const text = TEXT[lang];
    const findings: Finding[] = [];
    const grew = (diff: number, ratio: number) => diff >= c.growthMinBytes && ratio >= c.growthRatio;

    if (grew(comparison.boot.diff, comparison.boot.ratio)) {
        findings.push({
            severity: 'high',
            target: { tab: 'boot', key: '' },
            kind: 'bootGrew',
            ...text.bootGrew({
                diff: signed(comparison.boot.diff),
                pct: pctOf(comparison.boot.ratio),
                before: formatBytes(comparison.boot.before),
                after: formatBytes(comparison.boot.after),
                baseline: comparison.baselineName,
            }),
        });
    }

    const first = comparison.newBootPackages[0];
    if (first) {
        findings.push({
            severity: 'high',
            target: { tab: 'boot', key: first.name },
            kind: 'bootNewPackages',
            ...text.bootNewPackages({
                count: comparison.newBootPackages.length,
                list: comparison.newBootPackages
                    .map(pkg => `${mono(pkg.name)} (${formatBytes(pkg.bytes)})`)
                    .join(' · '),
                baseline: comparison.baselineName,
            }),
        });
    }

    // What the person actually wants to see on a merge request: not the delta of bytes, but which
    // signals went away and which came in. It is the only thing that makes fixing something visible.
    if (comparison.findingsComparable && (comparison.newFindings.length > 0 || comparison.goneFindings.length > 0)) {
        const chips = (list: readonly { kind: string }[]) => list.map(item => mono(item.kind)).join(', ');
        findings.push({
            severity: comparison.newFindings.length > 0 ? 'mid' : 'ok',
            kind: 'signalsChanged',
            ...text.signalsChanged({
                fixed: comparison.goneFindings.length,
                added: comparison.newFindings.length,
                fixedList: chips(comparison.goneFindings),
                addedList: chips(comparison.newFindings),
                baseline: comparison.baselineName,
            }),
        });
    }

    const grown = [...comparison.screens.values()]
        .filter(screen => grew(screen.lazy.diff, screen.lazy.ratio))
        .toSorted((a, b) => b.lazy.diff - a.lazy.diff);

    // Most screens up by the same amount: a chunk they all load grew, not the screens. Saying
    // "19 screens grew" would send the person to 19 places when the cause is in one.
    const total = comparison.screens.size;
    const diffs = grown.map(screen => screen.lazy.diff).toSorted((a, b) => a - b);
    const median = diffs[Math.floor(diffs.length / 2)] ?? 0;
    const alike = grown.filter(screen => Math.abs(screen.lazy.diff - median) <= median * c.sharedGrowthTolerance);
    const sharedGrowth = alike.length >= c.sharedGrowthMinScreens && alike.length >= total * c.sharedRatio;
    if (sharedGrowth) {
        findings.push({
            severity: 'mid',
            target: { tab: 'shared', key: '' },
            kind: 'sharedGrew',
            ...text.sharedGrew({ count: alike.length, total, diff: signed(median) }),
        });
    }

    const individual = sharedGrowth ? grown.filter(screen => !alike.includes(screen)) : grown;
    const top = individual[0];
    if (top) {
        findings.push({
            severity: 'mid',
            target: { tab: 'screens', key: top.source },
            kind: 'screensGrew',
            ...text.screensGrew({
                count: individual.length,
                top: top.label,
                diff: signed(top.lazy.diff),
                pct: pctOf(top.lazy.ratio),
                list: individual
                    .map(screen => `${mono(screen.label)} ${signed(screen.lazy.diff)} (${pctOf(screen.lazy.ratio)} %)`)
                    .join(' · '),
            }),
        });
    }

    return findings;
};

/**
 * What `angular.json`, `package.json` and the pipeline say. The budget signals compare against
 * the raw bootstrap, because that is what Angular's budgets measure, whatever the report shows.
 */
export const buildContextFindings = (
    context: ProjectContext,
    analysis: Analysis,
    lang: Lang,
    c: Criteria,
): Finding[] => {
    const text = TEXT[lang];
    const findings: Finding[] = [];
    const rows = configurationBudgets(context);
    const known = pipelineKnown(context);
    const names = (list: { name: string }[]) => list.map(row => mono(row.name)).join(', ');
    // A title is read as text everywhere — the page interpolates it, the terminal prints it — so
    // the two signals that name their configurations in the title get the names without markup.
    // With `names()` they came out as `The <span class="mono">production</span> budget is…`, in the
    // browser as well as in a CI log.
    const plainNames = (list: { name: string }[]) => list.map(row => row.name).join(', ');

    if (rows.length > 0) {
        const withBudget = rows.filter(row => row.hasBudget);
        const built = rows.filter(row => row.builtBy.length > 0);

        // The budget that would fire first: the lowest error, or the lowest warning without one.
        const bound = (row: (typeof rows)[number]) => row.error ?? row.warning ?? Infinity;
        const strictest = withBudget.toSorted((a, b) => bound(a) - bound(b))[0];

        if (withBudget.length === 0) {
            findings.push({
                severity: 'mid',
                target: { tab: 'project', key: '' },
                kind: 'budgetNone',
                ...text.budgetNone({ configs: names(rows) }),
            });
        } else if (known && built.length > 0 && strictest && strictest.builtBy.length === 0) {
            findings.push({
                severity: 'high',
                target: { tab: 'project', key: strictest.name },
                kind: 'budgetNotBuilt',
                ...text.budgetNotBuilt({
                    config: strictest.name,
                    figure: formatBytes(bound(strictest)),
                    built: built.map(row => ({
                        name: row.name,
                        error: row.error === null ? null : formatBytes(row.error),
                        warning: row.warning === null ? null : formatBytes(row.warning),
                    })),
                }),
            });
        }

        // Where the budget does apply, is it a budget at all? Without a pipeline, every one is examined.
        //
        // Grouped by the figure, not listed one configuration at a time: two configurations with the
        // same budget produced two cards that were the same sentence word for word, differing only
        // in a name. One card that names both says the same thing and is read once.
        const examined = known ? built.filter(row => row.hasBudget) : withBudget;

        const warnOnly = groupBy(
            examined.filter(row => row.error === null && row.warning !== null),
            row => row.warning ?? 0,
        );
        for (const [warning, group] of warnOnly) {
            findings.push({
                severity: 'mid',
                target: { tab: 'project', key: group[0]?.name ?? '' },
                kind: 'budgetWarnOnly',
                ...text.budgetWarnOnly({
                    configs: plainNames(group),
                    count: group.length,
                    warning: formatBytes(warning),
                }),
            });
        }

        const tooHigh = examined.filter(
            row =>
                row.error !== null &&
                analysis.bootRawBytes > 0 &&
                row.error >= analysis.bootRawBytes * c.budgetSlackFactor,
        );
        const byError = groupBy(tooHigh, row => row.error ?? 0);
        for (const [error, group] of byError) {
            findings.push({
                severity: 'mid',
                target: { tab: 'project', key: group[0]?.name ?? '' },
                kind: 'budgetTooHigh',
                ...text.budgetTooHigh({
                    configs: plainNames(group),
                    count: group.length,
                    error: formatBytes(error),
                    boot: formatBytes(analysis.bootRawBytes),
                    factor: c.budgetSlackFactor,
                }),
            });
        }
    }

    if (isZoneless(context) === true) {
        findings.push({ severity: 'info', target: { tab: 'project', key: '' }, kind: 'zoneless', ...text.zoneless() });
    }

    return findings;
};

/**
 * What the browser measured, against what was computed. The set of chunks is what gets compared,
 * not the byte count: a chunk that came down without being predicted is a fact regardless of the
 * unit either side is expressed in.
 */
export const buildMeasurementFindings = (report: MeasuredReport, lang: Lang, c: Criteria): Finding[] => {
    const text = TEXT[lang];
    const findings: Finding[] = [];
    const label = report.screen?.label ?? text.rootScreen;
    // Every chunk, not the first six. This is the tab where a browser measurement is being
    // reconciled against the calculation, so the chunk that explains the gap is as likely to be
    // the ninth as the first.
    const chunkList = (chunks: { name: string; bytes: number }[]): string =>
        chunks.map(chunk => `${mono(chunk.name)} (${formatBytes(chunk.bytes)})`).join(' · ');

    const extraBytes = report.extra.reduce((sum, chunk) => sum + chunk.bytes, 0);
    const missingBytes = report.missing.reduce((sum, chunk) => sum + chunk.bytes, 0);

    // The router-before-guard case first: it is the only one of these with a fix attached.
    if (report.eager.length > 0) {
        const bytes = report.eager.reduce((sum, screen) => sum + screen.bytes, 0);
        findings.push({
            severity: bytes >= c.growthMinBytes ? 'high' : 'mid',
            target: { tab: 'measured', key: '' },
            kind: 'measuredEager',
            ...text.measuredEager({
                screen: label,
                size: formatBytes(bytes),
                list: report.eager.map(screen => mono(screen.label)).join(', '),
            }),
        });
    }

    if (report.extra.length > 0 && extraBytes >= c.growthMinBytes) {
        findings.push({
            severity: report.eager.length > 0 ? 'mid' : 'high',
            target: { tab: 'measured', key: '' },
            kind: 'measuredExtra',
            ...text.measuredExtra({
                screen: label,
                diff: formatBytes(extraBytes),
                computed: formatBytes(report.computed),
                measured: formatBytes(report.measured),
                computedFiles: report.computedFiles,
                measuredFiles: report.measuredFiles,
                count: report.extra.length,
                list: chunkList(report.extra),
            }),
        });
    }

    if (report.missing.length > 0 && missingBytes >= c.growthMinBytes) {
        findings.push({
            severity: 'info',
            target: { tab: 'measured', key: '' },
            kind: 'measuredShort',
            ...text.measuredShort({
                screen: label,
                count: report.missing.length,
                size: formatBytes(missingBytes),
                list: chunkList(report.missing),
            }),
        });
    }

    if (findings.length === 0) {
        findings.push({
            severity: 'ok',
            target: { tab: 'measured', key: '' },
            kind: 'measuredMatch',
            ...text.measuredMatch({ screen: label, size: formatBytes(report.measured) }),
        });
    }

    return findings;
};
