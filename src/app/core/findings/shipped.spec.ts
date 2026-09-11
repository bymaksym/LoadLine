import { describe, expect, it } from 'vitest';
import { type Analysis, type ModuleEntry } from '../analysis/analysis.types';
import { type GraphInsights } from '../analysis/insights.types';
import { RECOMMENDED } from '../criteria/criteria';
import { buildFolderFindings, buildShippedFindings } from './shipped';

const KB = 1024;

const module = (path: string, bytes: number, zone: 'boot' | 'shared' | 'own' = 'own'): ModuleEntry => ({
    path,
    label: path.replace(/^node_modules\//, ''),
    pkg: path.startsWith('node_modules/') ? (path.split('/', 2)[1] ?? null) : null,
    bytes,
    places: [{ chunk: 'dist/main.js', chunkName: 'main.js', bytes, zone, screens: 0 }],
});

const analysis = (modules: ModuleEntry[]): Analysis =>
    ({
        modules,
        // What is under test is which files get named, not what removing them would save.
        insights: () => ({ exclusiveOf: () => 0, filesByBucket: new Map() }) as unknown as GraphInsights,
    }) as Analysis;

describe('buildShippedFindings, languages', () => {
    it('fires when a package ships its whole locale folder', () => {
        const modules = ['es', 'fr', 'de', 'it'].map(code =>
            module(`node_modules/date-fns/locale/${code}/index.js`, 5 * KB, 'boot'),
        );

        const [finding] = buildShippedFindings(analysis(modules), 'en', RECOMMENDED.raw);

        expect(finding?.chip).toBe('every language of a library');
        // In the bootstrap everybody pays for them: that is a problem, not a note.
        expect(finding?.severity).toBe('mid');
        expect(finding?.title).toContain('date-fns ships 4');
    });

    it('outside the bootstrap it is context, not a problem', () => {
        const modules = ['es', 'fr', 'de'].map(code => module(`node_modules/dayjs/locale/${code}.js`, 5 * KB, 'own'));

        expect(buildShippedFindings(analysis(modules), 'en', RECOMMENDED.raw)[0]?.severity).toBe('info');
    });

    it('one or two languages is somebody registering what they use', () => {
        const modules = ['es', 'en'].map(code => module(`node_modules/@angular/common/locales/${code}.mjs`, 9 * KB));

        expect(buildShippedFindings(analysis(modules), 'en', RECOMMENDED.raw)).toEqual([]);
    });

    it('one language split across files is one language', () => {
        const modules = [
            module('node_modules/date-fns/locale/en-US/_lib/formatDistance.js', 6 * KB),
            module('node_modules/date-fns/locale/en-US/_lib/formatLong.js', 6 * KB),
            module('node_modules/date-fns/locale/_lib/buildFormatLongFn.js', 6 * KB),
            module('node_modules/date-fns/locale/en-US.js', 6 * KB),
        ];

        expect(buildShippedFindings(analysis(modules), 'en', RECOMMENDED.raw)).toEqual([]);
    });

    it('files named after a language count even without a locale folder', () => {
        const modules = ['en', 'es', 'it'].map(code => module(`node_modules/primelocale/${code}.json`, 4 * KB));

        const [finding] = buildShippedFindings(analysis(modules), 'en', RECOMMENDED.raw);

        expect(finding?.chip).toBe('every language of a library');
        // And the same files are not reported again as data shipped as code.
        expect(buildShippedFindings(analysis(modules), 'en', RECOMMENDED.raw)).toHaveLength(1);
    });

    it('a locale folder of your own is not a package shipping its languages', () => {
        const modules = ['es', 'fr', 'de'].map(code => module(`src/app/i18n/${code}.ts`, 8 * KB));

        expect(buildShippedFindings(analysis(modules), 'en', RECOMMENDED.raw)).toEqual([]);
    });
});

describe('buildShippedFindings, data', () => {
    it('fires on data imported instead of fetched', () => {
        const modules = [module('src/app/shared/countries.json', 40 * KB, 'boot')];

        const [finding] = buildShippedFindings(analysis(modules), 'en', RECOMMENDED.raw);

        expect(finding?.chip).toBe('data shipped as code');
        expect(finding?.body).toContain('countries.json');
        expect(finding?.severity).toBe('mid');
    });

    it('a small JSON is not worth a line', () => {
        expect(buildShippedFindings(analysis([module('src/app/config.json', 2 * KB)]), 'en', RECOMMENDED.raw)).toEqual(
            [],
        );
    });
});

/**
 * The report's own margin of error. Two measurements of the same chunks — what the files weigh and
 * what the per-file breakdown inside them adds up to — are supposed to agree, and on three Angular
 * 22 builds measured here they do not: the sum is 125 % of the file, because the metafile is
 * written before a later pass shrinks the output. Nothing said so, and every figure taken from
 * inside a chunk read a quarter high while the weight printed beside it was exact.
 */
describe('buildFolderFindings · the breakdown against the file it describes', () => {
    const drift = (ratio: number, file = 100 * KB, chunks = 8) => ({
        file,
        measured: Math.round(ratio * file),
        ratio,
        chunks,
    });

    it('says how far off it is, and which half of the report that lands on', () => {
        const [finding] = buildFolderFindings({ sourceMaps: 0, derived: false, drift: drift(1.25) }, 'en');

        expect(finding?.kind).toBe('splitDrift');
        expect(finding?.severity).toBe('mid');
        expect(finding?.title).toContain('125 %');
        expect(finding?.body).toContain('25 % high');
    });

    /** A build tool's own runtime belongs to no input, so the sum never lands exactly on the file. */
    it('stays quiet when the two agree to within the overhead that is always there', () => {
        expect(buildFolderFindings({ sourceMaps: 0, derived: false, drift: drift(0.99) }, 'en')).toEqual([]);
        expect(buildFolderFindings({ sourceMaps: 0, derived: false, drift: null }, 'en')).toEqual([]);
    });

    /** Reading low is as wrong as reading high, and the sentence has to survive being turned round. */
    it('says which way it is wrong', () => {
        const [finding] = buildFolderFindings({ sourceMaps: 0, derived: false, drift: drift(0.9) }, 'en');

        expect(finding?.body).toContain('10 % low');
        // Under fifteen per cent it is a note, not the thing to do before anything else.
        expect(finding?.severity).toBe('info');
    });

    /**
     * The half a percentage cannot express. The wrapper a bundler puts round each chunk is a fixed
     * cost per chunk and not a proportion of one, so on small enough chunks it is most of them: a
     * plain esbuild build of five chunks weighing 90 to 330 bytes came out at 59 % — a `mid` on a
     * build where nothing at all was wrong, over 395 bytes of wrapper.
     */
    it('stays quiet when the gap is a percentage of almost nothing', () => {
        // 41 % apart, and 395 bytes apart, over five chunks.
        expect(buildFolderFindings({ sourceMaps: 0, derived: false, drift: drift(0.59, 957, 5) }, 'en')).toEqual([]);
    });

    it('still fires when the same percentage is a real number of bytes', () => {
        const [finding] = buildFolderFindings({ sourceMaps: 0, derived: false, drift: drift(1.25, 400 * KB, 8) }, 'en');

        expect(finding?.kind).toBe('splitDrift');
    });

    /** It is a fact about the metafile, so neither of the folder's own early exits may swallow it. */
    it('comes out whichever way the build was read', () => {
        const kinds = (build: { sourceMaps: number; derived: boolean }) =>
            buildFolderFindings({ ...build, drift: drift(1.25) }, 'en').map(finding => finding.kind);

        expect(kinds({ sourceMaps: 12, derived: true })).toContain('splitDrift');
        expect(kinds({ sourceMaps: 0, derived: true })).toContain('splitDrift');
        expect(kinds({ sourceMaps: 0, derived: false })).toContain('splitDrift');
    });
});

describe('buildFolderFindings', () => {
    it('says the folder carries source maps, and only then', () => {
        expect(buildFolderFindings({ sourceMaps: 12, derived: true }, 'en')[0]?.chip).toBe('source maps in the folder');
        expect(buildFolderFindings({ sourceMaps: 12, derived: false }, 'en')[0]?.chip).toBe(
            'source maps in the folder',
        );
    });

    /**
     * The other half of the same fact. A folder without maps names every screen after its chunk
     * file, so a real build comes out with rows called `0fPdmq0U` and nothing said why.
     */
    it('says a folder without maps is a shorter report, and how to get the rest', () => {
        const [finding] = buildFolderFindings({ sourceMaps: 0, derived: true }, 'en');

        expect(finding?.kind).toBe('noSourceMaps');
        expect(finding?.severity).toBe('info');
        expect(finding?.fix).toContain('sourcemap');
    });

    /** A stats.json names every file whether or not the build shipped maps: nothing to say. */
    it('says nothing about maps when the graph did not come from the folder', () => {
        expect(buildFolderFindings({ sourceMaps: 0, derived: false }, 'en')).toEqual([]);
    });
});

describe('buildFolderFindings · a screens table nobody can read', () => {
    it('names the real problem when every row is a content hash, and raises it out of context', () => {
        const [finding] = buildFolderFindings(
            { sourceMaps: 0, derived: true, screens: ['chunk-Brh4_81T', 'chunk-NrcxjfTy', 'chunk--llvv6gP'] },
            'en',
        );

        expect(finding?.kind).toBe('noSourceMaps');
        // On a real Angular build this is eighteen unreadable rows, and it used to sit at the
        // bottom as a note about source maps.
        expect(finding?.severity).toBe('mid');
        expect(finding?.title).toContain('All 3 of your screens');
    });

    it('stays context when the screens have names', () => {
        const [finding] = buildFolderFindings(
            { sourceMaps: 0, derived: true, screens: ['orders', 'settings', 'home'] },
            'en',
        );

        expect(finding?.severity).toBe('info');
        expect(finding?.title).toContain('.map');
    });

    it('does not take a screen really called Dashboard for a hash', () => {
        const [finding] = buildFolderFindings(
            { sourceMaps: 0, derived: true, screens: ['Dashboard', 'Settings', 'chunk-Brh4_81T'] },
            'en',
        );

        expect(finding?.severity).toBe('info');
    });
});
