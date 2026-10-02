/**
 * The same package at two versions, each copy followed to whatever brings it in.
 *
 * Knowing there are two says nothing about what to do: the fix depends on where each one comes
 * from. A copy your own code imports is aligned in `package.json`; one a dependency brings is
 * forced with an override; and one a dependency **pins** to an exact version, a major away from the
 * other, cannot be moved from the project at all without changing that dependency — which is the
 * case the report used to answer with "force the resolution" and nothing else.
 */

import { type Analysis } from '../analysis/analysis.types';
import { type Declared, pinsOf } from '../deps/pins';
import { chainSteps, formatBytes } from '../format/format.utils';
import { type Lang } from '../i18n/ui-strings';
import { type Finding } from './finding.types';
import { chainHtml, mono } from './finding-html';
import { TEXT } from './finding-text';

export const buildDupesFindings = (analysis: Analysis, lang: Lang, declared: Declared | null): Finding[] => {
    const text = TEXT[lang];
    const firstDupe = analysis.duplicates[0];
    if (!firstDupe) {
        return [];
    }

    const pins = pinsOf(analysis.duplicates, declared);
    const allPins = [...pins.values()].flat();
    const parents = (apart: boolean): string | null => {
        const names = [...new Set(allPins.filter(pin => pin.majorApart === apart).map(pin => pin.parent))];
        return names.length > 0 ? names.map(name => mono(name)).join(', ') : null;
    };
    const list = analysis.duplicates
        .map(dupe => {
            const copies = dupe.copies
                .map(copy => {
                    const pin = (pins.get(dupe.name) ?? []).find(one => copy.viaPackages.includes(one.parent));
                    return text.dupeCopy({
                        version: copy.version,
                        under: copy.under,
                        size: formatBytes(copy.bytes),
                        zone: text.dupeZone[copy.zone],
                        chain: copy.chain ? chainHtml(chainSteps(copy.chain)) : null,
                        own: copy.importers.length > 0 ? copy.importers.map(file => mono(file)).join(', ') : null,
                        via: copy.viaPackages.length > 0 ? copy.viaPackages.map(pkg => mono(pkg)).join(', ') : null,
                        pinned: pin ? { parent: mono(pin.parent), range: mono(pin.range) } : null,
                    });
                })
                .join(' ');
            return `<strong>${dupe.name}</strong> — ${copies}`;
        })
        .join(' ');

    return [
        {
            severity: 'mid',
            target: { tab: 'search', key: firstDupe.name },
            kind: 'dupes',
            ...text.dupes({
                count: analysis.duplicates.length,
                list,
                viaDependency: analysis.duplicates.some(dupe => dupe.copies.some(copy => copy.importers.length === 0)),
                inBoot: analysis.duplicates.some(dupe => dupe.inBoot),
                pinnedApart: parents(true),
                pinnedSame: parents(false),
            }),
        },
    ];
};
