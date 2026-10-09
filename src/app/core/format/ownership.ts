/**
 * Yours or theirs: the one place that decides whether a file is the project's own code or a
 * dependency, and what the dependency is called.
 *
 * It was a dozen `includes('node_modules')` across the analysis, the scan and the command, each
 * written for the case in front of it, and `packageOf` beside them. Two builds showed where that
 * ends. Sapper keeps an application's own modules in `src/node_modules/` so they import by name —
 * the RealWorld app's `api.js` and `utils.js` — and they came out as packages. And a monorepo's
 * `packages/ui` is a dependency of the app in every sense but where it sits, and came out as yours.
 *
 * The default is `node_modules/`, with Sapper's convention read; `build.own` and
 * `build.dependencies` of `loadline.json` say the rest for a project (`setOwnership`). Like the
 * language of the figures, it is set once from outside — by the command when it reads the file, by
 * the page when one is dropped — because it is asked from everywhere a path is named.
 */

/** A path pattern of `loadline.json`, matched against the start of a path, segment by segment. */
interface Rule {
    pattern: string;
    at: RegExp;
}

const rules: { own: Rule[]; dependencies: Rule[] } = { own: [], dependencies: [] };

/**
 * `packages/*` matches `packages/ui/src/x.ts` and captures `packages/ui`: `*` is one segment or a
 * part of one, `**` any number of them. The capture is what names a dependency.
 */
const ruleOf = (pattern: string): Rule => {
    const source = pattern
        .replace(/^\.?\//, '')
        .replace(/\/+$/, '')
        .split('**')
        .map(part =>
            part
                .split('*')
                .map(text => text.replaceAll(/[$()+.?[\\\]^{|}]/g, String.raw`\$&`))
                .join('[^/]*'),
        )
        .join('.*');
    return { pattern, at: new RegExp(`^(${source})(?:/|$)`) };
};

/** The project's own words on it, from `build.own` and `build.dependencies`; `null` clears them. */
export const setOwnership = (
    hints: { own?: readonly string[]; dependencies?: readonly string[] } | null | undefined,
): void => {
    rules.own = (hints?.own ?? []).map(pattern => ruleOf(pattern));
    rules.dependencies = (hints?.dependencies ?? []).map(pattern => ruleOf(pattern));
};

/**
 * Sapper's convention: `src/node_modules/` holds the application's own modules, importable by name,
 * and `src/node_modules/@sapper/` the runtime Sapper writes there, which is the framework's. A
 * package's own `node_modules` further in is a package again.
 */
const isSapperOwn = (path: string): boolean => {
    const marker = 'src/node_modules/';
    const at = path.indexOf(marker);
    if (at === -1 || (at > 0 && path[at - 1] !== '/')) {
        return false;
    }
    const inside = path.slice(at + marker.length);
    return !inside.startsWith('@sapper/') && !inside.includes('node_modules/');
};

/** The part of the path a `build.dependencies` pattern matched, when one did. */
const declaredDependency = (path: string): string | null => {
    for (const rule of rules.dependencies) {
        const match = rule.at.exec(path);
        if (match?.[1]) {
            return match[1];
        }
    }
    return null;
};

/** Whether a source file is a dependency rather than the project's own code. */
export const isDependency = (path: string): boolean => {
    // `build.own` first: it wins over a dependency pattern that matches the same file.
    const own = rules.own.some(rule => rule.at.test(path));
    return !own && (declaredDependency(path) !== null || (path.includes('node_modules/') && !isSapperOwn(path)));
};

/** The opposite, for the many places that ask it that way round. */
export const isOwnFile = (path: string): boolean => !isDependency(path);

/**
 * What a `build.dependencies` pattern makes of a path: the package name — the last segment of what
 * the pattern matched, or the last two when they are a scope and a name — and the rest. `null`
 * when no pattern matched.
 */
export const declaredPackage = (path: string): { name: string; rest: string } | null => {
    const prefix = declaredDependency(path);
    if (!prefix || rules.own.some(rule => rule.at.test(path))) {
        return null;
    }
    const segments = prefix.split('/');
    const scoped = segments.at(-2)?.startsWith('@') === true;
    return {
        name: segments.slice(scoped ? -2 : -1).join('/'),
        rest: path.slice(prefix.length).replace(/^\//, ''),
    };
};
