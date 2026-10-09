/**
 * The two signals that come from a lock file and an audit report — two files the person already has
 * on their disk, dropped through the same door `angular.json` goes through.
 *
 * The crossing is the part neither side can do alone. `pnpm audit` knows there are 47
 * vulnerabilities and nothing about which of them a browser downloads; this report knows what a
 * browser downloads and nothing about vulnerabilities. Together: "3 of your 47 are in the first
 * load and everybody downloads them", which is one afternoon well aimed rather than a backlog.
 *
 * And nothing goes out to the network to do it.
 */

import { type Criteria } from '../../criteria/criteria.types';
import { type DepsReport } from '../../deps/deps.types';
import { type Lang } from '../../i18n/ui-strings';
import { formatSaving, RAW_SCALE, type UnitScale } from '../actions';
import { type Finding } from '../finding.types';
import { mono } from '../text/finding-html';
import { TEXT } from '../text/finding-text';

/**
 * @param scale how the raw weights of packages are said in the report's unit: `unitScale` of the
 *              analysis. Raw by default.
 */
export const buildDepsFindings = (
    deps: DepsReport,
    lang: Lang,
    c: Criteria,
    scale: UnitScale = RAW_SCALE,
): Finding[] => {
    const sized = (bytes: number): string => formatSaving(bytes, scale);
    const text = TEXT[lang];
    const findings: Finding[] = [];

    // 1 · The advisories that actually ship. Everything else is real and is not what a browser
    //     downloads, which is exactly the distinction that turns a list of 47 into a list of 3.
    const shipped = deps.shipped;
    const first = shipped[0];
    if (deps.auditRead && first) {
        const inBoot = shipped.filter(advisory => advisory.inBoot);
        findings.push({
            severity: inBoot.some(advisory => advisory.severity === 'critical' || advisory.severity === 'high')
                ? 'high'
                : 'mid',
            kind: 'vulnerable',
            ...text.vulnerable({
                shipped: shipped.length,
                total: shipped.length + deps.notShipped.length,
                inBoot: inBoot.length,
                worst: first.package,
                list: shipped
                    .map(
                        advisory =>
                            `${mono(advisory.package)} ${advisory.severity}${advisory.inBoot ? ', bootstrap' : ''} (${sized(advisory.bytes)}) — ${advisory.title}`,
                    )
                    .join(' · '),
                elsewhere: deps.notShipped.map(advisory => mono(advisory.package)).join(', '),
            }),
        });
    }

    // 2 · What is in the bundle that nobody asked for directly. The lock file is what turns "who
    //     brings this in" from a guess into an answer.
    const transitive = deps.transitive.filter(entry => entry.bytes >= c.bootPackageMinBytes);
    const heaviest = transitive[0];
    if (deps.lockRead && heaviest) {
        const bytes = transitive.reduce((sum, entry) => sum + entry.bytes, 0);
        findings.push({
            severity: 'info',
            kind: 'transitive',
            ...text.transitive({
                count: transitive.length,
                size: sized(bytes),
                worst: heaviest.name,
                worstSize: sized(heaviest.bytes),
                list: transitive
                    .map(
                        entry =>
                            `${mono(entry.name)} (${sized(entry.bytes)}${entry.inBoot ? ', bootstrap' : ''})${entry.chain.length > 0 ? ` — via ${entry.chain.join(' › ')}` : ''}`,
                    )
                    .join(' · '),
            }),
        });
    }

    return findings;
};
