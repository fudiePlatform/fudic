# SDD-17 — Runtime de hidratación (`@fudic/core`)

> **Estado:** `Listo`
> **Paquete:** `@fudic/core` (runtime de cliente) + `@fudic/dom` (`browserDom.event`/`.bus`).
> **Depende de:** 14 (contrato `Dom<N>`, `signal`, `emit`), 15 (los mapas que consume).
> **Rango de diagnósticos:** `FUD0320`–`FUD0339` (reservado; el runtime no diagnostica).
> **Naturaleza:** runtime, no compilador. No implementa reglas de gramática: especifica el
> módulo de cliente contra el que el emit emite.
>
> **Refunde, sin pérdida, cuatro documentos previos** (ya eliminados; su contenido vive aquí
> en su totalidad): `SDD-runtime-hidratacion.md` · `SDD-bus-eventos-hidratacion-dirigida.md`
> (partes de runtime) · `SDD-cascada-hidratacion-composicion.md` (partes de runtime) ·
> `SDD-warm-viewport.md`.
>
> **Validado:** cada pieza por separado en Chromium servido por HTTP (INP 20 ms en
> cache-hit; < 20 ms también en cache-miss con chunks < 1 kB tras minify+brotli). Las cuatro
> **nunca se habían fusionado**: los prototipos de `docs/runtime` eran cuatro copias
> divergentes del mismo capturador, cada una con su pieza. La fusión y los huecos que abría
> —el orden bus/cascada, `prepareTag`, `attachAll` y la resolución del chunk (§4.4, §4.6)— son
> lo nuevo de este documento.

---

## 1. Contexto y objetivo

Especificar el **único módulo JavaScript que una página Fudic descarga en la carga inicial**:
el capturador global que descarga, define e hidrata componentes **bajo demanda, guiado por la
interacción del usuario**. Mientras el usuario no interactúa, no se descarga ni ejecuta
ningún JavaScript de componente. La página renderizada por SSR (HTML + CSS + DSD) es
plenamente visible y navegable sin este runtime; el runtime solo añade comportamiento cuando
el usuario lo provoca.

Tres objetivos, y el tercero es el que obliga a fusionar:

1. Que la primera interacción con un componente no hidratado **no se pierda**, y que ninguna
   interacción se ejecute **dos veces**.
2. Que el modelo natural de eventos del DOM (`ev`, `stopPropagation`, `preventDefault`) quede
   **intacto** en el código del usuario.
3. Que cuando el handler del usuario finalmente corre, **todo lo que ese handler presupone
   vivo esté vivo**: los receptores de bus a los que va a emitir, y el subárbol de
   composición al que va a pasar props.

Sobre eso, una capa de red anticipada (**warm**, §4.7) que saca el `import()` del critical
path del INP sin tocar el modelo de hidratación.

---

## 2. Dependencias

- **Emit (SDD-15)** — contrato duro, no preferencia. El runtime rompe si el emit no
  garantiza: `data-id` entero base-0 correlativo, único por documento, determinista y
  co-emitido con el payload; solo en instancias N3 efectivas; DSD `open`; y los cuatro mapas
  `fud-state` / `fud-tree` / `fud-bus` / `fud-chunks` salidos de la misma pasada.
- **`@fudic/dom` (SDD-14)** — `browserDom`, y en particular `browserDom.event` y
  `browserDom.bus` (SDD-15 §3.8), que son lo que los controladores usan para engancharse.
- **Service Worker** (SDD de red, aparte) — sirve los chunks network-first la primera vez y
  cache-first después, y ejecuta las órdenes de warm. El runtime es agnóstico al origen: pide
  el chunk con `import()` y el SW decide de dónde sale.

Ninguna dependencia de parsing. Este runtime no conoce el compilador: conoce el **contrato de
emit**.

---

## 3. Interfaz pública

Módulo sin exports funcionales: efecto de instalación al importarse.

```ts
// Eventos de ciclo de vida emitidos en `document` (instrumentación/telemetría):
//   'fud:ready'                    — runtime instalado, cero JS de componente aún.
//   'fud:hydrated'  detail: {
//       id: number;                // data-id de la instancia hidratada
//       tag: string;               // localName del componente
//       ms: string;                // tiempo de resolución del chunk
//       from: 'downloaded' | 'shared-chunk' | 'bus' | 'subtree';
//   }
//   'fud:warmed'    detail: { tag: string }   — chunk depositado en cache, sin evaluar.
```

`from` gana dos valores respecto al documento refundido: la pre-hidratación de receptores de
bus emite `'bus'` y la cascada de composición emite `'subtree'`, para que la traza distinga
por qué se levantó cada instancia.

**El estado no se expone en un global.** El `window.__fudState` de los prototipos desaparece:
el runtime parsea `fud-state` una vez y **pasa** el tramo a la instancia
(`host.h(data.slice(offsets[id], offsets[id+1]))`, SDD-15 §4.3). El chunk no lee de un global
ni el componente conoce su `data-id`.

```ts
// Mensajes con el Service Worker (warm, §4.7)
interface WarmMessage   { type: 'warm';   urls: string[]; tags: string[] }
interface WarmedMessage { type: 'warmed'; urls: string[]; tags: string[] }
```

---

## 4. Comportamiento

### 4.1. Ejes independientes: hidratación por instancia, descarga por tag

La hidratación se controla **por instancia** (`data-id`). La descarga del chunk se controla
**por tag**. Son ortogonales y confundirlos es un error — fue el defecto detectado y
corregido durante la validación del primer prototipo:

- Un `Set` de `data-id` hidratados determina si el runtime debe intervenir en una instancia.
- `customElements.get(tag)` determina si hace falta descargar el chunk.

Dos instancias del mismo tag comparten chunk (una sola descarga) pero **se hidratan cada una
en su propia primera interacción**.

### 4.2. Instalación

Un **único** listener, en **fase de captura**, sobre el elemento raíz del área de aplicación:

```js
root.addEventListener('click', onCapture, true);
```

La captura garantiza que el runtime evalúa el evento **antes** que cualquier listener propio
de componente (que corre en burbujeo). Es lo que permite decidir si hay que descargar antes de
que el gesto se pierda.

> El conjunto de tipos capturados se limita a los que **burbujean** (`click`, `input`,
> `change`, `submit`, `keydown`, `pointerdown`, `focusin`, …). Los que no burbujean quedan
> fuera (§6). El alcance validado es `click`.

### 4.3. Los tres caminos del capturador

En cada evento capturado se localiza el host `[data-id]` más cercano recorriendo
`e.composedPath()` (atraviesa la frontera de shadow; `closest()` no sirve). Sin host, se
ignora. Con host, se decide por estado:

**Camino 1 — instancia ya hidratada** (`data-id ∈ hydrated`): el runtime **se retira**
inmediatamente. El listener propio maneja el evento con su `ev` real. Es el cierre que impide
el doble disparo: no se cuenta "una vez", se comprueba estado y se sale.

**Camino 2 — primera interacción, tag NO definido:** no existe listener propio; el gesto se
perdería. Es el camino largo, detallado en §4.4.

**Camino 3 — primera interacción, tag YA definido** (otra instancia lo descargó antes): esta
instancia **ya recibió su tramo y ya enganchó** cuando el tag se definió (`attachAll`, §4.4),
por lo que su listener propio existe y **ya recibió el evento original en burbujeo** (el runtime está en
captura, el listener en burbujeo, misma propagación). El runtime marca la instancia como
hidratada, emite `fud:hydrated` (`from: 'shared-chunk'`) y se retira: **no** descarga, **no**
detiene, **no** hace replay.

**Por qué el replay solo existe en el camino 2.** El replay repara un gesto que ocurrió cuando
no había quién lo manejara. Solo el camino 2 tiene esa condición. En el camino 3 el listener
propio existía en la misma propagación: un replay ahí produciría doble ejecución.

### 4.4. Camino 2 completo, y el orden entre bus y cascada

```
camino 2 (tag del host no definido):
  1. marcar la instancia como hidratada          (antes de cualquier await)
  2. preventDefault + stopImmediatePropagation   (el gesto a medias no debe surtir efecto)
  3. preHydrateBus(tag)                          — receptores de bus, EN SECUENCIA
  4. prepareTag(tag)                             — subárbol de composición de TODAS las
                                                   instancias del tag, en POST-ORDEN
  5. ensureDefined(tag) + attachAll(tag)         — el host, el ÚLTIMO
  6. replay: re-emitir UNA vez el evento original sobre el target real
```

**El orden 3 → 4 → 5 lo fija este SDD; ningún documento previo lo hacía**, porque bus y
cascada se validaron en prototipos separados que nunca se ejecutaron juntos. **Bus primero.**
Razón: los receptores de bus son componentes **hermanos externos** al host, y el subárbol es
**interno** a él. Si el subárbol montara antes, un hijo que emitiera en su propio `s()`
—perfectamente legal— lo haría con los receptores todavía muertos, que es exactamente el fallo
que la hidratación dirigida existe para evitar.

**3. Pre-hidratación de receptores de bus.**

```
preHydrateBus(tag):
  para cada receptor r en fud-bus[tag], EN SECUENCIA (no Promise.all):
    si r no está definido:
      prepareTag(r)                     // su subárbol, por el mismo argumento que el host
      ensureDefined(r)
      attachAll(r)                      // reparto del tramo a todas sus instancias
      marcar esas instancias como hidratadas; emitir fud:hydrated (from: 'bus')
```

**Secuencial, no `Promise.all`.** Garantiza el orden receptor→emisor incluso si un receptor
emitiera algo en su propio arranque; con `Promise.all` habría carrera.

**Un solo replay**, el del gesto original. El evento de bus (`carrito`) **no** se replay-ea:
nace natural del handler del item cuando corre en el replay, y el receptor —ya vivo— lo recibe
en su propia propagación.

El runtime **no conoce nombres de evento**: consume "para levantar A, levanta antes B (y C…)".

**4. Cascada de composición, en post-orden.**

Al pulsar un elemento dentro de un padre no hidratado no basta con levantar el padre: su
subárbol de descendientes hidratables debe estar vivo **antes** de que el padre monte y su
handler corra, porque el código emitido del padre pasa estado/props a sus hijos en el momento
de montarlos. El orden correcto es **post-orden**: el descendiente más profundo primero, el
padre el último.

```
hydrateSubtreePostorder(rootHost):
  visit(host, depth):
    para cada childTag en fud-tree[host.localName]:
      para cada instancia `kid` de `childTag[data-id]` dentro de host.shadowRoot:
        visit(kid, depth + 1)                  // PROFUNDIDAD PRIMERO
    si depth > 0:                              // la raíz no aquí; la levanta el paso 5
      ensureDefined(host.localName)            // descarga por tag, memoizada
      customElements.upgrade(host)             // hidrata esta instancia
      hydrated.add(id); emitir fud:hydrated (from: 'subtree')
  visit(rootHost, 0)
```

- **Descarga por tag, montaje por instancia.** `ensureDefined` memoiza por tag (`inflight`),
  así el chunk de un tag repetido se descarga una vez aunque aparezca en varias posiciones del
  subárbol; cada instancia se upgradea en su posición.
- **La búsqueda desciende por `host.shadowRoot`, no por `document`**, porque
  `querySelectorAll` no cruza fronteras de shadow. Cada nivel entra explícitamente en su
  shadow y recursa. Esto exige DSD `open`, que el emit garantiza.
- El paso de estado/props padre→hijo lo resuelve el código emitido (sistema de props, 67–85);
  el runtime **solo garantiza el orden**, no interviene en el paso de datos.

**El hueco que la fusión destapa: `prepareTag`, no `hydrateSubtreePostorder` a secas.**

`customElements.define(tag, …)` upgradea **todas** las instancias del tag presentes en el
árbol (incluidas las de dentro de shadow roots), no solo aquella sobre la que se hizo click.
Si solo preparásemos el subárbol del host clicado, las demás instancias del mismo tag se
upgradearían con **su** subárbol muerto, y el post-orden quedaría violado para ellas — que es
precisamente el escenario que luego llega al camino 3 y no tiene reparación posible (ese
camino no puede hacer nada: el `connectedCallback` ya corrió).

Por eso el paso 4 es **por tag**:

```
prepareTag(tag):
  para cada instancia h de tag[data-id] en el árbol (atravesando shadow roots):
    hydrateSubtreePostorder(h)
```

Con esto, el camino 3 vuelve a ser un no-op **correcto**: cuando el tag se definió, todas sus
instancias tenían el subárbol listo. Sin esto, el camino 3 es un no-op **incorrecto** y es un
fallo silencioso.

El recorrido que localiza las instancias atraviesa shadow roots descendiendo por `shadowRoot`
en cada elemento; se hace una vez por tag, justo antes de definirlo.

**El mismo argumento, aplicado al reparto del estado: `attachAll`.** El componente no conoce
su `data-id` (§3), luego no puede leer su propio tramo del payload: lo **reparte el runtime**.
Y por la misma razón que `prepareTag`, el reparto es **por tag**, no por instancia: `define`
upgradea todas las instancias de golpe, así que si solo se le pasara el tramo a la instancia
clicada, las demás quedarían upgradeadas y **sin enganchar** — y su primera interacción cae en
el camino 3, que por definición no descarga ni repara nada. El fallo sería silencioso.

```
attachAll(tag):
  para cada instancia h de tag[data-id] en el árbol (atravesando shadow roots):
    si h ya recibió su tramo: continuar
    customElements.upgrade(h)                    // idempotente; blinda el orden
    h.h(data.slice(offsets[id], offsets[id + 1]))   // punto de entrada 1 (SDD-15 §4.3)
```

Hacen falta **dos conjuntos distintos**, y confundirlos rompe el camino 3: `hydrated`
(instancias sobre las que el runtime ya intervino) gobierna los tres caminos; `attached`
(instancias a las que ya se les pasó su tramo) gobierna el reparto. Una instancia hermana
queda `attached` sin estar `hydrated`, y por eso su primer click sigue emitiendo
`from: 'shared-chunk'` en vez de pasar inadvertido.

**El receptor de bus también se prepara.** El paso 3 no puede limitarse a `ensureDefined` del
receptor: definir su tag upgradea sus instancias, luego su subárbol debe estar listo antes por
el mismo argumento. `preHydrateBus` llama a `prepareTag(r)` y a `attachAll(r)` para cada
receptor, igual que el paso 5 hace con el host.

**5. El host, el último. 6. Replay.** Cuando el handler del usuario corre (en el replay),
receptores de bus y subárbol están vivos.

### 4.5. Reconstrucción del evento en el replay

El replay reconstruye el evento con su constructor original
(`new e.constructor(type, {bubbles, cancelable, composed})`) con fallback a `Event`, y lo
despacha sobre `e.composedPath()[0]`. **El replay vuelve a entrar en el capturador** (es
`composed`, y el capturador está en `document`): es inofensivo y deliberado — la instancia ya
está en `hydrated`, así que cae en el camino 1 y el runtime se retira. Se apoya en el camino 1
como cierre, no en apagar `composed`. Para `click` esto es completo. Eventos que porten datos
no reproducibles por el constructor (coordenadas exactas, `dataTransfer`) quedan fuera del
alcance validado (§6).

### 4.6. Resolución del chunk

```ts
function chunkURL(tag: string): string;   // fud-chunks[tag]
```

El mapa `tag → URL` lo emite el compilador (SDD-15 §3.6) con hashing de nombre para cacheado
inmutable. **Sustituye la convención hardcodeada `./components/${tag}.js`** que los cuatro
prototipos arrastraban y que ninguno de los documentos refundidos había cerrado. Un tag sin
entrada no es hidratable: el runtime no lo pide y lo ignora.

```js
async function ensureDefined(tag) {
  if (customElements.get(tag)) return;
  if (inflight.has(tag)) return inflight.get(tag);
  const p = import(chunkURL(tag)).then(() => customElements.whenDefined(tag));
  inflight.set(tag, p);
  await p;
}
```

### 4.7. Warm: precarga por viewport

Si la primera interacción ocurre con el chunk sin descargar, el `import()` paga red **dentro
del gesto**, en el critical path del INP. El warm precachea los chunks **antes** de que el
usuario interactúe, guiado por la entrada de las instancias en el viewport.

**Mantiene intacto el invariante fundamental: cero JS de componente ejecutado hasta la
interacción.** Precachear deposita el módulo en Cache Storage; **no** lo evalúa, **no**
registra el custom element, **no** hidrata nada. Es exclusivamente capa de red anticipada.

```js
const io = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (entry.isIntersecting) {
      warmClosure(entry.target.localName);
      io.unobserve(entry.target);     // observado una vez; no se re-observa
    }
  }
}, { rootMargin: '0px', threshold: 0 });

for (const host of document.querySelectorAll('[data-id]')) io.observe(host);
```

- **Un tag se precachea cuando la primera de sus instancias entra en viewport.** Las demás no
  re-disparan: `warmTag` es idempotente por tag.
- **Los tags cuyas instancias no están en viewport no se tocan.** Un componente que requiere
  scroll no consume red hasta que el usuario se acerca. Es la propiedad central que distingue
  `viewport` de una precarga total: la red se gasta en proporción a lo que el usuario ve.
- **Warm del cierre transitivo, no del tag suelto.** `warmClosure(tag)` warmea también
  `fud-bus[tag]` y, recursivamente, `fud-tree[tag]`. Es consecuencia directa de §4.4: al
  interactuar con ese tag el runtime va a necesitar exactamente esos chunks, y warmear solo el
  del host dejaría la cascada pagando red dentro del gesto. Ninguno de los documentos
  refundidos lo contemplaba, porque el warm se prototipó sin bus ni cascada.

**Ejecución en idle.** El warm no se ordena de inmediato: es trabajo de fondo y no debe robar
tiempo al hilo principal mientras hay render o interacción pendiente.

```js
function warmTag(tag) {
  if (warmedTags.has(tag)) return;              // idempotente por tag
  warmedTags.add(tag);
  const send = () => navigator.serviceWorker.controller?.postMessage({
    type: 'warm', urls: [chunkURL(tag)], tags: [tag],
  });
  ('requestIdleCallback' in window
    ? requestIdleCallback(send, { timeout: 800 })
    : setTimeout(send, 200));
}
```

El `timeout` acota la espera: sin hueco de idle en 800 ms, el warm se ejecuta igualmente. El
fallback cubre navegadores sin `requestIdleCallback`.

**Prioridad baja.** El SW descarga con `fetch(url, { priority: 'low' })`: el warm no compite
con el critical path de carga ni con interacciones en curso.

**Idempotencia en dos capas**, porque las recargas, el `clients.claim()` del SW y el
re-registro pueden disparar la orden más de una vez:

- **Cliente:** `warmedTags` evita re-ordenar el warm de un tag ya ordenado.
- **Servidor (SW):** antes de descargar comprueba `cache.match(url)`; si ya está, retorna.

Sin las dos capas, un warm repetido re-descargaría o re-escribiría la cache en cada arranque.
Con ellas, la cache converge a un chunk por tag visitado y se estabiliza.

**Warm e hidratación son fases disjuntas sobre el mismo chunk.** El warm lo deposita en cache;
la hidratación hace `import()` y, si el warm ya pasó, el SW lo sirve sin red. Si la interacción
llega **antes** de que el warm termine, el `import()` paga red normalmente: **el warm es una
optimización, no un requisito de correctitud.** La hidratación funciona con o sin warm previo.

---

## 5. Invariantes

- **Cero JS de componente hasta la interacción.** En la carga solo se descarga este runtime.
  Ningún chunk se **evalúa** sin una interacción que lo dispare; el warm solo lo deposita en
  cache.
- **Una interacción = una ejecución.** Nunca dos. El cierre es el estado de instancia
  (`hydrated`), no un contador. Un solo replay, y solo en el camino 2.
- **El listener propio del componente es la única vía permanente de manejo de eventos.** El
  runtime interviene como máximo una vez por instancia y solo para descargar/definir/reparar;
  después se retira por estado.
- **`ev` intacto para el usuario.** `stopPropagation`/`preventDefault` funcionan como en
  cualquier listener DOM. El runtime no envuelve ni reinterpreta la lógica del componente.
- **El payload es autoridad de estado; el DOM es autoridad de posición.** El componente no
  reconstruye estado desde su DOM. Estado completo serializado, se pinte o no.
- **Descarga por tag, hidratación por instancia.** Un chunk por tag; cada instancia se hidrata
  en su primera interacción.
- **Receptor de bus vivo antes que el subárbol; subárbol vivo antes que el host.** El orden del
  camino 2 es 3→4→5, sin excepción.
- **Post-orden estricto en la cascada.** Descendiente más profundo primero; el host disparador
  el último. El handler del host no corre hasta que todos sus descendientes hidratables están
  definidos y upgradeados.
- **La preparación del subárbol y el reparto del estado son por tag, no por instancia**
  (§4.4). `define` upgradea todas las instancias del tag; todas deben tener su subárbol listo
  y su tramo repartido antes de que ninguna reciba una interacción.
- **`hydrated` y `attached` son conjuntos distintos.** El primero gobierna los tres caminos;
  el segundo, el reparto del payload. Fundirlos rompe el camino 3.
- **El recorrido desciende por `shadowRoot`, no por `document`.** `querySelectorAll` no cruza
  shadow; cada nivel entra en su shadow y recursa. Exige DSD `open`.
- **Custom elements con guion obligatorio** (decisión 41). Verificado por evidencia: un nombre
  sin guion no materializa el declarative shadow root (`This element does not support
  attachShadow`), rompiendo la cascada. Innegociable.
- **El runtime no conoce estructura de dominio ni nombres de evento.** `fud-tree` y `fud-bus`
  son tag→tags, resueltos en compilación. El runtime consume dependencias de hidratación.
- **Warm por tag, no por instancia.** N instancias del mismo tag = un warm. La red se gasta en
  proporción a lo visible; prioridad baja; idempotente en cliente y servidor.
- **El warm es optimización, no requisito.** La hidratación es correcta con o sin él.

---

## 6. Criterios de aceptación

Servido por HTTP (el SW y el `import()` no arrancan en `file://`). Página única que combina
los cuatro escenarios que antes vivían en cuatro prototipos separados:

- dos instancias de `app-counter` (`data-id` 0 y 1) y una de `app-toggle` (2), en viewport;
- una cadena de composición `app-parent`(3) → `app-child` → `app-grandchild` →
  `app-greatgrandchild`;
- un emisor `product-list` y un suscriptor `shopping-cart` (`fud-bus`:
  `{"product-list":["shopping-cart"]}`);
- un tag **fuera del viewport inicial**, alcanzable solo con scroll, y otro **excluido del
  warm** para evidenciar el cache-miss.

**Base:**

1. **Carga inicial.** En Network (filtro JS) solo `runtime.js`. Ningún chunk de componente.
   `document.querySelectorAll(':not(:defined)')` lista los tags de nivel de documento.
2. **Camino 2.** Click en `app-counter` #0 → se descarga su chunk, el tag desaparece de
   `:not(:defined)`, y el contador incrementa **en ese mismo primer click** (replay).
3. **Camino 3.** Click en #1 → **no** se redescarga el chunk; #1 incrementa en su primer
   click; `fud:hydrated` con `from:'shared-chunk'` y `ms: 0.0`.
4. **Camino 1.** Clicks sucesivos en #0 y #1: **cada click = un incremento**, sin doble.
5. **Estado independiente por instancia.** #0 y #1 mantienen contadores separados leídos de su
   propio tramo; modificar uno no altera el otro.
6. **INP.** En cache-hit, muy por debajo del umbral "bueno" (medido: 20 ms).

**Cascada:**

7. **Post-orden verificable.** Click en el botón de `app-parent`: la traza muestra
   `app-greatgrandchild` (prof 3) antes que `app-grandchild` (2), antes que `app-child` (1),
   antes que `app-parent` (0). El padre es el último.
8. **Padre antes del replay; handler tras el replay.** `hidrata <app-parent>` precede a
   `replay`, y el handler del padre sigue al `replay`. `count` pasa a 1 en el primer click.
9. **Preparación por tag (§4.4).** Con **dos** instancias de `app-parent` en la página, click
   en la primera: la traza muestra que el subárbol de **ambas** se preparó antes del `define`.
   Después, click en la segunda (camino 3) → su handler corre con su subárbol vivo. **Es el
   test que falla con `hydrateSubtreePostorder` a secas y pasa con `prepareTag`.**

**Bus:**

10. **Orden bus → subárbol → host.** Click en un item de `product-list`: la traza muestra
    `bus: <shopping-cart> vivo` **antes** de la cascada, y la cascada antes de
    `emisor <product-list> vivo`.
11. **El evento de bus no se pierde en el primer click.** Replay → `emit('carrito', …)` → el
    carrito, ya vivo, recibe: badge `1`, importe `3.50 €` en ese mismo primer click.
12. **Sin doble disparo.** Añadir dos productos más (camino 1): badge `3`, importe `7.50 €`.
    Un click = un incremento.
13. **Solo el suscriptor escucha en `document`.** Un `@carrito` de host no recibiría; el
    listener de `bus:` vive en `document`.
14. **Baja limpia.** Al desconectar el suscriptor, su listener de `document` se retira (`r()`);
    emitir después no produce efecto ni fuga.

**Warm:**

15. **Solo se precachea lo visible.** Tras cargar y esperar el idle, Cache Storage contiene
    únicamente los chunks de los tags con instancias en el viewport inicial. El del tag
    inferior **no** está.
16. **Warm por scroll.** Al hacer scroll hasta que una instancia del tag inferior entra en
    viewport, su chunk se precachea **en ese momento**, no antes.
17. **Warm por tag, no por instancia.** Con N instancias del mismo tag en viewport, una sola
    entrada en Cache Storage y una sola petición de red.
18. **Warm del cierre transitivo.** Con `app-parent` en viewport, se precachean también
    `app-child`, `app-grandchild` y `app-greatgrandchild`; con `product-list` en viewport, se
    precachea `shopping-cart`.
19. **Prioridad baja.** En Network, las peticiones de warm figuran con prioridad `Low`.
20. **Idempotencia.** Recargar con el SW activo no re-descarga los chunks ya cacheados.
21. **Cache-hit tras warm.** La primera interacción con un tag precacheado hidrata sin tocar
    red. INP < 20 ms.
22. **Cache-miss sin warm.** La primera interacción con un tag excluido del warm paga red en el
    `import()`; con chunks < 1 kB tras minify+brotli el INP se mantiene < 20 ms. El cache-miss
    no es un techo problemático al tamaño de chunk esperado.

**Cierre:**

23. **Todo definido al final.** Tras interactuar con todo, `:not(:defined)` está vacío, también
    dentro de los shadow roots.

---

## 7. Prototipo de referencia

`docs/runtime/hidratacion/` es la evidencia ejecutable de este SDD: los cuatro prototipos
fusionados en un solo capturador, servido por HTTP, con el escenario de §6. Las cuatro ramas
divergentes (`cascade/`, `bus/`, `hidratación-last/`, `test/`) se eliminan: su contenido está
íntegro aquí y en el prototipo fusionado.

---

## 8. Fuera de alcance

- **Estrategias de hidratación declaradas por el componente** (`@client(eager|viewport|idle)`,
  decisiones 64/65). **Eliminadas de v1**: un componente se coloca donde el consumidor quiera y
  su código no puede declarar cuándo se hidrata — es un hecho de página, no de componente. Con
  ellas caen `defineLazy` y el marcador `data-fud-c`. `viewport` sobrevive, pero como estrategia
  de **warm de red** (§4.7), no de hidratación.
- **`eager` e `idle` como estrategias de warm.** No prototipadas ni medidas. Por la regla del
  proyecto, no se especifican sin prototipo verificado primero. Un dispatcher común de
  estrategias de warm se contempla como convergencia futura.
- **`rootMargin` de anticipación** (warmear cuando la instancia está *a punto* de entrar en
  viewport). El prototipo usa `0px`; anticipar con margen es optimización posterior, no
  validada aquí.
- **Disparo temprano por `pointerdown`** para reducir INP en cache-miss. Decidido no optimizar
  de momento; se reconsiderará con datos del INP en miss.
- **Eventos que no burbujean** (`focus`/`blur`, `scroll`, `mouseenter`…): no delegables desde
  un capturador global; requieren otro mecanismo.
- **Replay de eventos con carga no reproducible** por el constructor (coordenadas,
  `dataTransfer`). El alcance validado es `click`.
- **Componentes con shadow `closed`.** El descubrimiento por DOM del subárbol requiere `open`.
  Los mapas funcionarían igual, pero localizar instancias dentro de un shadow `closed` no es
  posible desde el runtime; si se necesita, es un caso a especificar aparte.
- **Scoping del bus por subárbol.** v1 fija `document` como ancestro común único. Un bus por
  región (varios `#app`, buses anidados) es ampliación futura.
- **Warning del LSP para `@evento` crudo que colisiona con un evento de bus** ("`carrito` se
  emite como bus; ¿querías `bus:carrito`?"). Deseable, pero es tarea del language server.
- **Rutas, navegación y cacheo por ruta**, política de desalojo de Cache Storage (LRU,
  versionado, invalidación). Viven en el SDD de red/SW.
- **Materialización del grafo raíz con identidad de referencias.** El payload es estado por
  instancia; objetos compartidos preservando `===` es la decisión pendiente de
  `@server load() → data`.
