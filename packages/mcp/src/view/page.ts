/**
 * The page a chat that speaks MCP Apps draws for `fudic_render` and `fudic_look`: one HTML file,
 * with the `App` of `@modelcontextprotocol/ext-apps` inlined and a view that reads the result of
 * the tool. It asks for nothing over the network: the piece comes in the result, and the
 * screenshots as data URLs.
 */

/** What a tool puts in its result's `_meta` for the view: a rendered piece, or a look. */
export const VIEW_META_KEY = 'fudic/view';

/** The view's own code, plain JavaScript run as a module after the bundle defined `App`. */
const SCRIPT = `
const root = document.getElementById('root');
const text = (tag, value, cls) => { const el = document.createElement(tag); el.textContent = value; if (cls) el.className = cls; return el; };
const image = (src, label) => { const fig = document.createElement('figure'); if (src) { const img = document.createElement('img'); img.src = src; img.alt = label; fig.append(img); } else fig.append(text('div', 'none', 'empty')); fig.append(text('figcaption', label)); return fig; };
function piece(html) {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox', 'allow-same-origin');
  frame.title = 'piece';
  frame.srcdoc = html;
  frame.addEventListener('load', () => { const doc = frame.contentDocument; if (doc) frame.style.height = doc.documentElement.scrollHeight + 'px'; });
  return frame;
}
function look(cases) {
  const list = document.createElement('div');
  for (const c of cases) {
    const row = document.createElement('section');
    row.append(text('h2', c.case + ' — ' + c.verdict, c.verdict));
    const pair = document.createElement('div');
    pair.className = 'pair';
    pair.append(image(c.before, 'before'), image(c.after, 'after'));
    row.append(pair);
    list.append(row);
  }
  return list;
}
function show(result) {
  const view = (result && result._meta && result._meta['${VIEW_META_KEY}']) || null;
  root.replaceChildren();
  if (view && view.kind === 'render') root.append(piece(view.html));
  else if (view && view.kind === 'look') root.append(look(view.cases));
  else root.append(text('p', 'Nothing to show.', 'empty'));
}
const app = new App({ name: 'fudic view', version: '1' });
app.ontoolresult = show;
await app.connect();
`;

const STYLE = `
:root { color-scheme: light dark; font: 14px/1.4 system-ui, sans-serif; }
body { margin: 0; padding: 8px; }
iframe { width: 100%; min-height: 48px; border: 1px solid #8884; border-radius: 6px; background: #fff; }
section { margin-bottom: 12px; }
h2 { font-size: 14px; margin: 0 0 6px; }
h2.changed { color: #b45309; } h2.new { color: #1d4ed8; } h2.gone { color: #b91c1c; }
.pair { display: flex; gap: 8px; flex-wrap: wrap; }
figure { margin: 0; flex: 1 1 160px; }
img { max-width: 100%; border: 1px solid #8884; border-radius: 6px; }
figcaption, .empty { color: #888; font-size: 12px; }
`;

/** The bundle's last statement, `export{… ,eI as App}`, which an inline script cannot keep. */
const EXPORTS = /export\s*\{([^}]*)\}\s*;?\s*$/u;

/** The local name an `export{a as B, …}` list gives to `name`. */
function localOf(list: string, name: string): string | undefined {
  return list
    .split(',')
    .map((item) => item.trim().split(/\s+as\s+/u))
    .find((pair) => pair[1] === name)?.[0];
}

/**
 * The page, around the source of `app-with-deps`. The bundle is an ES module that ends exporting
 * what it defines; inline, there is no one to import it, so its export becomes a binding of `App`.
 */
export function viewPage(bundle: string): string {
  const match = EXPORTS.exec(bundle);
  const local = match === null ? undefined : localOf(match[1]!, 'App');
  if (match === null || local === undefined) throw new Error('the MCP Apps bundle does not export App');
  const code = `${bundle.slice(0, match.index)}\nconst App = ${local};\n${SCRIPT}`;
  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>fudic</title><style>${STYLE}</style></head>`,
    '<body><div id="root"></div>',
    `<script type="module">${code.replace(/<\/script/giu, '<\\/script')}</script>`,
    '</body></html>',
  ].join('\n');
}
