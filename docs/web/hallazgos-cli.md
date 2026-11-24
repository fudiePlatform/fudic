# Hallazgos de la CLI

La web se crea y crece solo con la CLI (README §6). Cada vez que la CLI no hace lo que debería,
o hay que retocar a mano lo que genera, se anota aquí: qué pasó, cómo se resolvió en la web y qué
debería hacer la CLI. Es la lista de la que saldrán los BUG.

Versión de la CLI: la del repo, publicada en Verdaccio (`pnpm registry`) e instalada global.

## 1. `fudic new` dentro de un repo git existente hace su propio `git init`

- **Qué pasó.** `fudic new web --workspace …` en el worktree creó `web/.git` y un commit
  (`chore: create workspace web`). Un `git add web` lo habría tratado como repo incrustado.
- **Cómo se resolvió.** Se borró `web/` y se regeneró con `--no-git`.
- **Qué debería hacer.** Detectar que ya está dentro de un repo (`git rev-parse`) y no inicializar
  otro, como `create-vite` o `ng new`.

## 2. `fudic new --workspace` dentro de un workspace pnpm crea uno anidado

- **Qué pasó.** Generó su propio `pnpm-workspace.yaml`, `pnpm-lock.yaml` y `node_modules`, con
  `@fudic/*` en `0.0.1` desde el registry. pnpm no lee un `pnpm-workspace.yaml` dentro de otro
  workspace.
- **Cómo se resolvió, a mano:**
  - `web`, `web/apps/*` y `web/libs/*` se añadieron al `pnpm-workspace.yaml` de la raíz y se borró
    el de `web/`;
  - las dependencias `@fudic/*` pasaron a `workspace:*`;
  - la raíz de `web/` se quedó solo con `dev` y `preview`. Su `build` (`pnpm -r build`), dentro del
    monorepo, relanzaba el build de todo el repo, y `build`, `test` y `spec` duplicaban el fan-out
    de la raíz.
- **Qué debería hacer.** Detectar el workspace de fuera y sumarse a él: registrar sus carpetas en
  el `pnpm-workspace.yaml` existente y no escribir uno propio.

## 3. Quitar el Service Worker deja restos

- **Qué pasó.** La web no usa Service Worker. Se borró `sw.json`, como dice el README de la app
  («delete it for no Service Worker»). La build lo detectó bien: dejó de emitir `fudic-sw.js` y
  avisó con FUD1554 de que `sw.headers` ya no aplicaba a nada. Pero:
  - el README de la app sigue hablando de `sw.json` y `sw.headers`;
  - el comentario de `page.headers` dice «what the Service Worker paints».
- **Con `--no-sw` pasaría lo mismo.** No genera `sw.json` ni `sw.headers`, pero
  `templates/README.md.tmpl` y la plantilla de `page.headers` (`@fudic/config`,
  `headers/templates.ts`) son fijas y mencionan el Service Worker.
- **Cómo se resolvió.** Se borraron `sw.json` y `sw.headers`, y se quitaron a mano las menciones
  del README y de `page.headers`.
- **Qué debería hacer.** Que las plantillas dependan de si hay Service Worker. El README de la app
  debería decir que se borren los dos ficheros, no solo `sw.json`.

## 4. La CLI recomienda `pnpm dev` y no sus propios comandos

- **Qué pasó.** La CLI tiene `fudic dev`, `fudic test` y `fudic spec`, pero su propia salida manda
  a los scripts de pnpm. Lo hacen el «Next» de `fudic new` (`pnpm dev`, `pnpm test`, `pnpm spec`),
  la tabla de `fudic g component` (`pnpm test`, `pnpm spec`) y el README de la app
  (`pnpm run dev`…).
- **Y con `--pm npm` recomienda comandos que no existen.** El «Next» dice `npm dev` y `npm spec`,
  pero npm solo ejecuta así sus scripts integrados (`npm test` sí funciona). Los demás necesitan
  `npm run dev` y `npm run spec`. El README sí lo escribe bien.
- **Cómo se resolvió.** En la documentación de la web se enseñan los comandos de la CLI
  (`npx fudic dev`, `npx fudic test`, `npx fudic spec`). La salida de la CLI que aparece citada se
  deja tal cual la imprime.
- **Qué debería hacer.** Recomendar sus propios comandos (`fudic dev`…), que funcionan igual con
  cualquier gestor de paquetes. Si sigue recomendando scripts, con `npm run` para npm.

## 5. `--project ui` escoge el `ui` de otro workspace

- **Qué pasó.** Desde `web/`, `fudic g c code --project ui --dry-run` iba a escribir en
  `examples/workspace/libs/ui/…`. Con `web/` integrado en el monorepo, la CLI sube hasta el
  `pnpm-workspace.yaml` de la raíz, ve todos los proyectos del repo y se queda con el primero que
  se llama `ui`. Sin `--dry-run`, habría escrito en un ejemplo ajeno sin avisar.
- **Cómo se resolvió.** Los generadores se lanzan desde dentro del proyecto (`web/libs/ui`,
  `web/apps/site`) y sin `--project`: la CLI usa el `fudic.json` más cercano, y ahí acierta.
- **Qué debería hacer.** Ante dos proyectos con el mismo nombre, no escoger uno: decir que el
  nombre es ambiguo y listar las rutas. Y preferir el proyecto más cercano al directorio actual. Se
  relaciona con el nº 2: la CLI no sabe vivir dentro de un monorepo que no ha creado ella.
- **Vuelto a comprobar (Herramientas), el 2026-11-23.** Desde `web/apps/site`,
  `fudic dev --project nope` responde con los 23 proyectos del repo, entre ellos fixtures de tests
  como `FUD0744` o `FUD1442`, y `admin` y `ui` repetidos.
- **Vuelto a comprobar (app del MCP), el 2026-11-23, y ahora bloquea.** Desde `web/`,
  `fudic g app mcp --no-sw --dry-run`, sin `--uses`, termina con dos errores de proyectos ajenos:
  `FUD0785` («--uses FUD1442: that is an app») y `FUD0724` («the id "fixes" is declared by more
  than one project: FUD0744, FUD0855, FUD1442»). Son los fixtures de
  `packages/diagnostics/fixtures`, que no están en el `pnpm-workspace.yaml`. Con `--uses ui`,
  `--uses @web/ui` o `--uses libs/ui` tampoco encuentra la librería de la web. Rodeo: se ejecutó
  la CLI sobre una copia de `web/` fuera del monorepo, con su propio `pnpm-workspace.yaml`, y se
  trajo `apps/mcp` al repo. Ahí la CLI creó la app con `--layout @web/ui/layouts/docs.fud` sin
  problema. Después se ajustó a mano lo mismo que en `site` (§6.1 del plan): `@fudic/*` a
  `workspace:*`. Además se quitó `"locales": ["es"]`, que `--locale es` escribe y la web aún no
  usa. **Qué debería hacer, además:** validar solo los proyectos que toca el comando, y no
  tratar como proyecto una carpeta que el `pnpm-workspace.yaml` no incluye.

## 6. `fudic g page --layout @web/ui/…` revienta, y la alternativa escribe una ruta frágil

- **Qué pasó.** En `web/apps/site`,
  `fudic g page docs/getting-started --layout @web/ui/layouts/docs.fud` termina con
  `error ENOENT: … examples\vista-errores\package.json`. Para resolver el href recorre todos los
  proyectos del `pnpm-workspace.yaml` de la raíz, y `examples/vista-errores` es una carpeta sin
  `package.json` (encaja en `examples/*`). Un proyecto ajeno roto tumba el comando.
- **La alternativa.** Con la ruta relativa (`--layout ../../libs/ui/src/layouts/docs.fud`) sí
  genera la página, pero escribe `<link rel="layout" href="../../../../../libs/ui/src/layouts/docs.fud">`:
  una ruta que cruza de un paquete a otro y se salta los `exports` de la librería.
- **Cómo se resolvió.** Se generó con la ruta relativa y se cambió el `href` a mano por
  `@web/ui/layouts/docs.fud`.
- **Qué debería hacer.** Ignorar, o como mucho avisar de, las carpetas del workspace que no son
  proyectos, en vez de abortar. Y cuando el layout es de otro paquete, escribir el enlace por el
  nombre del paquete aunque se le haya dado por ruta.
- **Se repitió** con las ocho páginas del capítulo 2 (`docs/template-syntax/…`): mismo rodeo y
  mismo `href` corregido a mano.
- **Y otra vez** con las cuatro páginas del capítulo 4 (`docs/styles/…`), el 2026-11-19.
- **Y otra vez** con las dieciocho páginas de los capítulos 5, 6 y 7 (`docs/server/…`,
  `docs/routing/…`, `docs/service-worker/…`), el 2026-11-20.
- **Y otra vez** con las siete páginas del capítulo 8 (`docs/forms/…`), el 2026-11-20. Esta vez
  con la ruta relativa no revienta, pero escribe el mismo `href` frágil y el `<title>` «Binding».
- **Y otra vez** con las tres páginas del capítulo Plugin de Vite (`docs/vite/…`), el 2026-11-23:
  mismo `href` frágil, corregido a mano.
- **Y otra vez** con las cuatro páginas del capítulo Editores (`docs/editors/…`), el 2026-11-23.
- **Y otra vez** con las 31 páginas del capítulo Herramientas (`docs/cli/…`, `docs/tools/format`), el
  2026-11-23: mismo `href` frágil, corregido a mano, y títulos como «Error-page».
- **Y otra vez** con la página de diagnósticos de Referencia (`docs/reference/diagnostics`), el
  2026-11-23: sin `--layout` escribe `../../../layouts/_layout.fud`, corregido a mano.
- **Y otra vez** con las otras once páginas de Referencia (`docs/reference`, `docs/reference/…`), el
  2026-11-23: el mismo `href` y títulos como «Fudapi», corregidos a mano.
- **Y otra vez** con la app del MCP, el 2026-11-23: dentro del monorepo,
  `fudic g app mcp --layout @web/ui/layouts/docs.fud` termina con el mismo `ENOENT` sobre
  `examples\vista-errores\package.json`. Fuera del monorepo el mismo comando funciona. El rodeo
  está en el nº 5.
- **Y peor** con las cuatro páginas de Dirigir un modelo (`web/apps/mcp`, el 2026-11-23): como
  la app no tiene layout propio, su layout por defecto es el de `@web/ui`, y `fudic g page roles`
  revienta igual **sin** `--layout`. Con la ruta relativa genera la página, con el `href` frágil
  y títulos como «Roles», corregidos a mano.
- **Y otra vez** con las dos páginas de Conectarlo de la sección MCP (`connect`, `connect/chat`), el
  2026-11-24: revienta con `--layout @web/ui/layouts/docs.fud`; con la ruta relativa, el `href`
  frágil y los títulos «Connect» y «Chat», corregidos a mano.
- **De paso.** El `<title>` y el `<h1>` generados dicen «Getting-started»: la CLI pone en mayúscula
  la primera letra del segmento, pero deja el guion.

## 7. No hay generador para la hoja de estilos de un layout

- **Qué pasó.** El light DOM de un layout (cabecera, columnas, pie) se estiliza con una hoja que el
  layout enlaza (`<link rel="stylesheet" href="../styles/docs.css">`). `fudic g style` no sirve
  para eso: escribe una hoja de `globalStyles`, que se adopta dentro de los shadow roots.
- **Cómo se resolvió.** `web/libs/ui/src/styles/docs.css` se escribió a mano, y el enlace también.
- **Qué debería hacer.** Que `fudic g layout` cree su hoja y la enlace, o que `fudic g style`
  tenga una opción para una hoja de página.

## 8. `fudic preview` en una app sirve todas las del monorepo

- **Qué pasó.** Su ayuda dice «In an app, that app alone». Desde `web/apps/site`, `fudic preview`
  intentó servir todas las apps del `pnpm-workspace.yaml` de la raíz y terminó con un
  `FUD0454` por cada una sin compilar (`project`, `render-project`, `vista-errores`…).
- **Cómo se resolvió.** `fudic preview --project site`. Funciona porque solo hay un proyecto
  `site` en todo el repo (ver el nº 5).
- **Qué debería hacer.** Lo que dice su ayuda: dentro de una app, solo esa app. Es la misma causa
  que el nº 2 y el nº 5.
- **Vuelto a comprobar (capítulo 13, Pruebas), el 2026-11-23.** `fudic dev` hace lo mismo: desde
  `web/apps/site` arrancó las 18 apps del repo («fudic dev — 18 apps on one port»), y la web no
  respondía en `/docs/…`. Con `--project site`, una sola.

## 9. `fudic new` escribe un `assets.headers` que deja sin caché lo que emite Fudic

- **Qué pasó.** La plantilla solo da caché larga a `/assets/**`; el runtime (`/_fudic/**`) y el
  coordinador de cada ruta (`/fudic-main-*.js`) salen con `no-cache`. Detalle completo, con los
  problemas del formato y un falso `FUD1552`, en el nº 5 de
  [hallazgos-fudic.md](hallazgos-fudic.md).
- **Cómo se resolvió.** Tres bloques a mano en `web/apps/site/assets.headers`.
- **Qué debería hacer.** Que la app nazca con esos tres patrones en la plantilla, o que Fudic se
  encargue de la caché de sus propios ficheros y la plantilla no tenga que nombrarlos.

## 10. No hay generador para una hoja que los componentes eligen (`styles`)

- **Qué pasó.** Al documentar las hojas compartidas (capítulo 4). `fudic g style <n>` crea la hoja
  y la añade a `globalStyles`, que adoptan **todos** los componentes. Para una hoja de `styles`,
  la que cada componente elige en `shadowrootadoptedstylesheets` (como `panel` en
  `examples/basic`), no hay comando: hay que crear el fichero y escribir la entrada de
  `fudic.json` a mano.
- **Cómo se resolvió.** La documentación enseña `fudic g style` solo para `globalStyles`; `styles`,
  editando `fudic.json`.
- **Qué debería hacer.** Una opción de `fudic g style` (`--chosen`, o similar) que la declare en
  `styles`. Junto con el nº 7 (la hoja de un layout), que un solo comando cubra los tres sitios
  donde puede ir una hoja.


## 11. No hay `fudic build`

- **Qué pasó.** Al documentar el servidor (capítulo 5). La CLI tiene `fudic dev`, `fudic preview`,
  `fudic test` y `fudic spec`, pero no `build`. La ayuda de `preview` dice «Build first with pnpm
  build», y lo que corre es el `vite build` de cada app.
- **Cómo se resolvió en la web.** «El servidor» dice que el build lo hace Vite, con el script
  `build` de la app.
- **Qué debería hacer.** Un `fudic build` que construya las apps del workspace, o de una con
  `--project`, igual que `dev` y `preview` las sirven. Así el ciclo entero se hace con la CLI.

## 12. No hay generador para un middleware ni para una regla

- **Qué pasó.** Al documentar el `.fudapi` (capítulo 5). Existen `fudic g api`, `g form` y
  `g pipe`. Un middleware (su `.fudapi` y sus dos mitades, en `src/server` y `src/browser`) y una
  regla (su `.fudapi` y su `check` en la carpeta que toca según `runs`) se escriben a mano.
- **Cómo se resolvió en la web.** La documentación lo dice: se escriben a mano.
- **Qué debería hacer.** `fudic g middleware <n> [--client] [--server]` y
  `fudic g rule <n> --runs both|server|remote`, que escriban la declaración y su implementación
  vacía en su sitio, como `g pipe`.

## 13. La ayuda general no lista `generate pipe` ni `check`

- **Qué pasó.** `generate pipe` está en `packages/cli/src/help/commands.ts:248`, pero no en la ayuda
  general (`help/general.ts`). `run.ts:306` tiene un comando `check` que ninguna ayuda menciona.
- **Qué debería hacer.** Que la ayuda general liste todos los comandos que existen.
- **Vuelto a comprobar (Herramientas), el 2026-11-23.** Sigue sin `generate pipe`. Además, la línea
  de `fmt` dice «format .fud and .fudspec files», y `fudic fmt` formatea también los `.fudapi`
  (su propia ayuda sí lo dice).

## 14. Los diagnósticos enlazan a `http://localhost:8080/diagnostic`

- **Qué pasó.** Al documentar la CLI. Cada error de la CLI, y cada aviso del build, termina con un
  enlace como `http://localhost:8080/diagnostic#FUD0443`. La dirección sale de `fudic.docs` en el
  `package.json` de `@fudic/diagnostics` (`packages/diagnostics/src/docs.ts`), y la versión
  publicada lleva la de desarrollo.
- **Cómo se resolvió en la web.** Las salidas citadas en la documentación no copian esa línea.
- **Qué debería hacer.** Publicar con la dirección pública del catálogo de diagnósticos, o no
  imprimir el enlace mientras no exista.
- **Resuelto (Referencia), el 2026-11-23.** `fudic.docs` es `https://fudic.dev/docs/reference/diagnostics`
  y `docsUrl()` pone el código en la ruta (`…/diagnostics/FUD0443`): la página se pinta en el
  servidor y un ancla no le llegaría.

## 15. `fudic --version` enseña la ayuda entera

- **Qué pasó.** No hay `--version` ni `-v`: `fudic --version` imprime la ayuda general, con la
  versión en la primera línea, y sale con 0.
- **Cómo se resolvió en la web.** La documentación no lo menciona.
- **Qué debería hacer.** `fudic --version` y `fudic -v` imprimen solo la versión, como cualquier CLI.

## 16. `fudic g api` sobre un fichero que no existe dice que no es una ruta

- **Qué pasó.** `fudic g api src/routes/about.fud` con `about.fud` sin crear responde
  `FUD1240: src/routes/about.fud is not a route or a component: only they have a server`. Lo es; lo
  que pasa es que no existe.
- **Cómo se resolvió en la web.** El ejemplo se ejecutó con la página ya creada.
- **Qué debería hacer.** Decir que el fichero no existe, y cómo crearlo (`fudic g page about`).

## 17. `--force --dry-run` sobre un fichero idéntico enseña un cambio vacío

- **Qué pasó.** `fudic g page about --force --dry-run` con la página recién generada lista
  `modify src/routes/about.fud` y `modify src/routes/about.test.ts`, cada uno con una cabecera de
  diff (`@@ line 9 @@`) y ninguna línea debajo.
- **Qué debería hacer.** No listar como cambio un fichero que queda igual.

## 18. `fudic accept --dry-run` dice `(in )`

- **Qué pasó.** Desde la raíz del proyecto, dentro de un repo git, la línea de la etiqueta sale como
  `run git tag accepted/shop-cart/2026-11-23 (in )`: la carpeta vacía. El resto de comandos dicen
  `(in .)`.
- **Cómo se resolvió en la web.** La página de `fudic accept` no cita la salida; lo dice en prosa.
- **Qué debería hacer.** `(in .)`, como los demás.

## 19. `fudic g api` añade `@fudic/http` con versión fija dentro de un workspace

- **Qué pasó.** En `web/apps/site`, `fudic g api src/routes/docs/reference/diagnostics.fud`
  (2026-11-23) añadió `"@fudic/http": "0.0.1"` al `package.json`, al principio de
  `dependencies` y no en orden. El resto de dependencias `@fudic/*` del proyecto son
  `workspace:*`: con `0.0.1` pnpm la busca en el registry, la misma situación del hallazgo 2.
- **Cómo se resolvió.** Se cambió a mano por `workspace:*`, en su sitio por orden alfabético.
- **Qué debería hacer.** Escribir la dependencia como las demás `@fudic/*` del proyecto
  (`workspace:*` dentro de un workspace) y en orden.

## 20. `fudic new` solo configura el MCP para Claude Code, y `AGENTS.md` habla del túnel

- **Qué pasó.** Al escribir «Desde un agente» de la sección MCP (2026-11-24), con un proyecto
  recién creado con `fudic new tienda`. La CLI deja `.mcp.json` (`mcpServers`), que lee Claude
  Code y, con un ajuste experimental, Copilot en VS Code. Cursor (`.cursor/mcp.json`), Antigravity
  (`.agents/mcp_config.json`), Windsurf (`.devin/mcp_config.json`), Codex (`.codex/config.toml`) y
  Gemini CLI (`.gemini/settings.json`) leen otro fichero, y el agente no encuentra el servidor.
  Además, `AGENTS.md` (`packages/cli/templates/agent/AGENTS.md.tmpl`) dice «To use it from a chat,
  run `pnpm exec fudic-mcp --http --tunnel`»: es lo que leen todos los agentes, y les cuenta cómo
  abrir el proyecto a internet.
- **Cómo se resolvió en la web.** La página da el fichero de cada entorno, comprobado contra su
  documentación oficial, y no menciona la línea del túnel.
- **Qué debería hacer.** Una opción de `fudic new` (o un `fudic add agent <entorno>`) que escriba
  el fichero del agente que se usa. Y quitar de `AGENTS.md` la línea del chat: lo hace quien
  conecta el chat, no el agente.
- **Resuelto en parte (Lo que genera la CLI), el 2026-11-24.** Pedro decidió quitar la línea del
  chat: `AGENTS.md.tmpl` tiene dos líneas, y con él el snapshot de `new-compat` y el `AGENTS.md`
  de `web/`. `docs/sdd/SDD-77-mcp-desde-el-chat.md` §3.7 conserva las tres líneas, como registro
  de lo que se especificó. Sigue pendiente el fichero de cada agente.
