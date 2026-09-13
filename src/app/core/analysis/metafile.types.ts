/**
 * Types of the esbuild metafile, the only thing Loadline reads.
 * Reference: https://esbuild.github.io/api/#metafile
 */

import { asRecord } from '../json/json.utils';

/** `import-statement` keeps files in the same chunk; `dynamic-import` is the lazy boundary. */
export type ImportKind = 'import-statement' | 'dynamic-import' | 'require-call' | 'url-token' | string;

export interface MetafileImport {
    path: string;
    kind: ImportKind;
    external?: boolean;
}

/** Module format esbuild detected in the file. `cjs` cannot be tree-shaken. Absent for CSS, JSON… */
export type ModuleFormat = 'esm' | 'cjs' | string;

export interface MetafileInput {
    bytes: number;
    imports?: MetafileImport[];
    format?: ModuleFormat;
}

export interface MetafileOutputInput {
    bytesInOutput: number;
}

export interface MetafileOutput {
    bytes: number;
    /** Entry points only: the source file they originate from. */
    entryPoint?: string;
    imports?: MetafileImport[];
    inputs?: Record<string, MetafileOutputInput>;
}

export interface Metafile {
    inputs: Record<string, MetafileInput>;
    outputs: Record<string, MetafileOutput>;
}

/** Checks that what was dropped is a metafile before trying to analyse it. */
export const isMetafile = (value: unknown): value is Metafile =>
    !!value && typeof value === 'object' && 'outputs' in value && typeof (value as Metafile).outputs === 'object';

/**
 * What was dropped, when it is not a metafile. Every one of these is a file somebody can reasonably
 * believe is "the stats of my build", and "could not read it" would be inaccurate: the file is
 * fine, it is another format. Naming the format replaces that message with one sentence of what
 * to do instead.
 */
export type ForeignFormat = 'webpack' | 'viteManifest' | 'visualizer' | 'unknown';

/** The formats by name, for reading one back out of an error code that carries it. */
export const FOREIGN_FORMATS: ReadonlySet<ForeignFormat> = new Set<ForeignFormat>([
    'webpack',
    'viteManifest',
    'visualizer',
    'unknown',
]);

export const foreignFormat = (value: unknown): ForeignFormat => {
    // A list is rejected here too, which the hand-written check before it let through: every one
    // of the three shapes below is an object keyed by name, and `Object.values` of an array would
    // have read its elements as though they were those entries.
    const data = asRecord(value);
    if (!data) {
        return 'unknown';
    }

    // webpack, and everything that copies its stats: Angular's `browser` builder (up to v16), Next,
    // Rspack. Arrays where the metafile has objects.
    if (Array.isArray(data['chunks']) || (Array.isArray(data['modules']) && Array.isArray(data['assets']))) {
        return 'webpack';
    }

    // rollup-plugin-visualizer: the tree it draws, with the bytes of each leaf apart.
    if (data['tree'] && data['nodeParts']) {
        return 'visualizer';
    }

    // Vite's manifest: every value is an entry with the file it produced.
    const values = Object.values(data);
    const looksLikeEntry = (entry: unknown): boolean => typeof asRecord(entry)?.['file'] === 'string';
    if (values.length > 0 && values.every(entry => looksLikeEntry(entry))) {
        return 'viteManifest';
    }

    return 'unknown';
};
