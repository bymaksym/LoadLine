/**
 * `loadline.json` off the disk, with whatever it `extends` found and joined in.
 *
 * Found rather than required on purpose: the file is meant to be committed next to the code, and a
 * tool that only reads its configuration when told to is a tool whose configuration drifts. An
 * explicit `--config` that does not exist **is** an error — somebody asked for a file — while a
 * missing one in the working directory is simply the ordinary case.
 *
 * How the files join is `mergeConfigs`, in the analysis, because it is a rule about the file and not
 * about the disk. What is here is only where each name of `extends` is:
 *
 * - **A path** (`./base.loadline.json`, `../shared/loadline.json`) is a file, from the folder of the
 *   file that writes it — not from where the command runs, which is what makes a base that extends
 *   another base work from any repository.
 * - **Anything else is a package**: its `loadline.json`, found the way Node finds a package from
 *   that same folder. `@acme/loadline-config` reads `@acme/loadline-config/loadline.json`. No prefix
 *   is added and nothing is downloaded: it is whatever `npm install` put there, at the version the
 *   lock file says, so a base cannot change under a build without a commit.
 */

import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { CONFIG_TEXT } from '../../src/app/core/config/config-text';
import { readConfig } from '../../src/app/core/config/loadline-config';
import { type LoadlineConfig } from '../../src/app/core/config/loadline-config.types';
import { mergeConfigs } from '../../src/app/core/config/merge-config';
import { type Lang } from '../../src/app/core/i18n/ui-strings';
import { CLI_TEXT } from '../text/text';
import { exists, InputError, readJson } from './read-build';

export interface ConfigRead {
    /** The file with everything it extends joined in. `null` when there is no file. */
    config: LoadlineConfig | null;
    /** What could not be used, each line already naming the file it is about. */
    problems: string[];
    /** The file and what it extends, as the report names them: `loadline.json ← @acme/…`. */
    name: string | null;
}

interface Loaded {
    config: LoadlineConfig;
    problems: string[];
    /** This file and, after it, every file it extends, in the order they were followed. */
    files: string[];
}

/** Where a name of `extends` is on disk, or `null` when it is nowhere. */
const locate = async (name: string, from: string): Promise<string | null> => {
    if (name.startsWith('.') || isAbsolute(name)) {
        const path = resolve(dirname(from), name);
        return (await exists(path)) ? path : null;
    }
    try {
        return createRequire(from).resolve(name.endsWith('.json') ? name : `${name}/loadline.json`);
    } catch {
        return null;
    }
};

/** `own` on top of `base`, or the reason it cannot be: a mode that would misread every inherited size. */
const join2 = (base: Loaded, own: Loaded, lang: Lang, shown: (file: string) => string): Loaded => {
    const names = { base: shown(base.files[0] ?? ''), own: shown(own.files[0] ?? '') };
    const joined = mergeConfigs(base.config, own.config, names, CONFIG_TEXT[lang]);
    if (joined.gateProblems.length > 0) {
        throw new InputError(joined.gateProblems.join(' '));
    }
    return {
        config: joined.config,
        problems: [...own.problems, ...base.problems],
        files: [...own.files, ...base.files],
    };
};

/**
 * One file and, under it, what it extends — each base joined before the file on top of it, the
 * names of one `extends` from left to right, so the last one named wins over the ones before it.
 */
const load = async (
    path: string,
    config: LoadlineConfig,
    problems: string[],
    lang: Lang,
    seen: readonly string[],
    shown: (file: string) => string,
): Promise<Loaded> => {
    const own: Loaded = {
        config,
        problems: problems.map(problem => CLI_TEXT[lang].configProblem(shown(path), problem)),
        files: [path],
    };

    let base: Loaded | null = null;
    const names = config.extends ?? [];
    for (const name of names) {
        const found = await locate(name, path);
        if (!found) {
            throw new InputError(t => t.extendsNotFound(name, shown(path)));
        }
        if ([...seen, path].includes(found)) {
            throw new InputError(t => t.extendsCycle([...seen, path, found].map(file => shown(file))));
        }
        const read = await readFile(found, lang, shown);
        const next = await load(found, read.config, read.problems, lang, [...seen, path], shown);
        base = base ? join2(base, next, lang, shown) : next;
    }
    return base ? join2(base, own, lang, shown) : own;
};

/** A file read and checked. Anything wrong in one named by `--config` or by `extends` stops the run. */
const readFile = async (
    path: string,
    lang: Lang,
    shown: (file: string) => string,
): Promise<{ config: LoadlineConfig; problems: string[] }> => {
    const { config, problems, gateProblems } = readConfig(await readJson(path), lang);
    // The same mistake typed as a flag stops the run with exit 2; written in the file it used to
    // print a line and switch the gate off, and a pipeline guarded by nothing passes. A base is held
    // to the same rule: its gates are this repository's gates too.
    if (gateProblems.length > 0) {
        throw new InputError(`${shown(path)}: ${gateProblems.join(' ')}`);
    }
    if (!config) {
        throw new InputError(`${shown(path)}: ${problems.join(' ')}`);
    }
    return { config, problems };
};

export const readLoadlineConfig = async (given: string | null, cwd: string, lang: Lang = 'en'): Promise<ConfigRead> => {
    const path = resolve(cwd, given ?? 'loadline.json');
    if (!given && !(await exists(path))) {
        return { config: null, problems: [], name: null };
    }
    const shown = (file: string): string => relative(cwd, file) || file;

    // A file somebody pointed at by name is meant to be one; one that merely sits in the working
    // directory under that name may be somebody else's, and gets the warning.
    const { config, problems, gateProblems } = readConfig(await readJson(path), lang);
    if (!given && !config && gateProblems.length === 0) {
        return {
            config: null,
            problems: problems.map(problem => CLI_TEXT[lang].configProblem(shown(path), problem)),
            name: null,
        };
    }
    const top = await readFile(path, lang, shown);
    const loaded = await load(path, top.config, top.problems, lang, [], shown);
    return {
        config: loaded.config,
        problems: loaded.problems,
        name: loaded.files.map(file => shown(file)).join(' ← '),
    };
};
