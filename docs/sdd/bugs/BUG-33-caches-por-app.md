# BUG-33 · Dos apps en el mismo origen se borran las cachés

> **Estado:** `Listo`
> **Corrige:** [SDD-20 — Render en el Service Worker](../SDD-20-render-sw.md) §4.10
> **Paquetes:** `@fudic/transport` · `@fudic/vite`
> **Depende de:** [SDD-41](../SDD-41-configuracion-de-aplicacion.md) — el `id` de aplicación
> **Rango:** reutiliza el de SDD-20; **no** reserva códigos nuevos

---

## 1. Contexto y síntoma

Dos aplicaciones fudic publicadas en el mismo origen, cada una bajo su `base`:

```
https://example.com/            →  app "shop"   (base "/")
https://example.com/admin/      →  app "admin"  (base "/admin/")
```

Las dos se registran sin problema —el scope de un Service Worker es el directorio de su
script y por debajo, así que `/admin/fudic-sw.js` gobierna `/admin/*` y el de la raíz el
resto— y las dos renderizan bien mientras hay red.

El síntoma aparece en el `activate` de cualquiera de las dos:

```
1. visitar /            → SW de shop instala, escribe shell-a1b2c3d4, routes-a1b2c3d4, …
2. visitar /admin/      → SW de admin activa
                          → borra shell-a1b2c3d4, routes-a1b2c3d4, pages-…, data-…
3. volver a /  offline  → la app de shop no abre: su shell ya no está
```

Y al revés en la siguiente visita. **Cada navegación de una app a la otra deja a la
anterior sin cachés**, y la única razón de que no se vea hoy es que nadie ha desplegado dos
aplicaciones fudic en un mismo origen.

No es un problema de rendimiento. Es que la promesa de este framework —offline-first, la
página se sirve con el worker parado y sin red— **deja de cumplirse para la app que no
visitaste la última**.

---

## 2. Causa raíz

### 2.1. Los nombres de caché llevan el build, y nada más

[`packages/transport/src/store.ts:43`](../../../packages/transport/src/store.ts#L43):

```ts
export function cacheNames(build: string): CacheNames {
  return {
    shell:  `shell-${build}`,
    routes: `routes-${build}`,
    pages:  `pages-${build}`,
    data:   `data-${build}`,
  };
}
```

El build id identifica **una construcción**, no **una aplicación**. Dos apps distintas
producen dos build ids distintos, que es exactamente lo que el purgado lee como «dos
builds de lo mismo».

### 2.2. El purgado es por origen, no por scope

[`packages/transport/src/store.ts:53`](../../../packages/transport/src/store.ts#L53):

```ts
export function isStaleCache(name: string, build: string): boolean {
  return /^(shell|routes|pages|data)-/u.test(name) && !name.endsWith(`-${build}`);
}
```

Y quien lo llama, en el `activate` del worker emitido
([`packages/vite/src/bootstrap.ts`](../../../packages/vite/src/bootstrap.ts)):

```js
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const name of await caches.keys()) {
    if (isStaleCache(name, BUILD)) await caches.delete(name);
  }
  …
```

`caches.keys()` enumera **la `CacheStorage` del origen entero**. No está acotada por el
scope del worker, ni por el `base`, ni por nada: es una propiedad del origen. El worker de
`/admin/` ve, y borra, las cachés escritas por el de `/`.

La regla está escrita para un mundo de una app por origen, y en ese mundo es correcta.

### 2.3. Alcance

- **Las cuatro cachés**, no una: `shell`, `routes`, `pages` y `data` comparten el esquema.
- **El `shell` es el que más duele**, porque es el que `install` precachea y el que hace
  que la app abra sin red. Perderlo es perder el arranque, no un recurso.
- **No alcanza a nada más.** Se comprobó pieza a pieza: el scope del SW va por `base`; el
  manifiesto es `${base}fudic-routes.json`; el endpoint de datos es
  `join(base, '_fudic/data')` ([`transport/src/urls.ts:80`](../../../packages/transport/src/urls.ts#L80));
  las URL de chunk salen de `createUrlResolver(base, build)`. **Los nombres de caché son el
  único sitio del esquema de nombres donde `base` no está enhebrado.**

### 2.4. Por qué el `base` no sirve como identificador

Es la solución que se ofrece sola y hay que descartarla por escrito, porque volverá a
proponerse: namespacear por `base` arregla el síntoma y crea uno peor. El `base` de un
despliegue cambia —se mueve una app de `/` a `/shop/`, se prueba bajo un prefijo, se sirve
detrás de otra ruta— y el día que cambia, las cachés del `base` anterior dejan de casar el
prefijo de nadie y **no las purga jamás ningún worker**. Un identificador de caché tiene
que sobrevivir a la URL, y por eso es el `id` de [SDD-41](../SDD-41-configuracion-de-aplicacion.md),
declarado a mano y con la instrucción explícita de no cambiarlo.

---

## 3. Interfaz pública

### 3.1. `@fudic/transport`

Las dos funciones ganan la aplicación. Es un cambio incompatible, y a propósito: una
firma que siga aceptando solo el build deja el defecto disponible.

```ts
/** The four caches of the framework, namespaced by APP and then by build (§4.1). */
export function cacheNames(app: string, build: string): CacheNames;

/**
 * True for a cache of THIS app and a build that is not the current one.
 *
 * A cache of another app is never stale here: purging it is the defect this fixes.
 * Also true for a cache written before BUG-33, whose name has no app segment (§4.3).
 */
export function isStaleCache(name: string, app: string, build: string): boolean;
```

### 3.2. `@fudic/vite`

`emitSwBootstrap` recibe la aplicación y la hornea en el worker, al lado del build:

```ts
export interface SwBootstrapOptions {
  // …manifestUrlExpr, shell, resources
  /** The app id (SDD-41 §3.1). A literal: it is known at config time, unlike the build. */
  readonly app: string;
}
```

```js
const APP   = "shop";
const BUILD = "__FUDB__";
const NAMES = cacheNames(APP, BUILD);
```

No hace falta un segundo token: el `id` se conoce en `configResolved`, mucho antes de
`generateBundle`. El `BUILD_TOKEN` sigue siendo el único que se sustituye, y la
sustitución sigue conservando cada offset.

---

## 4. Comportamiento corregido

### 4.1. La forma del nombre

```
<kind>-<app>-<build>          shell-shop-a1b2c3d4
```

La app en medio y no al final, porque lo que se lee por prefijo es «de quién es esta
caché» y lo que se compara por igualdad es el build.

### 4.2. El corte es por ANCHURA, no por el último guión

Un `id` puede llevar guiones —`^[a-z][a-z0-9-]*$`— y eso hace ambiguo el prefijo desnudo:

```
app "shop"        ¿es suya  shell-shop-admin-a1b2c3d4 ?
app "shop-admin"  la escribió ella
```

`shell-shop-` casa las dos, así que un prefijo a secas haría que `shop` purgara las cachés
de `shop-admin` — el mismo defecto, más pequeño. La comprobación es por **anchura**: el
nombre es de esta app cuando empieza por `<kind>-<app>-` **y lo que queda mide exactamente
`BUILD_ID_LENGTH`**. Con eso, `admin-a1b2c3d4` mide 14 y no es de `shop`.

Es el argumento de [`rename.ts`](../../../packages/vite/src/rename.ts) — *«dividir por
anchura, nunca por el último `-`, porque el alfabeto del hash contiene `-`»* — aplicado a
la otra punta del mismo esquema de nombres.

### 4.3. Las cachés de antes de este BUG sí se purgan

Un despliegue que ya está en producción tiene cachés con la forma vieja, `shell-a1b2c3d4`,
sin segmento de app. Con la regla nueva no casan el prefijo de nadie y quedarían en el
origen **para siempre**.

Así que `isStaleCache` también es cierta para la forma vieja: `<kind>-` seguido de
exactamente `BUILD_ID_LENGTH` caracteres y nada más. Es inequívoca —solo un worker
anterior a este BUG pudo escribirla— y es transitoria: en cuanto las dos apps redespliegan,
no queda ninguna.

Que una app purgue las cachés viejas de otra durante la transición es aceptable, y no es una
concesión: la forma vieja **es** el mundo en el que ya se estaban purgando entre ellas.

### 4.4. Sin `id` no hay worker

SDD-41 §4.3 lo deja cerrado desde el otro lado: un proyecto con `sw.json` y sin `id` es
`FUD0721` y el build falla. Así que aquí no hay caso degradado que resolver — cuando este
código corre, `APP` es una cadena no vacía, y no hace falta un valor por defecto que
mañana sería el nombre bajo el que tres apps distintas se pisan.

### 4.5. Lo que no cambia

El `install`, el `Store`, la clave de caché (la URL, y solo la URL — BUG-04), las políticas
de `sw.json`, el warm, el router y el enlazador. Este BUG cambia **cuatro cadenas y un
predicado**.

---

## 5. Invariantes

- **Una caché pertenece a una app y a un build.** Ningún worker borra lo que no escribió
  él o un build anterior de su misma app. Es el invariante que el defecto violaba.
- **Un worker, un build.** Sigue en pie y se refuerza: `APP` y `BUILD` son constantes
  horneadas en el código del worker, así que un worker no puede servir a dos aplicaciones
  igual que no puede servir a dos builds.
- **Sustitución de longitud constante.** `BUILD_TOKEN` sigue siendo el único token
  sustituido y sigue midiendo lo que mide el id, así que ningún offset se mueve y los
  mapas generados para el worker siguen describiéndolo (BUG-05 §4.4).
- **Nada lanza.** Un nombre de caché que no case ninguna de las dos formas se deja en paz.
  El purgado no es una autoridad sobre la `CacheStorage` del origen: es una autoridad sobre
  lo suyo.
- **Cobertura.** El código nuevo de `@fudic/transport` nace al 100 % en las cuatro
  métricas; el paquete no baja del número que tiene al empezar.

---

## 6. Criterios de aceptación

Tests en `packages/transport/test/store.test.ts` (1–6), `packages/vite/test/` (7–8) y la
evidencia end-to-end en `examples/basic` (9).

1. **(rojo primero)** Con la firma de hoy, `isStaleCache('shell-a1b2c3d4', 'ffffffff')` es
   `true` — una app declara basura la caché de otra. El test se escribe contra el código
   roto, se ve fallar, y es el que este BUG invierte.
2. `cacheNames('shop', 'a1b2c3d4')` produce las cuatro con la forma `<kind>-shop-a1b2c3d4`.
3. **La caché de otra app no es stale.** `isStaleCache('shell-admin-ffffffff', 'shop', 'a1b2c3d4')`
   es `false`. Con cualquier build, y con `admin` y `shop` intercambiados.
4. **El corte por anchura.** `isStaleCache('shell-shop-admin-ffffffff', 'shop', 'a1b2c3d4')`
   es `false`: lo que queda tras `shell-shop-` mide 14 y no 8 (§4.2). Y
   `isStaleCache('shell-shop-admin-ffffffff', 'shop-admin', 'a1b2c3d4')` es `true`.
5. **Un build anterior de la misma app sí es stale.**
   `isStaleCache('shell-shop-ffffffff', 'shop', 'a1b2c3d4')` es `true`.
6. **La forma vieja se purga.** `isStaleCache('shell-ffffffff', 'shop', 'a1b2c3d4')` es
   `true`, y también `isStaleCache('shell-a1b2c3d4', 'shop', 'a1b2c3d4')` — sin segmento de
   app, ni siquiera el build propio la salva (§4.3). Un nombre ajeno al esquema,
   `mi-cache`, es `false` en todos los casos.
7. El Service Worker emitido contiene `const APP = "<id>";` y su `NAMES` sale de las dos
   constantes. El `id` llega desde el `fudic.json` del proyecto, no desde una opción del
   plugin.
8. Un build con `sourcemap` activo sigue produciendo un mapa válido para `fudic-sw.js`: la
   única sustitución sigue siendo la de `BUILD_TOKEN`, y sigue midiendo `BUILD_ID_LENGTH`.
9. **La evidencia.** Dos builds de `examples/basic` bajo el mismo origen —uno en `/` con
   `id: "basic"`, otro en `/admin/` con `id: "basic-admin"`— y un test de Playwright que:
   visita `/`, visita `/admin/`, corta la red y **vuelve a `/`**. La página abre. Hoy, con
   el mismo guion, no abre — y esa es la forma end-to-end del criterio 1.

---

## 7. Fuera de alcance

- **Las URL de chunk, el manifiesto y el endpoint de datos.** Ya van por `base` (§2.3). No
  se tocan, y meterlos en el namespacing sería cambiar nombres que hoy son correctos.
- **Un worker que sirva a varias apps.** No existe y no puede existir: `APP` y `BUILD` son
  constantes del código del worker (§5). Si algún día hiciera falta, es un rediseño del
  esquema entero de nombres, no una variante de este arreglo.
- **La cuota de `CacheStorage` entre apps.** N apps en un origen comparten la cuota del
  origen, y con este arreglo ninguna limpia por la otra. Es una consecuencia real y no se
  resuelve aquí: `maxEntries` por clase de recurso ya existe en `sw.json` y es lo que hay.
- **Que `fudic.json` sea obligatorio en general.** SDD-41 §4.1 lo deja opcional a
  propósito; solo lo exige donde hay `sw.json`, que es donde este BUG vive.
- **Migrar despliegues.** No hay comando ni aviso: §4.3 hace que la transición se resuelva
  sola en el primer `activate` después de redesplegar.
