// Throwaway probe: the workbench server. One http.Server, WS on upgrade, shell + one page per criterion.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const RESULTS = process.argv[2];

const shell = `<!doctype html><html><head><meta charset="utf-8"><title>shell</title>
<style>body{font:13px system-ui;margin:8px;background:#fff;color:#111}iframe{width:45%;height:140px;border:1px solid #999}pre{background:#eee;padding:6px}</style></head>
<body><h3>Workbench shell (served by 127.0.0.1)</h3>
<iframe id="c1" src="/c/1.html"></iframe> <iframe id="c2" src="/c/2.html"></iframe>
<pre id="out">waiting…</pre>
<script type="module">
const out = document.getElementById('out');
const report = {};
const ws = new WebSocket('ws://' + location.host + '/ws');
const hello = new Promise(r => ws.addEventListener('message', e => r(e.data), { once: true }));
const opened = new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('ws error')); });
const loaded = f => new Promise(r => f.contentDocument?.readyState === 'complete' ? r() : f.addEventListener('load', r, { once: true }));
try {
  await opened; report.wsOpen = true;
  report.serverSaid = await hello;
  for (const id of ['c1', 'c2']) {
    const f = document.getElementById(id);
    await loaded(f);
    const host = f.contentDocument.querySelector('x-tabs');
    await f.contentWindow.customElements.whenDefined('x-tabs');
    const before = host.shadowRoot.querySelector('[role=tabpanel]').textContent;
    host.shadowRoot.querySelectorAll('[role=tab]')[1].click();
    const after = host.shadowRoot.querySelector('[role=tabpanel]').textContent;
    report[id] = { sameOriginShadowRead: before, afterClick: after, hydrated: host.hydrated === true };
  }
  report.userAgent = navigator.userAgent;
  report.topIsShell = window.top === window ? 'shell is top (browser)' : 'shell is framed (webview)';
} catch (e) { report.error = String(e); }
out.textContent = JSON.stringify(report, null, 2);
ws.send(JSON.stringify(report));
</script></body></html>`;

const page = n => `<!doctype html><html><head><meta charset="utf-8"><script type="module" src="/c/tabs.js"></script></head><body>
<x-tabs><template shadowrootmode="open"><style>[aria-selected=true]{font-weight:bold}</style>
<button role="tab" aria-selected="true">Tab A</button><button role="tab" aria-selected="false">Tab B</button>
<p role="tabpanel">panel A (criterion ${n})</p></template></x-tabs></body></html>`;

// "Hydration": the client module adopts the DSD shadow root and wires reactivity.
const tabsJs = `customElements.define('x-tabs', class extends HTMLElement {
  connectedCallback() {
    const root = this.shadowRoot; this.hydrated = true;
    const tabs = root.querySelectorAll('[role=tab]'), panel = root.querySelector('[role=tabpanel]');
    tabs.forEach((t, i) => t.addEventListener('click', () => {
      tabs.forEach(x => x.setAttribute('aria-selected', String(x === t)));
      panel.textContent = 'panel ' + 'AB'[i];
    }));
  }
});`;

const server = createServer((req, res) => {
  const routes = { '/': [shell, 'text/html'], '/c/1.html': [page(1), 'text/html'], '/c/2.html': [page(2), 'text/html'], '/c/tabs.js': [tabsJs, 'text/javascript'] };
  const hit = routes[req.url];
  if (!hit) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': hit[1] + '; charset=utf-8' }).end(hit[0]);
});

const frame = text => {
  const body = Buffer.from(text);
  return Buffer.concat([Buffer.from([0x81, body.length]), body]); // < 126 bytes
};

server.on('upgrade', (req, socket) => {
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.write(frame(`hello from workbench, origin=${req.headers.origin}`));
  let buf = Buffer.alloc(0);
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    if (buf.length < 2) return;
    let len = buf[1] & 0x7f, off = 2;
    if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
    if (buf.length < off + 4 + len) return;
    const mask = buf.subarray(off, off + 4);
    const data = Buffer.from(buf.subarray(off + 4, off + 4 + len).map((b, i) => b ^ mask[i % 4]));
    const report = JSON.parse(data.toString());
    report.wsOrigin = req.headers.origin ?? null;
    writeFileSync(RESULTS + '.' + (report.topIsShell?.includes('webview') ? 'webview' : 'browser') + '.json', JSON.stringify(report, null, 2));
    buf = Buffer.alloc(0);
  });
});

server.listen(0, '127.0.0.1', () => {
  process.stdout.write(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}/` }) + '\n');
});
process.stdin.on('end', () => process.exit(0));
process.stdin.resume();
