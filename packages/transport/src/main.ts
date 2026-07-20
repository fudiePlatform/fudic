/**
 * The main-thread hook (SDD-16 §3.2): register the render Service Worker.
 * Hydration is not this package's concern: it is driven by the global capturer
 * of SDD-17, per instance and on interaction. Lifecycle policy (scope,
 * skipWaiting, update flow) is build/deploy, out of scope here.
 */

export async function registerRenderServiceWorker(url: string): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register(url);
}
