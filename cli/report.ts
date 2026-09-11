/**
 * What `ReportStore` does for the page, done once and returned: pick the unit, analyse, compare
 * against the baseline and put the signals in order. It calls the same functions in the same order,
 * so the terminal and the page cannot disagree about a build.
 */

import { analyze } from '../src/app/core/analysis/analysis';
import { type Analysis } from '../src/app/core/analysis/analysis.types';
import { resolveSplits } from '../src/app/core/analysis/sourcemap';
import { compare, snapshotOf } from '../src/app/core/baseline/baseline';
import { type Comparison } from '../src/app/core/baseline/baseline.types';
import { cachingOf } from '../src/app/core/caching/from-analysis';
import { applyAcceptances } from '../src/app/core/config/loadline-config';
import { type LoadlineConfig } from '../src/app/core/config/loadline-config.types';
import { RECOMMENDED } from '../src/app/core/criteria/criteria';
import { type Criteria, type Mode } from '../src/app/core/criteria/criteria.types';
import { readDeps } from '../src/app/core/deps/deps';
import { buildAssetFindings } from '../src/app/core/findings/assets';
import { buildCachingFindings } from '../src/app/core/findings/caching';
import { composeFindings } from '../src/app/core/findings/compose';
import { buildDepsFindings } from '../src/app/core/findings/deps';
import { type Finding } from '../src/app/core/findings/finding.types';
import { buildComparisonFindings, buildContextFindings, buildFindings } from '../src/app/core/findings/findings';
import { buildPageFindings } from '../src/app/core/findings/page';
import { buildScanFindings } from '../src/app/core/findings/scan';
import { buildFolderFindings } from '../src/app/core/findings/shipped';
import { buildSituationFindings } from '../src/app/core/findings/situation';
import { setNumberLang } from '../src/app/core/format/format.utils';
import { UI } from '../src/app/core/i18n/ui';
import { scanBuild } from '../src/app/core/scan/scan';
import { EMPTY_SITUATION } from '../src/app/core/situation/situation';
import { simulateDefer } from '../src/app/core/whatif/defer';
import { type Options } from './args.types';
import { InputError } from './read-build';
import { type BuildInput } from './read-build.types';
import { type CliReport } from './report.types';

/**
 * Which figure the report is in. Brotli when the folder brought the `.br` files, gzip when it
 * brought the assets, raw otherwise. Asking for a unit the folder cannot give is an error rather
 * than a silent downgrade: a gate written for gzip and checked against raw bytes passes for a
 * reason that has nothing to do with the build.
 */
const resolveMode = (input: BuildInput, asked: Mode | null): Mode => {
    const best: Mode = input.brotli ? 'brotli' : input.gzip ? 'gzip' : 'raw';
    if (!asked) {
        return best;
    }
    if (asked === 'brotli' && !input.brotli) {
        throw new InputError('--mode brotli needs the .js.br files of the build in --dist.');
    }
    if (asked === 'gzip' && !input.gzip) {
        throw new InputError('--mode gzip needs the build folder in --dist.');
    }

    return asked;
};

/**
 * The thresholds: the recommended ones for the unit, then `loadline.json`, then `--criteria`.
 *
 * That order is the one people expect and the one that makes the file useful: the committed file
 * is what the team agreed to, and a flag typed on a command line is somebody overriding it for one
 * run on purpose. The file's own `mode` is not checked against the report's, because a threshold
 * written in gzip and applied to raw bytes is a real mismatch and the report already has a signal
 * for that shape of mistake elsewhere; here it would only be a second place to look.
 */
const resolveCriteria = (
    mode: Mode,
    config: LoadlineConfig | null | undefined,
    overrides: Partial<Criteria> | null,
): Criteria => ({
    ...RECOMMENDED[mode],
    ...config?.criteria,
    ...overrides,
});

/**
 * Raw compares against a raw analysis; a compressed baseline only against the same compression,
 * because gzip against brotli would read as a saving that never happened.
 */
const comparisonOf = (
    input: BuildInput,
    shown: Analysis,
    raw: Analysis,
    mode: Mode,
    findings: readonly Finding[],
): { comparison: Comparison | null; blocked: boolean } => {
    const baseline = input.baseline;
    if (!baseline) {
        return { comparison: null, blocked: false };
    }
    if (baseline.mode !== 'raw' && baseline.mode !== mode) {
        return { comparison: null, blocked: true };
    }

    const against = baseline.mode === 'raw' ? raw : shown;
    // The signals go into the snapshot so the comparison can say which of them are new and which
    // went away. They are the ones from this build alone: the comparison's own signals do not exist
    // yet, and a signal about a comparison is not a property of the build being compared.
    const current = snapshotOf(against, baseline.mode, input.statsName, new Date(), findings);
    return { comparison: compare(current, baseline), blocked: false };
};

export const buildReport = (input: BuildInput, options: Options): CliReport => {
    const mode = resolveMode(input, options.mode);
    const sizes = mode === 'brotli' ? input.brotli : mode === 'gzip' ? input.gzip : null;
    const exact = resolveSplits(input.splits, Object.keys(input.meta.inputs ?? {}));

    const lang = options.lang;
    const criteria = resolveCriteria(mode, input.config, input.criteria);
    // The language only decides the decimal separator, and it is set before anything is formatted.
    setNumberLang(lang);

    const analysis = analyze(input.meta, sizes, exact, input.announced, null, criteria, input.parallel);
    // The same build in raw bytes, for comparing against a raw baseline while showing compressed
    // figures. It is the shown analysis itself when nothing is compressed, so it costs nothing then.
    const raw = sizes ? analyze(input.meta, null, exact, input.announced, null, criteria, input.parallel) : analysis;

    // What the team answered about itself, out of the committed file. Unlike a measurement, this
    // half of the context does reach the terminal: it is the same for everybody who runs the
    // command, which is exactly why it lives in `loadline.json` rather than in a browser.
    const situation = input.config?.situation ?? EMPTY_SITUATION;

    const strings = UI[lang];
    const units: Record<Mode, string> = {
        raw: strings.unitRaw,
        gzip: strings.unitGzip,
        brotli: strings.unitBrotli,
    };

    const pageCss = input.pageCss;
    const cssBytes = pageCss ? (mode === 'brotli' ? (pageCss.brotli ?? pageCss.gzip) : pageCss[mode]) : null;

    // What an update costs. It needs the baseline's file names, which only a snapshot carrying them
    // has; without one the delta is absent and the other two caching figures still come out.
    const caching = cachingOf(analysis, input.baseline, input.assets ?? null, new Set(input.announced), input.hrefs);

    // What the text of the build says, and what the two dependency files say about what ships. Both
    // are empty rather than absent when nothing was given: `null` inside them says which.
    const scan =
        (input.texts?.size ?? 0) > 0
            ? scanBuild({
                  texts: input.texts ?? new Map(),
                  modules: analysis.modules,
                  boot: new Set(analysis.bootChunks),
                  maps: input.maps ?? [],
              })
            : null;
    const deps = readDeps({
        lock: input.lock ?? null,
        advisories: input.advisories ?? null,
        modules: analysis.modules,
        boot: new Set(analysis.bootChunks),
        direct: new Set(input.context.pkg?.dependencies),
    });

    // The signals of this build alone, built once. They are what the comparison needs to say which
    // of them are new, what the snapshot carries so the *next* run can ask the same question, and
    // what composing puts in order. Built once because they were built twice and the two lists had
    // drifted: the one the snapshot kept was missing caching, scan and deps, so a `devLeftovers`
    // somebody had actually fixed could never show as gone, and a page export — which does carry
    // them — read as three signals fixed the moment the terminal compared against it.
    const base = buildFindings(analysis, lang, mode, criteria, situation);
    const fromContext = buildContextFindings(input.context, analysis, lang, criteria);
    const fromBuild = [
        ...buildFolderFindings(
            {
                sourceMaps: input.splits?.size ?? 0,
                derived: !!input.graph,
                screens: analysis.screens.map(s => s.label),
                drift: analysis.splitDrift,
            },
            lang,
        ),
        ...(input.assets ? buildAssetFindings(input.assets, lang, criteria) : []),
        ...buildPageFindings(input.pageOrigins ?? null, lang),
        ...buildCachingFindings(caching, lang, criteria, situation),
        ...(scan ? buildScanFindings(scan, lang, criteria) : []),
        ...buildDepsFindings(deps, lang, criteria),
    ];
    const own = [...base, ...fromContext, ...fromBuild];

    const { comparison, blocked } = comparisonOf(input, analysis, raw, mode, own);

    // This build as the next run's baseline. Written whether or not `--export` was asked for: it
    // costs a walk over lists that are already in memory, and having it here is what keeps the
    // exported file and the compared-against file the same shape by construction.
    const snapshot = snapshotOf(analysis, mode, input.statsName, new Date(), own);

    const composed = composeFindings({
        base,
        fromComparison: comparison ? buildComparisonFindings(comparison, lang, criteria) : [],
        fromContext,
        // Nothing measures a browser in a pipeline: that half of the report is the page's.
        fromMeasurement: [],
        fromBuild,
    });

    // Read after everything else and appended rather than composed in, because they are about the
    // list itself: which question is worth asking is decided by which signals came out, and the
    // card that names the unanswered ones would be boilerplate on every report if it were not.
    // They are all context, so the end of the list is where composing would have put them anyway.
    const withSituation = [...composed, ...buildSituationFindings(situation, composed, lang, criteria)];
    // What the team decided to live with is set aside here, once, so the gates, the ranking and
    // every renderer see the same list. An acceptance that ran out stays in it.
    const { kept, accepted } = applyAcceptances(withSituation, input.config ?? null);

    return {
        statsName: input.statsName,
        snapshot,
        pageCssBytes: cssBytes,
        pageCssRawBytes: pageCss?.raw ?? null,
        pageCssFiles: pageCss?.files.length ?? 0,
        assets: input.assets ?? null,
        caching,
        scan,
        deps,
        whatIf: options.whatIf.map(name => simulateDefer(analysis, name)),
        projectName: input.context.pkg?.name ?? input.context.angular?.project ?? null,
        mode,
        unit: units[mode],
        lang,
        criteria,
        analysis,
        comparison,
        comparisonBlocked: blocked,
        findings: kept,
        accepted,
        config: input.config ?? null,
        configName: input.configName ?? null,
        configProblems: input.configProblems ?? [],
    };
};
