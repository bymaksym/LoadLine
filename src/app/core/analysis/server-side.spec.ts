/**
 * Telling the two halves of a rendered build apart.
 *
 * `browserSide()` used to read one thing: a `server/` in the path. Angular wrote that for years and
 * most SSR setups still do, which is why nothing noticed that Angular 22 stopped: it writes
 * `main.server.mjs`, `server.mjs`, `polyfills.server.mjs` and nine shared chunks flat, next to the
 * browser ones, in the same metafile.
 *
 * What that did to a report is not subtle, and it is why this file exists: three screens became
 * six — every one counted once per side — a bootstrap of 105 kB became 744, and `express`'s
 * dependencies were reported as packages the browser downloads twice.
 *
 * The rule that replaces the name is the folder: the one somebody serves to a browser *is* the
 * answer to "what does a browser download".
 */

import { describe, expect, it } from 'vitest';
import { analyze } from './analysis';
import { browserSide } from './entries';
import { type Metafile } from './metafile.types';

/** One build, both sides, flat names: the shape Angular 22 writes with SSR on. */
const BOTH_SIDES: Metafile = {
    inputs: {
        'src/main.ts': { bytes: 300, imports: [{ path: 'src/pages/home.page.ts', kind: 'dynamic-import' }] },
        'src/pages/home.page.ts': { bytes: 400 },
        'node_modules/express/index.js': { bytes: 90_000 },
    },
    outputs: {
        'main-BROWSER.js': {
            bytes: 300,
            entryPoint: 'src/main.ts',
            imports: [{ path: 'home-BROWSER.js', kind: 'dynamic-import' }],
            inputs: { 'src/main.ts': { bytesInOutput: 300 } },
        },
        'home-BROWSER.js': {
            bytes: 400,
            entryPoint: 'src/pages/home.page.ts',
            inputs: { 'src/pages/home.page.ts': { bytesInOutput: 400 } },
        },
        'main.server.mjs': {
            bytes: 90_000,
            entryPoint: 'angular:main-server:angular:main-server',
            imports: [{ path: 'home-SERVER.mjs', kind: 'dynamic-import' }],
            inputs: { 'node_modules/express/index.js': { bytesInOutput: 90_000 } },
        },
        'home-SERVER.mjs': {
            bytes: 400,
            entryPoint: 'src/pages/home.page.ts',
            inputs: { 'src/pages/home.page.ts': { bytesInOutput: 400 } },
        },
    },
};

/** What the browser folder holds, keyed the way the compressed sizes are: by file name. */
const BROWSER_FOLDER = new Set(['main-BROWSER.js', 'home-BROWSER.js']);

describe('browserSide', () => {
    it('leaves out what the browser folder does not hold', () => {
        const { outputs, serverOutputs } = browserSide(BOTH_SIDES.outputs, BROWSER_FOLDER);

        expect(Object.keys(outputs)).toEqual(['main-BROWSER.js', 'home-BROWSER.js']);
        expect(serverOutputs).toBe(2);
    });

    it('still reads a `server/` path, which is what every other SSR setup writes', () => {
        const withFolder: Metafile['outputs'] = {
            'browser/main.js': { bytes: 10, entryPoint: 'src/main.ts', inputs: {} },
            'server/main.server.mjs': { bytes: 900, entryPoint: 'src/main.server.ts', inputs: {} },
        };

        expect(browserSide(withFolder).serverOutputs).toBe(1);
    });

    /**
     * A folder from a different build than the stats file makes every name mismatch. Reading that
     * as "this application has no outputs" would turn a mistake anybody can make into an empty
     * report; reading it whole is what the old rule did and is no worse.
     */
    it('drops nothing when the folder matches nothing, rather than emptying the report', () => {
        const { outputs, serverOutputs } = browserSide(BOTH_SIDES.outputs, new Set(['from-another-build.js']));

        expect(Object.keys(outputs)).toHaveLength(4);
        expect(serverOutputs).toBe(0);
    });

    it('does nothing at all without a folder, which is the metafile-only case', () => {
        expect(browserSide(BOTH_SIDES.outputs).serverOutputs).toBe(0);
    });
});

describe('the report of a build with both sides in it', () => {
    /** The gzip map is built from every asset of the folder, so its keys are the folder. */
    const sizes = new Map([...BROWSER_FOLDER].map(file => [file, 100]));

    it('counts each screen once, not once per side', () => {
        expect(analyze(BOTH_SIDES, sizes).screens.map(screen => screen.label)).toEqual(['home']);
    });

    /**
     * Without a folder there is nothing measured to tell the sides apart, and the report describes
     * whichever entry reaches the most — which on a real Angular SSR build is the server's, because
     * it is the bigger half. Pinned rather than hidden: what the reader gets in that case is the
     * "chunks this report cannot reach" signal, which names the other side and says to pass the
     * folder.
     */
    it('reads the wrong half from a stats file alone, and the bootstrap says so', () => {
        const alone = analyze(BOTH_SIDES, null);

        expect(alone.serverOutputs).toBe(0);
        expect(alone.bootBytes).toBeGreaterThan(analyze(BOTH_SIDES, sizes).bootBytes);
    });

    it('says how many outputs it left out, because half a build going missing has to be visible', () => {
        expect(analyze(BOTH_SIDES, sizes).serverOutputs).toBe(2);
    });

    it('keeps the server side out of the bootstrap, which is what every screen figure builds on', () => {
        expect(analyze(BOTH_SIDES, sizes).bootChunks).toEqual(['main-BROWSER.js']);
    });
});
