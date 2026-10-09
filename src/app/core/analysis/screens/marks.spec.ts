import { describe, expect, it } from 'vitest';
import { type Metafile } from '../metafile.types';
import { configuredMarks } from './marks';

const meta: Metafile = {
    inputs: {},
    outputs: {
        'main.js': { bytes: 1, entryPoint: 'src/main.ts' },
        'chunk-A.js': { bytes: 1, entryPoint: 'src/admin/users.ts' },
        'chunk-B.js': { bytes: 1, entryPoint: 'src/home/chart.widget.ts' },
        'chunk-C.js': { bytes: 1 },
    },
};

describe('configuredMarks', () => {
    it('marks every lazy entry a pattern of build.screens names, the first pattern deciding', () => {
        const marks = configuredMarks({ '*.widget.ts': 'piece', 'src/admin/*': 'screen', 'src/*': 'piece' }, meta);

        expect(marks).toEqual(
            new Map([
                ['src/main.ts', 'block'],
                ['src/admin/users.ts', 'screen'],
                ['src/home/chart.widget.ts', 'block'],
            ]),
        );
    });

    it('marks nothing when the file says nothing', () => {
        expect(configuredMarks(undefined, meta).size).toBe(0);
    });
});
