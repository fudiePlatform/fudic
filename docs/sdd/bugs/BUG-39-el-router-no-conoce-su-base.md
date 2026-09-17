# BUG-39 · El router no conoce su `base`: una app publicada bajo un prefijo declina sus propias rutas

> **Estado:** `Hecho`
> **Corrige:** [SDD-20](../SDD-20-render-sw.md) §4.4, §4.6 ·
> [SDD-27](../SDD-27-artefactos-y-manifiesto.md) §5.4
> **Paquetes:** `@fudic/transport`
> **Rango:** ninguno. **No reserva códigos**: no hay nada que diagnosticar — el defecto no
> produce un error, produce silencio.
> **Descubierto por:** [BUG-33](./BUG-33-caches-por-app.md), al construir su evidencia. Es la
> segunda app, la de `/admin/`, la que lo destapa.

---

## 1. Contexto y síntoma

Una aplicación publicada bajo un `base` que no sea `/`:

```
https://example.com/admin/      →  app "tienda-admin"  (base "/admin/")
```

Se construye bien, se sirve bien y **se ve bien mientras hay red**. Su Service Worker se
registra, instala, precachea su shell y activa. Todo lo que se puede comprobar sin apagar
la red dice que funciona.

Lo que no hace es **nada de lo suyo**:

```
1. visitar /admin/         → el SW activa, escribe shell-tienda-admin-<build>
2. …y ahí se queda         → routes-tienda-admin-<build> está VACÍA
3. cortar la red           → /admin/ no abre
```

El worker no renderiza ni una página, no calienta ni un chunk y su caché de rutas no
recibe un solo byte en toda la vida de la aplicación. Cada navegación cae a la red, que
online contesta, y offline no.

No es que la app pierda una optimización: **es que el Service Worker no hace absolutamente
nada** salvo ocupar sitio. La promesa del framework —offline-first, la página servida con
el worker parado y sin red— no se cumple para ninguna app que no viva en la raíz de su
origen.

### 1.1. Por qué no se había visto

Porque hasta [SDD-41](../SDD-41-configuracion-de-aplicacion.md) no había ninguna app
publicada bajo un prefijo. `examples/basic` tiene `base: "/"`, y con `base: "/"` el defecto
es exactamente invisible: el prefijo que falta mide cero segmentos.

Hizo falta montar dos aplicaciones en un origen —la evidencia de
[BUG-33](./BUG-33-caches-por-app.md)— para que existiera la primera app bajo `/admin/`. El
síntoma se observó primero como *«las cachés de la segunda app no aparecen»* y se atribuyó
al fixture; el fixture estaba mal por otra razón, y debajo estaba esto.

---

## 2. Causa raíz

### 2.1. El manifiesto guarda patrones sin `base`, y es correcto

[`packages/transport/src/manifest.ts:109`](../../../packages/transport/src/manifest.ts#L109)
lo dice al declarar el campo:

```ts
/**
 * The app's public base path (Vite's `base`). It used to be baked into every URL of
 * every record; now that the records carry names instead, it is stated once and the
 * resolver applies it.
 */
readonly base: string;
```

Un registro lleva el patrón **que nombró el build** —`/`, `/pedidos`, `/blog/:slug`— y de
ahí sale el nombre de su chunk por `safeName`. El `base` se declara una vez y lo aplica
`createUrlResolver`. Eso está bien y no se toca.

### 2.2. Pero se casa contra un pathname que sí lo lleva

[`compileManifest`](../../../packages/transport/src/manifest.ts#L220), antes del arreglo:

```ts
const compiled: CompiledRoute[] = file.routes.map((record) => ({
  segments: segmentsOf(record.pattern),   // ← sin base
  record,
}));
const match = (pathname: string): RouteMatch | null => {
  const parts = segmentsOf(pathname);     // ← con base
  …
};
```

Y los tres sitios que llaman a `match` le pasan un pathname del origen entero:

| Quién | Qué pasa | Fichero |
|---|---|---|
| `decide` (la navegación) | `url.pathname` | [`router.ts:437`](../../../packages/transport/src/router.ts#L437) |
| `warm` (el aviso de ubicación) | `new URL(msg.url).pathname` | [`router.ts:347`](../../../packages/transport/src/router.ts#L347) |
| `invalidate` (el bus de control) | la ruta del mensaje | [`router.ts:507`](../../../packages/transport/src/router.ts#L507) |

Para la app de `/admin/`:

```
match('/admin/')          parts ['admin']            vs  patrón '/'         → []             no casa
match('/admin/pedidos')   parts ['admin','pedidos']  vs  patrón '/pedidos'  → ['pedidos']    no casa
```

`match` devuelve `null` **siempre**, para todas las rutas de la aplicación y para toda su
vida.

### 2.3. Qué se sigue de ese `null`

Y es lo que convierte un fallo de casado en la desaparición completa del worker:

- `decide` devuelve `null` → `handle` no llama a `respondWith` → **la red sirve la
  navegación**, que es el comportamiento correcto para una ruta que no es mía, y todas lo
  parecen.
- `warm(pathname)` no encuentra registro → **no deposita ningún chunk** → `routes-` vacía.
- `ready()` recorre `table.records()` y sí encuentra los registros, pero ninguno de sus
  chunks está en caché —porque nadie los calentó nunca—, así que `warmed` nace vacío en
  cada arranque.

Las tres cosas se refuerzan: sin warm no hay chunk, sin chunk no hay render, y sin render
no hay motivo para calentar.

### 2.4. Alcance

- **Solo `@fudic/transport`.** El `base` sí está enhebrado en todo lo demás: el scope del
  SW es el directorio de su script, el manifiesto es `${base}fudic-routes.json`, el
  endpoint de datos es `join(base, '_fudic/data')` y las URL de chunk salen de
  `createUrlResolver(base, build)`.
- **Corrige una afirmación de BUG-33.** Su §2.3 decía que *«los nombres de caché son el
  único sitio del esquema de nombres donde `base` no está enhebrado»*. Eran dos: el casado
  de rutas es el otro, y no es del esquema de nombres sino del de patrones.
- **No alcanza al prerender ni al borde.** `edge` y `ssg` no pasan por esta tabla: el
  envoltorio del borde recibe el registro que le corresponde y el prerender enumera
  `records()`, que nunca dependió del casado.

---

## 3. Interfaz pública

**No cambia ninguna firma.** `compileManifest(file)` recibe lo que ya recibía —el `base`
viene dentro del `ManifestFile`— y `RouteTable.match(pathname)` sigue tomando un pathname.

Lo que cambia es **qué pathname**, y ahora se dice:

```ts
/**
 * Match a pathname OF THE ORIGIN — `base` included, as `url.pathname` gives it.
 *
 * The records keep the patterns the build named, base excluded; the prefix lives on the
 * compiled segments. So a table answers about the origin it is served from, which is the
 * only thing the fetch handler has in front of it.
 */
match(pathname: string): RouteMatch | null;
```

Y con ello queda fijado lo que ya era cierto de los otros dos canales: la `url` de
`LocationMessage` y la `route` de `ControlMessage` son del origen, no relativas al `base`.

---

## 4. Comportamiento corregido

### 4.1. El prefijo va en los segmentos compilados, nunca en el registro

```ts
const prefix = segmentsOf(file.base);
const compiled = file.routes.map((record) => ({
  segments: [...prefix, ...segmentsOf(record.pattern)],
  record,
}));
```

**En los segmentos y no en el patrón**, y esa es la mitad que importa: el registro es lo
que deriva la URL de su chunk, y `renderUrl` aplica `base` por su cuenta. Prefijar también
el patrón lo aplicaría dos veces y produciría `/admin/sw/c/admin-pedidos-<build>.js` para
un fichero que se llama `/admin/sw/c/pedidos-<build>.js`.

### 4.2. `segmentsOf` ya resuelve la barra final

`segmentsOf` descarta los segmentos vacíos, así que `/admin/` y `/admin` dan los mismos
`['admin']`, y el patrón `/` da `[]`. El índice de la aplicación casa escrito de las dos
formas, sin ningún caso especial.

### 4.3. `base: "/"` no cambia en nada

`segmentsOf('/')` es `[]`, así que el prefijo es vacío y la tabla se compila exactamente
como antes. Toda aplicación en la raíz de su origen —que son todas las que existían— se
comporta igual, byte a byte.

### 4.4. Lo de fuera del `base` es de otro

`match('/')` en la tabla de la app de `/admin/` devuelve `null`, y es la respuesta
correcta: en un origen compartido esa ruta es de otra aplicación. Un worker que la
reclamara sería el defecto simétrico de BUG-33 — no borrarle las cachés al vecino, sino
contestar por él.

---

## 5. Invariantes

- **Un registro lleva el nombre que le puso el build.** El `base` se declara una vez en el
  manifiesto y lo aplica quien construye URLs. Esta corrección no lo mete en los patrones.
- **La tabla habla del origen.** `match`, `templateOf` y `warm` toman pathnames tal como
  los da `url.pathname`. No hay dos vocabularios de ruta dentro del worker.
- **El casado sigue siendo síncrono y puro.** `respondWith` solo puede llamarse durante el
  despacho del evento, así que compilar el prefijo se hace una vez, al compilar la tabla.
- **Nada lanza.** Un `base` vacío, uno sin barras o uno con varias producen un prefijo bien
  formado porque `segmentsOf` descarta los vacíos.

---

## 6. Criterios de aceptación

En `packages/transport/test/manifest.test.ts`, y la evidencia en `examples/workspace`.

1. **(rojo primero)** Con `base: "/admin/"`, `match('/admin/blog/new')` encuentra su
   registro y `match('/admin/blog/x')` extrae `{ slug: 'x' }`. Antes del cambio los dos
   devuelven `null`.
2. El índice casa con y sin barra final: `match('/admin/')` y `match('/admin')` dan los dos
   el registro del patrón `/`.
3. Lo de fuera no es de esta app: `match('/blog/new')` y `match('/')` devuelven `null`.
4. **El registro conserva su patrón.** El hit de `/admin/blog/x` tiene
   `record.pattern === '/blog/:slug'` y `urls.renderUrl(record)` da
   `/admin/sw/c/blog-slug-<build>.js` — una sola vez el `base`.
5. **`base: "/"` no se entera.** Los tests que ya había sobre la tabla pasan sin tocar ni
   uno: el prefijo de una app en la raíz mide cero segmentos.
6. **La evidencia.** En `examples/workspace`, la app de `/admin/` escribe chunks en
   `routes-tienda-admin-<build>` y abre sin red. Verificado en Chrome real.
7. **Cobertura.** `@fudic/transport` no baja; `src/manifest.ts` vuelve a su umbral de 100 %
   en las cuatro métricas.

---

## 7. Fuera de alcance

- **Que dos apps de un origen se repartan rutas entre sí.** Cada tabla contesta por lo
  suyo y devuelve `null` para lo demás. Un worker que sirviera rutas de otra aplicación es
  otro defecto, no el contrario de este.
- **Normalizar el `base` en el manifiesto.** Se guarda tal cual lo da Vite. `segmentsOf`
  absorbe las variantes al compilar, que es donde cuesta una vez y no por petición.
- **El bus de control.** `ControlMessage.route` queda documentada como ruta del origen y no
  se le añade validación: no hay emisor dentro del repo, y lo que un `invalidate` con una
  ruta que no casa produce hoy es lo mismo que producía antes — nada.
