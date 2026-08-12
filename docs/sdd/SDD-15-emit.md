# SDD-15 — Emit (AST → runtime)

> **Estado:** `Listo` — con la **slice de emit SSR de servidor en `Hecho`** (ver *Slices* abajo).
> **Paquete:** `@fudic/compiler` (emit), contra `@fudic/dom` · `@fudic/core` · `@fudic/ssr`.
>
> **Slices.** Este SDD se implementa por partes. La **rama de servidor SSR está `Hecho`**
> (commits `7623a49` + refactor `44c31ad`): `emitComponentModule` produce el
> `render($dom, $shadow, props)` ejecutable contra `SsrDom` (elementos, texto, interpolación
> de contenido, `@if`/`@foreach`, atributos estáticos e interpolados, `class:`, composición de
> hijos vía `data-adopt` + `attachShadow` + llamada al `render` del hijo, defaults de
> `props<T>()` y **signals inertes** —valor inicial, sin reactividad—), y `emitPageModule`
> produce `page(data, io)` → documento HTML completo (DSD por instancia) con el hoisting de
> estilos y el polyfill de §4.8 (SDD-18). Es exactamente lo que hace falta para el HTML DSD
> cero-JS. **Pendiente** (rama de cliente/hidratación, la consume SDD-17): §3.1 `data-fud-id`,
> §3.3–3.6 los cuatro mapas JSON (`fud-state`/`fud-tree`/`fud-bus`/`fud-chunks`), §3.7
> controlador `{c,h,r}` / `FudicElement`, §3.8 `Dom.event`/`Dom.bus`, §4.2 deserialización,
> §4.4 bus, §4.5 event bindings, §4.6 factory. **Motivo del cierre parcial (Pedro):** la rama
> de servidor es **totalmente aislada del resto** —no comparte artefactos con los mapas JSON ni
> con el controlador—, así que se da por hecha sin bloquear ni ser bloqueada por el emit de
> cliente. Esto es lo que sostiene a **SDD-18 en `Hecho`**, que solo depende de esta slice.
> **Amplía el runtime:** añade `FudicElement` a `@fudic/core` (§3.7) y `event`/`bus` a
> `Dom<N>` en `@fudic/dom` (§3.8). Son piezas del contrato de emit, por eso viven aquí y no
> en SDD-14.
> **Orden de las tandas de cliente pendientes** (2026-08-06): la primera está `Hecho`
> ([`FudicElement` y emit de cliente](./SDD-15-Task-fudic-element-y-emit-de-cliente.md), 22/22);
> la siguiente es **[SDD-30 — Renders de bloque](./SDD-30-renders-de-bloque.md)**, y solo
> detrás van los [event bindings y el bus](./SDD-15-Task-eventos-y-bus.md). El motivo está en
> el propio emit: con `@if`/`@foreach` aplanados en `c`/`h`, la variable de nodo se reasigna
> cada iteración, así que el enganche de un `@foreach` no tiene dónde vivir y `r()` deja
> colgadas las N−1 filas anteriores. Los eventos delante escribirían un parche que SDD-30 tira.
> **Depende de:** 00, 05–14, 16.
> **Rango de diagnósticos:** `FUD0290`–`FUD0319`.
> **Decisiones de gramática:** 22, 27, 28 (+28.a–d), 29, 67–85, **96–99** (event bindings).
> La 26 —y con ella la forma *factory* que §4.5 derivaba de ella— queda **revisada por la 96**
> el 2026-08-06: un event binding es una invocación con `$event` y datos, y el handler se
> declara plano. La **99** es lo que hace escribible a la 96: sin ella una expresión implícita
> se corta en el `(` (decisiones 2/4/5) y `@click="@del($event, item.id)"` no parsea.
>
> **Refunde, sin pérdida, cuatro documentos previos** (ya eliminados; su contenido vive
> aquí en su totalidad):
> `SDD-emit-estado-hidratacion.md` (§3, §4, §5, §7) ·
> `SDD-eventos-captura-contexto.md` (§6) ·
> `SDD-bus-eventos-hidratacion-dirigida.md` (partes de compilador: §4.4, §6, §7) ·
> `SDD-cascada-hidratacion-composicion.md` (partes de compilador: §3.1, §3.2, §8).
> El runtime de cliente que consume todo esto es **SDD-17**.

---

## 1. Contexto y objetivo

Traducir el AST validado (SDD-05–12) a los artefactos que el navegador ejecuta. Es el
hito de cierre del compilador: aquí `home.fud` + `app-card.fud` + `app-button.fud` +
`app-badge.fud` dejan de ser árboles y pasan a ser HTML servido y módulos JS que corren.

El emit produce **dos familias de artefactos**, y la frontera entre ambas es la razón de
que este SDD exista como una sola pieza:

- **Emit de página** — el HTML del documento (DSD por instancia), y los tres mapas JSON
  que el runtime consume: estado, composición y bus. Todos salen de **una única
  pasada determinista en pre-orden** sobre el árbol de composición ya resuelto. Salen
  juntos porque tienen que casar por construcción; calculados por separado divergirían.
  (El cuarto, `tag → chunk`, se **retiró**: es derivable del manifiesto. Ver §3.6.)
- **Emit de componente** — un módulo JS por tag, con el controlador del componente. Ese
  mismo controlador, ejecutado contra el adapter de SSR en vez del de navegador, es lo que
  produce el markup del punto anterior. **Un controlador, dos adapters.**

El principio transversal del estado: **la forma vive en el código emitido; el dato viaja
desnudo.** El compilador conoce por el AST el orden y el tipo de cada prop, así que hornea
los dos extremos —la serialización en servidor y el destructuring en cliente—; el JSON no
transporta esquema, solo valores.

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-05 / 07 | AST de markup y bindings clasificados (`EventBinding`, `BusBinding`, `ClassBinding`, `StyleBinding`, `PropertyBinding`, `RefBinding`, `Interpolation`). |
| SDD-06 | Nodos de control de flujo (`IfNode`, `ForeachNode`, …); sus renders de bloque son el único sitio donde `u` tiene trabajo real (§4.6). |
| SDD-08 / 10 | Regiones `@code { @server / @client }` y estructura del documento (`PageDocument` / `ComponentDocument`, identidad por el tag del envoltorio, decisiones 75–78). |
| SDD-09 | `StyleNode.parts` del `<style>` del componente. |
| SDD-11 | AST de Oxc por fragmento: base de la distinción de formas de event binding (§4.5) y de la detección de `emit(...)` (§4.4). |
| SDD-12 | `SemanticModel`: nivel efectivo por componente (N1/N2/N3), resolución de nombres de evento de bus a literal, catálogo de componentes. |
| SDD-13 | `SourceMapBuilder` y `mapOffset`: cada fragmento emitido se ancla a su origen. |
| SDD-14 | `Dom<N>` / `DomClient<N>`, `browserDom`, `SsrDom`, `signal`, `emit`. Contrato contra el que se emite; este SDD lo amplía con `FudicElement` (§3.7) y `Dom.event`/`Dom.bus` (§3.8). |
| SDD-16 | `serializeChunks`, `htmlToByteStream`, `escapeText`/`escapeAttr`. El emit de página reutiliza el escape y compone su `async function*` sobre estas primitivas. |
| SDD-17 | **Consumidor**, no dependencia: el runtime lee lo que este SDD emite. Los contratos de §3.3–§3.6 son duros hacia él. |

---

## 3. Interfaz pública (los contratos de emit)

### 3.1. `data-fud-id` — identidad de instancia

Cada instancia **N3 efectiva** se emite como su custom element con DSD y un `data-fud-id`:

```html
<app-counter data-fud-id="0">
  <template shadowrootmode="open">
    <!-- markup ya renderizado con el estado de la instancia 0 -->
  </template>
</app-counter>
```

- **Por qué `data-fud-id` y no `data-id`.** `data-*` es vocabulario del **autor**, y `data-id`
  es de los más escritos que hay: un `data-id` en el markup propio o en el de una librería
  integrada sería una instancia hidratable a ojos del runtime, con un tramo de payload que no
  existe y sin error visible. El namespace `fud` es lo que separa los dos mundos, igual que
  `bus:` (decisión 22) y que la reserva `$` (§4.7).
- `data-fud-id` es **identidad de instancia**, no un identificador del programador ni derivable
  del componente aislado: un mismo componente aparece N veces en una página y el componente
  no sabe cuántas. Por eso **no puede** calcularse en el emit del `.fud` del componente; se
  asigna en el emit de **página**, tras resolver toda la composición.
- **Entero base-0 y correlativo** (`0,1,2,…`) en pre-orden sobre las instancias N3
  efectivas. No es cosmético: el id **es** el índice en el array de offsets (§3.3), y eso
  elimina la tabla intermedia `id → estado`.
- **Solo N3 efectivo lo lleva.** Los N1/N2 puros no se hidratan, no llevan `data-fud-id` ni
  entrada en ningún mapa, y son inertes para el runtime. El nivel efectivo lo da SDD-12
  (nivel intrínseco o inducido por props reactivas entrantes).
- **`data-fud-id` es el único marcador emitido en el host.** No se emite `data-fud-c` (tag),
  `data-fud-e` (delegación) ni ningún `data-fud-css`: retirados o innecesarios (§7). El
  specifier de estilos **no** necesita marcador propio: es el tag del host, y el serializador
  lo emite en el `<template>` como `shadowrootadoptedstylesheets="<tag>"` (§4.8, SDD-18 D-1/D-6).
- El shadow es **declarativo y `open`** (decisión 75.a): el parser del navegador lo
  materializa en la carga, el componente se ve sin JavaScript, y el descubrimiento de
  instancias dentro de un subárbol (§3.4) lo exige.

**Determinismo requerido:** mismo árbol de entrada ⇒ mismos ids, mismos offsets, mismo
data, mismo destructuring. Sin esto, SSR y cualquier regeneración divergen.

### 3.2. La pasada única de página

Los cuatro artefactos de página salen del **mismo recorrido**, en pre-orden, sobre el árbol
de composición resuelto (todos los `<link rel="component">` seguidos):

1. el atributo `data-fud-id` en cada host N3 efectivo,
2. su tramo de valores en `fud-state` (§3.3),
3. la entrada de su tag en `fud-tree` (§3.4),
4. la entrada de su tag en `fud-bus` (§3.5).

No son cuatro pasadas coordinadas: es una, y ese es el invariante que hace que casen.

**Y esa pasada ocurre DENTRO DEL RENDER, no en compilación.** Los puntos 1 y 2 no pueden ser
de compilación: un `@foreach` sobre `data.items` produce N instancias que solo existen cuando
llegan los datos. El contador de identidad vive por tanto en el adapter de SSR
(`SsrDom.claim` / `SsrDom.state`, §3.3), y el pre-orden sale del propio recorrido del emisor
—fabrica el host antes de bajar a su shadow y antes de su light DOM—. Los puntos 3 y 4 sí son
de compilación: son tag→tags, no dependen de los datos y viajan como constantes del módulo de
página.

### 3.3. `fud-state` — el estado, posicional

Un único documento JSON por página:

```html
<script type="application/json" id="fud-state">
[[0,2,4,6,7,8],[1,"Pedro",2,"Claude",3,"Ada",true,false]]
</script>
```

- **Posición 0 — `offsets`**: array de enteros de longitud `n+1` para `n` instancias N3.
  `offsets[id]` es el inicio (inclusive) del tramo de la instancia `id` en `data`;
  `offsets[id+1]` el fin (exclusivo). La entrada final cierra el último tramo.
- **Posición 1 — `data`**: array plano con los valores de todas las instancias, en orden de
  `data-fud-id`, concatenados.

Recuperación del estado de una instancia:

```ts
const [offsets, data] = payload;
const values = data.slice(offsets[id], offsets[id + 1]);
```

No hay claves, no hay mapa `data-fud-id → estado`, no hay índice por tag. El `data-fud-id` base-0
correlativo **es** el índice. Cada hecho vive una vez, referido por posición.

**El payload es la autoridad de estado; el DOM es autoridad de posición.** El controlador
lee su estado inicial de aquí, **nunca reconstruyéndolo desde su propio DOM**; el DOM se usa
solo para adoptar posicionalmente los nodos ya renderizados. Y el estado es **completo, no
proyección**: si el render SSR solo pinta un subconjunto de los campos (un `@if` que muestra
`name` o `phone` según una condición), el payload igualmente contiene todos. El DOM refleja
la proyección; el payload es la preimagen.

### 3.4. `fud-tree` — la composición, por tag

```html
<script type="application/json" id="fud-tree">
{ "app-parent": ["app-child"], "app-child": ["app-grandchild"] }
</script>
```

```ts
type FudTree = Record<string /* tag padre */, string[] /* tags hijos directos hidratables */>;
```

- **Clave:** tag padre. **Valor:** tags de sus hijos directos **N3 efectivos**.
- **Es tag→[tags], NO instancia→[instancias].** No crece con el número de instancias: una
  página con 200 tarjetas tiene la misma entrada `app-card` que una con una. Crece con el
  **catálogo** de componentes (acotado, decenas). Por eso su peso es insignificante.
- Solo los tags con hijos hidratables aparecen como clave; una hoja no tiene entrada. Solo
  se listan hijos N3 efectivos: los N1/N2 puros no llevan `data-fud-id` y no entran.
- El runtime lo usa para saber **qué** tags buscar; desciende por `shadowRoot` para
  localizar las **instancias**, porque `querySelectorAll` no cruza fronteras de shadow.

> **Descubrimiento por DOM sin mapa** se evaluó y se descartó: el ahorro de bytes es
> insignificante (el mapa es por tag, no por instancia) y forzaría a mantener `open` como
> requisito del runtime en vez de como decisión de emit.

### 3.5. `fud-bus` — la hidratación dirigida, por tag

```html
<script type="application/json" id="fud-bus">
{ "product-list": ["shopping-cart"] }
</script>
```

```ts
type FudBus = Record<string /* tag emisor */, string[] /* tags receptores */>;
```

- **Clave:** tag **emisor**. **Valor:** tags que deben estar vivos **antes** de hidratarlo.
- **El nombre del evento no aparece.** Se resolvió en compilación a una relación tag→tags.
  El runtime nunca razona sobre nombres de evento: consume "para levantar A, levanta antes
  B (y C…)".

### 3.6. `fud-chunks` — **RETIRADO**

No se emite. La URL del chunk de hidratación de un tag es **derivable** del manifiesto que
ya se publica: `createUrlResolver(base, build).hydrateUrl(tag)`
([SDD-27 §4.1](./SDD-27-artefactos-y-manifiesto.md), cuyo criterio 9 dice exactamente eso —
la URL sale del build id y del tag, y de nada más). Y el runtime tiene el tag delante: lo lee
de `host.localName` en cada `[data-fud-id]`.

**El motivo de retirarlo no es ahorrar bytes, es no duplicar un hecho en dos ficheros que
caducan por reglas distintas.** El manifiesto se purga por build (`shell-${build}`, en el
`activate` del Service Worker); un JSON incrustado en un HTML prerenderizado se sirve mientras
ese HTML esté en cache. Con las dos copias, un deploy deja una página apuntando a los chunks
del build anterior.

Con él cae `FUD0293` (§5): el diagnóstico existía para un hueco en un mapa que ya no hay, y
además el pase de cliente emite un chunk por **cada** componente del grafo, sin filtro de
nivel, así que el hueco tampoco puede producirse.

Lo que la garantía tenía de valioso —que el fichero exista— se conserva y se comprueba: ver
el criterio §6.27, reescrito sin mapa.

### 3.7. Firma del artefacto de componente

**Lo único que el emit genera por componente es el factory `static c($props)` y la llamada a
`define`.** Todo el andamiaje de instancia es idéntico en todos los componentes y vive en una
clase base del runtime, `FudicElement` (`@fudic/core`):

```ts
// @fudic/core — escrito una vez, NO emitido.
export abstract class FudicElement extends HTMLElement {
  static c($props: unknown[]): Controller;   // lo implementa cada componente emitido

  /** Instancia venida de SSR: el shadow ya está poblado (DSD). La llama el runtime. */
  h(props: unknown[]): void;
  /** Instancia creada en runtime por el controlador padre: no hay shadow que adoptar. */
  c(props: unknown[]): void;
  /** Baja simétrica. La dispara el navegador. */
  disconnectedCallback(): void;
}

export interface Controller {
  c(): void;   // create  — fabrica nodos, aplica los valores ($a), monta ($m) y engancha ($s)
  h(): void;   // hydrate — adopta nodos del shadow SSR por traversal posicional y engancha ($s)
  u(props: readonly unknown[]): void; // update — reasigna las props y reaplica los valores
  r(): void;   // remove  — teardown simétrico
  // $m (mount), $s (subscription) y $a (apply) NO están en la interfaz: son closures
  // privadas del factory, orquestadas por c, h y u. Ver §4.3 y §4.6.
}
```

Y el módulo emitido por componente se reduce a esto:

```js
// chunk emitido para <app-counter>
import { FudicElement } from '@fudic/core';

customElements.define('app-counter', class extends FudicElement {
  static c($props) { /* … el factory de §4.6, lo único específico … */ }
});
```

**Por qué clase base y no boilerplate emitido.** `h(props)`, `c(props)`,
`disconnectedCallback` y el campo privado del controlador son **carácter por carácter los
mismos en todos los componentes**: lo único que varía es el factory. Emitirlos repetiría el
andamiaje en cada chunk, y eso choca con el criterio 22 de SDD-17, que sostiene el INP en
cache-miss sobre **chunks < 1 kB tras minify+brotli** — la cifra que valida el modelo de
descarga por interacción. Además convierte el contrato en algo **verificado por herencia**, no
en una convención que cada chunk emitido tiene que reproducir bien.

**El `import` de la base es gratis, y es un requisito de empaquetado.** `FudicElement` debe
viajar en el **módulo de runtime que la página ya carga de inicio** (el capturador de SDD-17,
mismo paquete). Así, cuando un chunk se descarga en la primera interacción, su
`import { FudicElement }` resuelve contra un módulo **ya evaluado**: cero red adicional, cero
reevaluación. Si el empaquetado la dejara fuera del runtime inicial, cada chunk pagaría una
petición extra dentro del gesto y el ahorro de bytes se convertiría en un coste de INP.

**`FudicElement` no tiene lógica en `connectedCallback`.** Es la diferencia de fondo con la
clase homónima de SDD-14, que hacía allí todo el trabajo. No puede: **el componente no conoce
su `data-fud-id`** (§3.1, es identidad de página) y por tanto no puede leer su propio tramo del
payload. Es el runtime quien reparte los tramos, por tag, en el momento de definirlo
(`attachAll`, SDD-17 §4.4). `h` y `c` son **puntos de entrada que invoca alguien de fuera**,
no callbacks del ciclo de vida del navegador. El único callback real es
`disconnectedCallback` → `r()`, porque la baja sí la decide el navegador.

`$props` es siempre `[$dom, $shadow, ...valores]`: el adapter, el shadow root, y los valores
posicionales del estado detrás. El destructuring dentro del factory los reparte.

**La interfaz pública del controlador es exactamente `{c, h, u, r}`** — el conjunto de métodos
con **llamador externo**: `c` y `h` los enruta el punto de entrada de instancia según el
origen (§4.3); `u` lo llama quien posee el valor; `r` lo dispara el navegador vía
`disconnectedCallback`. Todo lo demás es privado.

**`$m` (mount), `$s` (subscription) y `$a` (apply) son closures privadas del factory**, no
propiedades del objeto devuelto, porque solo tienen llamadores internos. Exponerlas sería
ofrecer métodos que ningún consumidor externo debe invocar. Empiezan por `$` y eso no es
cosmética: el cuerpo de `@code { @client }` se copia **verbatim** a esa misma closure, así que
un nombre que el emit tome fuera de la reserva de §4.7 es un nombre que el autor no puede usar
([BUG-12](./bugs/BUG-12-sin-canal-de-update.md) §2.5).

**`u` (update) sí está en esta interfaz, y es `u` de VALOR**
([BUG-12](./bugs/BUG-12-sin-canal-de-update.md) §3.1). Por el shadow boundary cruza un
**valor**, nunca el objeto signal: lo dice la decisión 84 y lo hace estructural SDD-17 —el
tramo de props de una instancia hidratada viaja serializado en `fud-state`, y una signal es una
función con un `Set` vivo dentro—. Luego un hijo **no puede suscribirse** a lo que el padre
posee: la propiedad de la signal es del padre, el hijo recibe valores, y recibirlos otra vez es
una **llamada**. `u` toma el mismo array posicional que el payload, reasigna los bindings de
prop y llama a `$a()`, que es la única función que escribe un valor en un nodo. No crea nodos,
no monta y no vuelve a suscribir. `u` **con recomposición estructural** —`@if`, `@foreach`,
reconciliación, decisión existencial— sigue siendo de los renders de bloque (§4.6).

### 3.8. `Dom<N>` — dos métodos nuevos

El contrato de SDD-14 gana dos métodos, y con ellos se cierra el hueco de la primitiva
`event` (que tres documentos daban por existente y no existía en ningún paquete):

```ts
interface Dom<N> {
  // … construcción/mutación/shadow/adopción ya existentes …

  /** Suscribe `cb` a `type` en `node`. Devuelve la baja. No reordena ni envuelve `cb`. */
  event(node: N, type: string, cb: (ev: Event) => void): () => void;

  /** Suscribe `cb` al bus (§4.4). `host` es el contexto del handler. Devuelve la baja. */
  bus(host: N, name: string, cb: (ev: Event) => void): () => void;
}
```

- En `browserDom` son `addEventListener` reales (`bus` sobre `document`, §4.4).
- En `SsrDom` son **no-op que devuelven un disposer no-op**. Esto es lo que permite que
  `c()` corra idéntico en servidor y en cliente: el servidor fabrica y monta los nodos, y el
  enganche simplemente no hace nada. **Un controlador, dos adapters** — el espejo runtime de
  "un AST, dos ramas".

> **Desviación consciente respecto al documento refundido `SDD-eventos-captura-contexto`:**
> allí `event` era una función libre importada de `@fudic/core/dom`. Pasa a ser método del
> adapter. La semántica es idéntica (suscribe, no reordena, devuelve la baja con la
> referencia idéntica); lo que cambia es que un `import` libre habría atado el código emitido
> al navegador y habría obligado a un segundo emit para el SSR.

---

## 4. Comportamiento

### 4.1. Serialización del estado (rama servidor)

El estado de una instancia es un objeto; se serializa a array posicional con
`Object.values`, que descarta las claves preservando el orden de inserción:

```js
Object.values({ id: 1, name: 'Pedro' })      // → [1, 'Pedro']
```

**Regla de anidamiento (vía B, anidamiento literal).** `Object.values` opera sobre el primer
nivel. Un valor que sea a su vez objeto o array **viaja anidado con su forma tal cual**, sin
descender:

```js
Object.values({ id: 1, name: 'Pedro', bar: { id: 1 } })   // → [1, 'Pedro', { id: 1 }]
Object.values({ items: [{ id: 1 }, { id: 2 }] })          // → [ [ { id: 1 }, { id: 2 } ] ]
```

- Los objetos y arrays anidados conservan sus claves; no se desnudan en profundidad.
- JSON serializa el anidamiento de forma nativa: no hace falta serializador recursivo.
- Consecuencia asumida: en un array de objetos homogéneos las claves se repiten. A la escala
  de Fudic (decenas de N3 por página, payloads del orden de KB, y composición correcta que
  mantiene los N3 al mínimo) el coste es irrelevante y se prefiere no hornear un
  reconstructor recursivo. La vía A (descenso posicional en profundidad) queda fuera (§7).

**Construcción del `data` global.** La pasada de §3.2 concatena, en orden de `data-fud-id`,
`Object.values(estado_i)` de cada instancia, y registra en `offsets` la posición inicial de
cada tramo más un cierre final.

### 4.2. Deserialización (rama cliente)

El compilador hornea, desde el AST de props, el **destructuring** que reconstruye las
variables desde el array posicional. La forma la conoce el compilador; el runtime no infiere
nada:

```js
let [$dom, $shadow, $v1, $v2] = $props;
```

Los valores anidados salen del destructuring tal cual, sin trabajo adicional:

```js
let [$dom, $shadow, id, name, bar] = $props;   // bar === { id: 1 }
```

El destructuring es el simétrico exacto de `Object.values`: uno descarta claves dejando
orden, el otro reconstruye variables desde el orden. El mismo AST emite ambos extremos.

### 4.3. Los dos puntos de entrada de parámetros

Un componente N3 recibe sus parámetros en exactamente dos momentos, según de dónde nazca la
instancia. Ambos entran por el **mismo** `$props` y el **mismo** `static c($props)`;
difieren en el método invocado, en quién lo invoca y en el origen de los props. **Los dos los
implementa `FudicElement` una vez** (§3.7); el emit no los genera.

**Punto 1 — instancia venida de SSR (`h`).** El shadow ya está renderizado (DSD). El
controlador adopta los nodos existentes por **traversal posicional**
(`$shadow.children[i]`, `firstChild`, `nextSibling`) — nunca `querySelector`, nunca
`cloneNode`. Los props proceden del **payload** (`data.slice` por `data-fud-id`).

**Quién invoca `h`, y por qué no es el `connectedCallback`.** Lo invoca **el runtime**
(SDD-17 §4.4, `attachAll`), no el propio host. El componente **no conoce su `data-fud-id`** —
es identidad de página, no suya— así que no puede leer su propio tramo; y `customElements.define`
upgradea **todas** las instancias del tag de golpe, de modo que si el runtime repartiera el
tramo solo a la instancia sobre la que se hizo click, las demás quedarían upgradeadas pero
**sin enganchar**, y su primera interacción (camino 3, que por definición no descarga ni
repara) no haría nada. Por tanto el reparto es **por tag, en el momento de definirlo**, igual
que la preparación del subárbol. `connectedCallback` no enruta nada: solo el navegador lo
dispara, y en ese instante el tramo aún no ha llegado.

```js
// en FudicElement, no en el chunk del componente
h(props) {                    // invocado por el runtime: host.h(data.slice(...))
  this.#c = new.target.c([browserDom, this.shadowRoot, ...props]);
  this.#c.h();
}
```

`new.target.c(...)` —o `this.constructor.c(...)`— resuelve al `static c` de la subclase
emitida: la base invoca el factory del componente concreto sin conocerlo.

**Punto 2 — instancia creada en runtime (`c`).** No viene de SSR: la crea **el controlador
padre** al mutar un array que vive como su estado (p. ej. push de un 4º elemento a un array
de 3). Los props los **inyecta el padre en runtime**: esa instancia no existía en build,
luego no tiene entrada en el payload. Es la vía no serializada de paso de props. No hay
shadow que adoptar: el factory **fabrica** los nodos.

```js
// en FudicElement, no en el chunk del componente
c(props) {
  this.#c = new.target.c([browserDom, this.attachShadow({ mode: 'open' }), ...props]);
  this.#c.c();
}
```

**Punto 3 — la rama SSR** usa el mismo `static c`, con el adapter de servidor y **sin custom
element ni `FudicElement` de por medio** — en servidor no hay `HTMLElement`. El factory es
`static` precisamente para poder invocarse sin instancia; el árbol resultante lo serializa
`@fudic/ssr` (SDD-16):

```js
Componente.c([ssrDom, ssrShadow, ...valores]).c();
```

**Create e hydrate divergen en cómo obtienen los nodos y convergen en `s`.** Cuatro fases,
dos públicas y dos privadas:

- **`c` (create)** — fabrica los nodos (`$dom.el(...)`), sin ensamblar.
- **`m` (mount, privada)** — ensambla el árbol fabricado en el shadow.
- **`h` (hydrate)** — adopta los nodos ya montados por SSR mediante traversal posicional. No
  pasa por `m`: la estructura ya vino montada del servidor.
- **`s` (subscription, privada)** — una vez existen las referencias a los nodos, registra
  listeners y suscripciones. **Punto común de ambos caminos:** vive una sola vez y la
  invocan tanto create como hydrate, eliminando la duplicación del enganche.
- **`r` (remove)** — teardown simétrico.

```
c():  fabrica nodos  →  m() monta estructura  →  s() engancha listeners/suscripciones
h():  adopta nodos (traversal posicional)     →  s() engancha listeners/suscripciones
```

### 4.4. Bus de eventos: emisor y suscriptor

**Contexto.** El caso canónico es una lista de productos (`product-list`) y un carrito
(`shopping-cart`). El usuario pulsa "añadir" en un item; el carrito —que nunca toca—
acumula. Emisor y suscriptor **no se conocen**: uno emite al aire, el otro escucha un nombre.
Es un microfrontend con bus de eventos DOM.

**Detección en compilación (dos relaciones, dos fuentes).**

- **`escucha: evento → [tags]`** — del **parser HTML** (SDD-05/07). Cada `bus:nombre` en el
  template de un componente registra que ese tag escucha ese nombre. No requiere Oxc: el
  nombre está en el markup.
- **`emite: tag → [eventos]`** — del **walk de Oxc** (SDD-11/12). Cada llamada a `emit`
  importada de `@fudic/dom`, con primer argumento resoluble a literal, registra que ese tag
  emite ese evento.

La composición de ambas da `fud-bus` (§3.5): para cada evento `e`, todos los tags que lo
emiten dependen de todos los que lo escuchan.

**Resolución del nombre (SDD-12).** El nombre —en `emit(X, …)` y en `bus:X` / `bus:(X)`—
participa en hidratación dirigida **si y solo si `X` resuelve estáticamente a un string
literal**: literal directo, o referencia a `const` / objeto `as const` (local o importado)
resoluble siguiendo el binding hasta su declaración. Si `X` requiere cómputo (indexación
dinámica, template literal interpolado, retorno de llamada) **no es error**: el binding
funciona como listener DOM normal, pero el evento no participa en hidratación dirigida.
Postura permisiva: no protegemos lo que no podemos ver.

El **matching** emisor↔suscriptor es **por valor de string resuelto**, mecanismo único.
`bus:carrito` y `bus:(EVENTOS.carrito)` que resuelve a `'carrito'` producen la **misma**
entrada. No hay matching por identidad de símbolo. Consecuencia deseable: un junior con
literal y un senior con constante importada **convergen** en la misma entrada.

**El emisor.** El developer solo ve `emit(name, detail)`; el host **no** aparece en la firma.
El compilador lo inyecta reescribiendo `emit('x', d)` a `emit.call(host, 'x', d)`, de modo
que el host llega como `this`. Exponerlo filtraría un asunto del compilador al código de
usuario. `emit` fuerza `bubbles: true` y `composed: true`: el developer no gestiona
propagación ni cruce de shadow. `dispatchEvent` crudo sigue siendo válido DOM, pero **no
participa** en hidratación dirigida — el compilador no lo reconoce como emisión de bus.

**El suscriptor: `bus:` escucha en `document`, nunca en el host.** Hallazgo estructural
verificado: emisor y suscriptor son **hermanos**, no padre/hijo. Un `CustomEvent` que
burbujea desde el emisor sube por **sus** ancestros (`emisor → #app → body → document`) y
**nunca entra** en el suscriptor. Un listener sobre el host del suscriptor no dispararía
jamás. Por tanto `bus:carrito="@onCarrito($event)"` —la misma regla de §4.5: una invocación,
con `$event` y los datos que se le escriban— **desugariza en `s()`** a:

```js
$d.push($dom.bus($host, 'carrito', ($event) => onCarrito.call($host, $event)));
```

- El listener va sobre **`document`** (ancestro común garantizado de la página), no sobre el
  host — lo resuelve `browserDom.bus`.
- El **contexto** del handler es el host, para que `onCarrito` acceda a las signals de su
  instancia.
- Se registra en **`s()`** y se da de baja en **`r()`**, como cualquier otro enganche. Este
  es el punto que el documento refundido dejaba abierto: hablaba de `connectedCallback`, que
  en el modelo de closure no es donde vive el enganche, y no decía nada del teardown. Un
  `bus:` sin baja en `r()` es una fuga: el listener vive en `document`, sobrevive al host.

**`bus:` frente a `@evento` — distinción obligatoria.** `@carrito="@fn(ev)"` (event binding
de host, decisión 28) y `bus:carrito="@fn(ev)"` son **semánticamente opuestos** y el
compilador **no puede inferir cuál se quería** mirando el nombre: `@evento` pone el listener
en el **host** (correcto para eventos que nacen en el propio componente); `bus:evento` lo
pone en el **ancestro común de página** (para eventos que nacen en un emisor desacoplado).
Por eso la intención es **declarada por sintaxis, no inferida** (28.d), simétrico al `emit`
del emisor. `bus:` es prefijo de binding reservado, hermano de `class:`/`style:`
(decisión 22); no se interpreta como atributo con `:` literal (decisión 46, `xlink:href`).

> **Por qué `bus:` y no inferencia:** permite compilar el chunk del suscriptor **aislado**.
> Host-vs-document es un hecho de página, no de componente; inferirlo acoplaría la
> compilación de un componente a la composición de la página.

### 4.5. Event bindings: una invocación, con `$event` y datos

> **Reescrita el 2026-08-06 por decisión de Pedro** (decisiones de gramática 96–98, que revisan
> la 26). La versión anterior derivaba de la 26 una segunda forma —*factory*: una
> `CallExpression` invocada **al suscribir**, cuyo retorno era el listener— para ahorrar un frame
> por disparo, y a cambio obligaba a declarar el handler curried:
> `const del = (id) => (e) => {…}`. **Se retira.** El coste estaba en el sitio equivocado: el
> frame se mide con un profiler, la sintaxis la escribe el developer en cada línea. Y no existe:
> el patrón curried se ve como idioma de usuario en React, pero ningún framework lo hace su
> sintaxis de template. Los que atacan el mismo problema lo resuelven sin currificar —Angular y
> Vue con `$event` + argumentos, Solid con una tupla `[handler, data]`—.

**La regla, y es una sola:** lo que va a la derecha del `=` es una **invocación**, y se evalúa
**en el disparo**. `$event` es la variable que el compilador inyecta con el evento nativo; los
demás argumentos son datos del punto de uso. El handler se declara **plano**.

> **Lo que la 96 necesitaba del parser (decisión 99, 2026-08-08).** Una expresión implícita es
> *solo* un camino de propiedades y se corta en el `(` (decisiones 2/4/5), así que
> `@click="@del($event, item.id)"` llegaba al emit partido en dos —`del` más el texto literal
> `($event, item.id)`— con `FUD0092` y suscribiendo la referencia desnuda. La **99** admite un
> sufijo de llamada balanceado **en el valor de un `@evento` / `bus:`, y solo ahí**: es la 29
> aplicada, y en contenido `@total(x)` sigue significando lo que significa hoy.

```razor
@click="@del($event, item.id)"
```
```js
// usuario, en @code { @client } — una función normal
function del(ev, id) { ev.stopPropagation(); /* … */ }

// emitido en s()
$d.push($dom.event($n2, 'click', ($event) => del($event, item.id)));
```

Los cuatro casos que un developer se encuentra salen de la misma regla, sin aprender nada más:

| Quiere | Escribe | Declara |
|---|---|---|
| nada | `@click="@del()"` | `function del() {…}` |
| solo el evento | `@click="@del($event)"` | `function del(ev) {…}` |
| solo datos | `@click="@del(item.id)"` | `function del(id) {…}` |
| evento y datos | `@click="@del($event, item.id)"` | `function del(ev, id) {…}` |

El orden de los argumentos lo elige quien escribe el binding: `@del(item.id, $event)` es igual de
válido y llega como `(id, ev)`. No hay convención que memorizar porque no hay reordenamiento
implícito — el emit copia la lista tal cual.

**`$event` es del compilador** (decisión 97). Cae dentro de la reserva del prefijo `$` (§4.7):
el usuario no puede declarar identificadores que empiecen por `$`, así que no hay colisión
posible, y la sustitución es literal —el parámetro de la arrow emitida se llama `$event`—. Fuera
de la lista de argumentos de un event binding no significa nada especial.

**La referencia desnuda sigue valiendo** (decisión 98):

```razor
@click="@toggle"
```
```js
$d.push($dom.event($n2, 'click', toggle));   // sin envoltorio: un solo frame
```

Es el caso «no necesito datos del punto de uso», es lo que ya escribe `fixtures/app-button.fud`,
y es la única forma de un frame — pero **no cuesta nada al que la escribe**, que es la diferencia
con la factory retirada. Con paréntesis (`@toggle()`) es una invocación y entra en la regla de
arriba, igual que en Angular.

**Regla de distinción, por tipo de nodo AST** (lo que Oxc devuelve para el valor):

| Nodo AST del valor | Semántica | Emitido en `s()` | Frames |
|---|---|---|---|
| `Identifier` (`@click="@toggle"`) | **es** el listener | `$dom.event(n,'click',toggle)` | 1 |
| `CallExpression` (`@click="@del($event,x)"`) | invocación en el disparo | `$dom.event(n,'click', ($event) => del($event,x))` | 2 |
| `ArrowFunctionExpression` / `FunctionExpression` | **es** el listener | `$dom.event(n,'click', e => …)` | 2 |
| cualquier otra forma | — | **`FUD0291`** | — |

La lambda explícita (`@click="@(e => del(e, item.id))"`) **no se retira**: es JS válido en el
punto donde el compilador pega el binding y quitarla sería prohibir algo que funciona. Deja de
ser necesaria, que es distinto: `@del($event, item.id)` dice lo mismo con menos ceremonia.

**Nadie declara curried, y el compilador no lo premia.** Una `CallExpression` ya no se evalúa al
suscribir, luego una función que devuelve una función se comporta como se comportaría en JS
normal: se llama en el disparo y su retorno se descarta. Con eso desaparece el error más
probable de la sintaxis anterior —escribir `@del(item.id)` esperando que se llame en el click,
que era precisamente lo que **no** hacía— y desaparece también el contrato de usuario que el
compilador no podía validar.

**Sobre el frame.** Un event binding con datos cuesta dos frames por disparo: la arrow emitida no
hace trabajo útil, solo reordena. Es medible en eventos de ráfaga (`input`, `pointermove`) y en
un `@foreach` de miles de filas. Se acepta: la alternativa era una sintaxis que el developer paga
siempre, y la mejora que de verdad importa —no crear una closure por fila— es del render de
bloque ([SDD-30](./SDD-30-renders-de-bloque.md)), donde el handler vive en el `s()` de la fila y
se registra una vez por instancia, no por disparo.

**Interacción con el resto de la sintaxis.** Decisión 27 (sin modificadores de evento) intacta:
`preventDefault`/`stopPropagation` se llaman en el cuerpo, y ahora el developer tiene `$event`
para hacerlo sin ceremonia. Decisión 28 (cualquier nombre de evento) intacta: la regla vale para
custom events. Decisión 29 (`@` distingue por posición) intacta. En `@foreach`, la variable de
iteración está en scope donde el compilador pega el binding, y el argumento `item.id` se evalúa
en el disparo dentro de la closure de la fila.


### 4.6. Forma del factory emitido

El factory devuelve `{c, h, u, r}`. `$m`, `$s` y `$a` son funciones locales de la closure. Los
nodos vivos se capturan con `let`; los teardowns se acumulan en `$d`.

```js
static c($props) {
  let $n1, $n2;
  const $d = [];
  const $w = [];                                // lo último aplicado, por escritura
  let [$dom, $shadow, title, variant = 'default'] = $props;
  const click = (ev) => { /* … */ };

  // Privada: monta la estructura (ensambla nodos ya fabricados en el shadow).
  const $m = () => { $dom.append($shadow, $n1, $n2); };

  // Privada: engancha listeners/suscripciones una vez que hay referencias.
  // Punto común de create e hydrate; vive una sola vez.
  const $s = () => { $n2 && $d.push($dom.event($n2, 'click', click)); };

  // Privada: la ÚNICA función que escribe un valor en un nodo. La llaman c y u.
  const $a = () => {
    let $v;
    $v = String((title) ?? '');
    if ($v !== $w[0]) { $w[0] = $v; $dom.setText($n1, $v); }
  };

  return {
    c: () => {                                  // create: fabrica → aplica → monta → engancha
      $n1 = $dom.el('span');
      $n2 = $dom.el('button');
      $a();
      $m();
      $s();
    },
    h: () => {                                  // hydrate: adopta → engancha. SIN $a()
      $n1 = $shadow.children[0];
      $n2 = $shadow.children[1];
      $s();
    },
    u: ($p) => {                                // update: reasigna → reaplica
      [, , title, variant = 'default'] = $p;
      $a();
    },
    r: () => {                                  // remove: teardown simétrico
      $n1 = null; $n2 = null; $shadow = null;
      $d.forEach(d => d());
    },
  };
}
```

- **`$m` fabrica-vs-adopta:** solo `c` la llama; `h` no, porque la estructura vino montada.
- **`$s` compartida:** el enganche no se duplica entre caminos.
- **`$a` es el único sitio donde un valor llega a un nodo.** `c` y `u` convergen ahí, así que
  no pueden divergir, y eso se comprueba mirando el chunk. **`h` no la llama**: el servidor ya
  pintó esos valores, y reimprimirlos sería reescribir cada `textContent` del subárbol con el
  string que ya tiene, dentro del gesto donde se mide el INP, para no cambiar un byte. `h`
  **adopta posiciones**; el payload sigue siendo autoridad de estado.
- **`u` reasigna y reaplica; no reconstruye.** Los dos primeros huecos del patrón van vacíos
  —`$dom` y `$shadow` no se reasignan nunca— y los defaults se repiten, porque una
  actualización puede volver a traer `undefined`. Reaplica **todas** las props: son
  posicionales y el array llega entero.
- **`$w` es el filtro, y va por escritura.** El `Object.is` de la signal evita la *llamada*,
  no las escrituras; sin `$w`, un componente de diez props repintaría diez nodos cada vez que
  se mueve una signal. La comparación es de strings; lo que ahorra es una mutación del DOM.
- **`$d.push($dom.event(...))`** registra y recoge el teardown en una línea.
- **`$n2 && …`** — un nodo puede no existir (proyección de un `@if`, hijo condicional). El
  registro se guarda solo si el nodo está. El DOM es autoridad de posición.
- **`r()`** anula referencias vivas y dispara cada disposer. Simétrico a `c`/`h`.

**El lado del padre.** En el host de un componente hijo, `$s()` lleva el pase inicial y la
suscripción que renuevan el valor
([BUG-12](./bugs/BUG-12-sin-canal-de-update.md) §3.4). El array es el payload **entero** del
hijo, en el orden en que él destructura, porque su `u` reasigna todas las props que
destructura:

```js
$n6.u([, , "Hola", count.peek()]);                                  // valor inicial
$d.push(count.subscribe(($v) => { $n6.u([, , "Hola", $v]); }));     // cambios
```

Un valor que **no** es una signal no emite nada: cruzó una vez, ya está en el HTML que el
servidor pintó, y `const` es su semántica exacta (decisión 75).

> **Distinción de nivel (frontera con otro SDD).** Lo anterior es el caso N3: el hijo creado
> en runtime **es un web component** y `c` es su canal de props. Es **distinto** del caso en
> que el elemento iterado por un `@foreach` es N1 (una fila, una tarjeta sin estado): ahí no
> hay componente ni `c`, sino el `create` del **render del bloque `@foreach`**, que fabrica
> markup y lo cuelga — y es ahí, en los renders de bloque, donde `u` (update) tiene trabajo
> real: decisión existencial y propagación padre→hijo. Vive en los SDD de control de flujo y
> `@foreach`, fuera de este (§7).
>
> **Desde 2026-08-06 ese SDD existe: [SDD-30 — Renders de bloque](./SDD-30-renders-de-bloque.md)**,
> y va **antes** que los event bindings de este SDD. Un bloque es una función
> `($parent, $anchor, …deps)` con `{key, c, h, m, s, u, move, r}` propios; el `s()` de un bloque
> es donde se engancha lo que está dentro de un `@if` o de un `@foreach`.

### 4.7. Namespace `$` reservado del compilador

El cuerpo de `@code { @client }` se **copia textualmente** a la closure del factory,
conviviendo en el mismo scope léxico con las variables que el compilador genera (`$dom`,
`$shadow`, `$n1`, `$d`, `$w`, `$props`, `$m`, `$s`, `$a`, …). Para que no colisionen, **el
prefijo `$` queda reservado al código emitido**:

- **La reserva obliga TAMBIÉN al emit, y esa mitad es la que faltaba.** Las closures privadas
  del factory se llamaron `m` y `s` hasta
  [BUG-12](./bugs/BUG-12-sin-canal-de-update.md) §2.5, y son dos de los nombres de una letra
  más plausibles que existe: un `@client` con `const m = 2` producía un chunk con
  `SyntaxError: Identifier 'm' has already been declared` y **ningún diagnóstico** —el
  identificador del usuario era legal según la regla escrita, así que `FUD0290` tampoco lo
  habría cubierto—. Se arregló **no ocupando** nombres que son suyos: `$m`, `$s`, `$a`. Todo
  identificador que el emit introduzca en esa closure empieza por `$`, sin excepciones que
  recordar.
- **Regla:** ningún identificador **de usuario** en `@client` puede empezar por `$`. Aplica a
  **declaraciones** (`const`/`let`/`var`, parámetros, targets de destructuring, nombres de
  función/clase) **y a referencias libres** (usar `$shadow` sin declararlo = tocar una
  variable interna del framework). El **acceso a propiedad** ajeno (`obj.$bar`) queda fuera:
  no introduce ni resuelve un binding en el scope compartido. → **`FUD0290`**.
- **Prohibido como prefijo, no en cualquier posición.** `$foo` es error; `foo$`, `obs$` son
  válidos (el compilador solo emite `$` al inicio). Es la reserva mínima que garantiza
  no-colisión sin quitar al usuario patrones legítimos (observables estilo RxJS).
- **Validación sobre el AST de Oxc, no sobre texto.** Tras el parse del fragmento `@client`,
  se recorren los `Identifier` que sean bindings o referencias del usuario. No es lexing
  sobre string: evita falsos positivos en strings, comentarios o property names.
- **Batch y LSP.** El mismo análisis corre en el compilador batch y en el language server: el
  error aparece **mientras el usuario escribe**, con su span.
- Hermana de la decisión 22 (`bus:` como prefijo reservado): mismo patrón de reservar un
  prefijo para separar dos mundos.

### 4.8. Estilos: hoja compartida vía `<style type="module">` (SDD-18)

El `<style>` único del `<head>` del componente (decisión 76) se emite como **CSS module
script compartido**, según **SDD-18** —la forma de estilos de v1, con polyfill—. **No hay
vía inline.** El **specifier es el tag** del componente (SDD-18 D-1), sin prefijo ni namespace
inventado. El emit produce, en la pasada única de página (§3.2):

- un `<style type="module" specifier="<tag>">` en el `<head>` de la página, **una copia por
  tag** y **antes de cualquier `<template>`** (SDD-18 §3.2 regla 2 / D-2): el conjunto de hojas
  debe conocerse al emitir el `<head>`, por eso sale de la misma pasada que resuelve la
  composición;
- `shadowrootadoptedstylesheets="<tag>"` en cada `<template shadowrootmode>` (D-4). Lo emite el
  serializador de `@fudic/ssr` a partir del tag del host, **siempre** (forma estándar desde el
  día uno), de modo que el día que haya soporte nativo no se toca nada.

El **polyfill** (SDD-18 §5) es una pura _fallback_ con feature-detección: mientras no haya
soporte nativo, recorre los shadow hosts, toma el specifier del `tagName` y adopta la hoja; no
resuelve nada más. No hay `data-fud-css` ni marcador inventado.

- No se emite `<style host="tag">` ni marcador `host` de ningún tipo: retirado (§7).
- `<style>` / `<link rel="stylesheet">` escritos **dentro** de la template quedan inline en
  el shadow, sin elevar (decisión 77): es la vía de escape del autor, distinta de la hoja del
  host.

### 4.9. Whitespace: se colapsa a un espacio, no se elimina ningún nodo

Añadido por [BUG-07](./bugs/BUG-07-html-sin-minificar.md) §4.4/§4.5. Lo que el emit produce
sale ya minificado —no hay pasada posterior sobre el HTML generado, porque en el emit está
el AST y un minificador de texto tendría que adivinarlo—. Tres reglas, y la tercera es la
que hay que leer antes de tocar nada:

- **El esqueleto no lleva whitespace.** Entre el doctype, `<html>`, `<head>` y sus hijos no
  hay contexto donde un salto o un indent rendericen: el parser los descarta antes de
  construir el árbol. Y el polyfill de adopción de estilos (§4.8) se **incrusta minificado**
  —`polyfill.ts` conserva la constante legible; lo que se emite es `polyfill.min.ts`, que se
  genera con `scripts/minify-polyfill.ts` y se commitea, porque el minificador no puede
  entrar en el grafo de runtime del compilador—.
- **En el markup, toda tirada de whitespace se colapsa a UN espacio.** Es exactamente lo que
  el navegador iba a hacer bajo `white-space: normal`: render idéntico por construcción, no
  por heurística. `preserve` en `<pre>` y `<textarea>`, y en un componente cuyo propio
  `<style>` declare `white-space: pre*`, que el compilador **puede ver** porque el CSS está
  en el mismo fichero. El modo es una **pila** en el emisor de markup, no un lookup por
  nodo, porque `white-space` se hereda. Para el único caso indeducible —un ancestro de otro
  fichero que cruza el shadow boundary—, el atributo explícito `data-fud-space="preserve"`.
- **Ningún nodo de texto desaparece.** Es donde este emit se separa de todo minificador
  clásico, y a propósito: ellos borran el nodo de solo-whitespace entre dos elementos de
  **bloque**, y deciden qué es bloque con una lista fija de tags donde un custom element no
  está. Un tag desconocido es un custom element y su `display` por defecto es `inline`, así
  que en una página fudic esa heurística no falla en el caso raro, falla en el normal.
  Borrarlo cambiaría tres cosas observables —el contenido asignado a un `<slot>`, `:empty` y
  el espaciado inline entre componentes— y, medido, paga 0,4 % gzip sobre colapsar.

### 4.10. `componentCss` sale del AST, no del fuente

Añadido por [BUG-08](./bugs/BUG-08-css-verbatim.md). El cuerpo del `<style>` del componente
—el que §4.8 emite como hoja compartida y el que viaja dentro de `export const css`— se
construye recorriendo el `StyleNode` que el parser ya produjo, **no** con un
`source.slice(...)` del fichero. Era el único sitio del emit que volvía al texto fuente
teniendo el nodo delante, y le costaba al proyecto el whitespace entero del CSS en las tres
salidas: un minificador de JS no entra en el contenido de un template literal, por definición
del lenguaje, así que ese CSS no lo alcanzaba ninguna herramienta posterior.

El recorrido es completo por construcción —las partes tapizan el span sin huecos ni solapes
(`css/nodes.ts`)— y compacta **solo** las de tipo `CssText`: `RazorExpression`,
`AtEscapeNode` y `RazorCommentNode` salen verbatim. Las reglas de compactación y por qué no
se compacta nunca **entre** dos partes están en SDD-09 §4.6.

**La regla que queda para el futuro:** un `slice` del fuente dentro del emit es la señal de
que falta usar un nodo.

---

## 5. Invariantes LSP

- **Spans en todo.** Cada fragmento generado (destructuring, offsets, nodos, handlers) se
  mapea a su origen en el `.fud` vía la tabla de regiones (SDD-11) y `SourceMapBuilder`
  (SDD-13). Un error en el estado emitido debe poder navegarse de vuelta a la prop.
- **Determinismo.** Mismo AST ⇒ mismos `data-fud-id`, offsets, data, destructuring y mapas.
  Requisito para que SSR y cualquier regeneración coincidan.
- **El emit no lanza.** Ante un tipo de prop que no sepa serializar (`FUD0292`) o un binding
  no suscribible (`FUD0291`), emite diagnóstico con span y continúa; no aborta la página.
- **Diagnósticos en batch y LSP por igual.** La validación del prefijo `$` (§4.7) es análisis
  semántico sobre el AST de Oxc, con span, idéntica en compilador batch y language server.

### Catálogo de diagnósticos (`FUD0290`–`FUD0319`)

| Código | Regla |
|---|---|
| `FUD0290` | Identificador de usuario con prefijo `$` en `@client` (§4.7). |
| `FUD0291` | Valor de event binding cuyo nodo AST raíz no es `Identifier` / `Arrow` / `Function` / `Call` (§4.5). |
| `FUD0292` | Tipo de prop de estado no serializable a JSON (§4.1). |
| `FUD0293` | **RETIRADO.** Era el hueco en el manifest `tag → chunk`, y ese mapa ya no se emite (§3.6). No se reutiliza el código. |
| `FUD0294`–`FUD0319` | Reservados. |

---

## 6. Criterios de aceptación

**Estado y payload** (verificable en Node, sin navegador):

1. **Troceo por offset.** Dado `[[0,2,4,6,7,8],[1,"Pedro",2,"Claude",3,"Ada",true,false]]`,
   para cada `id ∈ [0..4]`, `data.slice(offsets[id], offsets[id+1])` produce exactamente
   `[1,"Pedro"]`, `[2,"Claude"]`, `[3,"Ada"]`, `[true]`, `[false]`.
2. **Offsets contiguos y completos.** `offsets[0] === 0`, `offsets[n] === data.length`, y
   `offsets` es monótono no decreciente: los tramos cubren `data` sin hueco ni solape.
3. **Serialización de primer nivel.** `Object.values({id:1,name:'Pedro'})` → `[1,'Pedro']`;
   anidado viaja con su forma: `Object.values({id:1,bar:{id:1}})` → `[1,{id:1}]`.
4. **Deserialización simétrica.** El destructuring recupera las variables en orden; un valor
   anidado sale tal cual (`bar === {id:1}`).
5. **`data-fud-id` base-0 correlativo.** El emit asigna `0,1,2,…` en pre-orden sobre las
   instancias N3 efectivas; el id indexa `offsets` sin tabla intermedia.
6. **Una sola pasada.** Alterar el árbol de composición y regenerar produce `data-fud-id`,
   `fud-state`, `fud-tree` y `fud-bus` mutuamente consistentes, sin paso de reconciliación.

**Controlador:**

7. **Equivalencia create ↔ hydrate, convergencia en `s`.** `c()` (fabrica → `m` → `s`) y
   `h()` (adopta → `s`) del mismo factory producen el mismo grafo de nodos vivos y el mismo
   listener funcional, difiriendo solo en cómo obtienen las referencias. El handler observa
   los mismos valores destructurados en ambos caminos.
8. **El chunk emitido solo lleva el factory.** El módulo de un componente contiene su
   `static c($props)` y el `define`, y **nada más**: ni `h(props)`, ni `c(props)`, ni
   `disconnectedCallback`, ni campo de controlador. Verificable sobre el texto emitido, y
   además por sustitución — cambiar el andamiaje en `FudicElement` cambia el comportamiento
   de todos los componentes sin recompilar ninguno.
9. **La base enruta al factory de la subclase.** Una subclase de `FudicElement` que declare
   su propio `static c` recibe en `h(props)`/`c(props)` el controlador de **su** factory, no
   el de la base ni el de otra subclase (resolución por `new.target`/`this.constructor`).
10. **Sin `connectedCallback`.** Conectar un host al DOM **no** construye el controlador ni
    engancha nada: hasta que el runtime llama a `h(props)` la instancia está inerte. Es lo
    que permite que `define` upgradee N instancias sin que ninguna se auto-arranque con un
    estado que todavía no tiene.
11. **Interfaz pública `{c, h, u, r}`.** El objeto devuelto expone exactamente `c`, `h`, `u` y
    `r`; `$m`, `$s` y `$a` no son propiedades. `u` es de valor: reasigna las props y llama a
    `$a()`, que es la única función que escribe un valor en un nodo — `c` la llama también, y
    `h` nunca ([BUG-12](./bugs/BUG-12-sin-canal-de-update.md) §6.3).
12. **Reparto del tramo por tag.** Con dos instancias del mismo tag y una sola interacción
    sobre la primera, **ambas** reciben su `h(props)` con su propio tramo. La segunda responde
    a su primer click sin descarga ni replay (camino 3 de SDD-17). Es el test que falla si el
    reparto se hace por instancia en vez de por tag.
13. **Teardown corta el listener.** Tras `r()`, el nodo no responde al evento y el listener de
    `bus:` deja de recibir: disposers ejecutados, referencias anuladas, cero fugas.
14. **Un controlador, dos adapters.** El mismo `static c` ejecutado con `SsrDom` produce un
    árbol que `renderToString` (SDD-16) serializa a HTML **byte-idéntico** al markup que el
    camino `h` del navegador adopta sin mover un nodo. `$dom.event`/`$dom.bus` son no-op en
    SSR y no aparecen en la salida.

**Eventos:**

15. **`$event` es el evento nativo.** En el disparo de `@click="@del($event, x)"`, lo que llega
    como primer argumento tiene el `type` y el `isTrusted` del evento real, y
    `preventDefault()`/`stopPropagation()` sobre él surten efecto.
16. **Los cuatro casos, con handler plano.** `@del()`, `@del($event)`, `@del(item.id)` y
    `@del($event, item.id)` llegan al cuerpo como `()`, `(ev)`, `(id)` y `(ev, id)`, con la
    función declarada **plana** en los cuatro. Ningún caso pide currificar.
17. **Captura por iteración sin bug de captura compartida.** En un `@foreach` de N filas cada
    handler recibe el valor de **su** fila, comprobado disparando en orden no secuencial.
18. **El orden de los argumentos es el escrito.** `@del(item.id, $event)` llega como
    `(id, ev)`: el emit copia la lista tal cual y no reordena.
19. **La invocación ocurre en el disparo, no al suscribir.** Un contador dentro de `del` no se
    incrementa al montar el componente y sí una vez por click. Es el criterio que distingue esta
    regla de la forma *factory* retirada, que hacía exactamente lo contrario.
20. **Distinción por AST.** `Identifier` → suscripción directa (un frame, sin envoltorio);
    `CallExpression` → arrow emitida que invoca en el disparo; `Arrow`/`Function` → suscripción
    directa. Cualquier otro nodo → `FUD0291`.
20.b. **`$event` fuera de un event binding no se sustituye.** Es un identificador libre como
    cualquier otro, y como empieza por `$` el usuario no puede declararlo (§4.7): no hay
    colisión posible.

**Bus:**

21. **`fud-bus` correcto y por valor.** Una página con `product-list` (que llama
    `emit('carrito', p)`) y `shopping-cart` (con `bus:carrito`) emite
    `{"product-list":["shopping-cart"]}`. Sustituir el literal del suscriptor por
    `bus:(EVENTOS.carrito)` con `EVENTOS` importado como `as const` produce la **misma**
    entrada.
22. **Nombre no resoluble no participa.** `bus:(EVENTOS[k])` con `k` variable no produce
    entrada en `fud-bus`, **no emite diagnóstico**, y sigue emitiendo el listener.
23. **`bus:` desugariza a `document`, con host como contexto, en `s()`.** El emitido llama a
    `$dom.bus($host, …)` y guarda el disposer en `$d`. Tras `r()`, el listener de `document`
    está retirado.
24. **`@evento` y `bus:evento` son distintos.** El mismo nombre en las dos formas produce
    enganches distintos (host vs `document`) y solo la segunda entra en `fud-bus`.

**Composición y chunks:**

25. **`fud-tree` por tag.** Una cadena `app-parent → app-child → app-grandchild` emite
    `{"app-parent":["app-child"],"app-child":["app-grandchild"]}`. Duplicar a 200 instancias
    de `app-child` **no cambia el mapa**.
26. **Solo N3 efectivo.** Un hijo N1/N2 puro no lleva `data-fud-id`, no aparece en `fud-tree`, ni
    tiene tramo en `fud-state`.
27. **La URL del chunk cierra sin mapa.** Para todo tag con alguna instancia `[data-fud-id]`
    en los HTML prerenderizados de un build, `createUrlResolver(base, build).hydrateUrl(tag)`
    apunta a un fichero que ese build escribió. Es el criterio anterior reescrito sin mapa:
    la garantía que importaba no era que el mapa estuviera completo, era que el fichero
    existiera. Y ninguna página publica un bloque `fud-chunks`.

**Hito de cierre:**

28. **Los cuatro fixtures compilan y corren.** `home.fud` + `app-card.fud` +
    `app-button.fud` + `app-badge.fud` producen página y chunks en su nivel inferido, se
    sirven por HTTP, y la primera interacción hidrata y surte efecto (con SDD-17 instalado).

---

## 7. Fuera de alcance

- **Runtime de captura, tres caminos, cascada, bus dirigido y warm.** Es **SDD-17**. Este SDD
  emite los mapas que aquél consume; no implementa hidratación.
- **`update` (`u`) con recomposición estructural** (`@if`, `@foreach`, reconciliación,
  decisión existencial). El `u` que sí está en la interfaz del controlador (§3.7) es **de
  valor**: reasigna los bindings de prop y reaplica las escrituras sobre nodos que ya existen.
  Crear, mover o destruir nodos sigue siendo de los renders de bloque:
  **[SDD-30](./SDD-30-renders-de-bloque.md)**, desde 2026-08-06. Un corolario práctico mientras
  aquél no aterrice: una escritura dentro de un `@foreach` se queda **fusionada** con la creación
  de su nodo, porque la variable del bucle solo guarda el último nodo del turno y no hay
  referencia estable que `$a` pueda reescribir. SDD-30 §4.5 lo cierra.
- **Creación de items N1 en `@foreach`** (fila/tarjeta sin estado por función de render, no
  web component). Distinto del `c` de un hijo N3 (§4.3); vive en
  [SDD-30](./SDD-30-renders-de-bloque.md).
- **Signals y suscripciones finas** (`s` con trabajo estructural). Este SDD fija la forma del
  factory y el punto de enganche; el detalle de la suscripción fina es del SDD de signals.
- **Output / callback hacia el padre.** Un callback no es serializable (`JSON.stringify` no
  captura cierres), luego no viaja en el payload. El caso desacoplado lo cubre el bus (§4.4);
  el caso prop-función queda pendiente de decisión.
- **Descenso a posicional en profundidad (vía A).** Desnudar objetos anidados y arrays
  homogéneos a escalares con un reconstructor recursivo horneado. Se prefiere la vía B
  (§4.1). Reconsiderable si aparece un caso con arrays largos donde los bytes de claves
  repetidas se midan como problema real.
- **El polyfill de estilos y el detalle interno de SDD-18.** SDD-15 §4.8 emite la *forma*
  estándar (`<style type="module" specifier="<tag>">` en `<head>` + `shadowrootadoptedstylesheets="<tag>"`
  en cada template; el specifier es el tag, sin marcadores inventados). El **polyfill de
  página** que adopta las hojas donde no hay soporte nativo, el particionado del CSS por tag y
  la feature detection son de **SDD-18** (paquete: emit + polyfill de página). Aquí solo se
  emite la forma estándar.
- **`<style host>` y su polyfill.** Retirados: eran una invención paralela a un estándar en
  curso. No se emite el marcador `host="tag"`, y `styles`/`StyleRegistry` sale de
  `@fudic/core`.
- **Delegación N2 (`delegate`, `data-fud-e`).** Retirada: el enganche es por instancia en
  `s()`. Si N2 vuelve como nivel con delegación propia, será un SDD que la reintroduzca con
  su marcador.
- **`@client(estrategia)` (decisiones 64/65).** Eliminada de la gramática v1: **un componente
  se coloca donde el consumidor quiera, y su código no puede declarar cuándo se hidrata** —
  es un hecho de página, no de componente. Con ella caen `defineLazy` y `data-fud-c`.
- **Troceo del payload en el Service Worker e inyección como literal JS** (evitando
  `JSON.parse` en cliente). Es contrato de red/SW; este SDD fija la forma `[[offsets],[data]]`
  que el SW trocearía, no el mecanismo de inyección.
- **Materialización del grafo raíz con identidad de referencias** (objetos compartidos entre
  componentes preservando `===`). Decisión pendiente de la convención `@server load() → data`.
  Aquí el estado es por instancia, sin compartición.
- **Reglas de paso de props padre→hijo:** cubiertas por el sistema de props (67–85). Este SDD
  emite la inyección; el orden que la hace posible lo garantiza SDD-17.
