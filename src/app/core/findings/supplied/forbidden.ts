/**
 * What `loadline.json` forbids, found in the build: one signal per rule that matches.
 *
 * Every other signal is this tool's opinion about a build. This one is the team's, written down in
 * `forbidden`, and the tool only says where the rule is broken and which import breaks it. That is
 * why it is high whatever the size: the team already decided it matters, and a 2 kB `moment` locale
 * breaks "no moment" exactly as much as the whole library does.
 *
 * The key of each signal is the rule as written — `moment`, `src/app/admin/*` — rather than what it
 * matched, so an acceptance names the same text the rule does.
 */

import { type Analysis, type ModuleEntry } from '../../analysis/analysis.types';
import { type ForbiddenRule } from '../../config/loadline-config.types';
import { chainSteps, formatBytes, matchesStars, namedBy } from '../../format/format.utils';
import { type Lang } from '../../i18n/ui-strings';
import { type Finding } from '../finding.types';
import { chainHtml, escapeHtml, mono } from '../text/finding-html';
import { TEXT } from '../text/finding-text';

/** Names listed on the card before "and N more": enough to recognise the rule, not a dump. */
const LISTED = 5;

const matches = (rule: ForbiddenRule, module: ModuleEntry): boolean =>
    rule.package === undefined
        ? !module.pkg && namedBy(rule.path ?? '', module.path)
        : !!module.pkg && matchesStars(rule.package, module.pkg);

export const buildForbiddenFindings = (
    analysis: Analysis,
    rules: readonly ForbiddenRule[] | undefined,
    lang: Lang,
): Finding[] => {
    if (!rules || rules.length === 0) {
        return [];
    }
    const insights = analysis.insights();

    return rules.flatMap(rule => {
        const inBoot = rule.in === 'bootstrap';
        const hits = analysis.modules
            .filter(module => matches(rule, module))
            .map(module => ({
                module,
                bytes: module.places
                    .filter(place => !inBoot || place.zone === 'boot')
                    .reduce((sum, place) => sum + place.bytes, 0),
            }))
            .filter(hit => hit.bytes > 0)
            .toSorted((a, b) => b.bytes - a.bytes);

        const first = hits[0];
        if (!first) {
            return [];
        }

        const key = rule.package ?? rule.path ?? '';
        const files = hits.map(hit => hit.module.path);
        const bytes = hits.reduce((sum, hit) => sum + hit.bytes, 0);
        const names = [...new Set(hits.map(hit => hit.module.pkg ?? hit.module.label))];
        const chain = analysis.chainTo(first.module.path);

        return [
            {
                severity: 'high',
                target: { tab: 'search', key },
                kind: 'forbidden',
                size: bytes,
                ...(inBoot && { saving: insights.exclusiveOf(files) }),
                sources: files,
                ...TEXT[lang].forbidden({
                    rule: key,
                    ruleHtml: mono(escapeHtml(key)),
                    inBoot,
                    why: escapeHtml(rule.why),
                    size: formatBytes(bytes),
                    names: names.slice(0, LISTED).map(name => mono(name)),
                    more: Math.max(0, names.length - LISTED),
                    chain: chain && chain.length > 1 ? chainHtml(chainSteps(chain)) : null,
                }),
            },
        ];
    });
};
