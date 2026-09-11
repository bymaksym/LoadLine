/**
 * The two signals measured in requests instead of bytes.
 *
 * Every other figure in the report answers "how much comes down". These answer "in how many
 * pieces" and "in how many goes", which are different questions and the ones left when the bytes
 * are fine.
 *
 * **What the second one is NOT.** "Chunks under 30 kB are bad" is a bad rule. A 5 kB chunk for an admin screen
 * nobody opens is doing exactly its job: those 5 kB never download. Small is only a problem for
 * code that comes down **together**, so this counts what one screen loads at once — the bootstrap
 * plus what that screen pulls in — and never the build's chunk list.
 *
 * And it is deliberately conservative about the fix. The split is not a decision anybody took: the
 * bundler makes one chunk per distinct set of screens that reach a module, so many chunks means
 * many combinations of "these screens and not those use this". Merging them by hand is possible and
 * sometimes wrong — a big chunk mixing what changes with what does not is invalidated whole on
 * every deploy.
 */

import { type Analysis, type ScreenCost } from '../analysis/analysis.types';
import { type Criteria } from '../criteria/criteria.types';
import { baseName, formatBytes } from '../format/format.utils';
import { type Lang } from '../i18n/ui-strings';
import { type Finding } from './finding.types';
import { mono } from './finding-html';
import { TEXT } from './finding-text';

/** The middle screen, which is what "the typical screen" means everywhere else in the report. */
const median = <T>(list: T[]): T | undefined => list[Math.floor(list.length / 2)];

/**
 * Screens that arrive in several goes.
 *
 * The count itself has been a column of the screens table since the round trips were added; what
 * was missing was anything pointing at it. It is deliberately about the **deepest** screen rather
 * than an average: a chain is a property of one screen's imports, and averaging chains across a
 * report describes no screen that exists.
 *
 * Separate from the signal below on purpose. That one is about how many pieces come down, this one
 * about how many of them had to wait, and a build can easily have either without the other: two
 * files fetched together cost one trip, and two files where the second is only discovered by
 * parsing the first cost two.
 */
const slowScreenFindings = (analysis: Analysis, lang: Lang, c: Criteria): Finding[] => {
    const slow = analysis.screens.filter(screen => screen.waves >= c.screenWavesMax);
    const worst = slow.toSorted((a, b) => b.waves - a.waves || b.total - a.total)[0];
    if (!worst) {
        return [];
    }

    const named = (screen: ScreenCost): string => `${mono(screen.label)} (${screen.waves})`;

    return [
        {
            // Nothing here is downloaded that would not be downloaded anyway: the bytes are right
            // and the wait is not, which is worth a look and never worth stopping a build for.
            severity: 'mid',
            target: { tab: 'screens', key: worst.source },
            kind: 'slowScreens',
            ...TEXT[lang].slowScreens({
                count: slow.length,
                max: c.screenWavesMax,
                worstLabel: worst.label,
                worstWaves: worst.waves,
                // Depth on its own reads a chain and a fan-out as the same problem, and their
                // fixes are opposite: a chain shortens by flattening imports, a fan-out does not
                // shorten at all. The width is what tells the reader which of the two this is.
                worstWidth: worst.width,
                // The threshold as a formula rather than a number. A round trip is at least one
                // latency, whatever the protocol and whatever the compression, which is what makes
                // this the one figure here with a first principle behind it — so the finding shows
                // the arithmetic instead of asking anybody to take `3` on faith.
                latencyMs: c.latencyMs,
                worstMs: worst.waves * c.latencyMs,
                list: slow
                    .toSorted((a, b) => b.waves - a.waves)
                    .map(screen => named(screen))
                    .join(', '),
            }),
        },
    ];
};

/**
 * The size Rollup's own example uses for `experimentalMinChunkSize`, in raw bytes.
 *
 * It is quoted in the unit Rollup measures in — bytes before minification — and not converted,
 * because converting it would be the mistake this constant exists to avoid. Loadline's own crumb
 * line is 5 kB **gzip**, which is roughly 15 to 20 kB raw, so the two lines land in about the same
 * place; written side by side without saying which unit each is in, they read as a contradiction.
 */
const ROLLUP_MIN_CHUNK = 20 * 1024;

const manyFileFindings = (analysis: Analysis, lang: Lang, c: Criteria): Finding[] => {
    const typical = median(analysis.screens.toSorted((a, b) => a.files - b.files));
    if (!typical || typical.files <= c.screenFilesMax) {
        return [];
    }

    // Only what this screen downloads together. A tiny chunk somewhere else in the build is not
    // this signal's business: not downloading it is the reason it is lazy.
    const chunks = [...analysis.bootChunks, ...typical.ownChunks, ...typical.sharedChunks];
    const tiny = chunks.filter(file => (analysis.chunkOf(file)?.bytes ?? 0) < c.tinyChunkBytes);
    if (tiny.length < c.minTinyChunks) {
        return [];
    }

    const worst = analysis.screens.toSorted((a, b) => b.files - a.files)[0];
    // Raw bytes, because that is the unit the bundler option is written in. The tree carries the
    // size on disk per chunk; the report's own figure is compressed when a folder was loaded, and
    // comparing that against a raw threshold is how the two numbers came to disagree.
    const rawOf = new Map(
        analysis.tree.filter(node => node.kind === 'chunk').map(node => [node.id, node.rawBytes ?? node.bytes]),
    );
    const small = chunks.filter(file => (rawOf.get(file) ?? 0) < ROLLUP_MIN_CHUNK).length;

    return [
        {
            // Context, not a gate. Under HTTP/2 and HTTP/3 sixty well-sized files are fine and
            // sixty crumbs are not, and a count cannot tell the two apart — the granularity below
            // can, which is why that half is the headline and this one is the frame around it.
            // What raises this to a problem is evidence: `poolExhausted` fires when a measurement
            // shows the connection pool actually running out.
            severity: 'info',
            target: worst ? { tab: 'screens', key: worst.source } : undefined,
            kind: 'manyRequests',
            ...TEXT[lang].manyRequests({
                files: typical.files,
                tiny: tiny.length,
                tinySize: formatBytes(c.tinyChunkBytes),
                max: c.screenFilesMax,
                worstLabel: worst?.label ?? '',
                worstFiles: worst?.files ?? 0,
                small,
                smallSize: formatBytes(ROLLUP_MIN_CHUNK),
            }),
        },
    ];
};

/**
 * The first load in more than one go.
 *
 * The report has said this in the bootstrap panel for a while and it was never a signal, which is
 * the asymmetry worth fixing: a screen that arrives in three round trips gets a line telling you
 * so, and the first load — the one moment every visitor pays and the one nobody can skip — got a
 * sentence in a panel and nothing to act on. It is also the cheapest thing on this list to fix.
 *
 * There is no threshold on purpose. Every other signal here weighs something against a criterion,
 * because "how many files is too many" is a judgement; this one is structural. Either the page
 * names every chunk of the bootstrap or the browser has to parse one to discover another, and the
 * second is a round trip that buys nothing.
 *
 * **What it must not say.** This used to end in "add a `modulepreload` for each one", which is
 * advice that has made first paint worse in real projects: every tag competes for bandwidth with
 * the stylesheet that blocks rendering, and a page carrying dozens of them can paint later than
 * the same page carrying none. So the finding reports the two shapes separately — how many trips
 * deep the bootstrap is, and how many chunks share the next trip — and prices the tags instead of
 * prescribing them. The count of tags is part of the cost, not part of the fix.
 */
const bootWaveFindings = (analysis: Analysis, lang: Lang): Finding[] => {
    const startup = analysis.startup;
    if (!startup || startup.waves <= 1 || startup.discovered.length === 0) {
        return [];
    }

    return [
        {
            // The bytes are right and the wait is not: worth a line, never worth failing a build.
            severity: 'mid',
            target: { tab: 'boot', key: '' },
            kind: 'bootWaves',
            ...TEXT[lang].bootWaves({
                waves: startup.waves,
                count: startup.discovered.length,
                // How many are found on the very next trip. This is the number the advice is
                // allowed to ask for tags for: naming fewer than all of them shortens nothing,
                // and naming more than the bootstrap needs is the failure mode above.
                next: startup.byWave[0]?.length ?? startup.discovered.length,
                // Every chunk that arrives late, named — a list missing four of them is a change
                // somebody half applies and then measures as having done nothing.
                list: startup.discovered.map(chunk => mono(baseName(chunk))).join(', '),
                // The critical preload set, and its opposite. Naming a chunk that shares a trip
                // already being paid removes no wait and still competes for bandwidth with the
                // stylesheet, so saying which chunks NOT to name is half the advice.
                critical: startup.critical.map(chunk => mono(baseName(chunk))).join(' → '),
                criticalBytes: formatBytes(
                    startup.critical.reduce((sum, chunk) => sum + (analysis.chunkOf(chunk)?.bytes ?? 0), 0),
                ),
                // How many late chunks are not on that chain: a tag for each of these buys nothing.
                offPath: startup.discovered.filter(chunk => !startup.critical.includes(chunk)).length,
                width: startup.width,
            }),
        },
    ];
};

export const buildRequestFindings = (analysis: Analysis, lang: Lang, c: Criteria): Finding[] => [
    ...bootWaveFindings(analysis, lang),
    ...slowScreenFindings(analysis, lang, c),
    ...manyFileFindings(analysis, lang, c),
];
