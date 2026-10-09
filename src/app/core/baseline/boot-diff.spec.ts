import { describe, expect, it } from 'vitest';
import { analyze } from '../analysis/analysis';
import { SAMPLE_STATS } from '../sample/sample-build';
import { compare, snapshotOf } from './baseline';
import { bootDiffOf } from './boot-diff';

const analysis = analyze(SAMPLE_STATS, null);
const now = snapshotOf(analysis, 'raw', 'now.json');

/** The same build a few weeks earlier: no CDK in the bootstrap, a smaller date-fns, and left-pad. */
const before = {
    ...now,
    bootPackages: [
        ...now.bootPackages
            .filter(pkg => pkg.name !== '@angular/cdk')
            .map(pkg => (pkg.name === 'date-fns' ? { ...pkg, bytes: pkg.bytes - 6000 } : pkg)),
        { name: 'left-pad', bytes: 2000 },
    ],
};

describe('bootDiffOf', () => {
    const diff = bootDiffOf(analysis, compare(now, before));
    const tile = (name: string) => diff.tiles.find(entry => entry.name === name);

    it('marks each part of the bootstrap with how it moved, the area being what it weighs now', () => {
        expect(tile('@angular/cdk')?.change).toBe('new');
        expect(tile('date-fns')).toMatchObject({ change: 'grew', diff: 6000 });
        expect(tile('@angular/core')?.change).toBe('same');
        expect(diff.tiles.map(entry => entry.bytes)).toEqual(
            diff.tiles.map(entry => entry.bytes).toSorted((a, b) => b - a),
        );
    });

    it('lists what left apart, since it has no area left to draw', () => {
        expect(diff.gone.map(cause => cause.name)).toEqual(['left-pad']);
        expect(tile('left-pad')).toBeUndefined();
    });
});
