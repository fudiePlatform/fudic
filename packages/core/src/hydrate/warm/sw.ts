/**
 * The warm channel of a page served by the render Service Worker (SDD-17 §4.7, §4.7.1): an
 * order by `postMessage`, and the deposit lands in Cache Storage, where it survives the
 * navigation.
 *
 * **A controller can be missing on a page that has a worker.** `controller` is `null` on
 * every FIRST load until `clients.claim()` runs, and posting to it then is not a loud
 * failure: it does nothing, and the warm is lost in silence. So an order placed before there
 * is anyone to hear it is QUEUED and flushed on `controllerchange` — the moment the worker
 * takes over is precisely when it can serve.
 *
 * The wire is two string constants and they are declared here, not imported: `@fudic/core`
 * does not depend on `@fudic/transport` (§4.7.1), and the page's runtime cannot pull the
 * Service Worker's package along with it. Their twins live in `@fudic/transport`
 * (`messages.ts`), and what keeps the two copies honest is the end-to-end suite of §6: a
 * drift shows up as a warm that never lands.
 */

import { announceWarmed, type WarmChannel } from './channel.js';

/** main → SW: deposit these chunks. Mirrors `WARM_MESSAGE` in `@fudic/transport`. */
export const WARM_MESSAGE = 'fudic:warm';
/** SW → main: they are in the cache. Mirrors `WARMED_MESSAGE` in `@fudic/transport`. */
export const WARMED_MESSAGE = 'fudic:warmed';

export interface WarmMessage {
  readonly type: typeof WARM_MESSAGE;
  readonly urls: readonly string[];
  readonly tags: readonly string[];
}

export interface WarmedMessage {
  readonly type: typeof WARMED_MESSAGE;
  readonly urls: readonly string[];
  readonly tags: readonly string[];
}

/**
 * The slice of `ServiceWorkerContainer` this channel uses. A port for the same reason the
 * element registry is one: the channel is then verifiable without a worker, and a worker is
 * exactly what a unit test cannot have.
 */
export interface ServiceWorkerHost {
  readonly controller: { postMessage(message: unknown): void } | null;
  addEventListener(type: string, listener: (event: Event) => void): void;
}

export interface ServiceWorkerChannelConfig {
  readonly container?: ServiceWorkerHost;
  /** The document that receives `fud:warmed` when the worker confirms. */
  readonly document?: Document;
}

export function createServiceWorkerWarmChannel(
  config: ServiceWorkerChannelConfig = {},
): WarmChannel {
  const container = config.container ?? navigator.serviceWorker;
  const doc = config.document ?? document;
  /** Orders placed while nobody was controlling the page. */
  const queued: WarmMessage[] = [];

  container.addEventListener('message', (event) => {
    const data = (event as MessageEvent<WarmedMessage | undefined>).data;
    if (data?.type !== WARMED_MESSAGE) {
      return; // the container carries other traffic; this channel owns one message
    }
    for (const tag of data.tags) {
      announceWarmed(doc, tag);
    }
  });

  const flush = (): void => {
    const controller = container.controller;
    if (controller === null) {
      return; // nobody to tell yet; `controllerchange` will come back here
    }
    for (const message of queued.splice(0)) {
      controller.postMessage(message);
    }
  };
  container.addEventListener('controllerchange', flush);

  return {
    warm(urls: readonly string[], tags: readonly string[]): void {
      queued.push({ type: WARM_MESSAGE, urls, tags });
      flush();
    },
  };
}
