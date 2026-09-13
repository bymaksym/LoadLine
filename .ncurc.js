/**
 * `npm-check-updates` configuration (`pnpm run deps:check` / `pnpm run deps:update`).
 *
 * The app is on Angular 22. Whatever is tied to the Angular major is limited to its current
 * branch: proposing the next major is noise, because it cannot be accepted on its own without
 * breaking the build. Everything NOT tied to Angular is still proposed in full — the report has
 * to stay actionable, not hide pending work.
 *
 * ⚠️ `peerDependencies` alone do NOT settle this. A package may support a single Angular major
 * without declaring any peer (its compatibility matrix lives in its docs). When reviewing this
 * list, check both: the declared peer and what the project documents.
 */

/**
 * Tied to the Angular major:
 *   `@angular/*`         → the framework itself.
 *   `angular-eslint`     → peer `@angular/cli` pinned to one major.
 *   `vitest`             → `ng test` runs it THROUGH `@angular/build`, whose peer says `^4.0.8`.
 *                          Being a major ahead worked, and a peer range that already says no is
 *                          a breakage nobody is going to treat as a bug.
 */
const ANGULAR_COUPLED = [/^@angular\//, /^@angular-eslint\//, /^angular-eslint$/, /^vitest$/];

module.exports = {
    /**
     * Quarantine for freshly published versions: nothing published in the last three days is
     * proposed. That is the window in which a compromised release gets spotted and unpublished.
     *
     * It lives here and not in the scripts because it was in two of them, and a policy written
     * twice is a policy that drifts. Note it only covers what ncu proposes, i.e. DIRECT
     * dependencies: the same quarantine for transitive ones is `minimumReleaseAge` in
     * pnpm-workspace.yaml, and the two numbers are meant to agree.
     */
    cooldown: '3d',

    /** `time` dates each proposal and `cooldown` shows what the quarantine held back. */
    format: ['group', 'time', 'cooldown'],

    target: name => {
        // `@angular/compiler-cli@22` declares `typescript: ">=6.0 <6.1"`: not only the next major is
        // out, also the next minor. Hence `patch`, not `minor`.
        if (name === 'typescript') {
            return 'patch';
        }

        return ANGULAR_COUPLED.some(pattern => pattern.test(name)) ? 'minor' : 'latest';
    },
};
