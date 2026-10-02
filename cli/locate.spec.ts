/**
 * The three things the command now does without being told: find the metafile and the browser
 * folder inside a build root, remember the last run, and write the page with the build in it.
 * Each is checked against a real folder on disk, because what they get wrong is paths.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type Snapshot } from '../src/app/core/baseline/baseline.types';
import { parseArgs } from './args';
import { embedFolder, writeHtmlReport } from './html-report';
import { locateBuild } from './locate';
import { readLastRun, writeLastRun } from './memory';

const folders: string[] = [];
const scratch = (): string => {
    const folder = mkdtempSync(join(tmpdir(), 'loadline-'));
    folders.push(folder);
    return folder;
};

afterEach(() => {
    for (const folder of folders.splice(0)) {
        rmSync(folder, { recursive: true, force: true });
    }
});

describe('locateBuild', () => {
    it('finds browser-stats.json and browser/ inside the root of an Angular 22.2 build', async () => {
        const root = scratch();
        mkdirSync(join(root, 'browser'));
        writeFileSync(join(root, 'browser-stats.json'), '{}');
        writeFileSync(join(root, 'stats.json'), '{}');

        const found = await locateBuild(root, null);
        // The newer name wins when an old one was left next to it.
        expect(found.target).toBe(join(root, 'browser-stats.json'));
        expect(found.dist).toBe(join(root, 'browser'));
    });

    it('falls back to stats.json, and to reading the browser folder when there is no metafile', async () => {
        const older = scratch();
        writeFileSync(join(older, 'stats.json'), '{}');
        const located = await locateBuild(older, null);
        expect(located.target).toBe(join(older, 'stats.json'));

        const bare = scratch();
        mkdirSync(join(bare, 'browser'));
        expect(await locateBuild(bare, null)).toEqual({
            target: join(bare, 'browser'),
            dist: null,
            found: [join(bare, 'browser')],
        });
    });

    it('leaves anything typed by hand alone', async () => {
        const root = scratch();
        writeFileSync(join(root, 'browser-stats.json'), '{}');
        expect(await locateBuild(root, 'elsewhere')).toEqual({ target: root, dist: 'elsewhere', found: [] });
        expect(await locateBuild(join(root, 'browser-stats.json'), null)).toEqual({
            target: join(root, 'browser-stats.json'),
            dist: null,
            found: [],
        });
    });
});

describe('the last run', () => {
    const snapshot = {
        tool: 'loadline',
        version: 1,
        mode: 'gzip',
        name: 'x',
        date: '2026-10-02T09:00:00.000Z',
        boot: 156_000,
        bootPackages: [],
        screens: [],
    } as unknown as Snapshot;

    it('is kept in node_modules/.cache/loadline and read back for the same build', async () => {
        const project = scratch();
        mkdirSync(join(project, 'node_modules'));

        await writeLastRun(project, join(project, 'dist/app'), snapshot);
        const last = await readLastRun(project, join(project, 'dist/app'));
        expect(last?.boot).toBe(156_000);
        // Another build of the same workspace has its own memory.
        expect(await readLastRun(project, join(project, 'dist/other'))).toBeNull();
    });

    it('is nothing at all where there is no node_modules', async () => {
        const project = scratch();
        await writeLastRun(project, 'dist', snapshot);
        expect(await readLastRun(project, 'dist')).toBeNull();
    });
});

describe('--html', () => {
    it('is a flag with a value, and --open needs it', () => {
        const parsed = parseArgs(['dist', '--html', 'report.html', '--open']);
        expect(parsed.ok && parsed.options.html).toBe('report.html');
        expect(parsed.ok && parsed.options.open).toBe(true);

        const lonely = parseArgs(['dist', '--open']);
        expect(lonely.ok ? '' : lonely.message).toContain('--html');
        expect(parseArgs(['dist', '--no-cache']).ok).toBe(true);
    });

    it('writes the page with the build inside, where no file of the build can close its script', async () => {
        const build = scratch();
        writeFileSync(join(build, 'main.js'), 'const s="</script><script>alert(1)</script>";');
        writeFileSync(join(build, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        const out = join(scratch(), 'report.html');

        await writeHtmlReport(out, {
            version: 1,
            lang: 'es',
            stats: null,
            folder: await embedFolder(build),
            extras: [],
            baseline: null,
        });

        const html = readFileSync(out, 'utf8');
        // After the page's own code, all of it: the inlined bundle mentions `</body>` in its strings,
        // and the first one is inside a script.
        const page = readFileSync(join(__dirname, '..', 'loadline.html'), 'utf8');
        const at = html.indexOf('<script type="application/json" id="loadline-build">');
        expect(html.slice(0, at)).toBe(page.slice(0, page.lastIndexOf('</body>')));
        const payload =
            /<script type="application\/json" id="loadline-build">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
        expect(payload).not.toContain('</script>');
        const parsed = JSON.parse(payload) as { lang: string; folder: { files: { path: string; b64?: string }[] } };
        expect(parsed.lang).toBe('es');
        expect(parsed.folder.files.find(file => file.path === 'logo.png')?.b64).toBe('iVBORw==');
    });
});
