// Throwaway probe of the workbench: one http.Server that owns the shell + its WS, with Vite and
// the real fudic plugin mounted inside as middleware; one synthetic page per criterion; terms run
// by Playwright (headless); re-run on save.
//
// Run from the repo root after `pnpm build` (it imports the packages' dist):
//   node docs/banco-de-trabajo/prueba/bank.mjs out.json --auto     (red → simulated save → re-run)
//   node docs/banco-de-trabajo/prueba/bank.mjs out.json --fixed    (the tab strip without its bug)
// stdin must stay open (it exits and cleans up when stdin ends). It writes two files into
// examples/basic/src/components (app-bench-tabs.*) and node_modules/.fudic-bench; it deletes them
// on a clean exit, NOT when it is killed. Paths are absolute to Pedro's machine on purpose.
import { createServer as createHttp } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = 'C:/Users/Home/Documents/Cursos 2026/fudic';
const ROOT = `${REPO}/examples/basic`;
const OUT = process.argv[2] ?? join(import.meta.dirname, 'bank-results.json');
const AUTO = process.argv.includes('--auto'); // simulate the user's save and exit

const imp = (p) => import(pathToFileURL(p).href);
const { createServer: createVite } = await imp(`${ROOT}/node_modules/vite/dist/node/index.js`);
const { fudic } = await imp(`${REPO}/packages/vite/dist/index.js`);
const { parseSpec } = await imp(`${REPO}/packages/spec/dist/index.js`);
const { chromium } = await imp(`${ROOT}/node_modules/@playwright/test/index.mjs`);

const log = [];
const say = (m) => { log.push(m); console.error('[bank]', m); };

// ---- the component under save test: a tab strip with a bug ----
const TABS = `${ROOT}/src/components/app-bench-tabs.fud`;
const tabsSource = (fixed) => `@code {
  @client {
    import { signal } from "@fudic/core";

    const active = signal(0);

    function pickA() {
      active.set(0);
    }

    function pickB() {
      active.set(${fixed ? 1 : 0});
    }
  }
}

<head>
  <style>
    p { border: 1px solid #999; padding: 6px; }
  </style>
</head>

<app-bench-tabs>
  <template shadowrootmode="open">
    <button role="tab" @click=@pickA>Tab A</button>
    <button role="tab" @click=@pickB>Tab B</button>
    <p role="tabpanel">@(active() === 0 ? "panel A" : "panel B")</p>
  </template>
</app-bench-tabs>
`;
const TABS_SPEC = `${ROOT}/src/components/app-bench-tabs.fudspec`;
writeFileSync(TABS, tabsSource(process.argv.includes('--fixed')));
writeFileSync(TABS_SPEC, `component app-bench-tabs

criterion cambia-de-pestana
  when
    click role:tab/"Tab B"
  then
    text role:tabpanel "panel B"
`);

// ---- synthetic pages live inside the project, out of git, out of the watcher ----
const BENCH = `${ROOT}/node_modules/.fudic-bench`;
const ROUTES = `${BENCH}/routes`;
rmSync(BENCH, { recursive: true, force: true });
mkdirSync(ROUTES, { recursive: true });

// A Signal fixture, the case Pedro raised: signal-display wants `value: Signal<number>`.
const SIGFIX = `${BENCH}/signal-display.fixture.ts`;
writeFileSync(SIGFIX, `import { signal } from '@fudic/core';\nexport default { diez: { value: signal(10) } };\n`);

const http = createHttp();
const vite = await createVite({
  root: ROOT,
  configFile: false,
  logLevel: 'warn',
  appType: 'custom',
  plugins: [
    fudic({ routesDir: relative(ROOT, ROUTES).split('\\').join('/') }),
    // Probe-only workaround for the bug in main: @fudic/dom reads `import.meta` dynamically,
    // and Vite 8's module runner refuses it (`pnpm dev` of examples/basic gives 500 on /blog).
    { name: 'probe-dom-env', transform: (code, id) => id.replace(/\\/g, '/').includes('/packages/dom/dist/url.js') ? code.replace('const meta = import.meta;', 'const meta = { env: import.meta.env };') : undefined },
  ],
  server: { middlewareMode: true, hmr: { server: http, overlay: false } },
});

function page(slug, componentPath, tag, fixturePath, key, props) {
  const code = fixturePath
    ? `    @code {\n      import fixtures from "${fixturePath.replace(/\.ts$/, '')}";\n      const { ${props.join(', ')} } = fixtures["${key}"];\n    }\n`
    : '';
  const attrs = props.map((p) => ` .${p}=@${p}`).join('');
  writeFileSync(`${ROUTES}/${slug}.fud`, `<!DOCTYPE html>\n<html>\n  <head>\n    <link rel="component" href="${componentPath}">\n${code}    <script src="fudic:runtime"></script>
    <title>${tag} · ${slug}</title>\n  </head>\n  <body>\n    <${tag}${attrs}></${tag}>\n  </body>\n</html>\n`);
  return `/${slug}`;
}

// ---- criteria: parsed with the real @fudic/spec ----
async function loadCriteria(specPath) {
  const tag = basename(specPath, '.fudspec');
  const component = join(dirname(specPath), `${tag}.fud`).split('\\').join('/');
  const fixturePath = join(dirname(specPath), `${tag}.fixture.ts`).split('\\').join('/');
  const { value: spec, diagnostics } = parseSpec(readFileSync(specPath, 'utf8'));
  if (diagnostics.length) say(`${tag}.fudspec: ${diagnostics.length} parse diagnostics`);
  say("load fixture " + fixturePath);
  const fixtures = existsSync(fixturePath) ? (await vite.ssrLoadModule(fixturePath)).default : {};
  return spec.criteria.map((c) => {
    const steps = [];
    let key;
    for (const b of c.blocks) for (const t of b.terms) {
      const args = t.args.map((a) => a.kind === 'role' ? `role:${a.role.text}${a.name ? `/"${a.name.text}"` : ''}` : a.text);
      if (t.name.text === 'props') key = args[0];
      else steps.push({ block: b.block, term: t.name.text, args });
    }
    const props = key ? Object.keys(fixtures[key] ?? {}) : [];
    const url = page(`${tag}--${c.slug.text}`, component, tag, key ? fixturePath : undefined, key, props);
    return { tag, slug: c.slug.text, fixture: key ?? null, url, steps, component };
  });
}

// ---- the engine: Playwright behind the ctx the terms in fudic/terms expect ----
function locator(pw, ref) {
  const m = /^role:([a-z]+)(?:\/"(.*)")?$/.exec(ref);
  const loc = m ? pw.getByRole(m[1], m[2] ? { name: m[2] } : {}) : pw.locator(ref);
  return {
    box: async () => (await loc.boundingBox()) ?? { height: 0, width: 0 },
    textContent: () => loc.textContent(),
    isVisible: () => loc.isVisible(),
    click: () => loc.click(),
    setAttribute: (n, v) => loc.evaluate((el, [n, v]) => el.setAttribute(n, v), [n, v]),
  };
}

async function runCriterion(browser, origin, c) {
  const pw = await browser.newPage(); pw.setDefaultTimeout(4000);
  const errors = [];
  // The measuring page never obeys Vite's reloads: its HMR socket is answered by nobody.
  await pw.routeWebSocket((u) => !u.pathname.startsWith('/__bench'), () => {});
  pw.on('pageerror', (e) => errors.push(String(e)));
  pw.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const net = [];
  pw.on('response', (r) => { const u = r.url().replace(origin, ''); if (r.status() >= 400 || u.includes('fudic')) net.push(`${r.status()} ${u}`); });
  say("goto " + c.url); await pw.goto(origin + c.url); say("loaded");
  await pw.waitForLoadState('networkidle');
  const ctx = { locate: (r) => locator(pw, r), goto: async () => {} }; // route: just an example
  const steps = [];
  let verdict = 'pass';
  for (const s of c.steps) {
    const file = `${ROOT}/fudic/terms/${s.block}/${s.term}.js`;
    const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
    const named = Object.fromEntries(mod.meta.params.map((p, i) => [p.name, p.type === 'number' ? Number(s.args[i]) : s.args[i]]));
    try {
      const out = await mod.run(ctx, named);
      steps.push({ ...s, pass: out.pass, evidence: out.evidence });
      if (s.block === 'when') await pw.waitForLoadState('networkidle'); // an interaction may wake a lazy chunk
      if (s.block === 'then' && !out.pass) verdict = 'fail';
    } catch (e) {
      steps.push({ ...s, error: String(e).split('\n')[0] });
      verdict = 'error';
      break;
    }
  }
  const html = verdict === 'error' ? await pw.locator('body').ariaSnapshot().catch((e) => String(e)) : undefined;
  const shadow = await pw.locator(c.tag).evaluate((el) => el.shadowRoot?.innerHTML.length ?? -1).catch(() => -1);
  await pw.close();
  return { criterion: `${c.tag} · ${c.slug}`, fixture: c.fixture, verdict, steps, shadowHtmlChars: shadow, pageErrors: errors, html, net };
}

// ---- shell + its WebSocket ----
const clients = new Set();
const broadcast = (o) => { const b = Buffer.from(JSON.stringify(o)); const head = b.length < 126 ? Buffer.from([0x81, b.length]) : Buffer.from([0x81, 126, b.length >> 8, b.length & 255]); for (const s of clients) s.write(Buffer.concat([head, b])); };
let criteria = [];
let lastResults = [];

const shell = () => `<!doctype html><html><head><meta charset="utf-8"><title>Banco</title><style>
body{font:13px system-ui;margin:10px;background:#fff;color:#111}.c{border:2px solid #bbb;border-radius:6px;margin:0 0 10px;padding:6px}
.pass{border-color:#2f6f4f}.fail,.error{border-color:#b5462f}iframe{width:100%;height:150px;border:1px dashed #ccc}pre{margin:4px 0;font-size:11px;white-space:pre-wrap}
</style></head><body><h3>Workbench (probe) <small id="st"></small></h3><div id="list"></div><script type="module">
const crit = ${JSON.stringify(criteria.map((c) => ({ id: `${c.tag} · ${c.slug}`, url: c.url })))};
const list = document.getElementById('list');
for (const c of crit) list.insertAdjacentHTML('beforeend', '<div class="c" data-id="'+c.id+'"><b>'+c.id+'</b> <span class="v">…</span><iframe src="'+c.url+'"></iframe><pre></pre></div>');
const ws = new WebSocket('ws://' + location.host + '/__bench/ws');
ws.onopen = () => document.getElementById('st').textContent = '· connected';
ws.onmessage = (e) => { const m = JSON.parse(e.data); document.getElementById('st').textContent = '· ' + m.phase;
  for (const r of m.results) { const el = document.querySelector('[data-id="'+r.criterion+'"]'); if (!el) continue;
    el.className = 'c ' + r.verdict; el.querySelector('.v').textContent = r.verdict;
    el.querySelector('pre').textContent = r.steps.map(s => s.block+' '+s.term+' '+s.args.join(' ')+' → '+(s.error ?? JSON.stringify(s.evidence))).join('\\n');
    el.querySelector('iframe').src = el.querySelector('iframe').src; } };
</script></body></html>`;

http.on('request', (req, res) => {
  if (req.url === '/__bench/' || req.url === '/__bench') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(shell()); return; }
  vite.middlewares(req, res, () => { res.writeHead(404).end('not found'); });
});
http.on('upgrade', (req, socket) => {
  if (!req.url.startsWith('/__bench/ws')) return; // Vite's HMR socket answers its own
  const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  clients.add(socket);
  socket.on('close', () => clients.delete(socket));
  socket.on('error', () => clients.delete(socket));
  if (lastResults.length) broadcast({ phase: 'resultados', results: lastResults });
});
say("vite ready"); await new Promise((r) => http.listen(0, "127.0.0.1", r)); say("listening");
const origin = `http://127.0.0.1:${http.address().port}`;
say(`origin ${origin}`);

const browser = await chromium.launch({ headless: true, channel: "chrome" }); say("browser up");
const report = { origin, phases: [] };

async function runAll(phase, filter = () => true) {
  const t0 = Date.now();
  const results = [];
  for (const c of criteria.filter(filter)) results.push(await runCriterion(browser, origin, c));
  lastResults = [...lastResults.filter((r) => !results.some((x) => x.criterion === r.criterion)), ...results];
  report.phases.push({ phase, ms: Date.now() - t0, results });
  writeFileSync(OUT, JSON.stringify({ ...report, log }, null, 2));
  broadcast({ phase, results: lastResults });
  say(`${phase}: ${results.map((r) => `${r.criterion}=${r.verdict}`).join(', ')}`);
}

criteria = [
  ...(await loadCriteria(`${ROOT}/src/components/app-card.fudspec`)),
  ...(await loadCriteria(TABS_SPEC)),
];
// The Signal-prop case: one page, checked by hand below.
// A Signal prop: a page cannot own a signal it hands down (FUD0200), so the bank generates a
// host component that owns it, seeded with the fixture's value.
mkdirSync(`${BENCH}/components`, { recursive: true });
writeFileSync(`${BENCH}/components/app-bench-host.fud`, `<link rel="component" href="${ROOT}/src/components/signal-display.fud">

@code {
  @client {
    import { signal } from "@fudic/core";

    // The bank ran the fixture (option A) and writes the initial value down literally.
    const value = signal(${JSON.stringify((await vite.ssrLoadModule(SIGFIX)).default.diez.value())});

    function mas() {
      value.set(value() + 1);
    }
  }
}

<app-bench-host>
  <template shadowrootmode="open">
    <button @click=@mas>+1</button>
    <signal-display .value=@value></signal-display>
  </template>
</app-bench-host>
`);
writeFileSync(`${ROUTES}/signal-display--diez.fud`, `<!DOCTYPE html>
<html>
  <head>
    <link rel="component" href="${BENCH}/components/app-bench-host.fud">
    <script src="fudic:runtime"></script>
    <title>signal-display · diez</title>
  </head>
  <body>
    <app-bench-host></app-bench-host>
  </body>
</html>
`);
const sigUrl = '/signal-display--diez';

say("criteria " + criteria.length); await runAll("1 · first run");

{ // Signal prop from a fixture: painted on the server, alive after hydration?
  const pw = await browser.newPage(); pw.setDefaultTimeout(4000);
  const errors = [];
  pw.on('pageerror', (e) => errors.push(String(e)));
  pw.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await pw.goto(origin + sigUrl);
  await pw.waitForLoadState('networkidle');
  const before = await pw.locator('signal-display .out').textContent().catch((e) => `ERR ${e}`);
  await pw.getByRole('button', { name: '+1' }).click().catch(() => {});
  await pw.waitForTimeout(300);
  const after = await pw.locator('signal-display .out').textContent().catch((e) => `ERR ${e}`);
  const text = { before: before.replace(/\s+/g, ' ').trim(), afterClick: after.replace(/\s+/g, ' ').trim() };
  report.signalFixture = { text, errors };
  await pw.close();
  writeFileSync(OUT, JSON.stringify({ ...report, log }, null, 2));
  say(`signal fixture: ${text}`);
}

// ---- re-run on save: Vite's own watcher, in this same process ----
// The file watcher says WHAT changed; Vite's own "reload the pages" says WHEN it is ready
// (after the recompile and the live typecheck). Re-running on the first is a race.
let saveAt = 0;
const pending = new Set();
let fallback;
async function rerun(why) {
  clearTimeout(fallback);
  if (!pending.size) return;
  const tags = [...pending];
  pending.clear();
  say(`${why} → re-running ${tags.join(', ')} (${Date.now() - saveAt} ms after save)`);
  await runAll(`2 · after save (${why})`, (c) => tags.includes(c.tag));
  if (AUTO) await shutdown();
}
vite.watcher.on('change', (file) => {
  const f = file.split('\\').join('/');
  if (!/\.(fud|fudspec|fixture\.ts)$/.test(f) && !f.includes('/fudic/terms/')) return;
  pending.add(basename(f).replace(/\.(fud|fudspec|fixture\.ts)$/, ''));
  clearTimeout(fallback);
  fallback = setTimeout(() => rerun('no reload from vite in 15 s'), 15000);
});
const hot = vite.environments?.client?.hot ?? vite.hot ?? vite.ws;
const send = hot.send.bind(hot);
hot.send = (...a) => {
  const type = typeof a[0] === 'string' ? a[0] : a[0]?.type;
  if (type === 'full-reload' && pending.size) setTimeout(() => rerun('vite full-reload'), 50);
  return send(...a);
};

process.stdout.write(JSON.stringify({ url: `${origin}/__bench/`, componentUrl: origin + criteria[0].url }) + '\n');

async function shutdown() {
  await browser.close();
  await vite.close();
  http.close();
  rmSync(TABS, { force: true });
  rmSync(TABS_SPEC, { force: true });
  rmSync(BENCH, { recursive: true, force: true });
  process.exit(0);
}
process.stdin.on('end', shutdown);
process.on('SIGINT', shutdown);
process.stdin.resume();

if (AUTO) {
  setTimeout(() => { saveAt = Date.now(); say('the user fixes app-bench-tabs.fud and saves'); writeFileSync(TABS, tabsSource(true)); }, 1500);
  setTimeout(() => { say('TIMEOUT waiting for re-run'); shutdown(); }, 60000);
}
