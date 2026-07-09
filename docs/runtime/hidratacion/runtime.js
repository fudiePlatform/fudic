// runtime.js — único módulo cargado al inicio. Capturador global.
//
// Control por INSTANCIA (data-id), no por tag. La hidratación es por instancia;
// la descarga del chunk es por tag (una sola vez).
//
// Tres caminos en el listener de captura:
//  1. Instancia ya hidratada (data-id en `hydrated`): el runtime se retira; el
//     listener propio de esa instancia maneja el evento con su `ev` real
//     (stopPropagation/preventDefault intactos).
//  2. Primera interacción, tag NO definido: no existe listener propio todavía.
//     Detenemos el evento original, descargamos+definimos, y hacemos replay del
//     gesto una vez sobre el target real (ya con listener propio vivo).
//  3. Primera interacción, tag YA definido (otra instancia lo descargó antes):
//     el connectedCallback de esta instancia ya corrió al definirse el tag, así
//     que su listener propio YA recibió el evento original en burbujeo. No hay
//     que descargar, ni detener, ni replay: solo marcar la instancia hidratada.

const payload = JSON.parse(document.getElementById('fud-state').textContent);
window.__fudState = payload;                 // autoridad de estado (no el DOM)

const hydrated = new Set();                   // data-id ya hidratados
const inflight = new Map();                   // tag -> promesa de definición

function chunkURL(tag) { return `./components/${tag}.js`; }

async function ensureDefined(tag) {
  if (customElements.get(tag)) return;
  if (inflight.has(tag)) return inflight.get(tag);
  const p = import(chunkURL(tag)).then(() => customElements.whenDefined(tag));
  inflight.set(tag, p);
  await p;
}

function hostOf(path) {
  for (const n of path) {
    if (n.nodeType === 1 && n.hasAttribute?.('data-id')) return n;
  }
  return null;
}

async function onCapture(e) {
  const host = hostOf(e.composedPath());
  if (!host) return;
  const id = host.getAttribute('data-id');

  // Camino 1: esta instancia ya pasó por el runtime → retirarse.
  if (hydrated.has(id)) return;

  const tag = host.localName;
  const tagWasDefined = !!customElements.get(tag);

  // Marcamos la instancia como hidratada en cuanto entra (antes del await):
  // futuros clics de esta instancia caen en el camino 1.
  hydrated.add(id);

  if (tagWasDefined) {
    // Camino 3: el listener propio ya existe y ya manejó el evento original.
    // No detenemos nada, no descargamos, no replay. Solo señalamos.
    document.dispatchEvent(new CustomEvent('fud:hydrated', {
      detail: { id, tag, ms: '0.0', from: 'shared-chunk' }
    }));
    return;
  }

  // Camino 2: tag no definido. No hay listener propio; el gesto se perdería.
  // Detenemos el original, descargamos+definimos, y reproducimos una vez.
  e.preventDefault();
  e.stopImmediatePropagation();

  const type = e.type;
  const target = e.composedPath()[0] || e.target;

  const t0 = performance.now();
  await ensureDefined(tag);
  const ms = (performance.now() - t0).toFixed(1);
  if (typeof customElements.upgrade === 'function') customElements.upgrade(host);

  document.dispatchEvent(new CustomEvent('fud:hydrated', {
    detail: { id, tag, ms, from: 'downloaded' }
  }));

  const Ctor = e.constructor && e.constructor !== Event ? e.constructor : MouseEvent;
  let replay;
  try {
    replay = new Ctor(type, { bubbles: true, cancelable: true, composed: true });
  } catch {
    replay = new Event(type, { bubbles: true, cancelable: true, composed: true });
  }
  target.dispatchEvent(replay);
}

document.querySelector('#app').addEventListener('click', onCapture, true);

document.dispatchEvent(new CustomEvent('fud:ready'));

export {};