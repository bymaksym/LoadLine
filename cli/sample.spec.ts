/**
 * The golden file: one synthetic build with its whole report written down.
 *
 * It is frozen, so it cannot notice Angular changing shape — that is what `--self-check` against a
 * real build is for. What it does notice is **us**: any edit to the analysis, the criteria or the
 * signals that moves a number or a sentence shows up here as a diff, and the diff is the review.
 *
 * The build is `core/sample/sample-build.ts`, the same one the page loads with "See an example",
 * so this is also the test that the example still shows what it is supposed to show.
 *
 * To accept a deliberate change: `pnpm test:cli -u`.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/app/core/analysis/analysis';
import { announcedIn } from '../src/app/core/build-text/index-html';
import { EMPTY_CONTEXT } from '../src/app/core/project/project-context';
import { SAMPLE_NAME, SAMPLE_PAGE, SAMPLE_STATS } from '../src/app/core/sample/sample-build';
import { parseArgs } from './args';
import { type BuildInput } from './read/read-build.types';
import { renderAgent } from './render/render-agent';
import { renderJson } from './render/render-json';
import { buildReport } from './report';

const announced = new Set(announcedIn(SAMPLE_PAGE));

/** The sample as the command would have read it off a disk: a stats file and the page next to it. */
const INPUT: BuildInput = {
    meta: SAMPLE_STATS,
    parallel: null,
    routes: null,
    statsName: SAMPLE_NAME,
    gzip: null,
    brotli: null,
    splits: null,
    announced,
    graph: null,
    pageCss: null,
    baseline: null,
    context: EMPTY_CONTEXT,
    criteria: null,
    // No `loadline.json`: the golden file is what the recommended thresholds say about this build.
    config: null,
    configProblems: [],
    configName: null,
};

const options = () => {
    const parsed = parseArgs([SAMPLE_NAME]);
    if (!parsed.ok) {
        throw new Error(parsed.message);
    }
    return parsed.options;
};

describe('the sample build', () => {
    it('produces the report it produced last time', async () => {
        const json = renderJson(buildReport(INPUT, options()), [], false);
        // Awaited on purpose: this assertion is asynchronous, and without the await the comparison
        // is not guaranteed to run before the test ends — so the golden file could stop matching
        // without anything going red. Vitest 5 fails the test rather than letting that pass.
        await expect(json).toMatchFileSnapshot(join(__dirname, '..', 'fixtures', 'sample-report.json'));
    });

    /**
     * The half of the golden file a diff is easy to skim past. Each of these is a decision the
     * sample exists to exercise, named, so breaking one fails a test that says which.
     */
    it('is the build it was written to be', () => {
        const analysis = analyze(SAMPLE_STATS, null, null, announced);

        expect(analysis.screens).toHaveLength(8);
        // A widget deferred inside a screen is not a ninth screen, and the file that only lists
        // routes is not one either.
        expect(analysis.deferredBlocks.map(entry => entry.label)).toEqual(['heatmap.widget']);
        expect(analysis.routeGroupers.map(entry => entry.label)).toEqual(['admin']);

        // The finding the whole tool is about: a chunk the bundler calls deferred that five of the
        // eight screens import, so everybody who uses the app downloads it. And the admin route
        // file, which both admin screens download before their own chunk: it is not a screen, and
        // it is paid for by the two reached through it.
        expect(analysis.sharedChunks.map(chunk => [chunk.name, chunk.screens])).toEqual([
            ['chunk-GRID-5NPX7J.js', 5],
            ['chunk-ADMIN-9TYU2E.js', 2],
        ]);

        // index.html names three of the four bootstrap chunks; the fourth costs a second round trip.
        expect(analysis.startup).toEqual({
            waves: 2,
            discovered: ['chunk-ICONS-8PLM3D.js'],
            byWave: [['chunk-ICONS-8PLM3D.js']],
            width: 3,
            // The chain behind that second trip: the only pair worth naming in the page.
            critical: ['chunk-CORE-4H8BTZ.js', 'chunk-ICONS-8PLM3D.js'],
        });

        // And one screen is three static imports deep, which is what the round-trips signal is for.
        expect(analysis.screens.find(screen => screen.label === 'dashboard')?.waves).toBe(3);
        // And one is three deep because the route file in front of it has to arrive first.
        expect(analysis.screens.find(screen => screen.label === 'users')?.waves).toBe(3);
        expect(analysis.duplicates.map(dupe => dupe.name)).toEqual(['date-fns']);

        // Three screens carry far more of their own code than the rest, and they are ONE signal.
        // One card per screen is what a real application turned into fifty-eight of them.
        const report = buildReport(INPUT, options());
        expect(report.findings.filter(finding => finding.kind === 'heavy')).toHaveLength(1);
        expect(analysis.commonJs.map(pkg => pkg.name)).toEqual(['xlsx']);
    });
});

describe('--format agent on the sample build', () => {
    const lines = renderAgent(buildReport(INPUT, options()), [], false).split('\n');

    it('opens with its version and the figures as fixed key=value fields', () => {
        expect(lines[0]).toBe('loadline agent v1');
        expect(lines[1]).toMatch(/^build=\S+ unit=raw boot=\S+ verdict=\w+ screens=\d+ measurable=yes$/);
        expect(lines).toContain('gates: none asked');
    });

    it('numbers at most five actions, each with its kind, severity, saving and effort', () => {
        const actions = lines.filter(line => /^\d+\. /.test(line));
        expect(actions.length).toBeGreaterThan(0);
        expect(actions.length).toBeLessThanOrEqual(5);
        for (const action of actions) {
            expect(action).toMatch(/kind=\w+ .*severity=\w+ saving=\S+ effort=\w+$/);
        }
    });
});
