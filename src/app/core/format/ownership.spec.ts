import { afterEach, describe, expect, it } from 'vitest';
import { packageOf, shortName } from './format.utils';
import { isDependency, setOwnership } from './ownership';

afterEach(() => setOwnership(null));

describe('yours or theirs, by default', () => {
    it('is node_modules/, at any depth and under pnpm', () => {
        expect(isDependency('node_modules/react/index.js')).toBe(true);
        expect(isDependency('node_modules/.pnpm/a@1.0.0/node_modules/a/x.js')).toBe(true);
        expect(isDependency('src/app/home.ts')).toBe(false);
    });

    /**
     * Sapper keeps an application's own modules in `src/node_modules/` so they import by name, and
     * writes its runtime into `src/node_modules/@sapper/`. The RealWorld app's `api.js` came out as a
     * package called `api.js`, and Sapper's runtime as one called `@sapper/app.mjs`.
     */
    it("reads Sapper's src/node_modules as yours, and its @sapper/ as Sapper's", () => {
        expect(isDependency('src/node_modules/api.js')).toBe(false);
        expect(packageOf('src/node_modules/api.js')).toBeNull();
        expect(shortName('src/node_modules/api.js')).toBe('src/node_modules/api.js');

        expect(packageOf('src/node_modules/@sapper/app.mjs')).toBe('@sapper/app');
        expect(packageOf('src/node_modules/@sapper/internal/shared.mjs')).toBe('@sapper/internal');
        // A package installed inside one of your modules is a package again.
        expect(isDependency('src/node_modules/ui/node_modules/lodash/index.js')).toBe(true);
    });

    it('names a package of a single file after the file', () => {
        expect(packageOf('node_modules/tiny.js')).toBe('tiny');
        expect(packageOf('node_modules/@scope/tiny.mjs')).toBe('@scope/tiny');
        expect(packageOf('node_modules/@scope/name/index.js')).toBe('@scope/name');
    });
});

describe('build.own and build.dependencies', () => {
    it('makes a workspace package a dependency, named after the folder the pattern matched', () => {
        setOwnership({ dependencies: ['packages/*'] });

        expect(isDependency('packages/ui/src/button.ts')).toBe(true);
        expect(packageOf('packages/ui/src/button.ts')).toBe('ui');
        expect(shortName('packages/ui/src/button.ts')).toBe('ui/src/button.ts');
        expect(isDependency('src/app/home.ts')).toBe(false);
    });

    it('keeps a scope in the name', () => {
        setOwnership({ dependencies: ['libs/@acme/*'] });

        expect(packageOf('libs/@acme/forms/index.ts')).toBe('@acme/forms');
    });

    it('makes code under node_modules yours, and that wins over a dependency pattern', () => {
        setOwnership({ own: ['node_modules/@acme/**'], dependencies: ['node_modules/@acme/*'] });

        expect(isDependency('node_modules/@acme/forms/index.js')).toBe(false);
        expect(packageOf('node_modules/@acme/forms/index.js')).toBeNull();
        expect(isDependency('node_modules/react/index.js')).toBe(true);
    });

    it('matches whole segments only', () => {
        setOwnership({ dependencies: ['vendor'] });

        expect(isDependency('vendor/chart.js')).toBe(true);
        expect(isDependency('vendors/chart.js')).toBe(false);
    });
});
