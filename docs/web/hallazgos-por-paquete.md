# Hallazgos por paquete

Resumen de la conversación del 2026-11-26 sobre [hallazgos-fudic.md](hallazgos-fudic.md): la
clasificación por paquete, cómo se van a arreglar y por qué los tests al 100 % no los cazaron.
Es un borrador: se rehará cuando cambien los hallazgos.

## Cómo se arreglan

Sin un BUG-NN por hallazgo. Se coge un paquete y se arreglan todos los suyos de una vez. Al
terminar, cada hallazgo se marca en `hallazgos-fudic.md` con «Resuelto el <fecha>», como el nº 37.

Tres cosas a tener en cuenta:

- **Hallazgos repartidos.** Cuando un hallazgo toca dos paquetes, aquí va en el del arreglo
  principal, y la otra parte se marca con →. No se da por resuelto hasta cerrar todas sus partes:
  5 (`config` y `vite`), 9 (`compiler` y `dom`), 10 (`compiler` y `language-core`),
  20 (`transport`, `cli` y la guía del MCP), 40 (`api` y `dom`), 50 (`compiler` y `server`),
  54 (`compiler` y `testing`) y 68 (`compiler` y `core`).
- **Decisiones pendientes de Pedro.** Hay que tomarlas antes de empezar el paquete (ver más abajo).
- **Orden.** Primero un paquete pequeño, para fijar el ritmo (`api` o `transport`). Después `vite`,
  que es lo que más se nota en los tutoriales.

No cuentan: el 2 (descartado), el 28 y el 29 (duplicados del 5 y del 9) y el 37 (resuelto).

## Clasificación

### @fudic/compiler (19)

| Nº | Hallazgo |
|---|---|
| 3 | `<link href>` con nombre de paquete; `@@` en un atributo del head |
| 6 | `style:prop` se acepta y no se emite (→ documentación: los mensajes de FUD0915 y FUD0132) |
| 7 | Handler delegado que llama a una prop función: el chunk sale roto |
| 8 | Una ruta no puede pasar una prop función |
| 9 | Booleano en `aria-*` (→ `dom` en el cliente) |
| 10 | `@evento` en el tag de un hijo recibe el `CustomEvent`, pieza 1 (→ `language-core`) |
| 11 | `@import` en el `<head>`: error de Oxc y sin escape |
| 32 | `img` con `loading="lazy"`: `aspect-ratio` o documentarlo (→ `cli`: `img.css`) |
| 50 | Script en línea con nonce para el tema (→ `server`: CSP) |
| 51 | `@@` en una propiedad cuenta como concatenación |
| 54 | FUD1440 en los snippets (→ `testing`: `renderSnippet`) |
| 59 | Encabezado dentro de un componente: sin aviso, y la bombilla lo afianza |
| 60 | Propiedad del DOM en una página estática: no se asigna nunca |
| 61 | Spread en una ruta: llega vacío |
| 65 | FUD1440 pide la hoja de la otra lista para un `<li>` |
| 66 | `bus:` que nadie anuncia: sin aviso |
| 68 | Un componente que solo lee un store no se hidrata (→ `core`) |
| 73 | `summary` en una ruta: `summaryEntriesOf` sin importar |
| 82 | `fud-data` no sale si solo el `@code` lee `data` |

### @fudic/language-core: proyección y tipos (4)

| Nº | Hallazgo |
|---|---|
| 10 | Tipar el handler de un `@evento` (pieza 2) |
| 56 | Los argumentos con nombre de un snippet acaban en el parámetro equivocado |
| 58 | Errores con los tipos internos `$Missing`, `$Slots` y `$Scalar` |
| 64 | Leer un `ref` en la plantilla da un error que manda al `.fudapi` |

### @fudic/typecheck (1)

| Nº | Hallazgo |
|---|---|
| 57 | FUD1152 con `<` sobre un `const` cuyo tipo es un literal |

### @fudic/vite (19)

| Nº | Hallazgo |
|---|---|
| 1 | La preview no comprime |
| 4 | Precargar las fuentes de la guía (→ `config`) |
| 5 | Falso positivo de FUD1552 en `isHashedName`; que `/_fudic/` sea de Fudic (→ `config`) |
| 13 | Los diagnósticos de `sw.json` se pierden |
| 15 | `"dev": "preview"` no pinta |
| 19 | Cualquier opción de `load` anula los `defaults`; nadie lee la opción `prerender` |
| 52 | `window is not defined` si se lanza vite por su ruta |
| 53 | Los componentes de `_error.fud` no se activan en el build |
| 55 | Colorear el código (pospuesto) |
| 62 | Un `.fudapi` nuevo no se ve hasta reiniciar |
| 63 | Componentes nuevos dan errores falsos hasta reiniciar |
| 67 | Se queda con un `.fud` o un `.fudapi` a medio escribir |
| 69 | Un componente creado en el navegador no adopta su `<style>` en dev |
| 71 | Las hojas de `fudic.json` y de la guía no se recargan |
| 72 | FUD0744 y FUD0890 solo salen al pedir la página, con la pila de Vite |
| 75 | Quitar un `required` corta la página sin decir nada |
| 78 | La excepción de un handler o de un `load` no sale en la terminal |
| 80 | «Cannot GET» de Connect sin `Accept: text/html` |
| 83 | `originRuntime` no aplica `assets.headers` en una app con `base` |

### @fudic/config (2)

| Nº | Hallazgo |
|---|---|
| 4 | `"guide": { "preload": [...] }` |
| 5 | Plantilla de `assets.headers`, varias rutas por bloque, bloque vacío como error, aviso por la coma |

### @fudic/server (3)

| Nº | Hallazgo |
|---|---|
| 12 | Una función que monte las tres piezas en su orden (→ documentación) |
| 16 | `paramFallback: 'notFound'` no se respeta en el servidor |
| 50 | El nonce del script en línea en la CSP (→ `compiler`) |

### @fudic/transport (5)

| Nº | Hallazgo |
|---|---|
| 14 | El HTML de `page persist` no caduca nunca |
| 17 | Un fallo de datos sin red marca la ruta como rota |
| 18 | `network-only` guarda igualmente las respuestas `200` |
| 20 | ¿Los patrones de `sw.json` llevan el `base`? (→ `cli`; → documentación: la guía del MCP) |
| 81 | Una página `sw` guarda los datos por ruta y no por URL |

### @fudic/core (2)

| Nº | Hallazgo |
|---|---|
| 22 | `strategy()` sigue exportado y nadie lo usa (el resto del 22, en documentación) |
| 39 | `Task.progress` no vuelve a `null` al terminar una llamada |

### @fudic/dom (2)

| Nº | Hallazgo |
|---|---|
| 9 | Serializar `aria-*` en el cliente |
| 40 | El tipo `html` pierde su marca de confianza (→ `api`) |

### @fudic/api (5)

| Nº | Hallazgo |
|---|---|
| 21 | El tipo de `paths` solo admite textos |
| 23 | Parámetros en kebab-case y argumentos que se llaman como una cláusula |
| 43 | FUD1063 sin valor; los sufijos de tamaño valen en cualquier número |
| 74 | `{min}` y `{max}` en `messages` pintan el nombre del tipo |
| 77 | FUD1080 dice «unknown rule» cuando falta `@fudic/forms` |

### @fudic/forms (3)

| Nº | Hallazgo |
|---|---|
| 25 | `setFormValue(String(value))` para un `File`, una lista o un `bool` |
| 26 | `form:=` no envía nada sin JavaScript (decisión) |
| 41 | `Progress` y `Patch` no se exportan |

### @fudic/http (3)

| Nº | Hallazgo |
|---|---|
| 42 | `ClientStep` y `ServerStep` se exportan y nadie los usa |
| 76 | `throw redirect()` no navega sin `error-pages`; `routes` debería ser opcional |
| 79 | Publica los `.map` sin `impl/` |

### @fudic/di (1)

| Nº | Hallazgo |
|---|---|
| 44 | `destroy` no llega a los hijos |

### @fudic/testing (2)

| Nº | Hallazgo |
|---|---|
| 54 | `renderSnippet` compila el snippet como si fuera un componente |
| 70 | `mount` con `via: 'client'` sigue pasando por el servidor; un fixture sin una prop obligatoria |

### @fudic/spec y @fudic/workbench (3)

| Nº | Hallazgo |
|---|---|
| 31 | El workbench se queda con un `.fudspec` a medio escribir |
| 45 | `selfTest` se exige y no se ejecuta |
| 46 | Guardar `bench.js` no vuelve a ejecutar; `pass: false` en un `given` o un `when` no para el criterio |

### @fudic/cli (3)

| Nº | Hallazgo |
|---|---|
| 20 | `fudic g app` escribe `"/assets/**"` sin el `base` |
| 30 | `fudic spec` y `fudic test` no escriben en el `.fudlog` (→ `history`) |
| 32 | `img.css` de la plantilla de la guía |

### @fudic/mcp (3)

| Nº | Hallazgo |
|---|---|
| 47 | Diff vacío, `next` que no corresponde, ejecuciones parciales, los tokens sin acordar |
| 48 | El hash del aspecto no incluye las hojas de la guía ni los tokens |
| 49 | Solo encuentra el proyecto por la carpeta en la que arranca |

### @fudic/language-server (1)

| Nº | Hallazgo |
|---|---|
| 33 | El snippet `load` ofrece `isr` |

### @fudic/vscode (1)

| Nº | Hallazgo |
|---|---|
| 34 | Quitar «Toggle Comment» |

### examples/basic (2)

| Nº | Hallazgo |
|---|---|
| 35 | Los diez tests e2e de `/ciclo` fallan |
| 36 | Falta el script `spec` |

### Documentación

Son textos que no cambian lo que hace el código:

| Nº | Qué |
|---|---|
| 24 | SDD con texto superado y sin la nota «Corregido por…»: 56, 60, 68, 69 y 20 |
| 22 | Diagnósticos desfasados (FUD0392, FUD0397, FUD0398, FUD1340, FUD1097), comentarios de `@fudic/vite` y de `bootstrap.ts`, TSDoc de `StrategyDecl.page` |
| 38 | TSDoc que no dice lo que hace el código: `date`, `tracking`, `emit`, `Task.progress`, `Control.dirty`, `Validator`, `token()`, `CookieOptions.secure` |
| 27 | `/formularios` y el README de `@fudic/forms` |
| 12 | El orden de los middlewares en `node-server.mjs` y en el README de `@fudic/server` |
| 46 | El comentario de `terms/given/route.js` y el README de `@fudic/terms` |
| 20 | `packages/mcp/guide/config.md:53` |
| 30 | El README de `@fudic/history`, si se decide decir quién apunta las ejecuciones |
| 43 | El `.md` de FUD1063 |
| 6 | Los mensajes de FUD0915 y FUD0132, que proponen `style:` mientras no se emita |

## Decisiones pendientes

| Nº | Paquete | Qué hay que decidir |
|---|---|---|
| 20 | `transport` | ¿Los patrones de `sw.json` van con `base` o sin él? |
| 26 | `forms` | ¿`form:=` tiene respaldo sin JavaScript? |
| 32 | `compiler` | ¿El compilador escribe `aspect-ratio`, o se documenta el aviso? |
| 40 | `api` y `dom` | ¿Un campo `html` llega marcado como de confianza? |
| 45 | `spec` | ¿Se ejecuta `selfTest` o se deja de exigir? |
| 46 | `workbench` | ¿Un `pass: false` para el criterio? |
| 60 | `compiler` | ¿Un aviso, o que la propiedad haga hidratable la página? |
| 76 | `http` | ¿El cliente sigue la redirección solo, o hace falta `error-pages`? |

## Esfuerzo estimado

Estimado a partir del texto de cada hallazgo, sin haber abierto el código de cada uno.

- **Fáciles** (un cambio pequeño y localizado): 1, 5, 9, 12, 13, 14, 16, 18, 19, 21, 22, 23, 25,
  33, 34, 36, 39, 41, 42, 43, 44, 49, 51, 54, 57, 73, 74, 77, 78, 79, 80, 83 y toda la
  documentación.
- **Medianos** (hay que entender bien una pieza):
  - El watcher de `fudic dev` (31, 62, 63, 67, 71): seguramente comparten causa.
  - Diagnósticos propios en vez de errores de TypeScript (58, 59, 64, 65, 66).
  - Bugs del compilador: 3, 7, 8, 11, 56, 61, 82.
  - Otros: 4, 17, 30, 47, 48, 69, 70, 72.
  - Hay que investigar antes de saber cuánto cuestan: 35, 52, 75.
- **Difíciles** (tocan el diseño): 6, 10, 15, 50, 53, 55, 68, 81.

## Por qué los tests al 100 % no los cazaron

La cobertura mide que **cada línea que existe se ejecutó** en algún test. No dice que el
resultado fuera correcto, ni que falte código. Casi todos los hallazgos encajan en alguna de estas
cinco causas.

### 1. No se puede cubrir el código que no existe

Es la causa más frecuente. La cobertura de ramas solo cuenta las ramas que alguien escribió.

- 6: `style:` no se emite. Ninguna línea lo emite, así que no hay nada sin cubrir.
- 73: el import de `summaryEntriesOf` solo se añade en un componente. El caso «ruta» no es una
  rama sin probar: no existe.
- 14: nadie lee `page.ttl`. 82: solo se mira la vista. 62, 63 y 71: el watcher no vigila los
  ficheros nuevos.
- 13: la línea que tira los diagnósticos de `sw.json` se ejecuta en todos los tests. Está cubierta
  precisamente porque los tira.

### 2. Una línea cubierta en un contexto cuenta como cubierta en todos

La cobertura cuenta líneas, no entradas.

- 8, 61, 73 y 82 funcionan en un componente y fallan en una ruta.
- 9: la regla de los booleanos de HTML está probada, pero nadie probó `aria-*`, que pasa por la
  misma línea.
- 56: los argumentos con nombre funcionaban con todo `string`, y el error solo aparece cuando los
  tipos difieren.

### 3. Los tests comprueban lo que hace el código, no lo que debería hacer

Un test escrito mirando la implementación fija lo que hay, esté bien o mal.

- 37: un test fijaba a propósito que la query string se perdía («rendered as it comes»).
- Si el SDD tenía el hueco, el test lo hereda. En el 9, el SDD decía «regla booleana de HTML», el
  código lo cumple y el test lo confirma.
- 24: SDD superados sin nota. 22 y 38: textos y TSDoc que ningún test lee.

### 4. Cada paquete al 100 % por separado, y los fallos están entre paquetes

Los tests unitarios aíslan, y lo que hay al otro lado lo pone un *fake* que codifica una
suposición. Muchos hallazgos viven en esa costura:

- 83: `originRuntime` de vite frente a las cabeceras de config.
- 53: `_error.fud` frente al bundle del cliente.
- 76: el cliente de las funciones frente al middleware `error-pages`.
- 81: la clave de caché del Service Worker frente a la query string.
- 12: el orden de los middlewares.
- 79: el `files` de `package.json`, que no está en `src/` y nunca entra en la cobertura.

### 5. Condiciones reales que ningún test reproduce

Los tests corren en un proceso nuevo, con ficheros completos y entradas limpias.

- Ficheros escritos a medias: 31 y 67.
- Un `fudic dev` que lleva horas en marcha mientras cambian cosas: 62, 63, 71 y 75.
- Cómo se lanza vite (52), qué hace Chrome (32), no tener red (17), pedir sin
  `Accept: text/html` (80).

### Dos agravantes

- **Los paquetes con más hallazgos no están al 100 %.** `vite` (19), `compiler` (19) y
  `transport` (5) son los de la deuda heredada: ramas al 83,1, 95,6 y 83,8.
- **El único consumidor era `examples/basic`**, escrito por el mismo autor y del mismo modo. El 6
  lo dice tal cual: «ningún ejemplo lo usa, así que nadie lo había visto».

La cobertura sirve para lo que promete el CLAUDE.md: es una nota sobre el diseño (no sobran ramas
ni parámetros muertos), no una prueba de que el programa funcione.

## Lo que han aportado los tutoriales

Del 57 al 82 casi todos salieron de los tutoriales: unos veinticinco hallazgos en dos días (25 y
26 de noviembre). Han funcionado por tres motivos:

- **Usan Fudic como lo usaría otra persona.** Parten de un proyecto nuevo con `fudic new`, con
  los paquetes instalados desde los tarballs. Así salió el 79, invisible dentro del monorepo.
- **Recorren combinaciones que nadie había probado.** Ruta frente a componente, `fudic dev` con
  cambios mientras está en marcha, `base`, query string. Son las causas 2, 4 y 5.
- **Cada comando y cada salida salen de una ejecución real.** Si algo no cuadra, no se puede
  disimular en la prosa: o se arregla el tutorial o se apunta el hallazgo.

Los capítulos de la Documentación encontraron otro tipo de error: contrastando el SDD o el TSDoc
con el código (del 13 al 24, y el 38). Las dos cosas se complementan.

**Su límite.** Un tutorial se comprueba una vez, el día que se escribe. Si un arreglo rompe
después la ruta de `summary`, nadie lo notará hasta que alguien vuelva a seguir ese tutorial.

**Propuesta.** Convertir la solución de cada tutorial (`tutorials/<slug>/`) en una prueba
automática: construirla e instalarla desde los tarballs, y comprobar que da lo que dice el
tutorial. Sería la batería de aceptación desde fuera que falta. Además, cada paquete que se
arregle tendría ya escrito el test que demuestra el arreglo. Lo que más ayudaría junto a eso:

- Casos escritos desde la spec y no desde el código, cruzando contextos: ruta y componente, dev y
  build, con `base` y sin él.
- Mutation testing, que dice qué tests ejecutan líneas sin comprobar nada.
