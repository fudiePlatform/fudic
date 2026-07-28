/**
 * The main-thread hooks (SDD-20 §3.6). Two jobs, and only two: register the render
 * Service Worker, and tell it where the user is. It creates no workers, no channels,
 * and does not hand over the manifest — the SW reads that from its own cache.
 *
 * Hydration is not this package's concern: it is driven by the global capturer of
 * SDD-17, per instance and on interaction.
 */

import { LOCATION_MESSAGE, type LocationMessage } from './messages.js';

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
