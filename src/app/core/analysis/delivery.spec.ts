import { describe, expect, it } from 'vitest';
import { criticalChainOf, deliveryOf, depthOf, startupOf, wavesFrom, widthOf } from './delivery';
import { type Metafile } from './metafile.types';

/** A chunk with its outgoing edges. `lazy` targets are the ones behind a dynamic import. */
const chunk = (statics: string[] = [], lazy: string[] = []): Metafile['outputs'][string] => ({
    bytes: 100,
    imports: [
        ...statics.map(path => ({ path, kind: 'import-statement' })),
        ...lazy.map(path => ({ path, kind: 'dynamic-import' })),
    ],
});

describe('deliveryOf', () => {
    it('only the bootstrap comes down with the first load', () => {
        expect(deliveryOf('boot')).toBe('eager');
        expect(deliveryOf('shared')).toBe('lazy');
        expect(deliveryOf('own')).toBe('lazy');
    });
});

describe('wavesFrom', () => {
    it('counts a chain of static imports as one round trip each', () => {
        const outputs = {
            'main.js': chunk([], ['screen.js']),
            'screen.js': chunk(['shared.js']),
            'shared.js': chunk(['deep.js']),
            'deep.js': chunk(),
        };

        const waves = wavesFrom(outputs, ['screen.js'], new Set(['main.js']));

        expect(waves.get('screen.js')).toBe(1);
        expect(waves.get('shared.js')).toBe(2);
        expect(waves.get('deep.js')).toBe(3);
        expect(depthOf(waves)).toBe(3);
    });

    it('a chunk reached from two places counts at the first parent that reveals it', () => {
        const outputs = {
            'screen.js': chunk(['a.js', 'shared.js']),
            'a.js': chunk(['shared.js']),
            'shared.js': chunk(),
        };

        expect(wavesFrom(outputs, ['screen.js']).get('shared.js')).toBe(2);
    });

    it('does not follow dynamic imports: a deferred block is another navigation, not another trip', () => {
        const outputs = {
            'screen.js': chunk([], ['block.js']),
            'block.js': chunk(),
        };

        const waves = wavesFrom(outputs, ['screen.js']);

        expect(waves.has('block.js')).toBe(false);
        expect(depthOf(waves)).toBe(1);
    });

    it('stops at what is already downloaded, which is what the bootstrap is to a screen', () => {
        const outputs = {
            'screen.js': chunk(['boot.js']),
            'boot.js': chunk(['vendor.js']),
            'vendor.js': chunk(),
        };

        const waves = wavesFrom(outputs, ['screen.js'], new Set(['boot.js', 'vendor.js']));

        expect([...waves.keys()]).toEqual(['screen.js']);
    });

    it('is empty when there is nothing to walk', () => {
        expect(depthOf(wavesFrom({}, []))).toBe(0);
    });
});

describe('startupOf', () => {
    const outputs = {
        'main.js': chunk(['vendor.js']),
        'vendor.js': chunk(['polyfills.js']),
        'polyfills.js': chunk(),
    };
    const boot = new Set(['main.js', 'vendor.js', 'polyfills.js']);

    it('one round trip when the page announces every bootstrap chunk', () => {
        const startup = startupOf(outputs, boot, boot);

        expect(startup).toEqual({ waves: 1, discovered: [], byWave: [], width: 3, critical: [] });
    });

    it('a chunk the page does not announce arrives a round trip later', () => {
        const startup = startupOf(outputs, boot, new Set(['main.js', 'vendor.js']));

        expect(startup).toEqual({
            waves: 2,
            discovered: ['polyfills.js'],
            byWave: [['polyfills.js']],
            width: 2,
            // The chain that costs the extra trip, which is the only set worth naming in the page.
            critical: ['vendor.js', 'polyfills.js'],
        });
    });

    it('two levels of unannounced imports are two extra round trips', () => {
        const startup = startupOf(outputs, boot, new Set(['main.js']));

        expect(startup?.waves).toBe(3);
        expect(startup?.discovered).toEqual(['vendor.js', 'polyfills.js']);
        // Grouped, the two are a chain and not a pair: one trip each, not one between them.
        expect(startup?.byWave).toEqual([['vendor.js'], ['polyfills.js']]);
    });

    it('separates chunks that share a trip from chunks that queue behind each other', () => {
        const wide = {
            'main.js': chunk(['a.js', 'b.js']),
            'a.js': chunk(),
            'b.js': chunk(),
        };
        const startup = startupOf(wide, new Set(['main.js', 'a.js', 'b.js']), new Set(['main.js']));

        // Two chunks late and still only one extra round trip: naming one of them saves nothing.
        expect(startup?.waves).toBe(2);
        expect(startup?.byWave).toEqual([['a.js', 'b.js']]);
    });

    it('says nothing rather than guessing when the page announces no chunk of this build', () => {
        expect(startupOf(outputs, boot, new Set(['other-build.js']))).toBeNull();
    });
});

describe('widthOf and criticalChainOf · depth is not the whole shape', () => {
    it('counts the busiest trip, which a depth figure hides', () => {
        const wide = {
            'main.js': chunk(['a.js', 'b.js', 'c.js']),
            'a.js': chunk(),
            'b.js': chunk(),
            'c.js': chunk(),
        };

        expect(widthOf(wavesFrom(wide, ['main.js']))).toBe(3);
    });

    it('names the chain that actually costs trips, and leaves the rest of the trip out of it', () => {
        // `b.js` and `c.js` share the second trip with `a.js`; only `a.js` leads anywhere deeper,
        // so naming `b` or `c` in the page removes no wait at all.
        const outputs = {
            'main.js': chunk(['a.js', 'b.js', 'c.js']),
            'a.js': chunk(['deep.js']),
            'b.js': chunk(),
            'c.js': chunk(),
            'deep.js': chunk(),
        };

        expect(criticalChainOf(outputs, wavesFrom(outputs, ['main.js']))).toEqual(['main.js', 'a.js', 'deep.js']);
    });

    it('has no chain to name when everything arrives on the first trip', () => {
        expect(criticalChainOf({ 'main.js': chunk() }, wavesFrom({ 'main.js': chunk() }, ['main.js']))).toEqual([]);
    });
});
