/**
 * A build written into the page by `loadline --html`, and the files the page rebuilds out of it.
 *
 * The command and the page share this shape so neither can drift from the other: the command fills
 * it with what it read off the disk, the page turns it back into the `File` objects a drop would
 * have handed over, and from there everything goes through the doors it always went through.
 */

import { type Lang } from '../i18n/ui-strings';
import { asRecord } from '../json/json.utils';

/** One file of the build folder. `text` for what is text, `b64` for bytes, `size` for a stand-in. */
export interface EmbeddedFile {
    path: string;
    text?: string;
    b64?: string;
    /**
     * The size on disk when the content was left out: a pre-compressed `.br` matters only for its
     * size, and a large video only for its size and its identity. Those travel as a filler of the
     * same length, unique to the file, which keeps every figure identical to the command's.
     */
    size?: number;
}

/** What `#loadline-build` holds. */
export interface EmbeddedBuild {
    version: 1;
    lang: Lang;
    stats: { name: string; text: string } | null;
    folder: { name: string; files: EmbeddedFile[] } | null;
    /** `angular.json`, `package.json`, the lock, the audit, `loadline.json`. */
    extras: { name: string; text: string }[];
    baseline: { name: string; text: string } | null;
}

export const isEmbeddedBuild = (value: unknown): value is EmbeddedBuild => {
    const record = asRecord(value);
    return record?.['version'] === 1 && Array.isArray(record['extras']);
};

const bytesOf = (file: EmbeddedFile): Uint8Array<ArrayBuffer> => {
    if (file.b64 !== undefined) {
        const binary = atob(file.b64);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) {
            bytes[index] = binary.codePointAt(index) ?? 0;
        }
        return bytes;
    }

    // A stand-in of the right length, filled with the file's own path so that no two of them hash
    // alike: two videos of the same size would otherwise read as the same file twice.
    const size = file.size ?? 0;
    const seed = new TextEncoder().encode(`${file.path}\u{0}`);
    const bytes = new Uint8Array(size);
    for (let index = 0; index < size; index++) {
        bytes[index] = seed[index % seed.length] ?? 0;
    }
    return bytes;
};

/**
 * The folder as a folder picker would have handed it over: each `File` carries the path it had
 * under the folder, which is what tells `orders/index.html` from `settings/index.html`.
 */
export const filesOf = (folder: NonNullable<EmbeddedBuild['folder']>): File[] =>
    folder.files.map(file => {
        const name = file.path.split('/').at(-1) ?? file.path;
        const made = new File([file.text ?? bytesOf(file)], name);
        Object.defineProperty(made, 'webkitRelativePath', { value: `${folder.name}/${file.path}` });
        return made;
    });
