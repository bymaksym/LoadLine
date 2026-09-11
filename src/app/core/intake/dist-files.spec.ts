import { describe, expect, it } from 'vitest';
import { brotliSizes, isAsset, isContextName, sniff } from './dist-files';

const fileOf = (name: string, content = '', size?: number): File => {
    const file = new File([content], name);
    if (size !== undefined) {
        Object.defineProperty(file, 'size', { value: size });
    }
    return file;
};

describe('isAsset', () => {
    it('takes the files that travel to the browser and leaves the rest of the folder alone', () => {
        expect(isAsset('main-ABC.js')).toBe(true);
        expect(isAsset('styles.css')).toBe(true);
        expect(isAsset('main-ABC.js.map')).toBe(false);
        expect(isAsset('index.html')).toBe(false);
    });
});

describe('isContextName', () => {
    it('recognises the project files by name, pipelines included', () => {
        expect(isContextName('angular.json')).toBe(true);
        expect(isContextName('package.json')).toBe(true);
        expect(isContextName('.gitlab-ci.yml')).toBe(true);
        expect(isContextName('deploy.yaml')).toBe(true);
        expect(isContextName('stats.json')).toBe(false);
    });
});

describe('brotliSizes', () => {
    it('keys each pre-compressed file by the name of the file it compresses', () => {
        const sizes = brotliSizes([fileOf('main-ABC.js.br', '', 1234), fileOf('styles.css.br', '', 99)]);

        expect(sizes.get('main-ABC.js')).toBe(1234);
        expect(sizes.get('styles.css')).toBe(99);
    });

    it('ignores anything else in the folder', () => {
        expect(brotliSizes([fileOf('main-ABC.js', 'x'), fileOf('index.html.br', 'x')]).size).toBe(0);
    });
});

describe('sniff', () => {
    it('reads the name first: a project file needs no parsing', async () => {
        await expect(sniff(fileOf('angular.json', 'not even json'))).resolves.toBe('context');
    });

    it('tells a Loadline export from a metafile by what is inside', async () => {
        const snapshot = JSON.stringify({
            tool: 'loadline',
            version: 1,
            mode: 'raw',
            boot: 1000,
            screens: [],
            bootPackages: [],
        });
        const metafile = JSON.stringify({ inputs: {}, outputs: { 'main.js': { bytes: 1 } } });

        await expect(sniff(fileOf('previous.json', snapshot))).resolves.toBe('baseline');
        await expect(sniff(fileOf('stats.json', metafile))).resolves.toBe('stats');
    });

    it('gives up on anything it cannot place, instead of guessing', async () => {
        await expect(sniff(fileOf('notes.txt', 'hello'))).resolves.toBe('unknown');
        await expect(sniff(fileOf('broken.json', '{'))).resolves.toBe('unknown');
    });
});
