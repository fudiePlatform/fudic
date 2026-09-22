/**
 * The main-thread hooks (SDD-20 §3.6). Two jobs, and only two: register the render
 * Service Worker, and tell it where the user is. It creates no workers, no channels,
 * and does not hand over the manifest — the SW reads that from its own cache.
 *
 * Hydration is not this package's concern: it is driven by the global capturer of
 * SDD-17, per instance and on interaction.
 */

import {
  LOCATION_MESSAGE,
  RUNTIME_MESSAGE,
  type LocationMessage,
  type RuntimeMessage,
} from './messages.js';

export async function registerRenderServiceWorker(
  url: string,
  options: RegistrationOptions = { type: 'module', updateViaCache: 'none' },
): Promise<ServiceWorkerRegistration> {
  // `type: 'module'` because the emitted Service Worker is an ES module; registered as
  // a classic script the browser rejects it at parse time. `updateViaCache: 'none'`
  // because the SW script governs updates: it must never come from the HTTP cache.
  return navigator.serviceWorker.register(url, options);
}

/**
 * The SINGLE warm trigger (SDD-20 §4.6.2). The document says "the user is here" and
 * the SW warms THAT template — chunk plus deps — behind the navigation that is already
 * being served. Two triggers is how the prototype ended up downloading everything
 * twice, so `activate` deliberately warms nothing.
 */
export async function notifyLocation(url: string = location.href): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const serviceWorker = navigator.serviceWorker.controller ?? registration.active;
  if (serviceWorker === null) {
    return; // nothing to tell yet; the next navigation will be controlled
  }
  const message: LocationMessage = { type: LOCATION_MESSAGE, url };
  serviceWorker.postMessage(message);
}

/**
 * Tell the worker which pieces of the published runtime this page used (SDD-45 §4.5.1).
 *
 * **It is about the FIRST load and only about it.** A worker installs during that load and
 * claims at the end of it, so every file the page fetched went past it: without this notice
 * the runtime is cached on the second visit, and the second visit is therefore the first one
 * that works offline. What the page reports it has already downloaded, so what the worker
 * does with it costs a read of the browser's own HTTP cache.
 *
 * Read off the Performance timeline rather than from a list the build wrote, because what a
 * page used is a fact of that page — its own pieces, the ones a hydrated component dragged
 * in, the ones §4.4.1 defers — and nothing here has to be kept in step with a manifest.
 *
 * `prefix` is passed in: where the runtime lives on the origin is a convention this package
 * does not own, and the generated boot script does.
 */
export async function notifyRuntimeUsed(prefix: string): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const serviceWorker = navigator.serviceWorker.controller ?? registration.active;
  if (serviceWorker === null) {
    return; // nothing to tell yet; the next navigation will be controlled
  }
  const root = new URL(prefix, location.href).href;
  const urls = performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(root));
  if (urls.length === 0) {
    return; // a page with nothing to hydrate used no piece, and says nothing
  }
  const message: RuntimeMessage = { type: RUNTIME_MESSAGE, urls };
  serviceWorker.postMessage(message);
}
