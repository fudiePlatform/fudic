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
| 32 | `route-data` | Datos del servidor para la página | I | — | routing/data | `/blog`, `src/server/blog.ts` | Propuesto |
| 33 | `alternate-layouts` | Varios layouts, y uno con marco | I | `g layout` | template-syntax/routes-and-layouts | `/marco`, `/marco-sin-lateral` | Propuesto |
| 34 | `slow-pages` | Páginas lentas: renderizado en streaming | A | — | routing/rendering | `/lento` | Propuesto |
| 35 | `page-maps` | Lo que la página le cuenta al runtime | A | — | performance (por confirmar) | `/mapas` | Propuesto |
| 36 | `early-hints` | Early hints | A | — | routing/early-hints | — | Propuesto |

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
| 44 | `server-functions` | Funciones de servidor | I | `add http` | server, server/functions | `/usuarios` | Propuesto |
| 45 | `json-api` | Una API con su `.fudapi` | I | `g api` | server, cli/generate/api, reference/fudapi | `src/server/` | Propuesto |
| 46 | `server-types` | Tipos compartidos entre cliente y servidor | I | — | server/types | `/usuarios` | Propuesto |
| 47 | `middlewares` | Un middleware de login | I | — | server/middlewares | `/entrar`, `/cuenta`, `src/server/auth.ts` | Propuesto |
| 48 | `pipes` | Los pipes de Fudic, y uno propio | I | `g pipe` | server/pipes | — | Propuesto |
| 49 | `session` | Sesión: una petición no ve lo que publicó otra | A | — | server/session | `/sesion/[user]` | Propuesto |
| 50 | `live-search` | Una búsqueda que sigue a una signal | A | — | server/task | `/usuarios` (Búsqueda lenta) | Propuesto |
| 51 | `production-server` | Arrancarlo en Node | A | `preview` | server/running | `node-server.mjs` | Propuesto |

### 3.9 Inyección de dependencias

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 52 | `services` | Un servicio inyectado | I | `add di`, `g service` | di | `src/services/` | Propuesto |
| 53 | `providers` | Un servicio compartido por quien no se ve | I | — | di/providers | `/di`, `di-owner`, `di-panel` | Propuesto |
| 54 | `server-di` | Proveedores en el servidor, por petición | A | — | di/server | `src/server/di.ts` | Propuesto |

### 3.10 Internacionalización

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 55 | `two-languages` | Tu app en dos idiomas | P | `add i18n`, `translate` | i18n, i18n/catalogs, cli/translate | `examples/i18n` | Propuesto |
| 56 | `localized-urls` | URLs con idioma y un selector | I | — | i18n/urls | `examples/i18n` | Propuesto |
| 57 | `plurals-and-formats` | Plurales, moneda y fechas | I | — | i18n/code | `examples/i18n` | Propuesto |

### 3.11 Service worker

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 58 | `service-worker` | Arrancar el service worker | I | `preview` | service-worker, configuration/sw-json | `sw.json` | Propuesto |
| 59 | `offline` | Funcionar sin red: estrategias de caché | A | — | service-worker/caching, service-worker/headers | `sw.json`, `sw.headers` | Propuesto |
| 60 | `isomorphic` | Render isomórfico: el mismo HTML en tres sitios | A | — | service-worker/isomorphic | `tests/sw-render.spec.ts` | Propuesto |

### 3.12 Seguridad

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 61 | `security-headers` | Cabeceras de seguridad | I | — | security, security/headers | `page.headers`, `assets.headers` | Propuesto |
| 62 | `csp` | Content Security Policy | A | — | security/csp | `page.headers` | Propuesto |
| 63 | `trusted-types` | Trusted Types | A | — | security/trusted-types | — | Propuesto |

### 3.13 Rendimiento

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 64 | `caching` | Caché HTTP de páginas y assets | A | — | performance/caching | `assets.headers` | Propuesto |
| 65 | `lighthouse` | Un 100 en Lighthouse | A | `preview` | performance/lighthouse | — | Propuesto |

### 3.14 Tests

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 66 | `unit-tests` | Tests unitarios | P | `test` | testing, testing/unit | `*.test.ts` | Propuesto |
| 67 | `fudspec` | Criterios en `.fudspec` y el workbench | I | `g spec`, `spec` | testing/workbench, reference/fudspec | `app-card.fudspec`, `app-tabs.fudspec` | Propuesto |
| 68 | `showcase` | Un showcase de cada componente | I | `g showcase` | cli/generate/showcase | — | Propuesto |
| 69 | `user-flows` | Un flujo entre páginas | A | `g flow` | testing/pages-and-flows | `src/flows/alta-de-usuario.fudspec` | Propuesto |
| 70 | `history` | Aprobar y aceptar: el historial de una pieza | A | `approve`, `accept`, `history` | testing/history, cli/history | — | Propuesto |
| 71 | `custom-terms` | Tus propios pasos en `.fudspec` | A | `g term` | terms, terms/step-by-step, terms/bench | `fudic/terms/` | Propuesto |

### 3.15 Proyecto y build

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 72 | `baseline` | Baseline: qué navegadores soportas | I | — | configuration/baseline | `/baseline`, `fudic.json` | Propuesto |
| 73 | `workspace` | Dos apps y una librería | A | `new --workspace`, `g app`, `g lib`, `add` | cli/new, cli/generate/app, cli/generate/lib, cli/add | `examples/workspace` | Propuesto |

### 3.16 Agentes

| # | Slug | Tutorial | Nivel | CLI | Docs | En basic | Estado |
|---|---|---|---|---|---|---|---|
| 74 | `mcp` | Construir con tu agente usando el MCP de Fudic | I | — | `/mcp`, `/mcp/connect` | — | Propuesto |

**Total:** 74 tutoriales: 21 de principiante, 33 de intermedio y 20 de avanzado.

### 3.17 Por comprobar antes de escribir

- La configuración de diagnósticos (`"diagnostics": { "warnings": "error" }`) y la Vite build
  (`vite/build`): si dan para un tutorial propio o van dentro de `editor` (3), `baseline` (72) y
  `lighthouse` (65).
- La página de la Documentación de `page-maps` (35): no hay una que lo cuente con ese nombre
  (`client-components`, 25, enlaza a Ciclo de vida, que cuenta `afterCreate`). Si falta, se apunta como hueco de la Documentación.
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
