# SDD-45 — El runtime se publica, no se empaqueta

> **Estado:** `Listo`
> **Paquetes:** `@fudic/core` · `@fudic/dom` · `@fudic/forms` · `@fudic/di` (publican) ·
> `@fudic/vite` (enlaza) · `@fudic/conventions` (el nombre del directorio) ·
> `@fudic/cli` · `@fudic/example-basic` (la evidencia)
> **Depende de:** 41, 43, 15, 19, 27
> **Rango de diagnósticos:** `FUD0800`–`FUD0819`
> **Naturaleza:** artefactos de build y resolución. No toca el parser, ni el emit de un
> `.fud`, ni el runtime de hidratación. **No toca el Service Worker** (§7).
>
> Hoy cada aplicación **compila** el runtime del framework. Dos apps en un mismo origen
> producen dos copias de los mismos módulos, con nombres distintos, y el navegador se las
> descarga y las cachea las dos. Este SDD invierte eso: el framework **publica** su runtime
> una vez por versión, y la app lo **enlaza**.

---

## 1. Contexto y objetivo

### 1.1. El síntoma, medido

Sobre el build de `examples/basic`, lo que una aplicación se lleva del framework:

| | bytes |
|---|---|
| `fudic-main-<build>.js` | 8 405 |
| `assets/browser-<build>.js` | 1 161 |
| `assets/live-<build>.js` | 945 |
| `assets/signal-<build>.js` | 399 |
| `assets/page-<build>.js` | 323 |
| **cierre estático, obligatorio en toda app** | **11 233** |
| el resto del runtime, solo si se usa (`computed`, `effect`, `bind-form`, `container`…) | ~9 800 |

Con tres aplicaciones bajo un mismo origen eso son **unos 33 kB obligatorios repetidos**, y
hasta 63 kB si las tres usan todo. Ni un byte se comparte, y no porque falte una caché
compartida: `CacheStorage` es por origen y los tres workers podrían abrir la misma. No se
comparte porque **no hay dos ficheros iguales que compartir**.

### 1.2. Por qué hoy no hay dos ficheros iguales

Dos razones, y la segunda es la de fondo:

**(a) La URL lleva el `base` y el build id.** `/fudic-main-a1b2c3d4.js` y
`/admin/fudic-main-9f8e7d6c.js` son dos URLs para el mismo arranque. Esto solo, se arregla
moviendo la ruta.

**(b) Cada app compila el runtime.** `@fudic/core`, `@fudic/dom`, `@fudic/forms` y
`@fudic/di` llegan al build de la aplicación **en fuente**, y es el rollup de esa aplicación
el que los poda, los trocea y los minifica. El resultado depende del grafo de esa app, de su
configuración de minificado y de la versión del bundler que tenga instalada. Aunque las dos
apps usaran exactamente `signal.ts`, los bytes emitidos **no tienen por qué coincidir**, y
esperar que coincidan es construir sobre una coincidencia.

Mientras (b) siga en pie, el nombre del fichero da igual: no hay nada que compartir.

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

Que un byte del framework se descargue **una vez por origen**, lo pidan una aplicación o
diez, sin que ninguna deje de llevarse solo lo que usa, y sin que dos versiones del
framework se estorben.

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
```

| Pieza | Qué es |
|---|---|
| `_fudic` | El directorio del runtime, **fuera de todo `base`**. Empieza por `_` por lo mismo que el specifier de SDD-42: ninguna ruta de aplicación puede colisionar con él |
| `<version>` | La versión del paquete del framework, tal cual la declara su `package.json`. No se abrevia, no se trunca |
| `<unidad>` | El nombre del módulo fuente: `signal.ts` → `signal.js` (§4.3) |

### 3.2. `@fudic/conventions`

Una constante, y cabe exactamente por la regla de ese paquete —*un nombre que dos paquetes
deben acordar y ninguno posee*—: lo escribe quien publica el runtime y lo lee quien lo
enlaza.

```ts
/** Where the published runtime lives on the origin, outside every app's `base`. */
export const RUNTIME_DIR = '_fudic';
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

### 4.7. El Service Worker se queda como está

`fudic-sw.js` son 16 kB por aplicación, con `@fudic/transport` y `@fudic/ssr` **dentro**, y
este SDD **no los toca**.

No es un olvido ni una fase pendiente: es la decisión de [BUG-03](./bugs/BUG-03-chunks-compartidos-sw.md),
y su motivo sigue vigente. El grafo de scripts de un worker no pasa por el `fetch` de ese
worker ni, con `updateViaCache: 'none'`, por la caché HTTP; un chunk compartido entre el
worker y la página se descargaba dos veces, una por cada cargador. Meterlo todo dentro fue
la solución, y sigue siéndolo.

**La consecuencia, dicha entera:** con N aplicaciones en un origen hay N workers y ninguno
comparte un byte con los otros. Son 16 kB por aplicación que este SDD no ahorra. Lo que sí
hace es dejar de duplicar los otros 21.

Que el worker se parta exige reabrir BUG-03, y eso es otra spec y otra medición.

### 4.8. En desarrollo no cambia nada

`pnpm dev` sigue sirviendo el runtime desde el grafo de módulos de Vite, sin `_fudic/` y sin
versiones en la URL. Publicar unidades es una propiedad del **build**, y un dev server que
las sirviera perdería el recargado en caliente del runtime a cambio de nada.

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
- **El Service Worker no se toca** (§4.7).
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

Tests en `packages/core/test/` y hermanos (1–2), `packages/vite/test/` (3–9) y la evidencia
en `examples/` (10–11).

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
9. **`pnpm dev` no cambia** (§4.8): no hay `_fudic/` en el grafo de dev y el runtime se
   sirve como hoy.

**La evidencia**

10. El workspace de [SDD-43](./SDD-43-librerias.md) criterio 12 —dos apps y dos librerías—
    se despliega en un origen y **el runtime aparece una sola vez**. Verificado en Chrome
    real: la pestaña de red de la segunda app no descarga ni un byte de framework que la
    primera ya trajo, y `Application → Cache Storage` lo confirma. Es el criterio entero de
    este SDD.
11. **Cobertura.** El código nuevo al 100 % en las cuatro métricas.

---

## 7. Fuera de alcance

- **El Service Worker.** §4.7. Son 16 kB por aplicación que siguen sin compartirse, y
  tocarlos exige reabrir [BUG-03](./bugs/BUG-03-chunks-compartidos-sw.md), que es otra spec
  y otra medición. **Condición de reapertura:** que alguien mida qué pasa con
  `updateViaCache: 'imports'` sobre URLs inmutables — si el grafo de scripts del worker pasa
  entonces por la caché HTTP, la razón de BUG-03 deja de aplicar y el worker puede partirse.
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
