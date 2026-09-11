/**
 * The command itself: read the arguments, read the files, analyse, check the gates, print, and
 * return the exit code. Everything it does is in the modules around it; what this file owns is
 * the order and the exit code, which is the only part a pipeline actually reads.
 */

import { writeFile } from 'node:fs/promises';
import { summaryText } from '../src/app/core/export/summary';
import { UI } from '../src/app/core/i18n/ui';
import { errorMessage } from '../src/app/state/report-messages.utils';
import { parseArgs, USAGE } from './args';
import { type Options } from './args.types';
import { anyGate, checkGates, mergeGates } from './gates';
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

/** Everything off the disk, in one place, so the analysis starts with nothing left to fetch. */
const readInputs = async (options: Options): Promise<BuildInput> => {
    // A folder is the build itself, so it is both what is analysed and where the figures come from.
    const derive = await isFolder(options.target);
    if (derive && options.dist) {
        throw new InputError('--dist is the folder already being analysed; drop one of the two.');
    }

    const folder = derive ? options.target : options.dist;
    const dist = folder ? await readDist(folder, derive) : NO_DIST;

    return {
        meta: dist.graph ? dist.graph.meta : await readStats(options.target, UI[options.lang]),
        parallel: dist.graph?.parallel ?? null,
        statsName: options.target,
        ...dist,
        ...(await readLoadlineConfig(options.config, process.cwd()).then(read => ({
            config: read.config,
            configProblems: read.problems,
            configName: read.name,
        }))),
        ...(await readDepsFiles(options.lock, options.audit)),
        baseline: options.baseline ? await readBaseline(options.baseline) : null,
        context: options.project ? await readProject(options.project) : { angular: null, pkg: null, pipelines: [] },
        criteria: options.criteria ? await readCriteria(options.criteria) : null,
    };
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

    const options = parsed.options;
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
        const input = await readInputs(options);
        // The gates the file asks for, where the command line did not ask for that one. A flag typed
        // by hand is somebody overriding the committed decision on purpose, so it wins.
        const gates = mergeGates(options.gates, input.config ?? null);
        const report = buildReport(input, { ...options, gates });

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
        const color = options.color && process.stdout.isTTY === true && !process.env['NO_COLOR'];
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
                }),
        };

        // What is wrong with `loadline.json` goes to stderr, never into the report: something is
        // parsing stdout, and a warning in the middle of a SARIF document breaks it.
        for (const problem of report.configProblems) {
            write(process.stderr, CLI_TEXT[options.lang].configProblem(problem));
        }

        write(process.stdout, rendered[options.format]());
        return violations.length > 0 ? FAILED : OK;
    } catch (error) {
        // The codes the analysis throws are translated with the same table the page uses; anything
        // else is printed as it came, because an unexpected failure should not be reworded.
        const message = error instanceof InputError ? error.message : errorMessage(error, UI[options.lang]);
        write(process.stderr, message);
        return UNUSABLE;
    }
};
