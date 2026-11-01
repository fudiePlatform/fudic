import { DATA_STALE_EVENT, type DataStaleDetail } from '@fudic/conventions';

/** What a route's browser module exposes for its `load`. */
export interface DataSource<D> {
  fetch(path: string, signal?: AbortSignal): Promise<D>;
}

/**
 * Refreshes a route's `data` each time a server function marks it stale: fetches it, hands
 * it to `apply`, and lets the call wait for that. A newer notice aborts the older request.
 * A failed refresh reloads the page. Stops by itself once `root`, the route's `<body>`,
 * leaves the document. Returns the teardown. Used by compiled routes.
 */
export function onStaleData<D>(load: DataSource<D>, apply: (data: D) => void, root: Node): () => void {
  let latest: AbortController | null = null;
  const listener = (event: Event): void => {
    if (!root.isConnected) {
      stop();
      return;
    }
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
  const stop = (): void => {
    latest?.abort();
    latest = null;
    globalThis.document.removeEventListener(DATA_STALE_EVENT, listener);
  };
  globalThis.document.addEventListener(DATA_STALE_EVENT, listener);
  return stop;
}
