import { announceWarmed, type WarmChannel } from './channel.js';

// The same strings live in `@fudic/transport`, which core must not depend on.
/** Page → worker: download these chunks. */
export const WARM_MESSAGE = 'fudic:warm';
/** Worker → page: they are cached. */
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

/** The part of `ServiceWorkerContainer` the channel uses. */
export interface ServiceWorkerHost {
  readonly controller: { postMessage(message: unknown): void } | null;
  addEventListener(type: string, listener: (event: Event) => void): void;
}

export interface ServiceWorkerChannelConfig {
  /** Defaults to `navigator.serviceWorker`. */
  readonly container?: ServiceWorkerHost;
  /** Defaults to the global `document`. */
  readonly document?: Document;
}

/** The warm channel for a page a Service Worker controls. Chunks land in its cache. */
export function createServiceWorkerWarmChannel(
  config: ServiceWorkerChannelConfig = {},
): WarmChannel {
  const container = config.container ?? navigator.serviceWorker;
  const doc = config.document ?? document;
  // On a first load nothing controls the page until the worker claims it, and a message
  // posted then is silently lost: orders wait for `controllerchange`.
  const queued: WarmMessage[] = [];

  container.addEventListener('message', (event) => {
    const data = (event as MessageEvent<WarmedMessage | undefined>).data;
    if (data?.type !== WARMED_MESSAGE) return;
    for (const tag of data.tags) announceWarmed(doc, tag);
  });

  const flush = (): void => {
    const controller = container.controller;
    if (controller === null) return;
    for (const message of queued.splice(0)) controller.postMessage(message);
  };
  container.addEventListener('controllerchange', flush);

  return {
    warm(urls: readonly string[], tags: readonly string[]): void {
      queued.push({ type: WARM_MESSAGE, urls, tags });
      flush();
    },
  };
}
