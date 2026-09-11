/**
 * Copying text, with the failure treated as ordinary rather than exceptional.
 *
 * The clipboard is refused often and for reasons nobody looking at the page did anything about:
 * an insecure context, a permission the browser never asked for, a viewer that sandboxes it. Every
 * button that copies wants the same answer to that — say nothing, change nothing — so the `catch`
 * lives here instead of in each of them, and what a caller gets is whether the label may say
 * "copied".
 */
export const copyText = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
};
