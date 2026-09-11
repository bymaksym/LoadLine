/** Sorting state shared by every table that has a sortable header. */

export type SortDir = 'asc' | 'desc';

export interface Sort<K extends string> {
    key: K;
    dir: SortDir;
}

/**
 * What pressing a column header does: the column already sorting flips direction, any other one
 * starts at the direction that column is normally read in.
 *
 * The direction is the half that was missing. Before this the sort keys were six separate buttons
 * that set a key and nothing else, so "the cheapest screen" meant scrolling to the bottom of
 * twenty rows.
 */
export const pickSort = <K extends string>(current: Sort<K>, key: K, natural: SortDir): Sort<K> =>
    current.key === key ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: natural };

/** `1` or `-1`, to multiply a comparison by. */
export const sortSign = (dir: SortDir): number => (dir === 'asc' ? 1 : -1);
