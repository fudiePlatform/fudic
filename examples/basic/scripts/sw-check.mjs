/**
 * SDD-20 §6.24–§6.27 in a real browser, over raw CDP (no Playwright dependency).
 *
 * Verifies the thing that killed the Web Worker model: route→route navigations served
 * by the Service Worker itself, with the document arriving complete, the declarative
 * shadow roots materialized, the style polyfill running under a strict CSP, and exactly
 * one network request per document (`respondWith` + a rescue `fetch` would make two).
 *
 * Usage: `pnpm build && pnpm preview` in one shell, then
 *        `node scripts/sw-check.mjs http://localhost:4173`
 * Set CHROME to point at another Chromium binary.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME =
  process.env['CHROME'] ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : 'google-chrome');
const ORIGIN = process.argv[2] ?? 'http://localhost:4173';
const profile = mkdtempSync(join(tmpdir(), 'fudic-chrome-'));

const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=9333',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  'about:blank',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = [];
const log = (ok, msg) => {
  if (!ok) fail.push(msg);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
};

async function main() {
  await sleep(1500);
  const list = await (await fetch('http://localhost:9333/json/list')).json();
  const page = list.find((t) => t.type === 'page');
  const { WebSocket } = await import('node:worker_threads').then(() => ({ WebSocket: globalThis.WebSocket }));
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  await new Promise((r) => socket.addEventListener('open', r));
  socket.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id !== undefined) pending.get(msg.id)?.(msg);
    else events.push(msg);
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const n = ++id;
      pending.set(n, resolve);
      socket.send(JSON.stringify({ id: n, method, params }));
    });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Log.enable');

  const goto = async (url) => {
    await send('Page.navigate', { url });
    await sleep(1200);
  };
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return r.result?.result?.value;
  };

  // 1. First visit: prerendered home registers the Service Worker.
  await goto(`${ORIGIN}/`);
  await evalJs('navigator.serviceWorker.ready.then(() => true)');
  await sleep(1500);
  log(await evalJs('!!navigator.serviceWorker.controller'), 'the Service Worker controls the page');

  // 2. Home → /blog: a route with `@server load`, rendered by the SW itself.
  events.length = 0;
  await goto(`${ORIGIN}/blog`);
  await sleep(500);
  // One document request for this navigation: `respondWith` + a rescue `fetch` would
  // make two rows in the Network panel for the same URL (the prototype's real bug).
  const blogDocs = events.filter(
    (e) => e.method === 'Network.requestWillBeSent' && e.params.type === 'Document',
  );
  log(blogDocs.length === 1, `exactly one document request for /blog (saw ${blogDocs.length})`);
  const blogOk = await evalJs("document.body.innerText.includes('Blog')");
  const shadow = await evalJs("!!document.querySelector('app-card') && !!document.querySelector('app-card').shadowRoot");
  log(blogOk, '/blog arrives complete (home → route)');
  log(shadow, '/blog materializes declarative shadow roots');

  // 3. Second visit to the same template: now warm, so the SW renders it itself.
  events.length = 0;
  await goto(`${ORIGIN}/blog`);
  const docResponse = events.find(
    (e) => e.method === 'Network.responseReceived' && e.params.type === 'Document',
  );
  log(
    docResponse?.params.response.fromServiceWorker === true,
    'once warm, the document is produced BY the Service Worker, not the network',
  );
  log(await evalJs("document.body.innerText.includes('Blog')"), 'the SW-rendered page is complete');

  // 4. Route → route, the chain that hangs with a Web Worker.
  await goto(`${ORIGIN}/blog/routing-por-fichero`);
  const postOk = await evalJs("document.body.innerText.includes('Routing por sistema de ficheros')");
  const postShadow = await evalJs("!!document.querySelector('app-badge')?.shadowRoot");
  log(postOk, 'route → route completes (the chain that kills the Web Worker)');
  log(postShadow, 'the post materializes its shadow roots');

  events.length = 0;
  await goto(`${ORIGIN}/blog`);
  const backOk = await evalJs("document.body.innerText.includes('Blog')");
  log(backOk, 'route → route back completes');
  const backResponse = events.find(
    (e) => e.method === 'Network.responseReceived' && e.params.type === 'Document',
  );
  log(
    backResponse?.params.response.fromServiceWorker === true,
    'and it is the Service Worker serving it, navigation after navigation',
  );

  // 5. The prerendered post, now warm: served from the SW's page cache, not the network.
  events.length = 0;
  await goto(`${ORIGIN}/blog/routing-por-fichero`);
  const postResponse = events.find(
    (e) => e.method === 'Network.responseReceived' && e.params.type === 'Document',
  );
  log(
    postResponse?.params.response.fromServiceWorker === true,
    'a warm prerendered page is served from the SW cache',
  );
  log(
    await evalJs("document.body.innerText.includes('Routing por sistema de ficheros')"),
    'and it still carries its content',
  );

  // 4. CSP: no violations, and the polyfill ran (styles adopted).
  const adopted = await evalJs(
    "[...document.querySelectorAll('*')].some(el => (el.shadowRoot?.adoptedStyleSheets?.length ?? 0) > 0)",
  );
  log(adopted, 'the style-adoption polyfill ran under the CSP nonce');
  const violations = events.filter(
    (e) => e.method === 'Log.entryAdded' && /Content Security Policy/i.test(e.params.entry.text ?? ''),
  );
  log(violations.length === 0, `no CSP violations (saw ${violations.length})`);
  if (violations.length) console.log(violations.map((v) => v.params.entry.text).join('\n'));

  socket.close();
  chrome.kill();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome still holds its crashpad file on Windows; the temp dir is disposable.
  }
  console.log(fail.length === 0 ? '\nALL PASS' : `\n${fail.length} FAILED`);
  process.exit(fail.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  chrome.kill();
  process.exit(2);
});
