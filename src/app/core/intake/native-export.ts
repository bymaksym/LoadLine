/**
 * An Expo export for a phone rather than a browser, recognised so it is refused with its name.
 *
 * `expo export` for Android and iOS writes a folder that looks enough like a web build to be read as
 * one, and three ways in gave three wrong answers, all with exit code 2: the project folder was told
 * to "build it the way you deploy it (npm run build)" — these apps have no `build`, they have
 * `bundle` — the export folder was asked whether it was "the browser/ folder of the build", which is
 * Angular's, and the bundle itself "is not valid JSON". Forced through with `--entry`, the report
 * contradicted itself: a 985 kB bootstrap with no screens over a first trip of 0 B, nine seconds on
 * slow 4G for an app the store already installed, and the images of `assets/` — Metro names them by
 * hash, with no extension — as 47 files nothing names.
 *
 * Supporting native apps is out of scope on purpose: what an app costs to install and to update is
 * what Expo Atlas already shows. What is in scope is saying what this is. The marks, any one enough:
 *
 * - `metadata.json` whose `fileMetadata` names `android` or `ios`: the manifest `expo export` writes.
 * - a `.hbc` file, or any file starting with Hermes bytecode's magic number.
 * - a bundle under `_expo/static/js/android/` or `_expo/static/js/ios/`.
 *
 * A web export (`expo export --platform web`) has `_expo/static/js/web/`, an `index.html` and no
 * native platform in its metadata: it is a web build, and it is read as one.
 */

/** Hermes bytecode starts with `0x1F1903C103BC1FC6`, little-endian. */
const HERMES_MAGIC = [0xc6, 0x1f, 0xbc, 0x03, 0xc1, 0x03, 0x19, 0x1f] as const;

const NATIVE_PLATFORMS = ['android', 'ios'] as const;

export interface NativeExport {
    /** The platforms it was exported for, as far as anything says. */
    platforms: string[];
    /** What gave it away, as a path inside the folder: `metadata.json`, a `.hbc` file, a bundle folder. */
    evidence: string;
}

/** Whether the first bytes of a file are Hermes bytecode. */
export const isHermesBytecode = (head: Uint8Array): boolean =>
    head.length >= HERMES_MAGIC.length && HERMES_MAGIC.every((byte, index) => head[index] === byte);

/** The native platforms an Expo `metadata.json` names, or none when it is not one. */
export const nativePlatformsIn = (metadata: string | null): string[] => {
    if (!metadata) {
        return [];
    }
    try {
        const parsed: unknown = JSON.parse(metadata);
        const files =
            parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>)['fileMetadata'] : undefined;
        return files && typeof files === 'object' ? NATIVE_PLATFORMS.filter(platform => platform in files) : [];
    } catch {
        return [];
    }
};

const PLATFORM_FOLDER = /(?:^|\/)_expo\/static\/js\/(android|ios)\//;

/**
 * Whether a folder is a native export, from the paths inside it (relative, with `/`) and the text of
 * its `metadata.json` when it has one. `null` for anything else, a web export included.
 */
export const nativeExportOf = (paths: readonly string[], metadata: string | null): NativeExport | null => {
    const named = nativePlatformsIn(metadata);
    const hermes = paths.find(path => /\.hbc$/i.test(path));
    const platformFolders = [...new Set(paths.map(path => PLATFORM_FOLDER.exec(path)?.[1]).filter(name => !!name))];
    const platforms = [...new Set([...named, ...platformFolders])] as string[];

    if (named.length > 0) {
        return { platforms, evidence: 'metadata.json' };
    }
    if (hermes) {
        return { platforms, evidence: hermes };
    }
    const folder = paths.find(path => PLATFORM_FOLDER.test(path));
    return folder ? { platforms, evidence: folder } : null;
};

/** Whether a `package.json` is an Expo app's: `expo` among its dependencies. */
export const isExpoPackage = (manifest: string | null): boolean => {
    if (!manifest) {
        return false;
    }
    try {
        const parsed: unknown = JSON.parse(manifest);
        const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
        return ['dependencies', 'devDependencies'].some(field => {
            const deps = record[field];
            return !!deps && typeof deps === 'object' && 'expo' in deps;
        });
    } catch {
        return false;
    }
};
