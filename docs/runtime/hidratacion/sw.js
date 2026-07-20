// sw.js — Service Worker. Dos trabajos, sobre el mismo recurso (los chunks de
// componente) y en fases DISJUNTAS:
//
//   1. WARM (mensaje 'warm' del hilo principal, en idle): descarga el chunk con
//      prioridad baja y lo DEPOSITA en Cache Storage. No lo evalúa nadie.
//   2. FETCH: sirve el chunk. Cache-first — si el warm ya pasó, cero red. Si no,
//      network-first la primera vez (y cachea), cache-first en adelante.
//
// Si la interacción llega ANTES de que el warm termine, el `import()` paga red
// normalmente: el warm es una optimización, no un requisito de correctitud.

const CACHE = 'fudic-chunks-v1';

// Qué consideramos "chunk de componente". En este prototipo los chunks viven bajo
// ./components/; con el emit real serían URLs hasheadas (p. ej. /c/app-counter.a91f3c.js)
// y este predicado se ajustaría al prefijo que emita el compilador.
const isChunk = (url) => /\/components\/[a-z0-9-]+\.js$/.test(new URL(url).pathname);

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// --- 1. WARM ---------------------------------------------------------------
self.addEventListener('message', (e) => {
  if (e.data?.type !== 'warm') return;
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(e.data.urls.map(async (url) => {
      // IDEMPOTENCIA DE SERVIDOR (la de cliente es `warmedTags` en runtime.js).
      // Sin las dos capas, un warm repetido —recarga, clients.claim(), re-registro—
      // re-descargaría o re-escribiría la cache en cada arranque. Con ellas, la
      // cache converge a un chunk por tag visitado y se estabiliza.
      if (await cache.match(url)) return;
      try {
        // PRIORIDAD BAJA: trabajo de fondo; no compite con el critical path de
        // carga ni con interacciones en curso.
        const res = await fetch(url, { cache: 'no-store', priority: 'low' });
        if (res.ok) await cache.put(url, res.clone());
      } catch { /* un chunk que falle no tumba el warm */ }
    }));
    for (const c of await self.clients.matchAll()) {
      c.postMessage({ type: 'warmed', urls: e.data.urls, tags: e.data.tags });
    }
  })());
});

// --- 2. FETCH --------------------------------------------------------------
self.addEventListener('fetch', (e) => {
  if (!isChunk(e.request.url)) return;           // solo intervenimos en los chunks
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request);
    if (cached) return withHeader(cached, 'cache');   // servido sin tocar la red
    const res = await fetch(e.request);
    cache.put(e.request, res.clone());
    return withHeader(res, 'network');
  })());
});

// Añade `x-fud-source` para que el origen del chunk sea observable en DevTools.
// Los headers de una Response ya construida no se pueden mutar: se reconstruye.
async function withHeader(res, value) {
  const body = await res.clone().arrayBuffer();
  const headers = new Headers(res.headers);
  headers.set('x-fud-source', value);
  headers.set('content-type', 'text/javascript');
  return new Response(body, { status: res.status, headers });
}
