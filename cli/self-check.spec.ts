/**
 * The self-check against a real build, in both languages: it is what a pipeline prints when the
 * two readers of the bootstrap disagree, and under `--lang es` it was the one answer left in English.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze } from '../src/app/core/analysis/analysis';
import { readDist } from './read/read-build';
import { selfCheck } from './self-check';
import { ERROR_TEXT } from './text/text-errors';

const FOLDER = join(process.cwd(), 'fixtures', 'vite-app', 'dist');

describe('selfCheck', () => {
    it('passes on a build both readers agree about, in the language asked for', async () => {
        const dist = await readDist(FOLDER, true);
        const meta = dist.graph!.meta;
        const analysis = analyze(meta, null, null, dist.announced, null, undefined, dist.graph!.parallel);

        const english = selfCheck(meta, analysis, dist.announced);
        const spanish = selfCheck(meta, analysis, dist.announced, ERROR_TEXT.es);

        expect(english.ok).toBe(true);
        expect(english.report).toMatch(/^Self-check passed/);
        expect(spanish.ok).toBe(true);
        expect(spanish.report).toMatch(/^Self-check correcto: el grafo de imports y el index\.html coinciden/);
    });

    it('cannot run without the page, and says so in Spanish too', async () => {
        const dist = await readDist(FOLDER, true);
        const meta = dist.graph!.meta;
        const analysis = analyze(meta, null, null, null);

        const result = selfCheck(meta, analysis, null, ERROR_TEXT.es);

        expect(result).toMatchObject({ ok: false, ran: false });
        expect(result.report).toContain('necesita el index.html');
    });
});
