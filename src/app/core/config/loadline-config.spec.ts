import { describe, expect, it } from 'vitest';
import { type Finding } from '../findings/finding.types';
import { applyAcceptances, readConfig, sameFolderReading, writeConfig } from './loadline-config';
import { type LoadlineConfig } from './loadline-config.types';

const finding = (key: string, saving?: number): Finding => ({
    kind: 'dupes',
    severity: 'mid',
    chip: '',
    title: 'dupes',
    body: '',
    fix: '',
    target: { tab: 'boot', key },
    saving,
});

const config = (accepted: LoadlineConfig['accepted']): LoadlineConfig => ({ tool: 'loadline', version: 1, accepted });

describe('readConfig', () => {
    it('refuses anything that is not the file', () => {
        expect(readConfig({ criteria: {} }).config).toBeNull();
        expect(readConfig(null).problems).toHaveLength(1);
    });

    it('drops an acceptance with no reason, and says why', () => {
        const read = readConfig({
            tool: 'loadline',
            version: 1,
            accepted: [{ kind: 'dupes', why: '  ' }],
        });

        expect(read.config?.accepted).toEqual([]);
        expect(read.problems[0]).toContain('suppression');
    });

    it('drops an acceptance of a signal that does not exist', () => {
        const read = readConfig({ tool: 'loadline', version: 1, accepted: [{ kind: 'nonsense', why: 'because' }] });

        expect(read.config?.accepted).toEqual([]);
        expect(read.problems[0]).toContain('nonsense');
    });

    it('keeps an acceptance whose date is malformed, without the date', () => {
        const read = readConfig({
            tool: 'loadline',
            version: 1,
            accepted: [{ kind: 'dupes', why: 'later', until: 'next month' }],
        });

        expect(read.config?.accepted?.[0]?.until).toBeUndefined();
        expect(read.problems[0]).toContain('YYYY-MM-DD');
    });

    /** Under `--lang es` these were the lines left in English, under a report in Spanish. */
    it('says what is wrong in the language asked for, with the keys as they are written', () => {
        const read = readConfig(
            {
                tool: 'loadline',
                version: 1,
                mode: 'fast',
                gates: { maxBoot: 'big' },
                situation: { answeredAt: 'ayer' },
                accepted: [{ kind: 'dupes', why: '' }],
            },
            'es',
        );

        expect(read.problems).toEqual([
            '"mode" tiene que ser "raw", "gzip" o "brotli", no "fast". Se ignora.',
            '"gates.maxBoot" tiene que ser un tamaño como "350kB" o "1.5MB", no "big". Ese gate no puede comprobarse.',
            'La aceptación de dupes no tiene "why". Una aceptación sin motivo es un silencio.',
            '"situation.answeredAt" no es una fecha AAAA-MM-DD: ayer. Se ignora.',
        ]);
        expect(read.gateProblems).toHaveLength(1);
    });
});

describe('applyAcceptances', () => {
    const today = new Date('2026-09-06T00:00:00Z');

    it('sets aside the signal it names, and only that one', () => {
        const { kept, accepted } = applyAcceptances(
            [finding('date-fns'), finding('rxjs')],
            config([{ kind: 'dupes', key: 'date-fns', why: 'upstream' }]),
            today,
        );

        expect(kept.map(item => item.target?.key)).toEqual(['rxjs']);
        expect(accepted[0]?.lapse).toBeNull();
    });

    it('gives the signal back when the date has passed', () => {
        const { kept, accepted } = applyAcceptances(
            [finding('date-fns')],
            config([{ kind: 'dupes', why: 'later', until: '2026-01-01' }]),
            today,
        );

        expect(kept).toHaveLength(1);
        expect(accepted[0]?.lapse).toBe('expired');
    });

    it('gives it back when the figure it was accepted at has grown', () => {
        // 12 kB was what somebody agreed to live with. 400 is not that decision.
        const { kept, accepted } = applyAcceptances(
            [finding('date-fns', 400_000)],
            config([{ kind: 'dupes', why: 'small enough', bytes: 12_000 }]),
            today,
        );

        expect(kept).toHaveLength(1);
        expect(accepted[0]?.lapse).toBe('grew');
    });

    it('accepts every instance of a kind when no key is given', () => {
        const { kept } = applyAcceptances(
            [finding('a'), finding('b')],
            config([{ kind: 'dupes', why: 'all of them, knowingly' }]),
            today,
        );

        expect(kept).toEqual([]);
    });
});

describe('writeConfig', () => {
    it('writes a file the reader accepts', () => {
        const text = writeConfig({ criteria: { bootOk: 1024 } });

        expect(readConfig(JSON.parse(text)).config?.criteria?.bootOk).toBe(1024);
    });
});

describe('readConfig names what it cannot use', () => {
    const read = (extra: Record<string, unknown>): ReturnType<typeof readConfig> =>
        readConfig({ tool: 'loadline', version: 1, ...extra });

    it('reads sizes and shares the way people write them', () => {
        const { config: file, problems } = read({
            criteria: { bootOk: '170kB', sharedRatio: '50%', screenOk: 400_000 },
            gates: { maxBoot: '350kB', maxGrowthPct: '5%', screens: { rooms: '1MB' } },
            accepted: [{ kind: 'dupes', why: 'until 4.x', bytes: '12kB' }],
        });
        expect(problems).toEqual([]);
        expect(file?.criteria).toEqual({ bootOk: 170 * 1024, sharedRatio: 0.5, screenOk: 400_000 });
        expect(file?.gates).toEqual({ maxBoot: 350 * 1024, maxGrowthPct: 5, screens: { rooms: 1024 * 1024 } });
        expect(file?.accepted?.[0]?.bytes).toBe(12 * 1024);
    });

    it('says a key it does not know instead of ignoring it', () => {
        const { problems } = read({ gates: { maxBot: '350kB' }, criteria: { bootOkk: 1 }, gate: {} });
        expect(problems.join('\n')).toContain('"gates.maxBot"');
        expect(problems.join('\n')).toContain('"criteria.bootOkk"');
        expect(problems.join('\n')).toContain('"gate"');
    });

    it('turns a size it cannot read into a problem, not into "no gate"', () => {
        const { config: file, problems } = read({ gates: { maxBoot: 'big', maxScreen: '350' } });
        expect(file?.gates).toEqual({});
        expect(problems[0]).toContain('"gates.maxBoot"');
        expect(problems[1]).toContain('Write "350kB"');
    });

    it('reads the signals that fail the run, and stops on a name that is not one', () => {
        const { config: file, gateProblems } = read({ gates: { failOnSignals: ['secrets', 'secret'] } });
        expect(file?.gates?.failOnSignals).toEqual(['secrets']);
        expect(gateProblems).toHaveLength(1);
        expect(gateProblems[0]).toContain('secret,');
    });

    it('accepts the $schema key editors need', () => {
        expect(read({ $schema: 'https://unpkg.com/@bymaksym/loadline/loadline.schema.json' }).problems).toEqual([]);
    });
});

/**
 * `build` is the way past a folder no rule here reads, without waiting for a release: which scripts
 * start the application, which files no screen downloads, which entries are screens, which page.
 */
describe('readConfig · build', () => {
    it('reads the four keys, and names what it cannot use instead of dropping it in silence', () => {
        const read = readConfig({
            tool: 'loadline',
            version: 1,
            build: {
                entries: ['client.*.js'],
                ignore: 'polyfills.js',
                screens: { '*.widget.ts': 'piece', 'src/admin/*': 'screen', 'x.ts': 'tab' },
                page: 'app.html',
            },
        });

        expect(read.config?.build).toEqual({
            entries: ['client.*.js'],
            screens: { '*.widget.ts': 'piece', 'src/admin/*': 'screen' },
            page: 'app.html',
        });
        expect(read.problems).toHaveLength(2);
    });

    it('reads own, dependencies and routeKeys, and keeps a route key out that is no property name', () => {
        const read = readConfig({
            tool: 'loadline',
            version: 1,
            build: { own: ['src/node_modules/**'], dependencies: ['packages/*'], routeKeys: ['page', 'a|b'] },
        });

        expect(read.config?.build).toEqual({
            own: ['src/node_modules/**'],
            dependencies: ['packages/*'],
            routeKeys: ['page'],
        });
        expect(read.problems).toHaveLength(1);
    });
});

/**
 * The page reads the folder once, when it is dropped. A `loadline.json` that arrives after it used
 * to change `entries`, `ignore` and `page` without the folder being read again under them.
 */
describe('sameFolderReading', () => {
    it('asks for a new reading when entries, ignore or page change', () => {
        expect(sameFolderReading(undefined, { entries: ['client.*.js'] })).toBe(false);
        expect(sameFolderReading({ ignore: ['a.js'] }, { ignore: ['b.js'] })).toBe(false);
        expect(sameFolderReading({ page: 'app.html' }, {})).toBe(false);
        // The keys of the route table are read with the chunks.
        expect(sameFolderReading({}, { routeKeys: ['page'] })).toBe(false);
    });

    it('does not for screens alone, which apply as the report is drawn', () => {
        expect(sameFolderReading(undefined, { screens: { '*.widget.ts': 'piece' } })).toBe(true);
        expect(sameFolderReading({ entries: [] }, undefined)).toBe(true);
    });
});

describe('readConfig · forbidden', () => {
    it('reads the rules, with "anywhere" when "in" is left out', () => {
        const read = readConfig({
            tool: 'loadline',
            version: 1,
            forbidden: [
                { package: 'moment', why: 'date-fns' },
                { path: 'src/app/admin/*', in: 'bootstrap', why: 'admin is lazy' },
            ],
        });

        expect(read.config?.forbidden).toEqual([
            { package: 'moment', in: 'anywhere', why: 'date-fns' },
            { path: 'src/app/admin/*', in: 'bootstrap', why: 'admin is lazy' },
        ]);
        expect(read.problems).toEqual([]);
    });

    /** A rule that cannot be read forbids nothing, and a build shipping what it meant to stop passed. */
    it('stops the run on a rule it cannot use, like a gate it cannot read', () => {
        const read = readConfig({
            tool: 'loadline',
            version: 1,
            forbidden: [
                { package: 'moment' },
                { package: 'a', path: 'b', why: 'both' },
                { package: 'lodash', in: 'boot', why: 'typo' },
            ],
        });

        expect(read.config?.forbidden).toEqual([]);
        expect(read.gateProblems).toHaveLength(3);
        expect(read.gateProblems.join('\n')).toContain('"boot"');
    });
});
