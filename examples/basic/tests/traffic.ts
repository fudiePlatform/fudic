/**
 * Network capture for Service Worker scenarios.
 *
 * The question these tests exist to answer is never "was there a request?" but "WHO
 * answered it". Three states matter, and Chromium tells them apart:
 *
 *  - `fromServiceWorker`  the SW's fetch handler produced the response (cache or render).
 *  - `byServiceWorker`    the SW itself went to the network — its own egress.
 *  - neither              the page went to the real network, unintercepted.
 *
 * A fourth case has no flag of its own and is the one that hides bugs: the browser's
 * WORKER SCRIPT LOADER fetching `fudic-sw.js` and, before BUG-03, its whole static import
 * graph. Those requests do not pass through the fetch handler of the worker they belong
 * to, so they show up as plain network requests with no service-worker mark at all.
 */

import { type BrowserContext, type Page } from '@playwright/test';

export interface Hit {
  /** Path only (query kept): the origin is noise in a table. */
  readonly path: string;
  readonly type: string;
  readonly status: number | null;
  /** The SW's fetch handler answered (`FetchEvent.respondWith`). */
  readonly fromServiceWorker: boolean;
  /** The SW itself issued this request. */
  readonly byServiceWorker: boolean;
  readonly failed: boolean;
  /**
   * The `content-security-policy` of the response, when it carried one. It is the reliable
   * place to read a document's nonce from: the `nonce` content attribute is hidden from
   * script, and the CSP header is what the browser actually enforced.
   */
  readonly csp?: string;
}

export interface Recorder {
  /** Drop everything captured so far and start a fresh window. */
  reset(): void;
  /** Everything captured since the last `reset`. */
  hits(): readonly Hit[];
}

const pathOf = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
};

/** Start recording every request of the context, service-worker ones included. */
export function record(context: BrowserContext): Recorder {
  let hits: Hit[] = [];
  context.on('response', (response) => {
    const request = response.request();
    const csp = response.headers()['content-security-policy'];
    hits.push({
      path: pathOf(request.url()),
      type: request.resourceType(),
      status: response.status(),
      fromServiceWorker: response.fromServiceWorker(),
      byServiceWorker: request.serviceWorker() !== null,
      failed: false,
      ...(csp === undefined ? {} : { csp }),
    });
  });
  context.on('requestfailed', (request) => {
    hits.push({
      path: pathOf(request.url()),
      type: request.resourceType(),
      status: null,
      fromServiceWorker: false,
      byServiceWorker: request.serviceWorker() !== null,
      failed: true,
    });
  });
  return {
    reset(): void {
      hits = [];
    },
    hits(): readonly Hit[] {
      return hits;
    },
  };
}

export interface LoadOptions {
  /** Wait until a Service Worker is activated AND controlling this page. */
  readonly awaitControl?: boolean;
  /** Extra settle time, so requests the SW makes behind the load are captured. */
  readonly settleMs?: number;
}

/** Navigate (or reload) and return everything that crossed the wire during that load. */
export async function measure(
  recorder: Recorder,
  page: Page,
  action: () => Promise<unknown>,
  options: LoadOptions = {},
): Promise<readonly Hit[]> {
  recorder.reset();
  await action();
  if (options.awaitControl === true) {
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  }
  await page.waitForTimeout(options.settleMs ?? 1200);
  return recorder.hits();
}

/** Who answered a given path in this load. */
export function servedBy(hits: readonly Hit[], path: string): Hit[] {
  return hits.filter((h) => h.path === path);
}

/** The paths that went to the real network: nobody intercepted them. */
export function fromNetwork(hits: readonly Hit[]): Hit[] {
  return hits.filter((h) => !h.fromServiceWorker);
}

export interface CacheDump {
  readonly name: string;
  readonly entries: ReadonlyArray<{
    readonly url: string;
    /** Headers of the stored REQUEST — the key side of a Cache API match. */
    readonly requestHeaders: ReadonlyArray<readonly [string, string]>;
    /** Headers of the stored RESPONSE — `Vary` here decides what matching compares. */
    readonly responseHeaders: ReadonlyArray<readonly [string, string]>;
  }>;
}

/**
 * Everything in Cache Storage, keys included.
 *
 * A `cache-first` store that goes to the network is either empty or holding an entry
 * whose key does not match the request being asked for — and only the keys tell those
 * two apart.
 */
export async function dumpCaches(page: Page): Promise<CacheDump[]> {
  return page.evaluate(async () => {
    const out = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      const entries = [];
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        entries.push({
          url: request.url,
          requestHeaders: [...request.headers.entries()],
          responseHeaders: response === undefined ? [] : [...response.headers.entries()],
        });
      }
      out.push({ name, entries });
    }
    return out;
  });
}

/** Ask Cache Storage the same question the router asks, and report the answer. */
export async function probeMatch(page: Page, cacheName: string, url: string): Promise<boolean> {
  return page.evaluate(
    async ([name, target]) => {
      const cache = await caches.open(name!);
      return (await cache.match(target!)) !== undefined;
    },
    [cacheName, url],
  );
}

export function renderCaches(dumps: readonly CacheDump[]): string {
  const lines: string[] = ['\n=== CACHE STORAGE ==='];
  for (const dump of dumps) {
    lines.push(`  ${dump.name} (${dump.entries.length})`);
    for (const entry of dump.entries) {
      lines.push(`    ${entry.url}`);
      lines.push(`      req: ${JSON.stringify(entry.requestHeaders)}`);
      lines.push(`      res: ${JSON.stringify(entry.responseHeaders)}`);
    }
  }
  return lines.join('\n');
}

/** A readable table, so the trace can be read instead of inferred. */
export function render(title: string, hits: readonly Hit[]): string {
  const mark = (h: Hit): string => {
    if (h.failed) return 'FAILED  ';
    if (h.fromServiceWorker) return 'SW-serve';
    if (h.byServiceWorker) return 'SW-net  ';
    return 'NETWORK ';
  };
  const lines = hits.map(
    (h) => `  ${mark(h)}  ${String(h.status ?? '---').padEnd(4)} ${h.type.padEnd(9)} ${h.path}`,
  );
  return [`\n=== ${title} === (${hits.length} requests)`, ...lines].join('\n');
}
