/**
 * The budget that should be in `angular.json`, and the block to paste.
 *
 * The tool already catches a budget that cannot fire and one that only warns. The natural next
 * question — "then what should it say?" — is where people get stuck, and it is answerable from what
 * is already on screen: the bootstrap as built, and the thresholds in Criteria.
 *
 * This is as far as "diagnose, do not fix" goes: the block is shown, and whoever decides pastes it.
 * Nothing here writes a file.
 *
 * **Which figure it is against.** Angular's `initial` budget counts the raw, uncompressed initial
 * JavaScript **and CSS**, whatever unit the report is being shown in. Comparing a suggestion
 * against a gzip figure would produce a budget about a third of the size of the thing it guards,
 * which would fail the next build for a reason having nothing to do with the build.
 */

const KB = 1024;

/** Rounded to something a person would write down. Nobody puts `maximumError: 731 kB` in a file. */
const roundKb = (bytes: number): number => {
    const kb = bytes / KB;
    const step = kb >= 1000 ? 100 : kb >= 200 ? 50 : 10;
    return Math.ceil(kb / step) * step;
};

export interface BudgetAdvice {
    /** Kilobytes, as the numbers would be written in the file. */
    warningKb: number;
    errorKb: number;
    /** What the suggestion is a margin over, in raw bytes. */
    currentBytes: number;
    /** The block to paste into the build `options` of `angular.json`. */
    snippet: string;
}

/**
 * @param initialRawBytes what the first load costs today in raw bytes — the bootstrap JavaScript
 *                        plus the stylesheets the page asks for, since Angular counts both.
 * @param headroom        how much room the warning leaves above today. A budget with no headroom
 *                        fires on the next feature and gets raised, which is how a budget stops
 *                        being read; too much and it never fires, which the report already flags.
 */
export const budgetAdvice = (initialRawBytes: number, headroom = 0.15): BudgetAdvice | null => {
    if (initialRawBytes <= 0) {
        return null;
    }

    const warningKb = roundKb(initialRawBytes * (1 + headroom));
    // The error is the line nobody wants to cross, not the next size up from the warning: it exists
    // to stop a pipeline, so it sits far enough above that crossing it is a decision, not a sprint.
    const errorKb = roundKb(initialRawBytes * (1 + headroom) * 1.3);

    const snippet = [
        '"budgets": [',
        '    {',
        '        "type": "initial",',
        `        "maximumWarning": "${warningKb}kB",`,
        `        "maximumError": "${errorKb}kB"`,
        '    }',
        ']',
    ].join('\n');

    return { warningKb, errorKb, currentBytes: initialRawBytes, snippet };
};

/**
 * The same for one screen: the budget on what a lazy chunk may weigh.
 *
 * Angular's `anyComponentStyle` and `bundle` budgets are per named bundle, which hashed chunk names
 * make useless. What is worth writing is `anyScript`, applied to every emitted script: the figure
 * to base it on is the heaviest screen's own code, not the average, or the budget fires on the
 * screen that was already the largest the day it was written.
 */
export const screenBudgetAdvice = (heaviestOwnRawBytes: number, headroom = 0.25): BudgetAdvice | null => {
    if (heaviestOwnRawBytes <= 0) {
        return null;
    }

    const warningKb = roundKb(heaviestOwnRawBytes * (1 + headroom));
    const errorKb = roundKb(heaviestOwnRawBytes * (1 + headroom) * 1.5);
    const snippet = [
        '{',
        '    "type": "anyScript",',
        `    "maximumWarning": "${warningKb}kB",`,
        `    "maximumError": "${errorKb}kB"`,
        '}',
    ].join('\n');

    return { warningKb, errorKb, currentBytes: heaviestOwnRawBytes, snippet };
};
