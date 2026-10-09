/**
 * What `ReportStore` does for the page, done once and returned: pick the unit, analyse, compare
 * against the baseline and put the signals in order. It calls the same functions in the same order,
 * so the terminal and the page cannot disagree about a build.
 */

import { analyze } from '../src/app/core/analysis/analysis';
import { type Analysis } from '../src/app/core/analysis/analysis.types';
import { configuredMarks } from '../src/app/core/analysis/screens/marks';
import { resolveSplits } from '../src/app/core/analysis/sourcemap/sourcemap';
import { withLateBoot } from '../src/app/core/assets/assets';
import { compare, snapshotOf } from '../src/app/core/baseline/baseline';
import { type Comparison } from '../src/app/core/baseline/baseline.types';
import { cachingOf } from '../src/app/core/caching/from-analysis';
import { applyAcceptances } from '../src/app/core/config/loadline-config';
import { type LoadlineConfig } from '../src/app/core/config/loadline-config.types';
import { RECOMMENDED } from '../src/app/core/criteria/criteria';
import { type Criteria, type Mode } from '../src/app/core/criteria/criteria.types';
import { readDeps } from '../src/app/core/deps/deps';
import { unitScale } from '../src/app/core/findings/actions';
import { buildFolderFindings } from '../src/app/core/findings/bundle/shipped';
import { composeFindings } from '../src/app/core/findings/compose';
import { type Finding } from '../src/app/core/findings/finding.types';
import { buildComparisonFindings, buildContextFindings, buildFindings } from '../src/app/core/findings/findings';
import { buildAssetFindings } from '../src/app/core/findings/folder/assets';
import { buildCachingFindings } from '../src/app/core/findings/folder/caching';
import { buildPageFindings } from '../src/app/core/findings/folder/page';
import { buildScanFindings } from '../src/app/core/findings/folder/scan';
import { buildDepsFindings } from '../src/app/core/findings/supplied/deps';
import { buildForbiddenFindings } from '../src/app/core/findings/supplied/forbidden';
import { buildSituationFindings } from '../src/app/core/findings/supplied/situation';
import { baseName, setNumberLang } from '../src/app/core/format/format.utils';
import { UI } from '../src/app/core/i18n/ui';
import { projectNameOf } from '../src/app/core/project/project-name';
import { scanBuild } from '../src/app/core/scan/scan';
import { EMPTY_SITUATION } from '../src/app/core/situation/situation';
import { simulateDefer } from '../src/app/core/whatif/defer';
import { importersInSources } from '../src/app/core/whatif/source-importers';
import { explainWhy } from '../src/app/core/whatif/why';
import { type Options } from './args.types';
import { InputError } from './read/read-build';
import { type BuildInput } from './read/read-build.types';
import { type CliReport } from './report.types';
import { type ErrorStrings } from './text/text-errors';

/**
 * Which figure the report is in. Brotli when the folder brought the `.br` files, gzip when it
 * brought the assets, raw otherwise. Asking for a unit the folder cannot give is an error rather
 * than a silent downgrade: a gate written for gzip and checked against raw bytes passes for a
 * reason that has nothing to do with the build.
 */
/**
 * The unit of the report: `--mode`, then the `mode` of `loadline.json`, then the best the folder
 * allows. The file's is not a label: its thresholds are written in it, and read in another unit a
 * `maxBoot` of 100 kB written in raw bytes passed a build of 110 kB raw because it was shown 43 kB
 * of gzip.
 */
const resolveMode = (input: BuildInput, typed: Mode | null): Mode => {
    const best: Mode = input.brotli ? 'brotli' : input.gzip ? 'gzip' : 'raw';
    const asked = typed ?? input.config?.mode ?? null;
    if (!asked) {
        return best;
    }
    const by = (t: ErrorStrings): string => (typed ? `--mode ${asked}` : t.modeInConfig(asked));
    if (asked === 'brotli' && !input.brotli) {
        throw new InputError(t => t.needsBrotli(by(t)));
    }
    if (asked === 'gzip' && !input.gzip) {
        throw new InputError(t => t.needsDist(by(t)));
    }

    return asked;
};

/**
 * The thresholds: the recommended ones for the unit, then `loadline.json`, then `--criteria`.
 *
 * That order is the one people expect and the one that makes the file useful: the committed file
 * is what the team agreed to, and a flag typed on a command line is somebody overriding it for one
 * run on purpose. The file's own `mode` is the report's unit unless `--mode` says otherwise (see
 * `resolveMode`), so the thresholds in it are read in the unit they were written in.
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
    const exact = resolveSplits(input.splits, Object.keys(input.meta.inputs));

    const lang = options.lang;
    const criteria = resolveCriteria(mode, input.config, input.criteria);
    // The language only decides the decimal separator, and it is set before anything is formatted.
    setNumberLang(lang);

    // What `build.screens` of `loadline.json` says is a screen or a piece of one: the page's buttons, written down.
    const marks = configuredMarks(input.config?.build?.screens, input.meta);
    const analysis = analyze(input.meta, sizes, exact, input.announced, marks, criteria, input.parallel, input.routes);
    // The same build in raw bytes, for comparing against a raw baseline while showing compressed
    // figures. It is the shown analysis itself when nothing is compressed, so it costs nothing then.
    const raw = sizes
        ? analyze(input.meta, null, exact, input.announced, marks, criteria, input.parallel, input.routes)
        : analysis;

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
    const caching = cachingOf(
        analysis,
        input.baseline,
        input.assets ?? null,
        new Set(input.announced),
        input.hrefs,
        sizes,
    );

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
        direct: new Set(input.context.pkg?.dependencies ?? input.lockDirect),
    });

    // The signals of this build alone, built once. They are what the comparison needs to say which
    // of them are new, what the snapshot carries so the *next* run can ask the same question, and
    // what composing puts in order. Built once because they were built twice and the two lists had
    // drifted: the one the snapshot kept was missing caching, scan and deps, so a `devLeftovers`
    // somebody had actually fixed could never show as gone, and a page export — which does carry
    // them — read as three signals fixed the moment the terminal compared against it.
    const base = buildFindings(analysis, lang, mode, criteria, situation, input.declared ?? null);
    // What `loadline.json` forbids goes with the project's own files: it is the team's rule, read
    // from the repository, like a budget in `angular.json`.
    const fromContext = [
        ...buildContextFindings(input.context, analysis, lang, criteria),
        ...buildForbiddenFindings(analysis, input.config?.forbidden, lang),
    ];
    const fromBuild = [
        ...buildFolderFindings(
            {
                sourceMaps: input.splits?.size ?? 0,
                derived: !!input.graph,
                screens: analysis.screens.map(s => s.label),
                drift: analysis.splitDrift,
                tool: analysis.tool,
            },
            lang,
        ),
        ...(input.assets ? buildAssetFindings(input.assets, lang, criteria, input.assetSources ?? null, true) : []),
        ...buildPageFindings(input.pageOrigins ?? null, lang),
        ...buildCachingFindings(caching, lang, criteria, situation, analysis.tool),
        ...(scan ? buildScanFindings(scan, lang, criteria, unitScale(analysis), analysis.tool) : []),
        ...buildDepsFindings(deps, lang, criteria, unitScale(analysis)),
    ];
    const own = [...base, ...fromContext, ...fromBuild];

    const { comparison, blocked } = comparisonOf(input, analysis, raw, mode, own);

    // The bootstrap chunks the page does not name are part of the first trip too, weighed with the
    // same figures the folder weighed the rest of it with.
    // In the unit of the report, which `--mode` may have made something other than the best one.
    const lateBoot = (analysis.startup?.discovered ?? []).map(
        chunk => sizes?.get(baseName(chunk)) ?? input.meta.outputs[chunk]?.bytes ?? 0,
    );
    const trip = input.firstTrips?.[mode] ?? input.assets?.firstTrip;
    const assets = input.assets && trip ? { ...input.assets, firstTrip: withLateBoot(trip, lateBoot) } : null;

    // This build as the next run's baseline. Written whether or not `--export` was asked for: it
    // costs a walk over lists that are already in memory, and having it here is what keeps the
    // exported file and the compared-against file the same shape by construction.
    const snapshot = snapshotOf(analysis, mode, input.statsName, new Date(), own);
    // The last run, when it was in the same unit: a gzip figure against a raw one would read as a
    // saving that never happened, which is the rule the explicit baseline follows too.
    const last = input.lastRun ?? null;
    const sinceLast = last?.mode === mode ? compare(snapshot, last) : null;

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
        assets,
        caching,
        scan,
        deps,
        // A folder read alone carries no file-to-file imports: see `DeferResult.measurable`.
        whatIf: options.whatIf.map(name => simulateDefer(analysis, name, !input.graph)),
        // A folder build says which chunk holds what and not who imports whom; the sources in its
        // maps do, which is what lets `--why` answer for a Vite or Nuxt build at all.
        why: options.why.map(name =>
            explainWhy(
                analysis,
                name,
                !input.graph,
                input.graph ? pkg => importersInSources(input.maps ?? [], pkg) : null,
            ),
        ),
        projectName: projectNameOf({
            packageName: input.context.pkg?.name ?? input.packageName,
            angularProject: input.context.angular?.project,
            pageTitle: input.pageTitle,
            folder: input.statsName,
        }),
        mode,
        unit: units[mode],
        lang,
        criteria,
        analysis,
        comparison,
        comparisonBlocked: blocked,
        baselineMode: input.baseline?.mode ?? null,
        sinceLast,
        sinceLastBranch: sinceLast ? (input.lastRunBranch ?? null) : null,
        located: [],
        findings: kept,
        accepted,
        config: input.config ?? null,
        configName: input.configName ?? null,
        configProblems: input.configProblems ?? [],
    };
};
