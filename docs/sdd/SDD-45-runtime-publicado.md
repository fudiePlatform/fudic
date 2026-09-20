# SDD-45 — El runtime se publica en piezas, y cada ruta nombra las suyas

> **Estado:** `Listo`
> **Paquetes:** `@fudic/core` · `@fudic/dom` · `@fudic/forms` · `@fudic/di` (publican piezas) ·
> `@fudic/vite` (genera el coordinador y enlaza) · `@fudic/compiler` (el marcador del layout) ·
> `@fudic/conventions` (los nombres que nadie posee) · `@fudic/transport` · `@fudic/ssr`
> (el worker enlaza) · `@fudic/cli` · `examples/basic` · `examples/workspace` (la evidencia)
> **Depende de:** 15, 17, 19, 20, 27, 41, 43
> **Rango de diagnósticos:** `FUD0800`–`FUD0819`
> **Naturaleza:** **es el documento que cierra fudic.** Toca los artefactos de build, la
> resolución de URLs y el arranque del navegador. No toca el parser ni la gramática.
>
> Hoy cada aplicación **compila** el runtime del framework. Dos apps en un mismo origen
> producen dos copias de los mismos módulos, con nombres distintos, y el navegador se las
> descarga y las cachea las dos. Este SDD invierte eso: el framework **publica** su runtime
> una vez por versión, partido en piezas, y **cada ruta nombra las que necesita**.

---

## 1. Contexto y objetivo

### 1.1. El síntoma, medido

Sobre el build de `examples/basic`, lo que una aplicación se lleva del framework:

| | bytes | ¿es de la aplicación? |
|---|---|---|
| `fudic-main-<build>.js` | 8 405 | **casi nada de él**, ver abajo |
| `assets/browser-<build>.js` | 1 161 | no |
| `assets/live-<build>.js` | 945 | no |
| `assets/signal-<build>.js` | 399 | no |
| `assets/page-<build>.js` | 323 | no |
| **cierre estático de toda página que hidrata** | **11 233** | |
| `fudic-sw.js` | 16 765 | el arranque sí; `@fudic/transport` y `@fudic/ssr`, no |

Y dentro de esos 8 405 de `fudic-main`, atribuidos con su propio mapa de fuentes:

| | bytes |
|---|---|
| el arranque **generado** por el plugin | **469** |
| el runtime de hidratación — `cells` 1 746, `install` 1 640, `cascade` 975, `warm/observer` 604, `capture` 478, `maps` 417, `warm/sw` 391, `chunks` 378, `bus` 320, `replay` 175, `warm/channel` 96 | **7 220** |
| la derivación de URLs (`transport/urls`, `transport/manifest`) | 443 |
| lo que el mapa no atribuye (registro de instancias, sobras del empaquetado) | ~273 |

**Lo que de verdad pertenece a la aplicación son 469 bytes.** Los otros 7 936 son código
del framework, idéntico para toda app y para todo despliegue, que hoy cada build recompila
y cada navegador se descarga de nuevo.

Con tres aplicaciones en un origen eso son unos 33 kB obligatorios repetidos, más 50 kB de
workers. Y un coste que no depende de cuántas apps haya: esos 11 233 bytes llevan el id de
construcción en el nombre, así que **se vuelven a descargar enteros en cada despliegue**,
aunque del framework no haya cambiado nada.

### 1.2. Por qué hoy no hay dos ficheros iguales

Tres razones, y ninguna se arregla moviendo la ruta.

**(a) Cada app compila el runtime.** `@fudic/core`, `@fudic/dom`, `@fudic/forms` y
`@fudic/di` llegan al build de la aplicación **en fuente**, y es el rollup de esa aplicación
el que los poda, los trocea y los minifica. El resultado depende del grafo de esa app, de su
configuración de minificado y de la versión del bundler instalada. Aunque dos apps usaran
exactamente `signal.ts`, los bytes emitidos **no tienen por qué coincidir**, y esperar que
coincidan es construir sobre una coincidencia.

**(b) El arranque lleva la aplicación compilada dentro.** El `main` de `examples/basic`
termina en `createUrlResolver('/', 'b281ee14')` —la carpeta y el id de construcción—, y hay
tres decisiones más tomadas al generarlo: si la app tiene inyección, qué canal de calentado
usa, y si es dev o build. **`main` no describe al framework: describe a la aplicación.** Por
eso no hay dos iguales, y por eso el fichero grande queda fuera de cualquier trato.

**(c) El worker se importa a sí mismo entero.** `@fudic/transport` y `@fudic/ssr` están
dentro de `fudic-sw.js` por [BUG-03](./bugs/BUG-03-chunks-compartidos-sw.md), así que ahí no
hay URL que compartir: son bytes inlineados.

### 1.3. Lo que ya está a favor

**Los trozos de componente ya son perezosos y ya son por módulo.** El trozo de hidratación de
un componente importa exactamente lo que ese componente usa —el del formulario pide el
enlazador de formularios y su validador; el del contador pide el signal— y no se descarga
hasta que alguien toca ese componente. Los formularios y la reactividad **no están en el
arranque** y no hay que sacarlos de ahí: ya funcionan como este documento quiere que funcione
todo lo demás.

**La frontera por la que partir no hay que inventarla.** Los trozos que el build emite hoy
son uno por módulo fuente del runtime:

```
signal   computed   effect   element   subscribe   tracking     ← packages/core/src
browser  emit                                                    ← packages/dom/src
bind-form  bind-text  min-length  messages                       ← packages/forms/src
container  token                                                 ← packages/di/src
```

Lo que falta es que esa frontera alcance también al arranque, que hoy es un bloque.

### 1.4. El objetivo

Que un byte del framework se descargue **una vez por origen y por versión**, lo pidan una
aplicación o diez, lo pida la página o el Service Worker, y **sobreviva a un despliegue**,
sin que ninguna app deje de llevarse solo lo que usa.

Tres consecuencias, y la segunda vale también para quien tiene una sola aplicación:

1. **N apps, un byte.** Es el caso que motivó el documento.
2. **Un despliegue no invalida el framework.** Una app desplegada diez veces descarga el
   runtime **una** vez. Hoy, diez.
3. **El worker bebe de la misma caché que la página**, y el de al lado también.

### 1.5. La doctrina

Cuatro reglas. Todo lo que viene después es su aplicación, y cualquier duda futura —incluido
`@fudic/http`, que va a caer— se resuelve volviendo aquí.

**1. Nada fijo que deba servir a todo el mundo.** Una pieza llega al navegador **solo si
alguien la nombra**. En el momento en que exista un fichero que toda app descarga porque
podría necesitarlo, fudic es un framework monolítico y no hace falta otro: ya están React,
Vue y Angular. Esta regla es la que decide, y gana a cualquier argumento de bytes.

**2. Los bytes cuestan; los ficheros no; la profundidad sí.** Diez peticiones que salen a la
vez desde una lista que el navegador ya tiene son diez peticiones paralelas. Diez que se
descubren una dentro de otra son diez viajes en fila, y eso es lo que hunde una conexión
lenta. Partir en piezas solo vale si **todas se nombran de golpe** y ninguna descubre a la
siguiente. Si al medir aparece una cadena, la respuesta es menos piezas, aunque los bytes
digan lo contrario.

**3. Lo de la aplicación se queda en la aplicación, y es minúsculo.** La carpeta y el id de
construcción son hechos de la app y no pueden vivir dentro de una pieza compartida. Viven en
el coordinador, que son unos cientos de bytes y es lo único que el build de la app genera.

**4. Inline o fichero lo decide quien escribe la aplicación.** Hay políticas de seguridad que
prohíben el script inline y hay conexiones donde un fichero aparte es un FOUC. No existe una
respuesta buena para las dos, luego el framework no elige: ofrece el interruptor donde ya se
dice dónde va el runtime, que es el layout.

### 1.6. Lo que este SDD NO es

**No es un CDN.** Todo sale del mismo origen que las aplicaciones. Nada depende de un
tercero, y el build sigue produciendo todo lo que hay que desplegar.

**No es direccionamiento por contenido.** Se consideró nombrar cada pieza por el hash de su
contenido para que dos versiones compartieran lo que no cambia entre ellas. Se descarta (§7):
exige nombres ilegibles y un manifiesto que los traduzca, y resuelve el diff entre versiones,
que no es el problema que se tiene.

---

## 2. Dependencias

**SDD-15 — Emit.** `EmitOptions`, `io.runtime`, y el hecho de que el compilador no toca el
filesystem: las URLs llegan resueltas por el host. El marcador `fudic:runtime` de un layout
(BUG-31 §T1) es la superficie que este SDD amplía.

**SDD-17 — Hidratación.** El orden bus → cascada → host → replay, `installHydration` y sus
puertos (`resolveChunk`, `warm`, `ready`). §4.12 cambia de dónde sale la lista de instancias
y no toca ese orden.

**SDD-19 — Plugin Vite.** `configResolved`, `buildStart`, `generateBundle`, y el patrón de
artefactos emitidos.

**SDD-20 — Service Worker.** `createLinker`, `canLink`, el `Store` y `cacheNames`: las cuatro
piezas con las que §4.10 enlaza lo que hoy empaqueta. **BUG-03** es la razón por la que el
worker se importa entero, y §4.10 explica a qué se aplica y a qué no. **BUG-33** es el
esquema de nombres de caché por aplicación, del que §4.9 es la excepción deliberada.

**SDD-27 — Artefactos y manifiesto.** El esquema de nombres de salida y el manifiesto de
rutas: lo que este SDD añade tiene que caber ahí sin inventar un segundo esquema.

**SDD-41 — `fudic.json`.** El `id` de aplicación. Este SDD no le añade ningún campo: la
versión del framework no se declara, **se lee del `package.json`**, que es quien la posee.

**SDD-43 — Librerías.** La resolución de specifiers de paquete y §4.7: el rango de
`peerDependencies` que una librería declara sobre el framework. Es lo que decide hasta dónde
llega la libertad de versiones (§4.8), y este SDD lo endurece.

---

## 3. Interfaz pública

### 3.1. La forma publicada

```
<RUNTIME_DIR>/<version>/<paquete>/<pieza>.js
```

```
/_fudic/0.0.1/core/hydrate.js
/_fudic/0.0.1/core/signal.js
/_fudic/0.0.1/dom/browser.js
/_fudic/0.0.1/forms/bind-form.js
/_fudic/0.0.1/di/container.js
```

| Pieza | Qué es |
|---|---|
| `_fudic` | El directorio del runtime, **fuera de todo `base`**. Empieza por `_` por lo mismo que el marcador de SDD-42: ninguna ruta de aplicación puede colisionar con él |
| `<version>` | La versión del paquete del framework, tal cual la declara su `package.json`. No se abrevia, no se trunca. **Es lo que hace cambiar estos ficheros**, y por tanto lo que los identifica |
| `<paquete>` | El nombre corto del paquete: `core`, `dom`, `forms`, `di`. **No es decoración**: `element` existe en `core` y en `forms`, `registry` en `core` y en `di`. Sin el paquete delante, dos piezas distintas pueden pedir el mismo nombre |
| `<pieza>` | El nombre de la pieza, que **no es el de un módulo fuente**: una pieza es un empaquetado (§4.3). `core/hydrate.js` son once módulos dentro de un fichero, y esa es justamente la propiedad que la hace barata de pedir |

### 3.2. `@fudic/conventions`

Nombres que dos paquetes deben acordar y ninguno posee — la regla de ese paquete, aplicada.

```ts
/** Where the published runtime lives on the origin, outside every app's `base`. */
export const RUNTIME_DIR = '_fudic';

/**
 * The origin-wide cache holding `/_fudic/<version>/*`, filled by whichever Service Worker
 * gets there first and read by every worker of the origin (§4.9).
 *
 * No app segment, and that is the point: it is the one cache two applications are meant to
 * share, so it is deliberately outside the `<kind>-<app>-<build>` scheme of BUG-33.
 */
export const runtimeCacheName = (version: string): string => `fudic-runtime-${version}`;

/** Inside that cache, who is still using this version (§4.9). One entry per application. */
export const runtimeMarkerUrl = (app: string): string => `/_fudic/marker/${app}`;
```

### 3.3. Un paquete declara que publica piezas

**No hay una lista de cuatro paquetes en ningún sitio, y eso es un requisito y no un gusto.**
`@fudic/http` va a existir, y el día que exista no debe haber que editar el plugin para que
sus piezas se publiquen. Un paquete lo declara en su `package.json`:

```json
{
  "name": "@fudic/core",
  "fudic": { "runtime": "./runtime" }
}
```

Quien lo declara produce ese directorio en su `build`: **un fichero por pieza**, ya
empaquetado y minificado, con las demás piezas declaradas `external` y apuntadas por su URL
publicada. El plugin descubre las piezas resolviendo el paquete y leyendo ese directorio;
**cómo se construyeron no es asunto suyo**, que es lo que permite que un paquete futuro use
otra frontera sin tocar el enlazador.

```
packages/core/dist/      ← lo de hoy: lo que consume un bundler
packages/core/runtime/   ← nuevo: hydrate.js, signal.js, live.js, …
```

### 3.4. El contrato de una pieza

Hay **dos clases de pieza**, y confundirlas es el error que este apartado existe para evitar.

**Piezas de arranque.** Las que el coordinador pone en marcha: la hidratación, el árbol de
inyección, el canal de calentado, y `@fudic/http` cuando llegue. Son programas: una entrada y
unos parámetros. Por dentro **no saben nada de la aplicación** —la hidratación hidrata igual
aquí y allí—, y lo único que cambia entre dos aplicaciones son los parámetros que reciben.

```ts
/**
 * What a piece the coordinator STARTS exports. One name, one shape: a piece that invented
 * its own signature would force the coordinator to know it specially, and then a new package
 * could not be added without editing the generator — which is what §3.3 exists to prevent.
 */
export interface RuntimeEntry<Options> {
  install(options: Options): unknown;
}
```

**Piezas de biblioteca.** `signal`, `browser`, `element`, los enlazadores de formularios: no
las arranca nadie, las **importa** quien las necesita —normalmente el trozo de un
componente—, y conservan los nombres que exportan hoy. Pedirles una entrada uniforme sería
inventar una ceremonia para un `import { signal }`.

La clase de una pieza no es una etiqueta que haya que declarar: se ve en quién la nombra. Si
la nombra el coordinador, es de arranque.

Y en los dos casos, una entrada uniforme **no es un registro**: lo que el coordinador hace con
las piezas está escrito al construir (§4.4), no se descubre al arrancar. Esa es la diferencia
entre unos imports y unas llamadas —coste cero— y un sistema de plugins que habría que
descargar en toda página para resolver algo que ya se sabía.

### 3.5. `@fudic/vite`

```ts
/** One published piece this build links. */
export interface RuntimePiece {
  /** The package that publishes it: `@fudic/core`. */
  readonly pkg: string;
  /** Its name within that package: `hydrate`. */
  readonly name: string;
  /** The URL it resolves to: `/_fudic/0.0.1/core/hydrate.js`. */
  readonly url: string;
  /** Absolute path of the file to copy into the output. */
  readonly file: string;
}

/**
 * Every piece the packages of this project publish, and what was wrong while finding them.
 *
 * A result and not a bare array, like every other reader of this package: discovery raises
 * `FUD0804`, and a function that can only return pieces has nowhere to put it. I/O is
 * injected, so the walk is testable without a filesystem and never throws on a broken
 * project.
 */
export function runtimePieces(projectRoot: string, io: RuntimeFs): {
  readonly pieces: readonly RuntimePiece[];
  readonly diagnostics: readonly FudicDiagnostic[];
};

/** The pieces ONE route names, which is what its coordinator imports (§4.4). */
export function routePieces(/* … */): readonly RuntimePiece[];
```

**`FudicOptions` no gana ninguna opción.** La versión sale del `package.json` resuelto, el
directorio de `@fudic/conventions`, y el inline o fichero del layout. Ninguna de las tres es
una decisión de quien configura el plugin.

### 3.6. El marcador del layout

Lo que hoy es un marcador pasa a ser un marcador con una opción:

```html
<script type="module" src="fudic:runtime"></script>
<script type="module" src="fudic:runtime?inline"></script>
```

| | qué emite |
|---|---|
| `fudic:runtime` | El coordinador como **fichero**, más un `<link rel="modulepreload">` por cada pieza que esa ruta nombra |
| `fudic:runtime?inline` | El coordinador **dentro de la página**, en un `<script type="module" nonce>`. Sin preloads: los imports se descubren con el HTML |

**Por defecto, fichero.** Es la forma que funciona con la política de seguridad más estricta
y la que se cachea entre navegaciones. El inline lo pide quien lo quiere.

El mismo interruptor, y por el mismo motivo, para la hoja de tokens de la aplicación:
`fudic:styles` y `fudic:styles?inline`.

---

## 4. Comportamiento

### 4.1. El autor escribe `@fudic/core`, y eso no cambia nunca

```ts
import { signal } from '@fudic/core';
```

Eso es lo que se escribe hoy, lo que se escribirá después de este SDD, y lo que se escribe en
un `.fud`, en un `@client` y en un `.ts` del proyecto. **La URL no se escribe jamás a mano**:
es una salida del build, igual que el nombre hasheado de un trozo.

### 4.2. La app enlaza, no empaqueta

El build de la aplicación deja de meter los módulos del framework en su bundle. En su lugar:

1. resuelve qué piezas alcanza su grafo,
2. reescribe esos imports a la URL publicada,
3. copia al `dist` las piezas que enlaza, bajo `_fudic/<version>/`.

Copia **las que enlaza**, no el runtime entero: un `dist` sigue siendo un árbol completo y
desplegable solo, que es la propiedad que permite desplegar dos aplicaciones por separado y
en cualquier orden. Cuando la segunda se despliega sobre el mismo origen, las piezas que ya
estaban se sobrescriben con **los mismos bytes**, porque las produjo el mismo build del
framework y no el suyo.

### 4.3. Qué es una pieza: un empaquetado, no un módulo

**Una pieza es un empaquetado que decide el framework y construye su propio bundler**, con las
demás piezas declaradas `external`. No es un módulo fuente, y esta distinción es la que
sostiene la regla 2 de §1.5: por dentro de una pieza **no hay nada que descubrir**, ya está
todo ahí. Publicar el árbol de ficheros fuente sería lo contrario — once URLs que se revelan
unas a otras, y nadie sabe que hace falta la cuarta hasta que ha llegado la segunda.

Dónde van las fronteras es **la única decisión de este documento**, y es un cambio de bytes
por peticiones. Los dos costes no se pagan igual:

- **Una petición se paga una vez por origen y por versión.** La URL es inmutable, el worker
  la precarga, y a partir de ahí no vuelve.
- **Los bytes de no compartir se pagan por aplicación y por despliegue**, para siempre.

Un gasto único contra uno recurrente: por eso el equilibrio no está en el medio, está más
cerca de partir que de no partir. Y lo caro de verdad —la cadena— no lo produce el número de
piezas sino su contenido, y una pieza empaquetada no encadena nada.

De ahí las dos reglas, y no hay una tercera:

> **Una frontera existe solo si compra algo real.** O la pieza es **opcional** —hay rutas que
> no la necesitan— o es **compartida** —la usan dos aplicaciones, o el worker y la página—.
> Una frontera que no compra ninguna de las dos no es una frontera: es un peaje.

> **Un módulo pertenece a una pieza y a una sola.** Si dos piezas se lo llevan dentro, sus
> bytes están dos veces en el origen y se pierde justo lo que este SDD vino a ganar. Cuando
> dos piezas necesitan el mismo módulo, **no se copia: se convierte en pieza** y las dos lo
> declaran externo.

**Casi todas las fronteras ya existen, y las puso el build.** Los trozos que hoy emite
—`signal`, `browser`, `live`, `container`, `bind-form`, `min-length`…— son ejes de
opcionalidad ya demostrados: un componente que no usa formularios no los arrastra. Lo único
que falta partir es el runtime de hidratación, que hoy está pegado dentro de un fichero que
es de la aplicación. **Este SDD no inventa fronteras nuevas: publica las que hay y saca esa.**

Y lo que varía por aplicación **no puede vivir dentro del coordinador si es código del
framework**: el canal de calentado son unos cuatrocientos bytes y es uno de dos según haya
worker o no, pero meterlo en el coordinador sería volver a compilar runtime en el build de la
app, que es lo que este SDD vino a quitar. Son **dos piezas pequeñas y excluyentes**, y el
coordinador elige cuál importa. Cuatrocientos bytes pedidos una vez por origen y por versión
no son el problema; compilarlos en cada app sí lo era.

### 4.3.1. El reparto no se inventa: ya lo hizo el bundler

Los trozos que el build de una aplicación emite **hoy** son el resultado de que rollup buscara
exactamente lo que buscan las dos reglas de arriba: lo que comparten dos consumidores y lo que
solo alcanza uno. Esa lista es el reparto, y usarla evita discutirlo:

```
browser  emit                                   ← @fudic/dom
signal  tracking  computed  effect  subscribe  element  live   ← @fudic/core
bind-form  bind-text  min-length  messages      ← @fudic/forms
container  token  page                          ← @fudic/di
```

A esa lista este SDD **añade cuatro** y no toca ninguna:

| pieza | clase | qué lleva | cuándo aparece |
|---|---|---|---|
| `core/hydrate` | arranque | capturador, cascada, bus, celdas, cargador de trozos, mapas, registro, repetición del gesto, observador de viewport | la página tiene algo que hidratar |
| `core/warm-sw` · `core/warm-preload` | arranque | el canal de calentado, uno de dos | según la app tenga worker o no |
| `transport/urls` | biblioteca | derivación de URLs de trozos | el coordinador. **El worker no la pide**: lleva `@fudic/transport` entero dentro (§4.10), así que estos bytes existen dos veces en el origen — el coste conocido de que sacar transport del worker esté en §7 |
| `ssr/*` | biblioteca | el renderizador | solo el worker (§4.10) |

Un módulo que hoy no es un trozo propio —`batch`, `controller`, `strategy`— es porque lo
alcanza un solo consumidor, y por la segunda regla va **dentro** de esa pieza. No se le da
pieza por simetría.

**Y al revés: la regla descubre piezas que esta tabla no preveía, y eso es la regla
funcionando.** Al construir aparecieron cinco módulos alcanzados por dos piezas —el registro
de instancias, el canal de calentado, el cableado de formularios, y la resolución y la semilla
de la inyección—, que por la segunda regla se convierten en pieza en vez de copiarse. **La
lista de piezas no se escribe a mano: se deriva.** Cuando alguien añada un import que cruce
dos piezas, o aparece una pieza nueva o hay bytes duplicados, y el criterio 5 es el que lo
caza.

`@fudic/http`, cuando llegue, es una fila más: declara su directorio (§3.3), expone la entrada
de §3.4, y el coordinador la nombra en las rutas que la usan.

### 4.4. El coordinador: por ruta, y de unos cientos de bytes

`main` deja de ser un bloque y pasa a ser lo que su nombre dice: quien coordina. Lo genera el
plugin, **por ruta**, y contiene solo lo que esa ruta necesita.

```js
import { install as hydrate } from '/_fudic/0.0.1/core/hydrate.js';
import { install as di } from '/_fudic/0.0.1/di/page.js';
import { createUrlResolver } from '/_fudic/0.0.1/transport/urls.js';

const urls = createUrlResolver('/', 'b281ee14');
// El canal de calentado es de esta app y son cuatrocientos bytes: vive aquí, no en una pieza.
const warm = (urls) => navigator.serviceWorker?.controller ?? null; /* … */

// El ORDEN lo escribe el generador, que sabe que la inyección tiene que estar lista antes
// de que se levante el primer componente. No se descubre en el navegador.
hydrate({
  root: document,
  resolveChunk: (tag) => urls.hydrateUrl(tag),
  warm,
  // Toda pieza de arranque recibe UN objeto (§3.4). La inyección necesita al menos el mapa
  // de nodos que la página publica, así que no es una llamada sin argumentos.
  ready: di({ nodes, register }),
});
```

Cinco hechos sobre él, y cada uno responde a una regla de §1.5:

- **Es lo único que el build de la app genera del runtime**, y donde viven la carpeta y el id
  de construcción. Por eso no hacen falta atributos en el `<script>` ni ningún otro sitio
  donde repetir esos dos datos.
- **Nombra piezas, no capacidades.** Una ruta sin inyección no escribe la línea de la
  inyección, y entonces esa pieza no existe para esa ruta: ni se descarga, ni se precarga, ni
  se instala en la caché por su culpa.
- **Se emite por ruta y se nombra por su contenido.** Dos rutas que necesitan lo mismo
  producen el mismo coordinador y por tanto **el mismo fichero**: no hay un artefacto por
  ruta, hay uno por combinación, y eso pasa sin que nadie lo coordine.
- **Una página que no hidrata no tiene coordinador.** No es un fichero vacío: no hay fichero
  y no hay etiqueta.
- **Es la raíz de composición, y compone al construir.** El orden entre piezas —la inyección
  lista antes del primer componente— lo escribe el generador, que lo sabe. En el navegador
  quedan unos imports y unas llamadas. **Nada de un registro de piezas en tiempo de
  ejecución**: sería descargar en toda página un mecanismo para resolver algo que ya estaba
  resuelto al compilar.

**De qué sale la lista de piezas de una ruta.** De hechos que el compilador ya tiene, y por
eso esto es una tabla y no una heurística:

| el hecho de la ruta | la pieza que nombra |
|---|---|
| tiene algo que hidratar | `core/hydrate`, `transport/urls` |
| algún componente suyo fabrica hijos | `core/live` |
| publica su mapa de inyección | `di/page`, `di/container` |
| es una ruta reactiva, o alguno de sus componentes lo es | `core/signal` |
| pinta | `dom/browser` |

Lo de **formularios y reactividad no está en esta tabla a propósito**: ya lo arrastra el trozo
de cada componente cuando se hidrata, y eso funciona desde SDD-17. El coordinador no los
nombra porque no le toca.

### 4.5. Inline o fichero, y por qué el fichero ya no encadena

Con la forma de **fichero**, el emit escribe además un `<link rel="modulepreload">` por pieza.
Esto no era posible antes: el comentario de `writeRuntimeTags` decía que los nombres de lo que
`main` importa «son un hecho del bundle y no llegan a este lado». Ahora sí llegan, porque las
URLs de las piezas las decide el mismo plugin que escribe el `<head>`. Con eso el navegador
descubre todas las piezas al leer la cabecera, en paralelo, y la cadena de §1.5 regla 2
desaparece.

Con la forma **inline**, no hay preloads y no hacen falta: los `import` del propio script se
descubren al leer el HTML, que es el instante más temprano que existe.

**`FUD0803`, error.** Un layout pide `?inline` y la política de seguridad del documento no
declara `nonce-{nonce}`. Es decidible en el build y rompe en producción, así que rompe aquí.

### 4.6. Dos apps, la misma versión: una descarga

```
app-1  usa  signal
app-2  usa  signal y computed

/_fudic/0.0.1/core/signal.js      ← una vez. La piden las dos
/_fudic/0.0.1/core/computed.js    ← una vez. La pide solo app-2
```

`app-1` **no** se lleva `computed`, y `signal` **no** se descarga dos veces. Ni la app grande
arrastra a la pequeña, ni la pequeña impide compartir a la grande.

### 4.7. Dos versiones conviven, y la ruta es el registro

```
/_fudic/0.0.1/core/signal.js     app-1 y app-2
/_fudic/2.0.0/core/signal.js     app-3
```

No hace falta un registro de versiones: **mirar el origen es saber qué versiones hay
desplegadas**, porque el manifiesto de cada app nombra las URLs que enlaza. Es la propiedad
que hace esto legible en un navegador: se abre la pestaña de red y se lee la versión.

Un directorio de versión que ningún manifiesto del origen nombra es basura, y eso es
computable sin adivinar. Borrarlo del **servidor** es `fudic prune` y no está aquí (§7);
borrarlo del **navegador** sí está, y es §4.9.

### 4.8. La frontera de versión es el grafo, no la aplicación

Una **librería** fudic publica `.fud` fuente (SDD-43 §4.1), y ese fuente lo compila el build
del **consumidor**. Así que sus componentes se resuelven contra la versión del framework de
*esa* aplicación. Si la librería usa algo que esa versión no tiene, lo que sale es un export
que no existe, en el navegador, dentro de un fichero que el usuario no escribió.

```
libs/ui  necesita  2.0        app-1  en 1.0        app-2  en 2.0
                              ────────────────────────────────────
                              app-1 + libs/ui  →  ROTO
```

**Una aplicación puede estar en la versión que quiera, siempre que ninguna librería de su
grafo exija otra.** En cuanto comparte una librería, la librería manda.

**`FUD0800`, error.** El rango de `peerDependencies` que la librería declara sobre el
framework no incluye la versión que resuelve el consumidor. SDD-43 §4.7 lo dejó en
**warning** —«un rango conservador de más no debe impedir un build que funciona»—, y eso era
correcto mientras todas las apps de un repo compartieran versión por fuerza. Desde que este
SDD hace de las versiones mezcladas una promesa del producto, un aviso ya no basta: lo que
describe **rompe**, y rompe tarde. `FUD0762` queda anotado como superado por este código.

### 4.9. Una caché de origen, y quién la borra

Todo `/_fudic/<version>/*` vive en **una** caché, `fudic-runtime-<version>`, que llena el
primer Service Worker que llegue y leen todos los del origen. La página la alcanza por el
`fetch` de su propio worker; una app **sin** worker la alcanza por la caché HTTP, que comparte
igual porque la URL es la misma.

No lleva `app` en el nombre **a propósito**, y es la única del sistema de la que eso es
cierto: BUG-33 namespacea por aplicación porque dos apps se estaban borrando las cachés, y
esta es justo la que quieren compartir. La versión del framework en el nombre es lo que hace
que `app-1` en 1.0 y `app-2` en 2.0 no se estorben.

**El purgado de BUG-33 no la toca, y no hay que escribir nada para eso.** `isStaleCache` solo
reconoce nombres que empiezan por `shell-`, `routes-`, `pages-` o `data-`. Lo que hay que
escribir es **el test que fija esa propiedad**, porque el día que alguien cambie ese predicado
dos apps volverán a borrarse el runtime.

**Quién la borra, que es lo que le faltaba a esta idea.** Una caché compartida no tiene dueño:
ningún worker sabe si otra aplicación sigue usando esa versión, así que nadie se atreve a
borrarla y se queda para siempre — lo contrario de ahorrar cuota. La regla:

- Al **activarse**, un worker escribe su marca con la fecha dentro de la caché de la versión
  que usa: `/_fudic/marker/<app>`.
- En el mismo paso, recorre las cachés `fudic-runtime-*` del origen y **borra aquellas cuyas
  marcas estén todas caducadas**.

Sin coordinación entre apps, sin registro aparte, y se arregla solo: una app que sube de
versión deja de refrescar su marca en la vieja, y una app que se retira deja de refrescarlas
todas. La caducidad es un valor del propio worker, no una opción del usuario.

### 4.10. El worker deja de empaquetar lo que ya sabe enlazar

Este documento decía antes «el Service Worker se queda como está», y daba como razón
[BUG-03](./bugs/BUG-03-chunks-compartidos-sw.md). BUG-03 sigue siendo cierto y no se reabre.
Lo que se corrige es **a qué se aplica**.

| | quién lo trae | ¿pasa por el `fetch` del worker? | ¿pasa por `CacheStorage`? |
|---|---|---|---|
| `import` en la cabecera del fichero | el cargador de scripts del navegador | no | no, con `updateViaCache: 'none'` |
| `createLinker` + `new Function` | **el propio worker**, por su `Store` | sí | **sí** |

BUG-03 describe la primera fila: un módulo compartido entre la página y el worker se
descargaba dos veces porque lo pedían dos cargadores distintos, y meterlo todo dentro fue —y
sigue siendo— la solución. La segunda fila es el camino por el que el worker ya trae **los
trozos de ruta** en cada navegación.

`@fudic/ssr` está hoy inlineado y entregado a los trozos como `builtins` para que no se
descargue una vez por trozo. Pasa a traerse por el segundo camino: se pide
`/_fudic/<version>/ssr/index.js` al `Store` de la caché compartida, se enlaza con el linker
que el worker ya tiene, y entra en `builtins` exactamente igual que ahora. Lo mismo
`@fudic/di`. Son 5 828 de los 16 765 bytes.

**`@fudic/transport` no se mueve, y no es negociable:** es quien abre la caché, quien tiene el
`Store` y quien tiene el linker. Pedirle que se traiga a sí mismo por el camino que él mismo
implementa es un arranque imposible.

Nada de esto añade un punto de fallo nuevo. El valor de seguridad ya existe: si el realm no
puede evaluar, `canLink()` devuelve falso, el worker se declara inútil y las navegaciones caen
al servidor. Y el enlace ocurre dentro de `build()`, que ya espera al manifiesto.

### 4.11. Sin Service Worker no hay `boot`

Una aplicación sin `sw.json` emite hoy un `fudic-boot-<build>.js` cuyo contenido entero es
`export {};`, y **todas sus páginas escriben el `<script>` que lo pide**: una petición HTTP
por página para un módulo vacío.

Pasa a no emitirse: ni el fichero ni la etiqueta. La condición es la que ya se evalúa para
decidir su contenido, movida un escalón antes — del cuerpo del módulo a la etiqueta.

### 4.12. Un recorrido por gesto, no uno por tag

`allInstances` recorre el documento entero cruzando shadow roots, y el runtime lo vuelve a
llamar **dentro del gesto**: una vez por tag en la cascada, una por receptor del bus, y una
entera —`allInstances(root).find(...)`— para localizar **un** elemento por su id. Un clic
sobre un árbol de N instancias son N+ recorridos completos del documento.

Pasa a haber **uno**: al empezar un turno de hidratación se construye el índice —`id → Element`
y `tag → Element[]`— y los buscadores lo consultan.

**Por turno y no global.** Un índice global exigiría mantenerlo vivo frente a todo lo que
inserta nodos después —el fabricador de `live`, el render del worker, el propio usuario—, y un
índice desactualizado es un fallo silencioso donde hoy hay una pasada lenta. El índice del
turno nace con el gesto y muere con él: no puede envejecer.

No cambia ningún invariante de SDD-17: el orden bus → cascada → host → replay es el mismo.

### 4.13. Una pieza no contiene ni un byte de la aplicación

Es la propiedad que sostiene todo lo anterior, y además es **comprobable mecánicamente**: una
pieza publicada que contuviera el id de construcción de una app no podría compartirse, y el
build lo sabe.

**`FUD0806`, error.** Una pieza que el build va a copiar a `_fudic/` contiene el token de
construcción. No debería poder ocurrir; si ocurre, alguien metió una decisión de la app dentro
de código del framework, y hay que verlo en el build y no en producción.

Esta propiedad es también la puerta a lo siguiente, y conviene dejar escrito por qué no está
aquí: el día que el trozo de un **componente de librería** tampoco contenga bytes de la app
—que es consecuencia directa de esto—, su identidad pasa a ser *(librería, versión de la
librería, versión del framework)* y puede publicarse y compartirse por el mismo mecanismo, sin
maquinaria nueva. Lo que falta para eso no es diseño sino un cambio de nombres de salida
(el trozo de un componente lleva hoy el id de construcción en el nombre), y está en §7 con su
condición.

### 4.14. El polyfill de adopción se queda inline, a propósito

El `<script>` que adopta las hojas compartidas sigue **inline en el `<head>` de cada página**,
como lo dejó SDD-18 §5. No es deuda y no se optimiza:

- Sacarlo a un fichero lo haría bloquear el parser **sobre un viaje de red** en la primera
  visita, que es la que mide el LCP, y añadiría un modo de fallo que el inline no tiene: si esa
  petición falla, no hay adopción y sí hay FOUC, permanente.
- Y se mantiene **también** como posición ante el estándar. La propuesta de
  `<style type="module" specifier>` y la adopción declarativa necesitan implementaciones que
  las empujen; un framework que ya emite la forma estándar y lleva el polyfill al lado es un
  argumento, no un parche.

Cuando la adopción declarativa esté disponible de forma general, esto se borra de una línea —
la primera del propio polyfill ya es la detección.

### 4.15. En desarrollo no cambia nada

`pnpm dev` sigue sirviendo el runtime desde el grafo de módulos de Vite, sin `_fudic/` y sin
versiones en la URL. Publicar piezas es una propiedad del **build**, y un dev server que las
sirviera perdería el recargado en caliente del runtime a cambio de nada.

El coordinador **sí** se genera en dev, con las URLs que dev tiene. Que el arranque tenga la
misma forma en los dos sitios es lo que evita que dev y build sean dos programas.

---

## 5. Invariantes

- **El autor escribe `@fudic/core`.** Ninguna URL del runtime se escribe a mano, en ningún
  fichero, nunca (§4.1).
- **Nada fijo que deba servir a todo el mundo.** Una pieza llega solo si alguien la nombra.
  Es la regla 1 de §1.5 y gana a cualquier argumento de bytes.
- **El framework compila su runtime; la aplicación no.** Es lo que hace que dos apps tengan
  bytes idénticos por construcción y no por suerte.
- **Una pieza no contiene ni un byte de la aplicación** (§4.13), y el build lo comprueba.
- **La aplicación genera el coordinador y nada más**, y ahí viven la carpeta y el id de
  construcción — en un sitio y no en dos.
- **Una pieza es un empaquetado, no un módulo fuente** (§4.3). Por dentro no hay nada que
  descubrir, y por eso pedirla es barato.
- **Una frontera existe solo si la pieza es opcional o compartida.** Cualquier otra es un
  peaje (§4.3).
- **Un módulo pertenece a una pieza y a una sola.** Cuando dos la necesitan, el módulo se
  convierte en pieza; no se copia (§4.3).
- **Toda pieza expone la misma entrada** (§3.4), y la composición ocurre al construir, dentro
  del coordinador. **No hay registro de piezas en tiempo de ejecución** (§4.4).
- **Ningún paquete está enumerado en el plugin** (§3.3). `@fudic/http` tiene que poder
  publicar piezas sin que nadie edite el enlazador.
- **Inline o fichero lo decide el layout** (§3.5), y el defecto es fichero.
- **Un `dist` sigue siendo desplegable solo.** Dos aplicaciones se despliegan por separado y
  en cualquier orden.
- **La versión está en la ruta y se lee.** Ni opaca, ni hasheada, ni traducida.
- **La caché del runtime no lleva el `app` en el nombre**, y es la única (§4.9). Y tiene
  barrido, porque una caché que nadie borra no ahorra cuota: la gasta.
- **`@fudic/transport` vive dentro del worker.** Es quien abre la caché y quien enlaza (§4.10).
- **El polyfill se emite inline** (§4.14).
- **Un índice de instancias no sobrevive a su gesto** (§4.12).
- **`FudicOptions` no gana ninguna opción.**
- **El compilador sigue sin filesystem.** Las URLs llegan resueltas por el host.
- **Cobertura.** El código nuevo nace al 100 % en las cuatro métricas; ningún paquete tocado
  baja del número que tiene al empezar.

### Catálogo de diagnósticos (`FUD0800`–`FUD0819`)

| Código | Severidad | Qué dice |
|---|---|---|
| `FUD0800` | `error` | Una librería del grafo declara un `peerDependencies` sobre el framework que no incluye la versión que resuelve este build. Con la librería, su rango y la versión resuelta. **Sustituye a `FUD0762`** de SDD-43, que era warning (§4.8) |
| `FUD0801` | `error` | Un import alcanza una pieza que la versión publicada no tiene. Es el síntoma de un `dist` a medio copiar o de un paquete mal publicado |
| `FUD0802` | `warning` | El origen ya tiene un `_fudic/<version>/…` con bytes distintos de los que este build copiaría. No debería poder pasar (§4.2): significa que alguien publicó dos veces la misma versión con contenido distinto |
| `FUD0803` | `error` | Un layout pide `fudic:runtime?inline` y la política de seguridad del documento no declara `nonce-{nonce}` (§4.5) |
| `FUD0804` | `error` | Un paquete declara `fudic.runtime` en su `package.json` y ese directorio no existe o está vacío (§3.3) |
| `FUD0805` | `error` | Dos paquetes producirían la misma URL publicada. No debería poder pasar con el paquete en la ruta (§3.1), y por eso se comprueba |
| `FUD0806` | `error` | Una pieza contiene el token de construcción de la aplicación (§4.13) |
| `0807`–`0819` | | Reservados |

---

## 6. Criterios de aceptación

**Cada fase se cierra viendo algo en Chrome**, no al final. El navegador es donde esto se
usa, y un hito que solo existe en un test unitario puede ser verde con la puerta abierta.
Donde dice «en Chrome» se abre `examples/workspace`, servido en un origen, y se mira la
pestaña indicada.

**Lo que publica el framework**

1. Un paquete que declara `fudic.runtime` produce ese directorio con **un fichero por pieza**,
   empaquetado y minificado, con las demás piezas como `external` apuntadas por su URL
   publicada. Los cuatro de hoy lo declaran.
2. **(rojo primero)** **Los bytes no dependen de quién construya.** Construir un paquete dos
   veces produce ficheros idénticos byte a byte. Es la condición de existencia del SDD.
3. `FUD0804` cuando el directorio declarado no existe.
4. **En Chrome:** `/_fudic/0.0.1/core/hydrate.js` se abre y se lee, y **no tiene dentro ni un
   import que no sea una pieza publicada**. Es el hito más pequeño que hay y demuestra las dos
   cosas: que la forma publicada existe, y que por dentro no hay nada que descubrir.

**La pieza**

5. **Ningún módulo está en dos piezas.** Se comprueba sobre los ficheros publicados, no sobre
   la intención: es la regla de §4.3 y es la que, incumplida, devuelve el problema entero.
6. **Toda pieza de arranque expone la misma entrada** (§3.4) —las que el coordinador pone en
   marcha— y una que no la expone rompe el build. Las piezas de biblioteca están exentas por
   definición: a `signal` no se le pide un `install`. Es lo que hará que `@fudic/http` entre
   sin tocar el generador.
7. `FUD0805` si dos paquetes produjeran la misma URL.

**Lo que enlaza la app**

8. **(rojo primero)** Un build que usa `signal` emite `_fudic/<version>/core/signal.js` y
   **ningún** `assets/signal-<build>.js`.
9. Los imports apuntan a `/_fudic/<version>/…`, **sin** el `base` de la aplicación.
10. **La poda se conserva.** Una app que no usa signals derivadas **no** emite `computed.js`.
    Se mide contando ficheros en el `dist`.
11. `FUD0806`: una pieza con el token de construcción dentro rompe el build.
12. **En Chrome:** una ruta que hidrata descarga sus piezas desde `/_fudic/…` y ni una desde
    `assets/`. La pestaña de red es el criterio.

**El coordinador**

13. **(rojo primero)** Dos rutas con distinta necesidad producen distinto coordinador: la de
    inyección lo nombra, la que no, no. Y dos rutas con la misma necesidad producen **el mismo
    fichero**.
14. Una ruta que no hidrata no tiene coordinador: ni fichero ni etiqueta.
15. El coordinador pesa menos de 1 kB. Es un número y no una aspiración: si sube de ahí, algo
    que es del framework se ha colado dentro de la aplicación.
16. **El orden entre piezas está escrito en el coordinador**, no resuelto en el navegador: una
    ruta con inyección levanta el árbol antes del primer componente, y se comprueba leyendo el
    módulo generado, no observando una carrera.
17. **En Chrome:** en una ruta sin inyección, la pestaña de red **no** contiene las piezas de
    inyección. En una con inyección, sí. Mismo origen, misma sesión, dos rutas.

**Inline o fichero**

18. Con `fudic:runtime`, la página escribe un `modulepreload` por pieza; con `?inline`, el
    coordinador va dentro con `nonce` y no hay preloads.
19. `FUD0803` cuando se pide `?inline` sin `nonce` en la política.
20. **En Chrome, y este es el criterio de la regla 2 de §1.5:** en la cascada de red de una
    ruta, **las piezas empiezan todas a la vez** y ninguna espera a que otra termine.
    Se mira con la red a 3G lento, que es donde se ve. Las dos formas, fichero e inline,
    tienen que pasarlo.

**La caché compartida**

21. `isStaleCache('fudic-runtime-0.0.1', app, build)` es `false` para cualquier `app` y
    `build`. Es la propiedad de la que depende que dos apps no se borren el runtime.
22. Un worker escribe su marca al activarse, y borra una versión cuyas marcas están todas
    caducadas. Con reloj inyectado, sin esperar.
23. **En Chrome:** `Application → Cache Storage` enseña `fudic-runtime-0.0.1` con las piezas
    y una marca por app. Se abre la segunda app y **no descarga ni un byte de framework**.

**El worker**

24. `fudic-sw.js` no contiene `@fudic/ssr` ni `@fudic/di` y baja de 16 765 a menos de 11 000
    bytes.
25. La batería de navegación de SDD-20 pasa sin tocarla, **offline incluido**, que es donde
    una dependencia traída por red se nota.
26. **En Chrome:** se navega con red cortada y la página se renderiza. Es el mismo criterio
    que 25 hecho a mano, y es el que de verdad da la tranquilidad.

**Lo que quedaba suelto**

27. Un proyecto **sin** `sw.json` no emite `fudic-boot-*.js` y ninguna página escribe su
    `<script>`. Con `sw.json`, todo sigue igual que hoy.
28. `FUD0800`: una librería cuyo rango no incluye la versión resuelta rompe el build, con los
    tres datos en el mensaje. Y el caso en verde: dentro del rango, cero diagnósticos.
29. Un gesto que hidrata un árbol de N instancias hace **un** recorrido del documento. Se mide
    instrumentando `querySelectorAll` sobre el documento doble de los tests de SDD-17.
30. **En Chrome:** el INP de la ruta más pesada de `examples/basic` no empeora, y se anota el
    número antes y después.
31. **`pnpm dev` no cambia** (§4.15): no hay `_fudic/` en el grafo de dev.

**El cierre**

32. **En Chrome, el criterio entero de este SDD:** dos apps y dos librerías en un origen; la
    segunda app no descarga ni un byte de framework que la primera ya trajo. Y el despliegue:
    se reconstruye `app-1` con un id nuevo, se recarga, y de `/_fudic/` no se vuelve a pedir
    nada.
33. **Cobertura.** El código nuevo al 100 % en las cuatro métricas.

---

## 7. Fuera de alcance

- **Publicar los trozos de los componentes de una librería.** §4.13 deja la propiedad que lo
  hace posible —una pieza sin bytes de la app— y la identidad que tendría: *(librería, su
  versión, versión del framework)*. Lo que falta es un cambio de nombres de salida: el trozo
  de un componente lleva hoy el id de construcción en el nombre, y compartirlo exige que lleve
  la versión de la librería en su lugar, con lo que eso arrastra al manifiesto y a
  `resolveChunk`. **Condición de reapertura:** que exista un workspace con dos apps
  consumiendo la misma librería en producción, que es cuando el ahorro se puede medir en vez
  de estimarse.
- **La caché de compilación de workspace** (compilar una vez un componente que usan dos apps).
  Es un ahorro de **tiempo de construcción**, no de bytes: los bytes los ahorra publicar, que
  es lo que hace este documento. Se deja fuera porque una caché de compilación mal invalidada
  produce **salida incorrecta**, y eso no se mezcla con un cambio que ya toca el arranque.
  **Condición de reapertura:** que el build de `examples/workspace` pase de un umbral que
  moleste, medido.
- **Sacar `@fudic/transport` del worker.** §4.10. Son 8 703 bytes por aplicación que siguen
  sin compartirse, y no por BUG-03 sino porque transport **es** el enlazador. **Condición de
  reapertura:** que alguien mida qué pasa con `updateViaCache: 'imports'` sobre URLs
  inmutables — si el grafo de scripts del worker pasa entonces por la caché HTTP, el `import`
  estático deja de duplicar.
- **Publicar el polyfill de adopción.** §4.14. Descartado con su motivo, no aplazado.
- **Compactar `fudic-routes.json` internando las dependencias en un array.** Medido sobre
  `examples/basic`: 4 937 → 2 998 bytes en crudo, y **787 → 781 brotli**. Seis bytes por la
  red a cambio de un manifiesto ilegible: la repetición de strings es lo que brotli ya
  elimina. **Condición de reapertura:** que el coste pase a ser el `JSON.parse` y no los
  bytes, lo que no ocurre por debajo de varios cientos de rutas.
- **El direccionamiento por contenido.** §1.6. **Condición de reapertura:** cuando exista una
  segunda versión publicada del framework, medir qué fracción de sus piezas es idéntica a la
  anterior.
- **`fudic prune`.** Borrar del **servidor** los directorios de versión que ningún manifiesto
  nombra es un comando, y uno que borra ficheros de un despliegue no se escribe de pasada. El
  barrido del **navegador** sí está aquí (§4.9).
- **Servir el runtime desde un CDN.** §1.6. Todo sale del mismo origen.
- **Declarar la versión del framework en `fudic.json`.** No se declara: la posee el
  `package.json`, y un segundo sitio donde vive el mismo dato es el defecto que SDD-41 §7 y
  BUG-20 ya rechazaron dos veces.
- **Que una aplicación elija la versión de una librería que consume.** Es npm. Lo que este
  SDD añade es el diagnóstico que lo comprueba (§4.8).
