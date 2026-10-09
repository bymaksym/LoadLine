/**
 * A package in the bootstrap that one file of the project imports, and that file is code everybody
 * runs rather than a screen.
 *
 * `bootLazy` covers the case where that one importer is a lazy screen. This is the other one, and
 * the one that came up in the field: Teams, Firebase and ua-parser-js each in the bootstrap of one
 * application, each imported by a single service, and the only way to see it was to read the list
 * of importers row by row. One importer is an address — one place to decide whether the package is
 * needed before the first paint or only when something happens — and that is the whole signal.
 */

import { type Analysis } from '../../analysis/analysis.types';
import { type Criteria } from '../../criteria/criteria.types';
import { baseName, formatBytes } from '../../format/format.utils';
import { type Lang } from '../../i18n/ui-strings';
import { type Finding } from '../finding.types';
import { mono } from '../text/finding-html';
import { TEXT } from '../text/finding-text';

/**
 * Packages a bootstrap needs by definition: the framework, its runtime and the helpers every file
 * compiles against. One file importing `@angular/platform-browser` is `main.ts` starting the app,
 * not a candidate for deferring.
 */
const FRAMEWORK = /^(?:@angular\/|zone\.js$|tslib$|rxjs$|react$|react-dom$|vue$|@vue\/|svelte$|preact$|solid-js$)/;

/**
 * The files the application starts from, and the root component it renders first. Whatever they
 * import is on the path to the first paint by construction: an icon library the shell imports is
 * drawn before anything else, and calling it a candidate for deferring was the first false positive
 * this signal produced, on the example build.
 */
const ENTRY_FILE = /(?:^|\/)(?:(?:main|polyfills|index)(?:\.[\w-]+)?|app(?:\.component)?)\.[cm]?[jt]sx?$/;

/**
 * @param skip packages another signal already names, so the same package is not two cards.
 */
export const buildBootSingleFindings = (
    analysis: Analysis,
    lang: Lang,
    c: Criteria,
    skip: ReadonlySet<string>,
): Finding[] => {
    const insights = analysis.insights();
    const filesOf = (bucket: string): string[] => insights.filesByBucket.get(bucket) ?? [];
    const screens = new Set(analysis.screens.map(screen => screen.source));

    const single = analysis.bootBuckets
        .filter(bucket => !bucket.isProjectCode && bucket.bytes >= c.bootPackageMinBytes)
        .filter(bucket => !skip.has(bucket.name) && !FRAMEWORK.test(bucket.name))
        .map(bucket => ({ bucket, importers: [...(analysis.packageImporters.get(bucket.name) ?? [])] }))
        .filter(({ importers }) => {
            const [only] = importers;
            return importers.length === 1 && !!only && !screens.has(only) && !ENTRY_FILE.test(only);
        })
        .map(({ bucket, importers }) => ({
            name: bucket.name,
            bytes: bucket.bytes,
            importer: importers[0] ?? '',
            saving: insights.exclusive.get(bucket.name) ?? 0,
        }))
        .toSorted((a, b) => b.saving - a.saving || b.bytes - a.bytes);

    const first = single[0];
    if (!first) {
        return [];
    }

    const files = single.flatMap(entry => filesOf(entry.name));
    return [
        {
            severity: 'mid',
            target: { tab: 'boot', key: first.name },
            kind: 'bootSingle',
            saving: insights.exclusiveOf(files),
            sources: files,
            ...TEXT[lang].bootSingle({
                count: single.length,
                pkg: first.name,
                importer: baseName(first.importer),
                size: formatBytes(single.reduce((sum, entry) => sum + entry.bytes, 0)),
                list: single
                    .map(entry => `${mono(entry.name)} (${formatBytes(entry.bytes)}) ← ${mono(entry.importer)}`)
                    .join(' · '),
            }),
        },
    ];
};
