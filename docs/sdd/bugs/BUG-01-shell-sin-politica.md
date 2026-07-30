# BUG-01 — El shell precacheado nunca se sirve desde caché

> **Estado:** `Hecho`
> **Corrige:** [SDD-20 — Render en el Service Worker](../SDD-20-render-sw.md) §4.6.1, §4.7
> **Paquetes:** `@fudic/transport` · `@fudic/vite`
> **Rama sugerida:** `fix/bug-01-shell-policy`
> **Diagnosticado:** Network de Chrome sobre `pnpm build && pnpm preview` en
> `examples/basic`, tercera carga y sucesivas.

---

## 1. Contexto y síntoma

`sw.json` declara `shell: ["/fudic-main.js"]`. El `install` lo precachea correctamente en
`shell-<build>`. Aun así, **`/fudic-main.js` sale a red en todas las cargas**, incluida la
tercera y las siguientes. Es la única petición que queda en estado estacionario: todo lo
demás converge a caché.

Consecuencia: **la aplicación no arranca sin red**. La navegación sí la sirve el Service
Worker, pero el documento referencia `<script type="module" src="/fudic-main.js">` y ese
script falla. El precacheo del shell —la única razón por la que el `install` existe— no
produce ningún efecto observable.

**Reproducción**

```sh
pnpm build && pnpm --filter @fudic/example-basic preview
# Chrome → DevTools → Network, recargar 3 veces
# /fudic-main.js: "Size" muestra transferencia real, no "(ServiceWorker)"
# DevTools → Application → Cache Storage → shell-<build>: la entrada SÍ está ahí
```

---

## 2. Causa raíz

Dos causas **independientes**, cada una suficiente por sí sola. Arreglar solo una deja el
bug vivo.

### 2.1. Causa A — el router no conoce el shell

El bootstrap construye el router pasándole únicamente las clases de recurso:

- [`bootstrap.ts:37`](../../../packages/vite/src/bootstrap.ts#L37) — `const RESOURCES = …`,
  alimentado solo desde `swConfig.resources`
  ([`plugin.ts:377`](../../../packages/vite/src/plugin.ts#L377)).
- [`bootstrap.ts:92`](../../../packages/vite/src/bootstrap.ts#L92) —
  `createRouter({ table, linker, stores, resources: RESOURCES })`. `SHELL` no se pasa.
- [`router.ts:203-218`](../../../packages/transport/src/router.ts#L203-L218) —
  `handleResource` itera **solo** `config.resources`. Si ningún glob casa, **no llama a
  `respondWith`** y la petición sale a red intacta.

`/fudic-main.js` no casa `/assets/**`. La regla de oro del fichero
([`router.ts:10-17`](../../../packages/transport/src/router.ts#L10-L17)) —«`respondWith`
solo cuando se va a servir de verdad»— es correcta; lo que falla es que el shell nunca
entra en la lista de cosas que se van a servir de verdad.

`SHELL` únicamente rellena la caché: no se le asocia política ninguna.

### 2.2. Causa B — la caché `shell-<build>` no está cableada al router

`RouterStores` son solo `routes`/`pages`/`data`:

- [`router.ts:64-68`](../../../packages/transport/src/router.ts#L64-L68) — la interfaz.
- [`bootstrap.ts:81-85`](../../../packages/vite/src/bootstrap.ts#L81-L85) — su construcción.

`NAMES.shell` se abre en exactamente dos sitios: el `install` para **escribir**
([`bootstrap.ts:43-46`](../../../packages/vite/src/bootstrap.ts#L43-L46)) y `build()` para
leer el manifest ([`bootstrap.ts:79-80`](../../../packages/vite/src/bootstrap.ts#L79-L80)).
Después de arrancar es una **caché de solo escritura**.

Por eso arreglar solo la Causa A no basta: `handleResource` lee de `stores.data`
([`router.ts:208`](../../../packages/transport/src/router.ts#L208)), que es otra caché. Una
regla nueva para `/fudic-main.js` iría a red igual la primera vez y duplicaría la entrada
en `data-<build>`, dejando la copia del shell sin usar para siempre.

### 2.3. Alcance

La misma causa afecta a:

- **Toda entrada de `shell`**, no solo a `fudic-main.js`: CSS crítico, fuentes, un
  `offline.html`, un logo. Hoy `sw.json` solo declara una y por eso el fallo parece
  aislado.
- **`MANIFEST_URL`**, precacheado en [`bootstrap.ts:44`](../../../packages/vite/src/bootstrap.ts#L44).
  Solo lo lee el propio SW con `cache.match`
  ([`manifest.ts:162-168`](../../../packages/transport/src/manifest.ts#L162-L168)); si un
  documento lo pidiera por HTTP, red.
- **El diagnóstico `FUD0391` (`FUD_SW_SHELL_MISSING`)**, declarado en
  [`diagnostics.ts:23`](../../../packages/vite/src/diagnostics.ts#L23) y **nunca emitido**:
  hoy una entrada de shell que no existe en el build se traga en silencio el `catch` de
  [`bootstrap.ts:45`](../../../packages/vite/src/bootstrap.ts#L45), en tiempo de ejecución
  y en el cliente. Es el mismo agujero visto desde el build.

---

## 3. Interfaz pública

### 3.1. `@fudic/transport` — `RouterStores` gana el shell

```ts
export interface RouterStores {
  /** Precargado en `install`. Servido cache-first: inmutable dentro del build. */
  readonly shell: Store;
  readonly routes: Store;
  readonly pages: Store;
  readonly data: Store;
}
```

Cambio **incompatible**: `shell` es requerido, no opcional. Un `Store` que falta no puede
degradarse a «no cachees» sin reintroducir exactamente este bug en silencio.

### 3.2. `@fudic/transport` — `RouterConfig` gana la lista del shell

```ts
export interface RouterConfig {
  // … sin cambios …
  /**
   * URLs precargadas en `install`, EXACTAS (no globs). Se resuelven contra `origin` y se
   * evalúan ANTES que `resources`: el shell es identidad, no clase.
   */
  readonly shell?: readonly string[];
}
```

### 3.3. `@fudic/vite` — el bootstrap pasa lo que precachea

`SwBootstrapOptions` no cambia de forma; cambia el código emitido, que ahora entrega a
`createRouter` las mismas URLs que metió en la caché, más `MANIFEST_URL`.

### 3.4. Sin cambios

`ResourceRule`, `Store`, `swconfig.ts` y el formato de `sw.json` se quedan como están. El
shell **no** se modela como una `ResourceRule` con `pattern`: son URLs literales, y
convertirlas en globs abriría la puerta a que una entrada de shell capture recursos que no
están precacheados.

---

## 4. Comportamiento corregido

### 4.1. El shell se sirve por identidad, antes que cualquier clase

En el `fetch` handler, para una petición **no navegación**:

1. Si la URL absoluta está en el conjunto del shell → `respondWith` desde `stores.shell`
   con `cache-first` y `ttl: null`. **Fin.**
2. Si no, se evalúan las `resources` en orden, como hoy.
3. Si tampoco casa ninguna → `return`, la petición no se toca.

El orden importa y es fijo: identidad primero, clase después. Un `/assets/**` que casara
una entrada de shell la serviría desde `data-<build>`, que es la Causa B otra vez.

### 4.2. `cache-first` con `ttl: null` es la única política del shell

No es configurable, y no debe serlo: el nombre de la caché lleva el build id
([`store.ts:24-31`](../../../packages/transport/src/store.ts#L24-L31)), así que dentro de un
build el shell es inmutable por construcción. Un build nuevo cambia los bytes del SW → el
navegador actualiza → `activate` purga `shell-<build-viejo>`
([`bootstrap.ts:50-53`](../../../packages/vite/src/bootstrap.ts#L50-L53)). Un TTL sobre eso
sería un segundo mecanismo de caducidad para algo que ya caduca.

Esto vale también para `/fudic-main.js` y `/fudic-routes.json`, que tienen nombre fijo sin
hash: su identidad la da la caché, no el nombre.

### 4.3. El manifest entra en el shell servible

`MANIFEST_URL` se precachea ya hoy; a partir de ahora también se registra como entrada
servible. Un documento que lo pida —o una herramienta de depuración— lo obtiene de caché,
sin red, y sin poder recibir una versión distinta de la que el router tiene en memoria.

### 4.4. Una entrada de shell que no existe es un diagnóstico de build

`FUD0391` deja de estar declarado y sin uso. En `generateBundle`, toda entrada de `shell`
se comprueba contra los nombres de fichero del bundle (más los assets emitidos); una que no
exista emite `FUD_SW_SHELL_MISSING` como *warning* de Vite. Se avisa en el build, que es
donde el desarrollador puede arreglarlo, en vez de tragárselo en el cliente.

El `catch` del `install` se mantiene: es la última red de seguridad, no el mecanismo de
detección.

### 4.5. La rama de navegación no se toca

`handle` solo cambia en el camino de `request.mode !== 'navigate'`. La decisión síncrona de
§4.4.1 de SDD-20 y todo lo que cuelga de ella son de [BUG-02](./BUG-02-html-por-ruta.md).

---

## 5. Invariantes

**Los que el bug violaba**

- *SDD-20 §4.6.1* — «el `install` precachea el SHELL». Se cumplía la letra (se precacheaba)
  y no el propósito (nunca se servía).
- *Funcionamiento sin red* — el criterio implícito de todo Service Worker de shell: si el
  documento se sirve desde caché, sus dependencias declaradas también.

**Los que la corrección añade**

- **Lo que se precachea, se sirve.** Ninguna URL entra en `shell-<build>` sin quedar
  registrada como servible desde ahí. Una caché de solo escritura es un bug por
  construcción, y el test de §6.5 lo convierte en fallo.
- **Una caché, un lector.** Cada `Store` del router tiene exactamente un camino de lectura;
  ninguna URL se puede servir desde dos cachés distintas según quién la pida.
- **`respondWith` solo cuando se va a servir de verdad.** Sin cambios: el shell añade
  casos en los que sí se sirve, nunca un `fetch(request)` de rescate.

---

## 6. Criterios de aceptación

Tests en `packages/transport/test/router.test.ts` y `packages/vite/test/bootstrap.test.ts`.
Los marcados **(rojo primero)** deben verse fallar contra el código actual.

1. **(rojo primero)** Una petición no-navegación a una URL de `shell` con la entrada en
   `stores.shell` → `respondWith` con la respuesta cacheada, y `net` **no** se invoca.
2. **(rojo primero)** La misma petición con `resources: []` → sigue sirviéndose. El shell no
   depende de que existan clases de recurso.
3. El shell gana a una clase que también casa: con `shell: ['/fudic-main.js']` y una regla
   `pattern: '/**'`, la respuesta sale de `stores.shell`, y `stores.data` queda intacta
   (`keys()` vacío).
4. Una URL de `shell` **no** presente en `stores.shell` → se va a red por `stores.shell`
   (`cache-first` degrada), y el resultado queda sellado en `shell`, no en `data`.
5. **(rojo primero)** Auditoría de cableado: para cada `Store` de `RouterStores` existe al
   menos un camino que lee de él. Se verifica con un doble de `Cache` que cuenta `match`:
   tras un ciclo install → navegación → recurso de shell → recurso de clase, los cuatro
   contadores son > 0.
6. Una URL que no está ni en `shell` ni en ninguna `resource` → `respondWith` **no** se
   llama (contador a 0).
7. El bootstrap emitido pasa a `createRouter` un `shell` que contiene exactamente
   `[...SHELL, MANIFEST_URL]`, comprobado sobre el texto generado por `emitSwBootstrap`.
8. `MANIFEST_URL` pedido como recurso se sirve desde `stores.shell` sin red.
9. **(rojo primero)** `generateBundle` con `shell: ['/no-existe.js']` emite un warning
   `FUD0391` que nombra la entrada. Con un shell válido, ninguno.
10. **Extremo a extremo** (`examples/basic/scripts/sw-check.mjs`): tras dos cargas, una
    tercera con `Network.emulateNetworkConditions { offline: true }` sirve la navegación y
    `/fudic-main.js` llega con `fromServiceWorker === true`. La página arranca sin red.

**Cobertura.** `router.ts` y `bootstrap.ts` no bajan de su cifra actual de ramas. Las
ramas nuevas de `handleResource` van cubiertas por 1, 3, 4 y 6.

---

## 7. Fuera de alcance

- **La rama de navegación del `fetch` handler**, `record.html`, el store `pages` y
  `servePage`: son [BUG-02](./BUG-02-html-por-ruta.md).
- **El grafo de imports del propio `fudic-sw.js`**: es
  [BUG-03](./BUG-03-chunks-compartidos-sw.md). Un import estático del SW no pasa por el
  `fetch` handler, así que no lo arregla ninguna regla de shell.
- **Hacer configurable la política del shell** en `sw.json` (§4.2). Si algún día hace
  falta, es un SDD, no un bug.
- **Precachear rutas o chunks en el `install`.** SDD-20 §4.6.1 lo prohíbe explícitamente y
  sigue vigente: con 100 rutas es inaceptable.
- **`maxEntries`/`prune` sobre el shell.** El shell es finito y declarado a mano; podarlo
  sería poder borrar lo que garantiza el arranque offline.
