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

import { type AssetReport } from '../assets/assets.types';
import { type Criteria } from '../criteria/criteria.types';
import { formatBytes } from '../format/format.utils';
import { type Lang } from '../i18n/ui-strings';
import { type Finding } from './finding.types';
import { mono } from './finding-html';
import { TEXT } from './finding-text';

const named = (items: readonly string[]): string => items.map(item => mono(item)).join(', ');

export const buildAssetFindings = (assets: AssetReport, lang: Lang, c: Criteria): Finding[] => {
    const text = TEXT[lang];
    const findings: Finding[] = [];

    // 1 · Fonts. The one place where "you are shipping the same face twice" is a fact rather than
    //     an opinion: both files are in the folder.
    const fonts = assets.fonts;
    const fontBytes = fonts.reduce((sum, family) => sum + family.bytes, 0);
    const superseded = fonts.flatMap(family => family.superseded);
    const manyWeights = fonts.filter(family => family.files.length > 2);
    if (fonts.length > 0 && (fontBytes >= c.shippedMinBytes || superseded.length > 0)) {
        findings.push({
            severity: superseded.length > 0 || manyWeights.length > 0 ? 'mid' : 'info',
            kind: 'fonts',
            ...text.fonts({
                families: fonts.length,
                files: fonts.reduce((sum, family) => sum + family.files.length, 0),
                size: formatBytes(fontBytes),
                superseded: named(superseded),
                preloaded: named(fonts.flatMap(family => family.preloaded)),
                list: fonts
                    .map(
                        family =>
                            `${mono(family.name)} — ${family.files.length} files, ${formatBytes(family.bytes)}, ${family.formats.join('/')}`,
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
                    .map(file => `${mono(file.name)} (${formatBytes(file.bytes)}${file.inPage ? ', in the page' : ''})`)
                    .join(' · '),
            }),
        });
    }

    // 3 · The same file under two names. Only when the contents were compared: a list built from
    //     sizes alone would be a guess dressed as a finding.
    const duplicates = assets.duplicates;
    const first = duplicates[0];
    if (first) {
        findings.push({
            severity: 'mid',
            kind: 'duplicateAssets',
            ...text.duplicateAssets({
                count: duplicates.length,
                size: formatBytes(duplicates.reduce((sum, entry) => sum + entry.wasted, 0)),
                list: duplicates.map(entry => `${named(entry.names)} (${formatBytes(entry.bytes)} each)`).join(' · '),
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
                list: orphans.map(file => `${mono(file.path)} (${formatBytes(file.bytes)})`).join(' · '),
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
