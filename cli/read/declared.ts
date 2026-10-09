/**
 * What each package in the bundle declares as its dependencies, read from its own `package.json`
 * in `node_modules`.
 *
 * pnpm's lock file records which version was resolved and not which range was asked for, and the
 * difference is the whole question when a package is duplicated: `idb` resolved to `7.1.1` says
 * nothing; `@firebase/app` asking for exactly `7.1.1` says the copy cannot move. The `package.json`
 * of the parent is on disk next to the code that was bundled, so the command reads it — only for
 * the packages the metafile names, and only when a lock file or a project folder says where the
 * install lives.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type Metafile } from '../../src/app/core/analysis/metafile.types';
import { asRecord, asText } from '../../src/app/core/json/json.utils';

/** `…/node_modules/@scope/name/` or `…/node_modules/name/`: the folder a package is installed in. */
const PACKAGE_DIR = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//;

/**
 * @param meta the metafile: its input paths are where each bundled package is installed, relative
 *             to the folder the build ran in.
 * @param root that folder.
 */
export const readDeclared = async (meta: Metafile, root: string): Promise<Map<string, Record<string, string>>> => {
    const folders = new Set<string>();
    const inputs = Object.keys(meta.inputs);
    for (const input of inputs) {
        const folder = PACKAGE_DIR.exec(input.replaceAll('\\', '/'))?.[1];
        if (folder) {
            folders.add(folder);
        }
    }

    const declared = new Map<string, Record<string, string>>();
    for (const folder of folders) {
        try {
            const manifest = asRecord(JSON.parse(await readFile(join(root, folder, 'package.json'), 'utf8')));
            const name = asText(manifest?.['name']);
            const dependencies = asRecord(manifest?.['dependencies']);
            if (!name || !dependencies) {
                continue;
            }
            const ranges = Object.fromEntries(
                Object.entries(dependencies).filter((pair): pair is [string, string] => typeof pair[1] === 'string'),
            );
            declared.set(name, { ...declared.get(name), ...ranges });
        } catch {
            // Not installed here, or not readable: that package simply has no declared ranges.
        }
    }

    return declared;
};
