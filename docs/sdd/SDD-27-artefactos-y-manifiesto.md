# SDD-27 — Artefactos de build y manifiesto

> **Paquetes:** `@fudic/vite`, `@fudic/transport`
> **Rango de diagnósticos:** `FUD0500`–`FUD0519`
> **Estado:** `Listo` · **Tareas:** [SDD-27-Task.md](./SDD-27-Task.md)

---

## 1. Contexto y objetivo

El build produce hoy **cuatro** familias de artefactos y ninguna tiene nombre. Cada una
decidió por su cuenta dónde escribe, con qué formato de módulo y con qué nombre de
fichero, y de ahí salen tres defectos que comparten causa:

1. **`dist/` publica una pasada entera que nadie carga** — 24,7 KB de JS + 27,0 KB de
   mapas en `examples/basic`.
2. **Los chunks de hidratación (`assets/h/`) no están en el manifiesto**, así que el hilo
   principal no tiene cómo resolverlos. SDD-15 §3.6 lo dejó explícitamente abierto.
3. **El manifiesto emite URLs completas con hash** para cosas que son derivables del
   `pattern` y del `build`.

Este SDD nombra las cuatro pasadas, borra lo que sobra de `dist/`, mete la hidratación en
el manifiesto y lo reduce a lo único que no es derivable.

**No** cambia qué se renderiza, ni dónde, ni cuándo se hidrata nada.

---

## 2. Dependencias

| SDD | Qué aporta |
|---|---|
| [15](./SDD-15-emit.md) | El chunk de cliente por componente (`assets/h/<tag>-<hash>.js`), `discoverComponents`, la query `?client`. |
| [19](./SDD-19-plugin-vite.md) | El plugin, `discoverRoutes`, `safeName`, el linker de assets (`linkAssets`, `FUD0363`). |
| [20](./SDD-20-render-sw.md) | El link pass (`runLinkPass`), el manifiesto (`buildManifest`, `RouteRecord`, `compileManifest`), el build id y `BUILD_TOKEN`. |
| [BUG-09](./bugs/) | La pasada *edge* (`.fudic/edge/`), fuera de `outDir`, y `esmOf: () => ''`. |

Todas en `Hecho`.

---

## 3. Las cuatro pasadas (nomenclatura)

Este es el contrato de nombres. A partir de aquí, en código y en documentación, se llaman
así:

| Id | Nombre | Función | Salida | Formato | ¿`@server load`? | Consumidor |
|---|---|---|---|---|---|---|
| **A** | **edge** | `runEdgePass` | `.fudic/edge/*.js` + `edge/c/*` | ESM sin minificar | **Sí** | Node: prerender, preview, `/_fudic/data` |
| **B** | **page** | build principal de Vite | `dist/assets/c/*` + chunks compartidos | ESM minificado | No | **Nadie** |
| **C** | **link** | `runLinkPass` | `dist/sw/c/*` | **CJS** | No | El linker del SW (`new Function`) |
| **D** | **client** | `discoverComponents` + `?client` | `dist/assets/h/*` + `element-*` | ESM | — | Hidratación |

A, B y C emiten **el mismo `render`** tres veces. Para `/about` en `examples/basic`:

| Fichero | Tamaño | Diferencia |
|---|---|---|
| `.fudic/edge/about.js` | 7 233 B | ESM, **con `load`**, legible, fuera de `dist` |
| `dist/assets/c/about-Dc8BWucL.js` | 4 916 B | ESM, sin `load`, minificado |
| `dist/sw/c/about-o23EwdAA.js` | 5 022 B | CJS, sin `load`, minificado |

A existe porque `@server load` no puede publicarse (BUG-09 §4.1); C existe porque un
Service Worker no puede `import()`. Las dos son necesarias y **no se fusionan**. D no es
duplicado: su contenido es `customElements.define` + `static c($props)`, no `render()`.

---

## 4. Interfaz pública

### 4.1 `@fudic/transport`

`safeName` **se muda aquí** desde `@fudic/vite`, que pasa a importarla. Una sola
definición: build y runtime derivan el mismo nombre o divergen en silencio.

```ts
/** Nombre de chunk, seguro para fichero, a partir de un patrón de ruta. */
export function safeName(pattern: string): string;

export interface RouteRecord {
  readonly pattern: string;
  readonly mode: RouteMode;
  /** Nombres de componente, en orden TOPOLÓGICO. Sin prefijo, sin hash, sin extensión. */
  readonly deps?: readonly string[];
  readonly dataPolicy?: DataPolicy;
  readonly page?: PagePolicy;
}

export interface UrlResolver {
  /** El chunk de render de la ruta (pasada `link`). */
  renderUrl(record: RouteRecord): string;
  /** El chunk de render de un componente (pasada `link`). */
  depUrl(name: string): string;
  /** El chunk de hidratación de un componente (pasada `client`). */
  hydrateUrl(name: string): string;
  /** El endpoint de datos, con `:param` sin rellenar. `null` si la ruta no tiene `load`. */
  dataUrl(record: RouteRecord): string | null;
}

export function createUrlResolver(base: string, build: string): UrlResolver;
```

`RouteRecord` **pierde** `chunk`, `deps` como URLs, `data` y `esm`. `RouteTable` gana
`urls: UrlResolver`.

### 4.2 `@fudic/vite`

```ts
/** Nombres de chunk de una ruta. Única fuente para las pasadas link, client y el manifiesto. */
export interface ChunkNames {
  readonly entry: string;              // safeName(pattern)
  readonly deps: readonly string[];    // tags, topológicos
}
export function chunkNamesOf(builds: readonly RouteBuild[]): ReadonlyMap<string, ChunkNames>;

/**
 * Sustituye el hash de 8 caracteres por el build id en nombres de fichero, en el `.map`,
 * en el `sourceMappingURL` y en toda referencia dentro del código. Misma longitud.
 */
export function renameToBuildId(
  files: readonly EmittedFile[],
  build: string,
): { readonly files: readonly EmittedFile[]; readonly diagnostics: readonly FudicDiagnostic[] };
```

---

## 5. Comportamiento

### 5.1 La pasada *page* deja de publicar chunks, no de emitirlos

[plugin.ts:374-380](../../packages/vite/src/plugin.ts#L374-L380) documenta por qué el
chunk de página existe, y el código lo confirma: es lo que arrastra la ruta y sus
componentes al grafo cliente, y **solo esa pasada escribe los ficheros de asset**. La
pasada *link* corre con `write: false` y su bucle de re-emisión descarta todo lo que no
sea `type === 'chunk'` ([link.ts:191-208](../../packages/vite/src/link.ts#L191-L208)), de
modo que *link* **referencia** `logo-<hash>.png` y *page* es quien lo **produce**.
Cubierto por [build-asset.test.ts](../../packages/vite/test/build-asset.test.ts) con
`assetsInlineLimit: 0`; en `examples/basic` no se ve porque el `logo.svg` son 208 B y Vite
lo inlinea como data-URI.

> **Invariante.** De la pasada *page* sobran los **chunks**, nunca los **assets**.

En `generateBundle`, **después** de que Vite haya resuelto y nombrado los assets, se
borran del bundle los chunks alcanzables solo desde las entradas de página. Se conservan
siempre: `fudic-main`, `fudic-sw`, los chunks de *client* y su clausura de imports, y
**todo** `type === 'asset'`.

### 5.2 Los nombres de *link* y *client* llevan el build id

Sustitución **de misma longitud**, igual que `BUILD_TOKEN` en el Service Worker
([constants.ts:34-42](../../packages/vite/src/constants.ts#L34-L42)): el hash de Vite mide
8 caracteres (`BtWdjIM9`, `Czbkvc-4`, `D057gucf`) y `BUILD_ID_LENGTH` también.

**No hay circularidad.** El build id se sigue calculando de los nombres hasheados
originales ([plugin.ts:572-576](../../packages/vite/src/plugin.ts#L572-L576)) y la
sustitución ocurre después. Y como no mueve ningún offset, los source maps siguen siendo
válidos por construcción — que es exactamente la razón por la que el truco existe.

Alcance: `sw/c/*` y `assets/h/*` + `element-*`. **Los assets de Vite conservan su hash de
contenido**: son su pipeline, no el nuestro, y ahí el hash sí trabaja.

### 5.3 Lo que se pierde, dicho en voz alta

Toda cache del Service Worker está namespaced por build (`shell-${build}`,
`routes-${build}`, `pages-${build}`, `data-${build}` —
[store.ts:43-55](../../packages/transport/src/store.ts#L43-L55)) y `activate` purga las de
builds anteriores ([bootstrap.ts:64-66](../../packages/vite/src/bootstrap.ts#L64-L66)). Un
deploy **ya** tira todo, cambie o no el fichero.

Lo único que el hash de contenido sigue protegiendo es la **HTTP cache del navegador y el
CDN** en el re-fetch posterior a la purga: hoy un chunk sin cambios se sirve de disco; con
el build id en el nombre es una URL nueva y se descarga. **Ese es el coste exacto de §5.2
y se acepta a sabiendas.** No hay riesgo de contenido rancio: la URL sigue cambiando en
cada build.

### 5.4 El manifiesto

**Antes** (`examples/basic`, 989 B):

```json
{ "build": "605477d3",
  "csp": { "document": "…", "sw": "…" },
  "routes": [
    { "pattern": "/blog/:slug", "mode": "sw",
      "chunk": "/sw/c/blog-slug-N9OIQ_Kf.js",
      "deps": ["/sw/c/app-badge-BtWdjIM9.js", "/sw/c/site-nav-Bq-vwUs5.js"],
      "data": "/_fudic/data/blog/:slug",
      "dataPolicy": { "policy": "cache-first", "ttl": null } }
  ] }
```

**Después** (≈430 B estimados, **con hidratación dentro**):

```json
{ "build": "605477d3",
  "csp": { "document": "…", "sw": "…" },
  "routes": [
    { "pattern": "/blog/:slug", "mode": "sw",
      "deps": ["app-badge", "site-nav"],
      "dataPolicy": { "policy": "cache-first", "ttl": null } },
    { "pattern": "/about", "mode": "ssg", "deps": ["site-nav"] },
    { "pattern": "/blog", "mode": "sw",
      "deps": ["app-badge", "app-card", "site-nav"],
      "dataPolicy": { "policy": "cache-first", "ttl": 300000 } },
    { "pattern": "/", "mode": "ssg", "deps": ["app-badge", "app-card", "site-nav"] }
  ] }
```

Derivación, una única implementación (§4.1):

```
renderUrl(r)   = `${base}sw/c/${safeName(r.pattern)}-${build}.js`
depUrl(n)      = `${base}sw/c/${n}-${build}.js`
hydrateUrl(n)  = `${base}assets/h/${n}-${build}.js`
dataUrl(r)     = `${base}_fudic/data${r.pattern}`     // null si no hay dataPolicy
```

**`/h` entra con coste cero**: es la misma lista `deps` con otro prefijo. No hay array
nuevo.

`deps` **conserva el orden topológico** que produce `topologicalDeps`: el `require` del
linker es síncrono y depende de él. Que en `examples/basic` ningún componente importe a
otro no lo hace irrelevante.

### 5.5 Sin hash, `safeName` deja de ser inyectivo

`/blog/:slug` y `/blog-slug` producen los dos `blog-slug`; un tag `blog-slug` colisionaría
con la ruta en el mismo directorio. Hoy el hash lo tapa. Sin él hay que detectarlo: la
colisión emite `FUD0501` y **ese par conserva su hash**. Degrada, no rompe.

---

## 6. Diagnósticos (`FUD0500`–`FUD0519`)

| Código | Cuándo | Mensaje |
|---|---|---|
| `FUD0500` | Un chunk de *link* o *client* no termina en `-<8 caracteres>.js` | `chunk hash length is not 8; build-id naming needs default build.rollupOptions.output` |
| `FUD0501` | Dos chunks quedarían con el mismo nombre tras el rename | `chunk name collision after build-id naming: "<name>" is produced by <a> and <b>` |

Ninguno rompe el build: `FUD0500` desactiva el rename por completo, `FUD0501` lo desactiva
para el par afectado.

---

## 7. Criterios de aceptación

1. `dist/assets/c/` no existe tras `pnpm build` en `examples/basic`; tampoco
   `assets/stream-*`, `assets/app-badge-*` ni `assets/app-card-*`.
2. `assets/h/*` y `assets/element-*` siguen emitiéndose.
3. Con `assetsInlineLimit: 0`, el asset enlazado se sigue emitiendo con su hash de
   contenido y el chunk de `sw/c/` apunta a él. **Este criterio impide que alguien borre
   la pasada *page* entera en el futuro.**
4. Los 5 HTML prerenderizados de `examples/basic` son idénticos a los de antes del cambio,
   salvo hashes.
5. Todo fichero de `sw/c/` y de `assets/h/` termina en `-<build>.js`, con el mismo `build`
   que el campo `build` del manifiesto.
6. Los `.map` de *link* y *client* validan: un error en el navegador navega al `.fud`.
7. `fudic-routes.json` no contiene ninguna URL: ni `chunk`, ni `data`, ni URLs en `deps`.
8. `deps` conserva el orden que produce `topologicalDeps`.
9. El hilo principal resuelve el chunk de hidratación de cualquier tag del grafo sin leer
   del manifiesto nada salvo `build`.
10. `FUD0500` ante un `hashCharacters` distinto de 8; `FUD0501` ante colisión de nombres.
    Ninguno rompe el build.
11. El manifiesto de `examples/basic` baja de 989 B a **≤ 500 B**, incluyendo la
    hidratación.
12. `pnpm typecheck`, `pnpm test` y `pnpm build` verdes en todo el workspace; los tests
    e2e de `examples/basic` (`sw-render`, `sw-network`) verdes contra el build nuevo.

---

## 8. Fuera de alcance

- **La política de hidratación.** Qué componente hidrata, cuándo y con qué disparador es
  SDD-17 y ya está decidido. Aquí solo se resuelve **la URL de su chunk**.
- **Múltiples aplicaciones** en un mismo build. Cambiaría la forma del manifiesto; no se
  aborda ni se prepara.
- **Unificar las pasadas *page* y *link*.** Son el mismo código en dos formatos de módulo,
  pero el motivo (el SW no puede `import()`) es real y no desaparece.
- **Fusionar *edge* con *page* o *link*.** *edge* lleva `@server load` y por eso vive fuera
  de `dist` (BUG-09 §4.1). Intocable.
- **Tabla de strings / índices para `deps`.** Con nombres desnudos el manifiesto ya cabe;
  deduplicar es una optimización para cuando haya cientos de rutas, y entonces se mide
  antes de hacerla.
- **Saldar la deuda de cobertura** heredada de `@fudic/vite` y `@fudic/transport`. Tiene su
  propia tanda.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Borrar un chunk de *page* que *client* necesitaba | Se calcula la clausura de imports, no una lista literal. El criterio 2 lo guarda. |
| El rename rompe un source map | Misma longitud por construcción (§5.2). Criterio 6. |
| Colisión de nombres sin hash | `FUD0501`: diagnóstico y se conserva el hash de ese par. |
| Un `hashCharacters` distinto en la config del usuario | `FUD0500`: se detecta y no se renombra. |
| Perder la invalidación de HTTP cache | Aceptado y documentado (§5.3). Sin riesgo de contenido rancio. |
| El prerender dependía de *page* sin saberlo | Criterio 4: HTML comparado byte a byte. |
