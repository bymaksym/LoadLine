/**
 * The shape of the split: not how much the build weighs, but how it is divided.
 *
 * Every other figure in the report judges one thing at a time — this chunk, that screen, this
 * package. None of them answers the question somebody asks after reading a list of a hundred
 * chunks: **is this well divided?** More chunks is not better and fewer is not better either;
 * what matters is that what a screen needs at once comes in few pieces and what it may never need
 * comes apart. That is a property of the distribution, not of any single row.
 *
 * Two numbers say it. **Concentration**: how much of a zone sits in its largest chunk — 93 % in
 * one file and fourteen crumbs around it is a different problem from fifteen even chunks.
 * **Crumbs**: how many pieces are small enough that asking for them costs about what they hold.
 *
 * Where the lines are drawn is not decided here: the two thresholds come in from the criteria, so
 * they can be read and changed next to every other one instead of hiding in this file.
 */

import { type Criteria } from '../criteria/criteria.types';
import { type Zone } from './analysis.types';

export interface ZoneShape {
    zone: Zone;
    bytes: number;
    files: number;
    /** Bytes of the largest chunk over the zone's total, 0-1. `0` for an empty zone. */
    concentration: number;
    /** Chunks under the crumb line, and what they add up to. */
    crumbs: number;
    crumbBytes: number;
}

const ZONES: Zone[] = ['boot', 'shared', 'own'];

/**
 * @param chunks the chunks of the build with the zone that pays for each one, which is what the
 *               analysis tree already carries.
 */
export const shapeOf = (
    chunks: readonly { zone?: Zone; bytes: number }[],
    limits: Pick<Criteria, 'crumbMaxBytes'>,
): ZoneShape[] =>
    ZONES.map(zone => {
        const own = chunks.filter(chunk => chunk.zone === zone);
        const bytes = own.reduce((total, chunk) => total + chunk.bytes, 0);
        const largest = own.reduce((max, chunk) => Math.max(max, chunk.bytes), 0);
        const crumbs = own.filter(chunk => chunk.bytes < limits.crumbMaxBytes);

        return {
            zone,
            bytes,
            files: own.length,
            concentration: bytes > 0 ? largest / bytes : 0,
            crumbs: crumbs.length,
            crumbBytes: crumbs.reduce((total, chunk) => total + chunk.bytes, 0),
        };
    }).filter(shape => shape.files > 0);

export interface Granularity {
    files: number;
    /** How many of them, largest first, make up most of the bytes. */
    heavy: number;
    /** What those few actually are, 0-1. */
    heavyShare: number;
    crumbs: number;
    crumbBytes: number;
}

/**
 * The same reading as `shapeOf`, applied to one download instead of to the build: a screen that
 * pulls in thirty files where four of them are 85 % of the weight is not "thirty files", it is four
 * files and twenty-six that came along.
 */
export const granularityOf = (
    sizes: readonly number[],
    limits: Pick<Criteria, 'crumbMaxBytes' | 'heavyShareRatio'>,
): Granularity => {
    const total = sizes.reduce((sum, bytes) => sum + bytes, 0);
    const sorted = [...sizes].toSorted((a, b) => b - a);

    let covered = 0;
    let heavy = 0;
    for (const bytes of sorted) {
        if (covered >= total * limits.heavyShareRatio) {
            break;
        }
        covered += bytes;
        heavy += 1;
    }

    const crumbs = sizes.filter(bytes => bytes < limits.crumbMaxBytes);
    return {
        files: sizes.length,
        heavy,
        heavyShare: total > 0 ? covered / total : 0,
        crumbs: crumbs.length,
        crumbBytes: crumbs.reduce((sum, bytes) => sum + bytes, 0),
    };
};
