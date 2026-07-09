// runtime.js — capturador global. Camino 2 ampliado con cascada de composición.
//
// Al hidratar un padre por interacción, ANTES de montarlo el runtime recorre su
// subárbol de composición (fud-tree) en POST-ORDEN: hidrata el descendiente más
// profundo primero y el padre (donde se hizo click) el último. Solo entonces
// hace replay del click. El paso de estado/props padre->hijo ya lo resuelve el
// código emitido de cada componente; el runtime solo garantiza el orden.

const stateEl = document.getElementById('fud-state');
window.__fudState = stateEl ? JSON.parse(stateEl.textContent) : {};

const treeEl = document.getElementById('fud-tree');
const tree = treeEl ? JSON.parse(treeEl.textContent) : {};   // tag -> [tags hijos hidratables]

const hydrated = new Set();     // data-id ya hidratados
const inflight = new Map();     // tag -> promesa de definición

function chunkURL(tag) { return `./components/${tag}.js`; }
function log(line) { document.dispatchEvent(new CustomEvent('fud:log', { detail: { line } })); }

async function ensureDefined(tag) {
  if (customElements.get(tag)) return;
  if (inflight.has(tag)) return inflight.get(tag);
  const p = import(chunkURL(tag)).then(() => customElements.whenDefined(tag));
  inflight.set(tag, p);
  await p;
}

// Recorre el subárbol de composición de `rootHost` en POST-ORDEN.
// Descarga por tag (una vez); monta/hidrata por instancia (data-id).
// Hijos más profundos primero; la raíz del subárbol (el padre clicado) NO se
// incluye aquí — la hidrata el flujo del camino 2 tras esta cascada.
async function hydrateSubtreePostorder(rootHost) {
  async function visit(host, depth) {
    const tag = host.localName;
    const childTags = tree[tag] || [];
    // buscar instancias hijas hidratables dentro del shadow del host
    const root = host.shadowRoot;
    for (const childTag of childTags) {
      const kids = root ? root.querySelectorAll(`${childTag}[data-id]`) : [];
      for (const kid of kids) {
        await visit(kid, depth + 1);   // PROFUNDIDAD PRIMERO (post-orden)
      }
    }
    // al volver: este host ya tiene sus descendientes vivos -> hidratarlo
    if (depth === 0) return;           // la raíz la hidrata el camino 2, no aquí
    if (hydrated.has(host.getAttribute('data-id'))) return;
    const t0 = performance.now();
    await ensureDefined(tag);
    if (typeof customElements.upgrade === 'function') customElements.upgrade(host);
    hydrated.add(host.getAttribute('data-id'));
    log(`  hidrata <${tag}> #${host.getAttribute('data-id')} (prof ${depth}) [${(performance.now()-t0).toFixed(1)}ms]`);
  }
  await visit(rootHost, 0);
}

function hostOf(path) {
  for (const n of path) if (n.nodeType === 1 && n.hasAttribute?.('data-id')) return n;
  return null;
}

async function onCapture(e) {
  const host = hostOf(e.composedPath());
  if (!host) return;
  const id = host.getAttribute('data-id');
  if (hydrated.has(id)) return;                       // camino 1

  const tag = host.localName;
  const tagWasDefined = !!customElements.get(tag);
  hydrated.add(id);

  if (tagWasDefined) {                                // camino 3
    log(`camino 3: <${tag}> #${id} ya definido`);
    return;
  }

  // camino 2 + cascada
  log(`camino 2: click en <${tag}> #${id} (padre), tag no definido`);
  e.preventDefault();
  e.stopImmediatePropagation();
  const type = e.type;
  const target = e.composedPath()[0] || e.target;

  // *** CASCADA: subárbol en post-orden (descendiente más profundo primero) ***
  log(`cascada: hidratar subárbol de <${tag}> en post-orden`);
  await hydrateSubtreePostorder(host);

  // el padre (raíz del subárbol) el ÚLTIMO
  const t0 = performance.now();
  await ensureDefined(tag);
  if (typeof customElements.upgrade === 'function') customElements.upgrade(host);
  log(`hidrata <${tag}> #${id} (padre, prof 0) [${(performance.now()-t0).toFixed(1)}ms]  ← el último`);

  // replay del click, ya con todo el subárbol vivo
  const Ctor = e.constructor && e.constructor !== Event ? e.constructor : MouseEvent;
  let replay;
  try { replay = new Ctor(type, { bubbles: true, cancelable: true, composed: true }); }
  catch { replay = new Event(type, { bubbles: true, cancelable: true, composed: true }); }
  log(`replay del ${type} sobre el padre`);
  target.dispatchEvent(replay);
}

document.querySelector('#app').addEventListener('click', onCapture, true);
log('runtime cargado. cero JS de componente aún.');
export {};
