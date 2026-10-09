/**
 * Keys, tokens and internal addresses left in a deployed bundle.
 *
 * The cheapest finding this tool can make and one of the most expensive to have: the files are
 * already open, and the answer is worth an afternoon of somebody's week.
 *
 * **The whole difficulty is the false positives.** A security signal that cries wolf four times is
 * a security signal somebody switches off, and then the fifth one — the real one — is never seen.
 * So every pattern here is one that identifies a **specific** credential format by its own prefix
 * and length: `AKIA` plus sixteen characters is an AWS access key and nothing else. There is
 * deliberately no rule for "a long string next to the word `key`", which is the pattern that finds
 * the real ones and also finds a hundred minified variable names.
 *
 * Nothing found here is ever printed whole. This report gets pasted into issues, and a tool that
 * prints a live credential in full has published it a second time.
 */

import { type SecretKind, type SecretMatch } from './scan.types';

interface Pattern {
    kind: SecretKind;
    pattern: RegExp;
    /** How much of each end to keep when the match is written down. */
    keep: number;
}

/**
 * Private hosts. `.local`, `.internal`, `.corp` and the RFC 1918 ranges: an address that cannot
 * resolve from outside the office is either a leak of internal topology or a build that was
 * pointed at the wrong environment. Both are worth a line, and neither is a false positive.
 */
// The rest of the URL, up to whatever quote or space ends it — the port included. The backtick goes
// in through `${}`: written as \` inside String.raw it would carry its backslash into the pattern.
const URL_TAIL = String.raw`[^\s"'${'`'}]*`;
const INTERNAL_HOST = String.raw`https?:\/\/(?:[\w-]+\.)*(?:local|internal|intranet|corp|lan|test)\b${URL_TAIL}`;
const PRIVATE_IP = String.raw`https?:\/\/(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.[\d.]${URL_TAIL}`;

const PATTERNS: Pattern[] = [
    // A PEM block in a browser bundle is never right, whatever it turns out to be a key for. The
    // header with a body after it: the header alone is also what a form shows as the placeholder
    // of a field to paste a key into — PocketBase's Apple sign-in settings do — and that was a
    // `high` at the top of the report, an instruction to rotate a key, and every build failing
    // `--fail-on high`. A body is base64 after a line break, written raw or as `\n` in a string.
    {
        kind: 'privateKey',
        pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----(?:\\[nr]|\s)+[\d+/=A-Za-z]{64}/g,
        keep: 40,
    },
    { kind: 'awsKey', pattern: /\b(?:AKIA|ASIA)[\dA-Z]{16}\b/g, keep: 4 },
    { kind: 'googleKey', pattern: /\bAIza[\w-]{35}\b/g, keep: 6 },
    { kind: 'githubToken', pattern: /\bgh[pousr]_[\dA-Za-z]{36,}\b/g, keep: 5 },
    { kind: 'slackToken', pattern: /\bxox[abposr]-[\d-]+-[\dA-Za-z]{20,}\b/g, keep: 6 },
    // A JWT with three base64url segments. Often a demo token somebody forgot; sometimes not.
    { kind: 'jwt', pattern: /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}\b/g, keep: 8 },
    { kind: 'internalUrl', pattern: new RegExp(`${INTERNAL_HOST}|${PRIVATE_IP}`, 'g'), keep: 24 },
    /**
     * `process.env.SOMETHING` still in the output. It means the substitution did not happen, which
     * is a broken build before it is a leak — and it is the one that most often points at a bundle
     * built with the wrong configuration.
     */
    { kind: 'envLeftover', pattern: /\bprocess\.env\.[A-Z][\dA-Z_]{2,}/g, keep: 40 },
];

/**
 * The other keys of a Firebase web configuration. The `apiKey` of that object is a Google key by
 * shape, and it is public by design: it names the project to Google's servers, and every web app
 * using Firebase ships it. What protects the data is the security rules and App Check, not the key.
 * Reporting it as a leaked credential is the false positive that gets a security signal switched
 * off, so it is recognised by its neighbours rather than by a list of known keys.
 */
const FIREBASE_NEIGHBOURS = /\b(?:authDomain|projectId|messagingSenderId|storageBucket|measurementId)\b/;

/**
 * A build that defines `process.env` itself — `window.process = { env: { NODE_ENV: 'production' } }`
 * in its page, as Polymer's starter kit does on purpose — has left no substitution undone: its
 * `process.env.NODE_ENV` reads a value that is there. It was reported as a secret of medium severity.
 */
const DEFINES_ENV = /\bprocess\s*=\s*\{\s*env\s*:|\bprocess\.env\s*=[^=]/;

/** How far either side of a match its neighbours are looked for: one minified object literal. */
const NEIGHBOURHOOD = 400;

/**
 * Who wrote the text at a position of a chunk, when that can be known. Built by the caller, which
 * has the source maps and the metafile: this file only reads text.
 */
export type OwnerOf = (chunk: string, index: number, match: string) => string | null;

/** A match with its middle taken out: enough to find it in the file, never enough to use it. */
const redact = (value: string, keep: number): string =>
    value.length <= keep * 2 ? value : `${value.slice(0, keep)}…${value.slice(-4)}`;

/**
 * @param texts chunk name → its text. Only scripts and stylesheets are worth passing: a source map
 *              holds the original source and would match on everything the source says, which is a
 *              different question and is answered separately.
 */
export const findSecrets = (texts: ReadonlyMap<string, string>, ownerOf: OwnerOf | null = null): SecretMatch[] => {
    const found = new Map<string, SecretMatch>();
    // A loop, not `Iterator#some`: this runs on Node 20, which has no iterator helpers.
    let envDefined = false;
    for (const text of texts.values()) {
        envDefined ||= DEFINES_ENV.test(text);
    }

    /** One match: counted when it was seen before, written down with what explains it when not. */
    const record = (chunk: string, text: string, kind: SecretKind, keep: number, hit: RegExpExecArray): void => {
        const [match] = hit;
        // One entry per distinct string, with a count: the same key in eight chunks is one problem,
        // and eight cards would bury the other seven signals of the report.
        const key = `${kind}\u{0}${match}`;
        const existing = found.get(key);
        if (existing) {
            existing.count += 1;
            return;
        }

        const around = text.slice(Math.max(0, hit.index - NEIGHBOURHOOD), hit.index + NEIGHBOURHOOD);
        const firebase = kind === 'googleKey' && FIREBASE_NEIGHBOURS.test(around);
        const benign = firebase ? 'firebaseConfig' : kind === 'envLeftover' && envDefined ? 'envDefined' : null;
        const owner = kind === 'envLeftover' && ownerOf ? ownerOf(chunk, hit.index, match) : null;
        found.set(key, { kind, chunk, redacted: redact(match, keep), count: 1, benign, owner });
    };

    for (const [chunk, text] of texts) {
        for (const { kind, pattern, keep } of PATTERNS) {
            for (const hit of text.matchAll(pattern)) {
                record(chunk, text, kind, keep, hit);
            }
        }
    }

    // The ones that are always serious first; the environment leftovers last, since those are a
    // build problem more often than a leak.
    const rank: Record<SecretKind, number> = {
        privateKey: 0,
        awsKey: 1,
        githubToken: 2,
        slackToken: 3,
        googleKey: 4,
        jwt: 5,
        internalUrl: 6,
        envLeftover: 7,
    };

    // What is a leak first; what has an explanation — a public Firebase key, a package reading its
    // own switch — after everything that does not.
    const explained = (match: SecretMatch): number => Number(!!match.benign || !!match.owner);
    return [...found.values()].toSorted(
        (a, b) => explained(a) - explained(b) || rank[a.kind] - rank[b.kind] || b.count - a.count,
    );
};
