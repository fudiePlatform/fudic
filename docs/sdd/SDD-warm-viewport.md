# SDD — Warm de chunks por viewport (`@fudic/core/dom`)

> **Estado:** `Listo`
> **Paquete:** `@fudic/core/dom` (runtime de cliente; ver SDD-00 §3.5)
> **Naturaleza:** runtime, no compilador. No implementa reglas de gramática; especifica
> el mecanismo de precarga que acompaña al capturador global de hidratación por
> interacción (SDD-runtime-hidratacion) y contra el que el emit del compilador presupone.
> **Validado:** prototipo funcional servido por HTTP, medido en navegador
> (INP < 20 ms tanto en cache-hit como en cache-miss; evidencia en §7).
> **Cubre:** punto abierto 1 (estrategia `viewport`). Las estrategias `eager` e `idle`
> quedan **fuera de alcance** hasta tener prototipo propio verificado (§8).

---

## 1. Contexto y objetivo

El runtime de hidratación por interacción (SDD-runtime-hidratacion) descarga el chunk de
un componente en el momento en que el usuario interactúa con él por primera vez. Si esa
primera interacción ocurre con el chunk aún sin descargar, el `import()` paga red **dentro
del gesto**, en el critical path del INP.

Este SDD especifica el mecanismo que **elimina esa red del critical path**: precachear los
chunks de los componentes **antes** de que el usuario interactúe, guiado por la entrada de
sus instancias en el viewport. Cuando llega la interacción, el `import()` sale de la cache
del Service Worker sin tocar red.

El mecanismo mantiene intacto el invariante fundamental del runtime: **cero JavaScript de
componente ejecutado hasta la interacción**. Precachear un chunk lo deposita en Cache
Storage; **no** lo evalúa, **no** registra el custom element, **no** hidrata nada. El warm
es exclusivamente capa de red anticipada; la hidratación sigue siendo por interacción y
por instancia, sin cambios.

Dos ejes ortogonales, que este SDD no confunde nunca:

- **Descarga por tag.** Un chunk por tag; el warm precachea el chunk una vez por tag,
  independientemente de cuántas instancias del tag haya en la página.
- **Hidratación por instancia.** Cada instancia se hidrata en su propia primera
  interacción (gobernado por el SDD-runtime-hidratacion, no por este).

---

## 2. Dependencias

- **SDD-runtime-hidratacion** — el capturador global de eventos que hidrata por
  interacción. Este SDD es aditivo sobre aquél: el warm precede a la interacción, no la
  sustituye. Comparte con él la convención `tag → URL de chunk` (`chunkURL(tag)`).
- **Service Worker** (SDD de red, aparte) — recibe la orden de warm del hilo principal,
  ejecuta la descarga y persiste el chunk en Cache Storage. Sirve después los chunks
  cache-first. El hilo principal es agnóstico al origen: ordena el warm y, en la
  interacción, hace `import()`; el SW decide si viene de cache o de red.
- **SSR / emit del compilador** — produce los hosts con `data-id` para las instancias N3
  efectivas (ver SDD-runtime-hidratacion §3.1). El warm observa exactamente esos hosts:
  los `[data-id]` son las instancias hidratables y, por tanto, las únicas cuyo tag merece
  precarga. Los N1/N2 puros no llevan `data-id` y el observer no los mira.

Ninguna dependencia de parsing. Este mecanismo no conoce el compilador; conoce el
**contrato de emit** (hosts `[data-id]` con `localName` = tag del chunk).

---

## 3. Contrato de emit (lo que el compilador debe producir)

El warm no añade requisitos nuevos al emit más allá de los que ya fija
SDD-runtime-hidratacion. Reutiliza:

- **`data-id` por host N3 efectivo.** El observer recorre `document.querySelectorAll('[data-id]')`
  y observa cada host. El `localName` de cada host es el tag, del que se deriva la URL del
  chunk (`chunkURL(tag)`).
- **Un chunk por tag, resoluble por convención o manifest.** `chunkURL(tag)` devuelve la
  URL del módulo del tag. En producción el mapa `tag → URL` lo emite el compilador con
  hashing de nombre; la convención por ruta (`./components/${tag}.js`) es el valor por
  defecto, idéntica a la del SDD-runtime-hidratacion.

No se emite metadato adicional para el warm. La estrategia `viewport` se infiere de la
presencia del host en el DOM; no requiere anotación en el `.fud`.

---

## 4. Interfaz pública del runtime

El warm se instala como efecto de importación del runtime, junto al capturador global.
Su contrato observable:

```ts
// Mensaje hilo principal -> Service Worker: orden de precachear chunks.
interface WarmMessage {
  type: 'warm';
  urls: string[];   // URLs de chunk a precachear (chunkURL(tag) por cada tag)
  tags: string[];   // tags correspondientes (para telemetría/log en la respuesta)
}

// Mensaje Service Worker -> hilo principal: confirmación de precache.
interface WarmedMessage {
  type: 'warmed';
  urls: string[];
  tags: string[];   // tags efectivamente cacheados
}
```

El hilo principal:

- Mantiene un `Set<string>` de tags ya ordenados a warm (`warmedTags`), para no repetir la
  orden. Es el guard de idempotencia del lado cliente.
- No expone API funcional; el warm es automático al cargar el runtime.

El Service Worker:

- Responde a `WarmMessage` precacheando cada URL **idempotentemente**: si ya está en Cache
  Storage, no re-descarga (guard del lado servidor).
- Descarga con **prioridad baja** (`fetch(url, { priority: 'low' })`): el warm es trabajo
  de fondo y no debe competir con el critical path de la carga ni con ninguna interacción
  en curso.

---

## 5. Comportamiento

### 5.1. Disparo por intersección

Un único `IntersectionObserver` observa todos los hosts `[data-id]` de la página:

```js
const io = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      warmTag(entry.target.localName);
      io.unobserve(entry.target);   // observado una vez; no se re-observa
    }
  }
}, { rootMargin: '0px', threshold: 0 });

for (const host of document.querySelectorAll('[data-id]')) io.observe(host);
```

- **Un tag se precachea cuando la primera de sus instancias entra en viewport.** Las demás
  instancias del mismo tag, ya en viewport o no, no re-disparan el warm: `warmTag` es
  idempotente por tag (`warmedTags`).
- **Los tags cuyas instancias no están en viewport no se tocan.** Un componente colocado
  fuera del viewport inicial (requiere scroll) no consume red hasta que el usuario se
  acerca a él. Esta es la propiedad central que distingue `viewport` de una precarga total:
  la red se gasta en proporción a lo que el usuario realmente ve.
- **`unobserve` tras la primera intersección.** Una vez ordenado el warm del tag, la
  instancia deja de observarse; el trabajo está hecho.

### 5.2. Ejecución del warm en idle

`warmTag` no ordena el warm de inmediato: lo difiere a un hueco de inactividad, porque es
trabajo de fondo que no debe robar tiempo al hilo principal mientras hay render o
interacción pendiente:

```js
function warmTag(tag) {
  if (warmedTags.has(tag)) return;   // idempotente por tag
  warmedTags.add(tag);
  const send = () => navigator.serviceWorker.controller?.postMessage({
    type: 'warm', urls: [chunkURL(tag)], tags: [tag],
  });
  ('requestIdleCallback' in window
    ? requestIdleCallback(send, { timeout: 800 })
    : setTimeout(send, 200));
}
```

El `timeout` acota la espera: si no llega un hueco de idle en 800 ms, el warm se ejecuta
igualmente. El fallback a `setTimeout` cubre navegadores sin `requestIdleCallback`.

### 5.3. Idempotencia en dos capas

El warm es idempotente en cliente **y** en servidor, porque las recargas, el
`clients.claim()` del SW y el re-registro pueden disparar la orden más de una vez:

- **Cliente:** `warmedTags` evita re-ordenar el warm de un tag ya ordenado.
- **Servidor (SW):** antes de descargar, el SW comprueba `cache.match(url)`; si el chunk ya
  está, retorna sin re-fetch.

Sin las dos capas, un warm repetido re-descargaría o re-escribiría la cache en cada
arranque. Con ellas, la cache converge a un chunk por tag visitado y se estabiliza.

### 5.4. Relación con la hidratación (sin solape)

El warm y la hidratación son fases disjuntas sobre el mismo chunk:

1. **Warm (idle, por viewport):** el chunk entra en Cache Storage. Nada más. El módulo no
   se evalúa; el custom element no se define; el invariante "cero JS de componente" se
   mantiene.
2. **Hidratación (interacción, por instancia):** el capturador global (SDD-runtime-hidratacion)
   hace `import(chunkURL(tag))`. Si el warm ya pasó, el SW sirve el módulo de cache
   (cache-hit, sin red). El `import` evalúa el módulo, `default()` registra el tag, el
   `connectedCallback` hidrata la instancia.

El warm reduce el coste de red del paso 2 a cero cuando ha tenido tiempo de completarse.
Si la interacción llega **antes** de que el warm termine (o sobre un tag excluido del
warm), el paso 2 paga red normalmente: el warm es una optimización, no un requisito de
correctitud. La hidratación funciona con o sin warm previo.

---

## 6. Invariantes

- **Cero JS de componente hasta la interacción.** El warm precachea; no evalúa, no define,
  no hidrata. Depositar un módulo en Cache Storage no ejecuta su top-level.
- **Warm por tag, no por instancia.** Un chunk se precachea una vez por tag, en la primera
  intersección de cualquiera de sus instancias. N instancias del mismo tag = un warm.
- **La red se gasta en proporción a lo visible.** Un tag cuyas instancias nunca entran en
  viewport nunca se precachea. El warm no es una precarga total encubierta.
- **Prioridad baja.** El warm descarga con `priority: 'low'`; no compite con el critical
  path de carga ni con interacciones en curso.
- **Idempotente en cliente y servidor.** Warms repetidos (recargas, re-registro del SW) no
  re-descargan. La cache converge a un chunk por tag visitado.
- **Optimización, no requisito.** La hidratación es correcta con o sin warm. El warm solo
  determina si el `import()` de la interacción paga red o sale de cache.

---

## 7. Criterios de aceptación

Servido por HTTP (el SW no arranca en `file://`). Página con instancias de al menos dos
tags: un conjunto **en el viewport inicial** (p. ej. varias `app-counter`) y otro
**fuera del viewport inicial**, alcanzable solo con scroll (p. ej. `app-toggle` tras un
hueco vertical > 100vh). Opcionalmente, un tag **excluido del warm** en viewport (p. ej.
`app-note`) para evidenciar cache-miss.

1. **Carga inicial: solo se precachea lo visible.** Tras cargar y esperar el idle, en
   Cache Storage aparece únicamente el chunk de los tags cuyas instancias están en el
   viewport inicial (`app-counter`). El chunk del tag fuera de viewport (`app-toggle`)
   **no** está cacheado.

2. **Warm por scroll.** Al hacer scroll hasta que una instancia del tag inferior entra en
   viewport, su chunk se precachea en ese momento (aparece en Cache Storage; el log emite
   la entrada correspondiente). No antes.

3. **Warm por tag, no por instancia.** Con N instancias del mismo tag en viewport, el
   chunk se descarga **una sola vez** (una entrada en Cache Storage, una petición de red).

4. **Prioridad baja.** En Network, las peticiones de warm figuran con prioridad `Low`.

5. **Idempotencia.** Recargar la página (con el SW ya activo) no re-descarga los chunks ya
   cacheados: la cache se mantiene estable, sin peticiones de red nuevas para tags ya
   precacheados.

6. **Cache-hit tras warm.** La primera interacción con una instancia de un tag ya
   precacheado hidrata sin tocar red (el `import()` sale del SW). INP medido: < 20 ms.

7. **Cache-miss sin warm.** La primera interacción con una instancia de un tag **excluido
   del warm** paga red en el `import()`. Con chunks pequeños (< 1 kB tras minify+brotli),
   el INP se mantiene por debajo del umbral: medido < 20 ms también. El cache-miss no es un
   techo problemático con el tamaño de chunk esperado.

**Evidencia de referencia (validación real):** página con 10 instancias `app-counter`
(viewport inicial), 3 `app-toggle` (tras hueco de scroll > 100vh) y 2 `app-note`
(viewport, excluidas del warm). Comportamiento observado:

- Carga: Cache Storage contiene solo `app-counter.js`. `app-toggle.js` ausente.
- Scroll a los toggles: `app-toggle.js` se precachea al entrar en viewport.
- Click en `app-counter` (warmeado): cache-hit, INP < 20 ms.
- Click en `app-note` (sin warm): cache-miss con red, INP < 20 ms.
- Recarga: cache estable, sin re-descargas.

---

## 8. Fuera de alcance

- **Estrategia `eager`** (warm inmediato sin esperar intersección, para above-the-fold
  crítico). No prototipada ni medida; queda para un SDD propio con evidencia. Por la
  regla del proyecto, no se especifica sin prototipo verificado primero.
- **Estrategia `idle` pura** (precargar todo en idle sin criterio de viewport). No cubierta.
- **Dispatcher común de estrategias de warm** (`viewport` / `eager` / `idle` bajo un mismo
  mecanismo de selección). Se contempla como convergencia futura una vez `eager` esté
  evidenciada; este SDD fija solo `viewport`.
- **`rootMargin` de anticipación** (precachear un tag cuando su instancia está *a punto*
  de entrar en viewport, con margen positivo). El prototipo usa `rootMargin: '0px'`;
  anticipar con margen es una optimización posterior, no validada aquí.
- **Manifest `tag → chunk` con hashing.** Convención por ruta en el prototipo; el emit del
  compilador lo sustituye (igual que en SDD-runtime-hidratacion).
- **Warm por navegación / precarga por ruta.** Aquí es una sola página. La precarga
  anticipada de chunks de otras rutas vive en el SDD de red/SW.
- **Desalojo de cache** (LRU, versionado, invalidación de chunks obsoletos). Política de
  ciclo de vida de Cache Storage, propia del SDD de red/SW.
