/** The shapes read from a project's own configuration files. */

export interface Budget {
    type: string;
    /** Bytes. `null` when not set or not resolvable (percentage budgets). */
    warning: number | null;
    error: number | null;
}

export interface BuildConfiguration {
    name: string;
    /** Only the budgets declared inside this configuration. Base ones are in `baseBudgets`. */
    budgets: Budget[];
}

export interface AngularContext {
    /** The application the budgets below belong to. */
    project: string;
    /**
     * Every application in the file, so a workspace with more than one can say which is being read
     * and let somebody pick another. Reading the first and saying nothing meant showing one app's
     * budgets while the metafile came from a different one.
     */
    applications: string[];
    /** Budgets in `build.options`: they apply to every configuration. */
    baseBudgets: Budget[];
    configurations: BuildConfiguration[];
    defaultConfiguration: string | null;
    /** Whether `zone.js` is in the polyfills. `null` when the file does not say. */
    zonePolyfill: boolean | null;
}

export interface PackageContext {
    /** The `name` field: the only place the project says what it is called. */
    name: string | null;
    scripts: Record<string, string>;
    /**
     * The names in `dependencies`: what the project asks for directly. Everything else in the
     * bundle came along with one of these, which changes what fixing it takes.
     */
    dependencies: string[];
    /** `zone.js` declared as a dependency. */
    zoneDependency: boolean;
    angularVersion: string | null;
}

export interface PipelineBuild {
    /** The job the command belongs to, when it could be told. */
    job: string | null;
    /** The command as written in the pipeline. */
    command: string;
    /** The command after resolving package scripts, when that changed anything. */
    resolved: string | null;
    /**
     * Configurations the command builds. Empty when it is `ng build` with no flag: then the
     * default configuration of `angular.json` applies.
     */
    configurations: string[];
    /** `true` when the script could not be followed to a build command. */
    unresolved: boolean;
}

/** Which CI writes the file. It only decides how it is described: the scan is the same for all. */
export type PipelineKind = 'gitlab' | 'github' | 'azure' | 'bitbucket' | 'circleci' | 'jenkins' | 'unknown';

export interface PipelineContext {
    file: string;
    kind: PipelineKind;
    builds: PipelineBuild[];
    /** Kept to read the file again once `package.json` arrives and the scripts can be followed. */
    text: string;
}

export interface ProjectContext {
    angular: AngularContext | null;
    pkg: PackageContext | null;
    pipelines: PipelineContext[];
}

export interface ConfigurationBudget {
    name: string;
    /** The initial budget that applies: the configuration's own, or the base one. */
    warning: number | null;
    error: number | null;
    hasBudget: boolean;
    /** Jobs of the pipeline building this configuration. Empty when no pipeline is loaded, too. */
    builtBy: string[];
}
