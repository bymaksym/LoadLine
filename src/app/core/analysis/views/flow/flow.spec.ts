/**
 * The flow diagram is arithmetic a picture hides: a ribbon a few bytes too wide still looks right,
 * and a column that does not add up still looks like a column. So what makes it honest is checked
 * as numbers — every column adds up, every path is a part of its ribbon, the folding keeps every
 * byte, the order crosses no more ribbons than the obvious one — and the sentence under it is
 * checked against the builds it is about.
 */

import { describe, expect, it } from 'vitest';
import { SAMPLE_STATS } from '../../../sample/sample-build';
import { analyze } from '../../analysis';
import { type Metafile, type MetafileImport } from '../../metafile.types';
import { flowDetailOf, litFractions } from './detail';
import { FLOW_IDS } from './fine';
import { FLOW_LIMITS, flowOf } from './flow';
import { type FlowFrame, type FlowLink, type FlowModel } from './flow.types';
import { layoutFlow, ribbonPath, spreadLabels } from './layout';
import { crossingsOf } from './order';

const sumBy = <T>(items: readonly T[], value: (item: T) => number): number =>
    items.reduce((sum, item) => sum + value(item), 0);

/** Every column adds up, and every ribbon is the sum of the paths through it. */
const expectBalanced = (model: FlowModel): void => {
    for (const source of model.sources) {
        const out = sumBy(
            model.inLinks.filter(link => link.from === source.id),
            link => link.bytes,
        );
        expect(out, `ribbons out of ${source.id}`).toBeCloseTo(source.bytes, 3);
    }
    for (const middle of model.middles) {
        const into = sumBy(
            model.inLinks.filter(link => link.to === middle.id),
            link => link.bytes,
        );
        expect(into, `ribbons into ${middle.id}`).toBeCloseTo(middle.bytes, 3);
    }
    for (const target of model.targets) {
        const into = sumBy(
            model.outLinks.filter(link => link.to === target.id),
            link => link.bytes,
        );
        expect(into, `ribbons into ${target.id}`).toBeCloseTo(target.total, 3);
    }
    for (const link of model.outLinks) {
        const through = sumBy(
            model.paths.filter(path => path.middle === link.from && path.target === link.to),
            path => path.bytes,
        );
        expect(through, `paths through ${link.from} → ${link.to}`).toBeCloseTo(link.bytes, 3);
    }
    expect(sumBy(model.sources, source => source.bytes)).toBeCloseTo(model.buildBytes, 3);
};

describe('flowOf, on the sample build', () => {
    const analysis = analyze(SAMPLE_STATS, null);
    const model = flowOf(analysis);
    const source = (id: string) => model.sources.find(node => node.id === id);

    it('adds up: what leaves a column is what reaches the next one', () => {
        expect(() => expectBalanced(model)).not.toThrow();
    });

    it('gives every screen its first trip as the screens table does', () => {
        const byName = (a: string, b: string) => a.localeCompare(b);
        expect(model.targets.map(target => target.id).toSorted(byName)).toEqual(
            analysis.screens.map(screen => screen.source).toSorted(byName),
        );
        for (const screen of analysis.screens) {
            const target = model.targets.find(node => node.id === screen.source);
            expect(target?.total).toBe(screen.total);
            expect(target?.boot).toBe(screen.boot);
            expect(target?.shared).toBe(screen.shared);
            expect(target?.own).toBe(screen.own);
        }
        expect(model.downloadBytes).toBe(sumBy(analysis.screens, screen => screen.total));
    });

    it('puts the bootstrap first and every screen’s own chunks last in the middle', () => {
        expect(model.middles[0]?.id).toBe(FLOW_IDS.boot);
        expect(model.middles.at(-1)?.id).toBe(FLOW_IDS.ownChunks);
        expect(model.middles.filter(node => node.kind === 'shared').map(node => node.label)).toContain(
            'chunk-GRID-5NPX7J.js',
        );
        expect(model.middles[0]?.bytes).toBe(analysis.bootBytes);
    });

    it('says how far each package reaches: one screen, several, or all of them', () => {
        expect(source('xlsx')).toMatchObject({ screens: 1, onlyScreen: 'reports', bootBytes: 0 });
        expect(source('ag-grid-community')?.screens).toBe(5);
        expect(source('@angular/core')?.screens).toBe(analysis.screens.length);
        expect(source('@angular/core')?.bootBytes).toBeGreaterThan(0);
    });

    it('keeps the project’s own code as one node, whatever folder it is in', () => {
        expect(model.sources.filter(node => node.kind === 'own')).toHaveLength(1);
        expect(source(FLOW_IDS.own)?.screens).toBe(analysis.screens.length);
    });

    /** The sample's heaviest screen is reports, and four fifths of what it adds is a spreadsheet package. */
    it('names what makes the heaviest screen heavy', () => {
        expect(model.takeaway).toMatchObject({
            kind: 'driver',
            source: 'xlsx',
            screen: 'reports',
            where: 'own',
            downloads: 1,
        });
    });

    it('crosses no more ribbons than the order by weight it starts from', () => {
        const byWeight = (ids: { id: string; bytes: number }[]) =>
            ids.toSorted((a, b) => b.bytes - a.bytes).map(node => node.id);
        const naive =
            crossingsOf(model.inLinks, byWeight(model.sources), byWeight(model.middles)) +
            crossingsOf(
                model.outLinks,
                byWeight(model.middles),
                byWeight(model.targets.map(node => ({ id: node.id, bytes: node.total }))),
            );
        const drawn =
            crossingsOf(
                model.inLinks,
                model.sources.map(node => node.id),
                model.middles.map(node => node.id),
            ) +
            crossingsOf(
                model.outLinks,
                model.middles.map(node => node.id),
                model.targets.map(node => node.id),
            );
        expect(drawn).toBeLessThanOrEqual(naive);
    });
});

describe('flowDetailOf and litFractions, on the sample build', () => {
    const model = flowOf(analyze(SAMPLE_STATS, null));
    const grid = 'chunk-GRID-5NPX7J.js';
    const reports = 'src/app/features/reports/reports.page.ts';

    it('splits a package by where it lives and says which screens download how much of it', () => {
        const detail = flowDetailOf(model, 'ag-grid-community');
        expect(detail?.zones).toEqual({ boot: 0, shared: 142_500, own: 0 });
        expect(detail?.middles.map(entry => entry.id)).toEqual([grid]);
        expect(detail?.targets).toHaveLength(5);
        expect(detail?.targets.every(entry => entry.bytes === 142_500)).toBe(true);
    });

    it('gives a screen its three parts and what it adds on top of the bootstrap, heaviest first', () => {
        const screen = model.targets.find(node => node.id === reports);
        const detail = flowDetailOf(model, reports);
        expect(detail?.zones).toEqual({ boot: screen?.boot, shared: screen?.shared, own: screen?.own });
        expect(detail?.beyondBoot[0]).toEqual({ id: 'xlsx', bytes: 428_900 });
        expect(detail?.beyondBoot.some(entry => entry.id === '@angular/core')).toBe(false);
    });

    it('knows nothing about an id that is not a node', () => {
        expect(flowDetailOf(model, 'nope')).toBeNull();
    });

    it('lights a package’s own ribbons whole and only its band of the ribbons past the chunk', () => {
        const lit = litFractions(model, 'ag-grid-community');
        expect(lit.get(`ag-grid-community\0${grid}`)).toBe(1);
        // The grid chunk also carries the project's grid wrapper and a nested date-fns.
        const band = lit.get(`${grid}\0${reports}`) ?? 0;
        expect(band).toBeGreaterThan(0.5);
        expect(band).toBeLessThan(1);
        expect(lit.has(`${FLOW_IDS.boot}\0${reports}`)).toBe(false);
    });

    it('lights, for a screen, the part of each package ribbon that reaches it', () => {
        const lit = litFractions(model, reports);
        expect(lit.get(`xlsx\0${FLOW_IDS.ownChunks}`)).toBe(1);
        expect(lit.get(`chart.js\0${FLOW_IDS.ownChunks}`)).toBeUndefined();
        expect(lit.get(`${FLOW_IDS.boot}\0${reports}`)).toBe(1);
    });
});

describe('crossingsOf', () => {
    const link = (from: string, to: string): FlowLink => ({ from, to, bytes: 1, zone: 'own' });

    it('counts two ribbons whose ends are in opposite orders, and only those', () => {
        expect(crossingsOf([link('a', 'x'), link('b', 'y')], ['a', 'b'], ['x', 'y'])).toBe(0);
        expect(crossingsOf([link('a', 'y'), link('b', 'x')], ['a', 'b'], ['x', 'y'])).toBe(1);
        // Sharing an end is not a crossing.
        expect(crossingsOf([link('a', 'x'), link('b', 'x')], ['a', 'b'], ['x'])).toBe(0);
    });
});

/**
 * Vite's `manualChunks: { vendor: [...] }`: every package in one chunk the entry imports, so the
 * bootstrap carries a chart library that one lazy screen's code imports.
 */
const vendorChunk = (): Metafile => {
    const screens = ['reports', 'orders', 'users'];
    const inputs: Metafile['inputs'] = {
        'src/main.ts': {
            bytes: 2000,
            imports: screens.map(name => ({ path: `src/app/${name}.page.ts`, kind: 'dynamic-import' })),
        },
        'node_modules/chart.js/dist/chart.js': { bytes: 200_000 },
        'node_modules/tiny/index.js': { bytes: 1000 },
    };
    const outputs: Metafile['outputs'] = {
        'main.js': {
            bytes: 2000,
            entryPoint: 'src/main.ts',
            imports: [
                { path: 'vendor.js', kind: 'import-statement' },
                ...screens.map((name): MetafileImport => ({ path: `${name}.js`, kind: 'dynamic-import' })),
            ],
            inputs: { 'src/main.ts': { bytesInOutput: 2000 } },
        },
        'vendor.js': {
            bytes: 201_000,
            imports: [],
            inputs: {
                'node_modules/chart.js/dist/chart.js': { bytesInOutput: 200_000 },
                'node_modules/tiny/index.js': { bytesInOutput: 1000 },
            },
        },
    };
    for (const name of screens) {
        const page = `src/app/${name}.page.ts`;
        inputs[page] = {
            bytes: 5000,
            imports:
                name === 'reports'
                    ? [{ path: 'node_modules/chart.js/dist/chart.js', kind: 'import-statement' }]
                    : [{ path: 'node_modules/tiny/index.js', kind: 'import-statement' }],
        };
        outputs[`${name}.js`] = {
            bytes: 5000,
            entryPoint: page,
            imports: [{ path: 'vendor.js', kind: 'import-statement' }],
            inputs: { [page]: { bytesInOutput: 5000 } },
        };
    }
    return { inputs, outputs };
};

describe('the takeaway', () => {
    it('names a package the bootstrap carries to screens whose code does not import it', () => {
        const model = flowOf(analyze(vendorChunk(), null));

        expect(model.takeaway).toEqual({
            kind: 'misplaced',
            source: 'chart.js',
            own: false,
            bytes: 200_000,
            where: 'boot',
            importers: ['reports'],
            downloads: 3,
        });
    });

    it('says nothing about who needs a package when no file of the project imports it', () => {
        const meta = vendorChunk();
        for (const input of Object.values(meta.inputs)) {
            delete input.imports;
        }
        meta.inputs['src/main.ts'] = {
            bytes: 2000,
            imports: ['reports', 'orders', 'users'].map(name => ({
                path: `src/app/${name}.page.ts`,
                kind: 'dynamic-import',
            })),
        };

        expect(flowOf(analyze(meta, null)).takeaway?.kind).not.toBe('misplaced');
    });

    /**
     * A folder read without its source maps names nothing inside its chunks. The first version of
     * this called all of it "bundler code", which put the whole build under the bundler's name.
     */
    it('calls a chunk nobody describes "not broken down", and says what the heaviest screen is made of', () => {
        const meta = vendorChunk();
        for (const output of Object.values(meta.outputs)) {
            output.inputs = {};
        }
        const model = flowOf(analyze(meta, null));

        expect(model.sources.map(node => node.kind)).toEqual(['unknown']);
        expect(model.takeaway).toMatchObject({ kind: 'screen' });
        expect(() => expectBalanced(model)).not.toThrow();
    });

    it('falls back to the heaviest part of the bootstrap when no screen adds anything', () => {
        const meta: Metafile = {
            inputs: { 'src/main.ts': { bytes: 1000 }, 'node_modules/big/index.js': { bytes: 90_000 } },
            outputs: {
                'main.js': {
                    bytes: 91_000,
                    entryPoint: 'src/main.ts',
                    imports: [],
                    inputs: {
                        'src/main.ts': { bytesInOutput: 1000 },
                        'node_modules/big/index.js': { bytesInOutput: 90_000 },
                    },
                },
            },
        };
        const model = flowOf(analyze(meta, null));

        expect(model.takeaway).toMatchObject({ kind: 'boot', source: 'big', bytes: 90_000 });
        // No lazy screen: the page itself is the one thing that downloads the bootstrap.
        expect(model.targets).toEqual([expect.objectContaining({ id: FLOW_IDS.app, total: 91_000 })]);
        expectBalanced(model);
    });
});

/**
 * A build too big to draw node by node: forty packages, twenty-four screens, a dozen shared chunks.
 * Each screen `i` imports package `i`, and every pair of neighbours shares a chunk.
 */
const bigBuild = (): Metafile => {
    const screens = 24;
    const inputs: Metafile['inputs'] = {};
    const outputs: Metafile['outputs'] = {};
    const boot: Record<string, { bytesInOutput: number }> = { 'src/main.ts': { bytesInOutput: 3000 } };
    for (let index = 0; index < 16; index++) {
        const path = `node_modules/base${index}/index.js`;
        inputs[path] = { bytes: 4000 + index * 900 };
        boot[path] = { bytesInOutput: 4000 + index * 900 };
    }
    inputs['src/main.ts'] = {
        bytes: 3000,
        imports: Array.from({ length: screens }, (_, index) => ({
            path: `src/app/s${index}.page.ts`,
            kind: 'dynamic-import' as const,
        })),
    };
    outputs['main.js'] = {
        bytes: sumBy(Object.values(boot), part => part.bytesInOutput),
        entryPoint: 'src/main.ts',
        imports: Array.from({ length: screens }, (_, index) => ({ path: `s${index}.js`, kind: 'dynamic-import' })),
        inputs: boot,
    };

    for (let index = 0; index < screens; index++) {
        const page = `src/app/s${index}.page.ts`;
        const lib = `node_modules/lib${index}/index.js`;
        const pair = Math.floor(index / 2);
        const sharedFile = `src/app/pair${pair}.ts`;
        inputs[page] = {
            bytes: 2000,
            imports: [
                { path: lib, kind: 'import-statement' },
                { path: sharedFile, kind: 'import-statement' },
            ],
        };
        inputs[lib] = { bytes: 10_000 + index * 1000 };
        inputs[sharedFile] = { bytes: 3000 + pair * 500 };
        outputs[`s${index}.js`] = {
            bytes: 2000 + 10_000 + index * 1000,
            entryPoint: page,
            imports: [{ path: `pair${pair}.js`, kind: 'import-statement' }],
            inputs: { [page]: { bytesInOutput: 2000 }, [lib]: { bytesInOutput: 10_000 + index * 1000 } },
        };
        outputs[`pair${pair}.js`] = {
            bytes: 3000 + pair * 500,
            imports: [],
            inputs: { [sharedFile]: { bytesInOutput: 3000 + pair * 500 } },
        };
    }
    return { inputs, outputs };
};

describe('flowOf, on a build too big to draw node by node', () => {
    const analysis = analyze(bigBuild(), null);
    const model = flowOf(analysis);

    it('draws at most a dozen packages, a dozen screens and eight shared chunks', () => {
        const packages = model.sources.filter(node => node.kind === 'package' || node.kind === 'rest');
        expect(packages).toHaveLength(FLOW_LIMITS.sources);
        expect(model.targets).toHaveLength(FLOW_LIMITS.targets);
        expect(model.middles.filter(node => node.zone === 'shared')).toHaveLength(FLOW_LIMITS.shared);
    });

    it('folds the rest into one node each, keeping every byte and every screen', () => {
        const rest = model.sources.find(node => node.id === FLOW_IDS.morePackages);
        expect(rest?.members).toHaveLength(40 - (FLOW_LIMITS.sources - 1));
        const others = model.targets.find(node => node.id === FLOW_IDS.moreScreens);
        expect(others?.members).toHaveLength(24 - (FLOW_LIMITS.targets - 1));
        expect(sumBy(model.targets, node => node.members.length)).toBe(24);
        expectBalanced(model);
    });

    it('keeps the folded nodes at the bottom of their column', () => {
        expect(model.sources.at(-1)?.id).toBe(FLOW_IDS.morePackages);
        expect(model.targets.at(-1)?.id).toBe(FLOW_IDS.moreScreens);
        expect(model.middles.at(-2)?.id).toBe(FLOW_IDS.moreShared);
    });
});

describe('layoutFlow', () => {
    const model = flowOf(analyze(SAMPLE_STATS, null));
    const frame: FlowFrame = { columns: [0, 300, 600], nodeWidth: 12, height: 480, gap: 8, minNode: 3 };
    const layout = layoutFlow(model, frame);

    it('keeps every node inside the frame, in its column', () => {
        for (const node of layout.nodes) {
            expect(node.y).toBeGreaterThanOrEqual(0);
            expect(node.y + node.h).toBeLessThanOrEqual(frame.height + 1e-6);
            expect(node.h).toBeGreaterThanOrEqual(frame.minNode);
            expect(node.x).toBe(frame.columns[node.column]);
        }
    });

    it('fills each node’s edge with its ribbons exactly', () => {
        const links = [...layout.inLinks, ...layout.outLinks];
        const edges = layout.nodes.flatMap(node => {
            const out = links.filter(link => link.from === node.id);
            const into = links.filter(link => link.to === node.id);
            return [
                ...(out.length > 0 ? [{ node: node.h, slots: sumBy(out, link => link.h0) }] : []),
                ...(into.length > 0 ? [{ node: node.h, slots: sumBy(into, link => link.h1) }] : []),
            ];
        });
        expect(edges.length).toBeGreaterThan(layout.nodes.length);
        for (const edge of edges) {
            expect(edge.slots).toBeCloseTo(edge.node, 6);
        }
    });

    it('draws the screens to one scale, so their heights compare', () => {
        const heights = model.targets.map(target => ({
            total: target.total,
            h: layout.nodes.find(node => node.id === target.id)?.h ?? 0,
        }));
        const [first, ...rest] = heights;
        for (const other of rest) {
            expect(other.h / (first?.h ?? 1)).toBeCloseTo(other.total / (first?.total ?? 1), 6);
        }
    });

    it('keeps a ribbon between the left and the middle as wide at both ends', () => {
        const wide = layout.inLinks.filter(entry => entry.h0 > frame.minNode);
        expect(wide.length).toBeGreaterThan(0);
        for (const link of wide) {
            expect(link.h1).toBeCloseTo(link.h0, 0);
        }
    });

    it('outlines a ribbon, or a band of it, as one closed shape', () => {
        const [link] = layout.outLinks;
        expect(link).toBeDefined();
        const whole = link ? ribbonPath(link) : '';
        expect(whole).toMatch(/^M[\d.,]+C[^L]+L[^C]+C[^Z]+Z$/);
        expect(link ? ribbonPath(link, 0, 0.5) : whole).not.toBe(whole);
    });
});

describe('spreadLabels', () => {
    it('pushes labels apart to the gap and keeps them inside the column', () => {
        const ys = spreadLabels([10, 12, 14, 200], 20, 8, 210);
        expect(ys).toEqual([10, 30, 50, 200]);
        const squeezed = spreadLabels([195, 200, 205], 20, 0, 210);
        expect(squeezed).toEqual([170, 190, 210]);
    });
});
