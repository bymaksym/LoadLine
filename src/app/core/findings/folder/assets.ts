/**
 * The signals about what the build folder holds besides JavaScript.
 *
 * They are the answer to the sentence at the top of `assets.ts`: nobody downloads JavaScript, they
 * download a page. Seven weights of one typeface to use two is a 300 kB finding that no bundle
 * analyser shows, because every one of them stops at the JavaScript.
 *
 * Nothing here promises a saving it cannot measure. "This PNG would be 310 kB in AVIF" is a number
 * nobody weighed; what is said is what the file weighs, what format it is in, and whether the
 * better version of it is already sitting in the same folder.
 */

import { type AssetReport } from '../../assets/assets.types';
import { type Criteria } from '../../criteria/criteria.types';
import { formatBytes } from '../../format/format.utils';
import { type Lang } from '../../i18n/ui-strings';
import { type Finding } from '../finding.types';
import { mono } from '../text/finding-html';
import { TEXT } from '../text/finding-text';

const named = (items: readonly string[]): string => items.map(item => mono(item)).join(', ');

/**
 * @param repoPaths where in the repository each unreferenced file comes from, when `angular.json`
 *                  copies it from an assets folder: build-folder path → repository path. Those are
 *                  not leftovers of an old deploy — Angular empties the output before every build
 *                  — and "clean the folder before building" is advice that changes nothing for them.
 * @param verified  whether those paths were checked on disk (the command) or only read off
 *                  `angular.json` (the page).
 */
export const buildAssetFindings = (
    assets: AssetReport,
    lang: Lang,
    c: Criteria,
    repoPaths: ReadonlyMap<string, string> | null = null,
    verified = false,
): Finding[] => {
    const text = TEXT[lang];
    const findings: Finding[] = [];

    // 1 · Fonts. The one place where "you are shipping the same face twice" is a fact rather than
    //     an opinion: both files are in the folder.
    const fonts = assets.fonts;
    const fontBytes = fonts.reduce((sum, family) => sum + family.bytes, 0);
    const superseded = fonts.flatMap(family => family.superseded);
    // Weights, not files: regular and bold in woff2 and ttf are two weights, and counting the
    // second format here would raise the card for the very files the title says nobody downloads.
    const manyWeights = fonts.filter(
        family => family.files.filter(file => !family.superseded.includes(file.name)).length > 2,
    );
    // What the superseded formats weigh. They are on the server and nobody downloads them — a
    // browser takes the first format of the list it understands — so they are said apart from
    // the total, which is a figure of the folder and not of a visit.
    const spare = new Set(superseded);
    const spareBytes = fonts
        .flatMap(family => family.files)
        .filter(file => spare.has(file.name))
        .reduce((sum, file) => sum + file.bytes, 0);
    if (fonts.length > 0 && (fontBytes >= c.shippedMinBytes || superseded.length > 0)) {
        findings.push({
            // A second format is clutter on the server, not bytes on the wire: on its own it is
            // context. Weights nobody uses are downloaded the moment a style asks for them.
            severity: manyWeights.length > 0 ? 'mid' : 'info',
            kind: 'fonts',
            size: fontBytes,
            ...text.fonts({
                families: fonts.length,
                files: fonts.reduce((sum, family) => sum + family.files.length, 0),
                size: formatBytes(fontBytes),
                spare: formatBytes(spareBytes),
                superseded: named(superseded),
                preloaded: named(fonts.flatMap(family => family.preloaded)),
                list: fonts
                    .map(
                        family =>
                            `${mono(family.name)} — ${text.fileCount(family.files.length)}, ${formatBytes(family.bytes)}, ${family.formats.join('/')}`,
                    )
                    .join(' · '),
            }),
        });
    }

    // 2 · Pictures and video. Named, weighed, and nothing recompressed.
    const media = assets.media;
    const mediaBytes = media.reduce((sum, file) => sum + file.bytes, 0);
    const outdated = media.filter(file => file.modernNeighbour);
    if (media.length > 0 && mediaBytes >= c.shippedMinBytes) {
        findings.push({
            severity: outdated.length > 0 ? 'mid' : 'info',
            kind: 'media',
            ...text.media({
                count: media.length,
                size: formatBytes(mediaBytes),
                inPage: media.filter(file => file.inPage).length,
                outdated: outdated.length,
                outdatedList: named(outdated.map(file => `${file.name} → .${file.modernNeighbour}`)),
                list: media
                    .map(
                        file =>
                            `${mono(file.name)} (${formatBytes(file.bytes)}${file.inPage ? `, ${text.inPage}` : ''})`,
                    )
                    .join(' · '),
            }),
        });
    }

    // 3 · The same file under two names. Only when the contents were compared: a list built from
    //     sizes alone would be a guess dressed as a finding.
    //     And what travels twice apart from what is only stored twice: a copy nothing names is never
    //     downloaded, and two copies with one of them named cost the deploy, not the visit.
    const listOf = (entries: typeof assets.duplicates): string =>
        entries.map(entry => `${named(entry.names)} (${formatBytes(entry.bytes)} ${text.each})`).join(' · ');
    const wastedBy = (entries: typeof assets.duplicates): number =>
        entries.reduce((sum, entry) => sum + entry.wasted, 0);
    const travels = assets.duplicates.filter(entry => entry.named === null || entry.named > 1);
    const stored = assets.duplicates.filter(entry => entry.named !== null && entry.named <= 1);
    const wasted = wastedBy(travels);
    if (assets.duplicates.length > 0) {
        findings.push({
            // A copy smaller than what moves between two builds is said, and is no work to plan.
            severity: wasted >= c.growthMinBytes ? 'mid' : 'info',
            kind: 'duplicateAssets',
            ...text.duplicateAssets({
                count: travels.length,
                size: formatBytes(wasted),
                list: listOf(travels),
                stored: {
                    count: stored.length,
                    size: formatBytes(wastedBy(stored)),
                    list: listOf(stored),
                    none: stored.every(entry => entry.named === 0),
                },
            }),
        });
    }

    // 3b · What the page fetches for a screen nobody has opened yet.
    //
    //      Not part of any first-load figure, on purpose — a prefetch is for the next navigation.
    //      But it is fetched on this visit: measured against a real Nuxt build, Chrome pulled all
    //      three prefetched chunks down during the first page load. That changes what the screens
    //      table means, because a screen the visitor already holds does not cost what the row says,
    //      and nothing in the report said a word about it.
    const prefetched = assets.prefetched;
    if (prefetched.length > 0) {
        findings.push({
            severity: assets.prefetchedBytes >= c.shippedMinBytes ? 'mid' : 'info',
            kind: 'prefetched',
            ...text.prefetched({
                count: prefetched.length,
                size: formatBytes(assets.prefetchedBytes),
                list: prefetched.map(file => `${mono(file.name)} (${formatBytes(file.bytes)})`).join(' · '),
            }),
        });
    }

    // 4 · What nothing in the folder names. The same idea as the `unreachable` signal, one level
    //     out: that one looks at chunks of JavaScript, this at everything else.
    const orphans = assets.unreferenced;
    const orphanBytes = orphans.reduce((sum, file) => sum + file.bytes, 0);
    if (assets.referencesRead && orphans.length > 0 && orphanBytes >= c.shippedMinBytes) {
        findings.push({
            severity: 'mid',
            kind: 'unreferencedAssets',
            ...text.unreferencedAssets({
                count: orphans.length,
                size: formatBytes(orphanBytes),
                list: orphans
                    .map(file => {
                        const repo = repoPaths?.get(file.path);
                        return `${mono(file.path)} (${formatBytes(file.bytes)}${repo ? ` ← ${mono(repo)}` : ''})`;
                    })
                    .join(' · '),
                fromRepo: orphans.filter(file => repoPaths?.has(file.path)).length,
                folders: [
                    ...new Set(
                        orphans
                            .map(file => repoPaths?.get(file.path)?.split('/').slice(0, -1).join('/') ?? null)
                            .filter((folder): folder is string => !!folder),
                    ),
                ]
                    .slice(0, 3)
                    .map(folder => mono(`${folder}/`))
                    .join(', '),
                verified,
            }),
        });
    }

    // 5 · Pictures hiding inside the figure that matters most. They cannot be deferred, they are
    //     not cached apart, and they appear in no list of assets anywhere.
    const inlined = assets.inlined;
    if (assets.inlinedBytes >= c.shippedMinBytes) {
        findings.push({
            severity: 'mid',
            kind: 'inlinedData',
            ...text.inlinedData({
                count: inlined.reduce((sum, row) => sum + row.count, 0),
                size: formatBytes(assets.inlinedBytes),
                types: [...new Set(inlined.flatMap(row => row.types))].join(', '),
                list: inlined.map(row => `${mono(row.chunk)} — ${row.count} (${formatBytes(row.bytes)})`).join(' · '),
            }),
        });
    }

    return findings;
};
