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
