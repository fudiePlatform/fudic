# Hallazgos por paquete

Resumen de la conversación del 2026-11-26 sobre [hallazgos-fudic.md](hallazgos-fudic.md): la
clasificación por paquete, cómo se van a arreglar y por qué los tests al 100 % no los cazaron.
Del 84 al 106, los que salieron al terminar los tutoriales, se añadieron el 2026-11-27.

Clasifica también los de [hallazgos-cli.md](hallazgos-cli.md), que tiene su propia numeración.
Para distinguirlos, aquí llevan delante «CLI-»: «CLI-6» es el nº 6 de `hallazgos-cli.md`, y un
número solo, como «6», es el de `hallazgos-fudic.md`.
Es un borrador: se rehará cuando cambien los hallazgos.

## Avance

Se actualiza con cada arreglo. En las tablas de la clasificación, ✅ es resuelto y ◐ resuelto
en su paquete, a falta de la parte de otro. Un hallazgo repartido cuenta en cada paquete donde
aparece.

| Paquete | Total | ✅ | ◐ | Quedan |
|---|---|---|---|---|
| @fudic/compiler | 24 | 2 | 1 | 21 |
| @fudic/language-core: proyección y tipos | 4 |  |  | 4 |
| @fudic/typecheck | 1 |  |  | 1 |
| @fudic/vite | 21 | 2 |  | 19 |
| @fudic/config | 5 |  |  | 5 |
| @fudic/server | 4 |  |  | 4 |
| @fudic/transport | 5 |  |  | 5 |
| @fudic/core | 3 |  |  | 3 |
| @fudic/dom | 2 |  |  | 2 |
| @fudic/api | 5 |  |  | 5 |
| @fudic/forms | 4 |  |  | 4 |
| @fudic/http | 3 |  |  | 3 |
| @fudic/di | 1 |  |  | 1 |
| @fudic/testing | 7 |  |  | 7 |
| @fudic/spec y @fudic/workbench | 4 |  |  | 4 |
| @fudic/cli | 35 | 1 |  | 34 |
| @fudic/mcp | 4 |  |  | 4 |
| @fudic/language-server | 3 |  |  | 3 |
| @fudic/vscode | 1 |  |  | 1 |
| examples/basic | 2 |  |  | 2 |
| Documentación | 12 |  |  | 12 |
| **Total** | **150** | **5** | **1** | **144** |

## Cómo se arreglan

Sin SDD ni BUG-NN. Se coge un paquete y se arreglan todos los suyos, uno a uno:

1. Se arregla.
2. Pedro lo valida con un ejemplo.
3. Con su ok, se escriben los tests y se comprueba que la cobertura de ese fichero no baja.
4. Al terminar el paquete (o los paquetes), se pasa su regresión entera.

Cada hallazgo se marca en su fichero (`hallazgos-fudic.md` o `hallazgos-cli.md`) con
«Resuelto el <fecha>», como el nº 37 o el CLI-14.

Tres cosas a tener en cuenta:

- **Hallazgos repartidos.** Cuando un hallazgo toca dos paquetes, aquí va en el del arreglo
  principal, y la otra parte se marca con →. No se da por resuelto hasta cerrar todas sus partes:
  5 (`config` y `vite`), 9 (`compiler` y `dom`), 10 (`compiler` y `language-core`),
  20 (`transport`, `cli` y la guía del MCP), 40 (`api` y `dom`), 50 (`compiler` y `server`),
  54 (`compiler` y `testing`), 68 (`compiler` y `core`), 73 (`compiler` y `vite`), 85 (`compiler` y `vite`), 86 (`testing`
  y `cli`), 87 (`core` y `compiler`), 88 (`testing` y `cli`), 95 (`cli`, `config` y `vite`),
  96 (`config` y `vite`), 108 (`compiler` y `vite`), 99 (`language-server` y `compiler`), 100 (`config` y `vite`), CLI-3
  (`cli` y `config`), CLI-26 (`cli` y `forms`) y CLI-30 (`cli` y `vite`).
- **Decisiones pendientes de Pedro.** Hay que tomarlas antes de empezar el paquete (ver más abajo).
- **Orden.** Primero un paquete pequeño, para fijar el ritmo (`api` o `transport`). Después `vite`,
  que es lo que más se nota en los tutoriales.

No cuentan: el 2 y el 32 (descartados), el 28 y el 29 (duplicados del 5 y del 9), el 37 (resuelto) y el
CLI-14 (resuelto). Del CLI-20 solo queda la parte que no se resolvió.

## Prioridad para el lanzamiento

Lo que Pedro considera primordial (2026-11-27): lo que nota quien prueba Fudic por primera vez.
Para él es el 75 % del trabajo que queda; el resto de hallazgos va después.

| Orden | Qué | Hallazgo |
|---|---|---|
| 1 | Los tutoriales llevan `sw.json` y solo lo necesita `offline` | Contenido de `tutorials/` |
| 2 | La guía de estilos (774 KB) va en los 79 tutoriales, y StackBlitz clona el repo entero al abrir uno | Contenido de `tutorials/` |
| 3 | El HTML no sale comprimido: es lo que impide nacer con 100 en móvil | 1 |
| 4 | La fuente de la guía pesa 740 KB en dos ficheros | CLI-23 |
| 5 | `fudic new` crea un «Home» vacío | CLI-33 |
| 6 | Ninguna página estática da un `304`, con el nonce de por medio | 107 |
| 7 | Con varias apps, fuera de `/` el runtime sale sin `Cache-Control` | 83 |
| 8 | `fudic dev` y `fudic preview` en `web/` no sirven solo sus tres apps | CLI-8 (con CLI-2 y CLI-5) |
| 9 | No hay `fudic build` para las mismas apps | CLI-11 |
| 10 | La plantilla trae `Strict-Transport-Security` y Fudic no sirve HTTPS | CLI-27 |
| 11 | HTTP Observatory echa en falta `X-Content-Type-Options` | 95 |

## Clasificación

### @fudic/compiler (24)

| Nº | Hallazgo |
|---|---|
| ✅ 3 | `<link href>` con nombre de paquete; `@@` en un atributo del head |
| 6 | `style:prop` se acepta y no se emite (→ documentación: los mensajes de FUD0915 y FUD0132) |
| 7 | Handler delegado que llama a una prop función: el chunk sale roto |
| 8 | Una ruta no puede pasar una prop función |
| 9 | Booleano en `aria-*` (→ `dom` en el cliente) |
| 10 | `@evento` en el tag de un hijo recibe el `CustomEvent`, pieza 1 (→ `language-core`) |
| 11 | `@import` en el `<head>`: error de Oxc y sin escape |
| 50 | Script en línea con nonce para el tema (→ `server`: CSP) |
| ✅ 51 | `@@` en una propiedad cuenta como concatenación |
| 54 | FUD1440 en los snippets (→ `testing`: `renderSnippet`) |
| 59 | Encabezado dentro de un componente: sin aviso, y la bombilla lo afianza |
| 60 | Propiedad del DOM en una página estática: no se asigna nunca (la página se hidrata para asignarla) |
| 61 | Spread en una ruta: llega vacío |
| 65 | FUD1440 pide la hoja de la otra lista para un `<li>` |
| 66 | `bus:` que nadie anuncia: sin aviso |
| 68 | Un componente que solo lee un store no se hidrata (→ `core`) |
| ◐ 73 | `summary` en una ruta: `summaryEntriesOf` sin importar (→ `vite`: el error del render, con el 78) |
| 82 | `fud-data` no sale si solo el `@code` lee `data` |
| 84 | Un signal dentro de un servicio inyectado no repinta la plantilla |
| 85 | `FUD0680` y `FUD0684` no salen en el editor; el span de `FUD0680` cae en la página (→ `vite`: la pila) |
| 91 | Una página no puede usar un custom element que no sea un `.fud` (se hace; la forma, al implementarlo) |
| 94 | `FUD0907` sobre `window`: un mensaje propio para los globales del navegador (→ documentación: `FUD0907.md`) |
| 97 | Un `<script src>` en el cuerpo sale sin nonce (lleva el nonce siempre) |
| 108 | Marcadores `fudic:guide` (con `?inline`) y `fudic:favicon` en el layout (→ `vite`) |

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

### @fudic/vite (21)

| Nº | Hallazgo |
|---|---|
| ✅ 1 | La preview no comprime |
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
| 78 | La excepción de un handler o de un `load` no sale en la terminal (con la parte del 73) |
| 80 | «Cannot GET» de Connect sin `Accept: text/html` |
| ✅ 83 | `originRuntime` no aplica `assets.headers` en una app con `base` |
| 89 | No ve un catálogo que no existía cuando compiló la página |
| 92 | El id del build no cambia con la línea `load` ni con `sw.headers` |

### @fudic/config (5)

| Nº | Hallazgo |
|---|---|
| 4 | `"guide": { "preload": [...] }` |
| 5 | Plantilla de `assets.headers`, varias rutas por bloque, bloque vacío como error, aviso por la coma |
| CLI-9 | `assets.headers` de `fudic new` deja sin caché lo que emite Fudic (se arregla con el 5) |
| 96 | `Permissions-Policy` solo se comprueba por su sintaxis (→ `vite`: `fudic dev` manda el valor con `FUD1543`) |
| 100 | Un `baseline` mal escrito trae un `FUD0726` falso; `"2024"` entre comillas (→ `vite`: el `FUD1524` de antes de fallar) |

### @fudic/server (4)

| Nº | Hallazgo |
|---|---|
| 12 | Una función que monte las tres piezas en su orden (→ documentación) |
| 16 | `paramFallback: 'notFound'` no se respeta en el servidor |
| 50 | El nonce del script en línea en la CSP (→ `compiler`) |
| 107 | Ninguna respuesta da un `304`: sin `ETag`, y con el nonce de por medio |

### @fudic/transport (5)

| Nº | Hallazgo |
|---|---|
| 14 | El HTML de `page persist` no caduca nunca |
| 17 | Un fallo de datos sin red marca la ruta como rota |
| 18 | `network-only` guarda igualmente las respuestas `200` |
| 20 | ¿Los patrones de `sw.json` llevan el `base`? (→ `cli`; → documentación: la guía del MCP) |
| 81 | Una página `sw` guarda los datos por ruta y no por URL |

### @fudic/core (3)

| Nº | Hallazgo |
|---|---|
| 22 | `strategy()` sigue exportado y nadie lo usa (el resto del 22, en documentación) |
| 39 | `Task.progress` no vuelve a `null` al terminar una llamada |
| 87 | Sin un componente dueño, la semilla `fud-di` no llega a la raíz (→ `compiler`: un token declarado en el `@code` no va al módulo IoC) |

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

### @fudic/forms (4)

| Nº | Hallazgo |
|---|---|
| 25 | `setFormValue(String(value))` para un `File`, una lista o un `bool` |
| 26 | `form:=` no envía nada sin JavaScript (decisión) |
| 41 | `Progress` y `Patch` no se exportan |
| 104 | Una regla `runs remote` no se ejecuta en un test con el formulario solo (decisión) |

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

### @fudic/testing (7)

| Nº | Hallazgo |
|---|---|
| 54 | `renderSnippet` compila el snippet como si fuera un componente |
| 70 | `mount` con `via: 'client'` sigue pasando por el servidor; un fixture sin una prop obligatoria |
| 86 | `mount` de un componente que inyecta un servicio provisto da `FUD0680` aunque el test dé `providers` (→ `cli`: el test de `fudic g component` y el de `fudic g service`) |
| 88 | `visit('/')` en una app con varios idiomas dice que no hay ruta (→ `cli`: `fudic add i18n` y los tests que ya existen) (decisión) |
| 102 | `visit` lanza con una URL que no existe, en vez de pintar el 404 |
| 103 | Faltan `getAll…` y `queryAll…`; `data` de `visit` no está tipado |
| 106 | `visit` con `data` da 500 si la página tiene un campo `later` |

### @fudic/spec y @fudic/workbench (4)

| Nº | Hallazgo |
|---|---|
| 31 | El workbench se queda con un `.fudspec` a medio escribir |
| 45 | `selfTest` se exige y no se ejecuta |
| 46 | Guardar `bench.js` no vuelve a ejecutar; `pass: false` en un `given` o un `when` no para el criterio |
| 105 | El primer `fudic spec` de un proyecto nuevo acaba en error (Vite optimiza a mitad de la ejecución) |

### @fudic/cli (35)

| Nº | Hallazgo |
|---|---|
| 20 | `fudic g app` escribe `"/assets/**"` sin el `base` |
| 30 | `fudic spec` y `fudic test` no escriben en el `.fudlog` (→ `history`) |
| 90 | `fudic translate` no avisa de un `t()` con una variable, y borra su traducción |
| 95 | La plantilla de `page.headers` y `assets.headers` sin `X-Content-Type-Options: nosniff` (→ `config`: la línea en `KNOWN`; → `vite`: la pila de `FUD1543` en el build) |
| CLI-1 | `fudic new` dentro de un repo git hace su propio `git init` |
| CLI-2 | `fudic new --workspace` dentro de un workspace pnpm crea uno anidado |
| CLI-3 | Sin Service Worker, el README y `page.headers` siguen hablando de él (→ `config`: `headers/templates.ts`) |
| CLI-4 | Recomienda `pnpm dev` y no sus comandos; con `--pm npm`, `npm dev` |
| CLI-5 | `--project` escoge un proyecto de otro workspace; valida proyectos que el comando no toca |
| CLI-6 | `g page --layout @web/ui/…` revienta con `ENOENT`; la ruta relativa escribe un `href` frágil; títulos como «Getting-started» |
| CLI-7 | No hay generador para la hoja de un layout |
| ✅ CLI-8 | `fudic preview` y `fudic dev` en una app sirven todas las del monorepo |
| CLI-10 | No hay generador para una hoja de `styles` |
| CLI-11 | No hay `fudic build` |
| CLI-12 | No hay generador para un middleware ni para una regla |
| CLI-13 | La ayuda general no lista `generate pipe` ni `check`; `fmt` no nombra los `.fudapi` |
| CLI-15 | `fudic --version` enseña la ayuda entera |
| CLI-16 | `g api` sobre un fichero que no existe dice que no es una ruta |
| CLI-17 | `--force --dry-run` sobre un fichero idéntico enseña un cambio vacío |
| CLI-18 | `fudic accept --dry-run` dice `(in )` |
| CLI-19 | `g api` añade `@fudic/http` con versión fija dentro de un workspace, y fuera de orden |
| CLI-20 | `fudic new` solo configura el MCP para Claude Code (la parte que queda) |
| CLI-21 | `g component` y `g page` no aceptan `--purpose` |
| CLI-22 | `g error-page --layout` resuelve la ruta de tres formas; «Created … in » |
| CLI-23 | La guía de `fudic new` trae una fuente de 344 KB y su cursiva de 379 KB |
| CLI-24 | `g api` y `g page --server` instalan `@fudic/http` sin decirlo |
| CLI-25 | `g style` deja la hoja en la raíz del proyecto; «Created … in » |
| CLI-26 | `g form` y `add forms` no añaden `@fudic/http` (→ `forms`: o que la declare) |
| CLI-27 | `fudic preview` no sirve HTTP/2 ni HTTPS, y se cuelga si la app sirve HTTPS |
| CLI-28 | El proxy de `fudic dev` y `fudic preview` no aborta la petición cuando el navegador la cancela |
| CLI-29 | `fudic add i18n` deja el `lang="en"` del layout |
| CLI-30 | `fudic add i18n` no escribe `site`; reescribe el formato de `fudic.json` (→ `vite`: la pila de `FUD1027`) |
| CLI-31 | `fudic preview` anuncia un puerto que otro proceso tiene en IPv6 |
| CLI-32 | `fudic g showcase` en una app dice «Showcase of  in» |
| CLI-33 | La página que crea `fudic new` es un «Home» vacío |

### @fudic/mcp (4)

| Nº | Hallazgo |
|---|---|
| 47 | Diff vacío, `next` que no corresponde, ejecuciones parciales, los tokens sin acordar |
| 48 | El hash del aspecto no incluye las hojas de la guía ni los tokens |
| 49 | Solo encuentra el proyecto por la carpeta en la que arranca |
| 101 | `fudic_generate` acepta un nombre sin el prefijo; un test cambiado en la fase `view` sin aviso |

### @fudic/language-server (3)

| Nº | Hallazgo |
|---|---|
| 33 | El snippet `load` ofrece `isr` |
| 98 | `FUD1547` no ofrece quitar lo que debilita la política; `FUD1545` sale una vez en el build y dos en el editor |
| 99 | `FUD1555` no ofrece «Explain» ni «Use textContent» (→ `compiler`: `FUD1140` con `signal(trustedHtml(""))`) |

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
| 93 | El mensaje de FUD1548 y el comentario de `sw.headers` que escribe `fudic new`: el service worker se instala, pero no pinta |
| 94 | Una línea en `FUD0907.md` sobre los globales del navegador |

## Decisiones pendientes

| Nº | Paquete | Qué hay que decidir |
|---|---|---|
| 20 | `transport` | ¿Los patrones de `sw.json` van con `base` o sin él? |
| 26 | `forms` | ¿`form:=` tiene respaldo sin JavaScript? |
| 40 | `api` y `dom` | ¿Un campo `html` llega marcado como de confianza? |
| 45 | `spec` | ¿Se ejecuta `selfTest` o se deja de exigir? |
| 46 | `workbench` | ¿Un `pass: false` para el criterio? |
| 76 | `http` | ¿El cliente sigue la redirección solo, o hace falta `error-pages`? |
| 88 | `testing` | ¿`visit('/')` con varios idiomas responde como una redirección, o acepta el idioma como opción? |
| 95 | `server` | ¿Avisar cuando llegan cabeceras de un proxy y `trustProxy` está apagado? |
| 100 | `config` | ¿`"2024"` entre comillas vale como año, o lo dice `FUD0725`? |
| 104 | `forms` | ¿`$validate({ server: true })` en un test pregunta al servidor en memoria, o la regla remota avisa de que no se ejecuta? |
| CLI-11 | `cli` | ¿Hay un `fudic build`, o el build sigue siendo el script de Vite? |
| CLI-20 | `cli` | ¿Una opción de `fudic new` o un `fudic add agent <entorno>`? ¿Para qué agentes? |
| CLI-23 | `cli` | ¿La guía trae la fuente recortada, o la del sistema? |
| CLI-26 | `cli` y `forms` | ¿`g form` añade `@fudic/http`, o `@fudic/forms` la declara como dependencia? |
| CLI-27 | `cli` | ¿`fudic preview` sirve HTTPS y HTTP/2, o solo detecta el backend en HTTPS y lo dice? |

## Esfuerzo estimado

Estimado a partir del texto de cada hallazgo, sin haber abierto el código de cada uno.

- **Fáciles** (un cambio pequeño y localizado): 1, 5, 9, 12, 13, 14, 16, 18, 19, 21, 22, 23, 25,
  33, 34, 36, 39, 41, 42, 43, 44, 49, 51, 54, 57, 73, 74, 77, 78, 79, 80, 83, 90, 94, 95, 96,
  98, 99, 100, 103 y toda la documentación. De la CLI: CLI-1, CLI-3, CLI-4, CLI-10, CLI-13,
  CLI-15, CLI-16, CLI-17, CLI-21, CLI-24, CLI-26, CLI-28, CLI-29, CLI-30 y CLI-31.
  - El nombre vacío en la salida (CLI-18, CLI-25, CLI-32 y el «in » del CLI-22): seguramente
    una sola causa.
- **Medianos** (hay que entender bien una pieza):
  - El watcher de `fudic dev` (31, 62, 63, 67, 71, 89): seguramente comparten causa.
  - Diagnósticos propios en vez de errores de TypeScript (58, 59, 64, 65, 66), y diagnósticos
    que solo salen en el emit (85).
  - Bugs del compilador: 3, 7, 8, 11, 56, 61, 82.
  - `visit` y `mount` de `@fudic/testing` (86, 88, 102, 106).
  - La CLI dentro de un monorepo que no creó ella (CLI-2, CLI-5, CLI-6, CLI-8, CLI-19,
    CLI-22): comparten causa, y es lo que más rodeos ha costado en la web (el CLI-6 se repitió
    con cada capítulo y cada categoría de tutoriales).
  - Generadores nuevos: CLI-7, CLI-11, CLI-12, CLI-20.
  - La página de bienvenida de `fudic new`: CLI-33.
  - Otros: 4, 17, 30, 47, 48, 69, 70, 72, 87, 92, 97, 101, 104, CLI-23.
  - Hay que investigar antes de saber cuánto cuestan: 35, 52, 75, 105.
- **Difíciles** (tocan el diseño): 6, 10, 15, 50, 53, 55, 68, 81, 84, 91, 107, 108, CLI-27.

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
- 87: la semilla `fud-di` de `ssr` frente al arranque de `core`, que solo la lee con dueños.
- 92: el id del build de vite frente a lo que hace el Service Worker (`fudic-routes.json`,
  `sw.headers`).

### 5. Condiciones reales que ningún test reproduce

Los tests corren en un proceso nuevo, con ficheros completos y entradas limpias.

- Ficheros escritos a medias: 31 y 67.
- Un `fudic dev` que lleva horas en marcha mientras cambian cosas: 62, 63, 71, 75 y 89.
- Cómo se lanza vite (52), qué hace Chrome (32, 92, 97), no tener red (17), pedir sin
  `Accept: text/html` (80), un proyecto sin la caché de Vite (105), un proxy delante (95).

### Dos agravantes

- **Los paquetes con más hallazgos no están al 100 %.** `compiler` (24) y `vite` (21), junto
  con `transport` (5), son los de la deuda heredada: ramas al 95,6, 83,1 y 83,8. `cli` (35)
  tampoco: tiene el mismo suelo de 80/80/75, con el 100 solo en algunos ficheros, aunque el
  CLAUDE.md no lo cuenta en la deuda heredada.
- **El único consumidor era `examples/basic`**, escrito por el mismo autor y del mismo modo. El 6
  lo dice tal cual: «ningún ejemplo lo usa, así que nadie lo había visto». Y el 87 no se vio
  porque la página `/di` del ejemplo tiene un componente dueño.

La cobertura sirve para lo que promete el CLAUDE.md: es una nota sobre el diseño (no sobran ramas
ni parámetros muertos), no una prueba de que el programa funcione.

## Lo que han aportado los tutoriales

Del 57 al 106 casi todos salieron de los tutoriales: unos cincuenta hallazgos en dos días (25 y
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
