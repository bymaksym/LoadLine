/**
 * What reading the text of the chunks says, beyond how much it weighs.
 *
 * Every one of these comes from files the tool already has open. Nothing is fetched, no registry is
 * consulted, and nothing leaves the machine — the same rule the rest of the tool holds to, and the
 * reason a whole area normally sold as "DevSecOps" fits inside a page that runs from a `file://`
 * URL.
 */

/** What a match is: the thing that decides whether it is worth waking somebody up. */
export type SecretKind =
    'privateKey' | 'awsKey' | 'googleKey' | 'githubToken' | 'slackToken' | 'jwt' | 'internalUrl' | 'envLeftover';

export interface SecretMatch {
    kind: SecretKind;
    /** The chunk it is in. */
    chunk: string;
    /**
     * What was found, with the middle removed. Never the whole thing: this report gets pasted into
     * issues, and a tool that prints a live key in full has published it a second time.
     */
    redacted: string;
    /** How many times that same string appears across the build. */
    count: number;
}

/** Something that belongs to a development build and is in a deployed one. */
export type LeftoverKind = 'nodeEnv' | 'reactDev' | 'testFiles' | 'devServer' | 'consoleLogs' | 'debugger';

export interface Leftover {
    kind: LeftoverKind;
    /** How many of it there are: files, occurrences — whichever the kind counts. */
    count: number;
    /** Where, named. Never a sample: a list with four of forty printed has to be checked elsewhere. */
    where: string[];
    /**
     * Whether the count is known to be the project's own code.
     *
     * `false` means the occurrences are real and their author is not knowable: the chunk they are
     * in carries no source map, so a `console.log` written by the project and one shipped inside
     * `@angular/core` look exactly the same. The report has to say that instead of picking one.
     */
    attributed: boolean;
}

/** A licence found in the legal comments the bundler kept, with how it has to be treated. */
export type LicenceClass = 'permissive' | 'weakCopyleft' | 'strongCopyleft' | 'nonCommercial' | 'unknown';

export interface LicenceFound {
    /** The identifier as it was written, normalised: `GPL-3.0`, `MIT`, `Apache-2.0`. */
    id: string;
    class: LicenceClass;
    /** Chunks the comment appears in. */
    chunks: string[];
    /** The packages named in the same comment, when it names any. */
    packages: string[];
}

/** One category of third-party code, and what it costs. */
export interface ThirdPartyGroup {
    /** `analytics`, `ads`, `support`, `errors`, `experiments`, `payments`, `maps`, `social`. */
    category: string;
    packages: { name: string; bytes: number; inBoot: boolean }[];
    bytes: number;
    /** Of that, what is in the bootstrap: what everybody downloads before seeing anything. */
    bootBytes: number;
}

/** What a deployed source map gives away. */
export interface SourceMapExposure {
    /** How many maps were read. */
    maps: number;
    /** Source files of the project reconstructable from them. */
    ownFiles: number;
    /** Whether the maps carry the source text itself, which is the difference that matters. */
    hasContent: boolean;
    /** A few of the internal paths, exactly as the map spells them. */
    paths: string[];
    /** References to environment variables inside the reconstructed source. */
    envReferences: number;
}

export interface ScanReport {
    secrets: SecretMatch[];
    leftovers: Leftover[];
    licences: LicenceFound[];
    thirdParty: ThirdPartyGroup[];
    /** `null` when the folder carried no source maps to read. */
    exposure: SourceMapExposure | null;
}
