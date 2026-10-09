/** What a broken gate is, once checked. */

export type GateName = 'boot' | 'screen' | 'own' | 'growth' | 'growth-pct' | 'signals' | 'signal' | 'new-package';

export interface Violation {
    gate: GateName;
    /**
     * The screen it is about, or the signal for the `signal` gate. `null` for the bootstrap and for
     * the count of signals.
     */
    subject: string | null;
    /** The threshold that was asked for: bytes, a fraction, or a number of signals. */
    limit: number;
    /** What the build actually is, in the same unit as `limit`. */
    actual: number;
    /** The line the command prints. Already in the chosen language. */
    message: string;
}
