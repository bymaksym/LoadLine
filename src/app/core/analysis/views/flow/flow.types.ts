/** The shapes the flow view ("where the bytes go") produces. */

import { type Zone } from '../../analysis.types';

/**
 * A node of the left column: an npm package, all of the project's own code as one, the bytes the
 * bundler wrote that belong to no file, or the packages too small to draw on their own.
 */
export interface FlowSource {
    /** The package name, or one of the reserved ids in `FLOW_IDS`. */
    id: string;
    kind: 'package' | 'own' | 'unattributed' | 'rest';
    /** The package name. Empty for the reserved kinds, which the page names in its language. */
    label: string;
    /** What it weighs in the build, in the report's unit, counted once whoever downloads it. */
    bytes: number;
    /** Part of `bytes` that sits in the bootstrap: what every screen pays before anything else. */
    bootBytes: number;
    /** How many screens download some of it on their first trip. Every screen when any is in the bootstrap. */
    screens: number;
    /** The one screen that downloads it, when there is exactly one. Its label. */
    onlyScreen: string | null;
    /** The packages a `rest` node stands for. Empty for the others. */
    members: string[];
}

/**
 * A node of the middle column: where those bytes live. The bootstrap (every screen downloads it,
 * before anything), a shared chunk (several screens download it), or every screen's own chunks.
 */
export interface FlowMiddle {
    id: string;
    kind: 'boot' | 'shared' | 'rest' | 'own';
    /** The colour of the ribbons through it. A folded group of shared chunks is still shared. */
    zone: Zone;
    /** The chunk's file name for a shared chunk; empty for the other kinds. */
    label: string;
    /** Bytes in the build, counted once. */
    bytes: number;
    /** Chunks it stands for. */
    chunks: string[];
    /** Screens that download it: all of them for the bootstrap. */
    screens: number;
}

/**
 * A node of the right column: one screen, or the screens too many to draw one by one — or, in a
 * build with no lazy screen at all, the page itself, which downloads the bootstrap and nothing else.
 */
export interface FlowTarget {
    /** The screen's source file, or `FLOW_IDS.moreScreens`, or `FLOW_IDS.app`. */
    id: string;
    kind: 'screen' | 'rest' | 'app';
    label: string;
    /** The three parts of the first trip, as the screens table gives them. Summed for a `rest` node. */
    boot: number;
    shared: number;
    own: number;
    total: number;
    /** The screen sources it stands for: one, or the folded ones. */
    members: string[];
}

/** One ribbon: bytes from a node of one column to a node of the next. */
export interface FlowLink {
    from: string;
    to: string;
    bytes: number;
    /** The zone of the middle node it goes into or comes out of: the ribbon's colour. */
    zone: Zone;
}

/**
 * The finest grain the diagram draws: the bytes of one source that reach one screen through one
 * middle node. It is what lets a hovered package light up the part of each screen's ribbon that is
 * its own, rather than the whole ribbon — which would say the package is everything in the chunk.
 */
export interface FlowPath {
    source: string;
    middle: string;
    target: string;
    bytes: number;
}

/**
 * The one line under the diagram, worked out from the figures rather than written: the reason to
 * look at the diagram at all, said in a sentence.
 *
 * - `misplaced`: a package more screens download than need it. The bootstrap or a shared chunk
 *   carries it to screens none of whose files import it.
 * - `driver`: what makes the heaviest screen heavy, beyond the bootstrap everybody pays.
 * - `boot`: every screen is mostly bootstrap, so the heaviest part of it is the one to name.
 */
export type FlowTakeaway =
    | {
          kind: 'misplaced';
          source: string;
          own: boolean;
          bytes: number;
          where: 'boot' | 'shared';
          /** The labels of the screens whose files import it. */
          needers: string[];
          /** How many screens download it. */
          downloads: number;
      }
    | {
          kind: 'driver';
          source: string;
          own: boolean;
          /** What it adds to that screen on top of the bootstrap. */
          bytes: number;
          screen: string;
          total: number;
          where: 'shared' | 'own';
          downloads: number;
      }
    | { kind: 'boot'; source: string; own: boolean; bytes: number; boot: number; screens: number };

export interface FlowModel {
    /** Each column top to bottom, already in the order that crosses the fewest ribbons. */
    sources: FlowSource[];
    middles: FlowMiddle[];
    targets: FlowTarget[];
    /** Left to middle: bytes in the build. */
    inLinks: FlowLink[];
    /** Middle to right: bytes each screen downloads, so a chunk five screens load is five ribbons. */
    outLinks: FlowLink[];
    paths: FlowPath[];
    /** What the left and middle columns add up to: the bytes of the build any screen downloads. */
    buildBytes: number;
    /** What the right column adds up to: every screen's first trip, summed. */
    downloadBytes: number;
    screens: number;
    takeaway: FlowTakeaway | null;
}

/** Where a node is drawn. `y` and `h` in pixels; `x` is the left edge of its bar. */
export interface PlacedNode {
    id: string;
    column: 0 | 1 | 2;
    x: number;
    y: number;
    h: number;
}

/**
 * Where a ribbon is drawn: the slot it takes on the right edge of the node it leaves (`y0`, `h0`)
 * and on the left edge of the node it reaches (`y1`, `h1`). The two can differ in height — the
 * right column is on a scale of its own, see `layoutFlow`.
 */
export interface PlacedLink extends FlowLink {
    x0: number;
    y0: number;
    h0: number;
    x1: number;
    y1: number;
    h1: number;
}

export interface FlowLayout {
    nodes: PlacedNode[];
    inLinks: PlacedLink[];
    outLinks: PlacedLink[];
    width: number;
    height: number;
}

/** One node's figures, read off the model: what the panel under the diagram and the table say. */
export interface FlowDetail {
    /** Its bytes by where they live. A screen's are its bootstrap, shared and own parts. */
    zones: Record<Zone, number>;
    /** The nodes of the left column feeding it, heaviest first: for a screen, what it downloads of each. */
    sources: { id: string; bytes: number }[];
    /** The nodes of the middle column it goes through, heaviest first. */
    middles: { id: string; bytes: number }[];
    /** The screens it reaches, with what each one downloads of it, heaviest first. */
    targets: { id: string; bytes: number }[];
    /** A screen only: what it downloads of each source on top of the bootstrap, heaviest first. */
    beyondBoot: { id: string; bytes: number }[];
}

/** Where the three columns go and how tall the drawing is, in pixels. The page measures; the layout places. */
export interface FlowFrame {
    /** The left edge of each column's bars. */
    columns: readonly [number, number, number];
    nodeWidth: number;
    height: number;
    /** Between two nodes of a column. */
    gap: number;
    /** No node thinner than this, so the smallest is still something a pointer can find. */
    minNode: number;
}
