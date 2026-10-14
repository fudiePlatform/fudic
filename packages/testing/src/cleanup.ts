/**
 * Isolation between tests (§4.8): what each piece of the harness has to undo after a test,
 * run by the `afterEach` the environment registers. A piece that leaves something behind —
 * the `fetch` of the in-memory server, the simulated worker — adds its own undo here.
 */

const undos: (() => void)[] = [];

/** Undo `fn` after every test. */
export function onCleanup(fn: () => void): void {
  undos.push(fn);
}

/** Run every undo, in the order they were added. */
export function cleanup(): void {
  for (const undo of undos) undo();
}
