/**
 * Test doubles for the Service Worker environment. Vitest runs these in the `node`
 * environment, which brings real streams, `Request`/`Response`, `crypto` and
 * `BroadcastChannel`; what Node has no equivalent of is the Cache API and the
 * `FetchEvent`, so those two are faked here — insertion-ordered, like the real one.
 */

/** Drain a byte stream and decode it as UTF-8 text. */
export async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return text + decoder.decode();
    }
    text += decoder.decode(value, { stream: true });
  }
}

/** A minimal Cache API double: a `Map` keyed by URL, so `keys()` is insertion order. */
export class FakeCache {
  readonly entries = new Map<string, Response>();

  async match(request: Request | string): Promise<Response | undefined> {
    const hit = this.entries.get(urlOf(request));
    return hit === undefined ? undefined : hit.clone();
  }

  async put(request: Request | string, response: Response): Promise<void> {
    this.entries.set(urlOf(request), response);
  }

  async delete(request: Request | string): Promise<boolean> {
    return this.entries.delete(urlOf(request));
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((url) => new Request(url));
  }
}

export function urlOf(request: Request | string): string {
  return typeof request === 'string' ? new Request(request).url : request.url;
}

/** Build a `Cache`-typed double (only the four methods the store uses). */
export function fakeCache(): { cache: Cache; fake: FakeCache } {
  const fake = new FakeCache();
  return { cache: fake as unknown as Cache, fake };
}

/**
 * A `Cache` double that implements the REAL matching algorithm (BUG-04 §2.1).
 *
 * `FakeCache` is a `Map` keyed by URL — that is, it already behaves the way we want the
 * real cache to behave, so every test of BUG-04 passes against it without anything being
 * fixed. That is exactly why the defect survived 49 tests of `transport`.
 *
 * Here an entry is a PAIR (request, response), and matching goes:
 *   1. URLs must be equal (query included).
 *   2. `ignoreVary` → match, and stop here.
 *   3. Otherwise read the `Vary` of the STORED RESPONSE and, for every header it names,
 *      compare its value in the incoming request against the stored one. `Vary: *` never
 *      matches.
 *
 * `put`'s implicit delete honours `Vary` too, which is what the Service Workers spec
 * says (`Batch Cache Operations` queries with no options). Chromium is laxer there and
 * replaces by URL; this double is the conservative one on purpose — passing against it
 * means passing in every engine.
 */
export class VaryingCache {
  readonly entries: Array<{ request: Request; response: Response }> = [];

  private matches(query: Request, entry: { request: Request; response: Response }, ignoreVary: boolean): boolean {
    if (entry.request.url !== query.url) {
      return false;
    }
    if (ignoreVary) {
      return true;
    }
    const vary = entry.response.headers.get('vary');
    if (vary === null) {
      return true;
    }
    for (const field of vary.split(',').map((s) => s.trim())) {
      if (field === '*') {
        return false;
      }
      if (query.headers.get(field) !== entry.request.headers.get(field)) {
        return false;
      }
    }
    return true;
  }

  private find(request: Request | string, options?: CacheQueryOptions): number {
    const query = asRequest(request);
    return this.entries.findIndex((entry) => this.matches(query, entry, options?.ignoreVary === true));
  }

  async match(request: Request | string, options?: CacheQueryOptions): Promise<Response | undefined> {
    const at = this.find(request, options);
    return at === -1 ? undefined : this.entries[at]!.response.clone();
  }

  async put(request: Request | string, response: Response): Promise<void> {
    const stored = asRequest(request);
    const at = this.find(stored);
    if (at !== -1) {
      this.entries.splice(at, 1);
    }
    this.entries.push({ request: stored, response });
  }

  async delete(request: Request | string, options?: CacheQueryOptions): Promise<boolean> {
    const at = this.find(request, options);
    if (at === -1) {
      return false;
    }
    this.entries.splice(at, 1);
    return true;
  }

  async keys(): Promise<Request[]> {
    return this.entries.map((entry) => entry.request);
  }
}

/** Build a `Cache`-typed double that honours `Vary`, plus a handle on its entries. */
export function varyingCache(): { cache: Cache; fake: VaryingCache } {
  const fake = new VaryingCache();
  return { cache: fake as unknown as Cache, fake };
}

/** Coerce a `RequestInfo` key to the `Request` the Cache API would build from it. */
function asRequest(request: Request | string): Request {
  return typeof request === 'string' ? new Request(request) : request;
}

/**
 * A `Cache` double that counts its `match` calls. This is the wiring audit of BUG-01
 * §6.5: a cache nobody reads from is a write-only cache, which is a bug by
 * construction — and the only way to see it is to count the reads.
 */
export function countingCache(): { cache: Cache; fake: FakeCache; matches: () => number } {
  const fake = new FakeCache();
  let matches = 0;
  const counting = {
    async match(request: Request | string): Promise<Response | undefined> {
      matches += 1;
      return fake.match(request);
    },
    put: (request: Request | string, response: Response): Promise<void> => fake.put(request, response),
    delete: (request: Request | string): Promise<boolean> => fake.delete(request),
    keys: (): Promise<Request[]> => fake.keys(),
  };
  return { cache: counting as unknown as Cache, fake, matches: (): number => matches };
}

export interface RecordedEvent {
  readonly request: Request;
  responded: Promise<Response> | null;
  readonly waits: Promise<unknown>[];
  respondWith(response: Response | PromiseLike<Response>): void;
  waitUntil(promise: Promise<unknown>): void;
}

/** A `FetchEvent` double that records whether `respondWith` was called, and with what. */
export function fetchEvent(url: string, init: RequestInit & { mode?: string } = {}): RecordedEvent {
  const request = new Request(url, init as RequestInit);
  // `Request.mode` is read-only and Node reports `cors`; navigations are what matter.
  Object.defineProperty(request, 'mode', { value: init.mode ?? 'navigate' });
  const event: RecordedEvent = {
    request,
    responded: null,
    waits: [],
    respondWith(response): void {
      event.responded = Promise.resolve(response);
    },
    waitUntil(promise): void {
      event.waits.push(promise);
    },
  };
  return event;
}
