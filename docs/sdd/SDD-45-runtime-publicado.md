# SDD-45 — El runtime se publica, no se empaqueta

> **Estado:** `Listo`
> **Paquetes:** `@fudic/core` · `@fudic/dom` · `@fudic/forms` · `@fudic/di` (publican) ·
> `@fudic/vite` (publica `main` y enlaza) · `@fudic/conventions` (el nombre del directorio) ·
> `@fudic/transport` · `@fudic/ssr` (el worker enlaza en vez de empaquetar) ·
> `@fudic/core` (el índice de instancias) · `@fudic/cli` ·
> `@fudic/example-basic` · `examples/workspace` (la evidencia)
> **Depende de:** 41, 43, 15, 19, 27
> **Rango de diagnósticos:** `FUD0800`–`FUD0819`
> **Naturaleza:** artefactos de build y resolución, y **la última revisión del runtime de
> navegador antes de cerrar el framework**. No toca el parser ni el emit de un `.fud`.
>
> Hoy cada aplicación **compila** el runtime del framework. Dos apps en un mismo origen
> producen dos copias de los mismos módulos, con nombres distintos, y el navegador se las
> descarga y las cachea las dos. Este SDD invierte eso: el framework **publica** su runtime
> una vez por versión, y la app lo **enlaza**.
>
> **Revisión del 2026-09-19.** Este documento se redactó con una afirmación falsa en §1.2
> —que la URL distinta de `fudic-main` «se arregla moviendo la ruta»; hoy es §1.2(b), que
> explica por qué no— y sobre ella descansaba
> el 75 % del ahorro que promete §1.1. `fudic-main` lleva el `base` y el build id **compilados
> dentro**, así que no hay ruta que lo arregle: mientras eso siga en pie el SDD ahorra 2 828
> bytes por aplicación y no 11 233. Corregirlo arrastra el resto de la revisión, porque una
> vez `main` se publica, el mismo mecanismo —`/_fudic/<version>/` servido desde **una caché de
> origen**— alcanza al Service Worker, que §4.7 había dejado fuera por un motivo que resultó
> no aplicarle. Es una sola iteración y no una segunda spec: lo que se añade abajo son las
> partes que faltaban del mismo mecanismo, no un mecanismo nuevo.

---

## 1. Contexto y objetivo

### 1.1. El síntoma, medido

Sobre el build de `examples/basic`, lo que una aplicación se lleva del framework:

| | bytes | ¿lo comparten dos apps? |
|---|---|---|
| `fudic-main-<build>.js` | 8 405 | **no**, y no por la URL (§1.2) |
| `assets/browser-<build>.js` | 1 161 | no |
| `assets/live-<build>.js` | 945 | no |
| `assets/signal-<build>.js` | 399 | no |
| `assets/page-<build>.js` | 323 | no |
| **cierre estático, obligatorio en toda app** | **11 233** | |
| el resto del runtime, solo si se usa (`computed`, `effect`, `bind-form`, `container`…) | ~9 800 | no |
| `fudic-sw.js` — `@fudic/transport` 8 703 · `@fudic/ssr` 4 587 · el arranque 2 048 · `@fudic/di` 1 241 | 16 765 | no |

Con tres aplicaciones bajo un mismo origen eso son **unos 33 kB obligatorios repetidos** más
50 kB de workers, y hasta 63 kB si las tres usan todo. Ni un byte se comparte, y no porque
falte una caché compartida: `CacheStorage` es por origen y los tres workers podrían abrir la
misma. No se comparte porque **no hay dos ficheros iguales que compartir**.

Y un coste que la tabla no enseña porque no depende de cuántas apps haya: esos 11 233 bytes
llevan el build id en el nombre, así que **se vuelven a descargar enteros en cada
despliegue**, aunque la aplicación sea una sola y aunque del framework no haya cambiado nada.

### 1.2. Por qué hoy no hay dos ficheros iguales

Tres razones, y ninguna se arregla con la ruta:

**(a) Cada app compila el runtime.** `@fudic/core`, `@fudic/dom`, `@fudic/forms` y
`@fudic/di` llegan al build de la aplicación **en fuente**, y es el rollup de esa aplicación
el que los poda, los trocea y los minifica. El resultado depende del grafo de esa app, de su
configuración de minificado y de la versión del bundler que tenga instalada. Aunque las dos
apps usaran exactamente `signal.ts`, los bytes emitidos **no tienen por qué coincidir**, y
esperar que coincidan es construir sobre una coincidencia.

**(b) `fudic-main` lleva el `base` y el build id DENTRO.** Esta es la que se redactó mal. El
final del `main` de `examples/basic` es literalmente
`createUrlResolver('/', 'b281ee14')`, y hay tres decisiones más tomadas en tiempo de build
dentro de ese mismo módulo: si la app tiene DI (`import { buildTree } from '@fudic/di/page'`,
escrito o no), qué canal de warm usa (worker o `modulepreload`), y si es dev o build. Dos
aplicaciones **no pueden** producir el mismo `main`, porque `main` no describe al framework:
describe a la aplicación. Mover la ruta no cambia un byte de eso, y es el fichero grande —
8 405 de los 11 233.

**(c) El worker se importa a sí mismo entero.** `@fudic/transport` y `@fudic/ssr` están
dentro de `fudic-sw.js` por [BUG-03](./bugs/BUG-03-chunks-compartidos-sw.md), y ahí no hay
URL que compartir porque no hay fichero: son bytes inlineados.

Mientras (a) siga en pie el nombre del fichero da igual; y aunque se arregle (a), mientras
siga (b) el fichero que más pesa se queda fuera del trato.

### 1.3. Lo que ya está a favor

Los trozos que el build emite hoy **ya son uno por módulo fuente del runtime**:

```
signal   computed   effect   element   subscribe   tracking     ← packages/core/src
browser  emit                                                    ← packages/dom/src
bind-form  bind-text  min-length  messages                       ← packages/forms/src
container  token                                                 ← packages/di/src
```

La frontera por la que hay que partir el runtime no hay que inventarla: es la estructura de
ficheros que el framework ya tiene. Eso es lo que hace que este SDD sea un cambio de **quién
compila** y no un rediseño del runtime.

### 1.4. El objetivo

Que un byte del framework se descargue **una vez por origen y por versión**, lo pidan una
aplicación o diez, lo pida la página o el Service Worker, y **sobreviva a un despliegue de la
aplicación**, sin que ninguna deje de llevarse solo lo que usa y sin que dos versiones del
framework se estorben.

Tres consecuencias que conviene leer por separado, porque son tres cosas distintas y la
segunda es la que vale para todo el mundo:

1. **N apps, un byte.** Es el caso que motivó el documento.
2. **Un despliegue no invalida el framework.** Una app sola, desplegada diez veces, descarga
   el runtime **una** vez. Hoy son diez.
3. **El worker bebe de la misma caché que la página.** Lo que la página trajo a
   `/_fudic/<version>/` no lo vuelve a traer el worker, ni el de al lado.

### 1.5. Lo que este SDD NO es

**No es un CDN.** Los ficheros se sirven del mismo origen que las aplicaciones. Nada sale
fuera, nada depende de un tercero, y el build sigue produciendo todo lo que hay que
desplegar.

**No es direccionamiento por contenido.** Se consideró nombrar cada unidad por el hash de su
contenido, para que dos versiones compartieran los módulos que no cambian entre ellas —una
actualización costaría el diff y no el runtime entero—. Se descarta en v1 (§7): exige
nombres ilegibles en el navegador y un manifiesto que los traduzca, y lo que resuelve no es
el problema que se tiene, que es **la misma versión repetida entre apps**.

---

## 2. Dependencias

**SDD-41 — `fudic.json`.** El `id` de aplicación y la noción de proyecto. Este SDD no le
añade ningún campo: la versión del framework no se declara, **se lee del `package.json`**,
que es quien la posee.

**SDD-43 — Librerías.** La resolución de specifiers de paquete y, sobre todo, §4.7: el
rango de `peerDependencies` que una librería declara sobre el framework. Es lo que decide
hasta dónde llega la libertad de versiones (§4.6), y este SDD lo endurece.

**SDD-15 — Emit.** `EmitOptions`, y el hecho de que el compilador no toca el filesystem.
Las URLs del runtime llegan resueltas por el host, como todo lo demás.

**SDD-19 — Plugin Vite.** `configResolved`, `buildStart`, `generateBundle`, y el patrón de
artefactos emitidos del plugin.

**SDD-27 — Artefactos y manifiesto.** El esquema de nombres de salida y el manifiesto de
rutas: lo que este SDD añade al `dist` tiene que caber ahí sin inventar un segundo esquema.

**SDD-17 — Hidratación.** El orden bus → cascada → host → replay, y el hecho de que las
instancias se buscan por recorrido del documento. §4.11 cambia de dónde sale esa lista y no
toca el orden.

**SDD-20 — Service Worker.** `createLinker`, `canLink`, el `Store` y `cacheNames`: las cuatro
piezas con las que §4.7 enlaza lo que hoy empaqueta. **BUG-03** es la razón por la que el
worker se importa entero, y §4.7 explica a qué se aplica y a qué no. **BUG-33** es el esquema
de nombres de caché por aplicación, del que §4.8 es la excepción deliberada.

---

## 3. Interfaz pública

### 3.1. La forma publicada

```
<base-de-runtime>/<version>/<unidad>.js
```

```
/_fudic/0.0.1/signal.js
/_fudic/0.0.1/computed.js
/_fudic/0.0.1/browser.js
/_fudic/0.0.1/main.js      ← el arranque de hidratación (§4.9)
/_fudic/0.0.1/ssr.js       ← lo que el worker enlaza (§4.7)
/_fudic/0.0.1/di.js
```

| Pieza | Qué es |
|---|---|
| `_fudic` | El directorio del runtime, **fuera de todo `base`**. Empieza por `_` por lo mismo que el specifier de SDD-42: ninguna ruta de aplicación puede colisionar con él |
| `<version>` | La versión del paquete del framework, tal cual la declara su `package.json`. No se abrevia, no se trunca |
| `<unidad>` | El nombre del módulo fuente: `signal.ts` → `signal.js` (§4.3). `main` es la única unidad que no sale de un módulo de `core`/`dom`/`forms`/`di`: la escribe `@fudic/vite` y la publica igual que las demás (§4.9) |

### 3.2. `@fudic/conventions`

Una constante, y cabe exactamente por la regla de ese paquete —*un nombre que dos paquetes
deben acordar y ninguno posee*—: lo escribe quien publica el runtime y lo lee quien lo
enlaza.

```ts
/** Where the published runtime lives on the origin, outside every app's `base`. */
export const RUNTIME_DIR = '_fudic';

/**
 * The origin-wide cache that holds `/_fudic/<version>/*`, read by the page and by EVERY
 * Service Worker of the origin (§4.8). Not namespaced by app — that is the point — and so
 * deliberately outside the `<kind>-<app>-<build>` scheme of BUG-33.
 */
export const runtimeCacheName = (version: string): string => `fudic-runtime-${version}`;

/** The three facts a published `main` cannot carry inside it, as the page writes them (§4.9). */
export const RUNTIME_ATTRS = {
  base: 'data-fud-base',
  build: 'data-fud-build',
  sw: 'data-fud-sw',
} as const;
```

### 3.3. Los paquetes de runtime publican

`@fudic/core`, `@fudic/dom`, `@fudic/forms` y `@fudic/di` ganan una salida más en su
`build`: además del `dist` que consumen los bundlers, un directorio de **unidades de
navegador** ya minificadas, una por módulo público.

```
packages/core/dist/          ← lo de hoy: lo que consume un bundler
packages/core/runtime/       ← nuevo: signal.js, computed.js, effect.js, …
```

Son ES modules, se importan entre ellos **por la misma ruta publicada** (`./signal.js`), y
no los toca ningún build de aplicación.

`@fudic/vite` publica dos unidades más por el mismo camino, y por el mismo motivo: son
framework, no aplicación.

```
packages/vite/runtime/main.js    ← el arranque de hidratación (§4.9)
packages/vite/runtime/ssr.js     ← lo que el worker enlaza (§4.7); reexporta @fudic/ssr
```

### 3.4. `@fudic/vite`

```ts
export interface RuntimeLink {
  /** The bare specifier the author wrote: `@fudic/core`. */
  readonly specifier: string;
  /** The unit within it: `signal`. */
  readonly unit: string;
  /** The URL it resolves to: `/_fudic/0.0.1/signal.js`. */
  readonly url: string;
}

/**
 * Every runtime unit this build links, in no particular order. The plugin copies exactly
 * these into the output and rewrites the imports that reach them.
 */
export function runtimeLinks(/* … */): readonly RuntimeLink[];
```

**`FudicOptions` no cambia.** La versión sale del `package.json` resuelto y el directorio de
`@fudic/conventions`; ninguna de las dos es una opción, porque ninguna es una decisión del
que escribe la aplicación.

---

## 4. Comportamiento

### 4.1. El autor escribe `@fudic/core`, y eso no cambia nunca

```ts
import { signal } from '@fudic/core';
```

Eso es lo que se escribe hoy, lo que se escribirá después de este SDD, y lo que se escribe
en un `.fud`, en un `@client` y en un `.ts` del proyecto. **La URL no se escribe jamás a
mano**: es una salida del build, igual que el nombre hasheado de un chunk.

Quien la resuelve es el plugin, en el mismo sitio donde hoy decide que ese import se empaqueta.

### 4.2. La app enlaza, no empaqueta

El build de la aplicación deja de meter los módulos del framework en su bundle. En su lugar:

1. resuelve qué unidades del runtime alcanza su grafo,
2. reescribe esos imports a la URL publicada,
3. copia al `dist` las unidades que enlaza, bajo `_fudic/<version>/`.

Copia **las que enlaza**, no el runtime entero: un `dist` sigue siendo un árbol completo y
desplegable solo, que es la propiedad que hace que dos aplicaciones puedan desplegarse por
separado. Cuando la segunda app se despliega sobre el mismo origen, las unidades que ya
estaban se sobrescriben con **los mismos bytes**, porque las produjo el mismo build del
framework y no el suyo.

### 4.3. La granularidad es el módulo, y se dice lo que cuesta

Una unidad es un módulo fuente del runtime. Una app que usa `computed` se lleva
`computed.js` entero, aunque solo llame a una de sus exportaciones.

**Eso no es tree-shaking, y hay que decirlo sin adornos.** Lo que se pierde está medido:
`signal.js` son 399 bytes y `computed.js` 522. Partir por debajo del módulo —una unidad por
exportación, o por grupo mínimo de exportaciones que se necesitan entre sí— multiplicaría el
número de ficheros para ahorrar cientos de bytes en el peor caso, y esos ficheros se piden
una vez en la vida del origen porque la política es cache-first sobre una URL inmutable.

La condición para reabrirlo está en §7, y es un número, no una opinión.

### 4.4. Dos apps, la misma versión: una descarga

Es el caso que motiva el SDD.

```
app-1  usa  signal
app-2  usa  signal y computed

/_fudic/0.0.1/signal.js      ← una vez. La piden las dos
/_fudic/0.0.1/computed.js    ← una vez. La pide solo app-2
```

`app-1` **no** se lleva `computed`, y `signal` **no** se descarga dos veces. Ni la app grande
arrastra a la pequeña, ni la pequeña impide compartir a la grande.

### 4.5. Dos versiones conviven, y la ruta es el registro

```
/_fudic/0.0.1/signal.js     app-1 y app-2
/_fudic/2.0.0/signal.js     app-3
```

No hace falta un registro de versiones ni un contador de referencias: **mirar el origen es
saber qué versiones hay desplegadas y quién las usa**, porque el manifiesto de cada app
nombra las URLs que enlaza. Es la propiedad que hace esto legible en un navegador: se abre
la pestaña de red y se lee la versión en la URL.

**Un directorio de versión que ningún manifiesto del origen nombra es basura**, y eso es
computable sin adivinar. Borrarlo es `fudic prune` y no está en este SDD (§7).

### 4.6. La frontera de versión es el grafo, no la aplicación

Aquí está el límite real de todo lo anterior, y es lo que hay que entender antes de prometer
nada.

Una **librería** fudic publica `.fud` fuente (SDD-43 §4.1), y ese fuente lo compila el build
del **consumidor**. Así que sus componentes se resolverán contra la versión del framework de
*esa* aplicación. Si la librería usa algo que esa versión no tiene, lo que sale es un export
que no existe, en el navegador, dentro de un fichero que el usuario no escribió.

```
libs/ui  necesita  2.0        app-1  en 1.0        app-2  en 2.0
                              ────────────────────────────────────
                              app-1 + libs/ui  →  ROTO
```

De donde sale la regla: **una aplicación puede estar en la versión que quiera, siempre que
ninguna librería de su grafo exija otra.** En cuanto comparte una librería, la librería
manda.

**`FUD0800`, error.** El rango de `peerDependencies` que la librería declara sobre el
framework no incluye la versión que resuelve el consumidor. SDD-43 §4.7 lo dejó en
**warning** —*«un rango conservador de más no debe impedir un build que funciona»*—, y eso
era correcto mientras todas las apps de un repo compartían versión por fuerza. Desde el
momento en que este SDD hace de las versiones mezcladas una promesa del producto, un aviso
ya no basta: lo que describe **rompe**, y rompe tarde. `FUD0762` queda anotado como
superado por este código.

### 4.7. El worker deja de empaquetar lo que ya sabe enlazar

Esta sección decía «el Service Worker se queda como está», y la razón que daba era
[BUG-03](./bugs/BUG-03-chunks-compartidos-sw.md). BUG-03 sigue siendo cierto y no se reabre.
Lo que se corrige es a qué se aplica.

**Un worker carga código de dos maneras, y solo una es la que BUG-03 prohíbe.**

| | quién lo trae | ¿pasa por el `fetch` del worker? | ¿pasa por `CacheStorage`? |
|---|---|---|---|
| `import` en la cabecera del fichero | el cargador de scripts del navegador | no | no, con `updateViaCache: 'none'` |
| `createLinker` + `new Function` | **el propio worker**, por su `Store` | sí | **sí** |

BUG-03 describe la primera fila: un módulo compartido entre la página y el worker se
descargaba dos veces porque lo pedían dos cargadores distintos, y meterlo todo dentro del
fichero del worker fue —y sigue siendo— la solución. La segunda fila es el camino por el que
el worker ya trae **los chunks de ruta** en cada navegación: pide el texto por
`stores.routes.get(url, 'cache-first')` y lo evalúa. Ese camino es suyo, va a
`CacheStorage`, y `CacheStorage` es por origen.

`@fudic/ssr` está hoy inlineado y entregado a los chunks como `builtins` para que no se
descargue una vez por chunk. Pasa a traerse **por el segundo camino**: se pide
`/_fudic/<version>/ssr.js` al `Store` de la caché compartida (§4.8), se enlaza con el linker
que el worker ya tiene, y el módulo resultante entra en `builtins` exactamente igual que
ahora. Lo mismo `@fudic/di`. Son 5 828 de los 16 765 bytes.

**`@fudic/transport` no se mueve, y no es negociable:** es quien abre la caché, quien tiene
el `Store` y quien tiene el linker. Pedirle que se traiga a sí mismo por el camino que él
mismo implementa es la definición de un arranque imposible.

Nada de esto añade un punto de fallo nuevo. El valor de seguridad ya existe: si el realm no
puede evaluar, `canLink()` devuelve falso, el worker se declara inútil y las navegaciones caen
al servidor — el mismo camino degradado de hoy. Y el enlace ocurre dentro de `build()`, que ya
espera al manifiesto: es un `await` más en el sitio donde ya se espera, no un punto de
serialización nuevo.

**Lo que sigue dentro del worker:** `@fudic/transport` (8 703 B) y su propio arranque
(2 048 B). Un worker pasa de 16 765 a unos 10 750 bytes, y esos 10 750 sí son de la
aplicación.

### 4.8. Una caché de origen, una por versión

Todo `/_fudic/<version>/*` vive en **una** caché, `fudic-runtime-<version>`, que abren la
página —a través del `fetch` de su worker— y todos los workers del origen.

No lleva `app` en el nombre **a propósito**, y es la única caché del sistema de la que eso es
cierto: BUG-33 namespacea por aplicación porque dos apps se estaban borrando las cachés, y esta
es justo la que quieren compartir. La versión del framework en el nombre es lo que hace que
`app-1` en 1.0 y `app-2` en 2.0 no se estorben, igual que en la ruta (§4.5).

**El purgado no la toca, y no hay que escribir nada para eso.** `isStaleCache` solo reconoce
nombres que empiezan por `shell-`, `routes-`, `pages-` o `data-`; `fudic-runtime-0.0.1` no
casa con ninguno y sobrevive a todo `activate`. Es una propiedad del código de hoy, así que lo
que hay que escribir es **el test que la fija**, no la lógica.

Que una caché no se purgue nunca es correcto aquí y no en las otras: su contenido es inmutable
por construcción —la versión está en la clave— y lo que sobra son directorios de versión que
ya nadie nombra, que es exactamente lo que `fudic prune` computa desde el origen (§7).

### 4.9. `main` se publica: la aplicación deja de compilar su propio arranque

`fudic-main` es el fichero grande, y el único de los cinco que no puede compartirse tal cual
está escrito (§1.2 b). Lleva dentro cuatro decisiones de build:

| decisión | hoy | pasa a |
|---|---|---|
| `base` y build id | `createUrlResolver('/', 'b281ee14')` compilado | `data-fud-base` / `data-fud-build` del propio `<script>` |
| canal de warm | la rama se elige al emitir, según haya worker | `data-fud-sw` |
| ¿la app tiene DI? | el `import { buildTree }` se escribe o no | **el DOM**: el IIFE que ya sale si no hay `fud-ioc`, con `await import()` |
| dev o build | dos modos de `resolveChunk` | dev no usa la unidad publicada (§4.13) |

```html
<script type="module" src="/_fudic/0.0.1/main.js"
        data-fud-base="/" data-fud-build="b281ee14" data-fud-sw="1"></script>
```

Son unos 60 bytes de HTML por página que hidrata, y a cambio `main` deja de pertenecer a la
aplicación: mismos bytes para todas las apps del origen, y —lo que vale para quien solo tiene
una— **mismos bytes entre dos despliegues**.

**`buildTree` es el único import que se vuelve dinámico**, y solo porque el sitio donde se
usa ya es asíncrono y ya comprueba el hecho: el IIFE de DI sale antes si la página no publica
`fud-ioc`. Ningún otro import de `main` se toca. Un `import()` en la ruta de arranque es un
viaje de red serializado detrás de la evaluación de `main`, y lo que ahorraría —`live.js`,
945 bytes que están en caché desde la segunda navegación— no lo paga.

El autor sigue sin escribir una URL (§4.1): quien escribe los tres atributos es el mismo emit
que hoy escribe el `src`.

### 4.10. Sin Service Worker no hay `boot`

Una aplicación sin `sw.json` emite hoy un `fudic-boot-<build>.js` cuyo contenido entero es
`export {};`, y **todas sus páginas escriben el `<script>` que lo pide**. Es una petición HTTP
por página para un módulo vacío.

Pasa a no emitirse: ni el fichero ni la etiqueta. El `boot` es la mitad que registra el
worker, así que cuando no hay worker no hay mitad. La condición es la que ya se evalúa para
decidir su contenido, movida un escalón antes — del cuerpo del módulo a la etiqueta que lo
carga.

### 4.11. El índice de instancias: una pasada por gesto

`allInstances` recorre el documento entero cruzando shadow roots, y el runtime lo vuelve a
llamar **dentro del gesto**: una vez por tag en la cascada, una por receptor del bus, y una
entera —`allInstances(root).find(...)`— para localizar **un** elemento por su id. Un clic
sobre un árbol de N instancias son N+ recorridos completos del documento.

Pasa a haber **uno**: al empezar un turno de hidratación se construye el índice —`id → Element`
y `tag → Element[]`— y los buscadores lo consultan.

**Por turno y no global, y esa es la decisión.** Un índice global exigiría mantenerlo vivo
frente a todo lo que inserta nodos después —el fabricador de `live`, el render del worker, el
propio usuario—, y un índice desactualizado es un fallo silencioso donde hoy hay una pasada
lenta. El índice del turno nace con el gesto y muere con él: no puede envejecer.

No cambia ningún invariante de SDD-17: el orden bus → cascada → host → replay es el mismo, y
lo único que cambia es de dónde sale la lista de instancias.

### 4.12. El polyfill se queda inline

Se consideró publicarlo como una unidad más —`/_fudic/<version>/adopt.js`, clásico y
bloqueante en el `<head>`— para quitar 1 292 caracteres de **cada** página. Se descarta, y el
motivo es el que justifica que esté inline desde SDD-18 §5: **el FOUC**.

Un `<script src>` sin `async` ni `defer` bloquea el parser igual, sí, pero pasa a bloquearlo
**sobre un viaje de red**, y precisamente en la primera visita — la que no tiene ni caché HTTP
ni worker instalado, y la que mide el LCP. Y añade un modo de fallo que el inline no tiene: si
esa petición falla, no hay adopción de hojas y sí hay FOUC, de forma permanente y solo en los
navegadores sin soporte nativo, que son los únicos que lo necesitaban.

Unos 600 bytes brotli por página no compran eso. **El polyfill se emite inline, tal cual está
hoy.**

### 4.13. En desarrollo no cambia nada

`pnpm dev` sigue sirviendo el runtime desde el grafo de módulos de Vite, sin `_fudic/` y sin
versiones en la URL. Publicar unidades es una propiedad del **build**, y un dev server que
las sirviera perdería el recargado en caliente del runtime a cambio de nada.

Los tres atributos de §4.9 **sí** se escriben en dev, con los valores que dev tiene. Que el
runtime lea siempre del mismo sitio es lo que evita que dev y build sean dos programas.

---

## 5. Invariantes

- **El autor escribe `@fudic/core`.** Ninguna URL del runtime se escribe a mano, en ningún
  fichero, nunca. Resolverla es del compilador (§4.1).
- **El framework compila su runtime; la aplicación no.** Es la inversión entera de este SDD,
  y es lo que hace que dos apps tengan bytes idénticos por construcción y no por suerte.
- **Un `dist` sigue siendo desplegable solo.** Cada build copia las unidades que enlaza. Dos
  aplicaciones se despliegan por separado y en cualquier orden.
- **Una app enlaza solo lo que alcanza su grafo.** Compartir no puede costarle a la
  aplicación pequeña llevarse lo que usa la grande.
- **La versión está en la ruta y se lee.** Ni opaca, ni hasheada, ni traducida por un
  manifiesto: se abre la pestaña de red y se lee.
- **`FudicOptions` no gana ninguna opción.** La versión la posee el `package.json` y el
  directorio `@fudic/conventions`.
- **El compilador sigue sin filesystem.** Las URLs llegan resueltas por el host.
- **La aplicación no compila su propio arranque.** `main` es framework y se publica como tal;
  lo que es de la aplicación viaja en atributos del HTML, no compilado dentro (§4.9).
- **`@fudic/transport` vive dentro del worker.** Es quien abre la caché y quien enlaza; todo
  lo demás del worker puede enlazarse, y lo que se enlaza no pasa por un `import` (§4.7).
- **La caché del runtime no lleva el `app` en el nombre**, y es la única. Es lo contrario de
  BUG-33 y a propósito (§4.8).
- **El polyfill se emite inline.** Sacarlo a una URL cambia bytes por riesgo de FOUC en la
  primera visita, y no se hace (§4.12).
- **Un índice de instancias no sobrevive a su gesto** (§4.11). Un índice que envejece es un
  fallo silencioso donde hoy hay una pasada lenta.
- **Cobertura.** El código nuevo nace al 100 % en las cuatro métricas; ningún paquete tocado
  baja del número que tiene al empezar.

### Catálogo de diagnósticos (`FUD0800`–`FUD0819`)

| Código | Severidad | Qué dice |
|---|---|---|
| `FUD0800` | `error` | Una librería del grafo declara un `peerDependencies` sobre el framework que no incluye la versión que resuelve este build. Con la librería, su rango y la versión resuelta. **Sustituye a `FUD0762`** de SDD-43, que era warning (§4.6). |
| `FUD0801` | `error` | Un import alcanza una unidad de runtime que la versión publicada no tiene. Es el síntoma de un `dist` a medio copiar o de un paquete de runtime mal publicado. |
| `FUD0802` | `warning` | El origen ya tiene un `_fudic/<version>/<unidad>.js` con bytes distintos de los que este build copiaría. No debería poder pasar (§4.2) y por eso se avisa: significa que alguien publicó dos veces la misma versión del framework con contenido distinto. |
| `0803`–`0819` | | Reservados. |

---

## 6. Criterios de aceptación

Tests en `packages/core/test/` y hermanos (1–2), `packages/vite/test/` (3–13),
`packages/transport/test/` y `packages/core/test/` (14–17) y la evidencia en `examples/`
(18–19).

**Lo que publica el framework**

1. El `build` de `@fudic/core` produce `runtime/signal.js`, `runtime/computed.js` y una por
   cada módulo público, minificadas, que se importan entre ellas por ruta relativa. Lo mismo
   `@fudic/dom`, `@fudic/forms` y `@fudic/di`.
2. **Los bytes no dependen de quién construya.** Construir el paquete dos veces produce
   ficheros idénticos byte a byte. Es la propiedad sobre la que se apoya todo lo demás, y es
   un test y no una esperanza.

**Lo que enlaza la app**

3. **(rojo primero)** Un build de una app que usa `signal` emite
   `_fudic/<version>/signal.js` y **ningún** `assets/signal-<build>.js`. Hoy emite lo
   contrario.
4. Los imports del bundle apuntan a `/_fudic/<version>/signal.js`, con la versión del
   `package.json` resuelto, y **no** llevan el `base` de la aplicación.
5. **La poda se conserva.** Una app que no usa signals derivadas **no** emite
   `computed.js`. Se mide sobre el `dist`, contando ficheros.
6. **El caso de §4.4.** Dos builds, uno con `signal` y otro con `signal` y `computed`,
   producen el **mismo** `_fudic/<version>/signal.js` byte a byte, y solo el segundo produce
   `computed.js`.
7. Dos versiones distintas del framework producen dos directorios, y ninguno pisa al otro.
8. `FUD0800`: una librería cuyo rango no incluye la versión resuelta **rompe el build**, con
   los tres datos en el mensaje. Y el caso en verde: dentro del rango, cero diagnósticos.
9. **`pnpm dev` no cambia** (§4.13): no hay `_fudic/` en el grafo de dev y el runtime se
   sirve como hoy.

**`main` deja de ser de la aplicación (§4.9, §4.10)**

10. **(rojo primero)** Dos builds de la **misma** app con `base` distinto (`/` y `/admin/`)
    producen el **mismo** `_fudic/<version>/main.js` byte a byte, y ninguno emite
    `fudic-main-<build>.js`. Hoy produce dos ficheros distintos, y ese es el fallo que hay
    que ver antes.
11. Una página que hidrata escribe los tres atributos, y el runtime resuelve con ellos: bajo
    `base` `/admin/`, la URL de un chunk de hidratación es `/admin/assets/h/<tag>-<build>.js`.
    Se comprueba con el atributo, no con el bundle.
12. Una página **sin** `fud-ioc` no pide `di/page`: se cuenta sobre las peticiones, no sobre
    el grafo. Y una **con** `fud-ioc` lo pide y el árbol de contenedores se levanta igual que
    hoy — los tests de SDD-38 siguen verdes sin tocarlos.
13. Un proyecto **sin** `sw.json` no emite `fudic-boot-*.js` y ninguna de sus páginas escribe
    su `<script>`. Con `sw.json`, las dos cosas siguen exactamente como hoy.

**El worker y la caché compartida (§4.7, §4.8)**

14. `fudic-sw.js` no contiene `@fudic/ssr` ni `@fudic/di` —se comprueba por ausencia de sus
    símbolos en el fichero emitido— y baja de 16 765 a menos de 11 000 bytes.
15. El worker enlaza `ssr` desde la caché compartida y **renderiza igual**: la batería de
    navegación de SDD-20 pasa sin tocarla, offline incluido, que es donde una dependencia
    traída por red se nota.
16. `isStaleCache('fudic-runtime-0.0.1', app, build)` es `false` para **cualquier** `app` y
    `build`, incluidos los que la harían stale si llevara el esquema de BUG-33. Es el test
    que fija la propiedad de la que depende que dos apps no se borren el runtime.

**El runtime de hidratación (§4.11)**

17. Un gesto que hidrata un árbol de N instancias con receptores de bus hace **un** recorrido
    del documento. Se mide instrumentando `querySelectorAll` sobre el documento doble que ya
    usan los tests de SDD-17, y el número esperado es 1 — hoy crece con N.

**La evidencia**

18. El workspace de [SDD-43](./SDD-43-librerias.md) criterio 12 —dos apps y dos librerías—
    se despliega en un origen y **el runtime aparece una sola vez**. Verificado en Chrome
    real: la pestaña de red de la segunda app no descarga ni un byte de framework que la
    primera ya trajo —`main` incluido, que es lo que este criterio no cubría—, y
    `Application → Cache Storage` enseña `fudic-runtime-<version>` con las dos apps
    apuntando a ella. Y **el despliegue**: rebuild de `app-1` con un build id nuevo, recarga,
    y de `/_fudic/` no se vuelve a pedir nada.
19. **Cobertura.** El código nuevo al 100 % en las cuatro métricas.

---

## 7. Fuera de alcance

- **Sacar `@fudic/transport` del worker.** §4.7. Son 8 703 bytes por aplicación que siguen sin
  compartirse, y no por BUG-03 sino porque transport **es** el enlazador. **Condición de
  reapertura:** que alguien mida qué pasa con `updateViaCache: 'imports'` sobre URLs
  inmutables — si el grafo de scripts del worker pasa entonces por la caché HTTP, la razón de
  BUG-03 deja de aplicar y el `import` estático deja de duplicar.
- **Publicar el polyfill de adopción.** §4.12. Descartado con su motivo, no aplazado: cambia
  ~600 bytes brotli por página por un viaje de red bloqueante en la primera visita y por un
  FOUC permanente si esa petición falla.
- **Compactar `fudic-routes.json` internando las dependencias en un array.** Medido sobre
  `examples/basic`: 4 937 → 2 998 bytes en crudo, y **787 → 781 brotli**. Seis bytes por la
  red a cambio de un manifiesto ilegible y una indirección en el worker y en el linker: la
  repetición de strings es exactamente lo que brotli ya elimina. **Condición de reapertura:**
  que el coste del manifiesto pase a ser el `JSON.parse` y no los bytes, que no ocurre por
  debajo de varios cientos de rutas.
- **Más imports dinámicos en `main`.** §4.9. Solo `buildTree`, y solo porque su sitio ya era
  asíncrono y ya comprobaba el hecho.
- **El direccionamiento por contenido.** §1.5. **Condición de reapertura:** cuando exista una
  segunda versión publicada del framework, medir qué fracción de sus unidades es idéntica a
  la anterior. Si es alta, nombrar por hash convierte una actualización en el coste del diff;
  si es baja, no compra nada y cuesta legibilidad.
- **Partir por debajo del módulo.** §4.3. **Condición de reapertura:** que alguna unidad
  publicada pase de 4 kB, o que una app real se lleve más de 2 kB que no usa. Hoy la mayor
  es `signal.js` con 399 bytes.
- **`fudic prune`.** Borrar del origen los directorios de versión que ningún manifiesto
  nombra es un comando, y uno que borra ficheros de un despliegue no se escribe de pasada.
- **Servir el runtime desde un CDN.** §1.5. Todo sale del mismo origen.
- **Declarar la versión del framework en `fudic.json`.** No se declara: la posee el
  `package.json`, y un segundo sitio donde vive el mismo dato es el defecto que SDD-41 §7 y
  BUG-20 ya rechazaron dos veces.
- **Que una aplicación elija la versión de una librería que consume.** Es npm. Lo que este
  SDD añade es el diagnóstico que lo comprueba (§4.6).
