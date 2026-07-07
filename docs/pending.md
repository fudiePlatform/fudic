# Trabajo pendiente de implementación

> Handoff para retomar en frío. Registra qué falta implementar de specs ya `Listo`.
> No es un SDD: las specs mandan; esto solo apunta el estado y el orden. Cada bloque
> referencia la sección de la spec que es el contrato real.

## Estado del runtime (SDD-14 + SDD-16)

| Paquete | Spec | Estado |
|---|---|---|
| `@fudic/dom` | SDD-14 §3.1 | ✅ Implementado y commiteado (100 % cobertura). `Dom<N>`, `DomClient<N>`, `browserDom`, `NS`, `Cursor`/`cursorOf`. |
| `@fudic/ssr` | SDD-14 §3.2 + SDD-16 §3.1 | ✅ Completo: `SsrDom`, `renderToString`, y las adiciones de stream de SDD-16 (`serializeChunks`, `renderToStream`, `htmlToByteStream`, escapes expuestos). |
| `@fudic/core` | SDD-14 §3.3 | ✅ Implementado (100 % cobertura). Cierra SDD-14 (`Hecho`). |
| `@fudic/transport` | SDD-16 §3.2 | ✅ Implementado (100 % cobertura). Cierra SDD-16 (`Hecho`). |

**Nada pendiente:** los tres bloques están cerrados (2026-07-07). SDD-14 y SDD-16 en `Hecho`;
el siguiente frente es el emit (SDD-15).

---

## 1. `@fudic/core` — cerrar SDD-14 — ✅ Hecho (2026-07-07)

**Contrato:** SDD-14 §3.3. **Comportamiento:** SDD-14 §4.4–§4.8. **Criterios:** SDD-14 §6 (6–13).
**Depende de:** `@fudic/dom` (solo). **No** depende de `@fudic/ssr`.

Símbolos a implementar (`packages/core/src/`):

- [x] `signal<T>` / `Signal<T>` — valor + `Set` de suscriptores; `set` notifica solo si
  `!Object.is(v, prev)`; `peek()` sin efectos; `subscribe` devuelve unsubscribe. Sin tracking
  automático en v1 (SDD-14 §4.4). **Criterio §6.6.**
- [x] `Render<N>` / `RenderFactory<N>` / `SsrBuild<N>` — los tipos del render object
  (`create/hydrate/mount/update/remove`). Contrato, sin implementación concreta (la produce el emit).
- [x] `FudicElement` (abstract, extends `HTMLElement`) — `connectedCallback`: resuelve
  `root = shadowRoot ?? attachShadow`; si viene DSD del SSR (`shadowRoot && root.firstChild`) →
  `hydrate(cursorOf(browserDom, root))`, si no → `create()` + `styles.adopt` (solo en frío; en el
  hidratado ya adoptó el polyfill); luego `mount()`.
  `disconnectedCallback` → `remove()` (decisión 73). **Criterios §6.7 (frío) y §6.8 (hidrata).**
- [x] `delegate` / `Delegate` — un solo listener por `(type, root)`; `on(handlerId, fn)`;
  `connect(root, type)` idempotente; despacha por `data-fud-e` (N2). **Criterio §6.9.**
- [x] `styles` / `StyleRegistry` — solo camino cliente (`create()` tras `load`): `adopt(root, tag)`
  construye la hoja **una vez** desde el `<style host="tag">` del head (`replaceSync`, cacheada por
  tag) y empuja la misma referencia N veces. Sin `define(cssText)`. El SSR/DSD lo adopta el polyfill
  del compilador (`docs/runtime/demo-style-host-polyfill.html`) — **no es parte de core**. **Criterio §6.10.**
- [x] `hydrateRoot` / `mountRoot` — bootstrap de render raíz para bloques que no son custom elements.
- [x] `defineLazy` / `HydrationStrategy` — difiere `customElements.define` por estrategia
  (`eager` inmediato; `interaction` default: al primer `pointerdown` sobre `[data-fud-c]`; `viewport`;
  `idle`) (decisión 74). **Criterio §6.12.**

**Gotchas / invariantes (SDD-14 §5):**
- Baja simétrica: tras `remove()`, **cero** suscriptores vivos.
- DOM-first: la señal se rehidrata leyendo el markup pintado; `data-fud-s` es solo el residuo no
  reconstruible.
- `cursorOf` **ya existe** en `@fudic/dom` — no reimplementar; `core` lo consume.
- Cobertura: cerca del 100 % en `signal`/`delegate`/`styles`; `FudicElement`/scheduler según suelo
  SDD-00 (80/80/75) por depender del entorno DOM (§6.13).

**Setup de paquete (copiar patrón de `@fudic/ssr`):**
- `package.json`: `dependencies: { "@fudic/dom": "workspace:*" }`; `devDependencies` con `happy-dom`.
- `tsconfig.json`: `lib: ["ES2024","DOM","DOM.Iterable"]`, `paths: { "@fudic/dom": ["../dom/src/index.ts"] }`
  (sin `baseUrl`). `tsconfig.build.json` con `paths: {}`.
- `vitest.config.ts`: `environment: 'happy-dom'`, `resolve.alias` a `../dom/src/index.ts`.

---

## 2. Adiciones de stream en `@fudic/ssr` — SDD-16 (parte 1) — ✅ Hecho (2026-07-07)

**Contrato:** SDD-16 §3.1. **Comportamiento:** SDD-16 §4.1–§4.2. **Criterios:** SDD-16 §6 (2–6).

En `packages/ssr/src/` (ampliar, no romper lo existente):

- [x] `serializeChunks(root): Generator<string>` — refactor del walk actual de `serialize.ts` a
  generador perezoso, **mismas piezas** (void, rawtext, DSD `<template shadowrootmode="open">`,
  escape, `-->` neutralizado).
- [x] `renderToString` — reimplementar como `[...serializeChunks(root)].join('')`. Debe quedar
  **byte-idéntico**: `serialize.test.ts` (SDD-14 §6.3) sigue verde sin tocarse. **Criterio §6.2.**
- [x] `htmlToByteStream(source: Iterable | AsyncIterable<string>, opts?): ReadableStream<Uint8Array>`
  — fuente `pull`-based; codifica UTF-8 y `enqueue` hasta `desiredSize <= 0`; `cancel()` → `return()`
  del iterador. Acepta async (la costura que el `async function*` del emit hereda). **Criterios §6.5, §6.6.**
- [x] `renderToStream(root, opts?)` = `htmlToByteStream(serializeChunks(root))`. **Criterio §6.4.**
- [x] Exponer `escapeText` / `escapeAttr` / `neutralizeComment` (hoy privados en `serialize.ts`) para
  que el emit reuse las mismas reglas sin deriva.

**Gotchas:**
- `highWaterMark` default 8192; coalesce en el `TextEncoder`. **Un carácter multibyte no se parte**
  entre chunks (el encoder mantiene el resto pendiente) — test con emoji (§6.6).
- Test de multi-chunk determinista: `highWaterMark` bajo (p. ej. 16), no "árbol grande" (§6.4).

---

## 3. `@fudic/transport` — SDD-16 (parte 2), el shell de tres hilos — ✅ Hecho (2026-07-07)

**Contrato:** SDD-16 §3.2. **Comportamiento:** SDD-16 §4.3–§4.7. **Criterios:** SDD-16 §6 (7–12).
**Depende de:** nada en runtime (solo tipos de plataforma). `@fudic/ssr` es **devDependency** (tests).

Paquete nuevo `packages/transport/src/`:

- [x] **Contrato de mensajes** — `ReqId`, `RenderRequest`, `RenderMessage` (`stream`|`chunk`|`end`),
  `ControlMessage` (`invalidate`|`version`|`purge`). Tipos puros.
- [x] **Adaptador de transporte** — `canTransferStream()` (probe `structuredClone(s,{transfer:[s]})`,
  capacidad no UA); `sendRender(port, stream)` (nativo transfiere / degradado fan-out de
  `ArrayBuffer`); `receiveRender(port, first)` (nativo devuelve `first.stream`; degradado reensambla).
  **Único punto que conoce las dos ramas. Criterios §6.7, §6.8.**
- [x] **Manifest** — `RouteManifest.match`, `ManifestEntry` (`dynamic`, `chunk`), `loadManifest(url)`
  desde URL absoluta (fuente única). **Criterio §6.12.**
- [x] **WW** — `RenderChunk` (interfaz, inyectable), `serveRender(port, req, resolveChunk)`,
  `installRenderWorker(manifest)` (cablea `self.onmessage`, lee `e.ports[0]` + `e.data`, arma el
  `resolveChunk` de producción con `manifest.match` + `import()`). **Criterio §6.9.**
- [x] **SW** — `Router`, `RouterConfig`, `createRouter(config)` (única rama cache hit/miss →
  `MessageChannel` por `reqId` → `worker.postMessage(req, [port2])` → `receiveRender` → `tee()` a
  `respondWith` + `cache.put` → `port.close()`). **Criterio §6.10.**
- [x] **Control** — `controlBus(name?)` sobre `BroadcastChannel`: `post`/`on`(→unsubscribe)/`close`.
  **Criterio §6.11.**
- [x] **Main** — `registerRenderServiceWorker(url)` (gancho mínimo). La hidratación por traversal
  posicional ya es SDD-14 (`hydrateRoot`/`cursorOf`).

**Gotchas críticos (ya corregidos en la spec, respétalos):**
- `receiveRender` **no pierde el primer mensaje**: procesa `first` (enqueue si `chunk`, cierra si
  `end`) **antes** de cablear `port.onmessage`.
- Camino degradado: transferir `value.slice().buffer`, **no** `value.buffer` crudo (el `TextEncoder`
  reusa backing store → detach corrompería los siguientes).
- Canales disjuntos: control (`BroadcastChannel`) **nunca** viaja por un `MessagePort` de datos.
- Todo `MessageChannel` se cierra (`port.close()`); `resolveChunk` que rechaza → `{type:'end'}`, el
  SW no cuelga.
- El shell se testea **sin emit ni SW real**: inyecta un `RenderChunk` falso (DIP) y dobles de
  `worker`/`cache`/`fetchEvent`.

**Setup de paquete:**
- `tsconfig.json`: `lib` debe incluir los tipos de worker/SW (`FetchEvent`, `Cache`, `MessagePort`,
  `BroadcastChannel`, `ServiceWorkerRegistration`) — p. ej. `["ES2024","DOM","DOM.Iterable","WebWorker"]`.
  Ajustar si `WebWorker` choca con `DOM` (puede requerir `skipLibCheck` acotado o separar tsconfig
  por contexto SW/WW). **Verificar en el primer typecheck.**
- `devDependencies`: `@fudic/ssr` (`workspace:*`) para construir `RenderChunk` reales en tests,
  `happy-dom`.

---

## Recordatorios transversales

- Rango FUD reservado por SDD-16: `FUD0260`–`FUD0289` (vacío; el runtime no emite diagnósticos).
- Versiones **exactas** (sin `^`/`~`) en cualquier dep nueva.
- Código en inglés; identificadores, comentarios y mensajes.
- Al terminar cada bloque: `pnpm typecheck` + `pnpm test` verdes, actualizar el registro de progreso
  de `docs/sdd/INDEX.md` y el estado del SDD (14 → `Hecho` cuando `core` cierre; 16 → `Hecho` cuando
  ambas partes cierren).
