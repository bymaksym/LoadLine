/**
 * Signals that only exist because somebody pasted a measurement.
 *
 * They are the half of the report that is about what is **served** rather than what was built, and
 * they follow one rule that the rest of the tool now depends on:
 *
 * **A fact may raise severity with evidence, and may lower it only with evidence.** "Nobody
 * measured" never softens anything — it widens the uncertainty and leaves the signal where it was.
 * The asymmetry is not fussiness: the failure mode of the symmetric version is that an optimistic
 * answer produces silence exactly where the honest answer is noise, and silence is the one output
 * nobody checks.
 *
 * The second rule is about the channel. One paste describes one machine, on one connection, on one
 * day. `h3` measured from a laptop on office fibre is a fact about that laptop: a new visitor's
 * first connection is usually `h2` because `Alt-Svc` has to be cached first, and a corporate proxy
 * that drops UDP degrades it for a whole company. So the channel is reported with its date and its
 * limits attached, and it does not move a single threshold.
 */

import { type Analysis } from '../analysis/analysis.types';
import { type Criteria } from '../criteria/criteria.types';
import { formatBytes } from '../format/format.utils';
import { type Lang } from '../i18n/ui-strings';
import { type MeasuredReport } from '../measurement/measurement.types';
import { isStale, type Observed, OBSERVED_FRESH_DAYS } from '../measurement/observed';
import { type Finding } from './finding.types';
import { mono } from './finding-html';
import { TEXT } from './finding-text';

/** Protocols where one connection carries everything, so a count of files is not a count of trips. */
const isMultiplexed = (protocol: string | null): boolean => !!protocol && /^h[23]$/i.test(protocol);

/**
 * What the graph says this load should have taken, in round trips.
 *
 * The bootstrap's depth plus the screen's, because they are sequential: the router cannot ask for
 * a screen's chunk until the bootstrap that holds the router has arrived and run. `null` when
 * `index.html` was never read, since the bootstrap's depth is not derivable without it and a
 * comparison against half a figure would be worse than none.
 */
const computedWavesOf = (analysis: Analysis, report: MeasuredReport | null): number | null => {
    const startup = analysis.startup;
    if (!startup) {
        return null;
    }

    return startup.waves + (report?.screen ? report.screen.waves : 0);
};

export const buildObservedFindings = (
    observed: Observed,
    report: MeasuredReport | null,
    analysis: Analysis,
    lang: Lang,
    c: Criteria,
    today: string = new Date().toISOString().slice(0, 10),
): Finding[] => {
    const text = TEXT[lang];
    const findings: Finding[] = [];

    // --- what is served, against what was built -------------------------------------------------
    // First because it is the only one of these with a fix worth more than every byte-level signal
    // on the list, and because it is the one a build folder can never tell you.
    if (observed.compression.uncompressed.length > 0) {
        findings.push({
            severity: 'high',
            target: { tab: 'measured', key: '' },
            kind: 'servedUncompressed',
            ...text.servedUncompressed({
                count: observed.compression.uncompressed.length,
                size: formatBytes(observed.compression.uncompressedBytes),
                ratio: observed.compression.ratio,
                list: observed.compression.uncompressed.map(file => mono(file)).join(', '),
            }),
        });
    }

    // --- the calculation against the waterfall ---------------------------------------------------
    // The one thing no other tool can do: the vendors with the waterfall have no module graph, and
    // the analysers with the graph have no waterfall.
    const computed = computedWavesOf(analysis, report);
    const queued = observed.connections.opened > 6 && !isMultiplexed(observed.protocol.value);
    if (computed !== null && observed.waves.length > 0) {
        const measured = observed.waves.length;
        findings.push({
            // A calculation that comes out short is a bug in the calculation, and this is the only
            // place it can be caught. Matching is worth saying out loud too: it is what makes every
            // other round-trip figure in the report believable.
            severity: measured > computed ? 'mid' : 'ok',
            target: { tab: 'measured', key: '' },
            kind: 'measuredWaves',
            ...text.measuredWaves({
                computed,
                measured,
                screen: report?.screen?.label ?? text.rootScreen,
                widest: Math.max(...observed.waves.map(wave => wave.files.length)),
                // Whether the pool ran out, so the extra batches are named as queueing rather than
                // left for the reader to take as depth the graph failed to predict.
                queued,
                list: observed.waves
                    .map(
                        (wave, index) =>
                            `${index + 1}: ${wave.files.length} (${Math.round(wave.startedAt)}–${Math.round(wave.endedAt)} ms)`,
                    )
                    .join(' · '),
            }),
        });
    }

    // --- the connection, observed ---------------------------------------------------------------
    // Under HTTP/1.1 this is the count of files turning into seconds, measured rather than derived
    // from the protocol. Under h2 and h3 it means something else and is not raised.
    if (queued) {
        findings.push({
            severity: 'mid',
            target: { tab: 'measured', key: '' },
            kind: 'poolExhausted',
            ...text.poolExhausted({
                opened: observed.connections.opened,
                lastAt: observed.connections.lastAt,
                protocol: observed.protocol.value ?? '',
            }),
        });
    }

    // --- the denominator the file count never had ------------------------------------------------
    if (observed.thirdParty.requests > 0) {
        findings.push({
            severity: observed.thirdParty.requests >= c.screenFilesMax ? 'mid' : 'info',
            target: { tab: 'measured', key: '' },
            kind: 'thirdPartyLoad',
            ...text.thirdPartyLoad({
                requests: observed.thirdParty.requests,
                total: observed.thirdParty.total,
                origins: observed.thirdParty.origins.map(origin => mono(origin)).join(', '),
                count: observed.thirdParty.origins.length,
                multiplexed: isMultiplexed(observed.protocol.value),
                max: c.screenFilesMax,
            }),
        });
    }

    // --- what the browser did about its cache ----------------------------------------------------
    // The premise of the whole update-cost section, and until now an assumption.
    if (observed.cache.revalidated > 0) {
        findings.push({
            severity: 'mid',
            target: { tab: 'measured', key: '' },
            kind: 'revalidated',
            ...text.revalidated({
                revalidated: observed.cache.revalidated,
                fromCache: observed.cache.fromCache,
                network: observed.cache.network,
            }),
        });
    }

    // --- a worker in charge of this load ---------------------------------------------------------
    // It does not soften the counting signals, which is what the first version of this said and had
    // backwards. A first visit pays the network in full *and* the worker's precache on top, and with
    // a hash cascade nearly every entry of the manifest changes on every deploy. It softens the
    // repeat visit, and only that.
    if (observed.serviceWorker === true) {
        findings.push({
            severity: 'info',
            target: { tab: 'measured', key: '' },
            kind: 'swControlling',
            ...text.swControlling({ caches: observed.caches?.length ?? 0 }),
        });
    }

    // --- where the code really came from ---------------------------------------------------------
    // The measured counterpart of what `index.html` says. It is the stronger of the two: a page
    // written entirely with relative URLs and served from a CDN names no other host anywhere in
    // its markup, and only the addresses the browser reported say where the bytes came from.
    if (observed.assetOrigins.length > 0) {
        findings.push({
            severity: 'info',
            target: { tab: 'measured', key: '' },
            kind: 'measuredOrigin',
            ...text.measuredOrigin({
                origins: observed.assetOrigins.map(origin => mono(origin)).join(', '),
                count: observed.assetOrigins.length,
            }),
        });
    }

    // --- the channel, with its limits attached ---------------------------------------------------
    // Last on purpose: it is the frame the four above are read through, not a problem of its own.
    if (observed.protocol.value || observed.rttMs !== null || observed.ttfbMs !== null) {
        findings.push({
            severity: 'info',
            target: { tab: 'measured', key: '' },
            kind: 'observedChannel',
            ...text.observedChannel({
                protocol: observed.protocol.value,
                mixed: observed.protocol.seen.length > 1 ? observed.protocol.seen.join(', ') : null,
                rttMs: observed.rttMs,
                ttfbMs: observed.ttfbMs,
                latencyMs: c.latencyMs,
                takenAt: observed.takenAt,
                stale: isStale(observed.takenAt, today),
                freshDays: OBSERVED_FRESH_DAYS,
                modulepreloads: observed.modulepreloads,
                // Whether the paste carried timings at all. Without them half of this block is
                // `null`, and saying which half is missing beats letting the reader wonder whether
                // the load simply had nothing to report.
                timed: observed.timed,
            }),
        });
    }

    return findings;
};
