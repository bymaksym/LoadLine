import { describe, expect, it } from 'vitest';
import {
    configurationBudgets,
    EMPTY_CONTEXT,
    isZoneless,
    parseSize,
    pipelineKnown,
    readAngularJson,
    readPackageJson,
    readPipeline,
    resolveBuildCommand,
} from './project-context';

const KB = 1024;

/** The real case: budgets only in `production`, the pipeline builds `development` and `preproduction`. */
const angularJson = {
    projects: {
        app: {
            projectType: 'application',
            architect: {
                build: {
                    builder: '@angular/build:application',
                    options: { browser: 'src/main.ts', polyfills: ['zone.js'] },
                    configurations: {
                        production: {
                            budgets: [
                                { type: 'initial', maximumWarning: '1MB', maximumError: '1.5MB' },
                                { type: 'anyComponentStyle', maximumWarning: '10kB', maximumError: '15kB' },
                            ],
                        },
                        preproduction: {
                            budgets: [{ type: 'initial', maximumWarning: '500kB', maximumError: '3MB' }],
                        },
                        development: { optimization: false },
                        local: {},
                    },
                    defaultConfiguration: 'production',
                },
            },
        },
    },
};

const packageJson = {
    scripts: {
        build: 'ng build',
        'build:development': 'ng build --configuration=development',
        'build:pre': 'ng build --configuration=preproduction',
        'build:all': 'npm run build:pre',
        'build:loop': 'pnpm run build:loop',
    },
    dependencies: { '@angular/core': '^22.1.0' },
};

const gitlabCi = `
stages:
  - quality
  - build

quality:
  stage: quality
  script:
    - pnpm run typecheck
    # - pnpm run build:prod   (commented out: not a build)
    - pnpm run build:development

.build_template:
  stage: build
  before_script:
    - pnpm install --frozen-lockfile

build:pre:latest-master:
  extends: .build_template
  script:
    - pnpm run build:pre --base-href=/
`;

const githubWorkflow = `
name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npx ng build --configuration production
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: npm run build:all
`;

describe('parseSize', () => {
    it('reads the units Angular CLI accepts', () => {
        expect(parseSize('500kB')).toBe(500 * KB);
        expect(parseSize('1MB')).toBe(KB * KB);
        expect(parseSize('1.5mb')).toBe(1.5 * KB * KB);
        expect(parseSize('2048')).toBe(2048);
        expect(parseSize(4096)).toBe(4096);
    });

    it('gives up on percentages and rubbish', () => {
        expect(parseSize('25%')).toBeNull();
        expect(parseSize('big')).toBeNull();
        expect(parseSize(undefined)).toBeNull();
    });
});

describe('readAngularJson', () => {
    it('extracts the budgets of every configuration and the default one', () => {
        const angular = readAngularJson(angularJson);

        expect(angular?.project).toBe('app');
        expect(angular?.defaultConfiguration).toBe('production');
        expect(angular?.configurations.map(c => c.name)).toEqual([
            'production',
            'preproduction',
            'development',
            'local',
        ]);
        expect(angular?.configurations[0]?.budgets[0]).toEqual({
            type: 'initial',
            warning: KB * KB,
            error: 1.5 * KB * KB,
        });
        expect(angular?.zonePolyfill).toBe(true);
    });

    it('rejects anything that is not an angular.json', () => {
        expect(readAngularJson({ outputs: {} })).toBeNull();
        expect(readAngularJson(null)).toBeNull();
    });
});

describe('resolveBuildCommand', () => {
    const scripts = packageJson.scripts;

    it('reads the configuration straight from ng build', () => {
        expect(resolveBuildCommand('ng build --configuration=production')?.configurations).toEqual(['production']);
        expect(resolveBuildCommand('npx ng build -c staging')?.configurations).toEqual(['staging']);
        expect(resolveBuildCommand('ng build --configuration a,b')?.configurations).toEqual(['a', 'b']);
        expect(resolveBuildCommand('ng build --prod')?.configurations).toEqual(['production']);
    });

    it('an ng build with no flag builds the default configuration: empty list', () => {
        expect(resolveBuildCommand('ng build')?.configurations).toEqual([]);
    });

    it('follows package scripts, including one script calling another', () => {
        const pre = resolveBuildCommand('pnpm run build:pre --base-href=/', scripts);
        expect(pre?.configurations).toEqual(['preproduction']);
        expect(pre?.resolved).toBe('ng build --configuration=preproduction');

        expect(resolveBuildCommand('npm run build:all', scripts)?.configurations).toEqual(['preproduction']);
    });

    it('does not loop on a script calling itself, and says it could not follow it', () => {
        expect(resolveBuildCommand('pnpm run build:loop', scripts)?.unresolved).toBe(true);
    });

    it('ignores commands that are not builds', () => {
        expect(resolveBuildCommand('pnpm install --frozen-lockfile', scripts)).toBeNull();
        expect(resolveBuildCommand('pnpm run typecheck', scripts)).toBeNull();
        // `esbuild` on its own is a dependency being installed, not a build being run.
        expect(resolveBuildCommand('pnpm add -D esbuild', scripts)).toBeNull();
    });

    it('reads the other ways a project builds, not only ng', () => {
        // Only `ng build` matched, so an Nx workspace came out as "could not be followed" every
        // time — which reads as a finding about the pipeline rather than a gap in the tool.
        expect(resolveBuildCommand('nx build web --configuration=production')?.configurations).toEqual(['production']);
        expect(resolveBuildCommand('npx nx run web:build --configuration=staging')?.configurations).toEqual([
            'staging',
        ]);
        // Vite calls the same thing `--mode`.
        expect(resolveBuildCommand('vite build --mode staging')?.configurations).toEqual(['staging']);
        expect(resolveBuildCommand('esbuild src/main.ts --bundle --outdir=dist')?.unresolved).toBe(false);
    });
});

describe('readPipeline', () => {
    it('finds the GitLab build commands with their job, skipping comments and templates', () => {
        const pipeline = readPipeline('.gitlab-ci.yml', gitlabCi, packageJson.scripts);

        expect(pipeline.kind).toBe('gitlab');
        expect(pipeline.builds.map(b => [b.job, b.configurations])).toEqual([
            ['quality', ['development']],
            ['build:pre:latest-master', ['preproduction']],
        ]);
    });

    it('finds GitHub Actions builds under their job', () => {
        const pipeline = readPipeline('ci.yml', githubWorkflow, packageJson.scripts);

        expect(pipeline.kind).toBe('github');
        expect(pipeline.builds.map(b => [b.job, b.configurations])).toEqual([
            ['build', ['production']],
            ['deploy', ['preproduction']],
        ]);
    });

    it('names the job in a CI it has never seen, instead of leaving it blank', () => {
        // The job name used to be the key at a fixed column — 0 for GitLab, 2 for GitHub — which is
        // the same as saying only those two have jobs. "built by (nothing)" then reads exactly like
        // "not built", which is the finding this whole file exists to raise.
        const azure = [
            'trigger:',
            '  - main',
            'jobs:',
            '  - job: BuildWeb',
            '    pool:',
            '      vmImage: ubuntu-latest',
            '    steps:',
            '      - script: ng build --configuration=production',
        ].join('\n');

        const pipeline = readPipeline('azure-pipelines.yml', azure);
        expect(pipeline.kind).toBe('azure');
        expect(pipeline.builds.map(b => [b.job, b.configurations])).toEqual([['BuildWeb', ['production']]]);
    });

    it('a file that is not a pipeline says so: no kind and nothing built', () => {
        const compose = ['services:', '  web:', '    image: nginx', '    ports:', '      - 8080:80'].join('\n');
        const pipeline = readPipeline('docker-compose.yml', compose);

        expect(pipeline.kind).toBe('unknown');
        expect(pipeline.builds).toEqual([]);
    });
});

describe('configurationBudgets', () => {
    it('crosses budgets with what the pipeline builds: the budget lives where nobody builds', () => {
        const context = {
            angular: readAngularJson(angularJson),
            pkg: readPackageJson(packageJson),
            pipelines: [readPipeline('.gitlab-ci.yml', gitlabCi, packageJson.scripts)],
        };
        const rows = configurationBudgets(context);

        expect(pipelineKnown(context)).toBe(true);
        expect(rows.find(r => r.name === 'production')).toMatchObject({ hasBudget: true, builtBy: [] });
        expect(rows.find(r => r.name === 'development')).toMatchObject({ hasBudget: false, builtBy: ['quality'] });
        expect(rows.find(r => r.name === 'preproduction')).toMatchObject({
            hasBudget: true,
            error: 3 * KB * KB,
            builtBy: ['build:pre:latest-master'],
        });
    });

    it('an ng build with no flag counts for the default configuration, and base budgets for all', () => {
        const angular = readAngularJson({
            projects: {
                app: {
                    projectType: 'application',
                    architect: {
                        build: {
                            options: { budgets: [{ type: 'initial', maximumError: '1MB' }] },
                            configurations: { production: {}, development: {} },
                            defaultConfiguration: 'production',
                        },
                    },
                },
            },
        });
        const rows = configurationBudgets({
            angular,
            pkg: null,
            pipelines: [readPipeline('ci.yml', 'jobs:\n  build:\n    runs-on: x\n    steps:\n      - run: ng build\n')],
        });

        expect(rows.every(r => r.hasBudget && r.error === KB * KB)).toBe(true);
        expect(rows.find(r => r.name === 'production')?.builtBy).toEqual(['build']);
    });
});

describe('isZoneless', () => {
    it('angular.json decides when it lists the polyfills; package.json otherwise', () => {
        expect(isZoneless({ ...EMPTY_CONTEXT, angular: readAngularJson(angularJson) })).toBe(false);
        expect(isZoneless({ ...EMPTY_CONTEXT, pkg: readPackageJson(packageJson) })).toBe(true);
        expect(isZoneless({ ...EMPTY_CONTEXT, pkg: readPackageJson({ dependencies: { 'zone.js': '1' } }) })).toBe(
            false,
        );
        expect(isZoneless(EMPTY_CONTEXT)).toBeNull();
    });
});
