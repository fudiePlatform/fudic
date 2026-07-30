# BUG-02 — El router cachea HTML por ruta en lugar de renderizar

> **Estado:** `Hecho`
> **Corrige:** [SDD-20 — Render en el Service Worker](../SDD-20-render-sw.md) §4.2, §4.4, §4.6
> **Paquetes:** `@fudic/transport` · `@fudic/vite`
> **Rama sugerida:** `fix/bug-02-render-not-html`
> **Depende de:** [BUG-01](./BUG-01-shell-sin-politica.md) (ambos tocan el `fetch` handler;
> BUG-01 primero, porque este reescribe la rama que aquel no toca).
> **Naturaleza:** corrección de **modelo**, no de línea. Es el BUG con más superficie de
> los tres.

---

## 1. Contexto y síntoma

En la primera carga se piden dos documentos: `/` —la navegación, que sirve el servidor— y
`/index.html` —un `fetch` del Service Worker—. Son **el mismo documento byte a byte** salvo
el atributo `nonce`. El origen es la clave `html` de las entradas del router JSON: el SW la
usa como clave de caché de páginas y como URL de descarga.

**El modelo correcto es el de una SPA con code splitting: un shell y un chunk por ruta,
nunca un HTML por ruta.** Aquí es igual, solo que el DOM lo construye el Service Worker en
vez del hilo principal.

El papel del HTML prerenderizado es exactamente uno, y se agota en la primera visita:

- No hay caché ni SW activo. El usuario recibe el HTML SSG del servidor y punto.
- Existe para dar **buen TTFB y primer pintado en frío**, más **SEO** y **funcionamiento
  sin JS**.
- **No se cachea, no se vuelve a pedir y no forma parte de ninguna estrategia offline.**

A partir de que el SW toma control, **toda navegación la renderiza él** desde chunk + data,
generando el nonce en cada render. Con lo cual el placeholder `__FUDIC_NONCE__` deja de
tener sentido *en el camino del SW* (sigue vivo en el edge: §4.5).

**Reproducción**

```sh
pnpm build && pnpm --filter @fudic/example-basic preview
# Chrome → DevTools → Network, primera carga en un perfil limpio
# Dos filas de tipo Document: "/" y "/index.html", contenido idéntico salvo `nonce`
# Application → Cache Storage → pages-<build>: contiene /index.html
```

---

## 2. Causa raíz

`record.html` cumple **dos papeles incompatibles** en el mismo campo: *«hay un fichero HTML
en disco para el arranque en frío»* (build, correcto) y *«esta es la clave de caché de la
página de esta ruta»* (runtime, el bug). El segundo papel convierte el router en un caché
de documentos por ruta y desactiva el render.

### 2.1. Dónde se emite (build)

- [`manifest.ts:48`](../../../packages/transport/src/manifest.ts#L48) — el campo del
  contrato: `readonly html?: string`.
- [`mode.ts:117`](../../../packages/vite/src/mode.ts#L117) y
  [`mode.ts:137`](../../../packages/vite/src/mode.ts#L137) — la decisión
  `prerenderedHtml: true`.
- [`manifest.ts:47-49`](../../../packages/vite/src/manifest.ts#L47-L49) — `htmlUrlFor`
  construye la plantilla de URL: `/` → `/index.html`.
- [`manifest.ts:105`](../../../packages/vite/src/manifest.ts#L105) — `const html = …`; se
  inyecta en el record en **ambas** ramas:
  [`:112`](../../../packages/vite/src/manifest.ts#L112) (no-`sw`) y
  [`:133`](../../../packages/vite/src/manifest.ts#L133) (`sw`).
- [`plugin.ts:491`](../../../packages/vite/src/plugin.ts#L491) y
  [`plugin.ts:498`](../../../packages/vite/src/plugin.ts#L498) — la escritura de los
  ficheros `.html` (enumerado y simple).

### 2.2. Dónde se descarga

**No es el `install`.** El `install` precachea solo `SHELL + MANIFEST_URL`
([`bootstrap.ts:40-48`](../../../packages/vite/src/bootstrap.ts#L40-L48)). El `fetch` de
`/index.html` sale de `warm()`:

- [`router.ts:233-244`](../../../packages/transport/src/router.ts#L233-L244) —
  `if (record.mode === 'ssg' || record.html !== undefined)` →
  `stores.pages.get(pageUrl, 'cache-first', null)` → miss → **red**.
- Disparado desde
  [`bootstrap.ts:108-111`](../../../packages/vite/src/bootstrap.ts#L108-L111)
  (`LOCATION_MESSAGE`, justo tras `activate`) y desde
  [`router.ts:275`](../../../packages/transport/src/router.ts#L275).

Por eso `/` y `/index.html` aparecen en la misma carga: el servidor sirvió la navegación y,
acto seguido, el SW fue a buscar el mismo documento por su URL de fichero.

### 2.3. Dónde lo consulta el `fetch` handler

- [`router.ts:131-132`](../../../packages/transport/src/router.ts#L131-L132) — `pageUrlOf`:
  la clave de caché **es** `record.html`.
- [`router.ts:268-272`](../../../packages/transport/src/router.ts#L268-L272) —
  `pages.has(pageUrl)` → `servePage`. Es la rama que gana a todo lo demás.
- [`router.ts:135-144`](../../../packages/transport/src/router.ts#L135-L144) — `servePage`
  lee el HTML y le estampa el nonce con `applyNonce`.
- [`router.ts:273`](../../../packages/transport/src/router.ts#L273) —
  `if (record.mode === 'ssg' || !warmed.has(…)) return`: una ruta `ssg` **nunca** llega a
  `render`.
- [`router.ts:283-287`](../../../packages/transport/src/router.ts#L283-L287) — `ready()`
  siembra el índice `pages` desde la caché.
- [`router.ts:289-300`](../../../packages/transport/src/router.ts#L289-L300) —
  `invalidate()`.

### 2.4. Qué falta hoy para renderizar una ruta `mode: "ssg"` en el SW

Cuatro huecos, todos en el camino crítico. Hoy una `ssg` lleva solo `html` y `esm`:

1. **No se genera chunk enlazable.**
   [`link.ts:127`](../../../packages/vite/src/link.ts#L127) —
   `builds.filter(rb => rb.decision.mode === 'sw')`. Las rutas `ssg` quedan fuera del link
   pass, así que **no existe** salida CJS para ellas. Es la raíz.
2. **El manifest no lo emitiría aunque existiera.**
   [`manifest.ts:108-115`](../../../packages/vite/src/manifest.ts#L108-L115): la rama
   no-`sw` escribe solo `html` + `esm`. `chunk`, `deps`, `data` y `dataPolicy` viven
   exclusivamente en la rama `sw`
   ([`:121-134`](../../../packages/vite/src/manifest.ts#L121-L134)).
3. **El router descarta `ssg` por modo, no por capacidad.**
   [`router.ts:273`](../../../packages/transport/src/router.ts#L273) nunca llega a
   `render`, y [`router.ts:226`](../../../packages/transport/src/router.ts#L226)
   (`record.mode === 'sw' && record.chunk !== undefined`) hace que `warm` tampoco descargue
   su chunk. La aserción `record.chunk!` de
   [`router.ts:168`](../../../packages/transport/src/router.ts#L168) reventaría si se
   quitara la guarda sin arreglar 1 y 2.
4. **Datos.** Una `ssg` enumerada nace de `paths()` + `load`
   ([`mode.ts:65-70`](../../../packages/vite/src/mode.ts#L65-L70)) pero no obtiene endpoint
   `data`, que solo se emite en la rama `sw`. El wrapper del link pass se construye con
   `withLoad: false` ([`link.ts:85`](../../../packages/vite/src/link.ts#L85)) —correcto, el
   código de servidor no baja al cliente— lo que hace el endpoint HTTP **obligatorio**.

### 2.5. Alcance

- **`page.cache: 'persist'`** ([`router.ts:175-187`](../../../packages/transport/src/router.ts#L175-L187))
  escribe en el mismo store `pages` y usa la misma `pageUrlOf`, así que **hereda la clave
  derivada de `record.html`**. No es el bug —persistir el resultado de un render es
  memoización legítima— pero comparte el mecanismo roto y hay que desacoplarlo (§4.4).
- **`__FUDIC_NONCE__`** ([`csp.ts:17`](../../../packages/transport/src/csp.ts#L17),
  [`csp.ts:44`](../../../packages/transport/src/csp.ts#L44)) sobrevive hoy en el SW **solo**
  porque `servePage` reescribe HTML precacheado.
- **`sw-check.mjs`** tiene un caso —«a warm prerendered page is served from the SW cache»—
  que afirma el comportamiento incorrecto: hay que reescribirlo, no repararlo.

---

## 3. Interfaz pública

### 3.1. `RouteRecord` — `html` sale del contrato del SW

```ts
export interface RouteRecord {
  readonly pattern: string;
  readonly mode: RouteMode;
  readonly chunk?: string;
  readonly deps?: readonly string[];
  readonly data?: string;
  readonly dataPolicy?: DataPolicy;
  readonly page?: PagePolicy;
  /** El chunk ESM para el edge (dev/preview/prerender). El SW nunca lo lee. */
  readonly esm?: string;
  // `html` ELIMINADO: el HTML prerenderizado es un fichero del edge, no una ruta
  // del cliente. Quien lo sirve lo localiza por convención (`htmlPathFor`), no por
  // el manifest.
}
```

El edge ya no lo necesitaba: el servidor de preview localiza el fichero con
`join(outDir, htmlPathFor(pathname))`
([`plugin.ts:301`](../../../packages/vite/src/plugin.ts#L301)), nunca con `record.html`.

### 3.2. `RouteMode` — `ssg` deja de significar «el SW no participa»

`mode` sigue teniendo tres valores, pero solo uno es una decisión de runtime para el SW:

| Valor | Qué significa **después** de este BUG |
|---|---|
| `ssr` | El servidor, siempre. El SW no intercepta y no descarga su chunk. Sin cambios. |
| `ssg` | El build escribió HTML de arranque en frío. **En el SW se comporta como `sw`**. |
| `sw`  | Sin HTML prerenderizado. Sin cambios. |

Es decir: para el `fetch` handler la partición pasa a ser `ssr` frente a *todo lo demás*.
`ssg` retiene su significado en el build (prerenderizar) y lo pierde en el cliente.

### 3.3. `RouterStores` — `pages` cambia de semántica

`pages` deja de contener documentos descargados y pasa a contener **exclusivamente**
resultados de `render` con `page.cache: 'persist'`. La interfaz no cambia; el invariante sí
(§5).

### 3.4. Sin cambios

`Store`, `Linker`, `CspTemplates`, `sw.json`. `applyNonce` y `NONCE_TOKEN` siguen
exportados: los usa el edge.

---

## 4. Comportamiento corregido

### 4.1. El HTML prerenderizado se agota en la primera visita

El build sigue escribiendo los `.html` exactamente como hoy. Cambia quién los consume:
**solo el edge**, y solo cuando no hay SW controlando. El Service Worker no los pide, no
los cachea y no los conoce — su URL no aparece en el manifest.

### 4.2. Toda navegación controlada la renderiza el SW

Para una navegación con `mode !== 'ssr'`:

1. Si hay una página persistida para **esta URL de navegación** → servirla.
2. Si la plantilla está caliente (`warmed`) → `render(record, params, url, nonce, request)`.
3. Si está fría → `return` (la sirve la red) y `waitUntil(warm(pathname))` detrás.

La rama `record.mode === 'ssg'` de
[`router.ts:273`](../../../packages/transport/src/router.ts#L273) desaparece: una `ssg` es
fría la primera vez y caliente después, igual que cualquier otra.

### 4.3. `warm()` calienta chunks, nunca documentos

`warm` conserva la primera mitad
([`router.ts:226-232`](../../../packages/transport/src/router.ts#L226-L232)) —deps en orden
topológico y luego el chunk, en `routes-<build>`— y **pierde entera** la segunda
([`:233-244`](../../../packages/transport/src/router.ts#L233-L244)). La condición pasa a ser
`record.mode !== 'ssr' && record.chunk !== undefined`.

Esto es lo que elimina la fila `/index.html` de la primera carga.

### 4.4. La clave de la caché de páginas es la URL de navegación

`pageUrlOf(record, pathname, params)` se reduce a `abs(pathname)`. La caché de páginas pasa
a estar indexada por la URL que el usuario visita, que es la única que el `fetch` handler
tiene delante cuando decide. `record.html` no participa.

Afecta a `render` con `persist`
([`router.ts:178`](../../../packages/transport/src/router.ts#L178)), a la decisión
([`:268`](../../../packages/transport/src/router.ts#L268)) y a `invalidate`
([`:294`](../../../packages/transport/src/router.ts#L294)).

### 4.5. `servePage` deja de estampar el nonce

Lo que hay en `pages` lo generó `render` con **el nonce de aquella respuesta**. Servirlo tal
cual reutilizaría un nonce, y un nonce reutilizado no es un nonce. Así que una página
persistida se sirve con **CSP nuevo y nonce nuevo**, y el chunk debe emitir el nonce donde
el documento lo consume. Dos salidas posibles, y la spec elige la primera:

- **Elegida:** `render` mete `NONCE_TOKEN` en el stream —no el nonce literal— y quien sirve
  (render directo o `servePage`) aplica `applyNonce` con el nonce de *esa* respuesta. Un
  solo camino, y el token recupera un propósito real en el cliente.
- Descartada: prohibir `persist` en rutas con `nonce` en el markup. Es una restricción que
  el desarrollador no puede ver venir.

`applyNonce` se queda, por tanto, pero aplicado a lo que el SW genera, no a HTML de disco.

### 4.6. Una ruta `ssg` obtiene chunk, deps y data

Los cuatro huecos de §2.4, cerrados:

1. `runLinkPass` selecciona **toda ruta con `mode !== 'ssr'` y no excluida**, no solo `sw`
   ([`link.ts:127`](../../../packages/vite/src/link.ts#L127)).
2. `buildManifest` emite `chunk`, `deps`, y `data`/`dataPolicy` cuando `hasLoad`, para
   **todo** record con `mode !== 'ssr'`. La rama no-`sw` de
   [`manifest.ts:108-115`](../../../packages/vite/src/manifest.ts#L108-L115) se queda solo
   para `ssr`.
3. El router deja de mirar `mode` y mira `chunk`
   ([`:226`](../../../packages/transport/src/router.ts#L226),
   [`:273`](../../../packages/transport/src/router.ts#L273)). `record.chunk!` deja de ser
   una aserción: si no hay chunk, no se puede renderizar y se cae al camino de red.
4. El endpoint `/_fudic/data/**` se genera también para las `ssg` con `load`. `withLoad:
   false` en el link pass se mantiene: el `load` no baja nunca al cliente.

Efecto colateral deseado: `FUD0399` (`FUD_CHUNK_NOT_EMITTED`) pasa a cubrir más rutas y a
significar algo más fuerte —una ruta sin chunk solo se puede servir desde el servidor—.

### 4.7. El coste que esto añade, y por qué se acepta

El link pass pasa a construir chunks para rutas que antes no los tenían, así que el build
produce más bytes en `sw/c/`. **No** se descargan: el `install` sigue sin precachear ni una
ruta (SDD-20 §4.6.1) y `warm` sigue trayendo solo la plantilla que el usuario está
visitando. El coste es de disco en el build; el beneficio es que desaparece una descarga de
documento completo por ruta visitada.

---

## 5. Invariantes

**Los que el bug violaba**

- *«Un shell y un chunk por ruta, nunca un HTML por ruta.»* El modelo declarado del
  proyecto. `record.html` en el manifest lo contradecía en el propio contrato.
- *Una navegación, una petición.* El caso 2 de `sw-check.mjs` ya defendía «exactamente una
  petición de documento por navegación»; `warm` la duplicaba fuera de la ventana de la
  navegación, donde ese test no miraba.
- *El nonce es por respuesta.* `servePage` reescribía un nonce sobre HTML de build; correcto
  para el edge, pero convertía una caché de render en una caché de documentos.

**Los que la corrección añade**

- **El manifest no nombra ficheros HTML.** Es el contrato entre compilador, servidor y SW; si
  no lleva HTML por ruta, ningún consumidor futuro puede reintroducir esta caché.
- **`pages` solo contiene lo que el SW ha renderizado.** Nada entra en ese store por
  descarga. Verificable: ninguna escritura en `pages` cuelga de un `net()`.
- **El SW no descarga documentos, nunca.** Su única salida a red son chunks, deps, datos,
  recursos de clase y el rescate de §4.13 de SDD-20.
- **`mode` no decide capacidad.** El router pregunta por lo que tiene (`chunk`), no por la
  etiqueta que le pusieron. `ssr` sigue siendo la única decisión por etiqueta, y es
  deliberada: significa «esta ruta tiene sesión o permisos».

---

## 6. Criterios de aceptación

Tests en `packages/transport/test/router.test.ts`, `packages/vite/test/manifest.test.ts`,
`packages/vite/test/link.test.ts` y el arnés CDP. **(rojo primero)** = debe verse fallar
contra el código actual.

1. **(rojo primero)** `warm(pathname)` sobre una ruta con HTML prerenderizado **no** hace
   ninguna petición de documento: `net` se invoca solo para `chunk` y `deps`.
2. **(rojo primero)** Ninguna URL terminada en `.html` aparece jamás como argumento de
   `net` en un ciclo completo install → warm → navegación → navegación.
3. **(rojo primero)** El manifest emitido no contiene la clave `html` en ningún record.
   Verificado sobre la salida de `buildManifest` y sobre
   `examples/basic/dist/fudic-routes.json`.
4. **(rojo primero)** Una ruta `mode: 'ssg'` con `paths()` obtiene `chunk` y `deps` no
   vacíos en el manifest, y `data`/`dataPolicy` si declara `load`.
5. **(rojo primero)** Segunda navegación a una ruta `ssg`: `respondWith` con el resultado de
   `chunk.render(ctx)`, y `ctx.mode === 'ssg'`, `ctx.origin === 'sw'`.
6. Primera navegación a una ruta fría (`ssg` o `sw`): `respondWith` **no** se llama y se
   registra un `waitUntil` que calienta la plantilla. Sin cambios respecto a hoy para `sw`.
7. Una ruta `mode: 'ssr'` sigue sin interceptarse y su chunk no se descarga nunca.
8. Un record sin `chunk` (p. ej. tras `FUD0399`) no lanza: la navegación cae al camino de
   red y no se produce ninguna excepción.
9. `page.cache: 'persist'`: el render se guarda bajo **la URL de navegación**, no bajo
   ninguna ruta `.html`. `stores.pages.keys()` contiene `/blog/x` y no `/blog/x/index.html`.
10. **(rojo primero)** Dos peticiones sucesivas a una página persistida reciben **nonces
    distintos**, y el `content-security-policy` de cada respuesta contiene su propio nonce.
11. El cuerpo servido desde `pages` no contiene `__FUDIC_NONCE__` (§4.5: se aplicó al
    servir).
12. `invalidate(pathname)` borra la página de esa URL de navegación y su dato asociado.
13. El servidor de preview sigue sirviendo el HTML prerenderizado en frío, con su CSP y su
    nonce, sin leer `record.html`. Test sobre `configurePreviewServer`.
14. **Extremo a extremo** (`sw-check.mjs`, reescrito):
    - Primera carga en perfil limpio: **exactamente una** petición de tipo `Document`
      (`/`), y ninguna a `/index.html` en los 3 s siguientes.
    - Segunda carga de `/`: `fromServiceWorker === true` y el contenido está completo.
    - `/blog/routing-por-fichero` (prerenderizada) en caliente: `fromServiceWorker === true`
      y el documento lo produjo `render`, verificable porque su `nonce` cambia entre
      recargas.
    - Cero violaciones de CSP.

**Cobertura.** El borrado de `servePage`/`pageUrlOf` reduce ramas; la cifra de `router.ts`
debe **subir**, no bajar.

---

## 7. Fuera de alcance

- **Borrar `page.cache: 'persist'`.** Es una feature declarada por `strategy()` y encaja con
  el modelo: memoiza un **render**, no un HTML por ruta. Solo se desacopla de `record.html`.
- **Quitar el prerender del build.** El HTML SSG sigue siendo obligatorio: TTFB en frío,
  SEO y funcionamiento sin JS. Este BUG le quita un consumidor, no su razón de ser.
- **Eliminar `__FUDIC_NONCE__`.** El edge lo necesita
  ([`plugin.ts:306`](../../../packages/vite/src/plugin.ts#L306)), y §4.5 le devuelve un uso
  en el cliente.
- **Fusionar `ssg` y `sw` en un solo valor de `RouteMode`.** Sería lo coherente con §3.2,
  pero es un cambio de contrato que arrastra `strategy()`, `mode.ts`, los diagnósticos
  `FUD0397`/`FUD0398` y la documentación. Si se quiere, es un SDD.
- **Prefetch de rutas vecinas.** El único disparador de `warm` sigue siendo
  `LOCATION_MESSAGE` (SDD-20 §4.6.2). Dos disparadores es como el prototipo acabó
  descargándolo todo dos veces.
- **El shell y las clases de recurso:** [BUG-01](./BUG-01-shell-sin-politica.md).
- **El grafo de imports del propio SW:** [BUG-03](./BUG-03-chunks-compartidos-sw.md).
