# SDD-45 — Tareas

> **SDD:** [SDD-45 — El runtime se publica en piezas](./SDD-45-runtime-publicado.md) ·
> [catálogo de piezas](./SDD-45-piezas.md)
> **Paquetes:** `@fudic/conventions` · `@fudic/core` · `@fudic/dom` · `@fudic/forms` ·
> `@fudic/di` · `@fudic/compiler` · `@fudic/vite` · `@fudic/transport` · `@fudic/ssr` ·
> `examples/basic` · `examples/workspace` · `examples/pieces-bench`
> **Rama:** `sdd-45-runtime-publicado`
> **Progreso:** 17 / 32
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

**Fase 4 a medias: falta la tarea 16 y el hito.** El coordinador existe y es por ruta. En
`examples/basic` salen **dos**: 321 bytes la ruta que solo hidrata y 572 la que además inyecta
—contra los 1 836 de un arranque único para toda la app—, y cada página nombra el suyo. La
tarea que queda es el **arranque mínimo** (§4.4.1): sacar de la carga el adaptador del DOM, el
signal, el seguimiento y el puente del fabricado, que son 2 328 bytes que quien entra y sale no
debería pagar. Eso toca `@fudic/core`, no el plugin, y es lo único que impide cerrar la fase.

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
| [ ] | 16 | 15 | **El arranque mínimo** (§4.4.1). El adaptador del DOM, el signal, el seguimiento y el puente del fabricado salen de la carga y pasan al calentado, que ya pide el trozo del componente cuando entra en pantalla. Son 2 328 de 9 900 bytes que quien entra y sale no paga. **Aquí se resuelve si `core/live` es opcional de verdad** o si hay que corregir §4.3.1. Criterio 34 | `core` · `vite` | `src/hydrate/install.ts` · `src/coordinator.ts` |
| [x] | 17 | 16 | **Se nombra por su contenido, y el orden va escrito.** Dos rutas con la misma necesidad, el mismo fichero. Una que no hidrata, sin coordinador. El orden entre piezas lo escribe el generador. Criterios 14, 16 | `vite` | `src/coordinator.ts` |
| [x] | 18 | 17 | **El coordinador pesa menos de 1 kB**, y es una comprobación y no una aspiración. Criterio 15 | `vite` | `src/coordinator.ts` |

> **Hito en el navegador (criterios 17 y 34).** Dos rutas, una con inyección y otra sin: las
> piezas de inyección solo en la primera. Y una ruta que hidrata en la que **no se toca nada**:
> 7 200 bytes, no 9 900.

---

## Fase 5 — inline o fichero, y la política de carga (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 19 | 18 | **El interruptor del layout.** `fudic:runtime` como fichero, `fudic:runtime?inline` dentro de la página con `nonce`. Por defecto fichero. Lo mismo para `fudic:styles`. Criterio 18 | `compiler` | `src/emit/parts.ts` |
| [ ] | 20 | 19 | **La precarga que antes no se podía escribir.** Un `modulepreload` por pieza de la ruta. Es lo que quita la cadena (§4.5). Criterio 18 | `vite` · `compiler` | `src/emit/parts.ts` |
| [ ] | 21 | 19 | **`FUD0803`:** `?inline` con una política que no declara `nonce`. Criterio 19 | `vite` | `src/diagnostics.ts` |
| [ ] | 22 | 20 | **Con worker, se precachea lo que la aplicación enlaza** (§4.5.1), ni más ni menos. A partir del `install`, toda petición de runtime es lectura de caché — y la granularidad deja de tener coste. Criterio 35 | `vite` | `src/bootstrap.ts` |
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
