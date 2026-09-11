/**
 * One rule, tested in the three places it was broken: **the report names everything it found.**
 *
 * Grouping is allowed and encouraged — fifty-eight identical cards in a row bury every other signal
 * there is, so they became one card. Cutting is not: that same card used to name the worst plus
 * five and leave fifty-two screens unnamed, the search answered "80 of 400", and the diagnostics
 * somebody pastes into an issue carried ten lines of a breakdown with fourteen in it.
 *
 * Whoever opens this tool is looking for things to fix. A report that drops the fifty-third item
 * has decided for them which of their problems is worth their time, and that is not its decision.
 * Long is not the failure here; incomplete is.
 *
 * This file lives above the modules it tests on purpose: the rule is one rule, and a guard split
 * into three files next to three modules is a guard somebody deletes a third of.
 */

import { describe, expect, it } from 'vitest';
import { analyze } from './analysis/analysis';
import { type Metafile, type MetafileImport } from './analysis/metafile.types';
import { buildSearchIndex, countMatches, queryIndex } from './analysis/search';
import { diagnosticsOf } from './diagnostics/diagnostics';
import { plainText } from './findings/finding-plain';
import { buildFindings } from './findings/findings';
import { announcedIn } from './intake/index-html';
import { SAMPLE_PAGE, SAMPLE_STATS } from './sample/sample-build';

/**
 * A build of `screens` lazy routes, the first `heavy` of which drag a large chunk nothing else
 * uses. The heavy ones have to be a minority or they become the median and none of them is heavy.
 */
const manyScreens = (screens: number, heavy: number): Metafile => {
    const inputs: Metafile['inputs'] = {};
    const outputs: Metafile['outputs'] = {};
    const fromMain: MetafileImport[] = [];
    const mainChunkImports: MetafileImport[] = [];

    for (let index = 0; index < screens; index++) {
        const source = `src/app/features/s${index}/s${index}.page.ts`;
        const chunk = `s${index}.js`;
        const isHeavy = index < heavy;
        const library = `node_modules/lib${index}/index.js`;

        fromMain.push({ path: source, kind: 'dynamic-import' });
        mainChunkImports.push({ path: chunk, kind: 'dynamic-import' });

        inputs[source] = { bytes: 1000, imports: isHeavy ? [{ path: library, kind: 'import-statement' }] : [] };
        outputs[chunk] = {
            bytes: 1000,
            entryPoint: source,
            imports: isHeavy ? [{ path: `lib${index}.js`, kind: 'import-statement' }] : [],
            inputs: { [source]: { bytesInOutput: 1000 } },
        };

        if (isHeavy) {
            inputs[library] = { bytes: 400_000 };
            outputs[`lib${index}.js`] = { bytes: 400_000, inputs: { [library]: { bytesInOutput: 400_000 } } };
        }
    }

    inputs['src/main.ts'] = { bytes: 500, imports: fromMain };
    outputs['main.js'] = {
        bytes: 500,
        entryPoint: 'src/main.ts',
        imports: mainChunkImports,
        inputs: { 'src/main.ts': { bytesInOutput: 500 } },
    };

    return { inputs, outputs };
};

describe('a signal about many things names all of them', () => {
    const analysis = analyze(manyScreens(20, 8), null);
    const heavy = buildFindings(analysis, 'en', 'raw').find(finding => finding.kind === 'heavy');

    it('is one card, because fifty-eight of them would bury every other signal', () => {
        expect(buildFindings(analysis, 'en', 'raw').filter(finding => finding.kind === 'heavy')).toHaveLength(1);
        expect(heavy?.title).toContain('8 screens');
    });

    it('and that card names the eight, not the worst plus five', () => {
        const text = `${heavy?.title ?? ''} ${plainText(heavy?.body ?? '')}`;

        for (let index = 0; index < 8; index++) {
            expect(text, `screen s${index} is missing from the signal that is about it`).toContain(`s${index}`);
        }
    });
});

describe('the search answers with every match', () => {
    /** A hundred files sharing a substring: more than the eighty results the query used to return. */
    const wide = (): Metafile => {
        const inputs: Metafile['inputs'] = { 'src/main.ts': { bytes: 100 } };
        const held: Record<string, { bytesInOutput: number }> = { 'src/main.ts': { bytesInOutput: 100 } };

        for (let index = 0; index < 100; index++) {
            inputs[`src/app/widget-${index}.ts`] = { bytes: 200 };
            held[`src/app/widget-${index}.ts`] = { bytesInOutput: 200 };
        }

        return {
            inputs,
            outputs: {
                'main.js': { bytes: 20_100, entryPoint: 'src/main.ts', imports: [], inputs: held },
            },
        };
    };

    const index = buildSearchIndex(analyze(wide(), null));

    it('returns as many rows as it says there are matches', () => {
        expect(queryIndex(index, 'widget')).toHaveLength(countMatches(index, 'widget'));
        expect(queryIndex(index, 'widget').length).toBeGreaterThan(80);
    });
});

describe('the diagnostics carry the whole breakdown', () => {
    it('lists every bucket of the bootstrap, not the ten heaviest', () => {
        const announced = new Set(announcedIn(SAMPLE_PAGE));
        const analysis = analyze(SAMPLE_STATS, null, null, announced);
        const text = diagnosticsOf({
            meta: SAMPLE_STATS,
            analysis,
            error: null,
            derived: false,
            announced,
            mode: 'raw',
            mapFiles: null,
        });

        // The sample has more than ten, which is what made the old cut visible.
        expect(analysis.bootBuckets.length).toBeGreaterThan(10);
        // The bucket lines are the indented ones; what follows them is the note about the names.
        const listed = (text.split('bootstrap, heaviest first:', 2)[1] ?? '').split('\n');
        expect(listed.filter(line => line.startsWith('  '))).toHaveLength(analysis.bootBuckets.length);
    });
});
