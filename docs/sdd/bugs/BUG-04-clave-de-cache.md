# BUG-04 — La clave de la caché no es la URL, y nadie lo había dicho

> **Estado:** `Hecho`
> **Corrige:** [SDD-20 — Render en el Service Worker](../SDD-20-render-sw.md) §4.6.3, §4.7, §4.10
> **Paquetes:** `@fudic/transport` · `@fudic/vite`
> **Rama sugerida:** `fix/bug-04-cache-key`
> **Depende de:** [BUG-01](./BUG-01-shell-sin-politica.md) en `Hecho` — hasta que el shell
> tuvo un lector, esta caché era de solo escritura y el defecto no era observable.
> **Diagnosticado:** arnés Playwright sobre `pnpm build && pnpm preview` en
> `examples/basic` (`tests/sw-network.spec.ts`), volcando Cache Storage con sus claves.

---

## 1. Contexto y síntoma

Tres cargas de `/` en un perfil limpio. La primera no tiene Service Worker y la sirve el
servidor; el `install` precachea el shell. La segunda ya está controlada, así que
`/fudic-main.js` debería salir de `shell-<build>` sin tocar la red. Sale de caché **y
además el Service Worker lo pide a red**. La tercera ya no.

```
LOAD 1   NETWORK   200  document  /
         NETWORK   200  script    /fudic-main.js
         SW-net    200  script    /fudic-sw.js
         SW-net    200  fetch     /fudic-main.js       ← el install precacheando
         SW-net    200  fetch     /fudic-routes.json   ← idem
         SW-net    200  fetch     /sw/c/*.js ×4        ← warm('/')

LOAD 2   SW-serve  200  document  /
         SW-net    200  fetch     /fudic-main.js       ← ⚠️ a red, estando en caché
         SW-serve  200  script    /fudic-main.js

LOAD 3   SW-serve  200  document  /
         SW-serve  200  script    /fudic-main.js       ← sin egress
```

Nada se rompe visiblemente: la página recibe su respuesta. Lo que se paga es un viaje de
red por entrada de shell y por instalación, y —esto es lo grave— **una política
`cache-first` se comporta como `network-first` sin decirlo**. El mismo mecanismo tiene
consecuencias que sí rompen, enumeradas en §2.4.

**Reproducción**

```sh
pnpm build && pnpm --filter @fudic/example-basic preview
# en otra shell:
pnpm --filter @fudic/example-basic exec playwright test tests/sw-network.spec.ts -g trace
```

---

## 2. Causa raíz

### 2.1. El mecanismo

La Cache API **no es un `Map` indexado por URL**. Es una caché HTTP: la clave es la
petición completa, y qué partes de ella cuentan lo decide la **respuesta almacenada** con
su header `Vary`. El algoritmo (*Request Matches Cached Item*, Service Workers spec) hace,
por cada entrada:

1. Si las URLs no coinciden (con query, salvo `ignoreSearch`) → no casa.
2. Si `ignoreVary` es `true` → **casa, y termina aquí**.
3. Si no, lee el `Vary` de la respuesta guardada y, por cada nombre de header que aparezca,
   compara su valor en la **petición entrante** contra su valor en la **petición
   guardada**. Si alguno difiere → no casa. `Vary: *` → nunca casa.

`vite preview` —y nginx, y Vercel, y Netlify, y Cloudflare, y cualquier middleware CORS—
responde `/fudic-main.js` con:

```
access-control-allow-origin: http://localhost:4173
vary: Origin
```

Y hace bien: calcula `Access-Control-Allow-Origin` **a partir** del `Origin` recibido, así
que la respuesta es función del `Origin` y tiene que declararlo.

Sobre esa misma URL intervienen dos peticiones de naturaleza distinta:

| Quién | Cómo | `Origin` |
|---|---|---|
| `install` → [`bootstrap.ts:45`](../../../packages/vite/src/bootstrap.ts#L45), `cache.add(url)` | GET mismo origen | **ausente** — el navegador no manda `Origin` en un GET mismo-origen |
| La página → `<script type="module" src="/fudic-main.js">` | los módulos se piden **siempre** en modo CORS | **`http://localhost:4173`** |

El paso 3 compara `"http://localhost:4173"` contra `""`. No casan.

### 2.2. Dónde se consulta

- [`store.ts:110`](../../../packages/transport/src/store.ts#L110) — `config.cache.match(request)`
  en `get`, **sin opciones**. Es el fallo de caché de la carga 2.
- [`store.ts:152`](../../../packages/transport/src/store.ts#L152) — `match`, igual.
- [`store.ts:156`](../../../packages/transport/src/store.ts#L156) — `delete`, igual: una
  invalidación que no casa **no invalida**.
- [`manifest.ts:179`](../../../packages/transport/src/manifest.ts#L179) — el `cache.match`
  de `loadManifest`, igual, y con la consecuencia de §2.4.1.

Y dónde se escribe con una clave distinta cada vez:

- [`store.ts:85`](../../../packages/transport/src/store.ts#L85) — `put` guarda bajo
  **la petición que le pasen**, la que sea.
- [`bootstrap.ts:45`](../../../packages/vite/src/bootstrap.ts#L45) — el `install` es el
  único escritor que **no pasa por el `Store`**: ni canonicaliza clave ni sella con
  `x-fudic-stored`.
- Once llamadas del router construyen la clave a mano con `new Request(...)`
  ([`router.ts:164`](../../../packages/transport/src/router.ts#L164),
  [`:180`](../../../packages/transport/src/router.ts#L180),
  [`:213`](../../../packages/transport/src/router.ts#L213),
  [`:280`](../../../packages/transport/src/router.ts#L280),
  [`:282`](../../../packages/transport/src/router.ts#L282),
  [`:339`](../../../packages/transport/src/router.ts#L339),
  [`:341`](../../../packages/transport/src/router.ts#L341)) y dos le pasan
  `event.request` tal cual ([`:247`](../../../packages/transport/src/router.ts#L247),
  [`:254`](../../../packages/transport/src/router.ts#L254)). **Nada obliga a que el que
  escribe y el que lee usen la misma forma de petición**, y en cuanto difieren la política
  cambia sola.

### 2.3. Por qué esto se puede mirar y no verse

Preguntando con un string —`cache.match('/fudic-main.js')`— se construye un `Request` sin
`Origin`, que **sí** casa con la entrada del `install`. El panel *Cache Storage* de
DevTools muestra la entrada, con su contenido. Las dos cosas dicen «está cacheado». Solo
falla cuando pregunta la petición real, que es la única que importa y la única que no se
inspecciona a mano.

La sonda del arnés lo deja por escrito:

```
probe match(shell, "/fudic-main.js") = true      ← mentira útil
LOAD 2 → SW-net fetch /fudic-main.js             ← la verdad
```

El delator objetivo está en el volcado: las entradas de la carga 1 **no llevan
`x-fudic-stored`** —las escribió `cache.add`, no el `Store`—, y la de después de la carga 2
sí.

### 2.4. Alcance

Los chunks de ruta se salvan **por coincidencia, no por diseño**: `warm` escribe con
`new Request(abs(dep))` y el linker lee con `new Request(url)`; ambos lados sin `Origin`,
así que `Vary: Origin` compara `""` con `""` y casa. El shell es la única caché donde el
escritor y el lector son peticiones distintas. Los demás casos de la misma causa:

#### 2.4.1. El Service Worker puede dejar de interceptar del todo

`/fudic-routes.json` es, desde BUG-01 §4.3, una entrada de shell **servible**. Si un
documento o una herramienta la pide por HTTP (con `Origin`), el `get` falla el match, va a
red y **reescribe la entrada con la clave que lleva `Origin`**. A partir de ahí
`loadManifest` —que pregunta con un string, sin `Origin`— **no la encuentra**, `build()`
lanza, `booting` se resetea y el router nunca queda listo: `fetch` deja de interceptar y la
aplicación entera vuelve al servidor, en silencio y hasta el siguiente build. Es pérdida
total de función, alcanzable hoy.

#### 2.4.2. Una URL, N entradas

Sin clave canónica, el mismo recurso pedido por consumidores distintos ocupa una entrada
por consumidor: `<img src>` (sin `Origin`, `Accept: image/*`), `fetch()` (con `Origin`),
`<link rel=preload>`, un módulo. El presupuesto `maxEntries: 200` de la clase `assets` en
[`sw.json`](../../../examples/basic/sw.json) deja de contar recursos y empieza a contar
combinaciones, y el `prune` FIFO
([`store.ts:159-168`](../../../packages/transport/src/store.ts#L159-L168)) desaloja
recursos vivos para hacer sitio a duplicados.

#### 2.4.3. `Vary: *` es un `cache-first` que nunca acierta

Una respuesta con `Vary: *` no casa jamás. La política declarada se convierte en
`network-only` de forma permanente y sin diagnóstico.

#### 2.4.4. `Vary: Accept-Encoding` es el caso común, no el raro

Es lo que responde cualquier servidor con compresión —de hecho las entradas de
`routes-<build>` del volcado lo llevan—. Dos consumidores con `Accept-Encoding` distinto
sobre la misma URL son dos entradas y un fallo de caché.

#### 2.4.5. Un `put` que falla tumba la respuesta

[`store.ts:99-102`](../../../packages/transport/src/store.ts#L99-L102) hace
`if (master.ok) await put(...)` **dentro** del camino de respuesta. `response.ok` es cierto
para todo 2xx, y `cache.put` **lanza** con un `206 Partial Content` (un `<video>` con
`Range` basta). El rechazo sale por `get`, llega al `respondWith` y el navegador lo
convierte en un error de red: **la petición falla por no haberse podido cachear**. Cachear
es best-effort; servir no.

#### 2.4.6. El precache puede sellar bytes de otro build

`cache.add` usa la caché HTTP del navegador. Los ficheros del shell tienen nombre fijo sin
hash —`/fudic-main.js`—, así que un host que los sirva con `max-age` largo hace que el
`install` de un build nuevo precachee **el `fudic-main.js` del build viejo** bajo el nombre
de caché nuevo. Y como la política es `cache-first` con `ttl: null` (BUG-01 §4.2), se sirve
así para siempre. El nombre de caché con build id no protege de esto: protege del build
anterior, no de un fetch que devuelve el anterior.

---

## 3. Interfaz pública

La decisión de diseño es una sola frase: **la clave de un `Store` es la URL, y nada más**.
Ya era lo que el módulo declaraba —el dedup en vuelo indexa por `request.url`
([`store.ts:90`](../../../packages/transport/src/store.ts#L90)), `keys()` devuelve URLs,
y el shell son «URLs exactas, identidad» (BUG-01 §3.2)—; lo que faltaba era que el tipo lo
impusiera en vez de confiar en que cada llamante construya la misma clave.

### 3.1. `@fudic/transport` — `Store` deja de aceptar claves inventadas

```ts
export interface Store {
  /**
   * Aplica la política. La CLAVE es la URL; cuando se pasa un `Request`, se usa
   * VERBATIM para la pata de red, así que CORS, credenciales y `Accept` se comportan.
   */
  get(target: Request | string, policy: CachePolicy, ttl: number | null): Promise<Response>;
  /** URL, no `Request`: la clave de este store es la URL y nada más. */
  put(url: string, response: Response): Promise<void>;
  match(url: string): Promise<Response | undefined>;
  delete(url: string): Promise<boolean>;
  prune(maxEntries: number): Promise<void>;
  keys(): Promise<readonly string[]>;
}
```

Cambio **incompatible** en `put`/`match`/`delete`, y deliberadamente incompatible: es el
compilador el que pasa a impedir esta clase de defecto. `get` se **ensancha**
(`Request | string`), lo que además borra siete `new Request(...)` del router.

La separación de responsabilidades es la clave del diseño:

- **pata de caché** → la URL. Identidad, con query, sin headers.
- **pata de red** → el `Request` original, intacto.

### 3.2. `@fudic/transport` — `loadManifest` no cambia de forma

Misma firma. Cambia que lee con `ignoreVary`, porque su fallo es §2.4.1 y no es un fallo
degradado: es el SW entero.

### 3.3. `@fudic/vite` — el `install` pasa por el `Store`

`SwBootstrapOptions` no cambia. Cambia el código emitido: el `install` deja de usar
`cache.add` y escribe por el `Store`, con `cache: 'reload'` en el fetch (§4.5).

### 3.4. Sin cambios

`RouterStores`, `RouterConfig`, `ResourceRule`, `CacheNames`, `cacheNames`, `isStaleCache`,
`STAMP_HEADER`, el formato de `sw.json`. **Ningún código de diagnóstico nuevo**: no hay nada
que comprobar en build —el `Vary` es un hecho de runtime— y la garantía la da el tipo.

---

## 4. Comportamiento corregido

### 4.1. La clave es la URL, y el tipo lo impone

Internamente, una sola derivación:

```ts
/** La clave de caché: la URL, query incluida, y nada más. */
const keyOf = (target: Request | string): string =>
  typeof target === 'string' ? target : target.url;
```

Se pasa como `string` a `cache.match`/`put`/`delete`, que aceptan `RequestInfo`: una
asignación menos en el camino caliente y, sobre todo, el código dice qué es la clave.

`ignoreSearch` se queda en `false`: `/api/items?page=2` es otro recurso. `ignoreMethod`
también: el `Store` es GET-only, como la propia Cache API, y el router ya filtra el resto.

### 4.2. `ignoreVary: true` en toda lectura y todo borrado

```ts
const QUERY: CacheQueryOptions = { ignoreVary: true };
```

En `get`, en `match`, en `delete` y en `loadManifest`. No es redundante con §4.1 y hace un
trabajo distinto:

- la **clave canónica** garantiza *una URL, una entrada* — es lo que hace ciertos a
  `keys()`, `prune` y `maxEntries`;
- **`ignoreVary`** garantiza que un acierto es un acierto **sea quien sea el que escribió la
  entrada** y sea cual sea el `Vary` que mandó el servidor.

Hacen falta las dos porque las entradas escritas fuera del `Store` existen y seguirán
existiendo.

### 4.3. `Vary` no es un segundo mecanismo de negociación

Este framework no negocia contenido, y no va a negociar a medias. Un `Vary: Accept-Language`
sobre una clase de recurso declarada en `sw.json` **no** se va a respetar: si una respuesta
depende de un header, ese eje va **en la URL**. Es el mismo argumento de BUG-01 §4.2 contra
poner un TTL sobre algo que ya caduca por nombre de caché: un mecanismo, no dos.

Queda como invariante del contrato de `sw.json` (§5) y documentado donde se declaran las
clases de recurso. Añadir «qué valores de `Vary` son seguros» sería exactamente la
negociación a medias que se rechaza.

### 4.4. Cachear es best-effort; servir no

`fromNetwork` deja de poder tumbar una respuesta buena:

- se guarda cuando `response.status === 200`, no con `response.ok` — así un `206` no llega
  nunca a `cache.put`, que es lo que lanzaba;
- el `put` va con su propio `catch`: cuota agotada, respuesta no almacenable o caché
  borrada por debajo **no** cambian lo que recibe el cliente.

Las respuestas opacas (`status === 0`) siguen fuera, y sigue siendo lo correcto: son una
bomba de cuota y no se pueden inspeccionar.

### 4.5. El precache trae los bytes de este build

El `install` escribe por el `Store` —clave canónica y sello `x-fudic-stored`, como todo lo
demás— y su fetch lleva `cache: 'reload'`, que salta la caché HTTP del navegador. Cierra
§2.4.6: un shell de nombre fijo no puede precachearse con los bytes del build anterior.
Ocurre una vez por build; el coste no se discute.

El `catch` del `install` se mantiene: es la última red de seguridad, y BUG-01 §4.4 ya movió
la detección al build (`FUD0391`).

### 4.6. Un solo string para las dos indexaciones

El dedup en vuelo ya indexaba por `request.url`. A partir de ahora es **la misma
expresión** que la clave de caché, así que los dos mecanismos no pueden discrepar: no puede
haber una petición deduplicada contra una entrada que luego no case.

---

## 5. Invariantes

**Los que el bug violaba**

- *«Una caché, un lector»* (BUG-01 §5). Se cumplía la letra —un camino de lectura— y no el
  propósito: el camino de lectura no encontraba lo que el camino de escritura había puesto.
- *La política declarada es la política aplicada.* Un `cache-first` que va a red no es
  `cache-first`, y no había forma de enterarse.
- *SDD-20 §4.6.3 — «el dedup evita descargar cada chunk dos veces».* Vale para dos
  peticiones concurrentes; no valía para dos peticiones de forma distinta.

**Los que la corrección añade**

- **La clave de un `Store` es la URL, garantizado por el tipo.** `put`/`match`/`delete` solo
  aceptan `string`. Un llamante no puede inventarse una clave, así que la clase de defecto
  desaparece del espacio de programas escribibles, no del código escrito.
- **Una URL, una entrada.** Verificable: `keys().length` es el número de URLs distintas
  almacenadas, y por tanto `maxEntries` cuenta recursos.
- **Un acierto es un acierto.** Ninguna cabecera de la petición puede convertir un hit en un
  miss. Corolario: nada de lo que precachea el `install` puede fallar el match.
- **Cachear no puede hacer fallar una respuesta.** Ninguna excepción del camino de
  almacenamiento sale por `get`.
- **Si una respuesta depende de un header, ese eje va en la URL.** Contrato de `sw.json`: una
  clase de recurso sobre un endpoint que negocia es un error de la aplicación, no un caso
  que el framework resuelva.

---

## 6. Criterios de aceptación

Tests en `packages/transport/test/store.test.ts`, `packages/transport/test/router.test.ts`,
`packages/transport/test/manifest.test.ts`, `packages/vite/test/bootstrap.test.ts` y el
arnés Playwright de `examples/basic`. Los marcados **(rojo primero)** deben verse fallar
contra el código actual.

El doble de `Cache` de `test/helpers.ts` **no puede** validar nada de esto: es un `Map` por
URL, es decir, ya se comporta como queremos que se comporte la caché real. Hace falta un
`VaryingCache` que implemente el algoritmo del §2.1 —clave = (URL, headers de la petición
guardada), filtrada por el `Vary` de la respuesta guardada, honrando `ignoreVary`—. Ese
doble es la primera tarea, y es la que da valor a todas las demás.

1. **(rojo primero)** Sobre `VaryingCache`: una entrada escrita por una petición **sin**
   `Origin`, con respuesta `Vary: Origin`, se sirve a un `get` cuya petición **sí** lleva
   `Origin`, y `net` **no** se invoca.
2. **(rojo primero)** El mismo caso con `Vary: *` → también acierta.
3. **(rojo primero)** `delete` borra una entrada escrita con otra forma de petición.
   Comprobado con `keys()` vacío después.
4. Una URL pedida por tres consumidores distintos (headers distintos) produce **una** entrada:
   `keys()` tiene longitud 1. Con `maxEntries: 1` y dos URLs distintas, `prune` deja una.
5. `get` con un `string` y `get` con un `Request` de la misma URL comparten entrada y
   comparten deduplicación en vuelo: dos llamadas concurrentes → **una** llamada a `net`.
6. La pata de red recibe el `Request` **original**: un `get(request, 'network-only', …)`
   con un header propio llega a `net` con ese header intacto.
7. **(rojo primero)** `status: 206` desde red → `get` **resuelve** con la respuesta y no
   guarda nada (`keys()` vacío). Contra el código actual esto rechaza.
8. **(rojo primero)** Un `cache.put` que lanza (cuota) → `get` resuelve con la respuesta de
   red igualmente.
9. **(rojo primero)** `loadManifest` encuentra el manifest cuando la entrada la escribió una
   petición con `Origin` distinto. Es §2.4.1: sin esto el SW deja de interceptar.
10. `invalidate(pathname)` sigue borrando página y dato con la firma nueva (`string`).
11. El bootstrap emitido: el `install` **no** contiene `cache.add`, escribe por el `Store` y
    su fetch lleva `cache: 'reload'`. Comprobado sobre el texto de `emitSwBootstrap`.
12. **Extremo a extremo** (`examples/basic/tests/sw-network.spec.ts`): en la **carga 2**,
    `/fudic-main.js` llega con `fromServiceWorker === true` y **cero** peticiones de red del
    Service Worker a esa URL. La lista «fue a la red» de la carga 2 contiene, como mucho,
    el update check de `/fudic-sw.js`.
13. **Extremo a extremo**: tras las tres cargas, cada caché tiene **exactamente una** entrada
    por URL —volcado de `dumpCaches`— y todas llevan `x-fudic-stored`, el `install`
    incluido.

**Cobertura.** `store.ts` sube a **100 % en las cuatro métricas**: es un módulo de 170
líneas, sin dependencias, y con el `VaryingCache` todas sus ramas son provocables. Hoy está
en 96,87 / 88,23 / 88,23 / 100. `router.ts` no baja de su cifra de ramas.

---

## 7. Fuera de alcance

- **Respetar `Vary` de forma selectiva** (§4.3). Es negociación de contenido a medias, y el
  framework no negocia. Si algún día hace falta, es un SDD con su modelo de variantes, no
  una lista de cabeceras seguras.
- **`ignoreSearch`.** La query es parte de la identidad del recurso y se queda dentro de la
  clave.
- **Pasar a LRU en `prune`.** Sigue siendo FIFO (SDD-20 §4.7); lo que este BUG arregla es que
  el presupuesto cuente recursos y no combinaciones.
- **Cachear respuestas parciales o `Range`.** §4.4 se limita a que **no tumben** la
  respuesta. Soportar medios por rangos es una feature.
- **Tocar `cacheNames`/`isStaleCache` ni el build id.** El versionado por build sigue siendo
  el único eje de caducidad de lo inmutable.
- **El shell, el HTML por ruta y el bundle del SW:** [BUG-01](./BUG-01-shell-sin-politica.md),
  [BUG-02](./BUG-02-html-por-ruta.md), [BUG-03](./BUG-03-chunks-compartidos-sw.md).
