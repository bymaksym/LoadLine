import { describe, expect, it } from 'vitest';
import {
    baseName,
    chainSteps,
    elidePath,
    formatBytes,
    formatDelta,
    packageOf,
    projectFolderOf,
    screenLabel,
    shortName,
} from './format.utils';

describe('formatBytes', () => {
    it('stays in kB up to the megabyte, so a column of figures compares at a glance', () => {
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(1024)).toBe('1 kB');
        expect(formatBytes(180_000)).toBe('176 kB');
        expect(formatBytes(2_500_000)).toBe('2.38 MB');
    });
});

describe('formatDelta', () => {
    it('signs the difference, with the typographic minus', () => {
        expect(formatDelta(12_288)).toBe('+12 kB');
        expect(formatDelta(-3072)).toBe('−3 kB');
        expect(formatDelta(0)).toBe('+0 B');
    });
});

describe('packageOf', () => {
    it('names the package a file belongs to, scope included', () => {
        expect(packageOf('node_modules/lodash/index.js')).toBe('lodash');
        expect(packageOf('node_modules/@angular/core/core.mjs')).toBe('@angular/core');
    });

    it('skips the extra segment pnpm puts in the path', () => {
        expect(packageOf('node_modules/.pnpm/rxjs@7.8.0/node_modules/rxjs/index.js')).toBe('rxjs');
        expect(shortName('node_modules/.pnpm/rxjs@7.8.0/node_modules/rxjs/index.js')).toBe('rxjs/index.js');
    });

    it('returns null for project code, which is what tells the two apart', () => {
        expect(packageOf('src/app/core/analysis/analysis.ts')).toBeNull();
    });
});

describe('chainSteps', () => {
    it('collapses consecutive files of the same package into the package name', () => {
        const chain = [
            'src/main.ts',
            'src/app/app.config.ts',
            'node_modules/msal/a.js',
            'node_modules/msal/b.js',
            'node_modules/msal/c.js',
        ];

        expect(chainSteps(chain)).toEqual(['src/main.ts', 'src/app/app.config.ts', 'msal']);
    });
});

describe('projectFolderOf', () => {
    it('attributes a file to two levels of its own folders', () => {
        expect(projectFolderOf('src/app/core/services/auth.ts')).toBe('core/services');
        expect(projectFolderOf('src/shared/enums/roles.ts')).toBe('shared/enums');
    });

    it('finds the source root in a workspace, where it is not at the front of the path', () => {
        // Anchoring at the start of the path put every file of an application in `apps/web`, so the
        // bootstrap breakdown by folder came out as a single row.
        expect(projectFolderOf('apps/web/src/app/features/users/users.page.ts')).toBe('features/users');
        expect(projectFolderOf('apps/admin/src/app/core/auth/auth.ts')).toBe('core/auth');
    });

    it('a library whose code sits right under its root is named by the library', () => {
        expect(projectFolderOf('libs/shared/ui/src/lib/button/button.ts')).toBe('ui/button');
    });

    it('a file with nowhere to go keeps what it has', () => {
        expect(projectFolderOf('main.ts')).toBe('main.ts');
        expect(projectFolderOf('src/main.ts')).toBe('src');
    });
});

describe('screenLabel', () => {
    it('reads a screen name out of the file it comes from', () => {
        expect(screenLabel('src/app/features/users/users.page.ts')).toBe('users');
        expect(screenLabel('src/app/features/users/users.routes.ts')).toBe('users');
        expect(screenLabel('src/app/features/users/list.component.ts')).toBe('list');
    });

    it('strips every suffix the screen rules recognise, not a shorter list of its own', () => {
        // `.view` and `.container` counted as views in `entries.ts` while the label knew nothing
        // about them, so such a screen was listed as `user.view`.
        expect(screenLabel('src/app/features/user.view.ts')).toBe('user');
        expect(screenLabel('src/app/features/user.container.tsx')).toBe('user');
    });

    /** A screen written as a single-file component was listed with its extension on: `orders.vue`. */
    it('knows a screen can be a single-file component', () => {
        expect(screenLabel('src/pages/orders.page.vue')).toBe('orders');
        expect(screenLabel('app/pages/orders.vue')).toBe('orders');
        expect(screenLabel('src/lib/chart.widget.svelte')).toBe('chart.widget');
    });

    /**
     * SvelteKit names every route file the same and puts the route in the folder, so three screens
     * came out as three rows called `+page.svelte`.
     */
    it('names a route file after its folder, which is where the route is', () => {
        expect(screenLabel('src/routes/orders/+page.svelte')).toBe('orders');
        expect(screenLabel('src/routes/+layout.svelte')).toBe('layout');
        expect(screenLabel('src/routes/+page.svelte')).toBe('page');
    });
});

describe('baseName', () => {
    it('keeps the last segment, which is how chunks are named everywhere else', () => {
        expect(baseName('dist/browser/main-ABC.js')).toBe('main-ABC.js');
        expect(baseName('main-ABC.js')).toBe('main-ABC.js');
    });
});

describe('elidePath', () => {
    it('leaves a path that already fits alone', () => {
        expect(elidePath('src/app/main.ts')).toBe('src/app/main.ts');
    });

    it('drops middle folders and keeps the two ends, which are the ones that say something', () => {
        // The cell used to break this one as `…ICustomerSummary.interfa` / `ce.ts`: the half of the
        // name that identifies the file, split across two lines.
        expect(elidePath('src/app/features/customers/detail/ICustomerSummary.interface.ts')).toBe(
            'src/…/detail/ICustomerSummary.interface.ts',
        );
    });

    it('never cuts the last segment, however long it is', () => {
        const long = 'src/app/a-name-that-is-far-longer-than-any-cell-will-ever-be.component.ts';
        expect(elidePath(long).endsWith('a-name-that-is-far-longer-than-any-cell-will-ever-be.component.ts')).toBe(
            true,
        );
    });

    it('has nothing to drop when there is no middle', () => {
        expect(elidePath('a-single-very-long-file-name-with-no-folders-at-all-in-it.ts')).toBe(
            'a-single-very-long-file-name-with-no-folders-at-all-in-it.ts',
        );
    });
});
