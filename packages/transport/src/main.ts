/**
 * The main-thread hook (SDD-16 §3.2): register the render Service Worker. The
 * post-navigation hydration is SDD-14 (`hydrateRoot`/`cursorOf`); lifecycle
 * policy (scope, skipWaiting, update flow) is build/deploy, out of scope here.
 */

export async function registerRenderServiceWorker(url: string): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register(url);
}
