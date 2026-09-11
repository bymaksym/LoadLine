/**
 * The signals that come from reading the text of the build: what it gives away, what it should
 * never have shipped, whose code it is, and under what licence.
 *
 * All of it offline. The one thing this area normally needs — a registry, a CVE database, a
 * telemetry endpoint — is the one thing this tool will not do, and it turns out most of the answer
 * was inside the files that were already open.
 */

import { type Criteria } from '../criteria/criteria.types';
import { formatBytes } from '../format/format.utils';
import { type Lang } from '../i18n/ui-strings';
import { type ScanReport, type SecretKind } from '../scan/scan.types';
import { type Finding } from './finding.types';
import { mono } from './finding-html';
import { TEXT } from './finding-text';

const named = (items: readonly string[]): string => items.map(item => mono(item)).join(', ');

/** The ones that are a problem whatever else is true, as opposed to a build pointed at the wrong place. */
const ALWAYS_SERIOUS = new Set<SecretKind>(['privateKey', 'awsKey', 'githubToken', 'slackToken', 'googleKey']);

export const buildScanFindings = (scan: ScanReport, lang: Lang, c: Criteria): Finding[] => {
    const text = TEXT[lang];
    const findings: Finding[] = [];

    // 1 · Credentials and internal addresses. The cheapest finding here and the most expensive to
    //     have. Every pattern identifies a specific format by its own prefix: there is deliberately
    //     no rule for "a long string near the word key", which is what makes a security signal noisy
    //     and then switched off.
    const secrets = scan.secrets;
    const serious = secrets.filter(match => ALWAYS_SERIOUS.has(match.kind));
    const first = secrets[0];
    if (first) {
        findings.push({
            severity: serious.length > 0 ? 'high' : 'mid',
            kind: 'secrets',
            ...text.secrets({
                count: secrets.length,
                serious: serious.length,
                kinds: [...new Set(secrets.map(match => match.kind))].join(', '),
                list: secrets
                    .map(
                        match =>
                            `${mono(match.kind)} ${match.redacted} (${mono(match.chunk)}${match.count > 1 ? `, ×${match.count}` : ''})`,
                    )
                    .join(' · '),
            }),
        });
    }

    // 2 · What a development build leaves behind. It is a fault in itself and it also invalidates
    //     the rest of the report, which is why the card says so before giving any figure.
    const leftovers = scan.leftovers;
    const breaking = leftovers.filter(item => item.kind === 'reactDev' || item.kind === 'devServer');
    const worst = leftovers[0];
    if (worst) {
        // Nothing here could be traced to a file of the project's: the occurrences are real and
        // whose they are is not known. That is context, not a fault to fix, and it stops the card
        // that fires on every Angular build from sitting in the "what to fix first" table.
        const unattributed = leftovers.every(item => !item.attributed);
        findings.push({
            severity: breaking.length > 0 ? 'high' : unattributed ? 'info' : 'mid',
            kind: 'devLeftovers',
            ...text.devLeftovers({
                count: leftovers.length,
                broken: breaking.length > 0,
                unattributed,
                list: leftovers.map(item => `${mono(item.kind)} ×${item.count} (${named(item.where)})`).join(' · '),
            }),
        });
    }

    // 3 · What the maps published with the build give away. The report has said "there are source
    //     maps here" for a while and that sentence gets ignored; this one says what is in them.
    const exposure = scan.exposure;
    if (exposure && exposure.hasContent && exposure.ownFiles > 0) {
        findings.push({
            // Context, like the `sourceMaps` card it stands next to, and for its reason: this tool
            // cannot tell the folder somebody deploys from the one they just built locally. What
            // this card adds is what is inside the maps, not a stronger claim about them.
            severity: 'info',
            kind: 'sourceExposed',
            ...text.sourceExposed({
                files: exposure.ownFiles,
                maps: exposure.maps,
                env: exposure.envReferences,
                list: exposure.paths.map(path => mono(path)).join(' · '),
            }),
        });
    }

    // 4 · Whose code the first load is, by what it is for. The list somebody takes to the meeting
    //     where it is decided whether the session recorder stays.
    const groups = scan.thirdParty;
    const bootBytes = groups.reduce((sum, group) => sum + group.bootBytes, 0);
    if (groups.length > 0 && bootBytes >= c.shippedMinBytes) {
        findings.push({
            severity: 'info',
            kind: 'thirdParty',
            ...text.thirdParty({
                count: groups.reduce((sum, group) => sum + group.packages.length, 0),
                size: formatBytes(bootBytes),
                total: formatBytes(groups.reduce((sum, group) => sum + group.bytes, 0)),
                list: groups
                    .map(
                        group =>
                            `${mono(group.category)} — ${formatBytes(group.bytes)}: ${group.packages
                                .map(pkg => `${pkg.name} (${formatBytes(pkg.bytes)}${pkg.inBoot ? ', bootstrap' : ''})`)
                                .join(', ')}`,
                    )
                    .join(' · '),
            }),
        });
    }

    // 5 · Licences, from the legal comments the bundler kept on purpose. Partial by construction,
    //     and the card says so: without `node_modules` there is no way to see the ones with no header.
    const licences = scan.licences;
    const conditional = licences.filter(entry => entry.class !== 'permissive');
    if (conditional.length > 0) {
        findings.push({
            severity: conditional.some(entry => entry.class === 'strongCopyleft' || entry.class === 'nonCommercial')
                ? 'mid'
                : 'info',
            kind: 'licences',
            ...text.licences({
                count: conditional.length,
                worst: conditional[0]?.id ?? '',
                list: conditional
                    .map(entry => `${mono(entry.id)}${entry.packages.length > 0 ? ` (${named(entry.packages)})` : ''}`)
                    .join(' · '),
                permissive: licences
                    .filter(entry => entry.class === 'permissive')
                    .map(entry => entry.id)
                    .join(', '),
            }),
        });
    }

    return findings;
};
