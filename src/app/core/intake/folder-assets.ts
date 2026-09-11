/**
 * The browser's half of reading the rest of the build folder.
 *
 * The command does the same thing off a disk in `cli/read-build.ts`; both of them end up calling
 * `readAssets`, which is where the rules live. What is here is only the part that differs: a
 * `FileList` instead of paths, `crypto.subtle` instead of `node:crypto`.
 *
 * It is a module of its own rather than four more methods on the store, for the reason the store's
 * own line limit exists: the store is what holds state, and reading a folder is not state.
 */

import { readAssets } from '../assets/assets';
import { type AssetFile, type AssetReport } from '../assets/assets.types';
import { hashOf, isSearchable } from './dist-files';
import { announcedIn, assetsIn, stylesIn } from './index-html';

/**
 * @param files the whole folder, not only what was compressed: this is the half of it the tool
 *              never looked at.
 * @param html  `index.html`, when the folder carries one. Without it nothing is known about what
 *              the page asks for, and the first-trip figure comes out as zero rather than a guess.
 * @param weigh what each file weighs in the unit the report is shown in, so the first trip and the
 *              headline are not the same bytes quoted in two units.
 */
export interface FolderRead {
    report: AssetReport;
    /** The chunk and stylesheet texts, handed on so nothing opens them a second time. */
    texts: ReadonlyMap<string, string>;
    /** The `.js.map` files, for what a published source map gives away. */
    maps: { name: string; text: string }[];
}

export const readFolderAssets = async (
    files: readonly File[],
    html: string | null,
    weigh: ReadonlyMap<string, number>,
    onProgress?: (done: number, total: number) => void,
): Promise<FolderRead> => {
    const inside = (file: File): string => (file.webkitRelativePath || '').split('/').slice(1).join('/') || file.name;
    const list: AssetFile[] = files.map(file => ({ path: inside(file), name: file.name, bytes: file.size }));

    const texts = new Map<string, string>();
    const maps: { name: string; text: string }[] = [];
    const hashes = new Map<string, string>();
    let done = 0;

    for (const file of files) {
        if (/\.m?js\.map$/i.test(file.name)) {
            maps.push({ name: file.name, text: await file.text() });
        } else if (isSearchable(file.name)) {
            texts.set(file.name, await file.text());
        } else {
            // Everything else is what a duplicate would be: a font, a picture, a video. Reading a
            // chunk to hash it would compare files whose names already carry a content hash.
            const hash = await hashOf(file);
            if (hash) {
                // Keyed by path: a folder per route writes several `index.html`, and keyed by name
                // they would collapse onto one hash and come out as copies of each other.
                hashes.set(inside(file), hash);
            }
        }

        done += 1;
        onProgress?.(done, files.length);
    }

    const named = html ? assetsIn(html) : { referenced: [], preloaded: [], prefetched: [], hrefs: [] };

    const report = readAssets({
        files: list,
        html,
        texts,
        hashes,
        inPage: new Set([...named.referenced, ...(html ? announcedIn(html) : []), ...(html ? stylesIn(html) : [])]),
        preloaded: new Set(named.preloaded),
        prefetched: new Set(named.prefetched),
        bootChunks: new Set<string>(),
        weigh,
    });

    // Only the code goes on to the scan: a manifest or a `robots.txt` is worth searching for file
    // names and is not what a browser executes.
    return { report, texts: new Map([...texts].filter(([name]) => /\.(?:m?js|css)$/i.test(name))), maps };
};
