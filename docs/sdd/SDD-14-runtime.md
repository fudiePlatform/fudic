# SDD-14 — Runtime (`@fudic/dom` · `@fudic/ssr` · `@fudic/core`)

> **Estado:** `Listo`
> **Depende de:** 00, 01
> **Decisiones de gramática:** 67–74 (`<style host>`, identidad de nodos, cruce de estado, hidratación)

---

## 1. Contexto y objetivo

Todo lo especificado hasta aquí (05–13) es **frontend del compilador**: `.fud` → AST → validado
→ posiciones. El **emit** (SDD-15) recorrerá ese AST y producirá código. Pero *ese código llama a
un runtime*: los "render objects" (`create/hydrate/mount/update/remove`), `signal()`, la
delegación de eventos, la adopción de `<style host>`, la construcción del DSD. **Ese runtime no
puede improvisarlo el emit**: si no está definido y probado, cualquier cosa que emitamos es
imaginar una API inexistente.

**SDD-14 es ese runtime, cerrado y completo.** No emite nada: **define el contrato contra el que
el emit escribe** y sus dos implementaciones. La idea central es el **espejo en runtime de "un
AST, dos ramas"**: el render se emite **una sola vez** contra un contrato `Dom<N>` y corre en dos
adapters —

- **`browserDom`** — sobre la API DOM nativa (cliente: construye e hidrata nodos reales).
- **`SsrDom`** — sobre un árbol desacoplado que se serializa a HTML (build: SSR/SSG, cero DOM).

El mismo cuerpo de `create()`, dado un adapter u otro, **construye DOM vivo** o **serializa HTML**.
`hydrate/mount/update/remove` son **solo de cliente**. Con esto, N1 = correr `create()` sobre
`SsrDom`, serializar y enviar (cero JS de cliente); N2/N3 añaden comportamiento e hidratación sobre
`browserDom`.

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
| `@fudic/dom` | `Dom<N>`, `browserDom`, `NS`, `Cursor` | cliente + tipos |
| `@fudic/ssr` | `SsrDom`, `renderToString` | build |
| `@fudic/core` | `signal`, `Render`, `FudicElement`, `delegate`, `styles`, scheduler, bootstrap | cliente |

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
 * Fina indirección sobre las primitivas del DOM, genérica en `N` (tipo de nodo).
 * Browser: `N = Node` (DOM real). SSR: `N = SsrNode` (árbol desacoplado → string).
 * Enmascara primitivas, NO política. No hace diffing.
 */
export interface Dom<N> {
  // ── construcción (browser: DOM vivo · SSR: árbol) ──
  element(tag: string, ns?: Ns): N;
  text(data: string): N;
  comment(data: string): N;

  // ── mutación ──
  setAttr(el: N, name: string, value: string): void;
  removeAttr(el: N, name: string): void;
  /** Propiedad JS (no atributo): props padre→hijo, `.value`, señales. Browser real; SSR no-op. */
  setProp(el: N, name: string, value: unknown): void;
  /** Retoca el dato de un text/comment ya existente (el `update()` de grano fino). */
  setText(node: N, data: string): void;
  append(parent: N, child: N): void;
  /** `anchor.before(node)`: en browser dispara `connectedCallback`. */
  before(anchor: N, node: N): void;
  remove(node: N): void;

  // ── shadow / DSD ──
  /** Browser: `host.attachShadow({mode:'open'})`. SSR: abre `<template shadowrootmode="open">`. */
  attachShadow(host: N): N;

  // ── adopción / traversal (SOLO browser; en SSR estos métodos lanzan) ──
  firstChild(node: N): N | null;
  nextSibling(node: N): N | null;
  previousSibling(node: N): N | null;
  childAt(node: N, index: number): N | null;
}

export const browserDom: Dom<Node>;

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

export function cursorOf(dom: Dom<Node>, root: Node): Cursor<Node>;
```

### 3.2. `@fudic/ssr` — el adapter de build

```ts
import { type Dom, type Ns } from '@fudic/dom';

/** Nodo del árbol SSR desacoplado. Estado real; se serializa con `renderToString`. */
export interface SsrNode { /* opaco: tag/ns/attrs/props/children/kind, gestionado por SsrDom */ }

/**
 * Implementa `Dom<SsrNode>` construyendo un árbol desacoplado (no un string incremental): así el
 * MISMO `create()` del emit corre igual sobre browser y SSR. La adopción no existe en SSR: sus
 * métodos lanzan. `setProp` es no-op (las props padre→hijo las resuelve el SSG pasando valores al
 * `ctx` del hijo, no por propiedad de DOM).
 */
export class SsrDom implements Dom<SsrNode> {
  constructor();
  element(tag: string, ns?: Ns): SsrNode;
  text(data: string): SsrNode;
  comment(data: string): SsrNode;
  setAttr(el: SsrNode, name: string, value: string): void;
  removeAttr(el: SsrNode, name: string): void;
  setProp(el: SsrNode, name: string, value: unknown): void; // no-op
  setText(node: SsrNode, data: string): void;
  append(parent: SsrNode, child: SsrNode): void;
  before(anchor: SsrNode, node: SsrNode): void;
  remove(node: SsrNode): void;
  attachShadow(host: SsrNode): SsrNode; // marca el host como DSD → template al serializar
  firstChild(): never;   // SSR no hidrata
  nextSibling(): never;
  previousSibling(): never;
  childAt(): never;
}

/**
 * Serializa un árbol SSR a HTML. Reglas: void elements auto-cerrados; rawtext (`script`/`style`)
 * sin escapar; shadow → `<template shadowrootmode="open">`; `<style host>` inline dentro del
 * template (adopción por referencia no se expresa en HTML estático); escape por contexto de texto
 * y de atributo.
 */
export function renderToString(root: SsrNode): string;
```

### 3.3. `@fudic/core` — reactividad, lifecycle, delegación, estilos

```ts
import { type Dom, type Cursor } from '@fudic/dom';

// ── Señal (decisión 72: rehidratación DOM-first) ──
export interface Signal<T> {
  (): T;                                   // lectura (v1: sin tracking automático)
  peek(): T;                               // lectura sin efectos
  set(v: T): void;                         // escritura; notifica solo si `v !== valor` (Object.is)
  subscribe(fn: (v: T) => void): () => void; // devuelve unsubscribe
}
export function signal<T>(initial: T): Signal<T>;

// ── Contrato del render object (lo que el emit produce por bloque/componente) ──
/** `N` = tipo de nodo del adapter. `create` corre en ambos entornos; el resto, solo browser. */
export interface Render<N> {
  create(): void;                 // montaje en frío: construye nodos y los ancla al target
  hydrate(cursor: Cursor<N>): void; // adopta los nodos que el SSR ya mandó (browser)
  mount(): void;                  // abre suscripciones / comportamiento (browser)
  update(): void;                 // reevaluación reactiva de grano fino (browser)
  remove(): void;                 // baja simétrica: unsubscribe + detach (browser)
}
export type RenderFactory<N> = (dom: Dom<N>, ctx: unknown, target: N) => Render<N>;

// ── Base del custom element N3 (browser). Posee el ESTADO; delega en el Render. ──
export abstract class FudicElement extends HTMLElement {
  /** El emit implementa esto: crea el Render sobre el shadow root ya resuelto. */
  protected abstract render(dom: Dom<Node>, root: ShadowRoot): Render<Node>;
  connectedCallback(): void;      // adopta shadow SSR o lo crea; hydrate|create; mount
  disconnectedCallback(): void;   // remove
}

// ── Delegación de eventos N2 (decisión: un solo listener por tipo y raíz) ──
export interface Delegate {
  /** Registra el handler para `data-fud-e="<handlerId>"`. */
  on(handlerId: string, fn: (e: Event, el: Element) => void): void;
  /** Instala UN listener por `type` sobre `root` (document en light DOM). Idempotente. */
  connect(root: Document | ShadowRoot, type: string): void;
}
export const delegate: Delegate;

// ── Registro de `<style host>` (decisiones 67–70): hoja única adoptada por referencia ──
export interface StyleRegistry {
  define(id: string, cssText: string): void;    // construye el CSSStyleSheet una vez
  adopt(root: ShadowRoot, id: string): void;     // root.adoptedStyleSheets += sheet (misma ref, N veces)
}
export const styles: StyleRegistry;

// ── Bootstrap del render raíz (bloques de página que no son custom elements) ──
export function hydrateRoot(factory: RenderFactory<Node>, ctx: unknown, target: Node): Render<Node>;
export function mountRoot(factory: RenderFactory<Node>, ctx: unknown, target: Node): Render<Node>;

// ── Scheduler de hidratación (decisión 74) ──
export type HydrationStrategy = 'eager' | 'viewport' | 'interaction' | 'idle';
/** Difiere `customElements.define(tag, ctor)` según la estrategia. Default `interaction`. */
export function defineLazy(tag: string, ctor: CustomElementConstructor, strategy?: HydrationStrategy): void;
```

---

## 4. Comportamiento

### 4.1. El contrato es la única frontera (DIP)

El emit escribe render objects genéricos en `N` contra `Dom<N>`. **Nunca** toca `document` ni
`SsrNode` directamente. Elegir `browserDom` vs `SsrDom` es lo único que cambia entre cliente y
build. Esto hace el emit **isomórfico** y testeable con un adapter falso.

### 4.2. `browserDom` — DOM vivo

Envoltorio directo (decisión 13 del prototipo, *idea* no código): `element` usa
`createElement`/`createElementNS` según `ns`; `setProp` hace `(el as any)[name] = value`;
`setText` hace `(node as CharacterData).data = data`; `before` usa `ChildNode.before` (dispara
`connectedCallback` de custom elements anidados); `attachShadow` devuelve
`host.attachShadow({mode:'open'})` o el `host.shadowRoot` preexistente (idempotente). La adopción
mapea a `firstChild`/`nextSibling`/`previousSibling`/`childNodes[i]`.

### 4.3. `SsrDom` + `renderToString` — árbol desacoplado, luego serializa

**Modelo de árbol, no de string incremental.** `element()` crea un `SsrNode` desacoplado;
`setAttr`/`append`/`before`/`remove` mutan el árbol como en el DOM. Esto elimina el problema de
"cerrar el `<tag` antes de escribir hijos": el orden lo da la serialización final, no el orden de
llamadas. Por eso `before` **sí** funciona en SSR (a diferencia del boceto), y el mismo `create()`
del emit no necesita ramas por entorno.

`renderToString(root)` recorre el árbol y emite:
- **Void elements** (`area base br col embed hr img input link meta param source track wbr`):
  sin cierre ni hijos.
- **Rawtext** (`script`, `style`): contenido **sin escapar**.
- **Shadow** (nodo marcado por `attachShadow`): `<template shadowrootmode="open">…</template>`
  como primer hijo del host.
- **`<style host>`**: su hoja se emite **inline** como `<style>…</style>` dentro del template (en
  HTML estático no hay adopción por referencia; en cliente, `styles.adopt` la deduplica).
- **Escape**: texto → `& < >`; valor de atributo → `& "`; comentario → se rechaza `-->` interno.

`setProp` es no-op (§3.2). La adopción lanza: en SSR no se hidrata.

### 4.4. `signal` — reactividad de grano fino

`signal(v)` guarda `v` y un `Set` de suscriptores. `set(x)` no hace nada si `Object.is(x, v)`; si
cambia, actualiza y notifica a cada suscriptor (Set vivo → baja inmediata en `unsubscribe`).
`peek()` lee sin efectos. La lectura por llamada `s()` en v1 **no** hace tracking automático
(igual que los ejemplos, que suscriben explícitamente); el tracking por effect queda para futuro y
no cambia esta firma. La rehidratación es **DOM-first** (decisión 72): la señal se reconstruye
leyendo el texto ya pintado, no de un blob paralelo; solo el estado no-reconstruible viaja en
`data-fud-s` (lo produce el emit, lo lee el `ctx`).

### 4.5. `Render<N>` y `FudicElement` — el patrón de los ejemplos, formalizado

Cada render object **posee solo su nodo** y su baja. Cinco fases:

| Fase | Entorno | Qué hace |
|---|---|---|
| `create()` | browser + **SSR** | construye nodos vía `dom` y los ancla al target |
| `hydrate(cursor)` | browser | adopta los nodos que el SSR ya mandó (por posición/identidad) |
| `mount()` | browser | abre suscripciones (grano fino) y comportamiento |
| `update()` | browser | reevalúa la parte reactiva; escribe solo en su nodo, sin diffing |
| `remove()` | browser | `unsubscribe` + `detach`, simétrico a `create/mount` |

`FudicElement` (N3, browser) encapsula el `connectedCallback` que los ejemplos repetían a mano
(decisión 73): resuelve `root = this.shadowRoot ?? attachShadow`; si el shadow viene del SSR
(`shadowRoot && root.firstChild`) → `hydrate(cursorOf(browserDom, root))`, si no → `create()`;
luego `adopt` de `<style host>` y `mount()`. `disconnectedCallback` → `remove()`. El emit genera
la subclase que implementa `render()`; el estado (señales) vive como campos de la clase.

### 4.6. Delegación N2 vs listeners N3

- **N2** (handlers puros, sin estado): `delegate.connect(document, 'click')` instala **un** listener
  que, en cada evento, sube desde `event.target` al primer `[data-fud-e]`, extrae el `handlerId` y
  llama al `fn` registrado con `on`. Cero constructor por instancia. Es la "delegación global".
- **N3** (con clase): los listeners son **propios del componente** (`root.querySelector('[data-fud-e="tag:h"]')`),
  cableados en `mount()`, no delegados en `document`. El shadow retarget hace inviable la delegación
  global cruzando la frontera del shadow.

Ambos usan el mismo marcador `data-fud-e="<component>:<handler>"` que el emit pinta.

### 4.7. `<style host>` (decisiones 67–70)

`styles.define(id, css)` construye **un** `CSSStyleSheet` (la fuente es el CSSOM ya parseado por el
navegador). `styles.adopt(root, id)` empuja **esa misma referencia** a `root.adoptedStyleSheets`
de cada shadow root cuyo host matchee — cero copia de CSS por instancia. En SSR la hoja va inline
(§4.3). El día que `<style host>` sea nativo, el código de consumo no cambia (decisión 70): esta
API es la primitiva estable.

### 4.8. Scheduler de hidratación (decisión 74)

`defineLazy(tag, ctor, strategy)` difiere `customElements.define`:
- `eager` — define ya.
- `interaction` (**default**) — define en el primer `pointerdown`/`focusin`/`keydown` sobre un host
  `[data-fud-c="tag"]`.
- `viewport` — `IntersectionObserver` sobre los hosts.
- `idle` — `requestIdleCallback` (fallback `setTimeout`).

Antes del upgrade el componente es DSD pintado, con el estado inicial del servidor visible e inerte.

### 4.9. Códigos `FUD`

SDD-14 reserva **`FUD0230`–`FUD0259`**. El runtime de **cliente** no emite diagnósticos (es
comportamiento, no análisis: falla o no falla, y nunca lanza en camino feliz). El **SSG** (build)
podrá emitir aquí diagnósticos de serialización en specs posteriores; en v1 el rango queda
**reservado y vacío**, como el de SDD-13.

---

## 5. Invariantes de runtime

- **Un render, dos adapters.** El código emitido se escribe una vez contra `Dom<N>`; `browserDom`
  y `SsrDom` son las dos ramas. Ninguna rama toca la otra.
- **Sin diffing.** Grano fino: una señal escribe en su nodo por identidad (`data-fud-b`). No hay
  VDOM ni reconciliación de árbol.
- **Baja simétrica.** Todo `create/mount` tiene su `remove` inverso; ningún suscriptor queda vivo
  tras `remove()`.
- **SSR no hidrata.** La adopción (`firstChild`/…) lanza en `SsrDom`: es un invariante, no un bug.
  El SSR solo construye y serializa.
- **DOM-first.** El estado se rehidrata leyendo el markup pintado; `data-fud-s` es solo el residuo
  no-reconstruible.
- **Nunca lanza en camino feliz.** El runtime de cliente no propaga excepciones por input normal
  (sí lanza, a propósito, en la adopción SSR y en errores de programación).

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

4. **`before` real en SSR.** Sobre un árbol, `before(anchor, node)` inserta `node` antes de `anchor`
   y `renderToString` lo refleja en ese orden. `firstChild()` sobre `SsrDom` **lanza**.

5. **Isomorfismo.** El **mismo** cuerpo `create(dom, target)` corrido con `browserDom` (contra un
   contenedor) y con `SsrDom` produce estructuras equivalentes: el `innerHTML` del contenedor
   browser === `renderToString` del árbol SSR (módulo detalles de serialización de void/DSD).

6. **`signal`.** `subscribe` se dispara en `set(v')` con `v'` distinto; **no** se dispara si
   `Object.is(v', v)`; el `unsubscribe` devuelto corta la baja. `peek()` no notifica.

7. **`FudicElement` frío.** Definido un componente sin DSD previo y conectado: crea el shadow,
   corre `create()` y `mount()`; se ve el contenido inicial.

8. **`FudicElement` hidrata.** Con el host servido como DSD (`<template shadowrootmode="open">` con
   el estado inicial): al conectar, **adopta** el shadow y corre `hydrate()` (no `create()`), y una
   mutación de señal actualiza solo su nodo `data-fud-b`. `disconnectedCallback` → `remove()` deja
   cero suscriptores.

9. **Delegación N2.** `delegate.on('app-x:click', fn)` + `connect(document,'click')`: un click en un
   descendiente de `[data-fud-e="app-x:click"]` llama a `fn` una vez con el elemento marcado; un
   segundo `connect` no duplica el listener.

10. **`<style host>`.** `styles.define('c', '...')` + `adopt(rootA,'c')` + `adopt(rootB,'c')`:
    ambos shadow roots comparten **la misma** referencia de `CSSStyleSheet` (una sola instancia).

11. **`Cursor`.** Sobre un shadow hidratado, `cursorOf(browserDom, root).seekComment('fud:if')`
    localiza el ancla y `byBinding('count')` localiza el `[data-fud-b="count"]`.

12. **Scheduler.** `defineLazy('app-x', C, 'interaction')` no define hasta el primer `pointerdown`
    sobre un `[data-fud-c="app-x"]`; `'eager'` define de inmediato.

13. **Cobertura.** Cerca del 100 % en `@fudic/dom` (contrato/adapters) y en `signal`/`delegate`/
    `styles`; el scheduler y `FudicElement` según el suelo del SDD-00 (80/80/75), por depender del
    entorno DOM.

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
- **Bundling / tree-shaking / split por estrategia**: build tooling, posterior.
- **Polyfill de `<style host>` para navegadores sin `adoptedStyleSheets`**: futuro; la API no cambia
  (decisión 70).
