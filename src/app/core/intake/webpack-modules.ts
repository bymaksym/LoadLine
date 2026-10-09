/**
 * The modules of a webpack `stats.json`, read: where each one is, what it is called once webpack's
 * own decoration is off its name, and who imports it. `webpack-stats.ts` builds the metafile out of
 * them; this is the part that has to understand how webpack writes a module down.
 */

import { asArray, asRecord, asText } from '../json/json.utils';

/** One module, with what this file needs of it. */
export interface ModuleRow {
    path: string;
    size: number;
    chunks: Set<string>;
    reasons: Reason[];
    /** A stylesheet `mini-css-extract-plugin` moved into a `.css` file of the chunk. */
    style: boolean;
    cjs: boolean;
    /** The module that first imported this one, which webpack 4 names before concatenating. */
    issuer: string | null;
    /** The source, kept only for a module concatenated into another: see `importersOf`. */
    source: string | null;
}

/** Who imports a module, how, and where in the importing file: the `loc` is what ties it to an origin. */
export interface Reason {
    from: string;
    kind: string;
    loc: string;
    /** What the import statement wrote: `'./a'`, `'rxjs'`. */
    request: string;
}

/**
 * Modules that are no file of anybody's: the list `entry: [a, b]` builds in webpack 4 (`multi …`),
 * a global the page provides (`external "React"`), what `IgnorePlugin` dropped, a DLL reference and
 * the plumbing of module federation. None of them is code the build ships.
 */
const SYNTHETIC = /^(?:multi |external |ignored|delegated |container |remote |provide shared|consume shared)/;

/** `./src/main.ts + 50 modules`: a concatenated module, named after the one it starts at. */
const CONCATENATED = / \+ \d+ modules?$/;

/** `./src/locales lazy ^\.\/.*\.json$ namespace object`: the folder an `import()` with a variable reads. */
const CONTEXT = / (?:lazy|lazy-once|eager|weak|sync|async-weak)(?: |$)/;

/**
 * A module's name as the rest of Loadline names a file: the loaders in front of it dropped (`…!./src/x.css`),
 * the query of a Vue component's part (`?vue&type=script`) too, so the three parts of one `.vue`
 * file are one file, and the `./` webpack starts every name with. webpack's own code — `(webpack)/…`
 * in webpack 4, the runtime modules of webpack 5 — is filed under `node_modules/webpack`, which is
 * what it is: a dependency, not a file of the application.
 *
 * `null` for a module that is no file (`SYNTHETIC`).
 */
export const modulePath = (name: string): string | null => {
    const bare = name.replace(/^css /, '');
    if (SYNTHETIC.test(bare)) {
        return null;
    }

    let path = bare.replace(CONCATENATED, '');
    path = path.slice(path.lastIndexOf('!') + 1);
    const context = CONTEXT.exec(path);
    if (context) {
        path = path.slice(0, context.index);
    }
    path = path.split('?', 1)[0] ?? '';

    if (path.startsWith('(webpack)/')) {
        path = `node_modules/webpack/${path.slice('(webpack)/'.length)}`;
    } else if (path.startsWith('webpack/runtime/')) {
        path = `node_modules/${path}`;
    }
    path = path.replace(/^\.\//, '');
    return path === '' ? null : path;
};

export const idsOf = (value: unknown): string[] =>
    (asArray(value) ?? []).filter(id => typeof id === 'number' || typeof id === 'string').map(String);

export const textsOf = (value: unknown): string[] =>
    (asArray(value) ?? []).filter((item): item is string => typeof item === 'string');

/**
 * Every module, wherever the stats put it: at the top (`modules: true`), inside each chunk
 * (`chunkModules: true`) or both — Angular's builder writes only the second — inside a concatenated
 * module (`modules`, with no chunks of their own in webpack 5, so they take the outer one's), and
 * inside the groups webpack 5 makes for the terminal (`children`).
 */
export const collect = (raw: unknown, inherited: readonly string[], into: Rows, outer: string | null = null): void => {
    const module = asRecord(raw);
    if (!module) {
        return;
    }
    const grouped = asArray(module['children']);
    if (grouped && typeof module['identifier'] !== 'string') {
        for (const child of grouped) {
            collect(child, inherited, into);
        }
        return;
    }

    const own = idsOf(module['chunks']);
    const chunks = own.length > 0 ? own : inherited;
    const nested = asArray(module['modules']);
    if (nested && nested.length > 0) {
        for (const inner of nested) {
            collect(inner, chunks, into, asText(module['name']));
        }
        return;
    }

    const name = asText(module['name']);
    const path = name ? modulePath(name) : null;
    if (!name || !path) {
        return;
    }

    const key = asText(module['identifier']) ?? name;
    const known = into.rows.get(key);
    if (known) {
        for (const chunk of chunks) {
            known.chunks.add(chunk);
        }
        return;
    }

    const reasons: Reason[] = [];
    const written = asArray(module['reasons']) ?? [];
    for (const item of written) {
        const reason = asRecord(item);
        const from = asText(reason?.['resolvedModule']) ?? asText(reason?.['moduleName']) ?? '';
        const kind = asText(reason?.['type']) ?? '';
        // An entry has no importer, and it is the reason that says which module the entry is.
        if (reason && (from || kind.endsWith('entry'))) {
            reasons.push({
                from,
                kind,
                loc: asText(reason['loc']) ?? '',
                request: asText(reason['userRequest']) ?? '',
            });
        }
    }
    const bailout = textsOf(module['optimizationBailout']).join('\n');

    const issuer = asText(module['issuerName']);
    const row: ModuleRow = {
        path,
        size: typeof module['size'] === 'number' ? module['size'] : 0,
        chunks: new Set(chunks),
        reasons,
        style: name.startsWith('css ') || asText(module['moduleType']) === 'css/mini-extract',
        // What webpack could not treat as an ES module, which is what the metafile's `cjs` means.
        // Code only: a JSON file is no module of either kind and is not a CommonJS package.
        cjs: /\.c?js$/.test(path) && bailout.includes('not an ECMAScript module'),
        issuer: issuer ? modulePath(issuer) : null,
        source: outer ? asText(module['source']) : null,
    };
    into.rows.set(key, row);
    if (outer) {
        into.concatenated.set(outer, [...(into.concatenated.get(outer) ?? []), row]);
    }
};

/** Every module by its identifier, and the modules inside each concatenated one, by its name. */
export interface Rows {
    rows: Map<string, ModuleRow>;
    concatenated: Map<string, ModuleRow[]>;
}

/** `import('./a')` from `src/app/routes.ts` is `src/app/a`: a name for a chunk when nothing better names it. */
export const requested = (from: string, request: string): string => {
    const parts = from.split('/').slice(0, -1);
    for (const segment of request.split('/')) {
        if (segment === '..') {
            parts.pop();
        } else if (segment !== '.' && segment !== '') {
            parts.push(segment);
        }
    }
    return parts.join('/');
};

/** `path` is the file `base` names once an extension or an `index` is added, as a resolver would. */
const resolvesTo = (base: string, path: string): boolean => {
    const bare = path.replace(/\.[^./]+$/, '');
    return bare === base || bare === `${base}/index`;
};

/**
 * Who really imports `imported`, when webpack says "a concatenated module" did.
 *
 * webpack 4 writes the reason with the name of the whole concatenation — `./src/main.ts + 20
 * modules` — and taken at its word, `src/main.ts` imported everything its twenty modules import.
 * An Angular 8 build came out with `main.ts` as a barrel of 26 re-exports holding 546 kB. The file
 * that wrote the import is found by what it wrote: a relative path that resolves to the module from
 * it, a package named in its source between quotes, or — when neither is in the stats — the module
 * webpack recorded as having imported it first. With none of the three the edge is left out: an
 * unknown importer is "not known" in the report, and a guessed one is a false chain.
 *
 * webpack 5 names the file in `resolvedModule`, which `collect` already prefers.
 */
export const importersOf = (reason: Reason, imported: ModuleRow, into: Rows): string[] => {
    const from = modulePath(reason.from);
    const inner = into.concatenated.get(reason.from);
    if (!from || !inner) {
        return from ? [from] : [];
    }

    const { request } = reason;
    if (request.startsWith('.')) {
        const resolved = inner.filter(row => resolvesTo(requested(row.path, request), imported.path));
        if (resolved.length > 0) {
            return resolved.map(row => row.path);
        }
    } else if (request) {
        const quoting = inner.filter(
            row => row.source?.includes(`'${request}'`) === true || row.source?.includes(`"${request}"`) === true,
        );
        if (quoting.length > 0) {
            return quoting.map(row => row.path);
        }
    }
    const first = inner.find(row => row.path === imported.issuer);
    return first ? [first.path] : [];
};
