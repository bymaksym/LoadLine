/**
 * Types of the esbuild metafile, the only thing Loadline reads.
 * Reference: https://esbuild.github.io/api/#metafile
 */

import { asRecord } from '../json/json.utils';

/**
 * `import-statement` keeps files in the same chunk; `dynamic-import` is the lazy boundary.
 * `require-call` and `url-token` are the other two esbuild writes. A plain `string` because a
 * metafile from another tool can name kinds of its own: listing the known ones next to `| string`
 * reads as a narrower type and is not one (the union collapses to `string`).
 */
export type ImportKind = string;

export interface MetafileImport {
    path: string;
    kind: ImportKind;
    external?: boolean;
}

/**
 * Module format esbuild detected in the file: `esm` or `cjs`, and `cjs` cannot be tree-shaken.
 * Absent for CSS, JSON… A plain `string` for the same reason as `ImportKind`.
 */
export type ModuleFormat = string;

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
    /**
     * Angular's mark on a component stylesheet. Its compiler bundles each one apart, merges the
     * result into the metafile and then inlines the CSS into the JavaScript of the component, so the
     * output is named in the metafile and is never a file in the folder.
     */
    'ng-component'?: boolean;
    /**
     * Set by the folder reader on a file of the build that the page never downloads as part of a
     * screen: the copy for browsers without ES modules (`<script nomodule>`, SystemJS) and a
     * service worker with what it imports, and what `build.ignore` of `loadline.json` names. Left out
     * of every figure and counted, the way the server side of a rendered build is.
     */
    offPage?: OffPageKind;
    /**
     * Set by the webpack reader on a lazy chunk: the chunks webpack's loader asks for in the same
     * round trip, because they are one chunk group and `__webpack_require__.e` requests them all
     * at once. What Vite's preload list says in a folder, said by the stats file.
     */
    fetchedWith?: string[];
}

/** `fetchedWith` of every output, in the shape `analyze` takes the preload lists of a folder in. */
export const fetchedTogether = (outputs: Metafile['outputs']): Map<string, string[]> | null => {
    const together = Object.entries(outputs).flatMap(([chunk, output]): [string, string[]][] =>
        output.fetchedWith && output.fetchedWith.length > 0 ? [[chunk, output.fetchedWith]] : [],
    );
    return together.length > 0 ? new Map(together) : null;
};

/** Why a file of the folder is in no figure: see `MetafileOutput.offPage`. `ignored` is `loadline.json`'s. */
export type OffPageKind = 'legacy' | 'service-worker' | 'server' | 'ignored';

/** The bundler that wrote a build, as far as what is read says (`tool.ts`). */
export type Bundler = 'esbuild' | 'webpack' | 'vite' | 'rollup' | 'requirejs';

export type Framework =
    | 'angular'
    | 'react'
    | 'vue'
    | 'svelte'
    | 'sveltekit'
    | 'nuxt'
    | 'sapper'
    | 'stencil'
    | 'ember'
    | 'polymer'
    | 'preact'
    | 'solid'
    | 'next';

export interface Metafile {
    inputs: Record<string, MetafileInput>;
    outputs: Record<string, MetafileOutput>;
    /**
     * Loadline's note of what wrote the build, left by the reader that could tell: the webpack
     * stats reader, and the folder reader from what it found in the chunks and the page. Absent on
     * a metafile esbuild wrote, which is what that absence means (`toolOf`).
     */
    builtBy?: { bundler?: Bundler; framework?: Framework };
    /**
     * What Loadline read the graph out of, when it was not a metafile: the build folder, or a
     * webpack stats file it translated. Absent on a metafile esbuild wrote.
     */
    readFrom?: 'folder' | 'webpack';
}

/**
 * Checks that what was dropped is a metafile before trying to analyse it. Every way in goes through
 * here — the page, the command, a comparison — so this is what makes the type above true.
 *
 * Both halves, and as objects: `typeof null` is `'object'`, and until 02/10/2026 only `outputs` was
 * checked. A file without `inputs` passed as a metafile and then failed halfway through the analysis,
 * in whichever of the seven places that read `inputs` came first; now it is refused at the door with
 * the message for a file that is not a stats file.
 */
export const isMetafile = (value: unknown): value is Metafile => {
    const record = asRecord(value);
    return asRecord(record?.['inputs']) !== null && asRecord(record?.['outputs']) !== null;
};

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
    return values.length > 0 && values.every(entry => looksLikeEntry(entry)) ? 'viteManifest' : 'unknown';
};
