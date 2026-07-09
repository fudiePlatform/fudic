// runtime.js — único módulo cargado al inicio. Capturador global.
// Lo escribimos NOSOTROS. El developer no lo toca.
//
// AMPLIACIÓN vs. el runtime base: el camino 2, ANTES de hidratar el emisor,
// consulta el mapa de bus (emisor -> [receptores]) emitido por el compilador
// y PRE-HIDRATA esos receptores EN SECUENCIA. Así el listener del receptor
// (registrado en su connectedCallback) está vivo antes de que el emisor emita.
//
// El runtime NO conoce nombres de evento. El compilador ya resolvió
// 'carrito' a una relación tag->tags. El runtime solo sabe:
//   "para levantar A, levanta antes B (y C, ...)".

const stateEl = document.getElementById('fud-state');
window.__fudState = stateEl ? JSON.parse(stateEl.textContent) : {};

const busEl = document.getElementById('fud-bus');
const busMap = busEl ? JSON.parse(busEl.textContent) : {};   // emisor -> [receptores]

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

// Pre-hidratación de receptores de bus, EN SECUENCIA, antes del emisor.
// Secuencial (no Promise.all): garantiza orden receptor -> emisor incluso si
// un receptor emitiera algo en su propio connectedCallback.
async function preHydrateBus(emitterTag) {
  const receptores = busMap[emitterTag] || [];
  for (const tag of receptores) {
    if (customElements.get(tag)) continue;
    log(`bus: pre-hidratar receptor <${tag}> ANTES del emisor <${emitterTag}>`);
    const t0 = performance.now();
    await ensureDefined(tag);
    // upgradea todas las instancias de ese receptor ya presentes en el DOM
    for (const inst of document.querySelectorAll(`${tag}[data-id]`)) {
      if (typeof customElements.upgrade === 'function') customElements.upgrade(inst);
      hydrated.add(inst.getAttribute('data-id'));  // el receptor queda hidratado
    }
    log(`bus: <${tag}> vivo [${(performance.now() - t0).toFixed(1)}ms]`);
  }
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

  // Camino 1: instancia ya hidratada -> el runtime se retira.
  if (hydrated.has(id)) return;

  const tag = host.localName;
  const tagWasDefined = !!customElements.get(tag);

  hydrated.add(id);   // antes del await: reentradas caen en camino 1

  if (tagWasDefined) {
    // Camino 3: listener propio ya existía y ya manejó el evento en burbujeo.
    log(`camino 3: <${tag}> #${id} ya definido, marcar y salir (shared-chunk)`);
    document.dispatchEvent(new CustomEvent('fud:hydrated', {
      detail: { id, tag, ms: '0.0', from: 'shared-chunk' }
    }));
    return;
  }

  // Camino 2: tag no definido. El gesto se perdería sin listener propio.
  log(`camino 2: click en <${tag}> #${id}, tag no definido`);
  e.preventDefault();
  e.stopImmediatePropagation();

  const type = e.type;
  const target = e.composedPath()[0] || e.target;

  // *** PIEZA NUEVA: pre-hidratar receptores de bus antes del emisor ***
  await preHydrateBus(tag);

  const t0 = performance.now();
  await ensureDefined(tag);
  const ms = (performance.now() - t0).toFixed(1);
  if (typeof customElements.upgrade === 'function') customElements.upgrade(host);
  log(`emisor <${tag}> #${id} vivo [${ms}ms]`);

  document.dispatchEvent(new CustomEvent('fud:hydrated', {
    detail: { id, tag, ms, from: 'downloaded' }
  }));

  // Replay: el gesto original se re-emite una vez sobre el target real.
  // El handler del item corre -> llama a emit('carrito') -> el receptor,
  // ya vivo, lo recibe en su propia propagación. Un solo replay del click;
  // 'carrito' nace natural del handler, no se replay-ea.
  const Ctor = e.constructor && e.constructor !== Event ? e.constructor : MouseEvent;
  let replay;
  try {
    replay = new Ctor(type, { bubbles: true, cancelable: true, composed: true });
  } catch {
    replay = new Event(type, { bubbles: true, cancelable: true, composed: true });
  }
  log(`replay del ${type} sobre el item real`);
  target.dispatchEvent(replay);
}

document.querySelector('#app').addEventListener('click', onCapture, true);
document.dispatchEvent(new CustomEvent('fud:ready'));
log('runtime cargado. cero JS de componente aún.');

export {};
