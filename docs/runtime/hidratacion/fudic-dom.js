// fudic-dom.js — las primitivas de `@fudic/dom` (SDD-14 + SDD-15 §3.8).
//
// Esto lo escribimos NOSOTROS; el developer lo importa, no lo implementa.
// En el paquete real esto es `browserDom`, el adapter de navegador del contrato
// `Dom<N>`; hay un `ssrDom` hermano cuyos `event`/`bus` son no-op. Un controlador,
// dos adapters.
//
// El prototipo implementa solo la parte del contrato que el escenario ejercita:
// `el`, `append`, `event`, `bus`. Los componentes de `components/` la consumen
// como `$dom`, exactamente como haría el código emitido.

/** Adapter de navegador. En el emit real llega al factory como `$props[0]`. */
export const browserDom = {
  el(tag) { return document.createElement(tag); },
  append(parent, ...nodes) { for (const n of nodes) if (n) parent.appendChild(n); },

  /** Suscribe `cb` a `type` en `node`. Devuelve la baja. No reordena ni envuelve `cb`. */
  event(node, type, cb) {
    node.addEventListener(type, cb);
    return () => node.removeEventListener(type, cb);
  },

  /**
   * Suscribe `cb` al bus (SDD-15 §4.4). El listener va sobre `document`, NO sobre
   * el host: emisor y suscriptor son HERMANOS, y un CustomEvent que burbujea desde
   * el emisor sube por SUS ancestros y nunca entra en el host del suscriptor.
   * `host` es solo el contexto del handler; lo aplica el llamador.
   * Devuelve la baja — sin ella, `bus:` es una fuga: el listener vive en `document`
   * y sobrevive al host.
   */
  bus(host, name, cb) {
    document.addEventListener(name, cb);
    return () => document.removeEventListener(name, cb);
  },
};

// --- signal: fábrica que devuelve un callable s() con peek/set/subscribe ---
// El set itera `for (const fn of subs)` sobre el Set vivo (no [...subs]):
// desuscribir a mitad de notificación surte efecto en la misma ronda.
export function signal(initial) {
  let value = initial;
  const subs = new Set();
  const s = () => value;
  s.peek = () => value;
  s.set = (next) => {
    if (Object.is(next, value)) return;
    value = next;
    for (const fn of subs) fn(value);
  };
  s.subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
  return s;
}

// --- emit: ÚNICO punto de emisión de eventos de bus ---
// El developer escribe `emit('carrito', p)`. El compilador lo reescribe a
// `emit.call($host, 'carrito', p)` para inyectar el host sin filtrarlo a la firma.
// El framework FUERZA bubbles + composed: el developer no gestiona propagación.
export function emit(hostOrName, nameOrDetail, maybeDetail) {
  let host, name, detail;
  if (hostOrName instanceof EventTarget) {
    host = hostOrName; name = nameOrDetail; detail = maybeDetail;
  } else {
    host = this; name = hostOrName; detail = nameOrDetail;
  }
  host.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
}

// --- trace: instrumentación EXCLUSIVA de la demo, no forma parte de @fudic/dom ---
// Los componentes la usan para que el panel de log muestre cuándo corre su `s()`
// y cuándo corre el handler del usuario. El emit real no genera nada de esto.
export function trace(line, cls = '') {
  document.dispatchEvent(new CustomEvent('fud:log', { detail: { line, cls } }));
}
