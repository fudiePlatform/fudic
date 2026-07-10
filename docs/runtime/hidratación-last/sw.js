// sw.js — cachea los chunks del viewport (mensaje del hilo en idle) y los sirve
// cache-first. Es la capa que mata la red.

const CACHE = 'fudic-chunks-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Warm: el hilo principal manda la lista de chunks del viewport en idle.
self.addEventListener('message', (e) => {
  if (e.data?.type === 'warm') {
    e.waitUntil((async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(e.data.urls.map(async (url) => {
        // IDEMPOTENTE: si ya está cacheado, no re-descarga (evita warms repetidos).
        const hit = await cache.match(url);
        if (hit) return;
        try {
          // PRIORIDAD BAJA: es trabajo de fondo en idle, no debe competir con nada.
          const res = await fetch(url, { cache: 'no-store', priority: 'low' });
          if (res.ok) await cache.put(url, res.clone());
        } catch (_) { /* un chunk que falle no tumba el warm */ }
      }));
      const clients = await self.clients.matchAll();
      for (const c of clients) c.postMessage({ type: 'warmed', urls: e.data.urls, tags: e.data.tags });
    })());
  }
});

// Sirve los chunks: cache-first. Si está cacheado (warm ya pasó), cero red.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (!url.pathname.includes('/components/')) return;   // solo chunks
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;                           // de cache, sin tocar red
    const net = await fetch(e.request);
    const cache = await caches.open(CACHE);
    cache.put(e.request, net.clone());
    return net;
  })());
});
