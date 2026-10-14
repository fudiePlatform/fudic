/** A module with a top-level effect: a bundler keeps it whole, whoever imports it. */
export const unused = 'never read';

(globalThis as { effectfulLoaded?: boolean }).effectfulLoaded = true;
