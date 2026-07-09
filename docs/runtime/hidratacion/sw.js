// sw.js — Service Worker real. Su único trabajo aquí: interceptar las peticiones
// de los chunks de componentes y aplicar:
//   - 1ª vez que se pide un chunk  → network-first: va a red, responde y CACHEA.
//   - 2ª vez en adelante           → cache-first: responde desde CacheStorage.
//
// Así "descarga la primera vez, caché las siguientes" es observable de verdad
// en la pestaña Network (from ServiceWorker / from disk cache) y en Application.

const CACHE = 'fudic-chunks-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Solo intervenimos en los chunks de componentes.
  if (!/\/components\/[a-z-]+\.js$/.test(url.pathname)) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);
    if (cached) {
      // cache-first: servido sin tocar la red.
      return withHeader(cached, 'x-fud-source', 'cache');
    }
    // network-first: primera vez. Descarga y guarda.
    const resp = await fetch(e.request);
    // clonar antes de consumir para poder cachear y responder.
    cache.put(e.request, resp.clone());
    return withHeader(resp, 'x-fud-source', 'network');
  })());
});

// Devuelve una nueva Response con una cabecera extra (para que el cliente
// pueda mostrar de dónde vino). No se puede mutar headers de una Response
// ya construida, así que la reconstruimos.
async function withHeader(resp, key, value) {
  const body = await resp.clone().arrayBuffer();
  const headers = new Headers(resp.headers);
  headers.set(key, value);
  headers.set('content-type', 'text/javascript');
  return new Response(body, { status: resp.status, headers });
}
