/**
 * What every block of the terminal report is drawn with: the width, the colours, wrapping and
 * tables. Apart from the blocks so that more than one file can draw one.
 */

export const WIDTH = 96;
const ESC = String.fromCodePoint(27);
const ANSI = new RegExp(String.raw`${ESC}\[\d+m`, 'g');

export type Paint = (value: string) => string;

/** The colours used, and no others. `plain` is what `--no-color` swaps every one of them for. */
export interface Palette {
    bold: Paint;
    dim: Paint;
    good: Paint;
    warn: Paint;
    bad: Paint;
}

const code =
    (open: number): Paint =>
    value =>
        `${ESC}[${open}m${value}${ESC}[0m`;
const plain: Paint = value => value;

export const paletteOf = (color: boolean): Palette =>
    color
        ? { bold: code(1), dim: code(90), good: code(32), warn: code(33), bad: code(31) }
        : { bold: plain, dim: plain, good: plain, warn: plain, bad: plain };

/** Length as the terminal shows it: padding a coloured string by its raw length breaks the column. */
export const visible = (value: string): number => value.replaceAll(ANSI, '').length;

export const pad = (value: string, width: number, right: boolean): string => {
    const filler = ' '.repeat(Math.max(0, width - visible(value)));
    return right ? `${filler}${value}` : `${value}${filler}`;
};

/** Wraps at word boundaries. A signal is a sentence, and a sentence cut mid-word is harder to read. */
export const wrap = (value: string, width: number): string[] => {
    const lines: string[] = [];
    const words = value.split(/\s+/).filter(Boolean);
    let current = '';

    for (const word of words) {
        if (current && current.length + word.length + 1 > width) {
            lines.push(current);
            current = word;
        } else {
            current = current ? `${current} ${word}` : word;
        }
    }
    if (current) {
        lines.push(current);
    }

    return lines;
};

export interface Column {
    head: string;
    /** Numbers read as a column only when they end in the same place. */
    right: boolean;
}

/** A table sized to its own content: nothing truncated, nothing padded to a guess. */
export const table = (columns: Column[], rows: string[][], palette: Palette): string[] => {
    const widths = columns.map((column, index) =>
        Math.max(column.head.length, ...rows.map(row => visible(row[index] ?? ''))),
    );
    const line = (cells: string[]): string =>
        cells.map((value, index) => pad(value, widths[index] ?? 0, columns[index]?.right ?? false)).join('  ');

    return [
        palette.dim(line(columns.map(column => column.head))),
        palette.dim(widths.map(width => '-'.repeat(width)).join('  ')),
        ...rows.map(row => line(row)),
    ];
};
