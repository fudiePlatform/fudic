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

## 9. Un `<link href>` no puede nombrar un fichero de otro paquete

- **Qué pasó.** El layout de la documentación precarga la fuente de la guía. Se intentó con
  `<link rel="preload" href="@web/guide/fonts/inter-tight-wght-400-600.woff2" …>`, igual que
  `<link rel="layout" href="@web/ui/…">`:
  - el compilador lee `@web` como una expresión y el prerender falla con `FUD0620` («web is not
    defined»);
  - escapado como `@@web/…`, compila, pero el HTML sale con `@@web/…` literal: ni se desescapa a
    `@` ni se resuelve como fichero.
- **Cómo se resolvió.** Con la ruta relativa `../../../guide/fonts/…`. La build la reescribe al
  mismo `/assets/…-<hash>.woff2` que el `url()` del `@font-face`, pero cruza de `@web/ui` a
  `@web/guide` por disco y se salta los `exports` del paquete (lo mismo que el nº 6).
- **Qué debería hacer.** Resolver un `href` con nombre de paquete (`@scope/pkg/…`) en cualquier
  `<link>` del head, como ya hace con `rel="layout"`, `"snippet"` y `"component"`. Y que `@@`
  en un atributo produzca `@`.

## 10. Ni `vite preview` ni el servidor de fudic comprimen

- **Qué pasó.** El HTML de `docs/getting-started` sale en 38,7 KB sin comprimir (10,3 KB con
  gzip, 9 KB con brotli), y la CSS y los módulos JS igual. Lighthouse lo marca («No compression
  applied») y en móvil cuesta unos 0,2 s de FCP.
- **Cómo se resolvió.** No se ha resuelto: en producción lo hará el hosting o la CDN. Medido con
  un proxy brotli delante de la preview, la página pasa de 99 a 100.
- **Qué debería hacer.** Comprimir (brotli, con gzip de reserva) las respuestas de texto del
  servidor que genera la build, o precomprimir los estáticos en la build (`.br`, `.gz`).

## 11. La guía no puede pedir que se precargue su fuente

- **Qué pasó.** `fudic.json` de una librería de guía declara `sheet` e `icon`, y fudic los
  enlaza en cada página. La fuente que pide esa hoja solo se descubre tras descargar la CSS, y
  no hay forma de declarar su `preload`. Medido con Lighthouse: con 4 fuentes sin precargar, la
  página daba 92 en móvil (FCP 2,6 s).
- **Cómo se resolvió.** Se dejó una sola fuente recortada (23 KB) y cada layout la precarga a
  mano (ver el nº 9). Ahora da 99, y 100 con compresión.
- **Qué debería hacer.** Que la guía pueda declarar sus fuentes críticas
  (`"guide": { "preload": ["fonts/…woff2"] }`) y fudic escriba el `<link rel="preload" as="font"
  crossorigin>` y su Early Hint en cada página que enlaza la guía.
