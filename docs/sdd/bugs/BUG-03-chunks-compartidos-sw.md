# BUG-03 — Chunk servido desde caché y pedido a red a la vez

> **Estado:** `Hecho`
> **Corrige:** [SDD-20 — Render en el Service Worker](../SDD-20-render-sw.md) §4.1, §4.10
> **Paquete:** `@fudic/vite`
> **Rama sugerida:** `fix/bug-03-sw-self-contained`
> **Independiente:** no comparte ni un fichero con BUG-01 y BUG-02. Puede ir en paralelo,
> en su propio worktree.

---

## 1. Contexto y síntoma

En la segunda carga, `/assets/messages-3HGjEekh.js` aparece **dos veces** en el Network:
una servida por el Service Worker desde caché y otra como `fetch` a red del mismo URL. Su
política en `sw.json` es `cache-first` con `ttl: null`, así que esa segunda petición no
debería producirse. Desaparece en la tercera carga y reaparece cuando el worker se recicla.

**El camino del `new Function` no es el culpable.** El linker sí consulta Cache Storage
antes de ir a red:

- [`bootstrap.ts:87`](../../../packages/vite/src/bootstrap.ts#L87) — `fetchSource` es
  `stores.routes.get(url, 'cache-first', null)`.
- [`store.ts:135-137`](../../../packages/transport/src/store.ts#L135-L137) — `cache-first`
  respeta el hit cuando `ttl` es `null`.
- [`store.ts:88-103`](../../../packages/transport/src/store.ts#L88-L103) — y además
  deduplica peticiones en vuelo por URL.

Ese camino está bien. El defecto está una capa más abajo: en el **bundling**.

**Reproducción**

```sh
pnpm build && pnpm --filter @fudic/example-basic preview
# Chrome, perfil limpio, DevTools → Network, filtrar por "messages-"
# Segunda carga: dos filas para el mismo URL — una "(ServiceWorker)" y una de red
# DevTools → Application → Service Workers → "stop", recargar: reaparece
```

---

## 2. Causa raíz

`/assets/messages-3HGjEekh.js` es un **chunk compartido entre `fudic-main.js` y
`fudic-sw.js`**:

```
dist/fudic-main.js:  from"./assets/messages-3HGjEekh.js"
dist/fudic-sw.js:    import"./assets/messages-3HGjEekh.js"
```

Las dos filas son **dos consumidores distintos del mismo URL**, con dos mecanismos de carga
que no se conocen entre sí:

- **La fila «from cache»** — la página carga `/fudic-main.js`, que importa `messages`. Pasa
  por el `fetch` handler, casa `/assets/**` y se sirve desde `data-<build>`
  ([`router.ts:203-213`](../../../packages/transport/src/router.ts#L203-L213)).
- **La fila «network»** — es un **import estático del propio script del Service Worker**.
  El cargador de scripts del SW **no pasa por el `fetch` handler de ese SW**, y con
  `updateViaCache: 'none'`
  ([`main.ts:14`](../../../packages/transport/src/main.ts#L14)) tampoco por la caché HTTP.
  Cada arranque o comprobación de actualización del worker lo vuelve a traer — que es
  exactamente la observación de que reaparece al reciclarse el worker.

### 2.1. El origen en el build

El Service Worker se emite como un chunk del **mismo output de Rollup** que `fudic-main`:

- [`plugin.ts:106`](../../../packages/vite/src/plugin.ts#L106) — `input: { 'fudic-main': MAIN_ID }`.
- [`plugin.ts:353`](../../../packages/vite/src/plugin.ts#L353) —
  `this.emitFile({ type: 'chunk', id: SW_ID, name: 'fudic-sw' })`.
- [`plugin.ts:100-101`](../../../packages/vite/src/plugin.ts#L100-L101) — `pinned()` solo
  fija el **nombre** del chunk pinchado; todo lo compartido cae en
  `assets/[name]-[hash].js`.

Dos entradas en el mismo grafo → code splitting → chunk común. Para dos realms que no
comparten mecanismo de carga, un chunk común no es una optimización: es una descarga
duplicada permanente.

El repo ya tiene la forma correcta y no se aplicó aquí: el link pass corre su **propio
`build()` aislado** ([`link.ts:137-162`](../../../packages/vite/src/link.ts#L137-L162)),
precisamente porque su salida la consume otro cargador.

### 2.2. Alcance

- **`/assets/dist-Bk9BhQVZ.js`** —el bundle de `@fudic/ssr` + transport que importa el SW—
  tiene la misma causa. Hoy no se **duplica** porque `fudic-main` no lo importa, pero se
  refetchea igual en cada reciclado del worker, y encima la regla `/assets/**` lo cachea en
  `data-<build>` sin que nadie lo use nunca desde ahí.
- **`maxEntries: 200`** de la clase `assets` en [`sw.json`](../../../examples/basic/sw.json):
  los chunks del SW cuentan contra ese presupuesto y el `prune` es FIFO
  ([`store.ts:159-168`](../../../packages/transport/src/store.ts#L159-L168)), así que
  ocupan sitio que debería ser de recursos de la aplicación.
- **El cálculo del build id**
  ([`plugin.ts:437-439`](../../../packages/vite/src/plugin.ts#L437-L439)) se alimenta de
  `Object.keys(bundle)`. Si el SW deja de estar en `bundle`, el id deja de reflejarlo — hay
  que arreglarlo en el mismo cambio (§4.3).
- **La sustitución de `BUILD_TOKEN`**
  ([`plugin.ts:441-445`](../../../packages/vite/src/plugin.ts#L441-L445)) recorre `bundle`
  buscando `item.type === 'chunk'`. Un SW emitido como asset **no** pasaría por ahí y se
  quedaría con `__FUDIC_BUILD__` literal: cachés con nombre `shell-__FUDIC_BUILD__` e
  `isStaleCache` roto para siempre. Es el riesgo principal de esta corrección.

---

## 3. Interfaz pública

**Ninguna interfaz de runtime cambia.** Este BUG no toca `@fudic/transport`.

Cambia el **contrato de salida del build**, que es igual de contractual:

| Antes | Después |
|---|---|
| `dist/fudic-sw.js` con imports estáticos a `assets/*.js` | `dist/fudic-sw.js` **sin ningún import**: bundle autocontenido |
| `chunkFileNames: pinned('fudic-sw')` en el output principal | Innecesario: el SW ya no es un chunk de ese output |
| `import.meta.ROLLUP_FILE_URL_<swRef>` en el bootstrap main | URL literal `${base}fudic-sw.js` (§4.2) |

`/fudic-sw.js` ya tenía nombre fijo y sin hash —lo exige el scope raíz de un Service
Worker, [`plugin.ts:95-98`](../../../packages/vite/src/plugin.ts#L95-L98)—, así que el
literal no pierde nada frente a la referencia de Rollup.

---

## 4. Comportamiento corregido

### 4.1. El Service Worker es un bundle autocontenido

Se emite desde su **propio `build()`**, con `write: false`, dentro de `generateBundle`,
exactamente como el link pass:

- Entrada única: `SW_ID`.
- Salida única: un fichero, sin code splitting. `codeSplitting: false` y un solo
  `entryFileNames: 'fudic-sw.js'`.
- `@fudic/ssr` y `@fudic/transport` se bundlean **dentro**. Ya era la intención declarada:
  «el runtime va bundleado DENTRO de este worker y se entrega a los chunks como builtin»
  ([`bootstrap.ts:88-90`](../../../packages/vite/src/bootstrap.ts#L88-L90)).
- El resultado se emite con `this.emitFile({ type: 'asset', fileName: 'fudic-sw.js' })`.

**Regla:** un realm con su propio cargador tiene su propio bundle. Vale para el SW y para
los chunks enlazables; no hay un tercer caso.

### 4.2. El bootstrap del hilo principal usa la URL literal

`load(MAIN_ID)` deja de usar `fileUrl(swRef)`
([`plugin.ts:370`](../../../packages/vite/src/plugin.ts#L370)) y pasa a
`JSON.stringify(`${base}${DEV_SW_URL}`)`, la misma expresión que ya usa en dev. Un solo
camino para las dos ramas, y desaparece el `swRef` y su `emitFile` de `buildStart`
([`plugin.ts:352-354`](../../../packages/vite/src/plugin.ts#L352-L354)).

### 4.3. El build id incluye el SW, y el SW recibe el build id

Dos consecuencias del cambio de §4.1, ambas obligatorias:

- **Cálculo:** el `fileName` del SW autocontenido entra en el hash junto a
  `Object.keys(bundle)` y los chunks del link pass
  ([`plugin.ts:437-439`](../../../packages/vite/src/plugin.ts#L437-L439)). El id debe seguir
  cambiando cuando cambia el SW: es lo que dispara la actualización del navegador y el
  purgado de `activate`.
- **Sustitución:** `BUILD_TOKEN` se sustituye en el **código del SW antes de emitirlo**, no
  recorriendo `bundle`. Un `__FUDIC_BUILD__` sin sustituir produce cachés llamadas
  `shell-__FUDIC_BUILD__` que `isStaleCache` nunca purga
  ([`store.ts:34-36`](../../../packages/transport/src/store.ts#L34-L36)). El criterio §6.4
  existe solo para esto.

Orden: se calcula el id **después** de tener el `fileName` del SW y **antes** de emitir su
código.

### 4.4. La clase `/assets/**` deja de cachear código del SW

Efecto derivado, sin cambiar `sw.json`: al no existir chunks del SW bajo `/assets/`, la
regla deja de capturarlos. El presupuesto `maxEntries: 200` vuelve a ser de la aplicación.

### 4.5. `updateViaCache: 'none'` se mantiene

No es el bug; es la política correcta y el comentario de
[`main.ts:16-18`](../../../packages/transport/src/main.ts#L16-L18) la justifica: el script
del SW gobierna las actualizaciones y no puede venir de la caché HTTP. Lo que se elimina es
que ese refetch arrastre **N ficheros** en lugar de uno.

---

## 5. Invariantes

**Los que el bug violaba**

- *SDD-20 §4.1* — el SW se sirve con `'unsafe-eval'` y es la única pieza que evalúa. Un SW
  troceado en chunks bajo `/assets/**` reparte ese privilegio por ficheros que la CSP del
  documento gobierna de otra manera.
- *Cada URL tiene un mecanismo de carga.* `messages-*.js` tenía dos, y ninguno de los dos
  sabía del otro.
- *«Sin esto el prototipo descargaba cada chunk dos veces»*
  ([`store.ts:5-8`](../../../packages/transport/src/store.ts#L5-L8)) — la regresión que el
  dedup in-flight vino a arreglar, reaparecida por otra vía. El dedup no puede verla: los
  dos consumidores no comparten `Store`.

**Los que la corrección añade**

- **Un realm, un bundle.** Ningún fichero de salida es importado por dos cargadores
  distintos. Verificable estáticamente: §6.1.
- **`dist/fudic-sw.js` no tiene imports.** Cero `import` y cero `from` a otro fichero. Es un
  test de una línea sobre el artefacto, y es el que impide la regresión.
- **`BUILD_TOKEN` nunca sobrevive al build.** Ningún artefacto emitido contiene
  `__FUDIC_BUILD__`.

---

## 6. Criterios de aceptación

Tests en `packages/vite/test/plugin.test.ts` sobre el bundle emitido, más una comprobación
sobre el artefacto real de `examples/basic`.

1. **(rojo primero)** `dist/fudic-sw.js` no contiene ninguna sentencia `import` ni cláusula
   `from` con especificador de fichero. Cero imports estáticos, cero dinámicos.
2. **(rojo primero)** Ningún fichero bajo `dist/assets/` es referenciado a la vez por
   `dist/fudic-main.js` y por `dist/fudic-sw.js`. La intersección de sus especificadores es
   vacía.
3. `dist/fudic-sw.js` existe con ese nombre exacto, en la raíz de `outDir`, sin hash.
4. **(rojo primero)** Ningún artefacto emitido contiene la cadena `__FUDIC_BUILD__`. El SW
   contiene un id hexadecimal de 8 caracteres.
5. El build id cambia cuando cambia el código del SW y no cambia cuando no cambia nada
   (dos builds consecutivos del mismo árbol producen el mismo id).
6. `dist/fudic-main.js` sigue registrando `/fudic-sw.js` por su URL literal, con `base`
   aplicado. Test con `base: '/app/'` → `/app/fudic-sw.js`.
7. Los chunks del link pass (`sw/c/*`) siguen emitiéndose igual y el manifest sigue
   apuntándolos. Sin regresión en `link.test.ts`.
8. Sin `sw.json` no se emite `fudic-sw.js` ni se corre el build del SW. Es el
   comportamiento de hoy ([`plugin.ts:352`](../../../packages/vite/src/plugin.ts#L352)) y
   debe conservarse.
9. **Extremo a extremo** (`examples/basic/scripts/sw-check.mjs`): tras la segunda carga,
   **cero** peticiones de red a URLs bajo `/assets/` que también hayan sido servidas por el
   SW en esa misma carga. Y tras `ServiceWorker.stopAllWorkers` (CDP) y una recarga, la
   única petición de script del worker es `/fudic-sw.js`.

**Cobertura.** `plugin.ts` no baja de su cifra actual de ramas.

---

## 7. Fuera de alcance

- **Cambiar `updateViaCache`** (§4.5). Es correcto tal cual está.
- **Registrar el SW como script clásico** para evitar el problema del grafo de módulos.
  Rompería `type: 'module'`, que es lo que permite emitir el SW con el mismo pipeline que
  el resto.
- **Minificar o dividir el SW por tamaño.** Un SW autocontenido es más grande; se descarga
  una vez por build y se sirve desde el script cache del navegador. Si algún día molesta,
  es una decisión de rendimiento con medición, no un bug.
- **Tocar `sw.json` o la clase `/assets/**`.** §4.4 es un efecto derivado; la configuración
  del ejemplo no cambia.
- **El shell y sus políticas:** [BUG-01](./BUG-01-shell-sin-politica.md).
- **El HTML por ruta:** [BUG-02](./BUG-02-html-por-ruta.md).
