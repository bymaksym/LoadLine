/**
 * Lets the browser draw before the next thing blocks it.
 *
 * A label set in the same task as the work it announces is a label nobody ever sees: the frame
 * where it would have been painted is the frame the work is eating. One turn of the event loop is
 * enough, and it is all this is.
 */
export const paint = (): Promise<void> =>
    new Promise(resolve => {
        setTimeout(resolve, 0);
    });
