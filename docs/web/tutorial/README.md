# Los tutoriales de Fudic en la web

Plan de la sección Tutoriales de la web pública: qué es, cómo es cada tutorial, el índice completo y
dónde vive el código. Rama de trabajo: `web-publica`. El plan general de la web está en
[../README.md](../README.md).

Este documento es **el control del índice**: para añadir, quitar o mover un tutorial se cambia aquí
primero, y el estado de cada uno se lleva en su fila.

## 1. Qué es

La Documentación explica cada concepto entero; los tutoriales lo **hacen**. Quien llega a Fudic no
aprende leyendo un capítulo: aprende cuando ejecuta i18n, arranca el service worker, monta un bus
entre dos componentes o crea su primer snippet y lo ve funcionar. Si no lo consigue, acaba leyendo el
código fuente y abandona.

Por eso:

- **No queda nada fuera.** El índice cubre todo lo que hace `examples/basic` (la referencia de lo
  que el framework sabe hacer), más `examples/i18n`, `examples/workspace`, todos los comandos de la
  CLI y el MCP.
- **Un tutorial, un concepto.** Se escribe para hacerse en **cinco minutos como mucho**: de 3 a 5
  pasos. Si un tema necesita más, se parte en dos. El tiempo es una regla de escritura, **nunca se
  muestra en la página**: un reloj estresa.
- **Se hace, no se lee.** Cada paso es un comando de la CLI o un fichero que el usuario copia, y el
  resultado que debe ver. La explicación a fondo se enlaza a la Documentación, no se repite.
- **Cada tutorial es independiente.** Empieza con `fudic new` y no necesita haber hecho el anterior.

## 2. Cómo es un tutorial

1. **Nivel**: Principiante, Intermedio o Avanzado, visible al principio.
2. **Objetivos**: lo que sabrás hacer al terminar, en dos o tres líneas. Todo tutorial empieza así.
3. **Pasos**, numerados. Cada uno:
   - lo que se hace y por qué, en una o dos frases;
   - el comando de la CLI, o el fichero: **cada bloque de código lleva encima la ruta del fichero**
     (`src/routes/index.fud`) **y un botón de copiar**;
   - lo que se ve al hacerlo (en el navegador, en la terminal o en el editor);
   - el enlace a la página de la Documentación que lo explica.
4. **Solución**: el proyecto terminado, en GitHub (y en StackBlitz cuando se publique, §5).
5. **Anterior y siguiente**, al final de la página.

## 3. El índice

16 categorías, en el orden de los capítulos de la Documentación. Dentro de cada una, de más fácil a
más difícil. Nivel: **P** principiante, **I** intermedio, **A** avanzado.

Columnas: *CLI* son los comandos que usa además de `fudic new` y `fudic dev`; *Docs*, las páginas
de `/docs` a las que enlaza; *En basic*, dónde está ya funcionando en `examples/` (la fuente de la
que sale el tutorial). Estado: Propuesto → Escrito → En revisión → Hecho, o ~~tachado~~ y Quitado.

### 3.1 Primeros pasos

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 1 | `first-app` | Tu primera app | P | `new`, `dev`, `preview` | cli/new, cli/dev, vite/build, routes-and-layouts, expressions | `index.fud` | En revisión |
| 2 | `first-component` | Tu primer componente | P | `g component` | template-syntax/components, cli/generate/component, styles | `app-card` | En revisión |
| 3 | `editor` | El editor a tu favor: diagnósticos, quick fix y formato | P | `g component`, `fmt` | editors, editors/writing, reference/diagnostics, tools/format | — | En revisión |

### 3.2 Sintaxis de plantilla

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 4 | `expressions` | Pintar valores con `@(…)`: operadores, llamadas, colecciones | P | — | template-syntax, template-syntax/expressions, server/pipes | `/vista` | En revisión |
| 5 | `if-and-foreach` | Condiciones y listas | P | — | template-syntax, template-syntax/expressions | `/vista`, `vista-tareas` | En revisión |
| 6 | `props` | Pasar datos a un hijo | P | `g component` | template-syntax/components | `/value-prop`, `app-child` | En revisión |
| 7 | `slots` | Contenido por slot (los encabezados, en light DOM) | P | `g component` | template-syntax/components | `app-card`, `app-marco` | En revisión |
| 8 | `snippets` | Crear un snippet: declarado, importado y con scope | P | `g snippet` | template-syntax/snippets, cli/generate/snippet | `/snippets`, `src/snippets/` | En revisión |
| 9 | `attributes-and-classes` | Atributos, propiedades y clases que no se pisan | I | — | template-syntax/attributes-and-properties | `/clases`, `clases-demo` | En revisión |
| 10 | `spread-and-rest` | `...props` y `{ label, ...resto }` | I | — | template-syntax/attributes-and-properties | `/spread`, `/resto` | En revisión |
| 11 | `ref` | `ref="@variable"` | I | — | template-syntax/ref-and-raw | `/ref`, `ref-demo` | En revisión |
| 12 | `raw` | `@raw(html)` y cuándo no usarlo | I | — | template-syntax/ref-and-raw | `/raw`, `raw-demo` | En revisión |
| 13 | `await` | Esperar datos con `@await`: orden, errores y status | I | `g api` | template-syntax/await, routing/data, cli/generate/api | `/espera` | En revisión |
| 14 | `safe-urls` | URLs en atributos: el guardia y `trustedUrl` | I | — | template-syntax/attributes-and-properties, reference/dom | `/vista`, `vista-url` | En revisión |

### 3.3 Eventos

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 15 | `events` | Responder a un clic | P | `g component` | template-syntax/events | `app-eventos` | Hecho |
| 16 | `delegation` | Delegación de eventos, medida | I | `g component` | template-syntax/events | `/delegacion` | Hecho |
| 17 | `event-bus` | Un bus entre componentes | I | `g component` | template-syntax/events, reference/dom | `bus-picker`, `bus-option`, `bus-log` | Hecho |
| 18 | `route-events` | Manejadores en la ruta: host y shadow root | I | `g component` | template-syntax/events | `/ruta-evento` | Hecho |

### 3.4 Reactividad

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 19 | `signals` | Un contador con signals | P | `g component` | reactivity | `app-counter`, `signal-counter` | En revisión |
| 20 | `signal-store` | Un signal compartido en un módulo | I | `g component` | reactivity | `/reactividad`, `src/store/` | En revisión |
| 21 | `signal-props` | Valor o signal en una prop | I | `g component` | template-syntax/components, reactivity | `/signal-prop`, `/value-prop` | En revisión |
| 22 | `route-signals` | Un signal en la página, sin componente | I | — | reactivity | `/ruta-reactiva`, `/ruta-reloj` | En revisión |
| 23 | `lifecycle` | El ciclo de vida, y uno que espera a un gesto | I | `g component` | reactivity/lifecycle | `/ciclo` | En revisión |
| 24 | `hydration` | Hidratación guiada por el gesto, por debajo del pliegue | A | `g component`, `preview` | reactivity/hydration | `/hidratacion`, `app-below`, `app-cold` | En revisión |
| 25 | `client-components` | Componentes creados en el navegador | A | `g component` | reactivity/lifecycle | `/vivo` | En revisión |

### 3.5 Estilos

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 26 | `scoped-styles` | El `<style>` del componente | P | `g component` | styles | `sin-css`, cualquier componente | En revisión |
| 27 | `global-styles` | Tema global y hojas compartidas | I | `g component`, `g style` | styles/shared, styles/delivery, cli/generate/style | `fudic.json`, `src/styles/` | En revisión |
| 28 | `style-guide` | Tu guía de estilos: tokens, fuente y favicon | I | `g guide` | styles/guide | `src/styles/guide/` | En revisión |

### 3.6 Rutas y layouts

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 29 | `pages-and-layout` | Páginas y un layout | P | `g page`, `g layout` | routing, template-syntax/routes-and-layouts | `src/layouts/_layout.fud` | En revisión |
| 30 | `dynamic-routes` | Rutas con parámetro: `blog/[slug]` | P | `g page` | routing | `/blog/[slug]` | En revisión |
| 31 | `error-page` | Tu página de error | P | `g error-page` | routing/error-page, cli/generate/error-page | `_error.fud` | En revisión |
| 32 | `route-data` | Datos del servidor para la página | I | — | routing/data | `/blog`, `src/server/blog.ts` | En revisión |
| 33 | `alternate-layouts` | Varios layouts, y uno con marco | I | `g layout` | template-syntax/routes-and-layouts | `/marco`, `/marco-sin-lateral` | En revisión |
| 34 | `slow-pages` | Páginas lentas: renderizado en streaming | A | — | routing/rendering | `/lento` | En revisión |
| 35 | `page-maps` | Lo que la página le cuenta al runtime | A | — | reactivity/hydration | `/mapas` | En revisión |
| 36 | `early-hints` | Early hints | A | `preview` | routing/early-hints | `/lento` | En revisión |

### 3.7 Formularios

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 37 | `first-form` | Un formulario con binding | P | `add forms`, `g form` | forms, forms/binding | `app-form`, `signal-form` | En revisión |
| 38 | `validation` | Validación y mensajes de error | I | — | forms/validation | `form-errores`, `user-form` | En revisión |
| 39 | `submitting` | Enviar al servidor | I | — | forms/submitting | `/formularios`, `src/server/user-form.ts` | En revisión |
| 40 | `file-upload` | Subir ficheros | I | — | forms/files | `app-adjuntos` | En revisión |
| 41 | `form-events` | Eventos del formulario | I | — | forms/events | `/formularios` | En revisión |
| 42 | `form-control` | Un control form-associated | A | `g component` | forms/form-associated | `campo-texto`, `app-input` | En revisión |
| 43 | `custom-rules` | Reglas y patrones propios, también remotos | A | — | server/rules | `src/server/rules.ts` | En revisión |

### 3.8 Servidor

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 44 | `server-functions` | Funciones de servidor | I | `g api` | server, server/functions | `/usuarios` | En revisión |
| 44b | `task` | El estado de una llamada con `task` | I | `g api` | server/task, server/functions | `/usuarios` (Activar, Borrar) | En revisión |
| 45 | `json-api` | Una API con su `.fudapi` | I | `g api` | server, server/functions, server/types | `src/server/` | En revisión |
| 46 | `server-types` | Tipos compartidos entre cliente y servidor | I | `g api` | server/types | `/usuarios` | En revisión |
| 47 | `middlewares` | Un middleware de login | I | `g api`, `add http` | server/middlewares, server/session | `/entrar`, `/cuenta`, `src/server/auth.ts` | En revisión |
| 48 | `pipes` | Los pipes de Fudic, y uno propio | I | `g api`, `g pipe`, `test` | server/pipes | — | En revisión |
| 49 | `session` | Sesión con una cookie | A | `g api` | server/session, server/functions | `/usuarios` (Entrar, Salir) | En revisión |
| 50 | `live-search` | Una búsqueda que sigue a un signal | A | `g api` | server/task, server/functions | `/usuarios` (Búsqueda lenta) | En revisión |
| 51 | `production-server` | Arrancarlo en Node | A | `g api`, `g page` | server/running | `node-server.mjs` | En revisión |

### 3.9 Inyección de dependencias

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 52 | `services` | Un servicio inyectado | I | `add di`, `g service` | di | `src/services/` | En revisión |
| 53 | `providers` | Un servicio compartido por quien no se ve | I | — | di/providers | `/di`, `di-owner`, `di-panel` | En revisión |
| 54 | `server-di` | Proveedores en el servidor, por petición | A | — | di/server | `src/server/di.ts` | En revisión |

### 3.10 Internacionalización

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 55 | `two-languages` | Tu app en dos idiomas | P | `add i18n`, `translate` | i18n, i18n/catalogs, i18n/urls | `examples/i18n` | En revisión |
| 56 | `localized-urls` | URLs con idioma y un selector | I | `g page`, `translate` | i18n/urls | `examples/i18n` | En revisión |
| 57 | `plurals-and-formats` | Plurales, moneda y `t()` | I | `g component`, `translate` | i18n/code, i18n/catalogs | `examples/i18n` | En revisión |

### 3.11 Service worker

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 58 | `service-worker` | Arrancar el service worker | I | `preview` | service-worker, configuration/sw-json | `sw.json` | En revisión |
| 59 | `offline` | Funcionar sin red: estrategias de caché | A | — | service-worker/caching, service-worker/headers | `sw.json`, `sw.headers` | En revisión |
| 60 | `isomorphic` | Render isomórfico: el mismo HTML en tres sitios | A | — | service-worker/isomorphic | `tests/sw-render.spec.ts` | En revisión |

### 3.12 Seguridad

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 61 | `security-headers` | Cabeceras de seguridad | I | — | security, security/headers | `page.headers`, `assets.headers` | En revisión |
| 61b | `observatory` | Medir con HTTP Observatory | I | `preview` | security/headers, server/running | — | En revisión |
| 62 | `csp` | Content Security Policy | A | — | security/csp | `page.headers` | En revisión |
| 63 | `trusted-types` | Trusted Types | A | — | security/trusted-types | — | En revisión |

### 3.13 Rendimiento

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 64 | `caching` | Caché HTTP de páginas y assets | A | `preview` | performance/caching | `assets.headers` | En revisión |
| 65 | `lighthouse` | Un 100 en Lighthouse | A | `preview`, `g page` | performance/lighthouse | — | En revisión |

### 3.14 Tests

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 66 | `unit-tests` | Probar un componente | P | `g component`, `test` | testing/unit | `app-counter.test.ts` | Escrito |
| 67 | `page-tests` | Probar una página, su layout y un pipe | P | `g page`, `g pipe`, `test` | testing/unit, server/pipes | `_layout.test.ts` | Escrito |
| 68 | `load-tests` | Probar el `load` de una página | I | `g page --server`, `test` | testing/unit, testing/pages-and-flows | `espera.test.ts` | Escrito |
| 69 | `function-tests` | Probar funciones de servidor y middlewares | I | `g api`, `test` | testing/unit, server/middlewares | `usuarios.test.ts` | Escrito |
| 70 | `form-tests` | Probar un formulario y sus reglas | I | `g form`, `g api`, `test` | testing/unit, forms | `user-form.test.ts` | Escrito |
| 71 | `custom-terms` | Tu primer paso propio en un `.fudspec` | I | `g component`, `g term`, `spec` | testing, terms | `fudic/terms/` | Escrito |
| 71b | `showcase` | Un showcase de cada componente | I | `g showcase`, `spec` | cli/generate/showcase, testing/workbench | — | Escrito |
| 71c | `user-flows` | Un flujo entre páginas | A | `g api`, `g page --server`, `g flow`, `spec` | testing/pages-and-flows | `src/flows/alta-de-usuario.fudspec` | Escrito |
| 71d | `history` | Aprobar y aceptar: el historial de una pieza | A | `approve`, `accept`, `history` | testing/history, cli/history | — | Propuesto |

Rehecho el 2026-11-26 a petición de Pedro: quien acaba la categoría sabe probar cada variante del
`.fudapi` y cada pieza (componente, página, layout, pipe), y ampliar un `.fudspec` sin leer la
referencia de los términos. `showcase`, `user-flows` y `history` salen del índice: el workbench, los
flujos y el historial quedan en `/docs/testing`. El mismo día, Pedro pidió que no faltara nada: vuelven
como 71b, 71c y 71d, detrás de los seis.

### 3.15 Proyecto y build

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 72 | `baseline` | Baseline: qué navegadores soportas | I | — | configuration/baseline | `/baseline`, `fudic.json` | En revisión |
| 73 | `workspace` | Dos apps y una librería | A | `new --workspace`, `g app`, `g lib`, `add` | cli/new, cli/generate/app, cli/generate/lib, cli/add | `examples/workspace` | En revisión |

### 3.16 Agentes

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 74 | `mcp` | Construir con tu agente usando el MCP de Fudic | I | — | `/mcp`, `/mcp/connect` | — | En revisión |

**Total:** 76 tutoriales: 21 de principiante, 35 de intermedio y 20 de avanzado.

### 3.17 Por comprobar antes de escribir

- La configuración de diagnósticos (`"diagnostics": { "warnings": "error" }`) y la Vite build
  (`vite/build`): si dan para un tutorial propio o van dentro de `editor` (3), `baseline` (72) y
  `lighthouse` (65).
- ~~La página de la Documentación de `page-maps` (35)~~. Comprobado el 2026-11-26: es un **hueco de
  la Documentación**. Hidratación (`/docs/reactivity/hydration`) cuenta `fud-state`, pero
  `fud-tree`, `fud-bus`, `fud-around` y `fud-eager` no salen en ninguna página. El tutorial enlaza a
  Hidratación y a los tutoriales que enseñan `fud-bus` (`event-bus`) y `fud-eager` (`lifecycle`).
  (`client-components`, 25, enlaza a Ciclo de vida, que cuenta `afterCreate`.)
- Que cada tutorial cabe en cinco minutos: se cronometra al escribirlo; si no cabe, se parte.

## 4. La app

Una **app propia del workspace `web/`**, igual que `site` y `mcp`, **no** dentro de `/docs`. Se crea
con la CLI y se sirve en `fudic.dev/tutorials/`:

```sh
fudic g app tutorials --uses ui
```

- **Portada** (`/tutorials/`): el hero y **16 tarjetas, una por categoría**, con cuántos tutoriales
  tiene y de qué niveles.
- **Página de tutorial** (`/tutorials/<slug>`): dos menús, con el nivel arriba y anterior y siguiente
  al final. Misma convención que la Documentación, para no reaprender nada:
  - **A la izquierda, los tutoriales de la categoría** (como los capítulos), de más fácil a más
    difícil, cada uno con su nivel, y arriba «Las 16 categorías» para volver a la portada.
  - **A la derecha, los pasos** del tutorial (como «En esta página»): Objetivos, paso 1, paso 2… y
    Solución.
  - Sin layout propio: la página usa `@web/ui/layouts/docs.fud` tal cual (el menú en `nav`, los
    pasos en `toc`, `pager` al final) y la portada, `@web/ui/layouts/home.fud`.
- **Anterior y siguiente** siguen el orden de dificultad; al acabar una categoría, el siguiente es el
  primero de la siguiente categoría.
- **Componentes**: los de `libs/ui`. El bloque de código con ruta y copiar ya existía (`ui-code`
  con `.path`). La salida de la terminal o del navegador es un `<pre class="output">`, sin ruta ni
  copiar, porque se lee y no se escribe. Los estilos nuevos (el nivel, el menú, los objetivos, las
  tarjetas) están en `docs.css` y `home.css` de `libs/ui`.
- **El menú y las tarjetas se escriben a mano**, como `docsNav`: un snippet por categoría
  (`firstStepsNav`…) y una tarjeta por categoría en la portada, en
  `web/apps/tutorials/src/snippets/tutorials.fud`. No pueden salir de un módulo de datos porque la
  vista es políglota: sin literales de objeto ni array en el `@code` de una página (`FUD1143`) y
  sin tipos que no estén en un `.fudapi` (`FUD1153`). **Al añadir, mover o quitar un tutorial se
  cambia su fila en §3, su línea en el snippet de su categoría y, si cambia el número o los
  niveles, su tarjeta.**
- Un tutorial aún sin escribir sale en el menú sin enlace, con «pronto»; una categoría sin ninguno
  escrito, en la portada sin enlace y con «En preparación».
- En móvil, los menús se pliegan como en la Documentación.

URLs en inglés, texto en español (como el resto de la web).

## 5. Las soluciones

Cada tutorial tiene su proyecto terminado en **`tutorials/<slug>/`, en la raíz de este repo**, fuera
de `pnpm-workspace.yaml`. **No en un repo aparte**: dos repos se desincronizan.

- Cada carpeta es un proyecto independiente, el que tendría el usuario tras hacer el tutorial: su
  `package.json` instala `@fudic/*` desde npm, con versiones exactas.
- **GitHub**: «Ver la solución en GitHub» enlaza a la carpeta. Funciona desde el primer día.
- **StackBlitz**: «Abrir en StackBlitz» abre la misma carpeta, pero necesita los paquetes en npm.
  **Hoy no hay nada publicado** (la publicación se prueba con Verdaccio), así que el botón se añade a
  todos a la vez el día que se publique; la web nunca lleva un enlace que no funcione.

### 5.1 Prueba de StackBlitz (2026-11-25)

StackBlitz ejecuta Node en el navegador (WebContainers), donde no hay binarios nativos. El riesgo era
`oxc-parser`, el parser del compilador. Probado en local forzando su versión WASM (el binario nativo
bloqueado, el de respaldo `@oxc-parser/binding-wasm32-wasi` cargado en los 196 procesos):

| Prueba | Nativo | oxc en WASM |
|---|---|---|
| Suite del compilador | 4745 ✓ · 1 ✗ | 4745 ✓ · 1 ✗ (el mismo) |
| `vite build` de `examples/basic` | 459 ficheros | idénticos, salvo una fecha del build |

`oxc-parser` 0.137 trae además `webcontainer-fallback.cjs`: en StackBlitz descarga solo su versión
WASM. Queda por confirmar en StackBlitz, el día que se publique, Rolldown (el bundler de Vite 8) en
WASM: en Windows no se puede probar porque no resuelve rutas `C:\`.

## 6. Orden de trabajo

**En pausa desde el 2026-11-25, por decisión de Pedro.** No se escriben más tutoriales hasta
resolver §6.1.

1. Este documento, validado por Pedro: el índice (§3) y la app (§4).
2. ~~Crear la app `tutorials` con la CLI y llevar el enlace «Tutoriales» del menú hasta ella.~~
3. ~~La portada con las 16 categorías y la plantilla de página con `first-app`.~~ Hecho; sirve de
   muestra del diseño.
4. **En pausa.** Categoría a categoría, en el orden de §3. Primeros pasos, la primera, está completa.
5. El día que se publique en npm: el botón de StackBlitz en todos.

### 6.1 Pendiente: que el tutorial no se desfase del código

- **El problema.** Un tutorial copia código y salidas de una ejecución. Cuando Fudic cambia, nada
  avisa de que el tutorial ya no funciona, y acaba obsoleto.
- **El requisito.** El código de cada tutorial se prueba. Si no se prueba, el tutorial deriva.
- **Por decidir.** Cómo se prueba, y cómo salen los ejemplos (la solución) a partir del tutorial, en
  vez de escribirse aparte.
- **Lo que queda hasta entonces.** Los tres tutoriales de Primeros pasos y sus soluciones en
  `tutorials/` se quedan como muestra. Sus enlaces «la solución en GitHub» están rotos: apuntan a `main`, donde aún no existen.
  La solución se regenerará cuando la CLI quite la fuente de la guía (hallazgo 23 de la CLI).

Lo que la CLI no resuelva se apunta en [../hallazgos-cli.md](../hallazgos-cli.md); lo del framework,
en [../hallazgos-fudic.md](../hallazgos-fudic.md).

## 7. Registro

| Fecha | Qué |
|---|---|
| 2026-11-25 | Este documento, para revisión. Decisiones de Pedro: una app propia (no dentro de `/docs`); portada con 16 categorías; el tiempo no se muestra; soluciones en una carpeta de este repo, no en otro; nada fuera del índice; el layout lo decide Claude (tutoriales a la izquierda, pasos a la derecha). Prueba de oxc-parser en WASM para StackBlitz (§5.1). |
| 2026-11-25 | App `web/apps/tutorials` creada con `fudic g app tutorials --uses ui --layout @web/ui/layouts/docs.fud --no-sw --locale es` sobre una copia de `web/` (hallazgos 5 y 6 de la CLI), servida en `/tutorials/`. «Tutoriales» en la cabecera y el pie de todas las páginas. La portada con las 16 categorías y el primer tutorial, `first-app`, creado con `fudic g page`: cada comando y cada salida, de una ejecución real de `fudic new`, `fudic dev`, `pnpm build` y `fudic preview` fuera del repo. Su solución, en `tutorials/first-app/`. Lighthouse en las dos páginas, móvil y escritorio, claro y oscuro: 99–100 / 100 / 100 / 100 (el 99 en móvil es el mismo que da una página de la Documentación en `vite preview`, sin compresión). El script de anclas de la skill lee ya las tres apps. Hallazgo 56 del framework: el typecheck asigna mal los argumentos con nombre de un snippet. |
| 2026-11-25 | Decisión de Pedro: no se escriben más tutoriales hasta resolver cómo se prueba su código para que no se desfase (§6.1). `first-app` queda como muestra; su enlace a GitHub, roto hasta entonces. |
| 2026-11-25 | A petición de Pedro, los otros dos tutoriales de Primeros pasos: `first-component` y `editor`, creados con `fudic g page`, con su solución en `tutorials/`. Todo de ejecuciones reales: `fudic g component` (con y sin `--in`), el aviso `FUD1440`, el error `FUD0191` en `fudic dev`, el diagnóstico y las dos acciones de la bombilla pedidos al language server por LSP, y `fudic fmt`. Lighthouse en las dos, móvil y escritorio, claro y oscuro: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | A petición de Pedro, la categoría Sintaxis de plantilla, de una en una con su revisión. `expressions`, creado con `fudic g page`, con su solución en `tutorials/expressions/`: valores, un pipe `currency`, `filter`/`reduce`/`.length` sobre una lista y el error `FUD1140` de `find` en `fudic dev` y en el language server (solo la acción «Explain FUD1140»). Menú `templateSyntaxNav` y tarjeta de la portada enlazada. Lighthouse móvil y escritorio, claro y oscuro: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | La skill monta el proyecto de prueba desde tarballs, todo fuera del repo. `if-and-foreach`, con su solución en `tutorials/if-and-foreach/`: `@if`/`else if`/`else`, el error `FUD0540` de un `@foreach` sin key con la acción «Add key (task)» del language server, y `@empty`. Hallazgo 57 del framework (`FUD1152` con un tipo literal). Lighthouse móvil y escritorio, claro y oscuro: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `props`, con su solución en `tutorials/props/`: `fudic g component alert --in`, `props<T>()` con una prop obligatoria y otra opcional con valor por defecto, dos usos con `.text` y `.tone`, el `TS2345` de una prop que falta con la acción «Add the required props of <myapp-alert>» y el `TS2322` de un tono que no existe. Hallazgo 58 del framework (el tipo interno `$Missing` en el error). El montaje borra el `pnpm-workspace.yaml` tras instalar: con él, la CLI decía `pnpm --filter my-app test`. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `slots`, con su solución en `tutorials/slots/`: `fudic g component card --slot --in`, un slot sin nombre, dos con nombre (uno con contenido por defecto) y `::slotted(h2)`, el código fuente con el `<h2>` en light DOM y el `TS2345` de un slot mal escrito con las acciones «Change to slot=…». Hallazgo 59 del framework (un encabezado dentro de un componente no avisa) y el 58 ampliado a los slots. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `snippets`, con su solución en `tutorials/snippets/`: un `@snippet row` declarado en la página, el `FUD0894` de un argumento sin `@` con la acción «Write @price», y `fudic g snippet ui row` para llevarlo a `src/snippets/ui.fud`, con su test cambiado para probarlo. El hallazgo 54 del framework vuelve a salir en el `pnpm test` del proyecto. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `attributes-and-classes`, con su solución en `tutorials/attributes-and-classes/`: atributos con `@`, solos y mezclados con texto, `disabled` con `true` y `false`, `class:` junto a una clase fija y el `FUD0915` de un `style` con expresión, resuelto con otro `class:`. Versión estática: «que no se pisan» en el navegador necesita signals y eventos, que llegan después; las propiedades del DOM, en una nota. Hallazgo 60 del framework (una propiedad en una página estática no se asigna) y el 6 vuelto a comprobar. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `spread-and-rest`, con su solución en `tutorials/spread-and-rest/`: `{ label, ...rest }` hacia un `<input>`, y el spread de cada producto de una lista a su tarjeta, con su tipo en un `.fudapi`, la clave que no cruza, la prop a mano que gana y el valor por defecto. Por decisión de Pedro, el spread va dentro de un componente: en una página llega vacío (hallazgo 61). Hallazgos 62 y 63: un `.fudapi` o un componente nuevos no se ven hasta reiniciar `fudic dev`, y el tutorial pide arrancarlo después de crearlos. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `ref`, con su solución en `tutorials/ref/`: un `<myapp-confirm>` que abre un `<dialog>` con `ref` y `showModal()` desde un `@click` (presentado en una frase, porque los eventos llegan después), probado con un clic real en Chrome sin cabeza; el código fuente con `data-fud-id`, y el `FUD0192` de un `ref` en un bucle. Hallazgo 64 del framework (leer un `ref` en la plantilla manda al `.fudapi`). Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `raw`, con su solución en `tutorials/raw/`: el mismo HTML escapado por una expresión y escrito con `@raw(trustedHtml(…))`, el `TS2345` de un string sin marcar, el `FUD0990` de un `@raw` con texto al lado y cuándo no usarlo. La página de la Documentación `ref y @raw` decía que un string sin marcar «se escribe como texto»; el typecheck lo rechaza, y se ha corregido. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `await`, con su solución en `tutorials/await/`: `fudic g api` sobre la página de inicio, dos campos `later` (uno tarda 2 s, otro falla a los 3 con `notFound`), `@await` con `@catch`, el 200 aunque un bloque falle y el orden del documento, todo medido leyendo la respuesta como flujo. Los datos de la página se presentan en lo justo, porque su tutorial llega después. Hallazgo 24 de la CLI (`g api` no dice que hay que instalar). Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `safe-urls`, con su solución en `tutorials/safe-urls/`: un `href` desde una expresión con una URL buena y un `javascript:` (que sale `about:blank`), el prefijo `/users/` que hace innecesaria la guarda, el `FUD0915` de un `javascript:` escrito a mano y un esquema `myapp:` que pasa con `trustedUrl`. Con él, la categoría Sintaxis de plantilla queda escrita entera, en revisión. Lighthouse en el tutorial y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | A petición de Pedro, la categoría Eventos entera, con sus soluciones en `tutorials/`. `events`: `@click` con el evento, `@input=@count($value)` y el `TS2345` de un `$value` numérico. `delegation`: el aviso `FUD1380`, los listeners contados con `getEventListeners` (5, y 1 tras `delegate:size`) y un clic fuera de los botones que no llama al manejador. `event-bus`: `emit` y `bus:` entre dos componentes hermanos, el mapa `fud-bus` del código fuente y el `TS2345` que señala al emisor. `route-events`: un manejador en el `@code` de la página, y el mismo componente escuchando en el host y en el shadow root (el `change` solo lo oye el shadow root). Todo con clics reales en Chrome sin cabeza. Hallazgos 65 a 67 del framework (`FUD1440` con `<li>`, un `bus:` que nadie anuncia, `fudic dev` con un fichero a medio escribir). Lighthouse en las cuatro y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | A petición de Pedro, la categoría Reactividad entera, con sus soluciones en `tutorials/`. `signals`: `signal`, `computed` y el `TS2345` de un signal sin paréntesis. `signal-store`: un signal por instancia frente a un store en `src/stores/cart.ts` que comparten dos productos. `signal-props`: `.value=@count()` a un hijo de `number`, el `computed` que no se mueve con un número, el `FUD0200` al pedir `Signal<number>` y el hijo que escribe el signal. `route-signals`: lista con `@if` y `@foreach` en la página, y un `effect` que cuenta segundos (la página en `fud-eager`). `lifecycle`: `onConnect` con un `ResizeObserver`, el orden de los hooks al hidratar, quitar y crear, y un componente sin hooks que espera al gesto. `hydration`: sobre `pnpm build` y `fudic preview`, el service worker precarga el chunk visible al cargar y el de abajo al hacer scroll, el clic se sirve de su caché y la nota estática no baja nunca. `client-components`: un `@foreach` que crea componentes en el navegador (`afterCreate`) y los mueve con `key` sin perder su estado. Todo con clics y peticiones reales en Chrome sin cabeza. Hallazgos 68 a 70 del framework (un store no despierta a quien lo lee, un componente creado en `fudic dev` sin su `<style>`, `mount` con una prop `Signal`) y el 58 ampliado. Lighthouse en las siete y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | A petición de Pedro, la categoría Estilos, un commit por tutorial. `scoped-styles`, con su solución en `tutorials/scoped-styles/`: `fudic g component badge --in`, un `.label` en el componente y otro en la página que no se tocan (medido con estilos computados en Chrome sin cabeza), `--badge-color` dado con `style` a una segunda insignia, la hoja con `specifier` una sola vez en el código fuente y el `FUD0132` de una expresión en el `<style>`. Menú `stylesNav` y tarjeta de la portada enlazada. Lighthouse móvil y escritorio, claro y oscuro: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `global-styles`, con su solución en `tutorials/global-styles/`: `--brand` en una hoja de página enlazada desde el layout, que llega a dos tarjetas y que una zona `.promo` cambia; `fudic g style theme` con una regla `.muted` que adoptan todas; una hoja `panel` declarada a mano en `styles` y nombrada por la tarjeta, y el `FUD0743` de un `:root` en `theme.css`. Los colores, medidos con estilos computados en Chrome sin cabeza. Hallazgos 71 y 72 del framework (las hojas de `fudic.json` no se recargan en `fudic dev`, `FUD0744` con la pila de Vite) y 25 de la CLI (`g style` deja la hoja en la raíz). Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `style-guide`, con su solución en `tutorials/style-guide/`: el `FUD1444` de `fudic g guide` en una app que ya tiene guía, la guía y el favicon en el `<head>` sin escribir ningún `<link>`, el acento y el foco cambiados en `tokens.css` (medidos en modo claro y oscuro), la fuente del sistema sin `@font-face` ni `fonts/` (ningún `.woff2` pedido), el favicon con su hash nuevo y un `button` de la página que gana a `:where(button)`. Con él, la categoría Estilos queda escrita entera, en revisión. El hallazgo 71 del framework, ampliado a la guía. Lighthouse en el tutorial y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | A petición de Pedro, la categoría Formularios, un commit por tutorial. `first-form`, con su solución en `tutorials/first-form/`: `fudic g form contact`, nombre y email con `required` y `pattern email`, el `<form>` con `control` y `error`, el `aria-describedby` y el `novalidate` del código fuente, cuándo sale cada error (probado en Chrome sin cabeza) y el test de la CLI que falla con el segundo campo obligatorio. Menú `formsNav` y tarjeta de la portada enlazada; de paso, la tarjeta de Internacionalización ya no enlaza a `scoped-styles`. Hallazgo 26 de la CLI (`g form` no añade `@fudic/http`, y el formulario revienta en `fudic dev`). Lighthouse en el tutorial y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `validation`, con su solución en `tutorials/validation/`: `fudic g form signup --skip-test`, tres reglas en orden en el alias, el `range` de un `u8` que sale como código hasta que se le da texto, un bloque `messages` para el `required` de todo el proyecto y un `require … on alias` que compara dos campos. Cada paso guardando con `fudic dev` en marcha, probado en Chrome sin cabeza. El error de dos campos se pinta en el campo y no en un `summary`, porque un `summary` en una página da un 500 (hallazgo 73 del framework). Hallazgos 74 (`messages` pinta `{min}` y `{max}` como `u8`) y 75 (quitar un `required` con `fudic dev` en marcha corta la página). Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `submitting`, con su solución en `tutorials/submitting/`: `fudic g api` sobre la página y `fudic add forms`, una función `post subscribe` con `form`, su handler que escribe en la terminal, `form:=` en la página (sin petición si no valida; un `POST` con `204` si valida, en Chrome sin cabeza) y, con `use json`, `curl` contra la función: `422` con la regla que falla, `400` sin el campo y `204` con un email bueno. Sin redirección: `throw redirect()` no navega si la cadena no tiene `error-pages` (hallazgo 76 del framework). Hallazgo 77: `FUD1080` dice «unknown rule `required`» cuando falta `@fudic/forms`. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `file-upload`, con su solución en `tutorials/file-upload/`: `fudic g api` y `fudic add forms`, un campo `docs file[]` con `required`, `max-length 3`, `accept` y `max-size 1mb`, el `accept` que el compilador copia en el `<input>`, los cuatro errores sin ninguna petición y la subida en `multipart/form-data` con `204` y una línea por fichero en la terminal, todo con ficheros reales en Chrome sin cabeza. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `form-events`, con su solución en `tutorials/form-events/`: una función que devuelve una `Subscription` (`-> Subscription`), `@fudic:result` que pinta su número en un `role="status"` y vacía el formulario con `()`, un `500` que sin manejador no hace nada visible y `@fudic:error` con el `status` de `HttpError`, todo con clics reales en Chrome sin cabeza. El mensaje del error llega en `fudic dev` y no en la preview, así que el tutorial pide no enseñarlo. Hallazgo 78 del framework (la excepción del handler no sale en la terminal) y el 76 ampliado a `fudic:error`. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `form-control`, con su solución en `tutorials/form-control/`: `fudic g component input --in … --skip-test --skip-spec`, un `<myapp-input>` con `formassociated`, `shadowrootreferencetarget` y la hoja `input` de la guía, usado con `<label for>`, `control` y `error` desde la página. Comprobado en Chrome sin cabeza: el label da foco al `<input>` de dentro, el árbol de accesibilidad le da el nombre «Alias», el error como descripción e `invalid`, el host cumple `:invalid` y su módulo se descarga al cargar. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-25 | `custom-rules`, con su solución en `tutorials/custom-rules/`: un `pattern alias` en `src/rules/aliases.fudapi`, una regla `alias-taken` con `runs remote` y su `check` en `src/server/rules.ts` (con un segundo de espera), y `pending()` con «Checking…». Medido en Chrome sin cabeza: la pregunta sale a los 300 ms de la pausa, no se repite para un valor ya preguntado y no sale si falla antes el patrón. El tutorial pide parar `fudic dev` al declarar la regla (hallazgo 75 ampliado). Con él, la categoría Formularios queda escrita entera, en revisión. Lighthouse en el tutorial y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | A petición de Pedro, la categoría Rutas y layouts, un commit por tutorial. `pages-and-layout`, con su solución en `tutorials/pages-and-layout/`: `fudic g page about`, un menú en el layout, un hueco `aside` con `@RenderSection` que rellena About y que Home deja vacío, `fudic g page docs/intro` (que deja preparada la `@section aside`) y el `FUD0429` de una sección mal escrita, en `fudic dev` y en el language server. Menú `routesNav` y tarjeta de la portada enlazada. Lighthouse en el tutorial: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `dynamic-routes`, con su solución en `tutorials/dynamic-routes/`: `fudic g page blog/:slug --server`, `ctx.params.slug` en el título, el `TS2339` de `ctx.params.id`, `notFound()` con un 404 de verdad (y el test generado, cambiado a un slug que existe) y `fudic g page blog/new`, que gana a `[slug]`. Hallazgo 79 del framework (`@fudic/http` publica sus `.map` sin los fuentes) y el 24 de la CLI ampliado a `g page --server`, que instala sin decirlo. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `error-page`, con su solución en `tutorials/error-page/`: el 404 mínimo de Fudic tras un enlace roto, `fudic g error-page` (sin reiniciar `fudic dev`), el 404 con el layout y «Back» a la página de la que se venía (con un clic real en Chrome sin cabeza), un `forbidden('…')` con su motivo y un 403, y un `Error` cualquiera cuyo mensaje sale en `fudic dev` y no en `fudic preview`. Hallazgo 80 del framework (un 404 sin `Accept: text/html` es el «Cannot GET» de Connect), el 78 ampliado a `load` y el 67 vuelto a comprobar; el 22 de la CLI, también. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `route-data`, con su solución en `tutorials/route-data/`: `fudic g page blog --server`, un `load` con `title` y `posts  Post[]`, su handler, la lista pintada con `data` y el `TS2339` de un campo que no existe, y un filtro por `ctx.url.searchParams` con `load ssr`, enlaces a cada etiqueta y `@empty`. Probado también en `pnpm build` y `fudic preview` con Chrome sin cabeza: sin modo (`sw`), el service worker pinta `/blog?tag=guides` con los datos de `/blog` (hallazgo 81 del framework); con `ssr`, bien. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `alternate-layouts`, con su solución en `tutorials/alternate-layouts/`: `fudic g layout docs --sections nav`, `fudic g page guide --layout src/layouts/docs.fud`, la rejilla en `<myapp-frame>` (`fudic g component frame --slot`) con `@RenderSection(nav, slot: "nav")` y `@RenderBody(slot: "content")`, el `slot` que pone el layout en el código fuente y la rejilla medida en Chrome sin cabeza, y `required: true` con el `FUD0890` y la acción «Add the layout's required sections (nav)» del language server; el test generado del layout, rehecho con `sections`. El 72 del framework, ampliado a `FUD0890`. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `slow-pages`, con su solución en `tutorials/slow-pages/`: una página `report` cuyo `load ssr` tarda 2 s, medida con `curl` (primer byte a los 2,06 s), el dato en `later` con `@await` (primer byte a los 0,06 s, último a los 2,06) y `load ssg` en `pnpm build` y `fudic preview` (primer byte a los 0,009 s, con el total ya en `dist/report/index.html`). Para no repetir `await`, el tutorial va de cuánto espera el usuario, no de la sintaxis. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `page-maps`, con su solución en `tutorials/page-maps/`: un contador con una prop, puesto dos veces (`fud-state` `[[0,1,2],[1,10]]`), y un panel interactivo que monta otro en su shadow (`fud-tree` `{"myapp-panel":["myapp-counter"]}`; sin el botón del panel, el bloque no sale). En `pnpm build` y `fudic preview` con Chrome sin cabeza: al cargar no baja ningún componente y los tres hosts siguen sin definir; al pulsar Hide baja `myapp-counter` antes que `myapp-panel`, y el primer contador pasa de 1 a 2. La Documentación no tiene página para estos bloques (§3.17): enlaza a Hidratación. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `early-hints`, con su solución en `tutorials/early-hints/`: una página `report` con `load ssr` de 2 s; la cabecera `Link` con `curl -sI` sobre `fudic preview` (HTTP/1.1, sin `103`); `@vitejs/plugin-basic-ssl` y `pnpm preview` (la de Vite, en HTTPS y HTTP/2) para ver con `curl --http2` el `103` con el CSS, el módulo de arranque, la CSP y la `Referrer-Policy`, medido a los 0,01 s y el `200` a los 2,02 s; sin `sec-fetch-mode: navigate`, sin `103`; y `"earlyHints": false`, que quita el `103` y también el `Link`. **No comprobado en el navegador**: Chrome sin cabeza, con el certificado de desarrollo, no adelantó las descargas (el CSS salió a los 2 s, sin iniciador `early-hints`), así que el tutorial no dice nada de la pestaña Red. Hallazgo 27 de la CLI (`fudic preview` no puede servir HTTP/2 y se cuelga si la app sirve HTTPS). Con él, la categoría Rutas y layouts queda escrita entera, en revisión. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | A petición de Pedro, dos pasos que faltaban. `dynamic-routes` gana un paso 5: sin `paths`, `pnpm build` no escribe ningún artículo; con `paths` y su handler (`Object.keys(posts)`), escribe `dist/blog/hello/index.html` y `dist/blog/routing/index.html` ya pintados, y en `fudic preview` `/blog/nope` sigue en 404. `route-data` gana un paso 5: el layout declara `area` con `props`, la página la da con `layout` en su `.fudapi` y `layout.handle((ctx, data) => …)`, la cabecera dice «Blog: guides» con la query string, y el `TS2322` de una prop mal escrita. Lighthouse en los dos: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | A petición de Pedro, la categoría Servidor, un commit por tutorial, con un tutorial nuevo, `task` (44b), para contar a fondo `task` en el cliente: `live-search` (50) queda para la fuente reactiva y la cancelación. `server-functions`, con su solución en `tutorials/server-functions/`: `fudic g api` (que instala `@fudic/http` sin decirlo: el hallazgo 24 de la CLI, corregido), un `get greet` con su handler, la llamada desde un clic (`GET /_fudic/fn/routes/index/greet?name=Ana`, `application/fud+bin`), el `TS2353` de un argumento que no existe (también en el language server) y un `badRequest` que sin `try` solo sale en la terminal y con `try` pinta «400: Write a name.», en `fudic dev` y en `fudic preview`, con clics reales en Chrome sin cabeza. Menú `serverNav` y tarjeta de la portada enlazada. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `task`, con su solución en `tutorials/task/`: un `put rename` que tarda un segundo y escribe en la terminal, `task(rename)` con `run`, el botón desactivado con `pending()` y «Saving…», `value()` que guarda la última respuesta (y `none` en el HTML del servidor, medido con `curl`), un `fails taken 409` pintado con `message()` sin `try` mientras el valor anterior se queda, y dos clics seguidos en fila (el segundo `PUT` sale cuando responde el primero). Con clics reales en Chrome sin cabeza, en `fudic dev` y en `fudic preview`. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `json-api`, con su solución en `tutorials/json-api/`: un `get products` con `use json` y un `post addProduct`, llamados con `curl` en `fudic dev` y en `fudic preview`: el JSON de la búsqueda, el `400` `application/problem+json` sin `q` y con un precio que no es `f64`, el `405` de un `GET` a un `post`, y el `412` en binario que recibe `curl` sin `use json`. `FUD1070` con `add-product`: los nombres de función son identificadores, y la página «El contrato .fudapi» decía que todos los nombres van en kebab-case; corregida. Hallazgo 77 del framework, ampliado a un argumento con `max-length`. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `server-types`, con su solución en `tutorials/server-types/`: un `type Order` y un `enum Status` en el contrato, una constante `Order[]` en el servidor con `import type`, la lista en la página con `data`, el `TS2322` de un estado que no existe en el servidor y el `TS2367` de una comparación con otro valor en la página, y un `note  str?` pintado con `@if`. Comprobado con `curl` en `fudic dev` y en `fudic preview`. Una función propia en la vista da `FUD1140` (vista políglota), así que el tipo se importa en el servidor. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `middlewares`, con su solución en `tutorials/middlewares/`: `fudic add http` (la cadena con `csrf`), un `middleware auth` con mitad de servidor y `adds user`, que lee la cookie y lanza `unauthorized`; un `post login` con `setCookie` y un `get secret` con `use auth`, llamado con `task`: `401` «Sign in first.», la cookie `HttpOnly` y `SameSite=Lax`, y «The code is 42, Ana.»; el `TS2339` de `ctx.user` sin `use auth`, y `chain use auth` con `skip auth` en el login (sin el `skip`, el login da `401`). Con clics reales en Chrome sin cabeza, en `fudic dev` y en `fudic preview`. Hallazgo 67 del framework, ampliado a un `.fudapi`. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `pipes`, con su solución en `tutorials/pipes/`: un artículo con `load`, `date` con `timeZone` («November 26, 2026») y `list` («views, server, and i18n»), el `TS2345` de un `date` sin `timeZone`, `fudic g pipe initials` implementado con el idioma de la página («AL»), y el test generado que falla con `fudic test` hasta cambiarlo por uno de verdad. Comprobado con `curl` en `fudic dev` y en `fudic preview`. Hallazgo 79 del framework, ampliado a `fudic test` (98 avisos de sourcemap). Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `session`, con su solución en `tutorials/session/`. Cambia de título: «Una petición no ve lo que publicó otra» (`/sesion/[user]`) es `publish` de `@fudic/di`, y va con `server-di` (54); este cuenta la página «Sesión y cookies». Un `load` que lee la cookie (con `curl`, con y sin `Cookie`), el `cache-control: private, no-store` que pone Fudic, el `FUD1300` de `load ssg` en `pnpm build`, `login` y `logout` con `setCookie` y `deleteCookie` que no repintan hasta recargar, y con `invalidates /`, el `GET /_fudic/data/` que repinta la página. Con clics reales en Chrome sin cabeza, en `fudic dev` y en `fudic preview`, también con el Service Worker activo y la cookie cambiada. `server-functions` ya no cita la pestaña Red con un formato inventado. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `live-search`, con su solución en `tutorials/live-search/`: `task(search, () => ({ q: query() }), { initial: data.products })`, una búsqueda de medio segundo que escribe en la terminal y escucha `ctx.signal`; con «tea» tecleado deprisa, `?q=t` y `?q=te` abortadas en el navegador y solo pintada la última, y con `pnpm preview` el servidor escribe «cancelled» de las dos. Con teclas reales en Chrome sin cabeza. Hallazgo 82 del framework (sin `data` en la vista, el navegador no recibe `fud-data` y la tarea revienta) y 28 de la CLI (el proxy de `fudic dev` y `fudic preview` no pasa la cancelación). `task` enlaza ya a este tutorial. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `production-server`, con su solución en `tutorials/production-server/`: una página `ssr` y otra estática, `pnpm build` (`dist/` y `.fudic/edge/server.mjs`), `pnpm add @fudic/server@0.0.1` y un `server.mjs` sobre `node:http` con la app, `staticFiles` y `nodeMiddleware(app, { notFound: true })` en ese orden; con `curl`: `/` con una hora nueva en cada petición, `/about` del build, `/nope` en 404 con la página de error y un CSS con `immutable`; el `ERR_MODULE_NOT_FOUND` sin build, y `pnpm start` con `PORT`. Con él, la categoría Servidor queda escrita entera, en revisión. Lighthouse en el tutorial y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | A petición de Pedro, la categoría Inyección de dependencias, un commit por tutorial. `services`, con su solución en `tutorials/services/`: `fudic g service cart` (que añade e instala `@fudic/di`), un `Cart` con `Service(Cart)`, dos productos que lo piden con `inject(Cart)` y comparten la instancia (Green tea dice 2 tras el café, con clics reales en Chrome sin cabeza, en `fudic dev` y en `fudic preview`), y el `FUD0680` de quitar `Service(Cart)`, en `fudic dev` y en `pnpm build`. Hallazgo 84 del framework (un signal dentro de un servicio no repinta: el carrito no lleva signals) y 85 (`FUD0680` no sale en el editor, como decía «Servicios», corregida). Menú `diNav` y tarjeta de la portada enlazada. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `providers`, con su solución en `tutorials/providers/`: `fudic g service cart --provided`, un `<myapp-shop>` que hace `provide(Cart, …)` y dos tiendas en la página, cada una con su carrito (con clics reales en Chrome sin cabeza, en `fudic dev` y en `fudic preview`); el código fuente con `data-fud-ioc` y el bloque `fud-ioc`; en la preview, de la tienda solo baja su fábrica (`myapp-shop.ioc-….js`), nunca el componente; y el `FUD0684` de un `provide` repetido. Hallazgo 85 ampliado a `FUD0684` («Dueños y subárboles» decía que sale en el editor; corregida) y 86 (un componente que inyecta un servicio provisto no se monta solo en un test, ni con `providers`: la solución quita el test del producto). Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `server-di`, con su solución en `tutorials/server-di/`: un `Session` que toma el nombre de un token, un `load ssr` que lo publica tras un `await` de un segundo, y un `<myapp-account>` que provee la sesión a `<myapp-hello>`; con `curl --parallel --parallel-immediate`, Ana y Luis a la vez reciben cada uno su saludo en 1,15 s, y con una variable de módulo los dos reciben «Luis»; en el navegador, «Ana waved from the browser.» y el bloque `fud-di`. Con clics reales en Chrome sin cabeza, en `fudic dev` y en `fudic preview`. Hallazgo 87 del framework (sin un dueño en la página, el navegador tira `fud-di`: el ejemplo de «Servidor y navegador» no funciona tal cual; el tutorial provee la sesión desde un componente) y 86 vuelto a comprobar. Con él, la categoría Inyección de dependencias queda escrita entera, en revisión. Lighthouse en el tutorial y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | A petición de Pedro, la categoría Internacionalización, un commit por tutorial. `two-languages`, con su solución en `tutorials/two-languages/`: `fudic add i18n --locales en,es`, una portada en inglés con el nombre de la tienda bajo `translate="no"`, `fudic translate` (cuatro mensajes, la frase con `<0>{name}</0>`, el nombre fuera) y el catálogo de español rellenado, que `fudic dev` no ve hasta reiniciarlo; `/` redirige por `Accept-Language`, `/es/` sin traducir sale en inglés; el `lang="en"` del layout que tapa el de cada idioma; el `FUD1027` del build sin `site`, `dist/index.html` que lleva a `/en/`, y el test generado que falla con `visit('/')`, cambiado por uno por idioma. Comprobado con `curl` en `fudic dev`, con `pnpm build` y `pnpm test`. Hallazgos 29 y 30 de la CLI (`add i18n` no quita el `lang` ni escribe `site`) y 88 y 89 del framework (`visit('/')` en una app con idiomas; un catálogo nuevo no recarga la página). Menú `i18nNav` y tarjeta de la portada enlazada. Lighthouse en el tutorial y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `localized-urls`, con su solución en `tutorials/localized-urls/`: `fudic g page about` y un menú en el layout con enlaces que empiezan por `/`, que en `/es/about` llevan a `/es/` y `/es/about`; un selector con `lang` y `translate="no"` cuyos enlaces con prefijo se quedan como están; `fudic translate` con el menú como un solo mensaje (`<0>Home</0> · <1>About us</1>`), el `<title>` y el `<h1>` iguales en un solo mensaje y el selector fuera; y con `curl`, `/about` que redirige a `/es/about` con `es-MX`, a `/en/about` con `fr-FR`, y `/en/about` que no redirige. Comprobado en `fudic dev`; los tests de la solución visitan `/en/`, `/es/` y `/es/about`. Hallazgos 88 y 89 del framework, vueltos a comprobar. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `plurals-and-formats`, con su solución en `tutorials/plurals-and-formats/`. Cambia de título: «Plurales, moneda y fechas» pasa a «Plurales, moneda y `t()`», a petición de Pedro de explicar bien `t()`; la fecha se queda fuera porque un `new Date()` en la vista es `FUD1150` y necesitaría un `load` (el pipe `date` ya sale en `pipes`). Un carrito hidratado con «1 coffees in the cart» hasta que el catálogo de inglés escribe el plural (`=0`, `one`, `other`), el de español con el suyo, el total con `currency("EUR")` («€1.20» y «1,20 €»), y `t("Your cart")` en la prop, que `fudic translate` añade como mensaje nuevo; con `t(label)`, el `FUD1020` en `fudic dev` y la página en `500`. Con clics reales en Chrome sin cabeza, en `fudic dev`. Hallazgo 90 del framework (`fudic translate` no avisa de un `t()` con variable y borra su traducción) y 89 vuelto a comprobar. Con él, la categoría Internacionalización queda escrita entera, en revisión. Lighthouse en el tutorial y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | A petición de Pedro, la categoría Service worker, un commit por tutorial. `service-worker`, con su solución en `tutorials/service-worker/`: `fudic g page about`, el `sw.json` que escribe `fudic new`, `pnpm build` con `fudic-sw.js` y el código de cada página en `dist/sw/c/`, y en `fudic preview` el service worker y sus cinco cachés (`shell`, `fudic-runtime`, `routes`, `pages`, `data`, con el `id` y el del build); la primera visita a `/about` la sirve el servidor y la segunda el service worker; tras un `pnpm build` nuevo, la primera recarga sigue en el build de antes y la segunda trae el nuevo, con las cachés renombradas y las viejas borradas. Con Chrome sin cabeza (Playwright). Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `offline`, con su solución en `tutorials/offline/`: dos páginas con `fudic g page --server` que enseñan la hora del servidor, `news` con `load sw ttl 10s cache-first` y `live` con `load sw network-first`; en `fudic preview`, la primera visita la pinta el servidor, la segunda el service worker con `/_fudic/data/…`, `news` no vuelve a pedir datos hasta pasados 10 segundos y `live` los pide siempre; con el servidor parado se ven las dos (la de `cache-first` con los datos caducados) y la portada; sin `'unsafe-eval'` en `sw.headers`, el `FUD1548` del build. Con Chrome sin cabeza. Hallazgos 92 (el id del build no cambia con la línea `load` ni con `sw.headers`) y 93 (el mensaje de `FUD1548`) del framework. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `isomorphic`, con su solución en `tutorials/isomorphic/`: un contador con `signal`, `computed`, un `effect` que pone el título y un handler; en `fudic dev`, el código fuente trae el botón pintado (`1 · 2`) y el título sin tocar; un signal con `window.innerWidth` en lo que se muestra da `FUD0907` en la terminal y en el editor, y con `signal(0)` y `afterHydrate` el servidor pinta `0px` y el navegador el ancho de verdad; el `<main>` de `fudic dev`, de `dist/index.html` y del documento que pinta el service worker en `fudic preview`, idéntico en los tres. Con Chrome sin cabeza. Hallazgo 94 del framework (el mensaje de `FUD0907` con `window`) y el 67 vuelto a comprobar. Completa la categoría Service worker. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | A petición de Pedro, la categoría Seguridad, un commit por tutorial. `security-headers`, con su solución en `tutorials/security-headers/`: el `page.headers` que escribe `fudic new`; con `curl -sI` sobre `fudic dev`, `referrer-policy` y `cross-origin-opener-policy`, sin la CSP ni HSTS; `Permissions-Policy` añadida con `fudic dev` en marcha y servida sin reiniciar; el `FUD1543` de `camera 'none'` en la terminal y en el language server (solo «Explain FUD1543»); y con `@vitejs/plugin-basic-ssl` y `pnpm preview`, por HTTP/2, `strict-transport-security` y la CSP. Menú `securityNav` y tarjeta de la portada enlazada. Medida con HTTP Observatory (`@mdn/mdn-http-observatory`) una app nueva, en HTTPS con una CA local y una redirección de HTTP a HTTPS: 105, A+, 9 de 10; con `X-Content-Type-Options: nosniff`, 110, 10 de 10 (hallazgo 95 del framework). Hallazgo 96 (`Permissions-Policy` solo se comprueba por su sintaxis) y el 6 de la CLI otra vez. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `csp`, con su solución en `tutorials/csp/`: sobre `pnpm build` y `fudic preview`, dos `curl -sI` con un nonce distinto y el mismo en el `nonce` del script de arranque; un `public/hello.js` cargado al final de la página, sin nonce y bloqueado por Chrome sin cabeza, y en el `<head>`, con nonce y ejecutado; el `FUD1545` de quitar `'nonce-{nonce}'` en el build y en el language server, con «Add 'nonce-{nonce}'», y el `FUD1547` de `'unsafe-inline'` sin nonce; y el `FUD1547` de `'unsafe-eval'`, que no para el build. `security-headers` enlaza ya a este tutorial. Hallazgos 97 (un `<script src>` en el cuerpo sale sin nonce y nadie avisa) y 98 (`FUD1547` no ofrece quitar el valor) del framework, y el 6 de la CLI otra vez. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `trusted-types`, con su solución en `tutorials/trusted-types/`: `fudic g component notice --in`, un botón que escribe un mensaje con `innerHTML`, el `FUD1555` en el language server y en `pnpm build`; en `fudic preview`, con un clic real en Chrome sin cabeza, el párrafo vacío y «This document requires 'TrustedHTML' assignment»; con `textContent`, el mensaje como texto; y con `trustedHtml` y `@raw`, la negrita sin errores en la consola. Hallazgo 99 del framework (`FUD1555` sin «Explain» ni arreglo; `trustedHtml` dentro de un `signal` da `FUD1140`) y el 6 de la CLI otra vez. Completa la categoría Seguridad. Lighthouse en el tutorial y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | A petición de Pedro, un tutorial nuevo en Seguridad, `observatory` (61b), con su solución en `tutorials/observatory/`: cómo medir una app con HTTP Observatory sin desplegarla. `fudic preview` detrás de un túnel rápido de Cloudflare (`cloudflared tunnel --url`), el `Blocked request` de Vite resuelto con `preview.allowedHosts`, y la API de Observatory: 75, B, porque Cloudflare habla HTTP con la preview y Fudic no manda HSTS; con `serve.trustProxy`, 115, A+, con `X-Content-Type-Options` fallando; con `nosniff` en `page.headers`, 120, A+, 12 de 12. Cloudflare pone la redirección de HTTP a HTTPS. El hallazgo 95 del framework, ampliado con la medida de la web y con HSTS detrás de un proxy, que «Lo que trae de serie» y «Las cabeceras» no contaban; corregidas. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | A petición de Pedro, la categoría Rendimiento, un commit por tutorial. `caching`, con su solución en `tutorials/caching/`: `pnpm build` y los nombres con hash; con `curl -sI` sobre `fudic preview`, la hoja de la guía con `immutable`, el arranque `fudic-boot-…js` con `no-cache` y la página sin `Cache-Control`; el `304` con `If-None-Match`; un bloque `/fudic-boot-*.js` con un año de caché, y un párrafo nuevo que cambia el nombre del arranque y de la hoja pero no el del logo ni el de las fuentes; y el `FUD1552` de un `public/prices.json` con un día de caché, resuelto con cinco minutos. Comprobado también en Chrome sin cabeza (sin service worker): en la segunda visita, la hoja, el arranque, la fuente y el logo salen del caché de disco. «Las cachés del navegador» enseñaba el runtime sin el hash del paquete y no nombraba `fudic-boot`; corregida. Hallazgo 5 del framework y 9 de la CLI, vueltos a comprobar. Menú `performanceNav` y tarjeta de la portada enlazada. Lighthouse en el tutorial y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `lighthouse`, con su solución en `tutorials/lighthouse/`: con la CLI de Lighthouse 12.8.2, `fudic dev` saca 92 en móvil (JavaScript sin minificar ni comprimir) y el build 100/100/100/90, con la meta description como único fallo; una imagen sin `alt` ni tamaño y un enlace «here» bajan accesibilidad a 87 y SEO a 82, y corregidos vuelven a 100; con ese párrafo, el rendimiento móvil se queda en 90 (primer pintado en 2,8 s) por la fuente Inter de la guía, y con la del sistema vuelve a 100 (0,9 s), medido varias veces; escritorio, 100 en los cuatro. Cada factor, aislado y medido por separado. El hallazgo 23 de la CLI, vuelto a comprobar. Con él, la categoría Rendimiento queda escrita entera, en revisión. Lighthouse en el tutorial: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | A petición de Pedro, la categoría Proyecto y build, un commit por tutorial. `baseline`, con su solución en `tutorials/baseline/`: `fudic g component note --in`, una nota con `field-sizing: content` y los dos `FUD1524` en `fudic dev` y en el language server, con «Move to @supports (field-sizing: content)», que los quita; un fundido con `@starting-style` y «Allow starting-style in the project», que convierte `baseline` en objeto, comprobado con `pnpm build`; y `"target": 2023`, con el `FUD1525` del mínimo de Fudic (Declarative Shadow DOM, marzo de 2024), un `FUD1524` en `src/guide/p.css` y «Raise to 2024». En Chrome sin cabeza, la nota pasa de 77 a 146 px con cinco líneas y aparece de opacidad 0 a 1. Menú `projectNav` y tarjeta de la portada enlazada. Hallazgos 71 del framework, ampliado a `baseline` (`fudic dev` no vuelve a comprobar al cambiar `fudic.json`), y 100 (un año entre comillas da además un `FUD0726` falso). Lighthouse en el tutorial y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `workspace`, con su solución en `tutorials/workspace/`: `fudic new shop --workspace --app web` (la guía en `libs/guide`), `fudic g lib ui` y `fudic g component badge --project ui` con un slot, `fudic add ui --project web` y el `<link>` por el nombre del paquete, `fudic g app admin --uses ui` en `/admin/`, y `pnpm dev` con las dos apps en un puerto: al cambiar el color de la insignia en la librería, las dos recargan y las dos insignias cambian (medido en Chrome sin cabeza). `pnpm test` (tres proyectos), `pnpm build` (un `dist/` por app) y `pnpm preview`, comprobados. El montaje pone los overrides de los tarballs en el `pnpm-workspace.yaml` del workspace y la solución lleva el original. Hallazgo 31 de la CLI (`fudic preview` anuncia un puerto que otro proceso tiene en `[::1]`). Con él, la categoría Proyecto y build queda escrita entera, en revisión. Lighthouse en el tutorial: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | A petición de Pedro, la categoría Agentes; la de Tests queda para otra sesión. `mcp`, con su solución en `tutorials/mcp/` (con el `.fudlog` de la pieza): una conversación real con Claude Code (Sonnet, `claude -p` con `--resume`, siete turnos) en un proyecto de `fudic new`. `fudic_status` con la portada en `criteria`; un componente «In stock» / «Out of stock» pedido con palabras, con una prop y dos criterios aprobados; el modelo cambió un test en la fase de vista y lo explicó al pedírselo; las capturas de texto plano, cambiadas a una insignia verde y gris y aprobadas; `done`, comprobado con `fudic history` y `pnpm spec` (2/2). El tutorial cita las respuestas como ejemplo, porque cada agente responde con sus palabras. Hallazgos 47 del framework, vuelto a comprobar (tokens sin acordar, `next` de criterios con los tests en rojo), y 101 (`fudic_generate` con un nombre con guion deja el componente sin prefijo; un test cambiado en `view` no avisa). Con él, la categoría Agentes queda escrita, en revisión. Lighthouse en el tutorial y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | A petición de Pedro, la categoría Tests, rehecha en seis tutoriales (§3.14), un commit por tutorial. `unit-tests`, con su solución en `tutorials/unit-tests/`: `fudic g component counter` y el test que deja, un contador con la prop `start`, dos tests con `mount`, `getByRole` (el `<output>` es `status`) y `t.click`, y el fallo real de `fudic test` al cambiar el `+ 1` por `+ 2`. Menú `testsNav` y tarjeta de la portada enlazada. Hallazgo 6 de la CLI otra vez. Lighthouse en el tutorial y en la portada: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `page-tests`, con su solución en `tutorials/page-tests/`: un menú en el layout probado con `renderLayout`; `fudic g pipe shout` con `toLocaleUpperCase`, el test generado que falla al implementarlo y dos tests con `format` (inglés y turco, `İSTANBUL`); y `/about` con el pipe, probada con `visit` (título, `<h1>`, el enlace del layout y el aviso). Pedro aclaró que su «spinner» era un pipe propio: el snippet del primer borrador sale. Hallazgo 102 del framework (`visit` lanza con una URL sin ruta en vez del 404 de `fudic dev`). Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `load-tests`, con su solución en `tutorials/load-tests/`: `fudic g page books --server` con un `load` de `Book[]` que lee un módulo de datos; `visit` con el `load` de verdad (tres `<li>`); `vi.mock` del módulo con `importOriginal` y `vi.fn(real)`, una lista vacía con `mockResolvedValueOnce([])` y un `500` con `mockRejectedValueOnce`; y `data` en `visit`, que no ejecuta `load`. `tsc --noEmit` limpio. Hallazgo 103 del framework (sin `getAllByRole`; `data` de `visit` sin tipo). Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `function-tests`, con su solución en `tutorials/function-tests/`: `fudic g api src/routes/index.fud`, `login` y `secret` con `chain use auth` y `skip auth`, un middleware `auth` que lee la cookie; `secret()` llamada desde el test (401 con `HttpError`, y la respuesta tras `login`, con la cookie entre llamadas y vacía en cada test); la portada con `task`, probada con `page.click` entrando y sin entrar; y un 503 con `fetch` y `respondProblem`. `tsc --noEmit` limpio. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `form-tests`, con su solución en `tutorials/form-tests/`: `fudic g form signup` y `pnpm add @fudic/http@0.0.1` (sin él, `fudic test` falla en todos los ficheros: el 26 de la CLI, peor); un alias con `required`, `pattern alias` y la regla `alias-taken` `runs remote`; las dos primeras probadas sin página con `$validate`, `message` y `$reset`; `fudic g api` y `post signup` con `form signupForm`; y el envío con `page.type`, `page.submit` y `page.errorOf`, con `addUser` simulado. `tsc --noEmit` limpio. Hallazgo 104 del framework (una regla remota no se prueba con el formulario solo). Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `custom-terms`, con su solución en `tutorials/custom-terms/`: el contador con un criterio de tres `click` y un `text`, reescrito como `adds 3` / `shows 3`; el `FUD0940` de `fudic spec` y del language server (con «Create then/shows.js»); `fudic g term when adds --param times:number` con `ctx.act` en un bucle y `fudic g term then shows --param count:number` con `pass`, `evidence` y `describe`; el fallo real con `+ 2` («expected 3, actual 6») y un segundo criterio `adds 10`. Hallazgo 105 del framework (el primer `fudic spec` de un proyecto nuevo acaba en error). Con él, la categoría Tests queda escrita entera. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `load-tests`, paso 5, a petición de Pedro («no dejas nada»): `fudic g page week --server` con `load ssr` y `bestseller str later`, `@await` y `@catch`, el servicio lento simulado en el test y su fallo, que deja la página en 200 y pinta el `@catch`. Comprobado con `fudic dev`: primer byte a 0,07 s y página entera a 2,07 s. Hallazgo 106 del framework (`visit` con `data` da 500 si la página tiene un `later`). |
| 2026-11-26 | `function-tests`, paso 5: la cadena global en `src/http.fudapi` con un middleware `maintenance` que responde 503 mientras `isClosed()`; probado en un fichero propio con `vi.mock`, donde hasta `login`, que se salta `auth`, responde 503. `tsc --noEmit` limpio. |
| 2026-11-26 | `showcase`, con su solución en `tutorials/showcase/`: una insignia con `text` y `tone`, su fixture con `base` y `warning`, `fudic g showcase` (las dos páginas, vistas con `curl` en `fudic dev`), dos criterios con `props base` y `props warning`, y un caso `sold-out` que el showcase no ve hasta volver a ejecutar el comando, ni con `fudic dev` en marcha. Hallazgo 32 de la CLI (`Showcase of  in`, con el nombre vacío) y corregida la frase de `cli/generate/showcase`, que daba a entender que se rehace solo. Lighthouse: 99–100 / 100 / 100 / 100. |
| 2026-11-26 | `user-flows`, con su solución en `tutorials/user-flows/`: la portada con `login` (cookie `session`) y `/account` con un `load` que la lee; `fudic g flow sign-in` con `url /`, `click` y `go /account`; un segundo criterio con `as luis` que no ve la sesión de Ana; y el fallo real al cambiar el saludo («expected contains "Hello, Ana."», «actual "Welcome, Ana."»). Lighthouse: 99–100 / 100 / 100 / 100. |
