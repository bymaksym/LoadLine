/** The shapes the bundle search produces. */

import { type DuplicateCopy, type ModulePlace, type Zone } from './analysis.types';
import { type PathItem } from './path-tree.types';

export interface SearchResult {
    kind: 'package' | 'file';
    /** Package name or project file path. Doubles as the identifier of the row. */
    key: string;
    bytes: number;
    files: number;
    /**
     * The zone of its heaviest chunk, not the worst it reaches. A library spread over several
     * chunks — PrimeNG lands in five in a real app, 612 kB of them shared and 146 kB in the
     * bootstrap — would otherwise read as "the bootstrap pays all 772 kB of it", which is false.
     */
    zone: Zone;
    inBoot: boolean;
    /** Bytes landing in the bootstrap: the part every load of the app really pays for. */
    bootBytes: number;
    /** Chunks it lands in, heaviest first. */
    places: ModulePlace[];
    /** Screens loading it. Empty when it is in the bootstrap: there everybody loads it. */
    screens: { source: string; label: string }[];
    /** Import chain from the entry point, as readable steps. `null` when it was not reachable. */
    chain: string[] | null;
    /** Each copy of a duplicated package: what brings it and whether it is the one in the bootstrap. */
    copies: DuplicateCopy[];
    /** Its files, for the folder tree. Empty for a project file: it is the file. */
    contents: PathItem[];
    /** When the query matched file names instead of the package name, which ones matched. */
    matchedFiles: string[];
}

export interface IndexEntry extends SearchResult {
    /** Lowercase haystacks, so a keystroke only compares strings. */
    haystack: string;
    fileNames: string[];
}

export interface SearchIndex {
    entries: IndexEntry[];
    /** How many names can be searched: shown as "N searchable modules" before typing anything. */
    total: number;
}
