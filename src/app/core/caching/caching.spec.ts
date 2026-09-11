import { describe, expect, it } from 'vitest';
import { unhashableFiles, unhashedName, unstableChunks, updateCostOf } from './caching';

const KB = 1024;

/** The two builds' file lists as `updateCostOf` takes them: what each file weighs, and what is in it. */
const weigh = (files: Record<string, number | [number, string]>) =>
    new Map(
        Object.entries(files).map(([name, value]) =>
            typeof value === 'number' ? [name, { bytes: value }] : [name, { bytes: value[0], content: value[1] }],
        ),
    );

describe('unhashedName', () => {
    it('strips the content hash a build tool writes into the name', () => {
        expect(unhashedName('main-A1B2C3D4.js')).toBe('main.js');
        expect(unhashedName('main.a1b2c3d4.js')).toBe('main.js');
        expect(unhashedName('chunk-0fPdmq0U.mjs')).toBe('chunk.mjs');
    });

    it('leaves alone a name with no hash, and a version somebody wrote by hand', () => {
        expect(unhashedName('favicon.ico')).toBe('favicon.ico');
        expect(unhashedName('app-v2.js')).toBe('app-v2.js');
    });
});

describe('updateCostOf · what somebody who had yesterday’s build downloads', () => {
    const previous = weigh({
        'main-AAAAAAAA.js': 100 * KB,
        'vendor-BBBBBBBB.js': 900 * KB,
        'old-CCCCCCCC.js': 10 * KB,
    });
    const current = weigh({
        'main-DDDDDDDD.js': 110 * KB,
        'vendor-BBBBBBBB.js': 900 * KB,
        'new-EEEEEEEE.js': 20 * KB,
    });

    const cost = updateCostOf(current, previous);

    it('charges only what changed name, not the whole build', () => {
        // The vendor chunk keeps its name, so the browser never asks for it. That is the figure:
        // 130 kB of an update against a megabyte of a first visit.
        expect(cost.bytes).toBe(130 * KB);
        expect(cost.fresh).toBe(1030 * KB);
        expect(cost.reused).toBe(1);
    });

    it('tells a file that changed from one that arrived', () => {
        // `main-AAAA` → `main-DDDD` is one file having changed. Saying "one gone, one new" would
        // lose exactly the thing worth knowing.
        expect(cost.changed.map(file => file.name)).toEqual(['main-DDDDDDDD.js']);
        expect(cost.added.map(file => file.name)).toEqual(['new-EEEEEEEE.js']);
        expect(cost.removed.map(file => file.name)).toEqual(['old-CCCCCCCC.js']);
    });

    /** Without the edges there is no way to tell an edit from its consequence, and no claim is made. */
    it('says nothing about the cascade when the import edges were not given', () => {
        expect(cost.cascade).toBeNull();
    });
});

/**
 * The measured cascade. Both halves are read rather than modelled: the two builds' names say which
 * files changed, and the current build's edges say which of them carry a changed name inside.
 *
 * The shape below is the ordinary one — an edit in a shared chunk, and everything naming it moving
 * with it — and the whole point of the split is that the honest sentence about this deploy is not
 * "97 % re-downloaded" but "97 %, and 8 kB of it is the edit".
 */
describe('updateCostOf · the edit told apart from the cascade it set off', () => {
    const previous = weigh({
        'main-AAAAAAAA.js': 100 * KB,
        'screen-BBBBBBBB.js': 20 * KB,
        'shared-CCCCCCCC.js': 8 * KB,
        'vendor-VVVVVVVV.js': 900 * KB,
    });
    const current = weigh({
        'main-A1111111.js': 100 * KB,
        'screen-B1111111.js': 20 * KB,
        'shared-C1111111.js': 8 * KB,
        'vendor-VVVVVVVV.js': 900 * KB,
    });
    // main names screen, screen names shared. Touching `shared` moves all three.
    const importers = new Map<string, string[]>([
        ['screen-B1111111.js', ['main-A1111111.js']],
        ['shared-C1111111.js', ['screen-B1111111.js']],
        ['vendor-VVVVVVVV.js', ['main-A1111111.js']],
    ]);

    const cost = updateCostOf(current, previous, importers);

    it('names the file the edit has to have landed in', () => {
        // `shared` names nothing that changed, so nothing but its own content can have moved it.
        expect(cost.cascade?.roots).toEqual(['shared-C1111111.js']);
        expect(cost.cascade?.rootBytes).toBe(8 * KB);
    });

    it('puts the rest on the cascade, which is the counterfactual the figure needs', () => {
        expect(cost.cascade?.carried.toSorted((a, b) => a.localeCompare(b))).toEqual([
            'main-A1111111.js',
            'screen-B1111111.js',
        ]);
        expect(cost.cascade?.carriedBytes).toBe(120 * KB);
        // 128 kB re-downloaded for an 8 kB edit, and the pair is what says so.
        expect(cost.bytes).toBe(128 * KB);
    });

    it('accounts for every changed file exactly once', () => {
        const split = (cost.cascade?.roots.length ?? 0) + (cost.cascade?.carried.length ?? 0);

        expect(split).toBe(cost.changed.length);
        expect((cost.cascade?.rootBytes ?? 0) + (cost.cascade?.carriedBytes ?? 0)).toBe(cost.bytes);
    });

    /**
     * Two files edited at once and neither naming the other: both are roots. The floor is a floor,
     * not a claim that exactly one thing was touched.
     */
    it('names every root when an edit landed in more than one place', () => {
        const twoEdits = updateCostOf(
            weigh({ 'a-11111111.js': 5 * KB, 'b-22222222.js': 5 * KB }),
            weigh({ 'a-AAAAAAAA.js': 5 * KB, 'b-BBBBBBBB.js': 5 * KB }),
            new Map(),
        );

        expect(twoEdits.cascade?.roots.toSorted((a, b) => a.localeCompare(b))).toEqual([
            'a-11111111.js',
            'b-22222222.js',
        ]);
        expect(twoEdits.cascade?.carried).toEqual([]);
    });
});

/**
 * The chunks whose whole name is the content hash. SvelteKit, Nuxt and Rollup write plenty, and
 * matching by name has nothing to work with there: taking the hash off `ChDGvcpR.js` leaves `.js`.
 *
 * Measured on the SvelteKit probe before this: a two-byte edit to a shared module reported 10 kB
 * added and 10 kB removed instead of 10 kB changed, and the split into the edit and the cascade it
 * set off never saw the largest file of the build — it is fed from `changed`, and that file was not
 * in it.
 */
describe('updateCostOf · a chunk whose whole name is the hash', () => {
    const previous = weigh({
        'Bg877HTf.js': [10 * KB, 'svelte/src/internal/client/runtime.js'],
        'DmIUsUUA.js': [400, 'src/lib/rows.js'],
        'app.AAAAAAAA.js': [1 * KB, 'generated/root.svelte'],
    });
    const current = weigh({
        'qwe94G91.js': [10 * KB, 'svelte/src/internal/client/runtime.js'],
        'CT10Gamq.js': [420, 'src/lib/rows.js'],
        'app.BBBBBBBB.js': [1 * KB, 'generated/root.svelte'],
    });

    const cost = updateCostOf(current, previous);

    it('reads it as the file it is, changed, rather than one gone and another arrived', () => {
        expect(cost.changed.map(file => file.name)).toEqual(['qwe94G91.js', 'app.BBBBBBBB.js', 'CT10Gamq.js']);
        expect(cost.added).toEqual([]);
        expect(cost.removed).toEqual([]);
    });

    it('puts it in the cascade split, which is fed from the changed files and had been missing it', () => {
        const cascade = updateCostOf(current, previous, new Map([['qwe94G91.js', ['app.BBBBBBBB.js']]])).cascade;

        expect(cascade?.roots).toContain('qwe94G91.js');
        expect(cascade?.rootBytes).toBeGreaterThanOrEqual(10 * KB);
    });

    /** No content, nothing to match on, and the honest answer is the one it always gave. */
    it('falls back to the name when the build never said what was inside its chunks', () => {
        const blind = updateCostOf(weigh({ 'qwe94G91.js': 10 * KB }), weigh({ 'Bg877HTf.js': 10 * KB }));

        expect(blind.added.map(file => file.name)).toEqual(['qwe94G91.js']);
        expect(blind.removed.map(file => file.name)).toEqual(['Bg877HTf.js']);
    });

    /**
     * Two chunks built around the same file say nothing about which of them is which, so neither is
     * matched by content and both fall back to the name. A wrong pairing would report bytes as
     * cached that the browser downloads.
     */
    it('refuses to match by content when the content names more than one chunk', () => {
        const ambiguous = updateCostOf(
            weigh({ 'AAAAbbbb.js': [5 * KB, 'src/lib/rows.js'], 'CCCCdddd.js': [5 * KB, 'src/lib/rows.js'] }),
            weigh({ 'EEEEffff.js': [5 * KB, 'src/lib/rows.js'], 'GGGGhhhh.js': [5 * KB, 'src/lib/rows.js'] }),
        );

        expect(ambiguous.changed).toEqual([]);
        expect(ambiguous.added).toHaveLength(2);
        expect(ambiguous.removed).toHaveLength(2);
    });

    /**
     * A chunk with a name in front of the hash is matched by that name, whatever its content says.
     * Content is the fallback for the names that have nothing left underneath, not a replacement:
     * `home.page-A1.js` and `home.page-B2.js` are the same screen even if what weighs most inside
     * them moved from one import to another.
     */
    it('does not let content override a name that survived the hash coming off', () => {
        const named = updateCostOf(
            weigh({ 'home.page-B2222222.js': [900, 'src/pages/table.jsx'] }),
            weigh({ 'home.page-A1111111.js': [800, 'src/pages/home.page.jsx'] }),
        );

        expect(named.changed.map(file => file.name)).toEqual(['home.page-B2222222.js']);
        expect(named.added).toEqual([]);
    });
});

describe('unstableChunks · what mixes the daily with the monthly', () => {
    const chunk = (name: string, vendorBytes: number, ownBytes: number, inBoot = false) => ({
        name,
        bytes: vendorBytes + ownBytes,
        inBoot,
        vendorBytes,
        ownBytes,
    });

    it('names a chunk holding both, and says how much of it is somebody else’s', () => {
        const [worst] = unstableChunks([chunk('main-A1.js', 800 * KB, 200 * KB, true)], 0.25);

        expect(worst?.vendorBytes).toBe(800 * KB);
        expect(Math.round((worst?.vendorRatio ?? 0) * 100)).toBe(80);
    });

    it('leaves a pure vendor chunk alone: that is the right answer, not the problem', () => {
        // Its hash does not move when the project changes, which is the entire point of splitting.
        expect(unstableChunks([chunk('vendor-B2.js', 900 * KB, 0)], 0.25)).toEqual([]);
    });

    it('leaves a chunk that is barely vendor alone', () => {
        expect(unstableChunks([chunk('screen-C3.js', 5 * KB, 95 * KB)], 0.25)).toEqual([]);
    });
});

describe('unhashableFiles', () => {
    const files = [
        { name: 'main-A1B2C3D4.js', bytes: 100 * KB },
        { name: 'favicon.ico', bytes: 4 * KB },
        { name: 'app.js', bytes: 50 * KB },
    ];

    it('names what carries no hash, and nothing that does', () => {
        const found = unhashableFiles(files, new Map(), new Set(['app.js']));

        expect(found.map(file => file.name)).toEqual(['app.js', 'favicon.ico']);
        expect(found[0]?.inPage).toBe(true);
    });

    /**
     * Nuxt writes one `_payload.json` per route. Three lines all reading `_payload.json` name
     * nothing at all, which is the same thing that was wrong with reporting a duplicate by its file
     * name: the folder already knows where each one is, and it was being thrown away on the way in.
     */
    it('names a file by where it sits, not by a name three files share', () => {
        const found = unhashableFiles(
            [
                { name: '_payload.json', path: 'orders/_payload.json', bytes: 69 },
                { name: '_payload.json', path: 'settings/_payload.json', bytes: 69 },
            ],
            new Map(),
            new Set(['_payload.json']),
        );

        expect(found.map(file => file.path)).toEqual(['orders/_payload.json', 'settings/_payload.json']);
        // The name is what every rule reads — the hash is written into it, and it is what the page
        // and the metafile key a file by — so it stays alongside rather than being replaced.
        expect(found.every(file => file.name === '_payload.json')).toBe(true);
        expect(found.every(file => file.inPage)).toBe(true);
    });

    it('falls back to the name when there is no folder to have a path in', () => {
        expect(unhashableFiles([{ name: 'app.js', bytes: 10 }], new Map(), new Set())[0]?.path).toBe('app.js');
    });

    it('catches the version pinned in the query, which is the case that is usually a mistake', () => {
        const found = unhashableFiles(
            [{ name: 'main-A1B2C3D4.js', bytes: 100 * KB }],
            new Map([['main-A1B2C3D4.js', '/main-A1B2C3D4.js?v=3']]),
            new Set(),
        );

        expect(found[0]?.reason).toBe('query');
    });
});

describe('unhashableFiles · a hash with no name in front of it', () => {
    const names = (files: { name: string; bytes: number }[]) =>
        unhashableFiles(files, new Map(), new Set()).map(file => file.name);

    it('takes SvelteKit, Nuxt and Rollup chunks for what they are: hashed', () => {
        // The whole name is the hash. `HASHED` wants a separator before it, so these were all
        // reported as uncacheable — nine files on SvelteKit, twelve on Nuxt, at `mid`.
        expect(
            names([
                { name: 'ChDGvcpR.js', bytes: 10 },
                { name: 'BauOL-29.js', bytes: 10 },
                { name: 'Dsnyc_s1.js', bytes: 10 },
                { name: 'BK_ek7ZU.js', bytes: 10 },
            ]),
        ).toEqual([]);
    });

    it('still reports a name somebody wrote, and a hash too short to be one', () => {
        expect(
            names([
                { name: 'version.json', bytes: 10 },
                { name: '_payload.json', bytes: 10 },
                { name: 'main.mjs', bytes: 10 },
                // Six characters after the separator is a version somebody typed, not a hash.
                { name: 'main-K7QW2X.js', bytes: 10 },
            ]),
        ).toEqual(['version.json', '_payload.json', 'main.mjs', 'main-K7QW2X.js']);
    });

    it('says nothing about a source map, an HTML document or a pre-compressed copy', () => {
        expect(
            names([
                { name: 'index.html', bytes: 10 },
                { name: 'app-A1B2C3D4.js.map', bytes: 10 },
                { name: 'app-A1B2C3D4.js.br', bytes: 10 },
            ]),
        ).toEqual([]);
    });
});
