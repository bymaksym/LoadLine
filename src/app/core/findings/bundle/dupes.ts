/**
 * The same package at two versions, each copy followed to whatever brings it in.
 *
 * Knowing there are two says nothing about what to do: the fix depends on where each one comes
 * from. A copy your own code imports is aligned in `package.json`; one a dependency brings is
 * forced with an override; and one a dependency **pins** to an exact version, a major away from the
 * other, cannot be moved from the project at all without changing that dependency — which is the
 * case the report used to answer with "force the resolution" and nothing else.
 */

import { type Analysis } from '../../analysis/analysis.types';
import { type Declared, pinsOf } from '../../deps/pins';
import { type Lang } from '../../i18n/ui-strings';
import { formatSaving, unitScale } from '../actions';
import { type Finding } from '../finding.types';
import { chainHtmlOf, mono } from '../text/finding-html';
import { TEXT } from '../text/finding-text';

export const buildDupesFindings = (analysis: Analysis, lang: Lang, declared: Declared | null): Finding[] => {
    const text = TEXT[lang];
    const firstDupe = analysis.duplicates[0];
    if (!firstDupe) {
        return [];
    }

    // A copy's weight is its modules', raw: shown at the ratio the bootstrap compresses by.
    const scale = unitScale(analysis);
    const pins = pinsOf(analysis.duplicates, declared);
    const pinsFor = (dupes: readonly { name: string }[]) => dupes.flatMap(dupe => pins.get(dupe.name) ?? []);
    const parents = (dupes: readonly { name: string }[], apart: boolean): string | null => {
        const names = [
            ...new Set(
                pinsFor(dupes)
                    .filter(pin => pin.majorApart === apart)
                    .map(pin => pin.parent),
            ),
        ];
        return names.length > 0 ? names.map(name => mono(name)).join(', ') : null;
    };
    const names = (dupes: readonly { name: string }[]): string => dupes.map(dupe => mono(dupe.name)).join(', ');

    // Each package gets the advice that fits it, and every one of them is named: one sentence for the
    // whole card said "accept the signal and wait" of `idb` and nothing at all of `tslib`.
    const apart = analysis.duplicates.filter(dupe => (pins.get(dupe.name) ?? []).some(pin => pin.majorApart));
    const movable = analysis.duplicates.filter(dupe => !apart.includes(dupe));
    const viaDependency = movable.filter(dupe => dupe.copies.some(copy => copy.importers.length === 0));
    const direct = movable.filter(dupe => !viaDependency.includes(dupe));
    const list = analysis.duplicates
        .map(dupe => {
            const copies = dupe.copies
                .map(copy => {
                    const pin = (pins.get(dupe.name) ?? []).find(one => copy.viaPackages.includes(one.parent));
                    return text.dupeCopy({
                        version: copy.version,
                        under: copy.under,
                        size: formatSaving(copy.bytes, scale),
                        zone: text.dupeZone[copy.zone],
                        chain: copy.chain ? chainHtmlOf(copy.chain, analysis.lazyStep) : null,
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
            // When every copy is held a major apart by a parent, the card's own advice is to wait.
            ...(movable.length === 0 && { unfixable: true }),
            ...text.dupes({
                count: analysis.duplicates.length,
                list,
                viaDependency: analysis.duplicates.some(dupe => dupe.copies.some(copy => copy.importers.length === 0)),
                inBoot: analysis.duplicates.some(dupe => dupe.inBoot),
                apart: apart.length > 0 ? { packages: names(apart), parents: parents(apart, true) ?? '' } : null,
                override:
                    viaDependency.length > 0
                        ? { packages: names(viaDependency), pinnedSame: parents(viaDependency, false) }
                        : null,
                align: direct.length > 0 ? names(direct) : null,
            }),
        },
    ];
};
