# SDD-20 — Renderizado en el Service Worker (`@fudic/transport` · `@fudic/vite` · `@fudic/core`)

> **Estado:** `Listo` · **Rango de diagnósticos:** `FUD0390`–`FUD0419`
> **Depende de:** 14, 15 (slice SSR servidor), 16 (parte 1: `@fudic/ssr`), 18, 19
> **Sustituye a:** SDD-16 §3.2 (contrato de mensajes de datos), §3.3, §4.3 (canal de
> datos), §4.4 (adaptador y degradación Safari), §4.5 (delegación al WW), §4.6;
> SDD-19 §4.2 (la escalera de modos), §4.7 (formato del manifest), §4.8 (bootstraps).
> Todo lo demás de 16 y 19 sigue vigente.

---

## 1. Contexto y objetivo

El modelo de tres hilos de SDD-16 —el Service Worker delega el render en un Web Worker—
**no funciona en navegadores reales**. Está medido durante ocho horas sobre un prototipo
propio, con Playwright, sin mocks, en **Chromium 151** y **WebKit 26.5**
(`docs/sdd/SDD.md`, §2.2):

- El WW pertenece a su documento y muere con él. El render se pide justo cuando la
  navegación está destruyendo ese documento.
- **Stream transferido**: llega el primer byte y el stream **nunca cierra** → la
  navegación se queda colgada indefinidamente. No es HTML truncado: es spinner eterno.
- **Chunks `ArrayBuffer`**: idéntico.
- **Drenando el stream en el SW antes de responder**: funciona home→ruta (4/4 en ambos
  motores) pero **falla ruta→ruta en WebKit, 0/5** — un `fetch()` desnudo desde el WW
  durante el unload devuelve `TypeError: Load failed`. A la red del WW se le corta el
  grifo en cuanto su documento empieza a descargarse.

**El Service Worker no pertenece a ningún documento.** Es dueño de la `Response` de
principio a fin y puede seguir emitiendo después de que la navegación haga commit. Por
eso el render vive ahí. Como el SW responde a una **navegación real**, el HTML lo procesa
el parser del navegador y `<template shadowrootmode>` se materializa nativamente: no hace
falta `setHTMLUnsafe` ni Navigation API. Es la razón principal para preferir render-en-SW
sobre navegación SPA, y encaja exactamente con el output N1 cero-JS de fudic.

El precio: un `ServiceWorkerGlobalScope` prohíbe `import()` y solo admite
`importScripts()` durante el `install`. La carga perezosa por ruta dentro del SW **solo
es posible con `new Function`**, lo que exige `script-src 'unsafe-eval'` en la CSP de
`/sw.js` — y solo de `/sw.js`, porque el SW no hereda la CSP del documento (verificado en
las dos direcciones, §2.3 del documento fuente).

Esto es un **estado del arte, no una decisión permanente**. Dos vías lo simplificarían el
día que existan, y ninguna está descartada: que los SW soporten `import()` dinámico, y
que `SharedWorker` pase a Baseline. La arquitectura de este SDD está aislada para poder
sustituir el enlazador sin tocar nada más (§4.3, §7). Es el mismo trato que ya damos a
`shadowrootadoptedstylesheets`: usamos la forma estándar y ponemos un polyfill mientras el
soporte llega (SDD-18).

**Objetivo de esta SDD:** mover el render al Service Worker, con enlazador propio,
manifest v2 como contrato único, políticas de cache por clase de recurso y CSP con nonce
por respuesta; y retirar el camino del Web Worker por completo.

---

## 2. Dependencias

| SDD | Estado | Qué aporta a esta spec |
|---|---|---|
| 14 | `Hecho` | `Dom<N>`, `SsrDom`, `signal`, `Render` de bloque. |
| 15 | `Hecho` (slice SSR servidor) | `emitPageModule` → `export function* page(data, io)`; `emitComponentModule` → `render($dom,$shadow,props)`. |
| 16 (parte 1) | `Hecho` | `@fudic/ssr`: `serializeChunks`, `htmlToByteStream`, `renderToStream`, `escapeText`/`escapeAttr`. **Se conservan intactos.** |
| 18 | `Hecho` | `<style type="module" specifier>` en `<head>` + `shadowrootadoptedstylesheets` + polyfill inline. |
| 19 | `Hecho` | Routing por filesystem, `discoverRoutes`, wrapper por ruta, prerender, dev/preview server, source maps, asset linker. |

Interfaces ya disponibles que esta SDD consume sin redefinir:

```ts
// @fudic/ssr
export function serializeChunks(root: SsrNode): Iterable<string>;
export function htmlToByteStream(
  pieces: Iterable<string> | AsyncIterable<string>,
  highWaterMark?: number,
): ReadableStream<Uint8Array>;
export function escapeText(s: string): string;

// @fudic/transport (sobrevive de SDD-16)
export type ControlMessage =
  | { readonly type: 'invalidate'; readonly route: string }
  | { readonly type: 'version'; readonly build: string }
  | { readonly type: 'purge'; readonly route: string };
export function controlBus(name?: string): ControlBus;
```

---

## 3. Interfaz pública

### 3.1. `@fudic/transport` — manifest v2 (`manifest.ts`)

```ts
export type RouteMode = 'ssr' | 'ssg' | 'sw';

export type CachePolicy =
  | 'cache-first'
  | 'network-first'
  | 'stale-while-revalidate'
  | 'network-only';

/** Política de los DATOS de una ruta. El TTL lo pone quien conoce el dato: la ruta. */
export interface DataPolicy {
  readonly policy: CachePolicy;
  readonly ttl: number | null; // ms; null = sin caducidad
}

/** Persistencia del HTML de una ruta `sw`. Por defecto NO se persiste (§4.4.4). */
export interface PagePolicy {
  readonly cache: 'never' | 'persist';
  readonly ttl: number | null; // ms; solo con 'persist'
}

export interface RouteRecord {
  readonly pattern: string;                 // '/blog/:slug'
  readonly mode: RouteMode;
  readonly chunk?: string;                  // mode 'sw': URL absoluta del chunk enlazable
  readonly deps?: readonly string[];        // mode 'sw': URLs absolutas en ORDEN TOPOLÓGICO
  readonly data?: string;                   // mode 'sw': endpoint de datos, con ':param'
  readonly dataPolicy?: DataPolicy;
  readonly page?: PagePolicy;
  readonly html?: string;                   // mode 'ssg': URL del HTML precalculado
}

export interface CspTemplates {
  /** Plantilla de la CSP de documento; contiene el token `{nonce}`. */
  readonly document: string;
  /** CSP de `/sw.js`. Lleva `'unsafe-eval'`; nunca `{nonce}`. */
  readonly sw: string;
}

export interface ManifestFile {
  readonly build: string;
  readonly csp: CspTemplates;
  readonly routes: readonly RouteRecord[]; // ordenadas por especificidad descendente
}

export interface RouteMatch {
  readonly record: RouteRecord;
  readonly params: Readonly<Record<string, string>>;
}

/** Vista compilada y SÍNCRONA del manifest: vive en memoria del SW (§4.4.1). */
export interface RouteTable {
  readonly build: string;
  readonly csp: CspTemplates;
  match(pathname: string): RouteMatch | null;
  /** Todas las rutas `sw` que comparten chunk con `pathname` (unidad de calentado = plantilla). */
  templateOf(pathname: string): RouteRecord | null;
}

/** Puro y síncrono. */
export function compileManifest(file: ManifestFile): RouteTable;

/** Lee el manifest de la cache del shell; SIN red. Rechaza si no está (§4.4.1). */
export function loadManifest(url: string, cache: Cache): Promise<RouteTable>;
```

### 3.2. `@fudic/transport` — el enlazador (`linker.ts`)

```ts
export type ModuleExports = Record<string, unknown>;

export interface LinkerConfig {
  /** Fuente de un módulo por URL. Inyectada (DIP): en producción, la cache `routes-<build>`. */
  readonly fetchSource: (url: string) => Promise<string>;
  /** Módulos resueltos dentro del propio SW por specifier desnudo (p. ej. `@fudic/ssr`). */
  readonly builtins?: Readonly<Record<string, ModuleExports>>;
}

export interface Linker {
  /** Enlaza `deps` en orden y luego `url`; memoizado y global al SW. */
  link(url: string, deps?: readonly string[]): Promise<ModuleExports>;
  has(url: string): boolean;
  /** Olvida un módulo y sus descendientes (invalidación por versión). */
  reset(): void;
}

export function createLinker(config: LinkerConfig): Linker;

/** Válvula de seguridad: ¿puede este SW evaluar? Si no, no intercepta nada (§4.1). */
export function canLink(): boolean;
```

### 3.3. `@fudic/transport` — acceso a cache (`store.ts`)

```ts
export interface CacheNames {
  readonly shell: string;  // `shell-<build>`
  readonly routes: string; // `routes-<build>`
  readonly pages: string;  // `pages-<build>`
  readonly data: string;   // `data-<build>`
}
export function cacheNames(build: string): CacheNames;

export interface StoreConfig {
  readonly cache: Cache;
  /** Reloj inyectado (tests deterministas). Default: `Date.now`. */
  readonly now?: () => number;
}

export interface Store {
  /** Aplica la política; deduplica peticiones en vuelo por URL (§4.6.2). */
  get(request: Request, policy: CachePolicy, ttl: number | null): Promise<Response>;
  /** Guarda sellando la fecha (`x-fudic-stored`). */
  put(request: Request, response: Response): Promise<void>;
  match(request: Request): Promise<Response | undefined>;
  /** Poda FIFO por orden de inserción de `cache.keys()` (§4.6.3). */
  prune(maxEntries: number): Promise<void>;
}

export function createStore(config: StoreConfig): Store;
```

### 3.4. `@fudic/transport` — contexto de render y contrato del chunk

```ts
export interface RenderContext {
  readonly origin: 'edge' | 'sw' | 'ssg';
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly mode: RouteMode;
  /** Nonce de ESTA respuesta; el chunk lo pasa al `io` para el polyfill (§4.9). */
  readonly nonce: string;
}

/** Lo que exporta un chunk de ruta enlazado. Lo genera el plugin (SDD-19 §4.3, reescrito). */
export interface RouteChunk {
  render(ctx: RenderContext): ReadableStream<Uint8Array>;
  /** Solo en rutas param prerenderizables; lo consume el build, nunca el SW. */
  readonly paths?: () => readonly Readonly<Record<string, string>>[];
}
```

### 3.5. `@fudic/transport` — el router (`router.ts`)

```ts
export interface FetchEvent {
  readonly request: Request;
  respondWith(response: Response | PromiseLike<Response>): void;
  waitUntil(p: Promise<unknown>): void;
}

export interface RouterConfig {
  readonly table: RouteTable;
  readonly linker: Linker;
  readonly stores: {
    readonly routes: Store;
    readonly pages: Store;
    readonly data: Store;
  };
  /** Genera un nonce por respuesta. Default: 128 bits de `crypto.getRandomValues`, base64url. */
  readonly nonce?: () => string;
  /** Reglas de `sw.json.resources`, ya compiladas y en orden de evaluación. */
  readonly resources?: readonly ResourceRule[];
  readonly onError?: (pathname: string, error: unknown) => void;
}

export interface ResourceRule {
  readonly pattern: string; // glob: `/api/**`
  readonly policy: CachePolicy;
  readonly ttl: number | null;
  readonly maxEntries?: number;
}

export interface Router {
  /** Decisión SÍNCRONA: llama a `respondWith` SOLO si va a renderizar/servir (§4.4.2). */
  handle(event: FetchEvent): void;
  /** Calienta la plantilla de una ruta: chunk + deps a `routes-<build>`. Idempotente. */
  warm(pathname: string): Promise<void>;
}

export function createRouter(config: RouterConfig): Router;
```

### 3.6. `@fudic/transport` — hilo principal (`main.ts`)

```ts
export function registerRenderServiceWorker(
  url: string,
  options?: RegistrationOptions,
): Promise<ServiceWorkerRegistration>;

/** Único disparador de calentado (§4.6.1): le dice al SW en qué URL está el usuario. */
export function notifyLocation(url?: string): Promise<void>;

export const LOCATION_MESSAGE = 'fudic:here';
export interface LocationMessage {
  readonly type: typeof LOCATION_MESSAGE;
  readonly url: string;
}
```

**Se retiran del paquete:** `adapter.ts` entero (`canTransferStream`, `sendRender`,
`receiveRender`), `worker.ts` entero (`serveRender`, `installRenderWorker`, `RenderChunk`),
`connectRenderWorker`, y de `messages.ts` los tipos `RenderRequest`, `RenderMessage`,
`ReqId`, `WorkerPortMessage`, `WORKER_PORT_MESSAGE`.

### 3.7. `@fudic/core` — `strategy()`

```ts
export interface StrategyDecl {
  readonly mode?: RouteMode;
  readonly data?: { readonly ttl?: string; readonly policy?: CachePolicy };
  readonly page?: { readonly cache?: 'never' | 'persist'; readonly ttl?: string };
}

/** Marcador. No hace nada en runtime: el plugin lo lee ESTÁTICAMENTE (§4.8). */
export function strategy(decl: StrategyDecl): void;
```

### 3.8. `@fudic/vite` — configuración de aplicación (`swconfig.ts`)

```ts
export interface SwConfigFile {
  readonly shell: readonly string[];
  readonly resources?: Readonly<Record<string, {
    readonly pattern: string;
    readonly policy: CachePolicy;
    readonly ttl?: string | null;
    readonly maxEntries?: number;
  }>>;
  readonly dev?: 'off' | 'preview';
}

export interface SwConfigResult {
  readonly config: ResolvedSwConfig | null; // null = no hay sw.json → no se emite SW
  readonly diagnostics: readonly FudicDiagnostic[];
}

/** Lee y valida `sw.json` de la raíz del proyecto. Nunca lanza. */
export function readSwConfig(root: string, io: FudicIo): SwConfigResult;

/** `30s` · `5m` · `2h` · `7d` → ms. `null` → null. Inválido → diagnóstico + null. */
export function parseTtl(spec: string | null | undefined): number | null;
```

### 3.9. `@fudic/vite` — extracción de estrategia (`strategy.ts`)

```ts
export interface StrategyAnalysis {
  readonly declared: boolean;
  readonly strategy: StrategyDecl;
  readonly diagnostics: readonly FudicDiagnostic[];
}

/** Busca la llamada `strategy({...})` en las regiones `@server`/neutras de la página. */
export function analyzeStrategy(source: string): StrategyAnalysis;
```

`PageAnalysis` de [`analyze.ts`](../../packages/vite/src/analyze.ts) se amplía con
`strategy: StrategyAnalysis`. `hasLoad`/`hasPaths`/`isPage` no cambian.

### 3.10. Artefactos emitidos (sustituye SDD-19 §3.5)

| Artefacto | Nombre | Cuándo |
|---|---|---|
| Bootstrap principal | `fudic-main.js` (raíz, estable) | siempre |
| Service Worker | `fudic-sw.js` (raíz, estable) | solo con `sw.json` |
| Manifest | `fudic-routes.json` (URL fija) | siempre |
| Chunk ESM por ruta | `assets/c/<ruta>-<hash>.js` | build (servidor/prerender) |
| **Chunk enlazable por ruta** | `sw/c/<ruta>-<hash>.js` | solo con `sw.json` |
| HTML prerenderizado | `<ruta>/index.html` | modo `ssg` |

El bootstrap del Web Worker (`fudic-ww.js`) **desaparece**.

---

## 4. Comportamiento

### 4.1. Las tres restricciones que gobiernan el diseño

Medidas en Chromium 151 y WebKit 26.5. No se rediscuten; se citan aquí para que esta spec
sea autocontenida.

| | Chromium 151 | WebKit 26.5 |
|---|---|---|
| `new Worker` dentro del SW | `undefined` | `undefined` |
| `new SharedWorker` dentro del SW | `undefined` | `undefined` |
| `import()` dinámico (install y runtime) | `TypeError` | `TypeError` |
| `importScripts()` **durante** install | ✔ | ✔ |
| `importScripts()` después de install | ✘ `NetworkError` | ✘ `NetworkError` |
| `new Function` / `eval` | ✔ | ✔ |
| Render en WW durante navegación | cuelga (o solo home→ruta) | cuelga / `Load failed` |

De ahí: **enlazador con `new Function`** (`importScripts` obligaría a cargar las N rutas de
golpe en el `install`), **render en el SW** y **CSP propia para `/sw.js`**.

**Válvula de seguridad.** En el arranque, el SW llama a `canLink()`
(`try { new Function('return 42')() } catch`). Si es `false` se declara inútil: **no
registra el handler de `fetch`**, y la app degrada a servidor/SSG en vez de romperse.

### 4.2. El manifest v2 — el contrato entre compilador, servidor y SW

Lo emite el plugin; lo leen el servidor (dev/preview y, en el futuro, el adaptador de
producción) y el SW. **Nadie más escribe rutas.**

```json
{
  "build": "a3f9c1",
  "csp": {
    "document": "default-src 'self'; script-src 'self' 'nonce-{nonce}'; style-src 'self' 'nonce-{nonce}'; object-src 'none'; base-uri 'self'",
    "sw": "default-src 'self'; script-src 'self' 'unsafe-eval'"
  },
  "routes": [
    { "pattern": "/blog/:slug", "mode": "sw",
      "chunk": "/sw/c/blog-a3f9c1.js",
      "deps": ["/sw/c/badge-1f2e.js", "/sw/c/layout-8c4d.js"],
      "data": "/_fudic/data/blog/:slug",
      "dataPolicy": { "policy": "cache-first", "ttl": 300000 },
      "page": { "cache": "never", "ttl": null } },
    { "pattern": "/legal", "mode": "ssg", "html": "/legal/index.html" },
    { "pattern": "/account", "mode": "ssr" }
  ]
}
```

Reglas:

1. **`deps` en orden topológico.** El `require()` del enlazador es **síncrono**: el SW
   necesita saber qué cargar antes que qué sin analizar el fuente. El orden lo da el grafo
   de Rollup, no un análisis propio.
2. **`csp` vive aquí** para que servidor y SW no puedan divergir. `{nonce}` es un token que
   sustituye quien construye la respuesta.
3. **La unidad es la plantilla de ruta, no la página.** `/blog/:slug` con 5000 slugs es
   **un** chunk: visitar un post deja servidos por el SW todos los demás.
4. **`routes` va ordenado por especificidad descendente**; `match` devuelve el primer hit,
   igual que hoy ([`manifest.ts`](../../packages/transport/src/manifest.ts)). El campo
   `dynamic` **desaparece**, sustituido por `mode`.
5. `manifestUrl` sigue siendo absoluta y validada (`FUD0365`, SDD-19).

### 4.3. El enlazador

Lo que el navegador hace con ESM, hecho a mano, porque `import()` está prohibido.

**Formato emitido.** El plugin produce una **segunda salida de Rollup** con
`format: 'cjs'`, `exports: 'named'`, `@fudic/ssr` marcado como external:

```js
// fuente (routes/blog/[slug].fud → wrapper de ruta)
import { page } from './[slug].fud';
export function render(ctx) { … }

// emitido (sw/c/blog-a3f9c1.js)
'use strict';
const ssr = require('@fudic/ssr');
const layout = require('./layout-8c4d.js');
function render(ctx) { … }
exports.render = render;
```

**Enlazado:**

```ts
const modules = new Map<string, ModuleExports>(); // GLOBAL al SW

async function load(url: string): Promise<ModuleExports> {
  const cached = modules.get(url);
  if (cached !== undefined) return cached;
  const source = await fetchSource(url);
  const module = { exports: {} as ModuleExports };
  modules.set(url, module.exports);        // ANTES de ejecutar: soporta ciclos
  const require = (spec: string): ModuleExports => {
    const builtin = builtins[spec];
    if (builtin !== undefined) return builtin;      // '@fudic/ssr', resuelto en el SW
    const dep = modules.get(new URL(spec, url).pathname);
    if (dep === undefined) throw new LinkError(spec, url);
    return dep;
  };
  new Function('exports', 'require', 'module', `${source}\n//# sourceURL=${url}`)(
    module.exports, require, module,
  );
  modules.set(url, module.exports);        // por si el módulo reasignó `module.exports`
  return module.exports;
}
```

- **`modules` es global al SW**: un componente usado por 50 rutas se compila una vez. Es
  lo que evita la duplicación de componentes entre chunks.
- **`//# sourceURL` es obligatorio**: sin él, DevTools muestra el código como anónimo y
  depurar es inviable.
- **`require` es síncrono**: `link(url, deps)` recorre `deps` **en orden** con `await`
  antes de evaluar `url`. Un specifier relativo se resuelve contra la URL del módulo que
  lo pide; uno desnudo, contra `builtins`.
- **`@fudic/ssr` va bundleado dentro de `fudic-sw.js`** y se expone como builtin. No viaja
  como dependencia enlazable: se descargaría y evaluaría aparte de un runtime que el SW ya
  tiene cargado.
- El registro se pierde al reciclarse el SW y **se reconstruye desde cache, sin red**.
- Cualquier construcción que Rollup no pueda bajar a esa salida (`import()`, top-level
  `await`, `import.meta` fuera de los tokens que el plugin sustituye) es **error duro de
  compilación** `FUD0395`, nunca un silencio que aparezca en runtime dentro de un
  `new Function`.

**Aislamiento deliberado.** El enlazador es el único módulo que sabe que no hay `import()`.
El día que los SW lo soporten, `createLinker` se sustituye por una implementación de tres
líneas sobre `import()` y **nada más cambia**: ni el router, ni el manifest (los `deps`
pasan a ser información redundante), ni el emit.

### 4.4. El router

#### 4.4.1. Todo lo necesario para decidir vive en memoria

`respondWith()` solo puede llamarse durante el dispatch del evento: la decisión de
interceptar es **síncrona**. Por tanto `RouteTable` (manifest compilado) y el conjunto de
plantillas ya cacheadas viven en variables del SW. Tras un reciclado (~30 s de
inactividad) el SW vuelve con la memoria vacía y se rehidrata desde su **propia cache, sin
red** (`loadManifest(url, shellCache)`); hasta que termina, esa primera navegación va al
servidor. El arranque **no** hace `fetch` del manifest: entró en el precache del `install`.

#### 4.4.2. `respondWith()` solo cuando se va a renderizar de verdad

> En cualquier otro caso, `return` y **no se toca la petición**.

Interceptar para luego reemitir con `fetch(request)` **duplica la petición del documento**
(dos filas en el panel de Network para la misma URL). Es un fallo real, y está **vivo hoy**
en [`bootstrap.ts:69-74`](../../packages/vite/src/bootstrap.ts#L69-L74).

Algoritmo de `handle(event)`, todo síncrono hasta el `respondWith`:

1. `request.mode !== 'navigate'` → aplicar reglas de recurso de `sw.json` (§4.7) o `return`.
2. `table.match(pathname)`; `null` → `return`.
3. `mode === 'ssr'` → `return`. **Nunca** se intercepta: el SW no descarga su chunk.
4. `mode === 'ssg'` → si el HTML está en `pages-<build>`, `respondWith(nonced(cached))`;
   si no, `return` (lo sirve la red y el `install`/warm lo cachea después).
5. `mode === 'sw'` → si la plantilla **no** está enlazable (chunk + `deps` en
   `routes-<build>`), `return` y `event.waitUntil(warm(pathname))`: esa navegación la
   sirve el servidor y la plantilla se calienta por detrás. Si lo está,
   `respondWith(render(...))`.

#### 4.4.3. El render en el SW

```
match → params → link(chunk, deps) → data → chunk.render(ctx) → Response(stream)
```

- `ctx = { origin: 'sw', url, params, mode, nonce }`. Los **params los extrae el SW** del
  patrón del manifest: retira la decisión de SDD-19 §4.3 de hornear el patrón dentro del
  chunk, que ya no hace falta.
- Los datos: si `record.data` existe, se sustituyen los `:param` por los valores y se pide
  con `stores.data.get(request, dataPolicy.policy, dataPolicy.ttl)`. Sin `data`, `{}`.
- La respuesta lleva **siempre** `content-type: text/html; charset=utf-8` y la cabecera
  `content-security-policy` construida desde `table.csp.document` con el nonce de esta
  respuesta (§4.9). Una página renderizada por el SW sin CSP sale sin política ninguna
  aunque el servidor sí la ponga: fue un fallo real del prototipo.
- Si `link` o `render` fallan → §4.13.

#### 4.4.4. Qué se cachea y qué no

| Cache | Contenido | Política |
|---|---|---|
| `shell-<build>` | `sw.json.shell` + el manifest | permanente |
| `routes-<build>` | chunks enlazables y componentes | permanente, sin caducidad (inmutables dentro de un build) |
| `pages-<build>` | HTML de rutas `ssg` | permanente |
| `data-<build>` | respuestas de los endpoints de datos | **la define la ruta** |

**Solo los datos tienen TTL.** El HTML de una ruta `ssr` **no se cachea nunca**; el de una
ruta `sw` **tampoco, por defecto** (`page.cache: 'never'`): con los datos ya en cache y un
render local de 3-8 ms, persistir el HTML ahorra poco y abre la puerta a HTML viejo con
datos frescos.

**`page.cache: 'persist'`** es la forma en que sobrevive el modo *incremental* de SDD-19
(hoy `dynamic:true` con `tee()`+`cache.put`): la ruta se renderiza una vez por URL concreta
y el HTML queda en `pages-<build>`. Es **opt-in por ruta** y arrastra una regla no
negociable: **una ruta nunca tiene dos TTL.** Con `persist`, el TTL del HTML **es** el del
dato (`page.ttl` se ignora si difiere de `data.ttl`, con `FUD0396`), y una invalidación de
datos purga también el HTML de esa URL.

### 4.5. Los datos: `@server load` compilado a endpoint

El documento fuente declara `data` como una URL escrita a mano. En fudic **manda nuestro
modelo**: `@server load(ctx)` sigue siendo la fuente única, y el plugin le genera un
endpoint.

- El plugin emite, por cada ruta `sw` cuya página exporte `load`, un handler en
  `/_fudic/data/<patrón>` (JSON). El campo `data` del manifest es **generado**, nunca
  escrito por el desarrollador.
- **Dos llamadores del mismo código**: el edge/prerender invoca `load(ctx)` en proceso
  (sin HTTP); el SW lo pide por HTTP y lo cachea con la política de la ruta.
- `ctx` del endpoint es el mismo `RenderContext` menos `nonce`, con `origin: 'edge'`.
- Servirlo es responsabilidad del servidor: en v1, el middleware de dev y de preview
  (§4.11). El adaptador de producción queda fuera de alcance (§7).

### 4.6. Reglas de carga — no negociables

Cada una tiene una regresión real detrás.

1. **El `install` precachea el shell y nada más.** Ni un chunk de ruta. Con 100 rutas,
   precargarlas todas es inaceptable. El manifest se añade solo: el SW lo necesita para
   funcionar.
2. **Un solo disparador de calentado.** El prototipo tenía dos (`activate` y el mensaje del
   documento) y ninguno esperaba al otro: los dos fallaban la cache y **cada chunk se
   descargaba dos veces**. Aquí el disparador es **uno**: el mensaje `fudic:here` que
   `notifyLocation()` envía desde el hilo principal. `activate` **no** calienta.
3. **Deduplicación de peticiones en vuelo.** Un `Map<url, Promise<Response>>` dentro de
   `Store`: dos llamadas concurrentes a la misma URL comparten una petición de red y cada
   llamante recibe su propio `clone()` del cuerpo.
4. **`respondWith()` solo cuando se va a renderizar** (§4.4.2).
5. **No se cachea HTML de rutas `ssr` ni `sw`** (salvo `persist` explícito, §4.4.4).
6. **Poda**: `maxEntries` se aplica en FIFO por el orden de inserción que devuelve
   `cache.keys()`. LRU real exige llevar cuenta de accesos, que la Cache API no da; una
   entrada de índice en IndexedDB queda **fuera de v1**.

Primera visita a `/blog/streams`, en frío, con estas reglas:

```
document           servidor
style.css          el documento   } el install los repite,
fudic-main.js      el documento   } pero salen de la cache HTTP
fudic-sw.js        registro
fudic-routes.json  install
badge.js           calentado de la plantilla   una vez
layout.js          calentado de la plantilla   una vez
blog.js            calentado de la plantilla   una vez
```

Las siguientes páginas de `/blog/:slug` no piden nada más que su JSON de datos — y si el
TTL no ha vencido, ni eso.

### 4.7. `sw.json` — configuración de la aplicación

Lo escribe el desarrollador, en la raíz del proyecto. Define **el shell y las políticas de
cache por clase de recurso**. No define rutas: eso es de cada página (§4.8).

**Si `sw.json` no existe, no se emite Service Worker y todo es servidor/SSG.** Decisión
explícita, no defecto silencioso.

```json
{
  "shell": ["/style.css", "/fudic-main.js", "/fonts/inter.woff2"],
  "resources": {
    "assets": { "pattern": "/assets/**", "policy": "cache-first", "ttl": null, "maxEntries": 200 },
    "images": { "pattern": "/img/**", "policy": "stale-while-revalidate", "ttl": "7d", "maxEntries": 60 },
    "api":    { "pattern": "/api/**", "policy": "network-first", "ttl": "5m" }
  },
  "dev": "off"
}
```

- El primer patrón que casa gana; el orden del objeto es el orden de evaluación.
- `ttl`: `30s` · `5m` · `2h` · `7d`; `null` = sin caducidad. Formato inválido → `FUD0392`.
- Una entrada de `shell` que no exista en el bundle → `FUD0391` (warning; el `install` no
  debe fallar por un fichero de más).
- `stale-while-revalidate` **sirve lo caducado y refresca por detrás**; el resto de
  políticas esperan a la red cuando el TTL ha vencido. Una página **puede** renderizarse
  con datos viejos si su ruta declara esa política, y solo entonces.

### 4.8. `strategy()` — la estrategia la declara la página

Configurar 100 rutas en un único fichero obliga a todos los desarrolladores a converger en
él. La estrategia se declara **en la propia página**:

```js
@code
  @server {
    import { strategy } from '@fudic/core';

    strategy({
      mode: 'sw',
      data: { ttl: '5m', policy: 'cache-first' },
    });

    export async function load(ctx) { … }
  }
@end
```

#### 4.8.1. Extracción

`analyzeStrategy` busca, sobre el AST de Oxc de las regiones del `@code`, una
`CallExpression` cuyo callee sea el identificador importado de `@fudic/core` como
`strategy`, a nivel de sentencia del módulo. Su único argumento debe ser un **objeto
literal con valores literales**: si no lo es, `FUD0393` (error) y la ruta cae al defecto.
Más de una llamada → `FUD0394` (error), se toma la primera. `strategy()` **no se ejecuta
nunca** en build.

#### 4.8.2. Autoridad única: gana la página

Se retira el `override` por ruta de [`options.ts`](../../packages/vite/src/options.ts): el
bloque `routes` de la config pasa a ser **`defaults`** y solo aplica a rutas que **no**
llaman a `strategy()`. Así hay una sola autoridad y es la más específica. Si una ruta
declara `strategy()` y además aparece en `defaults`, se emite `FUD0397` (warning) y gana la
página.

#### 4.8.3. Defecto cuando no se declara

El documento fuente propone `ssr` como defecto universal. fudic conserva su inferencia
—que ya está implementada y probada— **como proveedora de defaults**, porque nuestro
routing por filesystem sí conoce los hechos:

| hechos de la página | modo por defecto |
|---|---|
| sin params, sin `load` | `ssg` (prerender en build) |
| sin params, con `load` | `sw` |
| con params, con `paths()` | `ssg` enumerado (+ `sw` para los ids no enumerados si `paramFallback: 'lazy'`) |
| con params, sin `paths()` | `sw` |

`mode: 'ssr'` nunca se infiere: hay que declararlo. Es lo correcto para una ruta con
sesión o permisos, y quien la escribe lo sabe.

### 4.9. CSP con nonce

Tres realms, independientes (verificado en las dos direcciones):

| respuesta | cabecera |
|---|---|
| documentos | `script-src 'self' 'nonce-<n>'; style-src 'self' 'nonce-<n>'` |
| `/fudic-sw.js` | `script-src 'self' 'unsafe-eval'` — aquí vive el `new Function` |

**El polyfill de SDD-18 es requisito**, y es un `<script>` inline en `<head>`: sin nonce,
`script-src 'self'` lo mata y los estilos adoptados no se aplican. Por tanto:

1. Quien construye la `Response` acuña el nonce (128 bits, `crypto.getRandomValues`,
   base64url) y lo escribe **en la cabecera y en el atributo** `nonce` del `<script>`.
2. El emit deja de escribir el polyfill con nonce constante: `io` gana un campo `nonce`
   que `page(data, io)` propaga al `<script nonce>` y a cada `<style>` que emite el
   serializador. Es el **único** cambio que esta SDD pide al emit de SDD-15/18.
3. **HTML SSG cacheado**: lleva el nonce horneado del build, y un nonce constante no es un
   nonce. El HTML prerenderizado se emite con el token literal `__FUDIC_NONCE__`, y quien
   lo sirve —SW desde cache, o el servidor desde disco— lo sustituye al vuelo con un
   `TransformStream` sobre el stream. Una sola aparición por documento, en el `<head>`:
   coste despreciable, un solo mecanismo para los tres orígenes.
4. **`style-src`**: el documento fuente da por hecho que hace falta `'unsafe-inline'`
   porque los `<style>` de un shadow root declarativo son estilos inline a efectos de CSP.
   Con SDD-18 **todos** nuestros `<style>` los emite nuestro serializador y pueden llevar
   `nonce`. La spec **exige medir** si `nonce` basta en Chromium y WebKit (§6.19): si
   basta, `style-src` va sin `'unsafe-inline'`; si no, se añade y se documenta como peaje
   conocido de hacer DSD con CSP estricta. Ninguna de las dos ramas bloquea el resto.

### 4.10. Build id, invalidación y versión

- El plugin calcula `build` (hash corto del contenido del bundle) y lo inyecta tanto en el
  manifest como en el texto de `fudic-sw.js`. Como el contenido del SW cambia en cada
  compilación, el navegador detecta actualización → `install` → `activate` → purga.
- **Todas las caches llevan el build id en el nombre** (`routes-a3f9c1`). En `activate` se
  borra toda cache cuyo build id no sea el actual, y el enlazador hace `reset()`.
- `/fudic-sw.js` y `/fudic-routes.json` se sirven con `no-cache`; el registro usa
  `{ type: 'module', updateViaCache: 'none' }`. El resto de estáticos, con cache real: con
  `no-cache` en todo, el precache del `install` vuelve a bajar de red lo que el documento
  acaba de pedir (causa de las descargas duplicadas del prototipo).
- El `controlBus` de SDD-16 sigue siendo el canal de control, out-of-band: `invalidate` y
  `purge` borran una entrada; `version` purga las caches del build viejo.

### 4.11. Dev y preview

**Opción A: el SW no se registra en dev.** `fudic-main.js` omite el registro cuando
`import.meta.env.DEV`, salvo que `sw.json` declare `"dev": "preview"`. Razones: el servidor
de dev de Vite sirve ESM sin transformar y el enlazador necesita el formato
`exports`/`require`, así que en dev habría que emitir además esa versión por un middleware;
y cada cambio purgaría y recalentaría todo, con un reload extra por el
`skipWaiting`/`claim`. Es lo que hacen SvelteKit, Next y Nuxt.

Con `"dev": "preview"` sí se registra, y el middleware de dev sirve además los chunks
enlazables bajo `/sw/c/…` transformándolos a `cjs` con `transformWithOxc`.

En **dev y preview** el middleware existente ([`plugin.ts`](../../packages/vite/src/plugin.ts))
asume además el papel de *edge* de §9 del documento fuente:

1. Sirve los endpoints de datos (§4.5).
2. Añade `content-security-policy` a cada documento desde el manifest, con nonce por
   respuesta, y a `/fudic-sw.js` la suya con `'unsafe-eval'`.
3. Sustituye `__FUDIC_NONCE__` en el HTML prerenderizado que sirve.
4. Renderiza on-demand cualquier ruta `sw` o `ssr` (ya lo hace).

**No se sirve ni un HTML de disco sin pasar por (3).** No existe `index.html`: la home es
una ruta del manifest como cualquier otra.

### 4.12. Retirada del camino Web Worker (mapa de borrado)

| Fichero | Acción |
|---|---|
| `packages/transport/src/worker.ts` | borrar |
| `packages/transport/src/adapter.ts` | borrar (con él, toda la degradación de Safari) |
| `packages/transport/src/main.ts` | `connectRenderWorker` borrado; `notifyLocation` nuevo |
| `packages/transport/src/messages.ts` | quedan `ControlMessage` y `LocationMessage` |
| `packages/transport/src/router.ts` | reescrito (§4.4) |
| `packages/transport/src/manifest.ts` | reescrito (§4.2) |
| `packages/vite/src/bootstrap.ts` | `emitWwBootstrap` borrado; SW y main reescritos |
| `packages/vite/src/wrapper.ts` | `default (route)` → `render(ctx)`; sin extracción de params |
| `packages/vite/src/mode.ts` | `dynamic` → `RouteMode`; `override` → `defaults` |
| `packages/vite/src/constants.ts` | `WW_ID`, `DEV_WW_URL` fuera |
| `examples/basic` | adaptado a este modelo y solo a este (§6.18) |

Los tests que cubren el transporte de streams entre hilos se borran con su código; los del
router se reescriben. Ninguna otra suite (compiler, dom, ssr, core) debería moverse.

### 4.13. Fallo de enlazado en producción

Si `link()` rechaza (dependencia no enlazada, fuente ausente en cache, `new Function`
lanza) o `render()` falla:

1. La navegación **cae al servidor**: la `Response` se resuelve con `fetch(request)`. Es
   la única excepción a §4.4.2, y es correcta porque aquí sí íbamos a renderizar: no hay
   petición duplicada, hay una sola, la de rescate.
2. La respuesta lleva `x-fudic-fallback: <razón>` para que sea visible en Network.
3. **Esa ruta se marca inservible en memoria del SW** hasta el próximo arranque: no se
   reintenta en cada navegación.
4. Se emite `{ type: 'invalidate', route }` por el `controlBus` y se llama a `onError`.

---

## 5. Invariantes

Transversales, como en todos los SDD:

- **El SW nunca lanza al exterior.** Todo camino de error termina en una `Response`: la
  del servidor (§4.13) o una del render. Una excepción sin capturar en un handler de
  `fetch` deja la navegación colgada, que es exactamente lo que esta SDD viene a arreglar.
- **La decisión de interceptar es síncrona y conservadora.** Ante cualquier duda, `return`.
- **Un único origen de verdad para rutas**: el manifest. Ni el servidor ni el SW ni el
  ejemplo cablean una ruta.
- **Spans y diagnósticos** en todo lo que toca el plugin: cada error de configuración
  (`sw.json`, `strategy()`) es un `FudicDiagnostic` con código y fichero, nunca un throw.
- **El build no aborta** por una página rota: warning y se sigue (invariante de SDD-19 §5).
- **`@fudic/ssr`, `@fudic/dom`, `@fudic/compiler` no se tocan** salvo el campo `nonce` del
  `io` (§4.9.2).

### Catálogo de diagnósticos (`FUD0390`–`FUD0419`)

| Código | Severidad | Cuándo |
|---|---|---|
| `FUD0390` | error | `sw.json` malformado (JSON inválido o sin `shell`) |
| `FUD0391` | warning | entrada de `shell` que no existe en el bundle |
| `FUD0392` | error | `ttl` con formato inválido (esperado `30s`/`5m`/`2h`/`7d`/`null`) |
| `FUD0393` | error | `strategy()` con argumento no literal (no es analizable estáticamente) |
| `FUD0394` | error | más de una llamada a `strategy()` en una página |
| `FUD0395` | error | construcción no soportada por el formato enlazable (`import()`, TLA) |
| `FUD0396` | warning | `page.ttl` distinto de `data.ttl` con `cache: 'persist'` (gana el del dato) |
| `FUD0397` | warning | la ruta declara `strategy()` y además aparece en `defaults` |
| `FUD0398` | error | `mode: 'ssg'` en una ruta param sin `paths()` |
| `FUD0399` | warning | ruta `sw` cuyo chunk enlazable no se pudo emitir |

---

## 6. Criterios de aceptación

Unitarios salvo donde se indique. Los de navegador corren con Playwright
(`chromium` **y** `webkit`), devDependency exacta de `examples/basic`.

**Manifest**

1. `compileManifest` con `['/blog/:slug', '/blog/new']` (orden por especificidad) hace
   `match('/blog/new')` → el registro estático, y `match('/blog/x')` → el param con
   `params.slug === 'x'`. `match('/nope')` → `null`.
2. `templateOf('/blog/a')` y `templateOf('/blog/b')` devuelven **el mismo** registro.
3. `loadManifest` lee de la `Cache` inyectada y **no hace ningún `fetch`**; si no está en
   cache, rechaza.

**Enlazador**

4. `link(url, [a, b])` evalúa `a`, `b` y `url` **en ese orden** (traza del `fetchSource`
   falso) y devuelve los `exports` de `url`.
5. Un módulo `require`ado dos veces por dos chunks distintos se **evalúa una sola vez**
   (contador del `fetchSource`).
6. Un ciclo `a → b → a` enlaza sin colgarse: `b` ve el objeto `exports` (aún incompleto)
   de `a`, no `undefined`.
7. `require('@fudic/ssr')` devuelve el builtin sin tocar `fetchSource`.
8. Un `require` de una dependencia no enlazada lanza `LinkError` con el specifier y la URL
   que lo pedía en el mensaje.
9. El texto evaluado termina en `//# sourceURL=<url>` (comprobado sobre el `new Function`
   espiado).

**Store**

10. Dos `get()` concurrentes de la misma URL producen **una** llamada a `fetch`, y cada
    llamante recibe un cuerpo legible e independiente.
11. `cache-first` con `ttl: 5m` y una entrada sellada hace 6 min → va a red;
    sellada hace 4 min → no va. `stale-while-revalidate` en el mismo caso devuelve lo
    caducado **y** dispara la revalidación.
12. `prune(2)` sobre una cache con 4 entradas deja las 2 **últimas insertadas**.

**Router**

13. Petición no-navegación → `respondWith` **no se llama**. Ruta `ssr` → tampoco. Ruta
    `sw` con plantilla fría → tampoco, y `waitUntil` recibe la promesa de `warm`.
14. Ruta `sw` caliente → `respondWith` **una vez**, con `content-type: text/html` y una
    cabecera `content-security-policy` que contiene un `nonce-` distinto en dos llamadas
    consecutivas.
15. `chunk.render` recibe `ctx` con `origin:'sw'`, `params` extraídos del patrón y el mismo
    nonce que viaja en la cabecera.
16. `link` que rechaza → una única `Response`, la del `fetch` de rescate, con
    `x-fudic-fallback`; la segunda navegación a esa ruta **no vuelve a intentar enlazar**.
17. Ruta `ssg` con HTML en cache → se sirve con `__FUDIC_NONCE__` ya sustituido por el
    nonce de la cabecera.
18. `canLink() === false` → `createRouter` devuelve un router cuyo `handle` no llama nunca
    a `respondWith`.

**Plugin**

19. Sin `sw.json`: el build no emite `fudic-sw.js` ni chunks `sw/c/…`, y todas las rutas
    del manifest son `ssg` o `ssr`.
20. Con `sw.json`: se emite la segunda salida enlazable, cada ruta `sw` trae `chunk` y
    `deps` **en orden topológico** (verificado contra el grafo del bundle), y evaluar ese
    chunk con el enlazador real produce un `render` invocable.
21. `analyzeStrategy` extrae `{ mode:'sw', data:{ ttl:'5m' } }` de una página; con
    `strategy(config)` (identificador, no literal) emite `FUD0393`; con dos llamadas,
    `FUD0394`.
22. Una ruta con `strategy({mode:'ssg'})` y una entrada en `defaults` que dice otra cosa
    → gana la página + `FUD0397`.
23. Los defaults de §4.8.3 se cumplen sobre los cuatro fixtures actuales de
    `examples/basic` (sin `strategy()` en ninguno, el manifest sale idéntico en modos a lo
    que hoy produce `dynamic`).

**Navegador (Playwright, Chromium y WebKit)**

24. **Cadena ruta→ruta**, que es la que mata al Web Worker: `/` → `/blog/a` → `/blog/b`,
    las tres completan, con el HTML íntegro y `document.querySelector('app-card').shadowRoot`
    no nulo (DSD materializado). 5/5 en ambos motores.
25. **Sin petición duplicada**: en la navegación servida por el SW hay **exactamente una**
    entrada de red para el documento (contada por CDP en Chromium y por
    `page.on('request')` en WebKit).
26. **Polyfill vivo con CSP estricta**: la respuesta trae `content-security-policy` sin
    `'unsafe-inline'` en `script-src`, no hay violaciones en consola, y los estilos
    adoptados se aplican (`shadowRoot.adoptedStyleSheets.length > 0`). El mismo test mide
    si `style-src` puede prescindir de `'unsafe-inline'` (§4.9.4) y **fija la plantilla de
    CSP con el resultado**.
27. **Segunda visita en frío tras reciclado**: matando el SW y navegando de nuevo, la
    plantilla se sirve desde cache **sin red** (0 peticiones a `/sw/c/…`).

---

## 7. Fuera de alcance

- **Rama de cliente / hidratación de SDD-15 y SDD-17**: sigue en pausa. Esta SDD produce
  HTML DSD cero-JS de ruta, igual que hoy.
- **Adaptador de servidor de producción** (Node/Cloudflare). En v1 el *edge* es el
  middleware de dev y preview. El manifest y los endpoints de datos están diseñados para
  que ese adaptador sea un envoltorio, no un rediseño.
- **LRU real** con índice en IndexedDB: v1 poda FIFO.
- **Backpressure entre orígenes**: ya no hay transporte entre hilos; desaparece el problema.
- **`SharedWorker` y `import()` en SW**: cuando existan, sustituyen al enlazador (§4.3) sin
  tocar el resto. No se implementa ninguna preparación especulativa.
- **`srcset`** y el resto de lo que SDD-19 §7 ya dejaba fuera.
