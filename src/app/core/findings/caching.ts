/**
 * The three signals about the update rather than the first visit.
 *
 * Nobody looks at this and it is half the real cost. Almost every visit to a running application is
 * somebody who already had yesterday's version, and what they download is not the bundle — it is
 * whatever of it changed name.
 */

import { type Analysis } from '../analysis/analysis.types';
import { cascadeShapeOf } from '../analysis/blast';
import { type CachingReport } from '../caching/caching.types';
import { type Criteria } from '../criteria/criteria.types';
import { formatBytes } from '../format/format.utils';
import { type Lang } from '../i18n/ui-strings';
import { cascadeExposure, EMPTY_SITUATION, invalidationsPerWeek } from '../situation/situation';
import { type Situation } from '../situation/situation.types';
import { type Finding } from './finding.types';
import { mono } from './finding-html';
import { TEXT } from './finding-text';

/**
 * How exposed this build is to the hash cascade, from its own topology.
 *
 * It needs no baseline, which is why it is not in the builder below: a single build already says
 * whether its names are concentrated in one small file or spread across every chunk.
 *
 * **It exists to stop a sentence being said.** "webpack does not have this problem" is the kind of
 * half-truth that ends a discussion: what webpack does is emit a runtime chunk, which works, and
 * which has to be tiny and inlined or the cost comes straight back. Stated as a topology instead
 * of a bundler name, the claim is checkable against any build, this one included.
 *
 * The topology says how far a change travels. How much that costs is a different question, and the
 * only answers to it are in `situation` — how often this deploys and how many people come back.
 * Without them the shape is described and the colour withheld, which is where this started.
 */
export const buildCascadeShapeFindings = (
    analysis: Analysis,
    lang: Lang,
    situation: Situation = EMPTY_SITUATION,
): Finding[] => {
    const shape = cascadeShapeOf(analysis);
    // Nothing to say about a build with no chunk that names several others: there is no shape yet.
    if (!shape.hub || shape.names < 2) {
        return [];
    }

    const exposure = cascadeExposure(situation);

    return [
        {
            // The severity of a cascade is decided by how often this deploys and how many visitors
            // return, and neither is knowable from a build folder — so with nobody having said, the
            // topology is named, the level is named, and the colour is not claimed. `high` risk
            // means "one leaf moves everything", not "this is bad for you".
            //
            // Somebody answering the two questions is what closes that gap, and it only ever closes
            // it upwards: a declared answer may raise this and may not lower it, which is why there
            // is no branch here taking `low` below `info`. The one that exists needs both halves —
            // a hub-and-spoke build that deploys twice a year costs nothing, and a flat one that
            // deploys hourly costs little.
            severity: exposure === 'high' && shape.risk === 'high' ? 'mid' : 'info',
            kind: 'cascadeShape',
            ...TEXT[lang].cascadeShape({
                risk: shape.risk,
                hub: shape.hub,
                names: shape.names,
                named: shape.named,
                size: formatBytes(shape.bytes),
                chunks: analysis.allChunks.length,
                exposure,
                perWeek: invalidationsPerWeek(situation),
            }),
        },
    ];
};

export const buildCachingFindings = (
    caching: CachingReport,
    lang: Lang,
    c: Criteria,
    situation: Situation = EMPTY_SITUATION,
): Finding[] => {
    const text = TEXT[lang];
    const findings: Finding[] = [];

    // 1 · What the update costs. The figure that does not exist anywhere else, and the one this
    //     whole group is for.
    const update = caching.update;
    if (update && update.bytes >= c.growthMinBytes) {
        const moved = [...update.changed, ...update.added];
        // The counterfactual, when the edges were there to work it out. Without it the percentage
        // is a number to be alarmed by; with it, it is a number that says where to look.
        const cascade = update.cascade;
        const exposure = cascadeExposure(situation);
        findings.push({
            // **The colour is withheld until somebody says, and the figure never is.**
            //
            // Whether half a build being re-downloaded is a problem depends on two facts nothing in
            // a build folder has: how often this deploys, and how many of the people opening it
            // tomorrow had it open today. Daily deploys to an audience that returns every morning
            // make this the most expensive line in the report; a quarterly release to first-time
            // visitors makes it irrelevant. Colouring it without those two facts would be picking
            // one of the two worlds at random, so with nobody having answered the fact is shown raw
            // and the copy says what would decide it.
            //
            // Those two facts are questions two and three, and this is the line they were for. Note
            // what the condition cannot do: `moderate` and `low` leave the severity exactly where
            // it was. An answer may raise this and may not lower it — otherwise the cheapest way to
            // a quiet report would be to answer the questions optimistically.
            //
            // `c` stays in the signature because the floor above still uses it: below what moves
            // between two builds anyway there is nothing to report at all.
            severity: exposure === 'high' ? 'mid' : 'info',
            kind: 'updateWeight',
            ...text.updateWeight({
                size: formatBytes(update.bytes),
                fresh: formatBytes(update.fresh),
                pct: Math.round(update.ratio * 100),
                reused: update.reused,
                count: moved.length,
                list: moved.map(file => `${mono(file.name)} (${formatBytes(file.bytes)})`).join(' · '),
                removed: update.removed.map(file => mono(file.name)).join(', '),
                roots: cascade?.roots.length ?? 0,
                rootSize: formatBytes(cascade?.rootBytes ?? 0),
                carried: cascade?.carried.length ?? 0,
                carriedSize: formatBytes(cascade?.carriedBytes ?? 0),
                rootList: (cascade?.roots ?? []).map(name => mono(name)).join(', '),
                exposure,
                perWeek: invalidationsPerWeek(situation),
            }),
        });
    }

    // 2 · The cause behind that symptom: a chunk holding both what changes and what does not.
    // The floor is the one that already means "smaller than what moves between two builds": what
    // this signal costs IS a re-download on every deploy, so below that it costs nothing at all.
    // Without it, a four-hundred-byte application with one chunk raises it, truthfully and uselessly.
    const unstable = caching.unstable;
    const wasted = unstable.reduce((sum, chunk) => sum + chunk.vendorBytes, 0);
    const worst = wasted >= c.growthMinBytes ? unstable[0] : undefined;
    if (worst) {
        findings.push({
            severity: worst.inBoot ? 'mid' : 'info',
            kind: 'unstableChunk',
            ...text.unstableChunk({
                count: unstable.length,
                name: worst.name,
                pct: Math.round(worst.vendorRatio * 100),
                size: formatBytes(wasted),
                inBoot: worst.inBoot,
                list: unstable
                    .map(
                        chunk =>
                            `${mono(chunk.name)} — ${Math.round(chunk.vendorRatio * 100)} % ${formatBytes(chunk.vendorBytes)}${chunk.inBoot ? ' (bootstrap)' : ''}`,
                    )
                    .join(' · '),
            }),
        });
    }

    // 3 · Names a browser cannot keep. Informative almost always; when it fires on something big
    //     the page asks for, every visit revalidates it.
    const unhashable = caching.unhashable;
    const first = unhashable[0];
    if (first) {
        const inPage = unhashable.filter(file => file.inPage);
        const bytes = inPage.reduce((sum, file) => sum + file.bytes, 0);
        findings.push({
            severity: bytes >= c.growthMinBytes || unhashable.some(file => file.reason === 'query') ? 'mid' : 'info',
            kind: 'unhashable',
            ...text.unhashable({
                count: unhashable.length,
                inPage: inPage.length,
                size: formatBytes(bytes),
                query: unhashable
                    .filter(file => file.reason === 'query')
                    .map(file => mono(file.path))
                    .join(', '),
                list: unhashable
                    .map(file => `${mono(file.path)} (${formatBytes(file.bytes)}${file.inPage ? ', in the page' : ''})`)
                    .join(' · '),
            }),
        });
    }

    return findings;
};
