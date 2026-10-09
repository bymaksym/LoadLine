/**
 * The screens `loadline.json` says are screens, and the pieces it says are pieces.
 *
 * Telling a screen from a piece of one is partly done by reading file names (`entries.ts`), and no
 * set of names fits every project. The page has had a button for each row since the rules were
 * written; this is the same correction written down once, in the file the team already reviews,
 * so the command reads it too and nobody clicks it again in their own browser.
 */

import { type BuildHints } from '../../config/loadline-config.types';
import { namedBy } from '../../format/format.utils';
import { type ScreenMark } from '../analysis.types';
import { type Metafile } from '../metafile.types';

/**
 * Every lazy entry of the build a pattern of `build.screens` names, with what it says it is. The
 * first pattern that names an entry decides, in the order the file lists them.
 */
export const configuredMarks = (screens: BuildHints['screens'], meta: Metafile): Map<string, ScreenMark> => {
    const marks = new Map<string, ScreenMark>();
    const patterns = Object.entries(screens ?? {});
    if (patterns.length === 0) {
        return marks;
    }

    for (const output of Object.values(meta.outputs)) {
        const source = output.entryPoint;
        const said = source ? patterns.find(([pattern]) => namedBy(pattern, source)) : undefined;
        if (source && said && !marks.has(source)) {
            marks.set(source, said[1] === 'piece' ? 'block' : 'screen');
        }
    }

    return marks;
};
