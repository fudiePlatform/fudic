/**
 * serve.js — real streaming test for the style[host] polyfill. No frameworks.
 *
 * Serves demo-style-host-polyfill.html over chunked transfer encoding, the way a
 * server or Service Worker produces it (SDD-16 `renderToStream`):
 *
 *  - One initial delay before the first byte (TTFB): that is where real latency
 *    lives — fetching the initial data for the render. Nothing else waits.
 *  - Then the body streams at production speed: the serializer emits pieces as
 *    fast as it walks the tree, so chunks are flushed back-to-back. Boundaries
 *    are raw byte offsets (mid-tag, mid-component), exactly like TCP segments,
 *    which exercises the polyfill's `pending` path for real.
 *
 * Run:  node docs/runtime/serve.js   →  http://localhost:3000/
 * Env:  PORT (default 3000) · TTFB_MS (default 150) · CHUNK_SIZE bytes (default 1024)
 */

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'demo-style-host-polyfill.html');
const PORT = Number(process.env.PORT ?? 3000);
const TTFB_MS = Number(process.env.TTFB_MS ?? 150);
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE ?? 1024);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' || req.url !== '/') {
    res.writeHead(req.url === '/favicon.ico' ? 204 : 404).end();
    return;
  }

  const page = await readFile(PAGE);

  // TTFB: the only real wait — obtaining the initial data for the render.
  await sleep(TTFB_MS);

  // No content-length → Node switches to Transfer-Encoding: chunked.
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });

  // Serializer pace: pieces flushed back-to-back, no artificial delay.
  for (let i = 0; i < page.length; i += CHUNK_SIZE) {
    res.write(page.subarray(i, i + CHUNK_SIZE));
  }
  res.end();
});

server.listen(PORT, () => {
  console.log(`streaming demo → http://localhost:${PORT}/  (TTFB ${TTFB_MS} ms, ${CHUNK_SIZE} bytes/chunk)`);
});
