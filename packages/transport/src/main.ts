/**
 * The main-thread hooks (SDD-16 §3.2): register the render Service Worker, and create
 * the render Web Worker joining the two with a `MessageChannel`. The main thread owns
 * that creation because a `ServiceWorkerGlobalScope` exposes neither `Worker` nor
 * `import()` — the SW can neither spawn the renderer nor load a chunk itself (verified
 * in Chrome; see https://github.com/w3c/ServiceWorker/issues/1356).
 *
 * Hydration is not this package's concern: it is driven by the global capturer of
 * SDD-17, per instance and on interaction.
 */

import { WORKER_PORT_MESSAGE, type WorkerPortMessage } from './messages.js';

export async function registerRenderServiceWorker(
  url: string,
  options: RegistrationOptions = { type: 'module' },
): Promise<ServiceWorkerRegistration> {
  // `type: 'module'` is the default because the emitted Service Worker is an ES module
  // (it imports this package's router from a sibling chunk); registered as a classic
  // script the browser rejects it at parse time.
  return navigator.serviceWorker.register(url, options);
}

/**
 * Create the render Web Worker and join it to the active Service Worker: one end of a
 * `MessageChannel` goes to each, so from then on the SW posts render requests straight
 * to the worker with no main-thread hop. Returns the worker, or `null` when no Service
 * Worker is active yet (nothing to join — the page still renders, it just falls through
 * to the network).
 */
export async function connectRenderWorker(workerUrl: string): Promise<Worker | null> {
  const registration = await navigator.serviceWorker.ready;
  const serviceWorker = navigator.serviceWorker.controller ?? registration.active;
  if (serviceWorker === null) {
    return null;
  }
  const worker = new Worker(workerUrl, { type: 'module' });
  const { port1, port2 } = new MessageChannel();
  const message: WorkerPortMessage = { type: WORKER_PORT_MESSAGE };
  worker.postMessage(message, [port2]); // WW: serve renders on this port
  serviceWorker.postMessage(message, [port1]); // SW: request renders on this port
  return worker;
}
