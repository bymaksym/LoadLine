/**
 * What a lock file and an audit report say, crossed with what actually ships.
 *
 * This is the idea with the best value-to-rule ratio in the whole plan: it gives the entire
 * "which of my dependencies are a problem" question without touching the rule that nothing goes out
 * to the network. Both files are ones the person already has on their disk, and they come in through
 * the same door `angular.json` does.
 *
 * The crossing is the part neither tool can do alone. `pnpm audit` knows you have 47
 * vulnerabilities and nothing about which of them a browser downloads; Loadline knows what a
 * browser downloads and nothing about vulnerabilities. "3 of your 47 are in the first load and
 * everybody downloads them" is one afternoon well aimed; the other 44 are a backlog.
 */

/** One package as the lock file describes it. */
export interface LockedPackage {
    name: string;
    version: string;
    /** What asked for it. Empty for a direct dependency of the project. */
    requiredBy: string[];
}

export type Severity = 'critical' | 'high' | 'moderate' | 'low' | 'info';

/** One advisory, as `npm audit --json` and `pnpm audit --json` both express it. */
export interface Advisory {
    package: string;
    severity: Severity;
    title: string;
    /** The advisory URL, when the report carries one. Nothing here fetches it. */
    url: string | null;
    /** Versions the advisory covers, as written. */
    range: string | null;
    /** What upgrading to would fix it, when the report says. */
    fixedIn: string | null;
}

/** An advisory that matters here: its package is in the bundle. */
export interface ShippedAdvisory extends Advisory {
    /** Bytes of that package inside the bundle. */
    bytes: number;
    /** Whether it lands in the bootstrap, which is when everybody downloads it. */
    inBoot: boolean;
    /** How it gets in: the chain of packages from a direct dependency, when the lock file says. */
    chain: string[];
}

export interface DepsReport {
    /** Whether a lock file was given at all. */
    lockRead: boolean;
    /** Whether an audit report was given. Without one there are no advisories, not zero of them. */
    auditRead: boolean;
    /** Advisories whose package ships in the bundle, worst first. */
    shipped: ShippedAdvisory[];
    /** Advisories whose package does not ship: real, and not what a browser downloads. */
    notShipped: Advisory[];
    /**
     * Packages in the bundle that the project does not ask for directly, with what pulled them in.
     * The transitive half: `who brings this in` answered from the lock file rather than guessed.
     */
    transitive: { name: string; bytes: number; inBoot: boolean; chain: string[] }[];
    /** Packages shipping in more than one version, as the lock file sees it. */
    multipleVersions: { name: string; versions: string[] }[];
}
