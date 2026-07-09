// fudic-dom.js — primitivas del framework (@fudic/dom).
// Esto lo escribimos NOSOTROS. El developer lo importa, no lo implementa.

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
// Firma fija: emit(nombre, detail). Es lo que el compilador detecta por walk de Oxc.
// El framework FUERZA bubbles + composed: el developer no puede olvidarlos.
// `this` (el host) es quien emite; por eso emit se llama con el host como contexto,
// o se le pasa explícito. Aquí exponemos ambas formas.
export function emit(hostOrName, nameOrDetail, maybeDetail) {
  // Forma 1: emit.call(host, 'carrito', detail)  -> this === host
  // Forma 2: emit(host, 'carrito', detail)       -> host explícito
  let host, name, detail;
  if (hostOrName instanceof EventTarget) {
    host = hostOrName; name = nameOrDetail; detail = maybeDetail;
  } else {
    host = this; name = hostOrName; detail = nameOrDetail;
  }
  host.dispatchEvent(new CustomEvent(name, {
    detail,
    bubbles: true,     // sube por el árbol hasta el capturador global
    composed: true,    // cruza la frontera de shadow DOM
  }));
}
