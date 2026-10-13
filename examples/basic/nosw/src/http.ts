/**
 * The app's global chain, for this build too. `src/http.ts` is looked up at the ROOT of the
 * project being built, and the root here is `nosw/` — the reason `fudic.json` has a copy beside
 * the config. Without this file the build has no chain: no `csrf`, and no `errorPages` to take
 * a failed call to `_error.fud`.
 */
export { default } from '../../src/http';
