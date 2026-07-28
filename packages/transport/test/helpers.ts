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
