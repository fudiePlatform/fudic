# SDD-45 — Tareas

> **SDD:** [SDD-45 — El runtime se publica en piezas](./SDD-45-runtime-publicado.md) ·
> [catálogo de piezas](./SDD-45-piezas.md)
> **Paquetes:** `@fudic/conventions` · `@fudic/core` · `@fudic/dom` · `@fudic/forms` ·
> `@fudic/di` · `@fudic/compiler` · `@fudic/vite` · `@fudic/transport` · `@fudic/ssr` ·
> `examples/basic` · `examples/workspace` · `examples/pieces-bench`
> **Rama:** `sdd-45-runtime-publicado`
> **Progreso:** 22 / 32
> **Bloqueado por:** [SDD-43](./SDD-43-librerias.md) — su tarea 11 es el `peerDependencies`
> que aquí se endurece, y su criterio 12 es el workspace sobre el que se mide la evidencia.

## Cómo se trabaja este SDD

**Cada fase termina viendo algo en Chrome.** No hay una fase de «evidencia» al final: el
navegador es donde esto se usa, y un hito que solo existe en un test unitario puede estar
verde con la puerta abierta. Una fase no se cierra sin su hito, aunque todo lo demás esté
verde.

El hito se mide con **`examples/pieces-bench`** —ocho escenarios que descargan sus piezas de
verdad, con y sin precarga— y con `examples/workspace` donde haga falta un origen con dos
apps. Donde el hito pide red lenta se usa «Slow 3G»: a velocidad de local, una cadena de
descubrimiento y un abanico paralelo se ven igual, y son lo contrario.

**Lo que hay que tener claro antes de escribir una línea**, porque es donde este documento se
equivocó tres veces antes de asentarse:

- **Una pieza es un empaquetado, no un módulo fuente.** Por dentro no hay nada que descubrir.
- **Una frontera existe solo si la pieza es opcional o compartida** — y además **vale más que
  su frontera**, que son unos 150 bytes comprimidos y una petición. Los hermanos pequeños van
  juntos.
- **Un módulo pertenece a una pieza y a una sola**, y **todo valor exportado pertenece a
  alguna**. El reparto se deriva de lo que un paquete **exporta**, nunca de lo que un ejemplo
  gasta: deducirlo de un ejemplo es deducirlo de una casualidad, y así fue como `minLength`
  tuvo pieza y `required` no.
- **La composición ocurre al construir**, dentro del coordinador generado. Nada de un registro
  de piezas en tiempo de ejecución.

---

## Dónde estamos

**Fase 5 con cuatro de sus cinco tareas hechas: queda la 23, y es la que decide Pedro.** El
interruptor del layout existe y `?inline` significa lo mismo en cualquier recurso que el autor
referencia —el arranque y una hoja de estilos, hoy—; la precarga escribe un `<link>` por pieza
de la CARGA; `FUD0803` está escrito donde cae; y con worker **no se descarga nada por
adelantado**: cada pieza se cachea la primera vez que una página la pide.

**La tarea 22 se hizo dos veces, y la primera estaba mal.** El requisito decía precachear en el
`install` todo lo que la aplicación enlaza, y con la red delante se vio lo que era: 54
peticiones y 64 kB en la primera visita a una ruta que solo hidrata, traídos para pintar algo
que no usa ni formularios ni inyección ni reactividad. Partir el runtime en piezas y luego
descargarlas todas de golpe es el monolito entrando por la puerta de atrás. Ahora todo lo que
cuelga de `/_fudic/` se sirve cache-first desde la caché de origen y se escribe en la primera
petición: la primera visita cuesta lo que cuesta esa página, y el runtime acaba entero en la
caché cuando ha hecho falta entero.

**Y la precarga solo se escribe cuando la aplicación NO tiene worker**, corregido con la
consola delante: Chrome descarta cada `<link>` por cruce de mundos —el escáner de precarga
pide en uno y el grafo de módulos en el otro—, así que cada pieza se descargaba dos veces en
cada carga controlada. Con worker la precarga no tiene casi nada que comprar: desde la segunda
visita las piezas son lectura de caché. El caso sin worker no enlazaba piezas —`nosw` no tenía
`package.json`, así que el descubrimiento no veía publicadores y el runtime se empaquetaba—;
ahora sí, y es donde se mide el criterio 20.

**La primera carga la arregla la página.** Un worker se instala durante ella y reclama al
final, así que sin nada más el runtime se cachea en la segunda visita, que es entonces la
primera que funciona sin red. Ahora la página, al terminar de cargar, le dice al worker qué
piezas ha usado —leídas de su línea de tiempo de recursos— y el worker se las queda: son
ficheros que el navegador ya tiene, así que cuesta una lectura de su caché HTTP. Lo que la
página dice se comprueba contra el prefijo antes de guardarlo.

**La precarga cambió el número que había que mirar.** Una ruta que hidrata nombra **cuatro**
piezas en su cabecera, y seis la que además inyecta: la cadena de tres niveles que se veía en
la fase 3 ya no existe, porque el registro va nombrado arriba en vez de descubrirse dentro de
la hidratación. Y lo dinámico se queda fuera a propósito: precargar el adaptador y el signal
devolvería a toda página los bytes que la tarea 16 acaba de quitar.

**Visto al quitar el precacheo, y sin resolver:** el calentado deposita el trozo de un
componente y las dependencias que el manifiesto le conoce, que son trozos de la aplicación.
Las **piezas** que ese trozo importa —`core/element`, `dom/browser`— no están en esa lista, así
que se piden cuando el trozo se evalúa, o sea dentro del gesto. Antes de este SDD eran trozos
compartidos y sí se calentaban. Es exactamente el defecto que BUG-31 §T5 arregló, una vuelta
más: lo que hay que añadir es que el calentado sepa también qué piezas nombra un trozo.

**Lo que eso deja encima de la mesa, que es la pregunta que esta fase tenía aparcada:** con el
reparto de hoy **ninguna ruta llega a diez piezas de carga**, así que el límite de §4.5.2 no
dispararía nunca sobre la carga. Las dieciséis peticiones del formulario no son de la carga:
las trae el trozo del componente al hidratarse, y el coordinador no las nombra. Y hay un
problema de fondo con el paquete: **empaquetar lo tiene que hacer un empaquetador, y el de la
aplicación no produce los mismos bytes que el de otra** —que es justo lo que §1.2 dice y lo que
hace que dos apps compartan—, así que un paquete por conjunto construido por la app **no lo
comparte nadie**, al revés de lo que §4.5.2 promete.

**Fase 4 cerrada, con el hito visto en Chrome.** El coordinador
existe y es por ruta —321 bytes la ruta que solo hidrata y 572 la que además inyecta, contra los
1 836 de un arranque único para toda la app—, y el arranque ya trae solo lo que hace falta sin
tocar nada: **cuatro peticiones y 8 507 bytes**, contra nueve y 10 707. El adaptador del DOM y
el signal con su seguimiento los pide la propia hidratación, en una tanda de dos, cuando algo se
va a hidratar, y el calentado los anticipa con el trozo del componente que entra en pantalla.

**Y el puente del fabricado resultó ser opcional de verdad**, que era la pregunta abierta de la
tarea 16: no viaja con el calentado, viaja con el trozo del componente que fabrica y con nadie
más. Lo que lo retenía era la dirección de la dependencia —la hidratación lo importaba para
meterle cómo define esta página un tag—, y ese asiento vive ahora en `core/registry`, que ya
alcanzaban las dos piezas. §4.3.1 no necesita corrección.

**Un defecto real que salió de esto y que no habría salido de un test de la tarea:** el escáner
que decide qué piezas se copian al `dist` solo veía URLs entre comillas, y un `import()`
minificado las escribe entre acentos. Una app cuyos componentes no importaran el signal —una que
hidrate sin reactividad— habría desplegado sin `core/signal.js` y habría dado 404 en el primer
gesto, con la página ya cargada. Arreglado en el enlazador y en la cuarta comprobación del banco,
que ahora también mira los imports dinámicos.

**Fase 3 cerrada y commiteada.** La aplicación ya no compila el runtime: lo enlaza. En
`examples/basic` no queda un solo fichero de framework en `assets/` —seis trozos de la app y 34
piezas bajo `_fudic/0.0.1/`—, el arranque pasó de 8 405 a 1 836 bytes, y las dos apps de
`examples/workspace` enlazan las mismas nueve piezas con bytes idénticos.

**Fase 2 cerrada.** El reparto ya no se deduce de lo que gasta un ejemplo: sale de lo que cada
paquete exporta, y hay una herramienta que lo comprueba sobre los ficheros publicados.
**41 piezas, 32 556 bytes** (15 491 comprimidos). El catálogo está en
[SDD-45-piezas.md](./SDD-45-piezas.md).

**Lo medido, que es lo que sostiene el resto:**

- **Partir cuesta.** Cada frontera son unos **150 bytes comprimidos** más su petición. Es el
  número con el que se decide si una pieza vale la pena, y el que la tercera comprobación
  aplica.
- **El arranque son 10 386 bytes y 8 peticiones, con tres niveles de descubrimiento**
  (`hydrate` → `signal` → `tracking`). Una petición menos que en la fase 1 —el canal de
  calentado dejó de ser pieza— y 486 bytes más, casi todos del agrupado de escrituras, que
  ahora es alcanzable. Sin la precarga de la fase 5 esto sigue siendo peor que hoy.
- **2 328 de esos bytes no hacen falta al cargar**: el adaptador del DOM, el signal, el
  seguimiento y el puente del fabricado (§4.4.1).
- **El formulario completo son 16 peticiones y 11 269 bytes**, y es la primera vez que esa
  cuenta es verdad: siete de esas piezas —el modelo— no existían. Es el único escenario que
  pasa del límite de diez de §4.5.2.
- **Ocho piezas las pide toda ruta que hidrata**; `effect` y `subscribe` las evitan 13 de 17
  rutas, y `computed` 15 de 17.

**Lo que la fase 2 dejó decidido y medido**, por si alguien lo quiere reabrir:

- Los ocho validadores van en **una** pieza y las doce conversiones tipadas en **otra**: cada
  valor pesa entre 50 y 130 bytes y una frontera cuesta 150, así que sueltos pierden dinero.
- `core/channel` (184 B) se metió dentro de los dos canales de calentado, y `forms/group`
  (107 B) dentro del formulario. Los dos por lo mismo: pesaban menos que su frontera y no se
  descargan sin lo que los acompaña.
- Los nueve enlazadores **sí** son nueve piezas: el más pequeño comprime a 159 bytes y todos
  pasan la frontera. La página con un campo de texto se lleva uno.
- Tres piezas minúsculas existen porque su contenido entero es un `Symbol` —los internos del
  nodo, la marca de regla de servidor— o porque las alcanzan dos piezas y copiarlas serían los
  mismos bytes dos veces. Están escritas como excepción, con su razón, donde se comprueban.

**Sigue abierto, y lo decide Pedro mirando el banco:** si el arranque con precarga vale, no se
empaqueta nada; si no, se empaqueta por conjunto. La fase 5 implementa el límite de §4.5.2 en
cualquier caso — lo que falta es el número por defecto confirmado, hoy escrito como 10. El
formulario con sus 16 peticiones es el caso con el que decidirlo.

## Lo que la sesión de tests tendrá que cubrir

El código nace sin tests, por decisión explícita, y esto es para que no haya que adivinar la
intención. De la **fase 1**: el descubrimiento de piezas de `@fudic/vite`
(`src/runtime-pieces.ts`) tiene la I/O inyectada precisamente para esto — camino feliz, forma
de la URL sin `base`, publicador transitivo, a través de una librería, la regla de parada que
mantiene `node_modules` fuera, deduplicación de symlinks, las tres formas de `FUD0804`, las
no-declaraciones que no son diagnóstico, normalización del valor declarado, no lanzar nunca,
publicador sin `version`, determinismo del orden, solo `.js` de primer nivel, y
`devDependencies`/`peerDependencies`. Y las tres comprobaciones del criterio 5, que la fase 2
deja como herramienta y que ahí deben convertirse en test.

De la **fase 2**, y esto es lo que no se puede reconstruir leyendo el diff:

- **`FUD0805` (`src/runtime-pieces.ts`, `withoutClashes`).** Dos publicadores cuyos nombres
  acaban en el mismo segmento y con la misma versión. Hace falta el caso en verde (nadie
  choca, cero diagnósticos), el choque con **dos** paquetes, y el que se olvida: que la pieza
  **que se queda** es la primera y no las dos, porque el resto del build no debe ver dos
  entradas para una URL. La I/O ya está inyectada, así que el choque se monta con dos
  manifiestos falsos y no con un `node_modules`.
- **La comprobación es sobre los EXPORTS del fichero publicado, no sobre los módulos que lleva
  dentro.** Es la distinción que hizo falta para ver el defecto de `batch`, que viajaba dentro
  de `core/signal` sin que ninguna URL ofreciera el nombre. Un test que mire módulos vuelve a
  dejar pasar ese caso exacto.
- **De dónde sale cada cosa**, para que el test no la deduzca de otro sitio: qué módulos hay
  dentro de una pieza se saca construyendo el propio `rolldown.config.ts` con mapas de fuentes
  a un directorio temporal —el bundler de verdad respondiendo, no un segundo recorrido del
  grafo que coincidiría hasta el día que no—; y qué valores exporta un paquete, de su `dist/`,
  donde los tipos ya están borrados. Hay que recorrer **todos** los subcaminos de `exports`:
  `@fudic/forms/dom` es el que se quedó fuera la primera vez, y con él seis enlazadores.
- **Las excepciones escritas** (`check.mjs`, `EXCEPTIONS`). Cada una debería tener su test:
  que el canal de calentado en dos piezas **no** es un fallo y en cualquier otro par **sí**;
  que `install` repetido en las piezas de arranque es el contrato de §3.4 y no un choque; y
  que una excepción que ya no hace falta se reporta —hubo una, `forms/internals`, que creció
  por encima de la frontera y nadie se habría enterado.
- **`moduleSideEffects: false` en los externos** (los cuatro `rolldown.config.ts`). No es una
  optimización: sin eso el shim deja un `import "…"` desnudo por cada pieza que ofrece y no se
  usa, y cada enlazador salía pidiendo `core/signal`, `core/tracking` y `core/element` —tres
  peticiones y 114 bytes— por nombres que no menciona. Lo que hay que fijar es la propiedad, no
  la opción: **ninguna pieza publicada importa una URL de la que no usa ningún nombre**. Eso se
  comprueba sobre los ficheros publicados y protege los cuatro configs a la vez.
- **El borrado previo de `runtime/`** en los seis `build:runtime`. Quitar una pieza dejaba su
  fichero en el directorio, y `files` lo habría publicado. La propiedad a fijar: lo que hay en
  `runtime/` es exactamente lo que el config produce, ni un fichero más.

De la **fase 3** (`src/runtime-link.ts`, y el cableado en `src/plugin.ts`). Es todo función
pura sobre texto salvo el cableado, así que casi todo se prueba sin filesystem:

- **`runtimeLinkage`.** El parseo de exports de una pieza —`export{r as signal}` da `signal`,
  el nombre de antes del `as` es del minificador y cambia en el siguiente build—, varias
  sentencias, llaves vacías, y una pieza que no se puede leer, que no es un fallo aquí porque
  el descubrimiento ya lo dijo. Y la regla de la ambigüedad: un nombre en dos piezas **no se
  ofrece**, salvo `install`, que es el contrato de §3.4 y que nadie importa por especificador.
- **`runtimeShim`.** Que el `export *` va **primero** y las re-exportaciones explícitas lo
  tapan, que hay **una sentencia por pieza** y no por nombre, y que el orden es estable
  —lo genera un build y dos builds tienen que dar los mismos bytes.
- **`shimIdFor` / `shimSpecifier`.** El especificador va **al final** del id, y esa no es una
  colocación: el importador acaba en `…/app-card.fud?client`, y un id que acabe así es un
  `.fud` para todo gancho que pregunte qué es un fichero. Sesenta de ellos intentaron compilar
  `@fudic/core`. El test que lo fija es que el id no termine en algo que `splitId` lea como
  fichero.
- **Las tres exclusiones, que son la parte que se descubrió fallando** y la que nadie
  reconstruye leyendo el resultado:
  1. **El importador es un envoltorio de render.** Esos imports son del worker, resueltos por
     su propio enlazador (`@fudic/ssr` llega como builtin), y reescribirlos le entrega un
     especificador que no sabe contestar. Lo trajo `ssr/index.js` apareciendo en el `dist` de
     `examples/basic` sin que ningún trozo lo nombrara.
  2. **El importador es el propio shim**, que es como la parte no publicada de un paquete
     llega a su fichero de verdad. Sin esto el especificador vuelve en bucle.
  3. **El importador está dentro de un paquete publicador.** El enlace ocurre en la frontera
     que cruza la **aplicación**, nunca dentro de un paquete. Esto rompió el build de las dos
     apps del workspace: `@fudic/ssr` alcanza `@fudic/di` por dentro, y esa dependencia es del
     paquete y no de la app —que no la declara—, así que no había forma de resolverla.
- **`linkedPieces` es transitivo.** Una pieza nombra otras por URL, así que copiar solo lo que
  la aplicación nombra deja un `dist` que da 404 en el segundo salto: `core/hydrate` pide
  `dom/browser` y `core/registry` sin que ningún trozo de la app los mencione. Y se lee del
  **código emitido**, no del grafo de módulos, que es lo que hace medible la poda.
- **`piecesToCopy`.** `FUD0806` con el token dentro (y que esa pieza **no** se copia),
  `FUD0802` cuando el destino ya tiene esos bytes distintos, y el caso en verde. Los dos se
  verificaron **a mano** en esta fase —`FUD0802` solo es alcanzable con el `dist` sin vaciar,
  que es el escenario real: dos apps desplegando sobre un mismo origen.
- **Lo que hay que fijar sobre el resultado**, más que sobre las funciones: que ningún fichero
  de `assets/` es del framework; que las URLs **no** llevan el `base` de la app (se comprobó
  con `admin`, que va en `/admin/`); que una app sin signals derivadas no emite `computed.js`;
  y que en dev **no hay nada de esto** —el enlace vive detrás de `!isDev` y el descubrimiento
  ni se ejecuta.

De la **fase 4** (`src/coordinator.ts`). Doce aserciones se MOVIERON aquí desde
`emitMainBootstrap`, que dejó de existir: están en `test/coordinator.test.ts` y comprueban lo
mismo que comprobaban —hidratación siempre instalada, un solo canal de calentado, la URL
derivada en build y la de dev sin identificador, el inyector nombrado solo cuando se usa— más
las tres propiedades que el coordinador añade: sin nada que hidratar no hay coordinador, se
nombra por su contenido, y dos rutas con la misma necesidad dan el mismo nombre. Lo que queda
por cubrir:

- **La tabla de §4.4 es de DOS hechos y no de cinco**, y los tres que faltan no son un olvido:
  §4.4.1 saca de la carga el adaptador del DOM, el signal y el puente del fabricado, y
  formularios y reactividad nunca estuvieron —los arrastra el trozo de cada componente. Un
  test que vuelva a meterlos deshace la tarea 16 sin que nadie lo vea.
- **El orden va escrito**: el árbol de inyección se arranca ANTES de instalar la hidratación y
  se entrega como `ready`, no se espera delante. Se comprueba leyendo el módulo generado, no
  observando una carrera.
- **El coordinador por debajo de 1 kB**, y de dónde salía el peso: eran 1 836 bytes y 1 100 de
  ellos eran el ayudante de precarga que el bundler de la APP inyecta al ver un `import()`
  dinámico. Por eso la carga de los módulos de inyección se movió a `installPage`, dentro de
  `@fudic/di`. Un test sobre el tamaño sin esa explicación al lado se «arregla» moviéndolo de
  vuelta.
- **`di/page` sigue sin tocar el DOM.** El mapa llega ya parseado: quien lee los dos bloques es
  el coordinador, porque dónde guarda una página sus bloques es de la página.
- **El nombre del fichero se fija a mano** (`emitFile` con `fileName`, no con `name`). La
  cabecera lo nombra en la raíz del output; dejado al nombrado por defecto cae en `assets/` y
  es una etiqueta apuntando a un fichero que nadie escribió. Pasó.
- **`FUD0801` solo cuando el publicador ESTÁ en el grafo y le falta la pieza.** Un paquete que
  este proyecto no alcanza no publica nada aquí, y eso no es un defecto: el coordinador lo
  nombra como paquete y el bundler lo resuelve, como antes de este SDD. La primera versión era
  un error para cualquier proyecto sin runtime publicado y tiró toda la batería de build.

De la **tarea 16**, el arranque mínimo. Nace sin tests un fichero entero
(`core/src/hydrate/deferred.ts`) y cambian de forma tres más, así que esto es lo que hay que
fijar, empezando por lo único que de verdad protege la tarea:

- **La propiedad está en los BYTES PUBLICADOS, no en el código fuente.** `core/hydrate.js` no
  debe importar estáticamente `dom/browser`, `core/signal`, `core/tracking` ni `core/live`: se
  comprueba sobre el fichero de `runtime/`, que es lo que descarga un navegador. Un test sobre
  los imports del `.ts` se queda verde el día que alguien añada el import en otro módulo del
  mismo empaquetado, que es exactamente cómo estaban los cuatro antes de esta tarea.
- **El pedido es UNA tanda de dos y no una cadena** (`importDeferred`), y el memo guarda la
  PROMESA: dos caminos que las piden a la vez son una sola descarga, y quien llega segundo
  espera lo que ya está en vuelo. La `import()` de verdad es lo único que un test unitario no
  puede ejercitar, igual que `importChunk` — y hoy está inyectada en `install.test.ts`,
  `route.test.ts` y `cells.test.ts`, así que sin un test propio queda a cero.
- **El orden dentro del camino 2**: las piezas se piden ARRIBA, antes de `ready`, y se esperan
  ANTES del bus y de la cascada. No es una preferencia: cualquiera de los dos puede entregarle a
  una instancia su rebanada, y una rebanada es donde se materializa una celda. Si se espera
  después, la aserción de `install.ts` revienta —y eso es el contrato, no optimismo.
- **El calentado las pide con el trozo, en la misma tanda de tiempo muerto.** El envoltorio del
  canal vive en `install.ts` a propósito: qué piezas se saltó la carga es de ese fichero, y el
  observador es una política sobre trozos. Y el caso sin canal: una página que no calienta sigue
  siendo correcta, las pide en el gesto.
- **El asiento de `core/registry`** (`publishTagSource` · `tagDefiner` · `pageElements`). Lo que
  hay que fijar no son las tres funciones sino la consecuencia: **ninguna pieza de arranque
  importa `core/live`**, y `live` sin nada instalado sigue esperando al registro de la plataforma
  (eso ya lo cubre `live-alone.test.ts`, que es el único sitio donde ese estado existe una vez).
- **Toda URL que una pieza nombra se copia, la nombre como la nombre.** El escáner del enlazador
  solo veía comillas y un `import()` minificado escribe acentos; la propiedad a fijar es que una
  pieza alcanzada **solo** por un import dinámico acaba en el `dist`. Se verificó a mano contando
  ficheros, y es un 404 que llega en el primer gesto de una página que ya cargó bien. La cuarta
  comprobación del banco mira ahora las dos formas.
- **Y un test que hubo que adaptar, con la misma forma que los doce de la tarea 14:** el de
  §6.16 —«el router recibe un registro que puede vaciar»— construía una celda sin haber hidratado
  nada, y eso ya no existe: la celda se hace con el signal, que llega con las piezas diferidas.
  Ahora hidrata una instancia anticipada primero y comprueba lo mismo que comprobaba. Lo que un
  router usa de verdad es `clear()`; que `get()` antes de la primera hidratación no es un camino
  soportado conviene fijarlo también.

De la **fase 5**, tareas 19 a 22:

- **El marcador tiene tres respuestas y no dos** (`runtimeMarkerForm`): fichero, dentro de la
  página, y **nada**. `fudic:runtimeish` o el marcador con cualquier otra query no son el
  marcador: una query desconocida es una errata, y contestarla como si fuera el defecto es cómo
  una página acaba silenciosamente sin inlinear. Eso hay que fijarlo, porque es lo primero que
  alguien «arregla» con un `startsWith`.
- **La forma viaja del layout a la ruta como ARGUMENTO** (`runtime($inline)`), y el motivo es
  que un layout se compila una vez y lo comparten muchas rutas. La ruta lleva las dos formas
  escritas; cuál corre lo dice quien tiene el marcador. Un test que meta la forma en la ruta
  hace que dos rutas con el mismo layout puedan discrepar.
- **La precarga es el cierre transitivo de los imports ESTÁTICOS** (`loadedPieces`). Dos
  propiedades y las dos son de la tarea 16: que `core/registry` esté en la lista aunque el
  coordinador no lo nombre, y que el adaptador y el signal **no** lo estén aunque
  `core/hydrate` los pida. Las dos formas se distinguen por sintaxis y no por comillas, que es
  lo que hay que fijar: `from "…"` e `import "…"` sí, `import("…")` no, ponga el minificador
  las comillas que quiera.
- **`?inline` sobre un recurso** (`inlineStyleExpr`): una hoja de estilos y solo una hoja de
  estilos; el `<link>` desaparece y no se registra ningún import, así que el build tampoco
  publica el fichero. Pasa por las dos pasadas de CSS que ya existen —compactado y `url(…)`
  enlazado—, y eso es lo que hay que fijar: un segundo camino para el CSS es cómo una de las
  dos salidas deja de minificarse sin que nadie se entere, que es literalmente BUG-08.
- **El nonce del layout se escribe solo cuando hace falta** (`headEmbedsAsset`). Un layout
  nunca había escrito nada inline suyo, así que no declaraba el binding; el fallo fue un
  `$nonce is not defined` en el prerender y no en un test.
- **`FUD0803` no puede dispararse hoy**, y conviene que su test lo diga: la política del
  documento es una constante del framework y declara el nonce. Lo que se prueba es
  `policyDeclaresNonce` sobre una política sin él, y el cableado — que la pregunta se hace
  sobre el marcador del LAYOUT, que es donde suele estar, y no solo sobre el fichero de la ruta.
- **La precarga desaparece cuando hay worker** y está cuando no lo hay. Es una propiedad del
  plugin (`runtimeEntriesFor`) y la razón no se deduce del código: el navegador tira esos
  `<link>` por cruce de mundos y descarga la pieza dos veces. Un test que compruebe «siempre
  hay preloads» revive el defecto.
- **Lo que la página reporta se comprueba antes de guardarse** (`keepRuntime`): una URL fuera
  del prefijo se ignora, porque un mensaje puede nombrar cualquier cosa y esa caché la
  comparte todo el origen. Y `notifyRuntimeUsed` no dice nada cuando la página no usó
  ninguna pieza.
- **El worker NO precachea el runtime**, y eso hay que fijarlo con un test que lo diga, porque
  es lo que un día alguien «arregla» pensando que falta: el `install` escribe el shell y el
  manifiesto y nada más. Lo que se prueba del camino nuevo es el enrutador
  (`config.runtime`): que una petición bajo el prefijo se sirve cache-first sin TTL desde SU
  caché y se escribe en la primera, que va **antes** que las clases de `sw.json` —una regla
  `/_fudic/**` escrita a mano mandaría las piezas a `data-<app>-<build>`, que se purga en cada
  despliegue—, y que sin `runtime` configurado el enrutador es el de antes. Y del plugin, que
  en dev el prefijo va vacío: en dev el runtime sale del grafo de módulos y cachearlo es una
  recarga en caliente que no llega.
- **Tres aserciones de `bootstrap.test.ts` se adaptaron**, no se borraron: comprobaban la forma
  exacta de un texto generado que esta fase cambia —el enrutador recibe ahora las piezas además
  del shell, y el `install` abre la caché en una variable porque la lee dos veces—. Siguen
  comprobando lo mismo.

---

## Mapa de dependencias

```
F1 las piezas existen ──→ F2 el reparto ──→ F3 enlazar ──→ F4 el coordinador ──→ F5 la política
                                                │                                       │
                                                ├──→ F6 la caché compartida ────────────┤
                                                └──→ F7 el worker ──────────────────────┤
                                                                                        │
                                         F8 lo suelto (boot · FUD0800 · índice) ────────┤
                                                                                        │
                                                                   F9 evidencia y cierre ┘
```

---

## Fase 1 — las piezas existen (5) · **cerrada**

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Los nombres que nadie posee.** `RUNTIME_DIR`, `runtimeCacheName(version)` y `runtimeMarkerUrl(app)` en `@fudic/conventions`. La caché **no lleva `app`** y eso es deliberado (§4.9) | `conventions` | `src/index.ts` |
| [x] | 2 | 1 | **(rojo primero)** **Los bytes no dependen de quién construya.** Construir dos veces produce ficheros idénticos byte a byte. Criterio 2 | `core` | — |
| [x] | 3 | 2 | **El contrato de una pieza.** `install(options)`, uniforme y no un registro (§3.4). Criterio 6 | `core` | `src/runtime-entry.ts` |
| [x] | 4 | 3 | **Un paquete declara que publica piezas, y el plugin no enumera a nadie.** Criterio 1 | `core` · `dom` · `forms` · `di` · `transport` · `ssr` | `rolldown.config.ts` |
| [x] | 5 | 4 | **`FUD0804`** y el descubrimiento por resolución del grafo. Criterio 3 | `vite` | `src/runtime-pieces.ts` |

> **Hito conseguido.** Las 27 piezas servidas en sus URLs reales, `core/hydrate.js` legible y
> sin nada que descubrir dentro, y cero imports rotos.

---

## Fase 2 — el reparto, derivado de los exports (4) · **cerrada**

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 6 | 5 | **Rehacer el reparto a partir de lo que cada paquete exporta.** En `@fudic/forms`: los validadores en **una** pieza y las conversiones tipadas en **otra** —cada uno pesa entre 50 y 130 bytes y una frontera cuesta 150, así que sueltos pierden dinero— más `form`/`group`/`control`. En `@fudic/core`, `batch`; en `@fudic/dom`, `cursorOf`. Criterio 5 | `forms` · `core` · `dom` | `rolldown.config.ts` |
| [x] | 7 | 6 | **`core/channel` desaparece como pieza** y se mete dentro de `warm-sw` y `warm-preload`. Decidido y medido: son 184 bytes, cuestan más como frontera, y los dos canales son excluyentes, así que nadie los descarga los dos. Es la excepción escrita a la segunda regla: vale para piezas que **pueden convivir** | `core` | `rolldown.config.ts` |
| [x] | 8 | 7 | **Las tres comprobaciones, como herramienta y en el banco.** Ningún módulo en dos piezas, ningún valor exportado sin pieza, ninguna pieza por debajo de su frontera. Sobre los ficheros publicados. Las excepciones de `@fudic/transport` (§4.10) se escriben, no se echan de menos en silencio. Criterio 5 | `examples` | `examples/pieces-bench/` |
| [x] | 9 | 8 | **`FUD0805`:** dos paquetes que produjeran la misma URL publicada. Criterio 7 | `vite` | `src/runtime-pieces.ts` |

> **Hito conseguido.** El banco enseña las tres comprobaciones en cero, arriba del todo y antes
> que ningún escenario. Y el formulario pasó de nueve peticiones a dieciséis, que no es un
> empeoramiento sino la primera medida honrada: las siete que faltaban eran el modelo —campos,
> formulario, conversiones y reglas—, que hasta ahora no tenía URL y por tanto no aparecía en
> ninguna cuenta. Es también el primer escenario que se sale del límite de diez de la fase 5,
> que es justamente para lo que ese límite existe.

---

## Fase 3 — enlazar (4) · **cerrada**

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 10 | 9 | **(rojo primero)** **El plugin enlaza en vez de empaquetar.** Los imports de los paquetes de runtime se reescriben a `/_fudic/<version>/<paquete>/<pieza>.js`, **sin** el `base` de la app. Se ve fallar antes: hoy emite `assets/signal-<build>.js`. Criterios 8, 9 | `vite` | `src/runtime-link.ts` · `src/plugin.ts` |
| [x] | 11 | 10 | **Copiar al `dist` lo que se enlaza, y solo eso**, más `FUD0802` si el destino ya tiene esa pieza con bytes distintos | `vite` | `src/runtime-link.ts` |
| [x] | 12 | 11 | **La poda se conserva, y se mide.** Una app que no usa signals derivadas no emite `computed.js`. Se cuenta sobre el `dist`. Criterio 10 | `vite` | `src/runtime-link.ts` |
| [x] | 13 | 11 | **`FUD0806`:** una pieza con el token de construcción dentro rompe el build (§4.13). Criterio 11 | `vite` | `src/runtime-link.ts` |

> **Hito en el navegador (criterio 12).** Una ruta que hidrata descarga sus piezas desde
> `/_fudic/…` y **ni una** desde `assets/`.
>
> **Hito conseguido, visto en Chrome.** La ruta `/reactividad` de `examples/basic`: 15
> peticiones, 10,5 kB, y **todo** lo del framework desde `/_fudic/0.0.1/…`. De `assets/` solo
> baja la hoja de tokens. La cadena de iniciadores enseña además lo que la fase 5 tiene que
> quitar: `main → core/hydrate → core/signal → core/tracking`, tres niveles de descubrimiento.
>
> En el `dist`: en `examples/basic` ya no queda
> **ni un** fichero de framework en `assets/`: lo que hay son seis trozos de la aplicación y
> 34 piezas bajo `_fudic/0.0.1/`. El arranque bajó de 8 405 a 1 836 bytes, y el trozo de un
> componente nombra las URLs de sus piezas **directamente**, sin fichero intermedio.
> En `examples/workspace` las dos apps enlazan **las mismas nueve piezas, byte a byte
> idénticas** entre ellas y con lo que publicó el framework.

---

## Fase 4 — el coordinador (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 14 | 13 | **(rojo primero)** **El arranque se parte en coordinador y piezas.** Un módulo por ruta que importa sus piezas y las arranca con los parámetros de esta app. Único sitio donde viven la carpeta y el id. Criterio 13 | `vite` | `src/coordinator.ts` |
| [x] | 15 | 14 | **La tabla de correspondencias** (§4.4): qué piezas nombra una ruta sale de hechos que el compilador ya tiene. Formularios y reactividad **no** están en ella: los arrastra el trozo de cada componente | `vite` | `src/coordinator.ts` |
| [x] | 16 | 15 | **El arranque mínimo** (§4.4.1). El adaptador del DOM, el signal, el seguimiento y el puente del fabricado salen de la carga y pasan al calentado, que ya pide el trozo del componente cuando entra en pantalla. Son 2 328 de 9 900 bytes que quien entra y sale no paga. **Aquí se resuelve si `core/live` es opcional de verdad** o si hay que corregir §4.3.1. Criterio 34 | `core` · `vite` | `src/hydrate/install.ts` · `src/coordinator.ts` |
| [x] | 17 | 16 | **Se nombra por su contenido, y el orden va escrito.** Dos rutas con la misma necesidad, el mismo fichero. Una que no hidrata, sin coordinador. El orden entre piezas lo escribe el generador. Criterios 14, 16 | `vite` | `src/coordinator.ts` |
| [x] | 18 | 17 | **El coordinador pesa menos de 1 kB**, y es una comprobación y no una aspiración. Criterio 15 | `vite` | `src/coordinator.ts` |

> **Hito en el navegador (criterios 17 y 34).** Dos rutas, una con inyección y otra sin: las
> piezas de inyección solo en la primera. Y una ruta que hidrata en la que **no se toca nada**:
> 7 200 bytes, no 9 900.
>
> **Hito conseguido, visto en Chrome** en la ruta de hidratación de `examples/basic`, y la
> pestaña de red lo enseña en tres momentos distintos, que es lo que lo hace una medida y no
> una impresión:
>
> - **Al cargar, con nada que hidratar a la vista:** ocho peticiones —el documento, la hoja de
>   tokens, el arranque del worker, el coordinador, la derivación de URLs, la hidratación, su
>   registro y el canal de calentado— y **ni el adaptador del DOM, ni el signal, ni el
>   seguimiento, ni el puente del fabricado**.
> - **Cuando el primer componente entra en pantalla:** llegan las tres que el calentado
>   anticipa —adaptador, signal y seguimiento—, las tres a la vez y fuera de todo gesto.
> - **Al hacer clic:** solo el trozo del componente y lo suyo —la clase base, la suscripción y
>   el efecto—. Las piezas del calentado ya estaban, así que el gesto no espera por ninguna.

---

## Fase 5 — inline o fichero, y la política de carga (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 19 | 18 | **El interruptor del layout.** `fudic:runtime` como fichero, `fudic:runtime?inline` dentro de la página con `nonce`. Por defecto fichero. Lo mismo para `fudic:styles`. Criterio 18 | `compiler` | `src/emit/parts.ts` |
| [x] | 20 | 19 | **La precarga que antes no se podía escribir.** Un `modulepreload` por pieza de la ruta. Es lo que quita la cadena (§4.5). Criterio 18 | `vite` · `compiler` | `src/emit/parts.ts` |
| [x] | 21 | 19 | **`FUD0803`:** `?inline` con una política que no declara `nonce`. Criterio 19 | `vite` | `src/diagnostics.ts` |
| [x] | 22 | 20 | **Con worker, se cachea lo que la página pide cuando lo pide** (§4.5.1). Nada por adelantado: `/_fudic/**` se sirve cache-first desde su propia caché y la entrada se escribe en la primera petición. **El requisito original decía lo contrario** —precachear en el `install` todo lo que la app enlaza— y se cambió con la red delante: 54 peticiones y 64 kB en la primera visita a una ruta que solo hidrata es el monolito otra vez. Criterio 35 | `vite` · `transport` | `src/bootstrap.ts` · `src/router.ts` |
| [ ] | 23 | 22 | **El límite de peticiones, y el paquete por conjunto** (§4.5.2). Más de `N` piezas en una ruta → un paquete con todas; por debajo, sueltas. `N` por defecto 10, y es **la única opción** que gana `FudicOptions`. El paquete es por **conjunto de piezas y jamás por ruta**: dos rutas con el mismo conjunto, el mismo fichero, y dos apps también. Se emiten las dos formas. Criterio 36 | `vite` | `src/coordinator.ts` |

> **Hito en el navegador (criterios 20 y 36).** Slow 3G, la misma ruta con las dos formas:
> las piezas empiezan todas a la vez y ninguna espera a otra. Y el límite decidiendo: bajarlo
> a uno empaqueta todo, subirlo a cien no empaqueta nada.

---

## Fase 6 — la caché compartida (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 24 | 13 | **La caché de origen, y la comprobación que la protege.** `fudic-runtime-<version>`, sin `app` en el nombre. Que el purgado de BUG-33 no la toque ya es cierto — `isStaleCache` solo reconoce `shell-`/`routes-`/`pages-`/`data-` —, así que lo que falta es fijarlo. Criterio 21 | `transport` | `src/store.ts` |
| [ ] | 25 | 24 | **Quién la borra.** Cada worker escribe su marca fechada al activarse y borra las versiones cuyas marcas hayan caducado todas. Sin coordinación entre apps, sin registro aparte. Reloj inyectado. Criterio 22 | `vite` · `transport` | `src/bootstrap.ts` |

> **Hito en el navegador (criterio 23).** `Application → Cache Storage` con la caché, sus
> piezas y una marca por app. Se abre la segunda app y no trae ni un byte de framework.

---

## Fase 7 — el worker (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 26 | 25 | **El worker enlaza `ssr` y `di` en vez de empaquetarlos**, por el camino que ya usa para los trozos de ruta — el que BUG-03 **no** prohíbe. `@fudic/transport` no se mueve: es quien abre la caché y quien enlaza. Criterio 24 | `vite` · `transport` | `src/bootstrap.ts` |
| [ ] | 27 | 26 | **La batería de navegación de SDD-20 pasa sin tocarla**, offline incluido. Criterio 25 | `transport` | — |

> **Hito en el navegador (criterio 26).** Red cortada y la página se renderiza.

---

## Fase 8 — lo que quedaba suelto (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 28 | 18 | **Sin `sw.json` no hay `boot`.** Ni fichero ni etiqueta. Hoy toda página pide un módulo cuyo contenido es `export {};`. Criterio 27 | `vite` | `src/plugin.ts` |
| [ ] | 29 | 13 | **`FUD0800`: la librería manda.** Sube de warning a error respecto a SDD-43 §4.7. `FUD0762` queda superado. Criterio 28 | `vite` | `src/peer-check.ts` |
| [ ] | 30 | 18 | **Un recorrido por gesto, no uno por tag.** Índice `id → Element` y `tag → Element[]`, **por turno y no global**. El orden de SDD-17 no se toca. Criterio 29 | `core` | `src/hydrate/registry.ts` |

> **Hito en el navegador (criterio 30).** El INP de la ruta más pesada de `examples/basic`,
> antes y después, anotado aquí. No tiene que bajar; tiene que no subir.

---

## Fase 9 — la evidencia y el cierre (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 31 | todas | **La evidencia, entera.** `examples/workspace` en un origen: la segunda app no descarga ni un byte de framework que la primera ya trajo. Y el despliegue: se reconstruye `app-1` con un id nuevo y de `/_fudic/` no se vuelve a pedir nada. Criterios 31, 32 | `examples` | `examples/workspace/*` |
| [ ] | 32 | 31 | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`, y los 36 criterios de §6 verdes — con los tres de «rojo primero» (2, 10, 14) vistos fallar antes. SDD-45 a `Hecho` en [INDEX.md](./INDEX.md), tabla y registro | — | [INDEX.md](./INDEX.md) |

> **Visto en la fase 3 y que la 31 tiene que resolver:** el servidor de `examples/workspace`
> monta `/admin/` sobre el `dist` de admin y `/` sobre el de tienda, así que una petición de
> `/_fudic/…` cae siempre en el montaje de tienda. Funciona mientras las dos apps enlacen el
> mismo conjunto —hoy lo hacen—, y da 404 en cuanto admin enlace una pieza que tienda no.
> Cada `dist` lleva sus piezas bajo `_fudic/`, que es lo que §4.2 pide y lo que hace que un
> `dist` sea desplegable solo; lo que falta es que **el despliegue** las funda en la raíz del
> origen, y `serve.mjs` es donde eso se representa.
