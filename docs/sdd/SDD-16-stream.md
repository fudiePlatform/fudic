# SDD-16 — Serialización a stream y transporte en tres hilos (`@fudic/ssr` · `@fudic/transport`)

> **Estado:** `Listo`
> **Depende de:** 00, 01, 14
> **Decisiones de gramática:** — (arquitectura de runtime; no toca gramática. Motiva la forma `async function*` del emit, futura decisión 75+)

---

## 1. Contexto y objetivo

SDD-14 cerró el runtime de construcción: `Dom<N>` + `browserDom`/`SsrDom`, y `renderToString`, que
**construye el árbol SSR entero y luego lo recorre a un string**. Eso tiene un coste real: sin TTFB
(el primer byte no sale hasta tener el árbol completo), sin backpressure, y con un pico de memoria
`O(árbol + string)`. Para las vistas que de verdad vamos a servir, **el transporte es un stream**,
no un string.

Esta SDD añade esa mitad y **cierra la arquitectura de renderizado en tres hilos**
(`docs/arquitecture/stream/fudic-arquitectura-3-hilos.md`): cada navegación es un
`FetchEvent(navigate)` que un **Service Worker** intercepta; si la ruta es dinámica, delega en un
**Web Worker** que hace `import()` del chunk de vista y produce el stream de HTML; el SW lo reenvía
al `Response` (con `tee()` a cache) y el navegador pinta en streaming. El hilo principal solo
**hidrata por traversal posicional** sobre el HTML ya pintado (eso ya existe en SDD-14:
`hydrateRoot` + `cursorOf`).

Dos piezas:

- **Serializador a stream** (`@fudic/ssr`, ampliación) — `renderToStream(root)` produce un
  `ReadableStream<Uint8Array>` recorriendo el árbol **perezosamente** (chunking + backpressure de
  plataforma). La misma pasada la comparte `renderToString`. Y se exponen las **primitivas** —
  el walk como generador, el encoder, el escape — que el `async function*` del emit (SDD-15)
  reutilizará para el TTFB real.
- **Transporte de tres hilos** (`@fudic/transport`, paquete nuevo) — el shell cliente: contrato de
  mensajes tipado, adaptador de transporte WW→SW con degradación (Safari no transfiere
  `ReadableStream`), router del SW (cache-first + delego + `tee`), servidor de render del WW
  (`import()` dinámico), manifest único `ruta→chunk`, y bus de control `BroadcastChannel`.

**Idea rectora del documento: cero runtime de routing distribuido.** El navegador gobierna la
navegación (`FetchEvent`); no hay router en el hilo principal, ni intercepción de clicks, ni
`history.pushState` manual, ni swap de regiones del DOM. Un único punto de entrada, un único camino
de código, **una sola rama de decisión** en todo el sistema: *cache hit o miss en el SW*.

**Qué NO es.** No es un framework de routing en cliente ni un state manager entre navegaciones
(cada navegación es un documento nuevo, §5). No define el `async function*` incremental del emit
—eso es SDD-15— pero sí las primitivas que ese generador consume.

**Modelo de streaming (decidido).** El serializador **recorre el árbol ya construido** y emite
chunks; el TTFB real (emitir *a medida que resuelve el dato async*) lo dará el `async function*`
del emit reutilizando las primitivas de aquí. Esta SDD **no** convierte `SsrDom` en un emisor
incremental: el árbol se sigue construyendo entero. Lo que cambia es que la **salida** ya no es un
string monolítico sino un stream perezoso con backpressure, y que el walk queda factorizado para
que el emit lo herede.

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | TS estricto, Vitest, monorepo pnpm (permite crear `@fudic/transport`). |
| 01 | `Hecho` | `Diagnostic`/`errorDiag` (solo diagnósticos de build del SSG; el shell de cliente no los usa). |
| 14 | `Hecho` | `SsrNode`, `SsrDom`, `renderToString` (que esta SDD refactoriza sobre el walk compartido); `hydrateRoot`/`cursorOf` para la hidratación post-navegación del hilo principal. |

```ts
import { type SsrNode, SsrDom, renderToString } from '@fudic/ssr'; // ampliado aquí
import { hydrateRoot, cursorOf } from '@fudic/core';               // hidratación del main (SDD-14)
```

> **Independiente del parser y del emit por DIP.** El shell no ve el AST ni el emit. El WW ejecuta
> lo que un chunk **exporta** (`RenderChunk`), no un chunk concreto; el emit (SDD-15) produce esos
> chunks. Por eso el shell se testea aislado, inyectando un `RenderChunk` de mentira (DIP): un
> `async function*` que emite piezas fijas. La integración real (SW registrado + chunk emitido)
> es humo posterior, no criterio de esta spec.

**Paquete nuevo que crea esta spec:**

| Paquete | Contenido | Entorno |
|---|---|---|
| `@fudic/transport` | Contrato de mensajes, adaptador de transporte, `createRouter` (SW), `serveRender` (WW), manifest, `controlBus`, `registerRenderServiceWorker` (main) | cliente (SW/WW/main) |

`@fudic/transport` **no** depende de `@fudic/ssr` en runtime: toda su superficie usa tipos de
plataforma (`ReadableStream<Uint8Array>`, `MessagePort`, `BroadcastChannel`, `FetchEvent`). El
`RenderChunk` es una interfaz; el chunk concreto que el WW `import()`a en producción es código
emitido (que sí usará `@fudic/ssr`), pero eso es un import dinámico de app, no una dependencia de
paquete. `@fudic/ssr` entra solo como **`devDependency`** para construir `RenderChunk` de verdad en
los tests. Sin ciclos.

---

## 3. Interfaz pública

Todo en inglés. Ubicaciones: `packages/ssr/src/` (ampliación), `packages/transport/src/` (nuevo).

### 3.1. `@fudic/ssr` — serialización a stream (ampliación)

```ts
/**
 * The single tree walk, as a LAZY generator of HTML text pieces. This is the shared primitive:
 * `renderToString` joins it, `renderToStream` encodes+enqueues it, and the emit's `async function*`
 * (SDD-15) reuses the same escaping/void/rawtext/DSD rules. One walk, three consumers.
 * Emits the exact same pieces as `renderToString` produced monolithically (SDD-14 §4.3).
 */
export function serializeChunks(root: SsrNode): Generator<string>;

/** Unchanged contract (SDD-14 §3.2), now implemented as `[...serializeChunks(root)].join('')`. */
export function renderToString(root: SsrNode): string;

export interface StreamOptions {
  /** Min bytes buffered before an enqueue, to coalesce tiny pieces. Default 8192. */
  highWaterMark?: number;
}

/**
 * Serialize a tree to a byte stream, lazily. The walk advances on `pull` and stops enqueueing when
 * `desiredSize <= 0` (platform backpressure). Equivalent bytes to
 * `new TextEncoder().encode(renderToString(root))`, but produced incrementally with a bounded
 * memory ceiling.
 */
export function renderToStream(root: SsrNode, options?: StreamOptions): ReadableStream<Uint8Array>;

/**
 * Turn a (sync OR async) sequence of HTML text pieces into a UTF-8 byte stream with backpressure.
 * `renderToStream(root)` is `htmlToByteStream(serializeChunks(root))`; the emit's incremental SSR
 * is `htmlToByteStream(emittedAsyncGenerator())`. This is the seam the async-gen emit inherits.
 */
export function htmlToByteStream(
  source: Iterable<string> | AsyncIterable<string>,
  options?: StreamOptions,
): ReadableStream<Uint8Array>;

/** Context-aware escaping, exposed so the emit reuses the SAME rules (no drift). */
export function escapeText(s: string): string;        // & < >
export function escapeAttr(s: string): string;        // & "
export function neutralizeComment(s: string): string; // inner `-->` → `--&gt;` (anchors: `<!--fud:if-->`)
```

### 3.2. `@fudic/transport` — el shell de tres hilos

```ts
export type ReqId = string;

// ── Canal de datos: contrato de mensajes tipado (SW ↔ WW por MessagePort 1:1) ──
/** SW → WW: render this route into the reply port of the MessageChannel. */
export interface RenderRequest {
  readonly type: 'render';
  readonly reqId: ReqId;
  readonly route: string; // pathname + search
}

/** WW → SW render payload. Two shapes by capability (the transport adapter picks). */
export type RenderMessage =
  | { readonly type: 'stream'; readonly stream: ReadableStream<Uint8Array> } // native transfer
  | { readonly type: 'chunk'; readonly buffer: ArrayBuffer }                 // degraded fan-out
  | { readonly type: 'end' };                                                // degraded terminator

// ── Canal de control: out-of-band, interesa a los tres a la vez (BroadcastChannel) ──
export type ControlMessage =
  | { readonly type: 'invalidate'; readonly route: string }
  | { readonly type: 'version'; readonly build: string }
  | { readonly type: 'purge'; readonly route: string };

// ── Adaptador de transporte: bifurca en UN punto (frontera WW→SW), detección de CAPACIDAD ──
/** Probe once at WW startup, in the real transfer context: can a `ReadableStream` be transferred? */
export function canTransferStream(): boolean;

/** WW→SW: native transfer if able, else read the stream and fan out `ArrayBuffer` chunks. */
export function sendRender(port: MessagePort, stream: ReadableStream<Uint8Array>): void;

/** SW side: reconstruct a stream from the first message, wiring `port.onmessage` for the degraded path. */
export function receiveRender(port: MessagePort, first: RenderMessage): ReadableStream<Uint8Array>;

// ── Manifest único ruta→chunk: misma URL absoluta cargada por SW y WW (fuente única) ──
export interface ManifestEntry {
  readonly dynamic: boolean; // SW: ¿delego a WW, o sirvo estático/cache?
  readonly chunk: string;    // WW: qué import()ar (resuelto contra la URL del script del worker)
}
export interface RouteManifest {
  match(route: string): ManifestEntry | null;
}
/** Load from an ABSOLUTE url so SW and WW never drift. Versioned with the build. */
export function loadManifest(url: string): Promise<RouteManifest>;

// ── Web Worker: el "render server local" ──
/** What a view chunk exports: route → HTML byte stream. The emit (SDD-15) produces these. */
export type RenderChunk = (route: string) => ReadableStream<Uint8Array>;

/**
 * WW: handle one `RenderRequest` over its reply port. `resolveChunk` is injected (DIP) and owns the
 * whole route→module path: production is
 * `(route) => { const e = manifest.match(route); if (!e) throw …; return import(e.chunk).then(m => m.default); }`;
 * tests pass a fake `(route) => Promise.resolve(fakeChunk)`. On resolve, runs the chunk and
 * `sendRender`s the stream; on reject, posts `{ type:'end' }` (empty) so the SW never hangs.
 */
export function serveRender(
  port: MessagePort,
  req: RenderRequest,
  resolveChunk: (route: string) => Promise<RenderChunk>,
): Promise<void>;

/**
 * WW bootstrap: build the production `resolveChunk` over `manifest` (+ dynamic `import()`) and wire
 * `self.onmessage = e => serveRender(e.ports[0], e.data, resolveChunk)` — each request carries its
 * reply port transferred alongside the `RenderRequest`.
 */
export function installRenderWorker(manifest: RouteManifest): void;

// ── Service Worker: intercepta navegación, enruta, cachea ──
export interface Router {
  /** Handle a navigation `FetchEvent`: calls `event.respondWith(...)`. Cache-first, then delegate. */
  handle(event: FetchEvent): void;
}
export interface RouterConfig {
  manifest: RouteManifest;
  worker: Worker;   // the render Web Worker
  cache: Cache;     // target of `caches.open(...)`
}
/**
 * One decision branch in the whole system: cache hit → `Response(cache)`; miss → open a
 * `MessageChannel` per `reqId`, `postMessage` a `RenderRequest` to the WW, `receiveRender`, `tee()`
 * (one leg to the `Response`, one to `cache.put`), and `port.close()` when done.
 */
export function createRouter(config: RouterConfig): Router;

// ── Bus de control (los tres hilos) ──
export interface ControlBus {
  post(msg: ControlMessage): void;
  on(fn: (msg: ControlMessage) => void): () => void; // returns unsubscribe
  close(): void;
}
export function controlBus(channelName?: string): ControlBus; // default 'fudic'

// ── Hilo principal: registrar el SW. La hidratación ya es SDD-14 (hydrateRoot/cursorOf). ──
export function registerRenderServiceWorker(url: string): Promise<ServiceWorkerRegistration>;
```

---

## 4. Comportamiento

### 4.1. El walk compartido — una pasada, tres consumidores

`serializeChunks(root)` es el recorrido de SDD-14 §4.3 vuelto **generador**: emite las mismas
piezas de HTML (void auto-cerrados, rawtext sin escapar, shadow → `<template shadowrootmode="open">`,
escape por contexto, `-->` neutralizado en comentarios), pero como secuencia perezosa en vez de
concatenación. Sobre él:

- `renderToString(root)` = `[...serializeChunks(root)].join('')`. **Byte-idéntico** a SDD-14: los
  tests de serialización existentes (`serialize.test.ts`) siguen verdes sin tocarse.
- `renderToStream(root)` = `htmlToByteStream(serializeChunks(root))`.
- El emit (SDD-15) escribirá su `async function*` reusando `escapeText`/`escapeAttr` y las mismas
  reglas, y lo envolverá con `htmlToByteStream`. **Una sola definición de las reglas de
  serialización; cero deriva** entre string, stream y emit incremental.

**Granularidad de chunk.** El generador emite pieza a pieza (por nodo), pero `htmlToByteStream`
**coalesce** en el `TextEncoder` hasta `highWaterMark` bytes antes de `enqueue`, para no fragmentar
en Uint8Arrays diminutos. UTF-8; un carácter multibyte nunca se parte entre chunks (el encoder
mantiene el resto pendiente).

### 4.2. `htmlToByteStream` — backpressure de plataforma

Fuente `pull`-based: en cada `pull`, avanza el iterador (sync o async), codifica y `enqueue` hasta
que `controller.desiredSize <= 0`; entonces cede. La plataforma vuelve a llamar `pull` cuando el
consumidor drena. Con AsyncIterable, `await`ea cada `next()` — así el mismo helper sirve al walk
síncrono de SSR y al `async function*` del emit que espera datos. `cancel()` cierra el iterador
(`return()`), liberando recursos si el consumidor abandona.

### 4.3. Dos canales, nunca mezclados

El documento es tajante: **datos y control no comparten canal**. Una señal de invalidación no debe
quedar encolada detrás de un stream a medio emitir.

- **Datos** — `fetch` (Navegador→SW) + `MessagePort` **1:1 por `reqId`** (SW↔WW). Un
  `MessageChannel` nuevo por navegación; se cierra al terminar (`port.close()`). Renders
  concurrentes no se pisan.
- **Control** — `BroadcastChannel` (`controlBus`), out-of-band: solo señales (invalidación,
  versión, purga). Broadcast porque interesan a los tres a la vez y **no** siguen el ciclo
  petición-respuesta.

### 4.4. El adaptador de transporte — degradación aislada (Safari)

El transferable objetivo es el `ReadableStream` entero (backpressure de plataforma gratis), pero
**Safari estable no lo transfiere vía `postMessage`**: lanza `DataCloneError` y la petición "tiene
éxito" pero no llega nada (fallo silencioso). `ArrayBuffer` sí es transferable en Safari desde
siempre.

`canTransferStream()` detecta **capacidad, no user-agent**, una vez al arrancar el WW, en el
contexto real donde se transfiere:

```ts
const s = new ReadableStream();
try { structuredClone(s, { transfer: [s] }); return true; } catch { return false; }
```

`sendRender`/`receiveRender` son el **único** punto que conoce las dos ramas:

- Capaz → `port.postMessage({ type: 'stream', stream }, [stream])`.
- Degradado → lee el stream y por cada chunk `postMessage({ type:'chunk', buffer }, [buffer])`,
  luego `{ type:'end' }`; el receptor reensambla un `ReadableStream` desde esos mensajes.
  **Cuidado con el `transfer`:** se transfiere una **copia ajustada** del chunk
  (`value.slice().buffer`), no `value.buffer` crudo — el `TextEncoder` puede reusar su backing
  store entre chunks y transferir el buffer entero lo detacharía, corrompiendo los siguientes.

`receiveRender(port, first)` **no pierde el primer mensaje**: en el camino nativo devuelve
`first.stream` directamente; en el degradado crea el `ReadableStream` y **procesa ya `first`**
(si es `chunk`, lo `enqueue`a; si es `end`, cierra) antes de cablear `port.onmessage` para los
siguientes. Reasignar `onmessage` en la misma tarea que recibió `first` no pierde mensajes
encolados (event loop de un solo hilo).

**Salida limpia diseñada.** El día que Safari viejo deje de importar: se borra el `else` de
`sendRender` y `receiveRender` queda en su primera línea. Un `const`, un `if`, sin residuos. El
resto del sistema no sabe que hubo dos caminos.

**Backpressure en el camino degradado.** Se pierde el backpressure automático: el WW emite tan
rápido como itera. Para vistas acotadas, irrelevante. Si se midiera, se recupera con acks
(`{type:'pull'}` cuando `desiredSize` baja). **Fuera de v1** salvo medición que lo justifique (se
documenta como hilo abierto, no se implementa).

### 4.5. El router del SW — la única rama del sistema

`createRouter(config).handle(event)`:

1. `event.request.mode !== 'navigate'` → no se toca (deja pasar; el SW puede tener otros handlers).
2. `manifest.match(route)`:
   - `null` o `dynamic === false` → cache-first estático (fuera del render dinámico).
   - `dynamic === true` → **miss/hit**:
     - **hit** en `cache` → `event.respondWith(cached)`.
     - **miss** → `MessageChannel` nuevo (`reqId`), `worker.postMessage(RenderRequest, [port2])`,
       `receiveRender(port1, firstMsg)` → `stream`; `stream.tee()` → una pata al
       `event.respondWith(new Response(a, { headers: text/html }))`, la otra a `cache.put(request, new Response(b))`;
       `port.close()` al cerrar.

**Resolución de rutas = fuente única.** El `import('./home.chunk.js')` del WW resuelve contra la URL
del script del Worker, no contra la ruta navegada. Si SW y WW discrepan en qué chunk corresponde a
qué ruta, se sirve HTML equivocado en **toda** navegación. Regla: un único manifest cargado por
ambos desde la misma URL absoluta (`loadManifest`), versionado con el build.

### 4.6. El WW — render server local, mismo target que un edge worker

`installRenderWorker(manifest)` cablea `self.onmessage`: cada mensaje trae el `RenderRequest` en
`e.data` y su **puerto de respuesta transferido** en `e.ports[0]`; despacha a
`serveRender(e.ports[0], e.data, resolveChunk)`. El `resolveChunk` de producción cierra sobre el
manifest y el `import()` (`route → manifest.match → import(entry.chunk)`); el WW **consulta el
manifest para saber qué importar** (la otra mitad de la fuente única del §4.5). `serveRender` corre
`chunk(req.route)` → `ReadableStream`, `sendRender(port, stream)`. Si `resolveChunk` rechaza (ruta
desconocida) o el render falla → `port.postMessage({ type:'end' })` (stream vacío) para que el SW no
cuelgue; el error se señaliza por el canal de control, no por el de datos. El WW **nunca** toca el
DOM ni intercepta red. Ejecuta el **mismo** `async function*` que ejecutaría un Cloudflare Worker:
mismo target de emit, cero targets nuevos de compilador.

### 4.7. Consecuencias aceptadas (del documento)

- **Cada navegación es un documento nuevo.** No sobrevive estado de UI en el hilo principal (scroll,
  foco, signals no persistidas) salvo persistencia explícita. Para vistas hospitality autónomas es
  correcto; queda como decisión consciente.
- **Estado entre navegaciones**: pendiente decidir para v1 (`sessionStorage` trivial, o estado en
  WW/SW señalizado por `BroadcastChannel`). **Fuera de alcance** de esta SDD (hilo abierto).

---

## 5. Invariantes de runtime

- **Una sola definición de serialización.** String, stream y emit incremental consumen el **mismo**
  walk y el **mismo** escape. Ningún camino re-implementa reglas de HTML; `renderToString` no cambia
  de bytes respecto a SDD-14.
- **Backpressure por defecto.** El camino nativo (stream transferable y `renderToStream`) respeta
  `desiredSize`. Solo el camino degradado lo pierde, y está aislado y documentado.
- **Un único punto de bifurcación por capacidad.** La degradación Safari vive solo en
  `sendRender`/`receiveRender`. Añadir o quitar el camino degradado no toca ninguna otra pieza.
- **Dos canales disjuntos.** Datos (`fetch` + `MessagePort` 1:1 por `reqId`) y control
  (`BroadcastChannel`) nunca se mezclan. El control no se encola tras un render.
- **Una sola rama de decisión.** Todo el sistema es lineal salvo *cache hit/miss* en el SW.
- **Fuente única de rutas.** SW y WW cargan el **mismo** manifest desde la misma URL absoluta. Cero
  deriva posible.
- **DIP en la frontera del render.** El WW ejecuta un `RenderChunk` (interfaz), no un chunk
  concreto; el shell se testea entero sin emit ni SW real inyectando fakes. La imposibilidad de
  tocar el DOM en el WW es estructural (no hay API DOM en su contrato), no un `throw`.
- **Cierre sin residuo.** Cada `MessageChannel` se cierra (`port.close()`); cada `controlBus.on`
  devuelve su unsubscribe; `htmlToByteStream` cancela su iterador en `cancel()`.

---

## 6. Criterios de aceptación

El SDD está `Hecho` cuando `pnpm typecheck` pasa y estos tests verdes (entorno Vitest con
`happy-dom`; los `MessagePort`/`BroadcastChannel`/`ReadableStream` se prueban con las
implementaciones de plataforma o dobles inyectados):

1. **Typecheck + sin ciclos.** `@fudic/ssr` reexporta las nuevas firmas; `@fudic/transport` existe
   con §3.2 y depende de `@fudic/ssr` solo por tipos.

2. **`renderToString` no cambia.** Toda la batería de `serialize.test.ts` (SDD-14 §6.3) sigue verde
   con `renderToString` re-implementado sobre `serializeChunks` (byte-idéntico).

3. **`serializeChunks` = string.** `[...serializeChunks(root)].join('')` === `renderToString(root)`
   para el árbol canónico `div > [ 'a<b', img, style('.x{}') ]` y para un host con `attachShadow`.

4. **`renderToStream` = bytes de `renderToString`.** Consumir el stream y concatenar los
   `Uint8Array` decodificados en UTF-8 === `renderToString(root)`. Con `highWaterMark` bajo (p. ej.
   16) un árbol de varios nodos produce **más de un** `enqueue` (streaming real, no un único chunk).

5. **`htmlToByteStream` respeta backpressure.** Con un `highWaterMark` bajo y un consumidor que lee
   despacio, el iterador fuente **no** se agota de golpe: se pausa cuando `desiredSize <= 0` y
   reanuda al drenar. `cancel()` llama al `return()` del iterador. Acepta un `AsyncIterable` (un
   `async function*` de piezas) y produce el mismo stream.

6. **UTF-8 sin cortes.** Un texto con caracteres multibyte (emoji) fragmentado por el chunking se
   decodifica intacto (ningún chunk parte un code point).

7. **`canTransferStream`.** Devuelve `boolean` sin lanzar en un entorno que no soporta transferir
   `ReadableStream` (rama `catch`) y en uno que sí.

8. **Adaptador de transporte, ida y vuelta.** Con dos puertos de un `MessageChannel`:
   - camino nativo (fake `canTransferStream → true`): `sendRender` transfiere el stream y
     `receiveRender` lo devuelve; el HTML llega íntegro.
   - camino degradado (`false`): `sendRender` fan-out de `chunk`+`end`, `receiveRender` reensambla
     un `ReadableStream` cuyo contenido concatenado === el original.

9. **`serveRender` (WW) con `RenderChunk` fake.** Inyectado `resolveChunk` que devuelve un chunk que
   emite `<p>hi</p>`, `serveRender` postea al puerto un render cuyo contenido === `<p>hi</p>`. Si
   `resolveChunk` **rechaza**, postea `{type:'end'}` (stream vacío) y **no** cuelga ni lanza.

10. **`createRouter` (SW), rama única.** Con un `manifest` fake, un `worker` doble (responde con un
    stream fijo) y un `cache` doble:
    - **miss** → `handle(fetchEvent)` llama `respondWith` con un stream cuyo contenido === el del
      worker, y hace `cache.put` (verificado por el doble). El `MessagePort` se cierra.
    - **hit** → `respondWith` con la respuesta cacheada, **sin** postear al worker.
    - `request.mode !== 'navigate'` → `handle` no llama `respondWith`.

11. **`controlBus` — canal de control aislado.** `post({type:'invalidate',route})` llega a los
    `on(...)` suscritos; el unsubscribe corta; `close()` libera el `BroadcastChannel`. Un mensaje de
    control **no** viaja por ningún `MessagePort` de datos (canales disjuntos, verificado por
    ausencia).

12. **`loadManifest` — fuente única.** Cargado dos veces desde la misma URL (fake `fetch`), ambos
    `RouteManifest` dan el **mismo** `match(route)`; `match` de una ruta ausente → `null`.

13. **Cobertura.** Cerca del 100 % en el serializador (`serializeChunks`/`htmlToByteStream`/escape)
    y en el adaptador de transporte (`send`/`receiveRender`, ambas ramas). Router/WW/`controlBus`
    según el suelo del SDD-00 (80/80/75), por depender de dobles de plataforma.

---

## 7. Fuera de alcance

- **El `async function*` incremental del emit** (emitir HTML *a medida que resuelve el dato async*,
  con TTFB real por vista): **SDD-15**. Esta SDD entrega las primitivas (`htmlToByteStream`,
  `serializeChunks`, escape) que ese generador reutiliza; no lo escribe.
- **La inferencia de qué ruta es `dynamic`** y la generación del manifest desde el build: **SDD-15**
  (el emit) + build tooling. Aquí el manifest se consume, no se produce.
- **Estado entre navegaciones** (`sessionStorage` / estado en WW/SW): pendiente de decisión de
  producto; no entra en v1.
- **Política de cache del SW** (qué rutas son cacheables, invalidación por versión concreta más allá
  de la señal `ControlMessage`): posterior; aquí solo el mecanismo `tee`+`cache.put` y el bus.
- **Acks de backpressure en el camino degradado** (`{type:'pull'}`): solo si una medición lo
  justifica; documentado como hilo abierto.
- **Registro/versionado del Service Worker en producción** (scope, `skipWaiting`, `clients.claim`,
  update flow): `registerRenderServiceWorker` es el gancho mínimo; la política de ciclo de vida es
  build/deploy, posterior.
- **Hidratación por traversal posicional**: ya es **SDD-14** (`hydrateRoot`/`cursorOf`); el hilo
  principal la invoca, esta SDD no la redefine.
