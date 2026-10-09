/**
 * `loadline.json` and what it extends, read off a real folder: what goes wrong here is paths, which
 * is why it is not tested on objects.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readLoadlineConfig } from './read-config';

const folders: string[] = [];
const scratch = (): string => {
    const folder = mkdtempSync(join(tmpdir(), 'loadline-config-'));
    folders.push(folder);
    return folder;
};

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

const write = (path: string, file: Record<string, unknown>): void => {
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, JSON.stringify({ tool: 'loadline', version: 1, ...file }));
};

describe('readLoadlineConfig · extends', () => {
    it('follows a package, from the folder of the file that names it', async () => {
        const repo = scratch();
        write(join(repo, 'node_modules/@acme/loadline-config/loadline.json'), {
            gates: { maxBoot: '350kB' },
            packages: ['@angular/core'],
        });
        write(join(repo, 'loadline.json'), { extends: '@acme/loadline-config', packages: ['rxjs'] });

        const read = await readLoadlineConfig(null, repo);

        expect(read.config?.gates?.maxBoot).toBe(350 * 1024);
        expect(read.config?.packages).toEqual(['@angular/core', 'rxjs']);
        expect(read.name).toMatch(/^loadline\.json ← node_modules.+loadline\.json$/);
    });

    /** A base that extends another base has to work from any repository, not only from its own. */
    it('reads a path from the file that writes it, not from where the command runs', async () => {
        const repo = scratch();
        write(join(repo, 'shared/strict.json'), { gates: { failOn: 'high' } });
        write(join(repo, 'shared/base.json'), { extends: './strict.json', gates: { maxBoot: '300kB' } });
        write(join(repo, 'app/loadline.json'), { extends: ['../shared/base.json'] });

        const read = await readLoadlineConfig(join(repo, 'app/loadline.json'), repo);

        expect(read.config?.gates).toEqual({ failOn: 'high', maxBoot: 300 * 1024 });
    });

    it('lets the last name of a list win over the ones before it', async () => {
        const repo = scratch();
        write(join(repo, 'a.json'), { gates: { maxBoot: '100kB' } });
        write(join(repo, 'b.json'), { gates: { maxBoot: '200kB' } });
        write(join(repo, 'loadline.json'), { extends: ['./a.json', './b.json'] });

        const read = await readLoadlineConfig(null, repo);

        expect(read.config?.gates?.maxBoot).toBe(200 * 1024);
    });

    it('stops on a name it cannot find, a file that extends itself, and a bad gate in a base', async () => {
        const repo = scratch();
        write(join(repo, 'missing/loadline.json'), { extends: '@acme/not-installed' });
        write(join(repo, 'cycle/a.json'), { extends: './b.json' });
        write(join(repo, 'cycle/b.json'), { extends: './a.json' });
        write(join(repo, 'bad/base.json'), { gates: { maxBot: '350kB' } });
        write(join(repo, 'bad/loadline.json'), { extends: './base.json' });

        await expect(readLoadlineConfig(join(repo, 'missing/loadline.json'), repo)).rejects.toThrow(
            /@acme\/not-installed/,
        );
        await expect(readLoadlineConfig(join(repo, 'cycle/a.json'), repo)).rejects.toThrow(/extends itself/);
        await expect(readLoadlineConfig(join(repo, 'bad/loadline.json'), repo)).rejects.toThrow(/maxBot/);
    });

    it('names the file each problem is about, the base included', async () => {
        const repo = scratch();
        write(join(repo, 'base.json'), { criteria: { bootOkk: 1 } });
        write(join(repo, 'loadline.json'), { extends: './base.json', gate: {} });

        const { problems } = await readLoadlineConfig(null, repo);

        expect(problems).toHaveLength(2);
        expect(problems.find(line => line.includes('bootOkk'))).toMatch(/^base\.json: /);
        expect(problems.find(line => line.includes('"gate"'))).toMatch(/^loadline\.json: /);
    });

    it('only warns about a loadline.json in the folder that is somebody else’s file', async () => {
        const repo = scratch();
        writeFileSync(join(repo, 'loadline.json'), JSON.stringify({ name: 'something else' }));

        const read = await readLoadlineConfig(null, repo);

        expect(read.config).toBeNull();
        expect(read.problems).toHaveLength(1);
    });
});
