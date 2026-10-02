/**
 * The command itself: read the arguments, read the files, analyse, check the gates, print, and
 * return the exit code. Everything it does is in the modules around it; what this file owns is
 * the order and the exit code, which is the only part a pipeline actually reads.
 */

import { stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { type AssetReport } from '../src/app/core/assets/assets.types';
import { declaredFromLock } from '../src/app/core/deps/pins';
import { summaryText } from '../src/app/core/export/summary';
import { UI } from '../src/app/core/i18n/ui';
import { repoPathsOf } from '../src/app/core/project/project-context';
import { type ProjectContext } from '../src/app/core/project/project-context.types';
import { errorMessage } from '../src/app/state/report-messages.utils';
import { parseArgs, USAGE } from './args';
import { type Options } from './args.types';
import { readDeclared } from './declared';
import { anyGate, checkGates, mergeGates } from './gates';
import { embedFolder, embedText, openFile, writeHtmlReport } from './html-report';
import { locateBuild } from './locate';
import { readLastRun, writeLastRun } from './memory';
import {
    InputError,
    isFolder,
    readBaseline,
    readCriteria,
    readDepsFiles,
    readDist,
    readLoadlineConfig,
    readProject,
    readStats,
} from './read-build';
import { type BuildInput } from './read-build.types';
import { renderJson } from './render-json';
import { renderMarkdown } from './render-markdown';
import { renderPrComment } from './render-pr';
import { renderSarif } from './render-sarif';
import { renderText } from './render-text';
import { buildReport } from './report';
import { selfCheck } from './self-check';
import { sinceLastLine } from './since-last';
import { CLI_TEXT } from './text';

/** 0 ran clean · 1 a gate broke · 2 the arguments or the files could not be used. */
export const OK = 0;
export const FAILED = 1;
export const UNUSABLE = 2;

const write = (stream: NodeJS.WriteStream, value: string): void => {
    stream.write(`${value}\n`);
};

const NO_DIST = {
    gzip: null,
    brotli: null,
    splits: null,
    announced: null,
    graph: null,
    pageCss: null,
    assets: null,
    hrefs: [],
    texts: new Map<string, string>(),
    maps: [],
};

const fileExists = async (path: string): Promise<boolean> => {
    try {
        const info = await stat(path);
        return info.isFile();
    } catch {
        return false;
    }
};

/**
 * Where each file nothing names lives in the repository, when `angular.json` copies it from an
 * assets folder **and it is really there**. The page can only say "comes from"; the command looks.
 */
const assetSourcesOf = async (
    assets: AssetReport | null | undefined,
    context: ProjectContext,
    project: string | null,
): Promise<Map<string, string> | null> => {
    const folders = context.angular?.assetFolders ?? [];
    if (!assets || !project || folders.length === 0) {
        return null;
    }

    const found = new Map<string, string>();
    const mapped = repoPathsOf(assets.unreferenced, folders);
    const pairs = [...(mapped ?? [])];
    for (const [path, repo] of pairs) {
        if (await fileExists(join(project, repo))) {
            found.set(path, repo);
        }
    }
    return found;
};

/** Everything off the disk, in one place, so the analysis starts with nothing left to fetch. */
const readInputs = async (options: Options): Promise<BuildInput> => {
    // A folder is the build itself, so it is both what is analysed and where the figures come from.
    const derive = await isFolder(options.target);
    if (derive && options.dist) {
        throw new InputError('--dist is the folder already being analysed; drop one of the two.');
    }

    const folder = derive ? options.target : options.dist;
    const dist = folder ? await readDist(folder, derive) : NO_DIST;
    const meta = dist.graph ? dist.graph.meta : await readStats(options.target, UI[options.lang]);
    const deps = await readDepsFiles(options.lock, options.audit);
    const context = options.project ? await readProject(options.project) : { angular: null, pkg: null, pipelines: [] };

    // The ranges each package declares. A lock file of npm or yarn records them; pnpm's does not,
    // and then the `package.json` files in `node_modules` are read — only when a lock file or a
    // project folder says where the install is, since that is where the metafile's paths start.
    const installRoot = options.project ?? (options.lock ? dirname(options.lock) : null);
    const declared = new Map(declaredFromLock(deps.lock));
    if (installRoot && (options.lock || options.project)) {
        const fromDisk = await readDeclared(meta, installRoot);
        for (const [name, ranges] of fromDisk) {
            declared.set(name, { ...ranges, ...declared.get(name) });
        }
    }

    return {
        meta,
        parallel: dist.graph?.parallel ?? null,
        statsName: options.target,
        ...dist,
        ...(await readLoadlineConfig(options.config, process.cwd()).then(read => ({
            config: read.config,
            configProblems: read.problems,
            configName: read.name,
        }))),
        ...deps,
        declared: declared.size > 0 ? declared : null,
        assetSources: await assetSourcesOf(dist.assets, context, options.project),
        baseline: options.baseline ? await readBaseline(options.baseline) : null,
        // Remembered only when nothing was asked for explicitly: a `--baseline` is a decision, the
        // memory is a convenience, and the two are never mixed in one report.
        lastRun: options.cache && !options.baseline ? await readLastRun(process.cwd(), options.target) : null,
        context,
        criteria: options.criteria ? await readCriteria(options.criteria) : null,
    };
};

/** The files the page needs to rebuild this report on its own, read once more as they are. */
const writePage = async (options: Options): Promise<void> => {
    if (!options.html) {
        return;
    }

    const derive = await isFolder(options.target);
    const folder = derive ? options.target : options.dist;
    const extras = [
        options.project ? join(options.project, 'angular.json') : null,
        options.project ? join(options.project, 'package.json') : null,
        options.lock,
        options.audit,
        options.config,
    ];
    const texts = [];
    for (const path of extras) {
        if (!(path && (await fileExists(path)))) {
            continue;
        }

        const text = await embedText(path);
        if (text) {
            texts.push(text);
        }
    }

    await writeHtmlReport(options.html, {
        version: 1,
        lang: options.lang,
        stats: derive ? null : await embedText(options.target),
        folder: folder ? await embedFolder(folder) : null,
        extras: texts,
        baseline: await embedText(options.baseline),
    });
    if (options.open) {
        openFile(resolve(options.html));
    }
};

/**
 * A growth gate with nothing to grow against would pass every build, quietly, forever. Saying so
 * beats a green pipeline that checks nothing.
 */
const requireBaseline = (options: Options): void => {
    const wantsGrowth = options.gates.maxGrowth !== null || options.gates.maxGrowthRatio !== null;
    if (wantsGrowth && !options.baseline) {
        throw new InputError('--max-growth and --max-growth-pct need a --baseline to compare against.');
    }
};

export const run = async (argv: string[], version: string): Promise<number> => {
    const parsed = parseArgs(argv);
    if (!parsed.ok) {
        write(process.stderr, `${parsed.message}\n\nRun loadline --help to see the options.`);
        return UNUSABLE;
    }

    let options = parsed.options;
    if (options.help) {
        write(process.stdout, USAGE);
        return OK;
    }
    if (options.version) {
        write(process.stdout, `loadline ${version}`);
        return OK;
    }

    try {
        requireBaseline(options);
        // The root of a build is enough: the metafile and the browser folder are found inside it.
        const located = await locateBuild(options.target, options.dist);
        options = { ...options, target: located.target, dist: located.dist };
        const input = await readInputs(options);
        // The gates the file asks for, where the command line did not ask for that one. A flag typed
        // by hand is somebody overriding the committed decision on purpose, so it wins.
        const gates = mergeGates(options.gates, input.config ?? null);
        const report = buildReport(input, { ...options, gates });
        report.located = located.found;

        // The self-check is about Loadline, not about the build, so it replaces the report rather
        // than being one more section of it — and it owns the exit code while it is asked for.
        if (options.selfCheck) {
            const checked = selfCheck(input.meta, report.analysis, input.announced);
            write(checked.ok ? process.stdout : process.stderr, checked.report);
            return checked.ok ? OK : FAILED;
        }

        // Before the gates: a build that broke one is still the build that was made, and a
        // pipeline that only writes the baseline when it is under budget would compare tomorrow
        // against whichever green build came last rather than against yesterday.
        if (options.export) {
            // The message comes off the error as it is. `errorMessage` translates the codes the
            // *analysis* throws and ends every one of them with "what is expected is the stats.json
            // ng build --stats-json writes" — which, bolted onto a directory that does not exist,
            // sends somebody to check the file that was read fine.
            const failed = await writeFile(options.export, JSON.stringify(report.snapshot, null, 2), 'utf8').catch(
                (error: unknown) => (error instanceof Error ? error.message : String(error)),
            );
            if (failed) {
                throw new InputError(`Could not write ${options.export}: ${failed}`);
            }
        }

        const asked = anyGate(gates);
        const violations = checkGates(report, gates);

        // Colour is for a person watching a terminal; a redirected stream is a file or a log.
        const color = options.color && process.stdout.isTTY && !process.env['NO_COLOR'];
        const rendered: Record<Options['format'], () => string> = {
            text: () => renderText(report, violations, asked, color),
            json: () => renderJson(report, violations, asked),
            markdown: () => renderMarkdown(report, violations, asked),
            'pr-comment': () => renderPrComment(report, violations, asked),
            sarif: () => renderSarif(report),
            summary: () =>
                summaryText({
                    analysis: report.analysis,
                    findings: report.findings,
                    comparison: report.comparison,
                    unit: report.unit,
                    name: report.statsName,
                    firstTrip: report.assets?.firstTrip.total ?? null,
                    lang: report.lang,
                    since: sinceLastLine(report),
                }),
        };

        // What is wrong with `loadline.json` goes to stderr, never into the report: something is
        // parsing stdout, and a warning in the middle of a SARIF document breaks it.
        for (const problem of report.configProblems) {
            write(process.stderr, CLI_TEXT[options.lang].configProblem(problem));
        }

        write(process.stdout, rendered[options.format]());

        // After the report, so a page that fails to write never costs the report somebody piped.
        if (options.html) {
            await writePage(options);
            write(process.stderr, CLI_TEXT[options.lang].htmlWritten(options.html));
        }
        if (options.cache) {
            await writeLastRun(process.cwd(), options.target, report.snapshot);
        }

        return violations.length > 0 ? FAILED : OK;
    } catch (error) {
        // The codes the analysis throws are translated with the same table the page uses; anything
        // else is printed as it came, because an unexpected failure should not be reworded.
        const message = error instanceof InputError ? error.message : errorMessage(error, UI[options.lang]);
        write(process.stderr, message);
        return UNUSABLE;
    }
};
