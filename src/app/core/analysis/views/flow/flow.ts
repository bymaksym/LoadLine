/**
 * Where the bytes go: packages on the left, where they live in the middle, screens on the right.
 *
 * The screens table says what each screen weighs and the bootstrap tab what is in the first load;
 * neither says which package makes which screen heavy, nor whether it costs every screen or only
 * some. That is a question about a path — package → chunk → screen — and a flow diagram is the one
 * picture that draws paths, so this is its model, kept out of the page so it can be checked as
 * numbers. `layout.ts` places it; `detail.ts` reads one node of it back.
 *
 * **Two kinds of bytes.** The left and middle columns are bytes of the build, counted once:
 * `chart.js` is 224 kB however many screens load it. The right column is what each screen
 * downloads, so a chunk five screens load reaches the right five times — once per ribbon.
 */

import { type Analysis, type ScreenCost } from '../../analysis.types';
import { add, type ChunkFlow, type Fine, fineOf, FLOW_IDS, reachCount, RESERVED } from './fine';
import {
    type FlowLink,
    type FlowMiddle,
    type FlowModel,
    type FlowPath,
    type FlowSource,
    type FlowTarget,
} from './flow.types';
import { orderColumns } from './order';
import { takeawayOf } from './takeaway';

/**
 * How many nodes a column draws one by one before folding the rest into one. Past a dozen, the
 * labels of a column of 520 px no longer have two lines each, and a node of three pixels is a
 * line, not something to point at.
 */
export interface FlowLimits {
    sources: number;
    shared: number;
    targets: number;
}

export const FLOW_LIMITS: FlowLimits = { sources: 12, shared: 8, targets: 12 };

/** Between the parts of a key made of two or three ids: no id can hold it. */
const SEP = '\0';

/** The heaviest `limit` items, or the heaviest `limit − 1` and the rest folded, when that folds two or more. */
const capped = <T>(items: readonly T[], limit: number): { shown: T[]; folded: T[] } =>
    items.length > limit
        ? { shown: items.slice(0, limit - 1), folded: items.slice(limit - 1) }
        : { shown: [...items], folded: [] };

/** The screens a set of sources reaches: `'all'` as soon as one of them is in the bootstrap. */
const reachOf = (fine: Fine, keys: readonly string[]): Set<string> | 'all' => {
    const union = new Set<string>();
    for (const key of keys) {
        const reach = fine.reach.get(key);
        if (reach === 'all') {
            return 'all';
        }
        const screens = reach ?? new Set<string>();
        for (const source of screens) {
            union.add(source);
        }
    }
    return union;
};

/** The left column: packages by weight, folded past the limit; the project's code and the bundler's as one node each. */
const sourcesOf = (
    analysis: Analysis,
    fine: Fine,
    limit: number,
): { sources: FlowSource[]; idOf: Map<string, string> } => {
    const n = analysis.screens.length;
    const labelOf = new Map(analysis.screens.map(screen => [screen.source, screen.label]));
    const packages = [...fine.bytes]
        .filter(([key, bytes]) => !RESERVED.has(key) && bytes > 0)
        .toSorted((a, b) => b[1] - a[1])
        .map(([key]) => key);
    const { shown, folded } = capped(packages, limit);

    const idOf = new Map<string, string>(packages.map(key => [key, key]));
    for (const key of folded) {
        idOf.set(key, FLOW_IDS.morePackages);
    }
    idOf.set(FLOW_IDS.own, FLOW_IDS.own);
    idOf.set(FLOW_IDS.unattributed, FLOW_IDS.unattributed);
    idOf.set(FLOW_IDS.unknown, FLOW_IDS.unknown);

    const node = (id: string, kind: FlowSource['kind'], keys: readonly string[]): FlowSource => {
        const reach = reachOf(fine, keys);
        const only = reach !== 'all' && reach.size === 1 ? [...reach][0] : undefined;
        return {
            id,
            kind,
            label: kind === 'package' ? id : '',
            bytes: keys.reduce((sum, key) => sum + (fine.bytes.get(key) ?? 0), 0),
            bootBytes: keys.reduce((sum, key) => sum + (fine.bootBytes.get(key) ?? 0), 0),
            screens: reachCount(reach, n),
            onlyScreen: only === undefined ? null : (labelOf.get(only) ?? only),
            members: kind === 'rest' ? [...keys] : [],
        };
    };

    const sources = [
        ...shown.map(key => node(key, 'package', [key])),
        node(FLOW_IDS.own, 'own', [FLOW_IDS.own]),
        node(FLOW_IDS.unattributed, 'unattributed', [FLOW_IDS.unattributed]),
        node(FLOW_IDS.unknown, 'unknown', [FLOW_IDS.unknown]),
        ...(folded.length > 0 ? [node(FLOW_IDS.morePackages, 'rest', folded)] : []),
    ].filter(source => source.bytes > 0);
    return { sources, idOf };
};

/** The middle column: the bootstrap, the shared chunks by what they cost (size × screens), every screen's own. */
const middlesOf = (
    fine: Fine,
    n: number,
    limit: number,
): { middles: FlowMiddle[]; idOf: (chunk: ChunkFlow) => string } => {
    const shared = fine.chunks
        .filter(chunk => chunk.zone === 'shared')
        .toSorted((a, b) => b.bytes * b.screens - a.bytes * a.screens || b.bytes - a.bytes);
    const { shown, folded } = capped(shared, limit);
    const foldedFiles = new Set(folded.map(chunk => chunk.file));

    const idOf = (chunk: ChunkFlow): string => {
        if (chunk.zone === 'boot') {
            return FLOW_IDS.boot;
        }
        if (chunk.zone === 'own') {
            return FLOW_IDS.ownChunks;
        }
        return foldedFiles.has(chunk.file) ? FLOW_IDS.moreShared : chunk.file;
    };

    const node = (id: string, kind: FlowMiddle['kind'], chunks: readonly ChunkFlow[]): FlowMiddle => ({
        id,
        kind,
        zone: kind === 'boot' ? 'boot' : kind === 'own' ? 'own' : 'shared',
        label: kind === 'shared' ? (chunks[0]?.file.split('/').pop() ?? id) : '',
        bytes: chunks.reduce((sum, chunk) => sum + chunk.bytes, 0),
        chunks: chunks.map(chunk => chunk.file),
        screens: kind === 'boot' ? n : new Set(chunks.flatMap(chunk => chunk.downloadedBy)).size,
    });

    const middles = [
        node(
            FLOW_IDS.boot,
            'boot',
            fine.chunks.filter(chunk => chunk.zone === 'boot'),
        ),
        ...shown.map(chunk => node(chunk.file, 'shared', [chunk])),
        ...(folded.length > 0 ? [node(FLOW_IDS.moreShared, 'rest', folded)] : []),
        node(
            FLOW_IDS.ownChunks,
            'own',
            fine.chunks.filter(chunk => chunk.zone === 'own'),
        ),
    ].filter(middle => middle.bytes > 0);
    return { middles, idOf };
};

/** One node of the right column: a screen, or several folded into one. */
const targetNode = (id: string, kind: FlowTarget['kind'], screens: readonly ScreenCost[]): FlowTarget => ({
    id,
    kind,
    label: kind === 'screen' ? (screens[0]?.label ?? id) : '',
    boot: screens.reduce((sum, screen) => sum + screen.boot, 0),
    shared: screens.reduce((sum, screen) => sum + screen.shared, 0),
    own: screens.reduce((sum, screen) => sum + screen.own, 0),
    total: screens.reduce((sum, screen) => sum + screen.total, 0),
    members: screens.map(screen => screen.source),
});

/** The right column: the screens heaviest first, folded past the limit — or the page itself, when there is no lazy screen. */
const targetsOf = (analysis: Analysis, limit: number): { targets: FlowTarget[]; idOf: Map<string, string> } => {
    const { shown, folded } = capped(analysis.screens, limit);
    const idOf = new Map<string, string>(analysis.screens.map(screen => [screen.source, screen.source]));
    for (const screen of folded) {
        idOf.set(screen.source, FLOW_IDS.moreScreens);
    }

    if (analysis.screens.length === 0) {
        const page: FlowTarget = {
            id: FLOW_IDS.app,
            kind: 'app',
            label: '',
            boot: analysis.bootBytes,
            shared: 0,
            own: 0,
            total: analysis.bootBytes,
            members: [],
        };
        return { targets: [page], idOf };
    }
    const targets = [
        ...shown.map(screen => targetNode(screen.source, 'screen', [screen])),
        ...(folded.length > 0 ? [targetNode(FLOW_IDS.moreScreens, 'rest', folded)] : []),
    ];
    return { targets, idOf };
};

const inOrder = <T extends { id: string }>(nodes: readonly T[], order: readonly string[]): T[] => {
    const byId = new Map(nodes.map(node => [node.id, node]));
    return order.map(id => byId.get(id)).filter((node): node is T => node !== undefined);
};

/**
 * The flow of an analysis: the three columns, the ribbons between them and the paths through them,
 * each column in the order that crosses the fewest ribbons, with the small nodes folded.
 */
export const flowOf = (analysis: Analysis, limits: FlowLimits = FLOW_LIMITS): FlowModel => {
    const fine = fineOf(analysis);
    const n = analysis.screens.length;
    const left = sourcesOf(analysis, fine, limits.sources);
    const middle = middlesOf(fine, n, limits.shared);
    const right = targetsOf(analysis, limits.targets);

    // --- ribbons and paths, on the folded ids -----------------------------------------------------
    const inBytes = new Map<string, number>();
    const outBytes = new Map<string, number>();
    const pathBytes = new Map<string, number>();
    for (const chunk of fine.chunks) {
        const via = middle.idOf(chunk);
        // How many of the chunk's screens each drawn target stands for: a folded group of screens
        // receives the chunk once per screen in it, because each of them downloads it.
        const perTarget = new Map<string, number>();
        for (const source of chunk.downloadedBy) {
            add(perTarget, right.idOf.get(source) ?? source, 1);
        }
        if (n === 0 && chunk.zone === 'boot') {
            perTarget.set(FLOW_IDS.app, 1);
        }

        for (const [key, bytes] of chunk.parts) {
            const from = left.idOf.get(key) ?? FLOW_IDS.morePackages;
            add(inBytes, `${from}${SEP}${via}`, bytes);
            for (const [to, count] of perTarget) {
                add(pathBytes, `${from}${SEP}${via}${SEP}${to}`, bytes * count);
                add(outBytes, `${via}${SEP}${to}`, bytes * count);
            }
        }
    }

    const zoneOf = new Map(middle.middles.map(node => [node.id, node.zone]));
    const linksOf = (sums: Map<string, number>, middleAt: 'from' | 'to'): FlowLink[] =>
        [...sums]
            .filter(([, bytes]) => bytes > 0)
            .map(([key, bytes]) => {
                const [from = '', to = ''] = key.split(SEP);
                return { from, to, bytes, zone: zoneOf.get(middleAt === 'from' ? from : to) ?? 'own' };
            });
    const inLinks = linksOf(inBytes, 'to');
    const outLinks = linksOf(outBytes, 'from');
    const paths: FlowPath[] = [...pathBytes].map(([key, bytes]) => {
        const [source = '', via = '', target = ''] = key.split(SEP);
        return { source, middle: via, target, bytes };
    });

    const order = orderColumns(
        {
            sources: left.sources.map(node => node.id),
            middles: middle.middles.map(node => node.id),
            targets: right.targets.map(node => node.id),
        },
        { inLinks, outLinks },
        {
            sources: { first: [], last: [FLOW_IDS.morePackages] },
            middles: { first: [FLOW_IDS.boot], last: [FLOW_IDS.moreShared, FLOW_IDS.ownChunks] },
            targets: { first: [], last: [FLOW_IDS.moreScreens] },
        },
    );

    return {
        sources: inOrder(left.sources, order.sources),
        middles: inOrder(middle.middles, order.middles),
        targets: inOrder(right.targets, order.targets),
        inLinks,
        outLinks,
        paths,
        buildBytes: middle.middles.reduce((sum, node) => sum + node.bytes, 0),
        downloadBytes: right.targets.reduce((sum, node) => sum + node.total, 0),
        screens: n,
        takeaway: takeawayOf(analysis, fine),
    };
};
