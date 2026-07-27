# SDD-19 — Build + plugin Vite (routing por FS · SSG incremental)

> **Estado:** `Hecho` (Slice 1; los 18 criterios de §6 verdes. Hidratación de SDD-15 y `srcset` fuera de alcance, §7).
> **Paquete:** `@fudic/vite` (nuevo), contra `@fudic/compiler` (emit) · `@fudic/ssr` · `@fudic/transport`.
> **Depende de:** 13, 15 (slice SSR-servidor), 16.
> **Rango de diagnósticos:** `FUD0360`–`FUD0389`.
> **Decisiones de gramática:** — (tooling/build; sin decisiones de gramática).
>
> **Alcance — Slice 1.** Este SDD se implementa por partes, en paralelo al troceado de SDD-15.
> La **Slice 1** —la única `Listo`— construye el plugin **sobre el emit SSR-servidor que ya
> existe** (`resolveComponents` + `emitComponentModule` + `emitPageModule`, commits `7623a49` +
> `44c31ad`): descubrimiento de rutas por filesystem, wrapper `RenderChunk`, los dos modos de
> SSG, resolución de assets, source maps, y los tres bootstraps (SW/WW/main). **La rama de
> cliente/hidratación de SDD-15 está EN PAUSA por rendimiento (decisión de Pedro):** los chunks
> de hidratación, el `fud-chunks` `tag→url` y el doble build server/cliente **quedan fuera de
> alcance** (§7) y se enchufan cuando esa rama aterrice. La Slice 1 produce páginas SSR/cero-JS
> servidas por HTTP real: es el **instrumento de medición** del path de render aislado de la
> hidratación.
>
> **Amplía SDD-16, sin romperlo.** El único cambio en `@fudic/transport` es que
> `loadManifest.match` pasa de lookup exacto a **matcher de patrones** (§4.7). Las interfaces
> públicas `RouteManifest`/`ManifestEntry`/`RenderRequest` quedan **intactas**; los params **no
> entran en el contrato** (viven dentro del chunk, §4.3). Es una ampliación análoga a la de
> SDD-15 sobre SDD-14.

---

## 1. Contexto y objetivo

El compilador es **fs-free y LSP-first**: emite texto y no toca red ni disco (`ResolveIo`
inyectado, SDD-15 §resolve). Falta la pieza que lo convierte en un sitio **servido**: descubrir
los `.fud`, orquestar el emit, resolver URLs con hash, producir el manifest `route→chunk` que
`@fudic/transport` ya consume pero **nadie produce**, y generar los bootstraps de los tres hilos.

Ese es el plugin. El principio rector:

> **El compilador compila; el plugin enlaza.** Vite entra aquí como **bundler y dev-server,
> nunca como parser** (regla dura de `CLAUDE.md`: "No usar Vite/Rolldown para parsear `.fud`").
> El parser hand-written y Oxc siguen siendo la única vía de análisis; Vite solo resuelve
> módulos, hashea, sirve y empaqueta el **resultado** del emit.

Casi todo el enlazado lo hace Vite gratis: como el emit ya produce **ESM con imports relativos**
entre componentes, exponer cada `.fud` como módulo hace que el bundler de Vite resuelva el grafo
`tag→chunk`, hashee y tree-shakee `@fudic/core` **sin linker propio**. El plugin solo enlaza a
mano donde Vite es ciego: **assets dentro de strings emitidos** (§4.5) y los **manifests
post-hash** (§4.7).

**Los dos modos de SSG** que este SDD posee mapean sobre el booleano `dynamic` que SDD-16 ya
implementa (§4.2), de modo que el `router.ts` **no cambia**:

- **Modo 1 — HTML directo (SSG eager).** `page` corre en **build**, se escribe un `.html`.
  `dynamic:false`: el SW no intercepta, lo sirve un servidor estático/CDN.
- **Modo 2 — incremental (SSG lazy).** `page` corre en el **WW en la primera petición**; el SW
  cachea el resultado (`tee → caches.put`), y las siguientes son cache hit. El artefacto persiste
  en `CacheStorage`. El build **no** prerenderiza los params: coste de build **O(rutas), no
  O(instancias)** — la velocidad de compilación y el lazyload que motivan el modo.

**Materialización por cliente (garantía honesta de v1).** El "render server" es el **WW local**,
así que el cache incremental es **por cliente**, no un store de origen compartido: la primera
visita de *cada* cliente re-renderiza una vez (rápido, local, sin red) y luego sirve estático.
No es ISR de servidor. El mismo chunk desplegado en un edge worker (Cloudflare) daría cache
compartido por POP —mismo target de emit—, pero eso es despliegue, fuera de este SDD.

---

## 2. Dependencias

| Fuente | Aporta |
|---|---|
| SDD-13 | `SourceMapBuilder` + `LineMap` + `rangeOf`. El hook `transform` devuelve `{ code, map }` y convierte cada `Diagnostic` (offset) en `Range` para Vite. **Prerrequisito duro: SDD-13 debe estar `Hecho` antes de esta slice.** |
| SDD-15 (slice SSR-servidor) | `resolveComponents(entry, io)` → `ComponentGraph`, `ResolveIo` (`read`/`resolve`, el seam que el plugin respalda con Vite), `emitComponentModule`, `emitPageModule`, `linkHref`, `CodeWriter`. Más los **dos ajustes de emit** que §4.11 especifica. |
| SDD-16 | `loadManifest`/`RouteManifest`/`ManifestEntry` (el `match` que este SDD amplía a patrones), `createRouter`, `installRenderWorker`/`serveRender`/`RenderChunk`, `controlBus`/`ControlMessage`, `registerRenderServiceWorker`. |
| SDD-14 / `@fudic/ssr` | `SsrDom`, `renderToString`, `htmlToByteStream`, `escapeText`. El wrapper `RenderChunk` inyecta el `io` de servidor (§4.3). |

---

## 3. Interfaz pública

Ubicación: `packages/vite/src/` (entrada `index.ts`). Vite es **peerDependency**. Todo en inglés.

### 3.1. El plugin

```ts
import { type Plugin } from 'vite';

/** The fudic Vite plugin. Bundler/dev-server integration only; never parses `.fud`. */
export function fudic(options?: FudicOptions): Plugin;
```

### 3.2. Opciones (el "JSON de configuración")

Se pasan inline en `vite.config` o se cargan de un `fudic.json` en la raíz del proyecto (mismos
campos). El **modo de cada ruta se infiere** (§4.2); estas opciones fijan defaults y overrides.

```ts
export interface FudicOptions {
  /** Directory of page `.fud` files, relative to project root. Default: `'routes'`. */
  readonly routesDir?: string;
  /** Absolute URL where the route manifest is published (SW and WW load the SAME one). Default: `${base}fudic-routes.json`. */
  readonly manifestUrl?: string;
  /** Global default for eager prerender of static routes. Default: `true`. */
  readonly prerender?: boolean;
  /** A dynamic segment id absent from `paths()`: render lazily (incremental) or 404. Default: `'lazy'`. */
  readonly paramFallback?: 'lazy' | 'notFound';
  /** Per-route overrides keyed by route pattern (e.g. `'/admin'`): force a mode or exclude. */
  readonly routes?: Readonly<Record<string, RouteOverride>>;
}

export type RouteOverride =
  | { readonly mode: 'static' }        // force eager prerender
  | { readonly mode: 'incremental' }   // force lazy SSG
  | { readonly mode: 'exclude' };      // not a fudic route (Vite/other handler owns it)
```

`outDir` y `base` **no** se declaran aquí: se leen de la config de Vite (`config.build.outDir`,
`config.base`), fuente única. `manifestUrl` deriva de `base` si se omite.

### 3.3. Los hooks de servidor de una página (`@server`)

Contrato mínimo que una página `.fud` expone desde su región `@code { @server { … } }` para que
sus datos sean resolubles. Cierra **parcialmente** la punta abierta de SDD-15 §7 (solo la forma
de entrada; la materialización del grafo raíz sigue fuera).

```ts
export interface LoadContext {
  /** Params extracted from the concrete route by the chunk (e.g. `{ id: '42' }`). */
  readonly params: Readonly<Record<string, string>>;
}

// Exported by the page's @server region. Both optional.
//   export function load(ctx: LoadContext): Data | Promise<Data>;
//   export function paths(): Iterable<Record<string, string>> | Promise<Iterable<Record<string, string>>>;
```

- **`load(ctx)`** produce el `data` de `page(data, io)`. Corre en **build** (modo 1) o en el
  **WW por petición** (modo 2). Misma función, dos momentos — espejo de "un `page`, dos `io`".
  Ausente ⇒ `data = {}`.
- **`paths()`** enumera el espacio de params en **build**. Su **presencia hace prerenderizable**
  una ruta con params (§4.2).

### 3.4. Extensión del matcher de rutas (amplía SDD-16)

`ManifestEntry` (`{ dynamic, chunk }`) y la firma `match(route): ManifestEntry | null` quedan
**sin cambio**. Lo que cambia es el **formato del fichero** y el algoritmo interno:

```ts
/** One published route: a pattern, its mode, its chunk. The manifest file is an ORDERED list. */
export interface RouteRecord {
  readonly pattern: string;  // e.g. '/customer/:id'  (':name' marks a param segment)
  readonly dynamic: boolean; // false = mode 1 (static file); true = mode 2 (incremental)
  readonly chunk: string;    // WW import() target, resolved against the worker script URL
}

/** The manifest file: ordered by descending specificity; `match` returns the FIRST hit. */
export type RouteManifestFile = readonly RouteRecord[];
```

`loadManifest` compila cada `pattern` a un matcher de segmentos y recorre la lista en orden
(§4.7). El resto de `@fudic/transport` no se entera.

### 3.5. Artefactos emitidos

El plugin genera, además de los chunks de vista y componentes, tres módulos de arranque y el
manifest (§4.8). No exponen API de usuario; su forma es contrato hacia el runtime de SDD-16.

---

## 4. Comportamiento

### 4.1. Descubrimiento y routing por filesystem

- El plugin recorre `routesDir` y trata cada `.fud` cuyo `structureDocument` sea **`PageDocument`**
  (doctype) como una ruta. Un `ComponentDocument` bajo `routesDir` **no** es ruta: entra por el
  grafo de `<link rel="component">` (`resolveComponents`) como cualquier componente.
- **Mapeo path:** el árbol de directorios es el path. `routes/index.fud` → `/`;
  `routes/customer/index.fud` → `/customer`; `routes/customer/[id].fud` → patrón `/customer/:id`.
  El token de segmento dinámico es **bracket, `[id]`** (única forma). Segmentos anidados componen.
- **Especificidad:** las rutas se ordenan **estático antes que param antes que catch-all**, por
  número de segmentos y de literales. `/customer/new` gana a `/customer/:id`. El orden se congela
  en el `RouteManifestFile` (§4.7); el matcher toma el primero.
- No hay router en el hilo principal: esto es puramente build-time. El navegador gobierna la
  navegación (`FetchEvent`); el manifest solo dice **qué chunk** y **qué modo**.

### 4.2. Resolución del modo (la escalera SSG)

Para cada ruta, el modo se **infiere** (salvo override en `options.routes`):

1. **Sin params y `data` build-resoluble** (sin `@server load`, o `load` sin dependencia de
   petición) → **modo 1 (estático)**: prerender en build, `dynamic:false`.
2. **Con params, sin `paths()`** → **modo 2 (incremental)**: `dynamic:true`, sin prerender.
3. **Con `paths()`** → prerender en build **el subconjunto** que `paths()` devuelve (warm de los
   ids calientes) como `dynamic:false` por-instancia; los ids no enumerados caen según
   `paramFallback`: `'lazy'` (una entrada `dynamic:true` para el patrón) o `'notFound'`.
4. **Default-safe:** ante duda (p. ej. `load` presente pero no se puede probar build-resolubilidad
   estática), **`dynamic:true`**. El WW siempre puede renderizar; peor caso, más lento, nunca
   incorrecto.

`prerender: false` global degrada el modo 1 a incremental (útil en dev o builds rápidos).

### 4.3. El wrapper `RenderChunk` (el corazón de la integración)

El WW espera `default: (route: string) => ReadableStream<Uint8Array>` (SDD-16 `worker.ts`), lo
invoca con la **ruta cruda** y re-matchea del manifest compartido. El emit produce `page(data,
io)`. El plugin genera **el wrapper** que los une —el glue que `out/run.mts` hace a mano—,
cerrando sobre el **patrón de la ruta horneado en build**:

```js
// generado por el plugin, por página
import { page } from './<page>.fud';
import { SsrDom, serializeChunks, htmlToByteStream, escapeText } from '@fudic/ssr';
import { load } from './<page>.fud?server';   // la región @server de la página

const PARAMS = ['id'];                          // nombres, del patrón /customer/:id
const io = { createDom: () => new SsrDom(), serialize: serializeChunks, escapeText };

export default function (route) {
  return htmlToByteStream((async function* () {
    const params = extractParams(route, PARAMS);   // el patrón vive en el chunk
    const data = load ? await load({ params }) : {};
    yield* page(data, io);   // page CEDE piezas: <head>, luego el cuerpo por trozos, luego </html>
  })());
}
```

- **Params, `load` y serialización viven DENTRO del chunk** → el contrato de `@fudic/transport`
  no gana params (§3.4). La clave de cache es la **URL concreta** (`caches.put(request)`), así que
  `/customer/42` y `/customer/43` cachean por separado **solos**: el incremental por-id sale
  gratis.
- **Streaming a trozos (decisión de Pedro).** `page` se emite como **generador** que **cede** el
  `<head>` primero y luego el cuerpo por piezas vía `serializeChunks` (SDD-16); `htmlToByteStream`
  las convierte en `ReadableStream<Uint8Array>` con backpressure. El navegador empieza a pintar
  antes de que el documento entero exista. Esto exige el ajuste de emit de §4.11.3.
- **Un `page`, dos `io`:** el WW inyecta `serialize: serializeChunks` (streaming); el build de
  modo 1 (§4.4) inyecta el mismo generador y **junta** las piezas a un string para el `.html`.

### 4.4. Emit de página estática (modo 1)

Para una ruta `dynamic:false`, el build consume el **mismo generador `page`** (§4.3), **junta** sus
piezas a un string y **escribe el `.html`** en `outDir` (`/customer/new` → `customer/new/index.html`,
o `index.html` en la raíz). `load` (y `paths` para el fan-out) corren en build. Es `out/run.mts`
generalizado, sin datos hardcodeados. El streaming solo importa en el WW (modo 2); en build el
documento es un fichero, así que se colapsa a string — mismas piezas, distinto consumo.

### 4.5. El linker de assets (el único enlazado a mano)

Vite es ciego a las URLs dentro de strings emitidos (`setAttr($n,'src',"…")`) y dentro del
`export const css = \`… url(…) …\``. El plugin:

- Con los **spans** que el emit expone (§4.11), extrae cada ref de asset (`src`, `srcset`,
  `poster`, `href` de `<link rel=stylesheet>`, y `url(…)` del CSS), la pasa por `this.resolve`
  + `this.emitFile` de Vite (hash, `base`, cache inmutable) y **reescribe** la salida con la URL
  final.
- **Refs dinámicas** (src computado, no literal) → se dejan tal cual: URL de runtime. Postura
  permisiva, hermana del bus ("no protegemos lo que no podemos ver").

### 4.6. Source maps

`transform` devuelve `{ code, map }`. El `map` lo construye `SourceMapBuilder` (SDD-13) sobre los
pares `(offset de salida ↔ offset de fuente)` que el emit ancla. El salto **buffer JS → fuente**
lo resuelve `mapOffset` (SDD-11) **antes** de `addMapping` (SDD-13 §Composición). Vite encadena el
map por el resto de su pipeline. Los `Diagnostic` del compilador se elevan a errores/avisos de
Vite convirtiendo su `span` en `Range` con `rangeOf(lineMap, span)`.

### 4.7. El manifest y el `match` por patrón (amplía SDD-16)

- El plugin emite el `RouteManifestFile` (§3.4) en una **URL absoluta única** (`manifestUrl`), que
  SW y WW cargan igual — la fuente única de SDD-16, versionada con el build.
- Los `chunk` llevan el **nombre final con hash**, leído en `generateBundle` de los ficheros que
  Vite ya emitió.
- `loadManifest` compila cada `pattern` a un matcher de segmentos y recorre la lista **en orden de
  especificidad**, devolviendo el primer `ManifestEntry` que casa. El **SW** solo usa `dynamic`;
  el **WW** usa `chunk`. Ninguno necesita params.

### 4.8. Los tres bootstraps emitidos

`main.ts` de SDD-16 declara que el ciclo de vida del SW es "build/deploy, out of scope here" → es
**aquí**. El plugin genera:

- **Entry del WW:** espera el `MessagePort` que le transfiere el hilo principal y hace
  `installRenderWorker(await loadManifest(manifestUrl), port)`.
- **Entry del SW:** `createRouter({ manifest, worker, cache })` cableado a `self.addEventListener
  ('fetch', e => router.handle(e))`, **más** un listener de control (§4.9). Su `worker` es el puerto
  recibido del hilo principal; mientras no haya puerto, **no intercepta** (deja pasar a la red).
- **Bootstrap de main:** `registerRenderServiceWorker(swUrl)` y después `connectRenderWorker(wwUrl)`
  (la hidratación de SDD-17, cuando exista, es un módulo aparte; aquí no).

**Corrección (verificada en Chrome).** La versión anterior de esta sección hacía que el SW creara el
WW (`new Worker(wwUrl, { type: 'module' })`). Es imposible: un `ServiceWorkerGlobalScope` no expone
`Worker` ni permite `import()` (ver SDD-16 §3.3). El hilo principal crea el WW y transfiere un
extremo del `MessageChannel` a cada lado.

**Nombres de fichero de los bootstraps.** Dos de los tres necesitan nombre estable en la RAÍZ —
los mismos URLs que publica el dev server (§4.10), de modo que dev y build se comporten igual:

- `fudic-sw.js`: un Service Worker solo controla su directorio y por debajo; servido desde
  `assets/` jamás vería una navegación.
- `fudic-main.js`: una página lo referencia literalmente (`<script type="module" src>`), y un
  nombre hasheado no se puede escribir a mano.

El resto conserva el hash de contenido de Vite. Si el usuario configura `rollupOptions.output`, el
plugin no lo toca: los nombres pasan a ser suyos.

### 4.9. Invalidación y versión (cierra un hueco de SDD-16)

`createRouter` **no** consume control hoy, pese a que `ControlMessage`
(`invalidate`/`version`/`purge`) está tipado. El SW emitido cablea:

```js
controlBus().on(msg => {
  if (msg.type === 'purge' || msg.type === 'invalidate') void cache.delete(msg.route);
  if (msg.type === 'version') /* build nuevo → purga total del namespace de cache */;
});
```

Política v1: **purga por versión de build** (build nuevo → `version` → limpia el cache
incremental). TTL por ruta queda fuera (§7). Es el "revalidate" del modo incremental.

### 4.10. Dev vs build

- **Dev:** `transform` sirve el emit por módulo, sin hash; el manifest se emite con URLs sin hash
  servidas por el módulo-graph de Vite; los `.html` de modo 1 se renderizan on-demand (equivalente
  a incremental) para no prerenderizar en cada guardado. Source maps vivos.
- **Build:** hash, manifests con nombres finales, prerender de modo 1, bootstraps emitidos.

**Render on-demand en dev.** El middleware de navegación resuelve la ruta contra las rutas
descubiertas (primer hit por especificidad, la misma regla del manifest), importa el wrapper por el
grafo SSR de Vite y drena su stream. Es el MISMO `RenderChunk` que correría el WW, así que dev y
build no divergen. La respuesta pasa por `transformIndexHtml`, que inyecta el cliente de Vite (HMR).
Sin ruta que case, `next()`.

**Preview.** `appType:'custom'` (que impone este plugin) quita el fallback a `index.html` de Vite,
así que `vite preview` necesita que el plugin mapee la navegación a su fichero prerenderizado
(`/about` → `about/index.html`). Sin fichero, `next()` → 404: una ruta incremental es cosa del
Service Worker, y así el preview enseña exactamente lo que serviría un host estático.

### 4.11. Dos ajustes que el plugin requiere del emit (SDD-15)

Menores, pero sin ellos el plugin no puede enlazar. Se implementan en el emit coordinadamente:

1. **Specifier de import = `.fud`, no `.mjs`.** `emitComponentModule`/`emitPageModule` escriben
   hoy `./app-card.mjs` (fichero inexistente en fuente). Deben emitir el specifier del **`.fud`
   fuente** (o aceptar la extensión como parámetro), para que Vite posea la resolución del grafo.
2. **Assets como refs resolubles con span.** El emit deja de inlinear `src`/`url(…)` como string
   opaco y los expone en una forma que el plugin pueda localizar (span + valor literal). Es el
   input del linker de §4.5.
3. **`page` emitido como generador que cede piezas** (para el streaming a trozos, §4.3). Hoy
   `emitPageModule` produce un `page(data, io)` que concatena `<head>` + `serialize($body)` y
   devuelve **un string**. Debe pasar a **ceder** (`yield`): primero el `<head>`, luego
   `yield* serializeChunks($body)`, luego el cierre; y su `io` recibe `serialize: serializeChunks`
   en vez de `renderToString`. Es una evolución de la **rama SSR-servidor de SDD-15 (ya `Hecho`)**,
   no de la rama de hidratación en pausa — no colisiona con el estudio de rendimiento de Pedro.

Durante la implementación aparecieron dos más, del mismo tipo (el plugin es el único consumidor,
la implementación vive en el emit):

4. **`componentSpecifier` inyectado.** El emit escribía siempre `./<tag><ext>`: un componente solo
   resolvía si vivía en el mismo directorio que la página. El compilador no puede calcular una ruta
   relativa (no toca `node:path`), así que el especificador se **inyecta**; el plugin lo computa
   desde el importador. Un `components/` compartido fuera de `routesDir` ya resuelve, desde
   cualquier profundidad de ruta.
5. **`<head>` de página verbatim.** El emit solo copiaba `<title>` y `<meta>`: se perdían el
   favicon, la hoja de estilos y cualquier `<script src>` — incluido el bootstrap de main, sin el
   cual ninguna página puede registrar el Service Worker. Ahora **todo** elemento del `<head>` pasa
   verbatim salvo `<title>` (interpolado) y `<link rel="component">` (grafo de componentes, nunca
   salida), con el linker de assets (§4.5) aplicado a `<link href>` / `<script src>` estáticos.

Se declaran aquí porque **solo el plugin los consume**; su implementación vive en el módulo emit.

---

## 5. Invariantes LSP

- **Vite nunca parsea `.fud`.** El análisis es siempre el parser hand-written + Oxc (SDD-05/11).
  Vite resuelve, hashea, sirve y empaqueta el resultado. Invariante dura.
- **Spans de punta a punta.** Todo fragmento emitido se ancla a su offset de fuente; un error en
  el JS servido navega de vuelta al `.fud` vía el source map (§4.6). Los diagnósticos del
  compilador se convierten en `Range` con `LineMap` antes de llegar a Vite.
- **Determinismo.** Mismo árbol de rutas ⇒ mismo orden de especificidad, mismos patrones, mismo
  manifest; los hashes derivan del contenido emitido. SSG eager e incremental producen HTML
  idéntico para la misma `data` (garantía de "un `page`, dos `io`").
- **No aborta la build por un fichero roto.** Un `.fud` con diagnósticos emite el error de Vite
  con su `Range` y, donde es posible, sigue con las demás rutas; un diagnóstico de emit
  (`FUD0292`, etc.) no tumba el manifest de las rutas sanas.

### Catálogo de diagnósticos (`FUD0360`–`FUD0389`)

| Código | Regla |
|---|---|
| `FUD0360` | Ruta `[param]`/`{param}` malformada (segmento vacío, param duplicado en el path). |
| `FUD0361` | Colisión de rutas: dos `.fud` resuelven al mismo patrón. |
| `FUD0362` | `paths()` devuelve un objeto de params que no cubre todos los segmentos del patrón. |
| `FUD0363` | Asset referenciado (literal) que no resuelve a un fichero existente (§4.5). |
| `FUD0364` | Override de `options.routes` para un patrón que no existe en `routesDir`. |
| `FUD0365` | `manifestUrl` no absoluta (SW y WW la cargan de la misma URL; una relativa derivaría). |
| `FUD0366`–`FUD0389` | Reservados. |

---

## 6. Criterios de aceptación

**Routing por FS** (verificable en Node):

1. **Mapeo.** `routes/index.fud` → `/`; `routes/customer/index.fud` → `/customer`;
   `routes/customer/[id].fud` → patrón `/customer/:id`. Con `paramToken:'brace'`, `{id}.fud`
   produce el mismo patrón.
2. **Especificidad.** Con `/customer/new.fud` y `/customer/[id].fud`, el `RouteManifestFile` lista
   `new` antes que `:id`, y `match('/customer/new')` da la entrada estática, no la param.
3. **Colisión.** Dos ficheros que resuelven al mismo patrón → `FUD0361`, sin tumbar el resto.

**Modos SSG:**

4. **Estático inferido.** Una página sin params ni `@server load` → `dynamic:false` y un `.html`
   escrito en `outDir`. Sin config.
5. **Incremental inferido.** `/customer/[id].fud` sin `paths()` → `dynamic:true`, **sin** ningún
   `.html` prerenderizado; el build no itera ids (coste O(rutas)).
6. **`paths()` warm + fallback.** Con `paths()` → `['1','2']`, se prerenderizan
   `customer/1/index.html` y `customer/2/index.html`; con `paramFallback:'lazy'` hay además una
   entrada `dynamic:true` para `/customer/:id`; con `'notFound'` no la hay.
7. **Default-safe.** Una página con `load` cuya build-resolubilidad no se puede probar →
   `dynamic:true`.

**Wrapper `RenderChunk` y transport:**

8. **Forma del chunk.** El módulo de página emitido tiene `export default (route) =>
   ReadableStream<Uint8Array>`; llamarlo con `/customer/42` produce un stream cuyo texto es
   `page(await load({params:{id:'42'}}), io)` serializado.
8b. **Streaming a trozos.** El stream del chunk cede el `<head>` en el **primer** trozo, antes de
    que el cuerpo termine de serializarse (verificable leyendo el `ReadableStream` trozo a trozo:
    el `<head>` llega sin haber consumido todo el cuerpo). El `.html` de modo 1 junta las mismas
    piezas y es byte-idéntico a concatenarlas.
9. **Params dentro del chunk.** `match` sigue devolviendo `ManifestEntry` sin params; el chunk los
   extrae de la ruta. `RenderRequest` no cambia.
10. **Incremental por-id.** Con el `createRouter` real (WW y `Cache` falsos), dos navegaciones a
    `/customer/42`: la primera delega al WW y hace `caches.put`; la segunda es cache hit sin WW.
    Una a `/customer/43` vuelve a delegar (clave de cache distinta).
11. **Matcher por patrón.** `loadManifest` sobre un `RouteManifestFile` con `/customer/:id`
    resuelve `match('/customer/42')` a esa entrada y `match('/about')` a `null`.

**Assets y source maps:**

12. **Asset reescrito.** `<img src="./hero.png">` en un `.fud` → la salida referencia la URL
    hasheada que Vite emitió; el fichero aparece en `outDir`. `url(./bg.png)` en el `<style>`
    idéntico. Un `src` computado (no literal) se deja intacto.
13. **Asset ausente.** Un `src` literal a un fichero inexistente → `FUD0363`, sin abortar.
14. **Source map.** Un error en el JS emitido de una página mapea, vía el `.map`, a la posición
    correcta del `.fud` (composición `mapOffset` → `addMapping`).

**Bootstraps e invalidación:**

15. **Manifest única URL.** El manifest se publica en `manifestUrl` absoluta; el entry del WW y el
    del SW lo cargan de ahí. `manifestUrl` relativa → `FUD0365`.
16. **SW cablea control.** El entry del SW emitido, ante un `ControlMessage` `purge`/`invalidate`
    de ruta R, ejecuta `cache.delete(R)`; ante `version`, purga el namespace. Verificable con un
    `controlBus` y un `Cache` falsos.

**Hito de cierre (sin hidratación):**

17. **Los cuatro fixtures se sirven.** `home.fud` (+ `app-card`/`app-button`/`app-badge` por
    links) compila vía el plugin, produce la página en su modo inferido, se sirve por HTTP y el
    documento se pinta sin JavaScript (N1/SSR cero-JS). La hidratación **no** se ejercita (SDD-15
    cliente en pausa).
18. **Vite no parsea.** Ningún `.fud` pasa por el parser HTML de Vite/Rolldown: el análisis es
    siempre `@fudic/compiler`. Verificable porque el AST/diagnósticos provienen del compilador.

---

## 7. Fuera de alcance

- **Emit de hidratación (rama cliente de SDD-15).** En pausa por rendimiento (decisión de Pedro):
  los chunks `static c`/`FudicElement`, el `fud-chunks` `tag→url`, el doble build server/cliente y
  el warm de red. El plugin los añade cuando esa rama aterrice; su símbolo `tag` lo rellenará el
  mismo linker post-hash de §4.7.
- **Semántica completa de `@server load` y materialización del grafo raíz** (identidad de
  referencias entre componentes). SDD-19 fija solo la **forma de entrada** (`load(ctx)`/`paths()`);
  el resto sigue siendo la punta abierta de SDD-15 §7.
- **Política de cache más allá de purga-por-versión** (TTL por ruta, stale-while-revalidate,
  eviction). SDD-16 la dejó abierta; aquí solo se cablea la purga por versión (§4.9).
- **ISR de origen compartido / edge.** La garantía de v1 es cache **por cliente** (WW local). El
  mismo chunk en un edge worker daría cache compartido, pero eso es despliegue, no build.
- **Tipos y validación de params de ruta** (coerción `:id` a número, regex por segmento). v1 los
  entrega como string; la validación la hace `load` (un id inexistente → 404 desde `load`, no
  desde el router).
- **Ciclo de vida avanzado del SW** (scope fino, `skipWaiting`, flujo de update, precache de las
  rutas estáticas al `install`). Se emite el registro básico; el afinado es deploy.
