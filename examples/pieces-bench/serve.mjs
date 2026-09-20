/**
 * The SDD-45 measurement bench: every scenario a real page would hit, with a button that
 * DOWNLOADS its pieces for real so the Network tab shows requests instead of us deducing
 * them from imports.
 *
 * Two runs per scenario — with `modulepreload` and without — because that is the decision
 * on the table: bundle by category and accept duplication, or keep the pieces apart and
 * flatten the discovery chain with preloads. Without the comparison it is an opinion.
 *
 * Every run gets a fresh URL prefix (`/_fudic/0.0.1@r3/...`), and the server rewrites the
 * imports inside each file to match. Without that the browser's module registry answers the
 * second run from memory and every measurement after the first is a lie.
 *
 * Scratchpad only. Nothing in the repo knows about this file.
 */
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2] ?? process.cwd();
const PKGS = ['core', 'dom', 'di', 'forms', 'transport', 'ssr'];
const PORT = 4545;

/** url (canonical, no run prefix) -> { file, size } */
const pieces = new Map();
for (const pkg of PKGS) {
  const dir = join(ROOT, 'packages', pkg, 'runtime');
  if (!existsSync(dir)) continue;
  const version = JSON.parse(readFileSync(join(ROOT, 'packages', pkg, 'package.json'), 'utf8')).version;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const body = readFileSync(join(dir, file), 'utf8');
    pieces.set(`/_fudic/${version}/${pkg}/${file}`, { body, size: Buffer.byteLength(body), pkg, name: file.slice(0, -3) });
  }
}

const importsOf = (body) =>
  [...body.matchAll(/from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]);

/** Transitive closure of a set of entries, plus the depth at which each URL is discovered. */
const closure = (entries) => {
  const depth = new Map(entries.map((u) => [u, 1]));
  const queue = [...entries];
  while (queue.length > 0) {
    const url = queue.shift();
    const piece = pieces.get(url);
    if (piece === undefined) continue;
    for (const dep of importsOf(piece.body)) {
      if (depth.has(dep)) continue;
      depth.set(dep, (depth.get(url) ?? 1) + 1);
      queue.push(dep);
    }
  }
  return depth;
};

const V = (pkg) => {
  for (const url of pieces.keys()) if (url.includes(`/${pkg}/`)) return url.split('/')[2];
  return '0.0.1';
};
const P = (pkg, name) => `/_fudic/${V(pkg)}/${pkg}/${name}.js`;

/**
 * The scenarios, each one an answer to "what does THIS actually cost".
 *
 * The entries are what the coordinator (or a component's own chunk) would import; everything
 * else in the closure is what the browser has to discover on its own — which is exactly what
 * the preload run removes.
 */
const SCENARIOS = [
  {
    id: 'arranque',
    title: 'Arranque de una página que hidrata',
    when: 'Al cargar cualquier ruta con algo que hidratar. Es lo único que va en la cabecera.',
    entries: [P('core', 'hydrate'), P('transport', 'urls'), P('core', 'warm-sw')],
  },
  {
    id: 'click',
    title: 'Componente con solo un @click',
    when: 'Lo que antes llamábamos N2. Hidrata, pero no tiene reactividad.',
    entries: [P('core', 'element'), P('dom', 'browser')],
  },
  {
    id: 'signals',
    title: 'Componente con signals (N3)',
    when: 'Un contador, un reloj: declara signals y reacciona.',
    entries: [P('core', 'element'), P('core', 'signal'), P('core', 'subscribe'), P('core', 'effect')],
  },
  {
    id: 'derivada',
    title: 'N3 con signal derivada',
    when: 'Añade computed a lo anterior. Quince de diecisiete rutas del ejemplo no lo piden.',
    entries: [P('core', 'element'), P('core', 'signal'), P('core', 'subscribe'), P('core', 'effect'), P('core', 'computed')],
  },
  {
    id: 'bus',
    title: 'Emisor de EventBus',
    when: 'El que emite. Quien recibe no descarga nada: el receptor ya está dentro de la hidratación.',
    entries: [P('core', 'element'), P('dom', 'browser'), P('dom', 'emit'), P('core', 'live')],
  },
  {
    id: 'formulario',
    title: 'Formulario con validación',
    when: 'Enlace de formulario y de texto, mensajes y un validador. El módulo del formulario es de la app y no está aquí.',
    entries: [P('forms', 'bind-form'), P('forms', 'bind-text'), P('forms', 'min-length'), P('core', 'effect'), P('core', 'element')],
  },
  {
    id: 'inyeccion',
    title: 'Ruta con inyección de dependencias',
    when: 'Solo las rutas que publican su mapa de inyección.',
    entries: [P('di', 'page'), P('di', 'resolve'), P('di', 'token')],
  },
  {
    id: 'todo',
    title: 'Todo a la vez',
    when: 'El peor caso imaginable: una ruta que usa absolutamente todo.',
    entries: [...pieces.keys()].filter((u) => !u.includes('/ssr/')),
  },
];

const model = SCENARIOS.map((s) => {
  const depth = closure(s.entries);
  const urls = [...depth.keys()].filter((u) => pieces.has(u));
  const bytes = urls.reduce((a, u) => a + pieces.get(u).size, 0);
  const levels = Math.max(...urls.map((u) => depth.get(u)));
  return {
    ...s,
    urls: urls.sort((a, b) => depth.get(a) - depth.get(b) || a.localeCompare(b)),
    depth: Object.fromEntries(urls.map((u) => [u, depth.get(u)])),
    bytes,
    levels,
  };
});

const page = () => `<!doctype html><meta charset="utf-8"><title>SDD-45 · banco de medida</title>
<style>
 :root{color-scheme:light dark}
 body{font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;margin:1.5rem;max-width:74rem}
 h1{font-size:1.15rem;margin:0 0 .2rem}
 .lead{opacity:.75;margin:0 0 1.4rem}
 .s{border:1px solid #8884;border-radius:.5rem;padding:.8rem 1rem;margin:0 0 .9rem}
 .s h2{font-size:1rem;margin:0 0 .15rem}
 .when{opacity:.7;margin:0 0 .6rem}
 .facts{display:flex;gap:1.4rem;flex-wrap:wrap;margin:0 0 .6rem}
 .facts b{font-weight:700}
 .warn{color:#c60}
 button{font:inherit;padding:.35rem .8rem;border-radius:.35rem;border:1px solid #8886;background:#8881;cursor:pointer}
 button:hover{background:#8883}
 .list{opacity:.8;margin:.5rem 0 0;font-size:13px}
 .list span{display:inline-block;margin:0 .6rem .2rem 0}
 .d1{opacity:1} .d2{color:#c60} .d3{color:#c00;font-weight:700}
 .out{margin:.7rem 0 0;padding:.5rem .7rem;background:#8881;border-radius:.35rem;white-space:pre-wrap;font-size:13px;display:none}
 .bar{display:inline-block;height:.7rem;background:#39c;border-radius:2px;vertical-align:middle}
 table{border-collapse:collapse;width:100%;margin-top:.4rem}
 td{padding:.1rem .5rem;border-bottom:1px solid #8882;font-size:12.5px}
 .r{text-align:right}
</style>
<h1>SDD-45 · qué descarga cada escenario, de verdad</h1>
<p class="lead">Cada botón importa las piezas reales. Pulsa con la pestaña de red abierta, y estrangula a «Slow 3G» para que la cascada se vea.
Cada pulsación usa un prefijo nuevo, así que siempre se descarga de cero.</p>

${model
  .map(
    (s) => `<div class="s" id="s-${s.id}">
  <h2>${s.title}</h2>
  <p class="when">${s.when}</p>
  <div class="facts">
    <span><b>${s.urls.length}</b> peticiones</span>
    <span><b>${s.bytes.toLocaleString('es')}</b> bytes</span>
    <span class="${s.levels > 1 ? 'warn' : ''}"><b>${s.levels}</b> ${s.levels === 1 ? 'nivel' : 'niveles de descubrimiento'}</span>
    <button onclick="run('${s.id}', false)">descargar tal cual</button>
    <button onclick="run('${s.id}', true)">descargar con preload</button>
  </div>
  <div class="list">${s.urls
    .map((u) => `<span class="d${Math.min(s.depth[u], 3)}">${u.replace(/^\/_fudic\/[^/]+\//, '')}</span>`)
    .join('')}</div>
  <div class="out"></div>
</div>`,
  )
  .join('\n')}

<script>
const MODEL = ${JSON.stringify(Object.fromEntries(model.map((s) => [s.id, { entries: s.entries, urls: s.urls }])))};
let run_n = 0;

async function run(id, preload) {
  const s = MODEL[id];
  const box = document.querySelector('#s-' + id + ' .out');
  box.style.display = 'block';
  box.textContent = 'descargando…';
  const tag = '@r' + (++run_n);
  const bust = (u) => u.replace(/^\\/_fudic\\/([^/]+)\\//, '/_fudic/$1' + tag + '/');
  const t0 = performance.now();

  if (preload) {
    // Todas las piezas nombradas de golpe, como haría la cabecera de la página.
    for (const u of s.urls) {
      const link = document.createElement('link');
      link.rel = 'modulepreload';
      link.href = bust(u);
      document.head.appendChild(link);
    }
  }
  // Solo las entradas: lo demás lo tiene que descubrir el navegador leyendo el código.
  await Promise.all(s.entries.map((u) => import(bust(u)).catch((e) => console.warn(u, e))));
  const total = performance.now() - t0;

  const res = performance.getEntriesByType('resource').filter((r) => r.name.includes(tag + '/'));
  const start = Math.min(...res.map((r) => r.startTime));
  const scale = 620 / Math.max(total, 1);
  const rows = res
    .sort((a, b) => a.startTime - b.startTime)
    .map((r) => {
      const off = (r.startTime - start) * scale;
      const w = Math.max((r.responseEnd - r.startTime) * scale, 2);
      const name = r.name.split('/_fudic/')[1].split('/').slice(1).join('/');
      return '<tr><td>' + name + '</td><td class="r">' + Math.round(r.startTime - start) + ' ms</td>' +
        '<td style="width:100%"><span class="bar" style="margin-left:' + off + 'px;width:' + w + 'px"></span></td></tr>';
    })
    .join('');
  box.innerHTML = '<b>' + res.length + ' peticiones</b> · ' + Math.round(total) + ' ms en total · ' +
    (preload ? 'con preload' : 'tal cual') + '<table>' + rows + '</table>';
}
</script>`;

createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(page());
    return;
  }
  // `/_fudic/<version>@rN/...` is the same piece served fresh, with its imports rewritten to
  // carry the same tag so the whole graph of a run is new to the module registry.
  const run = url.match(/^\/_fudic\/([^/@]+)(@r\d+)?\//);
  const tag = run?.[2] ?? '';
  const canonical = tag === '' ? url : url.replace(tag, '');
  const piece = pieces.get(canonical);
  if (piece === undefined) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`404 ${url}`);
    return;
  }
  const body = tag === '' ? piece.body : piece.body.replaceAll(/\/_fudic\/([^/"']+)\//g, `/_fudic/$1${tag}/`);
  res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}).listen(PORT, () => console.log(`http://localhost:${PORT}/`));
