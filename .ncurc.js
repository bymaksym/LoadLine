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
 */
const ANGULAR_COUPLED = [/^@angular\//, /^@angular-eslint\//, /^angular-eslint$/];

module.exports = {
    target: name => {
        // `@angular/compiler-cli@22` declares `typescript: ">=6.0 <6.1"`: not only the next major is
        // out, also the next minor. Hence `patch`, not `minor`.
        if (name === 'typescript') {
            return 'patch';
        }

        return ANGULAR_COUPLED.some(pattern => pattern.test(name)) ? 'minor' : 'latest';
    },
};
