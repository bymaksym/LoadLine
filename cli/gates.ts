/**
 * The gates: the only part of the command that decides whether a pipeline stops. Kept apart from
 * everything that prints, because "what is wrong" and "what is bad enough to stop a deploy" are
 * two different questions and only the second one has to be answered the same way every time.
 *
 * Growth is measured on what a screen adds beyond the bootstrap, not on its total. The bootstrap
 * is checked once, on its own: otherwise a bootstrap that grew by 30 kB would break the gate of
 * every screen at once and send someone to twenty places to fix one thing.
 */

import { type LoadlineConfig } from '../src/app/core/config/loadline-config.types';
import { type Severity } from '../src/app/core/findings/finding.types';
import { formatBytes, formatDelta } from '../src/app/core/format/format.utils';
import { parseSize } from '../src/app/core/project/project-context';
import { type FailOn, type Gates } from './args.types';
import { type GateName, type Violation } from './gates.types';
import { type CliReport } from './report.types';
import { CLI_TEXT } from './text';

const percent = (ratio: number): string => (ratio * 100).toFixed(1);

/** Which severities the `--fail-on` level covers. `high` alone, or `high` and `mid`. */
const covered = (level: FailOn): Set<Severity> =>
    level === 'mid' ? new Set<Severity>(['high', 'mid']) : new Set<Severity>(['high']);

/**
 * The gates of `loadline.json` under the ones typed on the command line.
 *
 * Only where the flag is absent: a limit typed by hand is somebody overriding the committed
 * decision for one run, and silently ignoring it would be the worse of the two surprises. Sizes in
 * the file are written the way people read them — `350kB` — and a value that cannot be parsed is
 * dropped rather than read as zero, which would fail every build.
 */
export const mergeGates = (gates: Gates, config: LoadlineConfig | null): Gates => {
    const wanted = config?.gates;
    if (!wanted) {
        return gates;
    }

    const size = (value: string | undefined): number | null => (value === undefined ? null : parseSize(value));
    return {
        maxBoot: gates.maxBoot ?? size(wanted.maxBoot),
        maxScreen: gates.maxScreen ?? size(wanted.maxScreen),
        maxOwn: gates.maxOwn ?? size(wanted.maxOwn),
        maxGrowth: gates.maxGrowth ?? size(wanted.maxGrowth),
        maxGrowthRatio: gates.maxGrowthRatio ?? (wanted.maxGrowthPct === undefined ? null : wanted.maxGrowthPct / 100),
        failOn: gates.failOn === 'none' ? (wanted.failOn ?? 'none') : gates.failOn,
        failOnNewPackage: gates.failOnNewPackage || wanted.failOnNewPackage === true,
    };
};

export const checkGates = (report: CliReport, gates: Gates): Violation[] => {
    const text = CLI_TEXT[report.lang];
    const violations: Violation[] = [];
    const { analysis, comparison } = report;

    if (gates.maxBoot !== null && analysis.bootBytes > gates.maxBoot) {
        violations.push({
            gate: 'boot',
            subject: null,
            limit: gates.maxBoot,
            actual: analysis.bootBytes,
            message: text.overBoot(formatBytes(analysis.bootBytes), formatBytes(gates.maxBoot)),
        });
    }

    for (const screen of analysis.screens) {
        if (gates.maxScreen !== null && screen.total > gates.maxScreen) {
            violations.push({
                gate: 'screen',
                subject: screen.label,
                limit: gates.maxScreen,
                actual: screen.total,
                message: text.overScreen(screen.label, formatBytes(screen.total), formatBytes(gates.maxScreen)),
            });
        }
        if (gates.maxOwn !== null && screen.own > gates.maxOwn) {
            violations.push({
                gate: 'own',
                subject: screen.label,
                limit: gates.maxOwn,
                actual: screen.own,
                message: text.overOwn(screen.label, formatBytes(screen.own), formatBytes(gates.maxOwn)),
            });
        }
    }

    if (comparison) {
        const { maxGrowth, maxGrowthRatio } = gates;

        if (maxGrowth !== null && comparison.boot.diff > maxGrowth) {
            violations.push({
                gate: 'growth',
                subject: null,
                limit: maxGrowth,
                actual: comparison.boot.diff,
                message: text.growthBoot(formatDelta(comparison.boot.diff), formatBytes(maxGrowth)),
            });
        }
        if (maxGrowthRatio !== null && comparison.boot.ratio > maxGrowthRatio) {
            violations.push({
                gate: 'growth-pct',
                subject: null,
                limit: maxGrowthRatio,
                actual: comparison.boot.ratio,
                message: text.growthPctBoot(percent(comparison.boot.ratio), percent(maxGrowthRatio)),
            });
        }

        for (const screen of comparison.screens.values()) {
            if (maxGrowth !== null && screen.lazy.diff > maxGrowth) {
                violations.push({
                    gate: 'growth',
                    subject: screen.label,
                    limit: maxGrowth,
                    actual: screen.lazy.diff,
                    message: text.growthScreen(screen.label, formatDelta(screen.lazy.diff), formatBytes(maxGrowth)),
                });
            }
            if (maxGrowthRatio !== null && screen.lazy.ratio > maxGrowthRatio) {
                violations.push({
                    gate: 'growth-pct',
                    subject: screen.label,
                    limit: maxGrowthRatio,
                    actual: screen.lazy.ratio,
                    message: text.growthPctScreen(screen.label, percent(screen.lazy.ratio), percent(maxGrowthRatio)),
                });
            }
        }
    }

    // A package that entered the bootstrap. Two sources, and both are wanted: the baseline says
    // what was there last time, and `loadline.json` says what the team agreed to. Without either,
    // the gate has nothing to compare against and says so rather than passing quietly.
    if (gates.failOnNewPackage) {
        const approved = report.config?.packages;
        const entered = approved
            ? report.analysis.bootBuckets.filter(bucket => !bucket.isProjectCode && !approved.includes(bucket.name))
            : (comparison?.newBootPackages ?? []).map(pkg => ({ name: pkg.name, bytes: pkg.bytes }));

        if (entered.length > 0) {
            violations.push({
                gate: 'new-package',
                subject: null,
                limit: 0,
                actual: entered.length,
                message: text.newPackages(entered.map(pkg => `${pkg.name} (${formatBytes(pkg.bytes)})`)),
            });
        }
    }

    if (gates.failOn !== 'none') {
        const levels = covered(gates.failOn);
        const raised = report.findings.filter(finding => levels.has(finding.severity));
        if (raised.length > 0) {
            violations.push({
                gate: 'signals',
                subject: null,
                limit: 0,
                actual: raised.length,
                message: text.signalsRaised(raised.length, gates.failOn),
            });
        }
    }

    return violations;
};

/** Whether any gate was asked for at all, which is what tells "passed" from "nothing was checked". */
export const anyGate = (gates: Gates): boolean =>
    gates.failOn !== 'none' ||
    gates.failOnNewPackage ||
    [gates.maxBoot, gates.maxScreen, gates.maxOwn, gates.maxGrowth, gates.maxGrowthRatio].some(limit => limit !== null);

/**
 * The broken gates as lines to print, grouped by gate and every one of them named.
 *
 * It used to print the worst three of each and "and N more". The argument was that when a shared
 * chunk grows every screen breaks the same limit by the same amount, so twenty lines send somebody
 * to twenty places to fix one thing — but that is a reason to group them under their gate, which
 * is what the grouping already does, not a reason to leave seventeen of them out of the log
 * somebody is reading to find out what broke.
 */
export const violationLines = (violations: Violation[]): string[] => {
    const byGate = new Map<GateName, Violation[]>();

    for (const violation of violations) {
        byGate.set(violation.gate, [...(byGate.get(violation.gate) ?? []), violation]);
    }

    return [...byGate.values()].flatMap(group => group.map(violation => violation.message));
};
