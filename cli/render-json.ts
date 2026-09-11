/** The report as data. Shape and its rules: `render-json.types.ts`. */

import { rate } from '../src/app/core/criteria/criteria';
import { rankActions, totalSaving } from '../src/app/core/findings/actions';
import { plainText } from '../src/app/core/findings/finding-plain';
import { budgetAdvice } from '../src/app/core/project/budget-advice';
import { timingsOf } from '../src/app/core/timing/timing';
import { type Violation } from './gates.types';
import {
    type JsonComparison,
    type JsonEntry,
    type JsonFinding,
    type JsonReport,
    type JsonScreen,
} from './render-json.types';
import { type CliReport } from './report.types';

const comparisonOf = (report: CliReport): JsonComparison | null => {
    const comparison = report.comparison;
    if (!comparison) {
        return null;
    }

    return {
        baseline: comparison.baselineName,
        date: comparison.baselineDate,
        mode: comparison.mode,
        boot: comparison.boot,
        newScreens: comparison.newScreens.map(screen => screen.label),
        goneScreens: comparison.goneScreens.map(screen => screen.label),
        newBootPackages: comparison.newBootPackages,
    };
};

const screensOf = (report: CliReport): JsonScreen[] =>
    report.analysis.screens.map(screen => {
        const delta = report.comparison?.screens.get(screen.source);
        return {
            label: screen.label,
            source: screen.source,
            files: screen.files,
            boot: screen.boot,
            shared: screen.shared,
            own: screen.own,
            total: screen.total,
            verdict: rate(screen.total, report.criteria.screenOk, report.criteria.screenBad),
            delta: delta ? delta.total : null,
        };
    });

/** The two lists of lazy entries that are not screens, in the order the report shows them. */
const entriesOf = (entries: readonly { label: string; source: string; bytes: number }[]): JsonEntry[] =>
    entries.map(entry => ({ label: entry.label, source: entry.source, bytes: entry.bytes }));

export const renderJson = (report: CliReport, violations: Violation[], anyAsked: boolean): string => {
    const { analysis, criteria } = report;
    const asking = new Set<JsonFinding['kind']>(['budgetNone', 'budgetTooHigh', 'budgetWarnOnly']);
    const advice = report.findings.some(finding => asking.has(finding.kind))
        ? budgetAdvice(analysis.bootRawBytes + (report.pageCssRawBytes ?? 0))
        : null;

    const payload: JsonReport = {
        tool: 'loadline',
        version: 1,
        stats: report.statsName,
        project: report.projectName,
        mode: report.mode,
        unit: report.unit,
        splitSource: analysis.splitSource,
        serverOutputs: analysis.serverOutputs,
        pageCss: report.pageCssBytes === null ? null : { bytes: report.pageCssBytes, files: report.pageCssFiles },
        firstTrip: report.assets?.firstTrip ?? null,
        assets: report.assets
            ? {
                  fonts: report.assets.fonts,
                  media: report.assets.media,
                  unreferenced: report.assets.unreferenced,
                  referencesRead: report.assets.referencesRead,
                  duplicates: report.assets.duplicates,
                  contentCompared: report.assets.contentCompared,
                  inlinedBytes: report.assets.inlinedBytes,
                  inlined: report.assets.inlined,
              }
            : null,
        boot: {
            bytes: analysis.bootBytes,
            rawBytes: analysis.bootRawBytes,
            files: analysis.bootFiles,
            verdict: rate(analysis.bootBytes, criteria.bootOk, criteria.bootBad),
        },
        screens: screensOf(report),
        deferred: entriesOf(analysis.deferredBlocks),
        groupers: entriesOf(analysis.routeGroupers),
        data: entriesOf(analysis.lazyData),
        shared: analysis.sharedChunks.map(chunk => ({
            file: chunk.file,
            name: chunk.name,
            bytes: chunk.bytes,
            screens: chunk.screens,
            mainContent: chunk.mainContent,
        })),
        findings: report.findings.map(finding => ({
            kind: finding.kind,
            severity: finding.severity,
            chip: finding.chip,
            title: finding.title,
            body: plainText(finding.body),
            fix: plainText(finding.fix),
            ...(finding.saving !== undefined && { saving: finding.saving }),
            ...(finding.sources !== undefined && { sources: finding.sources }),
        })),
        actions: rankActions(report.findings).map(action => ({
            kind: action.finding.kind,
            title: action.finding.title,
            saving: action.saving,
            effort: action.effort,
        })),
        saving: totalSaving(analysis, report.findings),
        timing: timingsOf(
            analysis.bootBytes + (report.pageCssBytes ?? 0),
            analysis.bootRawBytes,
            analysis.startup?.waves ?? 1,
            criteria.latencyMs,
        ),
        budget: advice,
        caching: report.caching,
        scan: report.scan,
        deps: report.deps,
        comparison: comparisonOf(report),
        comparable: !report.comparisonBlocked,
        gates: { asked: anyAsked, violations },
        ok: violations.length === 0,
    };

    return JSON.stringify(payload, null, 2);
};
