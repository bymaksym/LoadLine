/**
 * The project context: what `angular.json`, `package.json` and the pipeline file say about size
 * budgets and about which configuration actually gets built.
 *
 * The metafile alone cannot answer "is there a budget, and does the pipeline enforce it?". These
 * three files can, and the answer is the failure that motivated the tool: a budget written into
 * a configuration the pipeline never compiles.
 *
 * No YAML parser: the pipeline file is scanned line by line for build commands. It is deliberately
 * tolerant, and every guess is reported with the command it came from so it can be checked.
 */

import {
    type AngularContext,
    type Budget,
    type ConfigurationBudget,
    type PackageContext,
    type PipelineBuild,
    type PipelineContext,
    type PipelineKind,
    type ProjectContext,
} from './project-context.types';

export const EMPTY_CONTEXT: ProjectContext = { angular: null, pkg: null, pipelines: [] };

const KB = 1024;

const UNITS: Record<string, number> = { b: 1, kb: KB, mb: KB * KB, gb: KB * KB * KB };

/**
 * A budget size as Angular CLI accepts it: `500kB`, `1.5MB`, `2mb`, a bare number of bytes.
 * Percentages (`25%`) refer to a baseline and cannot be turned into bytes here.
 */
export const parseSize = (value: unknown): number | null => {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== 'string') {
        return null;
    }

    const match = /^\s*(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?\s*$/i.exec(value);
    if (!match?.[1]) {
        return null;
    }

    const unit = UNITS[(match[2] ?? 'b').toLowerCase()] ?? 1;
    return Math.round(Number(match[1]) * unit);
};

interface RawBudget {
    type?: unknown;
    maximumWarning?: unknown;
    maximumError?: unknown;
}

const readBudgets = (value: unknown): Budget[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .filter((item): item is RawBudget => !!item && typeof item === 'object')
        .map(item => ({
            type: typeof item.type === 'string' ? item.type : 'unknown',
            warning: parseSize(item.maximumWarning),
            error: parseSize(item.maximumError),
        }));
};

/** The budgets that bound the initial download. `initial` is the one Angular CLI writes by default. */
export const isInitialBudget = (budget: Budget): boolean => budget.type === 'initial' || budget.type === 'all';

interface RawTarget {
    options?: { budgets?: unknown; polyfills?: unknown };
    configurations?: Record<string, { budgets?: unknown } | undefined>;
    defaultConfiguration?: unknown;
}

interface RawProject {
    projectType?: unknown;
    architect?: Record<string, RawTarget | undefined>;
    targets?: Record<string, RawTarget | undefined>;
}

const polyfillsHaveZone = (polyfills: unknown): boolean | null => {
    if (typeof polyfills === 'string') {
        return polyfills.includes('zone.js');
    }
    if (Array.isArray(polyfills)) {
        return polyfills.some(entry => typeof entry === 'string' && entry.includes('zone.js'));
    }
    return null;
};

/**
 * Reads one application of an `angular.json`, and lists the rest.
 *
 * @param pick which application to read. Without it the first one that is an application wins,
 *             which is a guess: in a workspace with three of them the budgets shown could belong
 *             to an app the metafile has nothing to do with. That is why every name comes back —
 *             so the report can say which one it read and offer the others.
 */
export const readAngularJson = (json: unknown, pick: string | null = null): AngularContext | null => {
    if (!json || typeof json !== 'object' || !('projects' in json)) {
        return null;
    }

    const projects = (json as { projects: unknown }).projects;
    if (!projects || typeof projects !== 'object') {
        return null;
    }

    const entries = Object.entries(projects as Record<string, RawProject>);
    const buildable = entries.filter(([, project]) => buildTargetOf(project));
    const applications = buildable.filter(([, project]) => project.projectType === 'application').map(([name]) => name);

    const chosen =
        buildable.find(([name]) => name === pick) ??
        buildable.find(([name, project]) => project.projectType === 'application' && applications.includes(name)) ??
        buildable[0];
    if (!chosen) {
        return null;
    }

    const [name, project] = chosen;
    const build = buildTargetOf(project);
    if (!build) {
        return null;
    }

    const configurations = Object.entries(build.configurations ?? {}).map(([configName, config]) => ({
        name: configName,
        budgets: readBudgets(config?.budgets),
    }));

    return {
        project: name,
        // A workspace of libraries only has no application: then every buildable project is the list.
        applications: applications.length > 0 ? applications : buildable.map(entry => entry[0]),
        baseBudgets: readBudgets(build.options?.budgets),
        configurations,
        defaultConfiguration: typeof build.defaultConfiguration === 'string' ? build.defaultConfiguration : null,
        zonePolyfill: polyfillsHaveZone(build.options?.polyfills),
    };
};

const buildTargetOf = (project: RawProject): RawTarget | undefined =>
    project.architect?.['build'] ?? project.targets?.['build'];

export const readPackageJson = (json: unknown): PackageContext | null => {
    if (!json || typeof json !== 'object') {
        return null;
    }

    const pkg = json as {
        name?: unknown;
        scripts?: Record<string, unknown>;
        dependencies?: Record<string, unknown>;
        devDependencies?: Record<string, unknown>;
    };
    const scripts: Record<string, string> = {};
    const declared = Object.entries(pkg.scripts ?? {});
    for (const [key, value] of declared) {
        if (typeof value === 'string') {
            scripts[key] = value;
        }
    }

    const deps = { ...pkg.devDependencies, ...pkg.dependencies };
    const angularVersion = deps['@angular/core'];

    return {
        name: typeof pkg.name === 'string' && pkg.name.trim() ? pkg.name.trim() : null,
        scripts,
        // What the project asks for by name. It is what tells a dependency you chose from one that
        // came along with something else, which changes the fix and not the weight.
        dependencies: Object.keys({ ...pkg.dependencies }),
        zoneDependency: 'zone.js' in deps,
        angularVersion: typeof angularVersion === 'string' ? angularVersion.replace(/^[\^~>=<\s]+/, '') : null,
    };
};

/**
 * Is the project zoneless? `angular.json` decides when it lists the polyfills; otherwise the
 * absence of `zone.js` in `package.json` does. `null` when neither file is loaded.
 */
export const isZoneless = (context: ProjectContext): boolean | null => {
    if (context.angular?.zonePolyfill !== null && context.angular?.zonePolyfill !== undefined) {
        return !context.angular.zonePolyfill;
    }
    if (context.pkg) {
        return !context.pkg.zoneDependency;
    }
    return null;
};

// --- Pipeline ---------------------------------------------------------------------------------

/**
 * A command that builds the application, however it is invoked (`npx`, `pnpm exec`, plain).
 *
 * `ng build` used to be the whole list, and a project that builds any other way came out as "could
 * not be followed" every single time — which reads as "your pipeline is odd" when what happened is
 * that the tool only knew one command. An Nx workspace, which is the common case among the projects
 * this is aimed at, never matched.
 *
 * Each entry captures whatever follows the command on the same line, which is where the flags that
 * name a configuration are.
 */
const BUILD_COMMANDS = [
    /\bng\s+build\b([^&|;]*)/,
    /\bnx\s+build\b([^&|;]*)/,
    /\bnx\s+run\s+[\w@/.:-]+:build[\w:-]*\b([^&|;]*)/,
    /\bvite\s+build\b([^&|;]*)/,
    /\brsbuild\s+build\b([^&|;]*)/,
    // esbuild has no `build` subcommand, so it is only recognised when it is being invoked with
    // flags. Matching the bare word would turn `pnpm add esbuild` into a build of the application.
    /\besbuild\s+([^&|;]*--[\w-][^&|;]*)/,
];

/** The flags of a build command, when one of them is a build command. `null` when none is. */
const buildFlagsIn = (command: string): string | null => {
    for (const pattern of BUILD_COMMANDS) {
        const found = pattern.exec(command);
        if (found) {
            return found[1] ?? '';
        }
    }

    return null;
};

/** `npm run x`, `pnpm run x`, `pnpm x`, `yarn x`, `yarn run x`, `npm run-script x`. */
const SCRIPT_CALL = /\b(?:npm\s+run(?:-script)?|pnpm\s+run|pnpm|yarn\s+run|yarn|bun\s+run|bun)\s+([\w:.-]+)/g;

/** Scripts that are the runner itself, not a project script. */
const NOT_SCRIPTS = new Set(['install', 'ci', 'i', 'exec', 'dlx', 'add', 'test', 'lint', 'audit', 'run', 'x']);

const configurationsOf = (buildArgs: string): string[] => {
    const configs: string[] = [];
    // `--configuration` and `-c` are Angular's and Nx's; `--mode` is what Vite calls the same thing.
    const flag = /(?:--configuration|--mode|-c)(?:=|\s+)([\w,.-]+)/g;
    let match: RegExpExecArray | null;
    while ((match = flag.exec(buildArgs)) !== null) {
        configs.push(...(match[1] ?? '').split(',').filter(Boolean));
    }
    if (/--prod\b/.test(buildArgs)) {
        configs.push('production');
    }
    return configs;
};

interface Resolution {
    resolved: string | null;
    configurations: string[];
    unresolved: boolean;
}

/**
 * Follows a command until it reaches a build, through the scripts of `package.json`:
 * `pnpm run build:pre` → `ng build --configuration=preproduction`.
 */
export const resolveBuildCommand = (
    command: string,
    scripts: Record<string, string> = {},
    depth = 0,
): Resolution | null => {
    const direct = buildFlagsIn(command);
    if (direct !== null) {
        return { resolved: null, configurations: configurationsOf(direct), unresolved: false };
    }

    if (depth > 5) {
        return { resolved: null, configurations: [], unresolved: true };
    }

    let sawScript = false;
    const calls = command.matchAll(SCRIPT_CALL);
    for (const match of calls) {
        const name = match[1] ?? '';
        if (NOT_SCRIPTS.has(name)) {
            continue;
        }

        sawScript = true;
        const script = scripts[name];
        if (!script) {
            continue;
        }

        const inner = resolveBuildCommand(script, scripts, depth + 1);
        if (inner && !inner.unresolved) {
            return { ...inner, resolved: inner.resolved ?? script };
        }
    }

    // A script that mentions "build" but cannot be followed still counts: the person should check it.
    return sawScript && /\bbuild\b/.test(command) ? { resolved: null, configurations: [], unresolved: true } : null;
};

/**
 * Which CI wrote the file. Only used to describe it: what gets scanned is the same either way, and
 * a file nobody recognises is still read line by line rather than skipped.
 */
const kindOf = (fileName: string, text: string): PipelineKind => {
    if (/gitlab-ci/.test(fileName)) {
        return 'gitlab';
    }
    if (/azure-pipelines/.test(fileName) || /^\s*vmImage:/m.test(text)) {
        return 'azure';
    }
    if (/bitbucket-pipelines/.test(fileName) || /^pipelines:/m.test(text)) {
        return 'bitbucket';
    }
    if (/circleci/.test(fileName) || /^workflows:/m.test(text)) {
        return 'circleci';
    }
    if (/jenkinsfile/i.test(fileName)) {
        return 'jenkins';
    }
    if (/^jobs:/m.test(text) && /runs-on:/.test(text)) {
        return 'github';
    }
    return /^stages:/m.test(text) ? 'gitlab' : 'unknown';
};

/**
 * Keys that structure a pipeline file rather than name a job. Without them the nearest key above a
 * command is `script:` or `steps:` in every format, which is a label nobody recognises as a job.
 */
const NOT_JOB_KEYS = new Set([
    'script',
    'before_script',
    'after_script',
    'steps',
    'step',
    'jobs',
    'stages',
    'stage',
    'pipelines',
    'branches',
    'default',
    'definitions',
    'run',
    'with',
    'env',
    'variables',
    'strategy',
    'matrix',
    'pool',
    'trigger',
    'workflows',
    'parallel',
]);

/**
 * The name of the job a line belongs to: the nearest bare key above it, indented less than the
 * command and not one of the structural words.
 *
 * It used to be the key at a fixed column — 0 for GitLab, 2 for GitHub — which is the same as
 * saying only those two formats have jobs. Every other CI came out with no job name at all, and
 * "built by (nothing)" is indistinguishable from "not built". Hidden GitLab templates
 * (`.build_template:`) still count: a build in a template runs in every job extending it.
 */
const jobOf = (lines: string[], index: number): string | null => {
    const indentOf = (line: string): number => line.length - line.trimStart().length;
    /** GitLab and GitHub name a job with a bare key: `build:` on its own line. */
    const key = /^(\s*)([\w.:$-]+):\s*(?:#.*)?$/;
    /** Azure and Bitbucket declare it as a list item that carries the name: `- job: BuildWeb`. */
    const item = /^(\s*)-\s*(?:job|deployment|stage):\s*([\w.:$-]+)\s*(?:#.*)?$/;
    let limit = indentOf(lines[index] ?? '');

    for (let i = index; i >= 0; i--) {
        const line = lines[i] ?? '';

        const declared = item.exec(line);
        if (declared && (declared[1] ?? '').length < limit) {
            return declared[2] ?? null;
        }

        const match = key.exec(line);
        if (!match || (match[1] ?? '').length >= limit) {
            continue;
        }

        const name = match[2] ?? '';
        if (!NOT_JOB_KEYS.has(name.toLowerCase())) {
            return name;
        }

        // A structural key still narrows the search: whatever names this job is further out.
        limit = (match[1] ?? '').length;
    }

    return null;
};

/**
 * Every build command found in a pipeline file, with the configuration it resolves to.
 * Comments are dropped first: a commented-out `ng build` is not a build.
 */
export const readPipeline = (fileName: string, text: string, scripts: Record<string, string> = {}): PipelineContext => {
    const kind = kindOf(fileName, text);
    const lines = text.split(/\r?\n/);
    const builds: PipelineBuild[] = [];

    for (const [index, rawLine] of lines.entries()) {
        const line = rawLine.replace(/\s#.*$/, '').replace(/^\s*#.*$/, '');
        if (!/\b(?:build|esbuild)\b/.test(line)) {
            continue;
        }

        // The command itself: after `- ` in a list, after the key that introduces it, or the whole
        // line. The keys are every CI's word for "run this": GitHub says `run`, GitLab `script`,
        // Azure `script`, Bitbucket lists them under `script` too, CircleCI says `command`.
        const command = line
            .replace(/^\s*-\s*/, '')
            .replace(/^\s*(?:run|script|before_script|after_script|commands?|steps?|bash|pwsh):\s*/, '')
            .trim();
        if (!command || /^[\w-]+:$/.test(command)) {
            continue;
        }

        const resolution = resolveBuildCommand(command, scripts);
        if (!resolution) {
            continue;
        }

        builds.push({ job: jobOf(lines, index), command, ...resolution });
    }

    return { file: fileName, kind, builds, text };
};

// --- What the context says, once put together ---------------------------------------------------

/**
 * One row per configuration: which initial budget applies to it and who builds it. `ng build`
 * with no flag builds the default configuration.
 */
export const configurationBudgets = (context: ProjectContext): ConfigurationBudget[] => {
    const angular = context.angular;
    if (!angular) {
        return [];
    }

    const base = angular.baseBudgets.find(budget => isInitialBudget(budget)) ?? null;
    const builtBy = new Map<string, string[]>();

    const register = (target: string, job: string): void => {
        if (!target) {
            return;
        }
        const jobs = builtBy.get(target) ?? [];
        if (!jobs.includes(job)) {
            jobs.push(job);
        }
        builtBy.set(target, jobs);
    };

    for (const pipeline of context.pipelines) {
        const followed = pipeline.builds.filter(build => !build.unresolved);
        for (const build of followed) {
            const targets =
                build.configurations.length > 0 ? build.configurations : [angular.defaultConfiguration ?? ''];
            for (const target of targets) {
                register(target, build.job ?? pipeline.file);
            }
        }
    }

    return angular.configurations.map(config => {
        const own = config.budgets.find(budget => isInitialBudget(budget)) ?? null;
        const budget = own ?? base;

        return {
            name: config.name,
            warning: budget?.warning ?? null,
            error: budget?.error ?? null,
            hasBudget: !!budget && (budget.warning !== null || budget.error !== null),
            builtBy: builtBy.get(config.name) ?? [],
        };
    });
};

/** Whether any pipeline loaded has at least one build command that could be followed. */
export const pipelineKnown = (context: ProjectContext): boolean =>
    context.pipelines.some(pipeline => pipeline.builds.some(build => !build.unresolved));
