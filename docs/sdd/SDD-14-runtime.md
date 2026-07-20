# SDD-14 — Runtime (`@fudic/dom` · `@fudic/ssr` · `@fudic/core`)

> **Estado:** `Hecho` (con recorte: ver la nota de retirada)
> **Depende de:** 00, 01
> **Decisiones de gramática:** 71–73 (identidad de nodos, cruce de estado, lifecycle del render)

> ### Nota de retirada (2026-07-19)
>
> Cuatro mecanismos que esta spec definía **quedan retirados del proyecto**. Su código
> salió de `@fudic/core` y sus secciones salieron de este documento:
>
> | Retirado | Sustituto | Dónde vive ahora |
> |---|---|---|
> | `FudicElement` (base de custom element N3) | controlador closure `{c, h, r}` emitido por componente, envuelto por una **`FudicElement` nueva** (misma casa, otra forma: enruta `h`/`c` desde fuera, sin `connectedCallback`) | **SDD-15 §3.7, §4.3, §4.6** |
> | `defineLazy` / `HydrationStrategy` (`@client(eager\|viewport\|interaction\|idle)`, decisión 74) | capturador global de hidratación | **SDD-17** (y SDD-17 §8 para lo eliminado de v1) |
> | `delegate` / `Delegate` (delegación N2 con `data-fud-e`) | enganche por instancia en `s()` del controlador | **SDD-15 §4.6** |
> | `styles` / `StyleRegistry` (`<style host="tag">`, decisiones 67–70) | `<style>` inline dentro de cada `<template shadowrootmode>` | **SDD-15 §4.8**; migración a `shadowrootadoptedstylesheets` en SDD-18 |
>
> Con ellos caen los marcadores `data-fud-c`, `data-fud-e` y el atributo `host="tag"` en la
> serialización: **el único marcador en el host es `data-id`** (SDD-15 §3.1). Lo que **sobrevive
> íntegro** —y es lo que este documento sigue especificando— es `Dom<N>` / `DomClient<N>`,
> `browserDom`, `SsrDom` + `renderToString`, `Cursor` / `cursorOf`, `signal` y el contrato
> `Render<N>` / `RenderFactory<N>` con su bootstrap `hydrateRoot` / `mountRoot`.
>
> `Render<N>` se conserva **como contrato de los renders de bloque** (`@if` / `@foreach`), que es
> el único sitio donde `update()` tiene trabajo real (SDD-15 §2, §4.6). El controlador de
> componente N3 **no** implementa `Render<N>` y no tiene `update`.

---

## 1. Contexto y objetivo

Todo lo especificado hasta aquí (05–13) es **frontend del compilador**: `.fud` → AST → validado
→ posiciones. El **emit** (SDD-15) recorrerá ese AST y producirá código. Pero *ese código llama a
un runtime*: los "render objects" de bloque (`create/hydrate/mount/update/remove`), `signal()`, la
adopción de nodos para hidratar, la construcción del DSD. **Ese runtime no
puede improvisarlo el emit**: si no está definido y probado, cualquier cosa que emitamos es
imaginar una API inexistente.

**SDD-14 es ese runtime, cerrado y completo.** No emite nada: **define el contrato contra el que
el emit escribe** y sus dos implementaciones. La idea central es el **espejo en runtime de "un
AST, dos ramas"**: la **construcción** se emite **una sola vez** contra el contrato base `Dom<N>`
y corre en dos adapters —

- **`browserDom`** — sobre la API DOM nativa (cliente: construye e hidrata nodos reales).
- **`SsrDom`** — sobre un árbol desacoplado que se serializa a HTML (build: SSR/SSG, cero DOM).

El mismo cuerpo de construcción, dado un adapter u otro, **construye DOM vivo** o **serializa
HTML**. Lo que **solo** vive en el navegador —hidratación y mutación reactiva de grano fino— no
ensucia ese contrato base: va en una interfaz aparte, `DomClient<N>`, que **solo `browserDom`
implementa** (segregación ISP: `SsrDom` no arrastra métodos que tendría que dejar lanzando). Con
esto, N1 = correr la construcción sobre `SsrDom`, serializar y enviar (cero JS de cliente); N2/N3
añaden comportamiento e hidratación sobre `browserDom`.

**Qué NO es.** No es un VDOM ni hace diffing: enmascara las **primitivas** del DOM, no la
**política**. La reactividad es de grano fino (una señal → escribe en su nodo por identidad, sin
reconciliar árbol).

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | TS estricto, Vitest, monorepo pnpm (permite crear `@fudic/dom`·`ssr`·`core`). |
| 01 | `Hecho` | `Diagnostic`/`errorDiag` (solo para diagnósticos de build del SSG; el runtime de cliente no los usa). |

```ts
import { type Diagnostic, errorDiag } from '@fudic/compiler'; // solo el SSG, en build
```

> **Independiente del parser.** El runtime **no** depende de 02–13: no ve el AST. El emit (SDD-15)
> es quien traduce AST → llamadas a este contrato. Por eso SDD-14 se testea aislado, con render
> objects escritos a mano que imitan lo que el emit producirá.

**Paquetes nuevos que crea esta spec** (previstos en CLAUDE.md, aún inexistentes):

| Paquete | Contenido | Entorno |
|---|---|---|
| `@fudic/dom` | `Dom<N>` (construcción), `DomClient<N>` (cliente), `browserDom`, `NS`, `Cursor` | cliente + tipos |
| `@fudic/ssr` | `SsrDom`, `renderToString` | build |
| `@fudic/core` | `signal`, `Render`/`RenderFactory`/`SsrBuild`, bootstrap (`hydrateRoot`/`mountRoot`) | cliente |

`@fudic/ssr` y `@fudic/core` dependen de `@fudic/dom` (el contrato). No hay ciclos.

---

## 3. Interfaz pública

Todo en inglés. Ubicaciones: `packages/dom/src/`, `packages/ssr/src/`, `packages/core/src/`.

### 3.1. `@fudic/dom` — el contrato

```ts
/** Namespaces resueltos aquí, una vez. */
export const NS = {
  html: 'http://www.w3.org/1999/xhtml',
  svg:  'http://www.w3.org/2000/svg',
  math: 'http://www.w3.org/1998/Math/MathML',
} as const;
export type Ns = keyof typeof NS;

/**
 * Contrato de **construcción** — genérico en `N` (tipo de nodo). Es lo único que `create()`
 * necesita, y lo único que **ambos** adapters implementan **por completo**. Browser: `N = Node`
 * (DOM vivo). SSR: `N = SsrNode` (árbol desacoplado → string). Sin traversal ni mutación
 * reactiva: por eso `SsrDom` lo implementa entero, **sin un solo método que lance** (ISP/LSP).
 * Enmascara primitivas, NO política. No hace diffing.
 */
export interface Dom<N> {
  element(tag: string, ns?: Ns): N;
  text(data: string): N;
  comment(data: string): N;
  setAttr(el: N, name: string, value: string): void;
  removeAttr(el: N, name: string): void;
  append(parent: N, child: N): void;
  /** `anchor.before(node)`: en browser dispara `connectedCallback`; en SSR fija el orden del árbol. */
  before(anchor: N, node: N): void;
  remove(node: N): void;
  /** Browser: `host.attachShadow({mode:'open'})`. SSR: abre `<template shadowrootmode="open">`. */
  attachShadow(host: N): N;
}

/**
 * Contrato de **cliente** — extiende el de construcción con lo que **solo existe en el
 * navegador**: mutación reactiva de grano fino (`setText`/`setProp`) y traversal para hidratar.
 * `SsrDom` **no** lo implementa (no hidrata, no muta en caliente) → no hay método que lanzar.
 * La segregación es estructural, no un runtime check.
 */
export interface DomClient<N> extends Dom<N> {
  /** Retoca el dato de un text/comment ya existente (el `update()` de grano fino). */
  setText(node: N, data: string): void;
  /** Propiedad JS (no atributo): props padre→hijo, `.value`, señales. */
  setProp(el: N, name: string, value: unknown): void;
  firstChild(node: N): N | null;
  nextSibling(node: N): N | null;
  previousSibling(node: N): N | null;
  childAt(node: N, index: number): N | null;
}

export const browserDom: DomClient<Node>;

/**
 * Cursor de hidratación sobre nodos existentes (browser). Formaliza el recorrido que hoy cada
 * `hydrate()` hace a mano. Envuelve las primitivas de adopción de un `Dom<N>`.
 */
export interface Cursor<N> {
  /** Nodo actual (o null al agotar los hermanos). */
  node(): N | null;
  /** Avanza al siguiente hermano. */
  next(): void;
  /** Desciende: nuevo cursor sobre los hijos del nodo actual. */
  enter(): Cursor<N>;
  /** Localiza (y deja como actual) el primer comentario-ancla con este dato; null si no está. */
  seekComment(data: string): N | null;
  /** Localiza el descendiente con `data-fud-b="<id>"` (identidad de nodo reactivo, decisión 71). */
  byBinding(id: string): N | null;
}

/** El cursor exige el contrato de cliente: la hidratación es browser-only por construcción. */
export function cursorOf(dom: DomClient<Node>, root: Node): Cursor<Node>;
```

### 3.2. `@fudic/ssr` — el adapter de build

```ts
import { type Dom, type Ns } from '@fudic/dom';

/** Nodo del árbol SSR desacoplado. Estado real; se serializa con `renderToString`. */
export interface SsrNode { /* opaco: tag/ns/attrs/props/children/kind, gestionado por SsrDom */ }

/**
 * Implementa **solo** `Dom<SsrNode>` (el contrato de construcción) construyendo un árbol
 * desacoplado, no un string incremental: así la MISMA lógica de construcción del emit corre
 * igual sobre browser y SSR. No implementa `DomClient`: en SSR no se hidrata ni se muta en
 * caliente, así que no hay traversal ni mutación reactiva que ofrecer — y por tanto ningún
 * método que lance. Las props padre→hijo las resuelve el SSG pasando valores al `ctx` del hijo,
 * no por propiedad de DOM; por eso `setProp` ni siquiera pertenece a este contrato.
 */
export class SsrDom implements Dom<SsrNode> {
  constructor();
  element(tag: string, ns?: Ns): SsrNode;
  text(data: string): SsrNode;
  comment(data: string): SsrNode;
  setAttr(el: SsrNode, name: string, value: string): void;
  removeAttr(el: SsrNode, name: string): void;
  append(parent: SsrNode, child: SsrNode): void;
  before(anchor: SsrNode, node: SsrNode): void;
  remove(node: SsrNode): void;
  attachShadow(host: SsrNode): SsrNode; // marca el host como DSD → template al serializar
}

/**
 * Serializa un árbol SSR a HTML. Reglas: void elements auto-cerrados; rawtext (`script`/`style`)
 * sin escapar; shadow → `<template shadowrootmode="open">` como primer hijo del host; escape por
 * contexto de texto y de atributo. **No emite ningún marcador `host="tag"`**: el mecanismo
 * `<style host>` está retirado y v1 deja el `<style>` inline dentro del shadow (SDD-15 §4.8).
 */
export function renderToString(root: SsrNode): string;
```

### 3.3. `@fudic/core` — reactividad, lifecycle de bloque, bootstrap

```ts
import { type Dom, type DomClient, type Cursor } from '@fudic/dom';

// ── Señal (decisión 72: rehidratación DOM-first) ──
export interface Signal<T> {
  (): T;                                   // lectura (v1: sin tracking automático)
  peek(): T;                               // lectura sin efectos
  set(v: T): void;                         // escritura; notifica solo si `v !== valor` (Object.is)
  subscribe(fn: (v: T) => void): () => void; // devuelve unsubscribe
}
export function signal<T>(initial: T): Signal<T>;

// ── Construcción SSR (build): solo el contrato base `Dom<N>`, sin lifecycle de cliente ──
/** Construye el árbol inicial de un bloque/componente. Es la mitad que comparte con `create()`. */
export type SsrBuild<N> = (dom: Dom<N>, ctx: unknown, target: N) => void;

// ── Contrato del render object de CLIENTE (lo que el emit produce por BLOQUE: @if / @foreach) ──
/**
 * `N` = tipo de nodo. Toda la vida del render es browser-only y usa `DomClient<N>`. `create()`
 * reutiliza la misma lógica de construcción que `SsrBuild` (el contrato base es un subconjunto),
 * pero el render añade hidratación y reactividad, que solo el navegador ofrece.
 *
 * Es el contrato de los **renders de bloque**: el único sitio donde `update()` tiene trabajo real
 * (decisión existencial y propagación padre→hijo). Un componente N3 NO lo implementa: se emite
 * como controlador closure `{c, h, r}` sin `update` (SDD-15 §3.7).
 */
export interface Render<N> {
  create(): void;                 // montaje en frío: construye nodos y los ancla al target
  hydrate(cursor: Cursor<N>): void; // adopta los nodos que el SSR ya mandó
  mount(): void;                  // abre suscripciones / comportamiento
  update(): void;                 // reevaluación reactiva de grano fino
  remove(): void;                 // baja simétrica: unsubscribe + detach
}
export type RenderFactory<N> = (dom: DomClient<N>, ctx: unknown, target: N) => Render<N>;

// ── Bootstrap del render raíz (bloques de página que no son custom elements) ──
export function hydrateRoot(factory: RenderFactory<Node>, ctx: unknown, target: Node): Render<Node>;
export function mountRoot(factory: RenderFactory<Node>, ctx: unknown, target: Node): Render<Node>;
```

---

## 4. Comportamiento

### 4.1. El contrato es la única frontera (DIP)

El emit escribe la construcción contra `Dom<N>` y la vida reactiva contra `DomClient<N>`.
**Nunca** toca `document` ni `SsrNode` directamente. Elegir `browserDom` (que es `DomClient`) vs
`SsrDom` (solo `Dom`) es lo único que cambia entre cliente y build. Esto hace la construcción
**isomórfica** y testeable con un adapter falso. La frontera de tipos garantiza que el código de
build no puede, ni por error, invocar hidratación o mutación reactiva: `SsrDom` no las tiene.

### 4.2. `browserDom` — DOM vivo (implementa `DomClient<Node>`)

Envoltorio directo (decisión 13 del prototipo, *idea* no código): `element` usa
`createElement`/`createElementNS` según `ns`; `setProp` hace `(el as any)[name] = value`;
`setText` hace `(node as CharacterData).data = data`; `before` usa `ChildNode.before` (dispara
`connectedCallback` de custom elements anidados); `attachShadow` devuelve
`host.attachShadow({mode:'open'})` o el `host.shadowRoot` preexistente (idempotente). La adopción
mapea a `firstChild`/`nextSibling`/`previousSibling`/`childNodes[i]`. Es el único adapter que
implementa el contrato de cliente completo.

### 4.3. `SsrDom` + `renderToString` — árbol desacoplado, luego serializa

**Modelo de árbol, no de string incremental.** `element()` crea un `SsrNode` desacoplado;
`setAttr`/`append`/`before`/`remove` mutan el árbol como en el DOM. Esto elimina el problema de
"cerrar el `<tag` antes de escribir hijos": el orden lo da la serialización final, no el orden de
llamadas. Por eso `before` **sí** funciona en SSR (a diferencia del boceto), y la construcción del
emit no necesita ramas por entorno. `SsrDom` implementa **solo** `Dom<SsrNode>`: no tiene
traversal ni mutación reactiva (viven en `DomClient`, que no implementa), así que **ningún método
lanza** — la imposibilidad de hidratar en SSR es una propiedad del tipo, no un `throw` en runtime.

`renderToString(root)` recorre el árbol y emite:
- **Void elements** (`area base br col embed hr img input link meta param source track wbr`):
  sin cierre ni hijos.
- **Rawtext** (`script`, `style`): contenido **sin escapar**.
- **Shadow** (nodo marcado por `attachShadow`): `<template shadowrootmode="open">…</template>`
  como primer hijo del host. **Sin marcador `host="tag"`** ni elevación de hoja al `<head>`: el
  `<style>` del componente queda inline dentro del template (SDD-15 §4.8). El serializador no
  tiene caso especial de estilos.
- **Escape**: texto → `& < >`; valor de atributo → `& "`; comentario → se rechaza `-->` interno.

`SsrDom` no implementa `DomClient`: no ofrece `setProp`/`setText` (las props padre→hijo las
resuelve el SSG vía `ctx`, no por propiedad de DOM) ni traversal (en SSR no se hidrata). No hay
nada que lanzar; la ausencia es de tipo.

### 4.4. `signal` — reactividad de grano fino

`signal(v)` guarda `v` y un `Set` de suscriptores. `set(x)` no hace nada si `Object.is(x, v)`; si
cambia, actualiza y notifica a cada suscriptor (Set vivo → baja inmediata en `unsubscribe`).
`peek()` lee sin efectos. La lectura por llamada `s()` en v1 **no** hace tracking automático
(igual que los ejemplos, que suscriben explícitamente); el tracking por effect queda para futuro y
no cambia esta firma. La rehidratación es **DOM-first** (decisión 72): la señal se reconstruye
leyendo el texto ya pintado, no de un blob paralelo; solo el estado no-reconstruible viaja en
`data-fud-s` (lo produce el emit, lo lee el `ctx`).

### 4.5. `Render<N>` — el patrón de los ejemplos, formalizado

Cada render object de bloque **posee solo su nodo** y su baja. Cinco fases:

| Fase | Entorno | Qué hace |
|---|---|---|
| `create()` | browser + **SSR** | construye nodos vía `dom` y los ancla al target |
| `hydrate(cursor)` | browser | adopta los nodos que el SSR ya mandó (por posición/identidad) |
| `mount()` | browser | abre suscripciones (grano fino) y comportamiento |
| `update()` | browser | reevalúa la parte reactiva; escribe solo en su nodo, sin diffing |
| `remove()` | browser | `unsubscribe` + `detach`, simétrico a `create/mount` |

Los bloques que **no** son custom elements arrancan por `hydrateRoot` / `mountRoot`
(§3.3): construyen el render sobre el DOM vivo con `browserDom` y corren el camino que toca —
`hydrate(cursorOf(browserDom, target))` + `mount()` sobre markup ya pintado por el SSR, o
`create()` + `mount()` en frío. Es un bootstrap independiente de cualquier clase base: la
identidad de componente la lleva el custom element que emite SDD-15, con su controlador `{c,h,r}`.

### 4.6. Códigos `FUD`

SDD-14 reserva **`FUD0230`–`FUD0259`**. El runtime de **cliente** no emite diagnósticos (es
comportamiento, no análisis: falla o no falla, y nunca lanza en camino feliz). El **SSG** (build)
podrá emitir aquí diagnósticos de serialización en specs posteriores; en v1 el rango queda
**reservado y vacío**, como el de SDD-13.

---

## 5. Invariantes de runtime

- **Una construcción, dos adapters.** La construcción se escribe una vez contra `Dom<N>`;
  `browserDom` y `SsrDom` son las dos ramas. Ninguna rama toca la otra.
- **Interfaces segregadas (ISP/LSP).** `Dom<N>` es el contrato que ambos cumplen entero;
  `DomClient<N>` (traversal + mutación reactiva) solo lo implementa el navegador. Ningún adapter
  implementa un método que lance: lo que un entorno no puede hacer, sencillamente no está en su
  contrato.
- **Sin diffing.** Grano fino: una señal escribe en su nodo por identidad (`data-fud-b`). No hay
  VDOM ni reconciliación de árbol.
- **Baja simétrica.** Todo `create/mount` tiene su `remove` inverso; ningún suscriptor queda vivo
  tras `remove()`.
- **SSR no hidrata.** `SsrDom` implementa solo `Dom<SsrNode>`; la adopción vive en `DomClient`,
  que no implementa. No hay `throw`: la imposibilidad es estructural (de tipo). El SSR solo
  construye y serializa.
- **DOM-first.** El estado se rehidrata leyendo el markup pintado; `data-fud-s` es solo el residuo
  no-reconstruible.
- **Nunca lanza en camino feliz.** El runtime no propaga excepciones por input normal. Y no hay
  "camino infeliz por interfaz mal implementada": la segregación `Dom`/`DomClient` elimina los
  métodos-que-lanzan del boceto original.

---

## 6. Criterios de aceptación

El SDD está `Hecho` cuando `pnpm typecheck` pasa y estos tests verdes (entorno DOM: Vitest con
`happy-dom`/`jsdom`; para DSD e hidratación, `setHTMLUnsafe`/parsing de `<template shadowrootmode>`
o modo browser):

1. **Typecheck.** Los tres paquetes con §3 definido y reexportado; sin ciclos (`ssr`/`core` → `dom`).

2. **`browserDom` construye.** `element('div')` + `append(text('x'))` produce un `<div>x</div>` en
   el DOM; `setText(t, 'y')` lo cambia a `y`; `attachShadow(host)` devuelve un `ShadowRoot` abierto.

3. **`SsrDom` + `renderToString` serializa exacto.** Un árbol `div > [ 'a<b', img, style('.x{}') ]`
   → `<div>a&lt;b<img><style>.x{}</style></div>` (void sin cierre; rawtext sin escapar; texto
   escapado). Un host con `attachShadow` → `<host><template shadowrootmode="open">…</template></host>`.

4. **`before` real en SSR + segregación.** Sobre un árbol, `before(anchor, node)` inserta `node`
   antes de `anchor` y `renderToString` lo refleja en ese orden. A nivel de **tipo**: `SsrDom`
   satisface `Dom<SsrNode>` pero **no** `DomClient<SsrNode>` (test de compilación con
   `expectTypeOf`/`@ts-expect-error`); una función que exija `DomClient` no acepta `SsrDom`. No
   hay ningún método que lance.

5. **Isomorfismo.** El **mismo** cuerpo `create(dom, target)` corrido con `browserDom` (contra un
   contenedor) y con `SsrDom` produce estructuras equivalentes: el `innerHTML` del contenedor
   browser === `renderToString` del árbol SSR (módulo detalles de serialización de void/DSD).

6. **`signal`.** `subscribe` se dispara en `set(v')` con `v'` distinto; **no** se dispara si
   `Object.is(v', v)`; el `unsubscribe` devuelto corta la baja. `peek()` no notifica.

7. **`mountRoot` en frío.** Sobre un target vacío, construye el render, corre `create()` y luego
   `mount()`, en ese orden, y devuelve el render.

8. **`hydrateRoot` adopta.** Sobre un target con markup ya pintado por el SSR, corre
   `hydrate(cursor)` (no `create()`) y después `mount()`; el cursor recibido recorre los hijos
   existentes. `remove()` deja cero suscriptores.

9. **`Cursor`.** Sobre un shadow hidratado, `cursorOf(browserDom, root).seekComment('fud:if')`
   localiza el ancla y `byBinding('count')` localiza el `[data-fud-b="count"]`.

10. **Sin marcadores retirados en la salida.** `renderToString` de un host con shadow no emite
    `host="tag"`, `data-fud-c` ni `data-fud-e` en ningún punto.

11. **Cobertura.** Cerca del 100 % en `@fudic/dom` (contrato/adapters) y en `signal`; el bootstrap
    según el suelo del SDD-00 (80/80/75), por depender del entorno DOM.

---

## 7. Fuera de alcance

- **El emit** (AST → llamadas a este contrato, generación de los render objects, SSG, source maps):
  **SDD-15**. SDD-14 solo define el contrato y sus adapters; los render objects de los tests se
  escriben a mano.
- **Inferencia de nivel** (decidir N1/N2/N3 desde el AST): **SDD-15** (el emit). El runtime provee
  las piezas de cada nivel, no clasifica.
- **Tracking automático de señales** (effects que se resuscriben por lectura): futuro; v1 suscribe
  explícito. La firma de `Signal<T>` ya lo admite.
- **Reconciliación con keys de listas** (`@foreach` con reordenado eficiente): el contrato
  (`before`/`remove`/identidad) lo habilita, pero la política de reconciliación la fija el emit del
  `@foreach` en SDD-15.
- **Bundling / tree-shaking**: build tooling, posterior.
- **El artefacto de componente N3.** El controlador closure `{c, h, r}`, sus puntos de entrada y su
  enganche en `s()`: **SDD-15 §3.7, §4.3, §4.5, §4.6**. Ya no hay clase base en core.
- **La hidratación como política** (cuándo y en qué orden se levanta cada instancia, captura global
  de eventos, cascada de composición, bus dirigido, warm): **SDD-17**. Las estrategias
  `@client(eager|viewport|interaction|idle)` y `defineLazy` están eliminadas de v1 (SDD-17 §8).
- **Estilos de componente.** v1 los emite inline en el shadow (SDD-15 §4.8); la migración a
  `shadowrootadoptedstylesheets` + import map es **SDD-18**. `<style host>` y su polyfill quedan
  retirados.
- **Delegación de eventos.** Retirada con N2; si vuelve, será con su propio SDD y su propio
  marcador. El enganche de v1 es por instancia en el `s()` del controlador (SDD-15 §4.6).
