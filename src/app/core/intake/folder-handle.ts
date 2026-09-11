/**
 * Reading the build folder again after a rebuild, without dragging four thousand files back in.
 *
 * The real loop is compile → look → change → compile, and every turn of it used to cost a drag. The
 * File System Access API can hold on to the folder and read it again, and this is the whole of what
 * that takes.
 *
 * **It is deliberately only offered where it works.** `showDirectoryPicker` does not exist in
 * Firefox or Safari, and from a `file://` page — which is how this tool is opened most of the time,
 * by double-clicking one HTML file — a kept handle is not something the browser will hand back. So
 * the button appears when the API is there and the page came from a server, and everywhere else the
 * folder is dropped exactly as before. Nothing is hidden behind a feature that quietly does not
 * work: the control is not there when the thing is not there.
 */

/** The slice of the File System Access API this needs. Declared here so it does not depend on
 * which DOM library version happens to be installed. */
interface DirectoryHandle {
    name: string;
    values: () => AsyncIterableIterator<DirectoryHandle | FileHandle>;
    kind: 'directory' | 'file';
}

interface FileHandle {
    name: string;
    kind: 'directory' | 'file';
    getFile: () => Promise<File>;
}

interface PickerWindow {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandle>;
}

/** The folder somebody picked, ready to be read again. */
export type FolderHandle = DirectoryHandle;

/**
 * Whether picking a folder — and therefore re-reading it — is on the table here.
 *
 * Both halves matter. Without the API there is nothing to call; from `file://` the API is either
 * absent or gives a handle the browser will not honour on the next press, which would be a button
 * that fails the second time somebody trusts it.
 */
export const canPickFolder = (): boolean =>
    typeof window !== 'undefined' &&
    typeof (globalThis as PickerWindow).showDirectoryPicker === 'function' &&
    location.protocol !== 'file:';

/** Opens the folder picker. `null` when somebody closed it, which is not an error. */
export const pickFolder = async (): Promise<FolderHandle | null> => {
    const picker = (globalThis as PickerWindow).showDirectoryPicker;
    if (!picker) {
        return null;
    }

    try {
        return await picker({ mode: 'read' });
    } catch {
        // `AbortError` when the dialog is dismissed, and a security error when the page is not
        // allowed to ask. Either way there is no folder, and neither is worth an error message.
        return null;
    }
};

/**
 * Every file under the folder, with the path each one had inside it.
 *
 * The path is written onto `webkitRelativePath`, because that is what the rest of the intake reads:
 * `dist-files` strips the first segment to get the name inside the build, and the store takes the
 * first segment as what to call the folder. A file that came from the picker has that property
 * empty — it is the directory input that fills it — so the two ways of loading a folder would
 * otherwise produce two different shapes for the same folder.
 */
export const readFolder = async (handle: FolderHandle): Promise<File[]> => {
    const files: File[] = [];

    const walk = async (dir: DirectoryHandle, prefix: string): Promise<void> => {
        for await (const entry of dir.values()) {
            const path = `${prefix}/${entry.name}`;
            if (entry.kind === 'directory') {
                await walk(entry as DirectoryHandle, path);
                continue;
            }

            const file = await (entry as FileHandle).getFile();
            Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true });
            files.push(file);
        }
    };

    await walk(handle, handle.name);
    return files;
};
