/**
 * The one place that touches `localStorage`.
 *
 * Every read and write has to be wrapped: in a private window, in a browser set to block site data,
 * and in some `file://` setups — which is the main way this tool is opened — the accessor itself
 * throws rather than returning null. A single unguarded call is a page that renders nothing.
 *
 * It used to be a convention held by a lint rule naming the two services allowed to do it, which
 * meant the third one had to argue with the rule instead of reusing the guard. This is the guard.
 */

/** What was stored under the key, or `null` when there is nothing, or no storage at all. */
export const readLocal = (key: string): string | null => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

/** Stores a value, and quietly does not when the browser will not have it. */
export const writeLocal = (key: string, value: string): void => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // No storage: whatever this was lasts for this session, which is the whole of the harm.
    }
};
