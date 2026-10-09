import { describe, expect, it } from 'vitest';
import { hashOf } from './dist-files';
import { filesOf } from './embedded';

describe('filesOf', () => {
    /**
     * `--html` carries a binary as its size and hash. The page reads it back as a stand-in of the
     * same size, and the hash it compares is the one the command computed, not one of the filler.
     */
    it('gives a binary its size, its path and the hash it came with', async () => {
        const [font, copy] = filesOf({
            name: 'browser',
            files: [
                { path: 'media/a.woff2', size: 12, sha256: 'ab'.repeat(32) },
                { path: 'media/b.woff2', size: 12, sha256: 'ab'.repeat(32) },
            ],
        });

        expect(font?.size).toBe(12);
        expect(font?.webkitRelativePath).toBe('browser/media/a.woff2');
        expect(await hashOf(font!)).toBe('ab'.repeat(32));
        // Two fillers of the same size are two different files unless their hashes say otherwise.
        expect(await hashOf(copy!)).toBe(await hashOf(font!));
    });

    it('still reads a report written before, with the bytes in base64', async () => {
        const [file] = filesOf({ name: 'browser', files: [{ path: 'logo.png', b64: btoa('png!') }] });

        expect(await file?.text()).toBe('png!');
    });
});
