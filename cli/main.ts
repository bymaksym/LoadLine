/**
 * The command itself: read the arguments, read the files, analyse, check the gates, print, and
 * return the exit code. Everything it does is in the modules around it; what this file owns is
 * the order and the exit code, which is the only part a pipeline actually reads.
 */

import { stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { type AssetReport } from '../src/app/core/assets/assets.types';
import { type Snapshot } from '../src/app/core/baseline/baseline.types';
import { writeConfig } from '../src/app/core/config/loadline-config';
import { declaredFromLock } from '../src/app/core/deps/pins';
import { summaryText } from '../src/app/core/export/summary';
import { setOwnership } from '../src/app/core/format/ownership';
import { UI } from '../src/app/core/i18n/ui';
import { repoPathsOf } from '../src/app/core/project/project-context';
import { type ProjectContext } from '../src/app/core/project/project-context.types';
import { errorMessage } from '../src/app/state/report-messages.utils';
import { parseArgs } from './args';
import { type Options } from './args.types';
import { anyGate, checkGates, mergeGates, uncheckedGates, unmatchedScreenLimits } from './gates';
import { branchOf, readLastRun, writeLastRun } from './memory';
import { readDeclared } from './read/declared';
import { locateBuild } from './read/locate';
import {
    InputError,
    isFolder,
    nearestPackageName,
    readBaseline,
    readCriteria,
    readDepsFiles,
    readDist,
    readProject,
    readStats,
} from './read/read-build';
import { type BuildInput } from './read/read-build.types';
import { readLoadlineConfig } from './read/read-config';
import { embedFolder, embedText, openFile, writeHtmlReport } from './render/html-report';
import { renderAgent } from './render/render-agent';
import { renderBadge } from './render/render-badge';
import { renderJson } from './render/render-json';
import { renderMarkdown } from './render/render-markdown';
import { renderPrComment } from './render/render-pr';
import { renderSarif } from './render/render-sarif';
import { renderText } from './render/render-text';
import { buildReport } from './report';
import { selfCheck } from './self-check';
import { sinceLastLine } from './since-last';
import { CLI_TEXT } from './text/text';
import { ERROR_TEXT } from './text/text-errors';
import { USAGE } from './text/usage';

/** The formats that print the `--what-if` answers. */
const WHAT_IF_FORMATS: ReadonlySet<Options['format']> = new Set(['text', 'summary', 'json', 'agent']);
/** And the `--why` ones: a chain of imports does not fit in a paste, so not the summary. */
const WHY_FORMATS: ReadonlySet<Options['format']> = new Set(['text', 'json', 'agent']);

/** 0 ran clean · 1 a gate broke · 2 the arguments or the files could not be used. */
export const OK = 0;
export const FAILED = 1;
export const UNUSABLE = 2;

/**
 * The build as the report names it: relative to where the command ran, with `/`. It ends up in the
 * exported baseline and in SARIF, which travel to other machines: an absolute `C:\Users\…` there
 * carried somebody's home folder into an artifact and read differently on a Linux runner.
 */
const portableName = (target: string): string => {
    const named = relative(process.cwd(), resolve(target)).replaceAll('\\', '/');
    return named === '' ? '.' : named;
};

/**
 * What went wrong, as a word a script can branch on: the analysis's own codes (`NO_PAGE`,
 * `NOT_ESM_GRAPH`…) as they were thrown, `input` for what the command was given, `unexpected` for
 * the rest. The sentence beside it is for people and changes with the language.
 */
const codeOf = (error: unknown): string => {
    if (error instanceof InputError) {
        return 'input';
    }
    return error instanceof Error && /^[A-Z][A-Z_]+$/.test(error.message) ? error.message : 'unexpected';
};

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
        throw new InputError(t => t.distTwice);
    }

    const folder = derive ? options.target : options.dist;
    // Before the folder: `build` of `loadline.json` says what the folder cannot say on its own.
    const configRead = await readLoadlineConfig(options.config, process.cwd(), options.lang);
    // Yours or theirs, for every path named from here on: the default unless the file says more.
    setOwnership(configRead.config?.build);
    // `--entry` adds to `build.entries`, for one run, what a file would say for every run.
    const said = configRead.config?.build;
    const build =
        options.entries.length > 0 ? { ...said, entries: [...(said?.entries ?? []), ...options.entries] } : said;
    const dist = folder ? await readDist(folder, derive, build) : NO_DIST;
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
        routes: dist.graph?.routes ?? null,
        statsName: portableName(options.target),
        packageName: await nearestPackageName(
            (await isFolder(options.target)) ? options.target : dirname(options.target),
        ),
        ...dist,
        config: configRead.config,
        configProblems: configRead.problems,
        configName: configRead.name,
        ...deps,
        declared: declared.size > 0 ? declared : null,
        assetSources: await assetSourcesOf(dist.assets, context, options.project),
        // Named after the file it was given as, which is the name the person knows: an export keeps
        // the name of the build it was made from, and "compared against dist/app/stats.json" read
        // as the wrong file when base.json is what was passed.
        baseline: options.baseline
            ? { ...(await readBaseline(options.baseline)), name: portableName(options.baseline) }
            : null,
        // Remembered only when nothing was asked for explicitly: a `--baseline` is a decision, the
        // memory is a convenience, and the two are never mixed in one report.
        ...(await lastRunOf(options)),
        context,
        criteria: options.criteria ? await readCriteria(options.criteria, options.lang) : null,
    };
};

/**
 * The build folder that would hold the `--html` page, if any. The next build empties that folder,
 * and the page somebody meant to keep — or to attach to an issue tomorrow — is gone with it.
 */
const buildFolderHolding = (html: string, options: Options): string | null => {
    const page = resolve(html);
    const folders = [options.dist, options.target].filter((folder): folder is string => !!folder);
    return (
        folders.find(folder => {
            const within = relative(resolve(folder), page);
            return within !== '' && !within.startsWith('..') && !isAbsolute(within);
        }) ?? null
    );
};

/**
 * The previous run of this build, and its branch when that is not the one checked out now: a run
 * on another branch is still worth comparing against, but not without saying so.
 */
const lastRunOf = async (options: Options): Promise<{ lastRun: Snapshot | null; lastRunBranch: string | null }> => {
    const last = options.cache && !options.baseline ? await readLastRun(process.cwd(), options.target) : null;
    if (!last) {
        return { lastRun: null, lastRunBranch: null };
    }
    const now = await branchOf(process.cwd());
    return { lastRun: last.snapshot, lastRunBranch: last.branch && last.branch !== now ? last.branch : null };
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
        // With `--entry` the file goes in as the run read it, below, or the page would not find the entry.
        options.entries.length > 0 ? null : options.config,
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
    if (options.entries.length > 0) {
        const { config } = await readLoadlineConfig(options.config, process.cwd(), options.lang);
        const entries = [...(config?.build?.entries ?? []), ...options.entries];
        texts.push({ name: 'loadline.json', text: writeConfig({ ...config, build: { ...config?.build, entries } }) });
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
        throw new InputError(t => t.growthNeedsBaseline);
    }
};

/**
 * `--print-config`: the `loadline.json` this run would use, with everything it extends joined in,
 * as a file that says it all itself. What `eslint --print-config` and `tsc --showConfig` are for:
 * the answer to "which threshold won?" without reading three files. It is also how the page gets
 * a configuration that extends another — the page has no disk to follow `extends` on, and this is
 * the file to drop on it instead. Sizes come out in bytes, which is what they are once read.
 */
const printConfig = async (options: Options): Promise<number> => {
    try {
        const read = await readLoadlineConfig(options.config, process.cwd(), options.lang);
        for (const problem of read.problems) {
            write(process.stderr, problem);
        }
        if (!read.config) {
            throw new InputError(t => t.noConfigToPrint);
        }
        write(process.stdout, writeConfig(read.config).trimEnd());
        write(process.stderr, CLI_TEXT[options.lang].configRead(read.name ?? ''));
        return OK;
    } catch (error) {
        if (error instanceof InputError) {
            write(process.stderr, error.say(ERROR_TEXT[options.lang]));
            return UNUSABLE;
        }
        throw error;
    }
};

export const run = async (argv: string[], version: string): Promise<number> => {
    const parsed = parseArgs(argv);
    if (!parsed.ok) {
        write(process.stderr, `${parsed.message}\n\n${ERROR_TEXT[parsed.lang].seeHelp}`);
        return UNUSABLE;
    }

    let options = parsed.options;
    if (options.help) {
        write(process.stdout, USAGE[options.lang]);
        return OK;
    }
    if (options.version) {
        write(process.stdout, `loadline ${version}`);
        return OK;
    }
    if (options.printConfig) {
        return printConfig(options);
    }

    try {
        requireBaseline(options);
        // The root of a build is enough: the metafile and the browser folder are found inside it.
        const located = await locateBuild(options.target, options.dist);
        options = { ...options, target: located.target, dist: located.dist };
        // On stderr: which build was chosen is said, without getting into what a script parses.
        if (located.others) {
            write(process.stderr, CLI_TEXT[options.lang].alsoFound(located.others.join(', ')));
        }
        const input = await readInputs(options);
        // The gates the file asks for, where the command line did not ask for that one. A flag typed
        // by hand is somebody overriding the committed decision on purpose, so it wins.
        const gates = mergeGates(options.gates, input.config ?? null);
        const report = buildReport(input, { ...options, gates });
        report.located = located.found;
        const unchecked = uncheckedGates(report, gates, options.gates);
        if (unchecked.refuse) {
            throw new InputError(unchecked.refuse);
        }

        // The self-check is about Loadline, not about the build, so it replaces the report rather
        // than being one more section of it — and it owns the exit code while it is asked for.
        if (options.selfCheck) {
            const checked = selfCheck(input.meta, report.analysis, input.announced, ERROR_TEXT[options.lang]);
            write(checked.ok ? process.stdout : process.stderr, checked.report);
            return checked.ok ? OK : checked.ran ? FAILED : UNUSABLE;
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
                throw new InputError(t => t.cannotWrite(options.export ?? '', failed));
            }
            write(process.stderr, CLI_TEXT[options.lang].exportWritten(options.export));
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
            agent: () => renderAgent(report, violations, asked),
            badge: () => renderBadge(report),
            summary: () =>
                summaryText({
                    analysis: report.analysis,
                    findings: report.findings,
                    comparison: report.comparison,
                    unit: report.unit,
                    // The project first, as the text report heads with it, and the build it was read from.
                    name: report.projectName ? `${report.projectName} (${report.statsName})` : report.statsName,
                    firstTrip: report.assets?.firstTrip.total ?? null,
                    lang: report.lang,
                    since: sinceLastLine(report),
                    whatIf: report.whatIf,
                    ...(asked && { gates: violations.map(violation => violation.message) }),
                }),
        };

        // `--what-if` is answered in text, summary and json. The other three are a document for
        // somebody else — a merge request, a code-scanning upload — and had nowhere to put it, so
        // the question used to go unanswered without a word. Now it says where to look.
        if (options.whatIf.length > 0 && !WHAT_IF_FORMATS.has(options.format)) {
            write(process.stderr, CLI_TEXT[options.lang].whatIfNotHere(options.format));
        }
        if (options.why.length > 0 && !WHY_FORMATS.has(options.format)) {
            write(process.stderr, CLI_TEXT[options.lang].whyNotHere(options.format));
        }

        // What is wrong with `loadline.json` goes to stderr, never into the report: something is
        // parsing stdout, and a warning in the middle of a SARIF document breaks it.
        // Each line already names its file: with `extends` there can be more than one.
        for (const problem of report.configProblems) {
            write(process.stderr, problem);
        }
        for (const line of [...unmatchedScreenLimits(report, gates), ...unchecked.skipped]) {
            write(process.stderr, line);
        }

        write(process.stdout, rendered[options.format]());

        // After the report, so a page that fails to write never costs the report somebody piped.
        if (options.html) {
            await writePage(options);
            write(process.stderr, CLI_TEXT[options.lang].htmlWritten(options.html));
            const inside = buildFolderHolding(options.html, options);
            if (inside) {
                write(process.stderr, CLI_TEXT[options.lang].htmlInsideBuild(inside));
            }
        }
        if (options.cache) {
            await writeLastRun(process.cwd(), options.target, report.snapshot, await branchOf(process.cwd()));
        }

        return violations.length > 0 ? FAILED : OK;
    } catch (error) {
        // The codes the analysis throws are translated with the same table the page uses; anything
        // else is printed as it came, because an unexpected failure should not be reworded.
        const message =
            error instanceof InputError ? error.say(ERROR_TEXT[options.lang]) : errorMessage(error, UI[options.lang]);
        write(process.stderr, message);
        // A step piping `--format json` into `jq` got an empty input and an error about that,
        // rather than the reason. The reason goes to stdout as well, in the shape it asked for.
        if (options.format === 'json') {
            write(
                process.stdout,
                JSON.stringify({ tool: 'loadline', ok: false, error: { code: codeOf(error), message } }),
            );
        }
        return UNUSABLE;
    }
};
