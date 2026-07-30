/**
 * The double for the `vscode` module.
 *
 * `vscode` is injected by the extension host at runtime and has no npm package behind it,
 * so under Node it simply cannot be resolved. `vitest.config.ts` aliases it here, which is
 * what lets `src/extension.ts` — the one file that imports it — load in a test and count
 * towards coverage.
 *
 * It stays deliberately small: everything else in `src/` receives the host API through a
 * port, so this file only ever needs what the adapter itself touches.
 */

export {};
