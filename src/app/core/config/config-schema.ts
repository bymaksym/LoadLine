/**
 * `loadline.schema.json`, built from the code that reads the file.
 *
 * An editor that knows the schema completes every key, says what it does on hover and underlines a
 * typo before anybody runs anything — which is what makes a configuration file intuitive rather than
 * something looked up in a README. It is generated, never written by hand, for the reason every
 * reference drifts: the thresholds, their units, their recommended values, the signals and the five
 * questions all live in the code already, and a second copy would be wrong by the next release.
 * `cli/config-files.spec.ts` writes it to the repository root and fails when it is out of date.
 */

import { CRITERIA_FIELDS, RECOMMENDED } from '../criteria/criteria';
import { type Criteria, type Unit } from '../criteria/criteria.types';
import { FINDING_KINDS, type FindingKind } from '../findings/finding.types';
import { KIND_NAMES as SIGNAL_NAMES } from '../findings/kind-names';
import { UI } from '../i18n/ui';
import { QUESTIONS } from '../situation/situation';
import { SCHEMA_URL, UNIT_OF } from './config-values';

/** What each signal is, in the words its card uses: what `accepted` can name, described on hover. */
export const KIND_NAMES: Record<FindingKind, string> = SIGNAL_NAMES.en;

/** `"350kB"`, `"1.5MB"`, `"900B"`: the spellings the reader accepts, case and all. */
const SIZE_PATTERN = String.raw`^\s*\d+(\.\d+)?\s*([bB]|[kK][bB]|[mM][bB]|[gG][bB])\s*$`;
const SHARE_PATTERN = String.raw`^\s*\d+(\.\d+)?\s*%\s*$`;

type Schema = Record<string, unknown>;

const size = (description: string): Schema => ({
    description,
    anyOf: [
        { type: 'string', pattern: SIZE_PATTERN },
        { type: 'number', minimum: 1000, description: 'Bytes.' },
    ],
});

/** A size as somebody would write it: `"170kB"`, `"1MB"`, `"1.5MB"`. */
const written = (bytes: number): string =>
    bytes >= 1024 * 1024 ? `${Number((bytes / 1024 / 1024).toFixed(2))}MB` : `${Number((bytes / 1024).toFixed(1))}kB`;

const UNIT_WORDS: Record<Unit, string> = {
    kb: 'A size: "170kB", "1.5MB", or bytes.',
    pct: 'A share: "25%", or the fraction 0.25.',
    x: 'A factor: 3 means three times.',
    files: 'A number of files.',
    chunks: 'A number of chunks.',
    screens: 'A number of screens.',
    langs: 'A number of languages.',
    importers: 'A number of importing files.',
    trips: 'A number of round trips.',
    ms: 'Milliseconds.',
};

/** Which end of a pair a key is: the good threshold, the bad one, or neither. */
const PAIR_END = new Map(
    CRITERIA_FIELDS.flatMap(field =>
        field.pairWith ? [[field.key, 'ok'] as const, [field.pairWith, 'bad'] as const] : [],
    ),
);

/** One criterion in words, for the schema and the reference alike. */
export const criterionText = (
    key: keyof Criteria,
): { what: string; unit: string; recommended: { gzip: string; brotli: string; raw: string } } => {
    const unit = UNIT_OF.get(key) ?? 'x';
    const en = UI.en;
    const end = PAIR_END.get(key);
    const label =
        end === 'ok'
            ? `${en.critLabel[key]}: good up to this.`
            : end === 'bad'
              ? `${en.critLabel[key]}: bad above this.`
              : `${en.critLabel[key]}.`;
    const show = (value: number): string =>
        unit === 'kb' ? `"${written(value)}"` : unit === 'pct' ? `"${Math.round(value * 100)}%"` : String(value);
    return {
        what: [label, en.critHelp[key]].filter(Boolean).join(' '),
        unit: UNIT_WORDS[unit],
        recommended: {
            gzip: show(RECOMMENDED.gzip[key]),
            brotli: show(RECOMMENDED.brotli[key]),
            raw: show(RECOMMENDED.raw[key]),
        },
    };
};

const criterion = (key: keyof Criteria): Schema => {
    const unit = UNIT_OF.get(key) ?? 'x';
    const { what, unit: words, recommended } = criterionText(key);
    const values = new Set(Object.values(recommended));
    const rec =
        values.size === 1
            ? `Recommended: ${recommended.gzip}.`
            : `Recommended: ${recommended.gzip} in gzip, ${recommended.brotli} in brotli, ${recommended.raw} raw.`;
    const description = `${what} ${words} ${rec}`;
    if (unit === 'kb') {
        return size(description);
    }
    if (unit === 'pct') {
        return {
            description,
            anyOf: [
                { type: 'string', pattern: SHARE_PATTERN },
                { type: 'number', minimum: 0, maximum: 1 },
            ],
        };
    }
    return { description, type: 'number', minimum: 0 };
};

const criteriaSchema = (): Schema => {
    const keys = CRITERIA_FIELDS.flatMap(field => (field.pairWith ? [field.key, field.pairWith] : [field.key]));
    return {
        description:
            'Thresholds that colour the figures and decide when a signal fires. They never fail a build — gates do. ' +
            'Anything left out keeps its recommended value. Every rated figure has two: up to the first (…Ok) it is ' +
            'good, up to the second (…Bad) fair, above that bad.',
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(keys.map(key => [key, criterion(key)])),
    };
};

const gatesSchema = (): Schema => ({
    description:
        'What fails the command (exit code 1) and so the pipeline. A flag on the command line wins over the same ' +
        'gate here. Without any gate the command reports and never fails.',
    type: 'object',
    additionalProperties: false,
    properties: {
        maxBoot: size('Fail when the bootstrap — what downloads before anything appears — is over this.'),
        maxScreen: size('Fail when what a screen downloads in total is over this. "screens" overrides it per screen.'),
        maxOwn: size('Fail when the code only one screen loads is over this.'),
        maxGrowth: size('With a baseline: fail when the bootstrap or a screen grows by more than this.'),
        maxGrowthPct: {
            description: 'With a baseline: the same as maxGrowth, as a percentage. 10 or "10%" mean ten per cent.',
            anyOf: [
                { type: 'number', minimum: 0 },
                { type: 'string', pattern: SHARE_PATTERN },
            ],
        },
        failOn: {
            description: 'Fail when a signal of this severity or above is raised.',
            enum: ['high', 'mid', 'none'],
        },
        failOnNewPackage: {
            description:
                'Fail when a package enters the bootstrap that is not in "packages" — or, without that list, that was ' +
                'not in the baseline.',
            type: 'boolean',
        },
        failOnSignals: {
            description:
                'Signals that fail the command whatever their severity, for "this one, always": a secret, a ' +
                'forbidden package. Accepted signals do not count.',
            type: 'array',
            items: { enum: [...FINDING_KINDS], enumDescriptions: FINDING_KINDS.map(kind => KIND_NAMES[kind]) },
            uniqueItems: true,
            examples: [['forbidden', 'secrets', 'vulnerable']],
        },
        screens: {
            description:
                'A limit per screen, over maxScreen: the screen as the report names it, or its source file. ' +
                'A name that matches no screen is reported.',
            type: 'object',
            additionalProperties: size('The limit for this screen.'),
            examples: [{ rooms: '400kB', 'src/app/map/map.page.ts': '900kB' }],
        },
    },
});

const acceptedSchema = (): Schema => ({
    description:
        'Signals the team has decided to live with. Each one names a reason and, ideally, a person and an expiry. ' +
        'It comes back when the date passes or when its figure grows past "bytes". Everything accepted is listed ' +
        'under the report: nothing disappears silently.',
    type: 'array',
    items: {
        type: 'object',
        required: ['kind', 'why'],
        additionalProperties: false,
        properties: {
            kind: {
                description: 'Which signal.',
                enum: [...FINDING_KINDS],
                // VS Code shows these next to each value while completing.
                enumDescriptions: FINDING_KINDS.map(kind => KIND_NAMES[kind]),
            },
            key: {
                description:
                    'Which instance — the package, chunk or screen source the signal is about. Leave it out to accept ' +
                    'every instance of the kind, which is a bigger decision.',
                type: 'string',
            },
            why: { description: 'Why it is being lived with. Required.', type: 'string', minLength: 1 },
            who: { description: 'Who decided: somebody a reader can ask in a year.', type: 'string' },
            until: {
                description: 'YYYY-MM-DD. After it the signal is raised again.',
                type: 'string',
                pattern: String.raw`^\d{4}-\d{2}-\d{2}$`,
            },
            bytes: size('The figure that was accepted. When the signal grows past it, it comes back.'),
        },
    },
});

const situationSchema = (): Schema => {
    const en = UI.en;
    const questions = QUESTIONS.map(question => {
        const options: readonly string[] = question.options.includes('unknown')
            ? question.options
            : [...question.options, 'unknown'];
        const words = en.sitOption[question.key] as Partial<Record<string, string>>;
        return [
            question.key,
            {
                description: `${en.sitQuestion[question.key]} ${en.sitHowTo[question.key]}`,
                enum: options,
                enumDescriptions: options.map(option => words[option] ?? 'Not answered yet.'),
            },
        ] as const;
    });

    return {
        description:
            'The five questions the build cannot answer. An answer can raise a severity, never lower one. Written ' +
            'by the Situation tab of the page; anything left out reads as unanswered.',
        type: 'object',
        additionalProperties: false,
        properties: {
            ...Object.fromEntries(questions),
            screensPerSession: {
                description: `${en.sitTechnical.navigation} Wins over "navigation".`,
                type: ['number', 'null'],
            },
            deploysPerWeek: {
                description: `${en.sitTechnical.deploys} Wins over "deploys".`,
                type: ['number', 'null'],
            },
            returningPct: {
                description: `${en.sitTechnical.returning} A percentage. Wins over "returning".`,
                type: ['number', 'null'],
            },
            rum: {
                description: 'Whether the connection answer was imported from real-user monitoring.',
                type: 'boolean',
            },
            answeredBy: { description: 'Who answered.', type: ['string', 'null'] },
            answeredAt: {
                description: 'YYYY-MM-DD. The report says so once the answers are a year old.',
                type: ['string', 'null'],
            },
        },
    };
};

/** The schema as an object; the spec writes it out as JSON. */
export const configSchema = (): Schema => ({
    // eslint-disable-next-line unicorn/prefer-https -- the draft-07 meta-schema's identifier is this exact string; validators match it, they do not fetch it
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: SCHEMA_URL,
    title: 'loadline.json',
    description:
        'Loadline configuration: thresholds, gates and accepted signals, committed next to the code so the page and ' +
        'the command judge the build the same way. Read from the working directory, or from --config <file>. ' +
        'Guide: https://github.com/bymaksym/LoadLine/blob/main/docs/CONFIG.md',
    type: 'object',
    required: ['tool', 'version'],
    additionalProperties: false,
    properties: {
        $schema: { description: 'Where your editor finds this schema.', type: 'string' },
        tool: { description: 'Always "loadline": it tells this file apart from any other JSON.', const: 'loadline' },
        version: { description: 'Always 1.', const: 1 },
        extends: {
            description:
                'Other loadline.json files this one builds on: a path ("./base.loadline.json") or a package ' +
                '("@acme/loadline-config", which reads its loadline.json), from the folder of this file. Objects ' +
                'join key by key, lists add up, and this file wins. "situation" is not inherited. The command ' +
                'follows it; the page cannot, and says so. `loadline --print-config` shows the result.',
            anyOf: [
                { type: 'string', minLength: 1 },
                { type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1 },
            ],
            examples: ['@acme/loadline-config', './base.loadline.json'],
        },
        mode: {
            description:
                'The unit the sizes in "criteria" are written in. A gzip threshold checked against raw bytes is not ' +
                'the same threshold.',
            enum: ['gzip', 'brotli', 'raw'],
        },
        criteria: criteriaSchema(),
        gates: gatesSchema(),
        packages: {
            description:
                'The packages allowed in the bootstrap, for gates.failOnNewPackage. A list of names, so adding one is a ' +
                'line in a review.',
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
        },
        accepted: acceptedSchema(),
        forbidden: {
            description:
                'What must never ship, or never ship in the bootstrap: a package or files of your own. Each rule ' +
                'that matches raises the "forbidden" signal, with its "why". An exception is an entry in "accepted"; ' +
                'failing the build on it is gates.failOn or gates.failOnSignals.',
            type: 'array',
            items: {
                type: 'object',
                required: ['why'],
                oneOf: [{ required: ['package'] }, { required: ['path'] }],
                additionalProperties: false,
                properties: {
                    package: {
                        description: 'A package name, with * for any text: "moment", "@aws-sdk/*".',
                        type: 'string',
                        minLength: 1,
                    },
                    path: {
                        description: 'Files of the project, with * for any text: "src/app/admin/*".',
                        type: 'string',
                        minLength: 1,
                    },
                    in: {
                        description: 'Where it must not be. "anywhere" when left out.',
                        enum: ['anywhere', 'bootstrap'],
                        enumDescriptions: [
                            'Not in any file of the build.',
                            'Not in the first load: a lazy screen may still load it.',
                        ],
                    },
                    why: {
                        description: 'Why not, and what to use instead. Required: it is shown on the signal.',
                        type: 'string',
                        minLength: 1,
                    },
                },
            },
            examples: [
                [
                    { package: 'moment', why: 'We use date-fns.' },
                    { path: 'src/app/admin/*', in: 'bootstrap', why: 'Admin is lazy.' },
                ],
            ],
        },
        situation: situationSchema(),
        build: {
            description:
                'What the build does not say on its own, for a page or a tool no rule here reads: file names ' +
                'with * for the hash, and source paths with * for a segment and ** for several.',
            type: 'object',
            additionalProperties: false,
            properties: {
                entries: {
                    description:
                        'Scripts the application starts at, added to what index.html names: for a page that starts ' +
                        'it in a way Loadline does not read. "client.*.js".',
                    type: 'array',
                    items: { type: 'string' },
                    uniqueItems: true,
                },
                ignore: {
                    description:
                        'Files of the folder no screen downloads — a polyfill only old browsers load, a copy for ' +
                        'another target. Never an entry, never reached by a guess, and out of every figure when ' +
                        'nothing the application imports reaches them.',
                    type: 'array',
                    items: { type: 'string' },
                    uniqueItems: true,
                },
                screens: {
                    description:
                        'Which lazy entries are screens and which are a piece of one, by source file (or chunk, ' +
                        'without maps), with * for any text. The buttons of the screens table, written down for ' +
                        'everybody; a click in the page still wins.',
                    type: 'object',
                    additionalProperties: { enum: ['screen', 'piece'] },
                },
                page: {
                    description:
                        'The page of the application, when the folder holds several HTML files and index.html is ' +
                        'not it: "app.html", "admin/index.html".',
                    type: 'string',
                },
                own: {
                    description:
                        'Source paths that are your own code although they sit under node_modules: ' +
                        '"src/node_modules/**".',
                    type: 'array',
                    items: { type: 'string' },
                    uniqueItems: true,
                },
                routeKeys: {
                    description:
                        'Keys of a route table besides component, loadComponent, loadChildren, lazy, getComponent ' +
                        'and asyncComponent, for a router that writes { path: "/x", page: () => import("./x.js") }.',
                    type: 'array',
                    items: { type: 'string', pattern: String.raw`^[A-Za-z_$][\w$]*$` },
                    uniqueItems: true,
                },
                dependencies: {
                    description:
                        'Source paths that are dependencies although they are not under node_modules — workspace ' +
                        'packages, a vendored library — named after the folder matched: "packages/*" makes ' +
                        'packages/ui/src/x.ts part of the package ui.',
                    type: 'array',
                    items: { type: 'string' },
                    uniqueItems: true,
                },
            },
        },
    },
});
