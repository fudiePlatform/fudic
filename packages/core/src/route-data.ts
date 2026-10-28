/**
 * A route repaints with its new `data` after a call (SDD-68 §4.8). For the emit only: the chunk
 * of a route with `load` calls this from its hookup and puts the teardown in `$d`.
 *
 * The stub of a server function dispatches `DATA_STALE_EVENT` on `document` once it has
 * invalidated the page it was called from. The listener asks the server for the page's `data`
 * with `load.fetch` — the server runs `load`, the browser never does — hands it to `apply`,
 * which swaps the route's `data` and runs one rendering pass, and gives the call that work to
 * wait for: the code after the `await` sees the page up to date.
 *
 * Two notices before the first answer: the older request is aborted and its answer never
 * applied, so a slow first refresh cannot paint over a newer one.
 *
 * A refresh that fails — the network, a `load` under `use auth` answering 401 — reloads the
 * document: what the server paints for that is its rule to apply, not this function's.
 */

import { DATA_STALE_EVENT, type DataStaleDetail } from '@fudic/conventions';

/** What the browser module of a route exposes for its `load`. */
export interface DataSource<D> {
  fetch(path: string, signal?: AbortSignal): Promise<D>;
}

export function onStaleData<D>(load: DataSource<D>, apply: (data: D) => void): () => void {
  let latest: AbortController | null = null;
  const listener = (event: Event): void => {
    latest?.abort();
    const mine = new AbortController();
    latest = mine;
    const refresh = load.fetch(globalThis.location.pathname, mine.signal).then(
      (data) => {
        if (latest === mine) apply(data);
      },
      () => {
        if (latest === mine) globalThis.location.reload();
      },
    );
    (event as CustomEvent<DataStaleDetail>).detail.wait(refresh);
  };
  globalThis.document.addEventListener(DATA_STALE_EVENT, listener);
  return () => {
    latest?.abort();
    latest = null;
    globalThis.document.removeEventListener(DATA_STALE_EVENT, listener);
  };
}
