/**
 * The signals a pasted measurement produces, and the rule they all obey.
 *
 * The rule is the thing worth pinning: **a fact raises severity with evidence and lowers it only
 * with evidence.** The tests below are written against that rather than against the wording, so a
 * future edit that quietly lets an optimistic observation turn a signal green fails here.
 */

import { describe, expect, it } from 'vitest';
import { type Analysis } from '../analysis/analysis.types';
import { RECOMMENDED } from '../criteria/criteria';
import { type Observed } from '../measurement/observed';
import { buildObservedFindings } from './observed';

const criteria = RECOMMENDED.raw;

/** Nothing observed at all: the shape a bare list of file names produces. */
const NOTHING: Observed = {
    protocol: { value: null, agree: 0, counted: 0, seen: [] },
    rttMs: null,
    ttfbMs: null,
    compression: { uncompressed: [], uncompressedBytes: 0, ratio: null },
    cache: { fromCache: 0, revalidated: 0, network: 0 },
    connections: { opened: 0, lastAt: null },
    assetOrigins: [],
    thirdParty: { requests: 0, origins: [], total: 0 },
    serviceWorker: null,
    caches: null,
    modulepreloads: null,
    waves: [],
    takenAt: null,
    timed: false,
};

const observed = (over: Partial<Observed>): Observed => ({ ...NOTHING, ...over });

/**
 * A build whose first load the page announces: `waves` trips, so the graph has a figure to be
 * checked against. Only `startup` is filled in — it is all these signals read — and the cast goes
 * through `unknown` because a stub of one field out of thirty does not overlap the real shape.
 */
const analysis = (waves = 2): Analysis =>
    ({
        startup: { waves, discovered: [], byWave: [], width: 1, critical: [] },
    }) as unknown as Analysis;

const kinds = (list: { kind: string }[]): string[] => list.map(finding => finding.kind);

describe('buildObservedFindings · nothing observed', () => {
    it('says nothing at all rather than saying everything is fine', () => {
        expect(buildObservedFindings(NOTHING, null, analysis(), 'en', criteria)).toEqual([]);
    });
});

describe('buildObservedFindings · what is served', () => {
    it('names JavaScript arriving uncompressed, and leads with it', () => {
        const findings = buildObservedFindings(
            observed({ compression: { uncompressed: ['main.js'], uncompressedBytes: 120_000, ratio: 1.02 } }),
            null,
            analysis(),
            'en',
            criteria,
        );

        expect(findings[0]?.kind).toBe('servedUncompressed');
        expect(findings[0]?.severity).toBe('high');
    });

    it('says the update-cost premise does not hold when files are revalidated', () => {
        const findings = buildObservedFindings(
            observed({ cache: { fromCache: 2, revalidated: 5, network: 1 } }),
            null,
            analysis(),
            'en',
            criteria,
        );

        expect(kinds(findings)).toContain('revalidated');
    });
});

describe('buildObservedFindings · the graph against the waterfall', () => {
    const batches = (count: number) =>
        Array.from({ length: count }, (_, index) => ({
            files: [`chunk-${index}.js`],
            startedAt: index * 100,
            endedAt: index * 100 + 90,
        }));

    it('is a result and not a problem when the two agree', () => {
        const findings = buildObservedFindings(observed({ waves: batches(2) }), null, analysis(2), 'en', criteria);
        const measured = findings.find(finding => finding.kind === 'measuredWaves');

        expect(measured?.severity).toBe('ok');
    });

    it('is worth a line when the browser took more than the graph predicts', () => {
        const findings = buildObservedFindings(observed({ waves: batches(5) }), null, analysis(2), 'en', criteria);
        const measured = findings.find(finding => finding.kind === 'measuredWaves');

        expect(measured?.severity).toBe('mid');
    });

    it('blames the connection pool for the extra batches when the pool is what ran out', () => {
        const findings = buildObservedFindings(
            observed({
                waves: batches(5),
                connections: { opened: 9, lastAt: 400 },
                protocol: { value: 'http/1.1', agree: 9, counted: 9, seen: ['http/1.1'] },
            }),
            null,
            analysis(2),
            'en',
            criteria,
        );

        expect(findings.find(finding => finding.kind === 'measuredWaves')?.fix).toContain('queueing');
        expect(kinds(findings)).toContain('poolExhausted');
    });

    it('says nothing about round trips when index.html was never read', () => {
        const findings = buildObservedFindings(
            observed({ waves: batches(4) }),
            null,
            {} as unknown as Analysis,
            'en',
            criteria,
        );

        expect(kinds(findings)).not.toContain('measuredWaves');
    });
});

describe('buildObservedFindings · the connection', () => {
    it('leaves the pool alone under a multiplexed protocol, where it means something else', () => {
        const findings = buildObservedFindings(
            observed({
                connections: { opened: 12, lastAt: 300 },
                protocol: { value: 'h2', agree: 12, counted: 12, seen: ['h2'] },
            }),
            null,
            analysis(),
            'en',
            criteria,
        );

        expect(kinds(findings)).not.toContain('poolExhausted');
    });
});

describe('buildObservedFindings · a service worker', () => {
    /**
     * The correction this whole signal exists for. A worker in charge of the page is easy to read
     * as "requests stop mattering", and it is the other way round: the first visit pays the network
     * in full plus the precache, and the cascade gets more expensive, not less.
     */
    it('softens the returning visit and raises the cascade, never the other way round', () => {
        const findings = buildObservedFindings(
            observed({ serviceWorker: true, caches: ['ngsw:1'] }),
            null,
            analysis(),
            'en',
            criteria,
        );
        const worker = findings.find(finding => finding.kind === 'swControlling');

        expect(worker?.severity).toBe('info');
        expect(worker?.body).toContain('raises');
        expect(worker?.fix).toContain('higher, not lower');
    });
});

describe('buildObservedFindings · the channel', () => {
    it('reports the measurement with its date and refuses to move a threshold with it', () => {
        const findings = buildObservedFindings(
            observed({
                protocol: { value: 'h3', agree: 8, counted: 8, seen: ['h3'] },
                rttMs: 12,
                takenAt: '2026-09-01T09:00:00.000Z',
                timed: true,
            }),
            null,
            analysis(),
            'en',
            criteria,
            '2026-09-10',
        );
        const channel = findings.find(finding => finding.kind === 'observedChannel');

        expect(channel?.severity).toBe('info');
        expect(channel?.body).toContain('the machine of whoever pasted the snippet');
        expect(channel?.fix).toContain('Not one of these figures moves a threshold');
        // An h3 measured once is systematically optimistic, and the copy has to say why.
        expect(channel?.fix).toContain('Alt-Svc');
    });

    it('asks for the measurement again once it has gone stale', () => {
        const findings = buildObservedFindings(
            observed({ rttMs: 40, takenAt: '2026-01-01T09:00:00.000Z' }),
            null,
            analysis(),
            'en',
            criteria,
            '2026-09-10',
        );

        expect(findings.find(finding => finding.kind === 'observedChannel')?.fix).toContain('days old');
    });

    it('says which half is missing when the paste carried no timings', () => {
        const findings = buildObservedFindings(
            observed({ protocol: { value: 'h2', agree: 3, counted: 3, seen: ['h2'] }, timed: false }),
            null,
            analysis(),
            'en',
            criteria,
        );

        expect(findings.find(finding => finding.kind === 'observedChannel')?.body).toContain('no timings');
    });
});

describe('buildObservedFindings · where the bytes came from', () => {
    it('reports a host the markup never named, because only the measurement can', () => {
        const findings = buildObservedFindings(
            observed({ assetOrigins: ['https://cdn.example.com'] }),
            null,
            analysis(),
            'en',
            criteria,
        );

        expect(kinds(findings)).toContain('measuredOrigin');
    });
});
