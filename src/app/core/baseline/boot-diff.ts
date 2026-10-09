/**
 * The bootstrap as it is now, each package and folder marked with how it moved since the baseline:
 * what the map of the bootstrap tab draws when a previous build is loaded.
 *
 * `compare()` already knows the causes; this puts them on the shape of the current bootstrap, so
 * the area is what each part weighs **now** and the colour how it got there. A part that left is
 * not on the map — it has no area left to draw — and is listed apart, so nothing that moved is
 * missing from the picture.
 */

import { type Analysis } from '../analysis/analysis.types';
import { type BootCause, type Comparison } from './baseline.types';

export type DiffChange = 'new' | 'grew' | 'shrank' | 'same';

export interface DiffTile {
    name: string;
    own: boolean;
    /** Raw minified bytes now: the area. */
    bytes: number;
    change: DiffChange;
    /** Raw bytes it moved by; `0` when it did not, or by less than a cause counts. */
    diff: number;
}

export interface BootDiff {
    tiles: DiffTile[];
    /** What left the bootstrap, biggest first. */
    gone: BootCause[];
}

export const bootDiffOf = (analysis: Analysis, comparison: Comparison): BootDiff => {
    const causes = new Map(comparison.bootCauses.map(cause => [cause.name, cause]));
    const tiles = analysis.bootBuckets
        .filter(bucket => bucket.bytes > 0)
        .map((bucket): DiffTile => {
            const cause = causes.get(bucket.name);
            const change: DiffChange = cause && cause.change !== 'gone' ? cause.change : 'same';
            return {
                name: bucket.name,
                own: bucket.isProjectCode,
                bytes: bucket.bytes,
                change,
                diff: cause?.diff ?? 0,
            };
        })
        .toSorted((a, b) => b.bytes - a.bytes);

    return { tiles, gone: comparison.bootCauses.filter(cause => cause.change === 'gone') };
};
