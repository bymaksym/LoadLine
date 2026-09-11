/**
 * The report as SARIF 2.1.0, so GitHub shows each signal where the developer already looks.
 *
 * The point is not the format, it is the anchoring. "You have 47 vulnerabilities" in a log nobody
 * opens does nothing; the same finding attached to the file it is about, in the diff view, gets
 * read. Every signal that names a source file gets a location; the ones about the build as a whole
 * are anchored to the page or the stats file the report was made from, because a SARIF result with
 * no location at all is dropped silently by some viewers.
 *
 * Reference: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */

import { type Finding, FINDING_KINDS, type Severity } from '../src/app/core/findings/finding.types';
import { plainText } from '../src/app/core/findings/finding-plain';
import { type CliReport } from './report.types';

/** SARIF has three levels that matter to a code-scanning view; the report has four. */
const LEVEL: Record<Severity, 'error' | 'warning' | 'note'> = {
    high: 'error',
    mid: 'warning',
    ok: 'note',
    info: 'note',
};

/**
 * Which file a signal points at.
 *
 * A signal about a package or a chunk has no source file of its own, and inventing one would put a
 * warning on a line somebody did not write. Those are anchored to what the report was read from,
 * which is true and checkable.
 */
const locationOf = (finding: Finding, fallback: string): string => {
    const key = finding.target?.key ?? '';
    return /\.[a-z]+$/i.test(key) && !key.includes('node_modules') ? key : fallback;
};

export const renderSarif = (report: CliReport): string => {
    const fallback = report.statsName;

    // Only the signals this run actually raised. Declaring all of them would mean rules with no
    // help text — a rule somebody has to look up elsewhere, which is the thing this tool spends
    // most of its words avoiding — and a code-scanning view listing signals nobody saw.
    const raised = FINDING_KINDS.filter(kind => report.findings.some(finding => finding.kind === kind));
    const rules = raised.map(kind => {
        const example = report.findings.find(finding => finding.kind === kind);
        return {
            id: kind,
            name: kind,
            shortDescription: { text: example?.chip ?? kind },
            fullDescription: { text: example?.title ?? kind },
            help: { text: example ? plainText(example.fix) : '' },
        };
    });

    const results = report.findings.map(finding => ({
        ruleId: finding.kind,
        level: LEVEL[finding.severity],
        message: { text: `${finding.title} — ${plainText(finding.body)}` },
        locations: [
            {
                physicalLocation: {
                    artifactLocation: { uri: locationOf(finding, fallback) },
                    region: { startLine: 1 },
                },
            },
        ],
        ...(finding.saving !== undefined && { properties: { savingBytes: finding.saving } }),
    }));

    const log = {
        $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
        version: '2.1.0',
        runs: [
            {
                tool: {
                    driver: {
                        name: 'Loadline',
                        informationUri: 'https://github.com/loadline',
                        rules,
                    },
                },
                results,
            },
        ],
    };

    return `${JSON.stringify(log, null, 2)}\n`;
};
