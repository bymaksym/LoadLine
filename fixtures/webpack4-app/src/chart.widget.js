import { money } from './shared.js';

/** Deferred from inside a screen. Nobody navigates to it. */
export const draw = () => `<svg role="img" aria-label="${money(42)}"><rect width="10" height="10" /></svg>`;
