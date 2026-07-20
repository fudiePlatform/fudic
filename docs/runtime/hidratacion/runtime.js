// runtime.js — el ÚNICO módulo JavaScript que la página descarga en la carga
// inicial. Capturador global de hidratación. Implementa SDD-17 completo: la
// fusión de los cuatro prototipos que antes vivían separados (base + cascada +
// bus + warm) más los dos huecos que la fusión destapaba.
//
// Ejes independientes (SDD-17 §4.1):
//   - la HIDRATACIÓN se controla por INSTANCIA (`data-id`);
//   - la DESCARGA del chunk se controla por TAG.
// Confundirlos es el defecto que se corrigió durante la validación del primer
// prototipo. Dos instancias del mismo tag comparten chunk (una descarga) pero
// cada una entra al runtime en su propia primera interacción.
//
// Los tres caminos del capturador (§4.3):
//   1. instancia ya hidratada  -> el runtime se retira; manda el listener propio.
//   2. primera interacción, tag NO definido -> camino largo (§4.4): bus, cascada,
//      host, replay.
//   3. primera interacción, tag YA definido -> el listener propio ya existía y ya
//      recibió el evento en burbujeo. Marcar y salir. Sin descarga, sin replay.

// ---------------------------------------------------------------------------
// Los cuatro mapas de emit (SDD-15 §3.3-§3.6). Salen de la misma pasada de página.
// ---------------------------------------------------------------------------
const readJSON = (id) => {
  const el = document.getElementById(id);
  return el ? JSON.parse(el.textContent) : null;
};

// fud-state POSICIONAL: [[offsets],[data]]. El `data-id` base-0 correlativo ES el
// índice en `offsets`; no hay tabla `id -> estado`.
const [offsets, data] = readJSON('fud-state') ?? [[0], []];
const tree   = readJSON('fud-tree')   ?? {};   // tag padre  -> [tags hijos hidratables]
const bus    = readJSON('fud-bus')    ?? {};   // tag emisor -> [tags receptores]
const chunks = readJSON('fud-chunks') ?? {};   // tag        -> URL del módulo

// EL ESTADO NO SE EXPONE EN UN GLOBAL (SDD-17 §3). El `window.__fudState` de los
// prototipos desaparece: el runtime parsea el payload una vez y PASA el tramo a la
// instancia. El chunk no lee de un global ni el componente conoce su `data-id`.
const sliceFor = (id) => data.slice(offsets[Number(id)], offsets[Number(id) + 1]);

// ---------------------------------------------------------------------------
// Estado del runtime
// ---------------------------------------------------------------------------

// `data-id` sobre los que el runtime ya intervino. Gobierna los tres caminos.
const hydrated = new Set();

// `data-id` a los que ya se les pasó su tramo del payload (`h()` invocado una vez).
//
// NO está en el SDD y es necesario: `customElements.define` upgradea TODAS las
// instancias del tag de golpe, pero ninguna puede conocer su propio `data-id`
// (§3), así que el `connectedCallback` no puede enrutar su `h()`. Es el runtime
// quien reparte los tramos, y debe hacerlo para TODAS las instancias del tag en el
// momento en que el tag se define — si no, el camino 3 encontraría una instancia
// upgradeada pero sin enganchar y el criterio 3 fallaría. `attached` separa ese
// reparto (por tag, en `define`) del estado de intervención (por instancia).
const attached = new Set();

// tag -> promesa de definición. Memoiza la descarga: un chunk por tag.
const inflight = new Map();

const log = (line, cls = '') =>
  document.dispatchEvent(new CustomEvent('fud:log', { detail: { line, cls } }));

const hydratedEvent = (id, tag, ms, from) =>
  document.dispatchEvent(new CustomEvent('fud:hydrated', { detail: { id, tag, ms, from } }));

// ---------------------------------------------------------------------------
// Resolución del chunk (SDD-17 §4.6)
// ---------------------------------------------------------------------------
// El mapa `tag -> URL` lo emite el compilador con hashing de nombre. SUSTITUYE a la
// convención hardcodeada `./components/${tag}.js` que los cuatro prototipos
// arrastraban. Un tag sin entrada NO es hidratable: no se pide y se ignora.
function chunkURL(tag) { return chunks[tag]; }

async function ensureDefined(tag) {
  const url = chunkURL(tag);
  if (!url) return false;                       // no hidratable: el runtime no lo pide
  if (customElements.get(tag)) return true;
  if (!inflight.has(tag)) {
    inflight.set(tag, import(url).then(() => customElements.whenDefined(tag)));
  }
  await inflight.get(tag);
  return true;
}

// ---------------------------------------------------------------------------
// Localización de instancias ATRAVESANDO SHADOW ROOTS
// ---------------------------------------------------------------------------
// `querySelectorAll` NO cruza fronteras de shadow: hay que entrar explícitamente en
// cada `shadowRoot` y recursar. Exige DSD `open`, que el emit garantiza.
// El recorrido es en pre-orden shadow-inclusive: el contenido de un shadow se
// visita justo después de su host.
function instancesOf(tag, root = document) {
  const out = [];
  (function descend(node) {
    for (const el of node.querySelectorAll('*')) {
      if (el.localName === tag && el.hasAttribute('data-id')) out.push(el);
      if (el.shadowRoot) descend(el.shadowRoot);
    }
  })(root);
  return out;
}

/** Todas las instancias hidratables del documento, cruzando shadows. */
function allInstances(root = document) {
  const out = [];
  (function descend(node) {
    for (const el of node.querySelectorAll('*')) {
      if (el.hasAttribute('data-id')) out.push(el);
      if (el.shadowRoot) descend(el.shadowRoot);
    }
  })(root);
  return out;
}

// ---------------------------------------------------------------------------
// Reparto del payload: el tramo se PASA a la instancia
// ---------------------------------------------------------------------------
// Se invoca justo después de `ensureDefined(tag)`, porque `define` ya upgradeó
// todas las instancias del tag. Cada una recibe SU tramo:
//   host.h(data.slice(offsets[id], offsets[id + 1]))     (SDD-15 §4.3, SDD-17 §3)
function attachAll(tag) {
  for (const inst of instancesOf(tag)) {
    const id = inst.getAttribute('data-id');
    if (attached.has(id)) continue;
    attached.add(id);
    customElements.upgrade(inst);              // idempotente; blinda el orden
    inst.h?.(sliceFor(id));                    // punto de entrada 1: instancia de SSR
  }
}

// ---------------------------------------------------------------------------
// PASO 3 del camino 2 — pre-hidratación de receptores de bus (SDD-17 §4.4)
// ---------------------------------------------------------------------------
// EN SECUENCIA, no `Promise.all`: garantiza el orden receptor -> emisor incluso si
// un receptor emitiera algo en su propio arranque; con `Promise.all` habría carrera.
//
// El runtime NO conoce nombres de evento. El compilador ya resolvió 'carrito' a una
// relación tag->tags. El runtime solo consume: "para levantar A, levanta antes B".
async function preHydrateBus(emitterTag) {
  for (const rTag of bus[emitterTag] ?? []) {
    if (customElements.get(rTag)) continue;
    log(`bus: pre-hidratar receptor <${rTag}> ANTES del emisor <${emitterTag}>`, 'bus');
    const t0 = performance.now();

    // Un receptor también puede componer: si su tag se define, sus instancias se
    // upgradean, y su subárbol debe estar listo antes por el mismo argumento de
    // §4.4. El pseudocódigo del SDD no lo contempla; se aplica el invariante.
    await prepareTag(rTag);

    if (!(await ensureDefined(rTag))) continue;
    attachAll(rTag);
    for (const inst of instancesOf(rTag)) {
      const rid = inst.getAttribute('data-id');
      if (hydrated.has(rid)) continue;
      hydrated.add(rid);
      hydratedEvent(rid, rTag, (performance.now() - t0).toFixed(1), 'bus');
    }
    log(`bus: <${rTag}> vivo [${(performance.now() - t0).toFixed(1)}ms]`, 'bus');
  }
}

// ---------------------------------------------------------------------------
// PASO 4 del camino 2 — cascada de composición en POST-ORDEN (SDD-17 §4.4)
// ---------------------------------------------------------------------------
// El descendiente más profundo primero; la raíz del subárbol NO se hidrata aquí
// (la levanta el paso 5). El paso de estado/props padre->hijo lo resuelve el código
// emitido; el runtime SOLO garantiza el orden.
async function hydrateSubtreePostorder(rootHost) {
  async function visit(host, depth) {
    const tag = host.localName;
    const root = host.shadowRoot;

    for (const childTag of tree[tag] ?? []) {
      // Búsqueda dentro del shadow del host, un nivel; la recursión entra en el
      // siguiente. No se busca desde `document`: no cruzaría la frontera.
      for (const kid of root ? root.querySelectorAll(`${childTag}[data-id]`) : []) {
        await visit(kid, depth + 1);                // PROFUNDIDAD PRIMERO
      }
    }

    if (depth === 0) return;                        // la raíz, en el paso 5
    const id = host.getAttribute('data-id');
    if (hydrated.has(id)) return;

    const t0 = performance.now();
    if (!(await ensureDefined(tag))) return;        // descarga por tag, memoizada
    attachAll(tag);                                 // upgrade + tramo por instancia
    hydrated.add(id);
    const ms = (performance.now() - t0).toFixed(1);
    log(`  cascada: hidrata <${tag}> #${id} (prof ${depth}) [${ms}ms]`, 'casc');
    hydratedEvent(id, tag, ms, 'subtree');
  }
  await visit(rootHost, 0);
}

// EL HUECO QUE LA FUSIÓN DESTAPA (SDD-17 §4.4): `prepareTag`, no
// `hydrateSubtreePostorder` a secas.
//
// `customElements.define(tag, …)` upgradea TODAS las instancias del tag del árbol,
// incluidas las de dentro de shadow roots, no solo aquella sobre la que se hizo
// click. Si solo preparásemos el subárbol del host clicado, las demás instancias
// del mismo tag se upgradearían con SU subárbol muerto, y el post-orden quedaría
// violado para ellas — que es exactamente el escenario que luego llega al camino 3,
// donde no tiene reparación posible (el `connectedCallback` ya corrió).
//
// Con esto el camino 3 vuelve a ser un no-op CORRECTO. Sin esto es un no-op
// INCORRECTO, y es un fallo silencioso.
async function prepareTag(tag) {
  const hosts = instancesOf(tag);
  if (hosts.length > 1) {
    log(`prepareTag: <${tag}> tiene ${hosts.length} instancias; se prepara el subárbol de TODAS`, 'casc');
  }
  for (const h of hosts) await hydrateSubtreePostorder(h);
}

// ---------------------------------------------------------------------------
// El capturador (SDD-17 §4.2, §4.3, §4.5)
// ---------------------------------------------------------------------------

// El host `[data-id]` más cercano se localiza recorriendo `composedPath()`, que
// atraviesa la frontera de shadow. `closest()` no sirve.
function hostOf(path) {
  for (const n of path) if (n.nodeType === 1 && n.hasAttribute?.('data-id')) return n;
  return null;
}

async function onCapture(e) {
  const host = hostOf(e.composedPath());
  if (!host) return;                               // sin host: se ignora
  const id = host.getAttribute('data-id');

  // --- CAMINO 1 --------------------------------------------------------------
  // El runtime se retira. El listener propio maneja el evento con su `ev` real
  // (stopPropagation/preventDefault intactos). Es el cierre que impide el doble
  // disparo: no se cuenta "una vez", se comprueba estado y se sale.
  if (hydrated.has(id)) return;

  const tag = host.localName;
  if (!chunkURL(tag)) return;                      // tag no hidratable: ignorar

  const tagWasDefined = !!customElements.get(tag);

  // Marcar ANTES de cualquier await: reentradas caen en camino 1.
  hydrated.add(id);

  // --- CAMINO 3 --------------------------------------------------------------
  // Otra instancia descargó el chunk antes. El `connectedCallback` de ESTA ya corrió
  // al definirse el tag, su listener propio ya existe y YA recibió el evento
  // original en burbujeo (el runtime está en captura, misma propagación).
  // No descarga, no detiene, NO hace replay: un replay aquí sería doble ejecución.
  if (tagWasDefined) {
    log(`camino 3: <${tag}> #${id} ya definido — marcar y salir (shared-chunk)`, 'path');
    hydratedEvent(id, tag, '0.0', 'shared-chunk');
    return;
  }

  // --- CAMINO 2 --------------------------------------------------------------
  // No existe listener propio: el gesto se perdería.
  log(`camino 2: click en <${tag}> #${id}, tag NO definido`, 'path');

  // 2. El gesto a medias no debe surtir efecto.
  e.preventDefault();
  e.stopImmediatePropagation();

  // Se capturan AHORA, antes del primer await: en captura `e.target` está
  // retargeteado al host; el target real es `composedPath()[0]`, dentro del shadow.
  const type = e.type;
  const target = e.composedPath()[0] || e.target;
  const Ctor = e.constructor;
  const composed = e.composed;
  const cacheHit = warmedTags.has(tag);

  // 3. BUS PRIMERO. Los receptores son componentes hermanos EXTERNOS al host; el
  //    subárbol es INTERNO. Si el subárbol montara antes, un hijo que emitiera en
  //    su propio `s()` —perfectamente legal— lo haría con los receptores todavía
  //    muertos: justo el fallo que la hidratación dirigida existe para evitar.
  await preHydrateBus(tag);

  // 4. Después la cascada, POR TAG (no solo el host clicado).
  log(`cascada: preparar subárbol de <${tag}> en post-orden`, 'casc');
  await prepareTag(tag);

  // 5. El host, el ÚLTIMO.
  const t0 = performance.now();
  const ok = await ensureDefined(tag);
  const ms = (performance.now() - t0).toFixed(1);
  if (ok) {
    attachAll(tag);
    log(`hidrata <${tag}> #${id} (host, prof 0) [${ms}ms] ${cacheHit ? '· cache-hit' : '· cache-miss (red)'}  <- el último`,
        cacheHit ? 'live' : 'net');
    hydratedEvent(id, tag, ms, 'downloaded');
  }

  // 6. REPLAY, una sola vez, sobre el target real. Cuando el handler del usuario
  //    corre aquí, receptores de bus y subárbol están vivos.
  //    Se reconstruye con el constructor original y fallback a `Event` (§4.5).
  //    Va `composed` como el original: el replay vuelve a entrar en el capturador,
  //    pero la instancia ya está en `hydrated` y cae en camino 1 — no-op.
  //    El evento de bus ('carrito') NO se replay-ea: nace natural del handler
  //    cuando corre en este replay, y el receptor —ya vivo— lo recibe.
  let replay;
  try { replay = new Ctor(type, { bubbles: true, cancelable: true, composed }); }
  catch { replay = new Event(type, { bubbles: true, cancelable: true, composed }); }
  log(`replay del ${type} sobre el target real`, 'path');
  target.dispatchEvent(replay);
}

// UN ÚNICO listener, en fase de CAPTURA, sobre la raíz del área de aplicación.
// La captura garantiza que el runtime evalúa el evento ANTES que cualquier listener
// propio de componente (que corre en burbujeo): es lo que permite decidir si hay que
// descargar antes de que el gesto se pierda.
// El alcance validado es `click`; los tipos que no burbujean quedan fuera (§8).
const root = document.querySelector('#app');
root.addEventListener('click', onCapture, true);

// ---------------------------------------------------------------------------
// WARM: precarga por viewport (SDD-17 §4.7)
// ---------------------------------------------------------------------------
// MANTIENE INTACTO EL INVARIANTE FUNDAMENTAL: cero JS de componente ejecutado hasta
// la interacción. Precachear deposita el módulo en Cache Storage; NO lo evalúa, NO
// registra el custom element, NO hidrata nada. Es exclusivamente capa de red
// anticipada, y es OPTIMIZACIÓN, no requisito: la hidratación es correcta sin él.

const warmedTags = new Set();      // idempotencia de CLIENTE (la de servidor va en sw.js)
const warmQueue = [];              // órdenes emitidas antes de que el SW controle la página

// Tags EXCLUIDOS del warm. NO forma parte del runtime: es un afordance de la demo
// para evidenciar el cache-miss (criterio 22). En producción no existe.
const NO_WARM = new Set(['app-cold']);

function postWarm(tag) {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) { warmQueue.push(tag); return; }   // aún sin SW: se reintenta al claim
  controller.postMessage({ type: 'warm', urls: [chunkURL(tag)], tags: [tag] });
}

navigator.serviceWorker?.addEventListener('controllerchange', () => {
  const pending = warmQueue.splice(0);
  for (const tag of pending) postWarm(tag);
});

navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type !== 'warmed') return;
  for (const tag of e.data.tags) log(`warm: <${tag}> depositado en cache (sin evaluar)`, 'warm');
});

function warmTag(tag) {
  if (NO_WARM.has(tag)) return;                 // solo demo
  if (warmedTags.has(tag)) return;              // idempotente POR TAG, no por instancia
  if (!chunkURL(tag)) return;                   // no hidratable: nada que precachear
  warmedTags.add(tag);
  // EN IDLE: el warm es trabajo de fondo y no debe robar tiempo al hilo principal
  // mientras hay render o interacción pendiente. El timeout acota la espera: sin
  // hueco de idle en 800 ms se ejecuta igualmente.
  const send = () => postWarm(tag);
  ('requestIdleCallback' in window)
    ? requestIdleCallback(send, { timeout: 800 })
    : setTimeout(send, 200);
}

// WARM DEL CIERRE TRANSITIVO, no del tag suelto. Consecuencia directa de §4.4: al
// interactuar con ese tag el runtime va a necesitar exactamente esos chunks
// (`fud-bus[tag]` y, recursivamente, `fud-tree[tag]`), y warmear solo el del host
// dejaría la cascada pagando red dentro del gesto. Ninguno de los cuatro prototipos
// lo contemplaba: el warm se prototipó sin bus ni cascada.
function warmClosure(tag, seen = new Set()) {
  if (seen.has(tag)) return;                    // corta ciclos de composición
  seen.add(tag);
  warmTag(tag);
  for (const r of bus[tag] ?? []) warmClosure(r, seen);
  for (const c of tree[tag] ?? []) warmClosure(c, seen);
}

const io = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    warmClosure(entry.target.localName);
    io.unobserve(entry.target);                 // observado una vez; no se re-observa
  }
}, { rootMargin: '0px', threshold: 0 });

// Se observan TODAS las instancias hidratables, también las de dentro de shadows.
for (const host of allInstances()) io.observe(host);

// ---------------------------------------------------------------------------
// Registro del Service Worker (sirve los chunks y ejecuta las órdenes de warm).
// El runtime es agnóstico al origen: pide el chunk con `import()` y el SW decide
// de dónde sale.
// ---------------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(() => log('service worker registrado', 'live'))
    .catch((err) => log(`SW no disponible: ${err.message} (el warm queda inerte)`, 'dim'));
} else {
  log('sin serviceWorker en este navegador (el warm queda inerte)', 'dim');
}

document.dispatchEvent(new CustomEvent('fud:ready'));

export {};
