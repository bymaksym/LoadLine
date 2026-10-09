import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { configReference } from '../src/app/core/config/config-reference';
import { configSchema } from '../src/app/core/config/config-schema';
import { RECOMMENDED } from '../src/app/core/criteria/criteria';
import { FINDING_KINDS } from '../src/app/core/findings/finding.types';

/**
 * The schema and the reference are written by this spec, like `fixtures/sample-report.json`: run
 * `pnpm test` after changing a threshold, a signal or a question, and both files follow. A stale
 * one fails here instead of telling an editor something the reader no longer believes.
 */
describe('loadline.schema.json and docs/CONFIG-REFERENCE.md', () => {
    const root = join(__dirname, '..');

    it('are the ones the code would write today', async () => {
        await expect(`${JSON.stringify(configSchema(), null, 4)}\n`).toMatchFileSnapshot(
            join(root, 'loadline.schema.json'),
        );
        await expect(configReference()).toMatchFileSnapshot(join(root, 'docs', 'CONFIG-REFERENCE.md'));
    });

    it('describe every threshold and every signal the reader accepts', () => {
        const properties = configSchema()['properties'] as Record<string, Record<string, unknown>>;
        const criteria = Object.keys(properties['criteria']?.['properties'] ?? {});
        const byName = (a: string, b: string): number => a.localeCompare(b);
        expect(criteria.toSorted(byName)).toEqual(Object.keys(RECOMMENDED.raw).toSorted(byName));
        expect(configReference()).toContain('`situationMissing`');
        expect(FINDING_KINDS.every(kind => configReference().includes(`\`${kind}\``))).toBe(true);
    });
});
