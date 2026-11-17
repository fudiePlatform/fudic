# SDD-87 — Tareas

> **SDD:** [SDD-87 — Una página de error compartida entre apps, y el `base` en el navegador](./SDD-87-pagina-de-error-compartida.md)
> **Paquetes:** `@fudic/resolve` · `@fudic/http` · `@fudic/forms` · `@fudic/api` · `@fudic/server` ·
> `@fudic/vite` · `@fudic/testing` · `@fudic/language-core` · `@fudic/typecheck` ·
> `@fudic/language-server` · `@fudic/diagnostics` · `@fudic/cli` · `@fudic/mcp` · `examples/workspace` ·
> `examples/basic`
> **Rama:** `sdd-87-pagina-de-error`, desde `main`.
> **Progreso:** 20 / 24 — `En curso`.

**El orden manda en tres puntos.**

- **El `base` primero (fase 1).** Es un bug que ya está en `main`, y los e2e de la fase 5 lo
  necesitan arreglado para que la página compartida se vea en la app que toca.
- **`errorPageOf` antes que sus tres usuarios.** El plugin, el CLI y el MCP la llaman; ninguno
  repite la regla.
- **El golden del módulo del `.fudapi` sin `base` se fija antes de tocar el emit** (tarea 4). Es lo
  que prueba que una app sin `base` emite lo mismo, byte a byte.

---

## Fase 1 — El `base` en el navegador

- [x] **1. `ClientContext.base` y `stub`.**
  - `base` en `ClientContext` (SDD §3.5). `stub` lo rellena con `spec.base ?? '/'`. Test: una llamada
    con `spec.base = '/admin/'` va a `/admin/_fudic/fn/…`, pide el token a `/admin/_fudic/csrf` y sus
    pasos ven `ctx.base === '/admin/'` (criterio 4).
  - Los helpers de test que construyen un `ClientContext` a mano, con `base`.
  - *Depende de:* —.
  - *Paquete:* `http`.
  - *Ficheros:* `src/types.ts`, `src/contract/fn.ts`, `test/helpers.ts`, `test/built-ins.ts`,
    `test/body/upload.test.ts`, `test/contract/fn-base.test.ts`.
- [x] **2. `ruleSend` con `base`.**
  - Tercer parámetro opcional `base`, por defecto `/`, que va al `ClientContext` (SDD §3.5).
  - *Depende de:* 1.
  - *Paquete:* `http`.
  - *Ficheros:* `src/contract/rule-send.ts`, su test.
- [x] **3. `errorPagesStep` con el `base`.**
  - Sin ruta, `join(ctx.base, '/_fudic/error/<status>')`; ruta con `/`, `join(ctx.base, ruta)`; ruta
    sin `/`, tal cual; `Redirect`, 422, `catches` y cancelada, como hoy (criterios 6, 7, 8).
  - *Depende de:* 1.
  - *Paquete:* `http`.
  - *Ficheros:* `src/error-pages.ts`, `test/error-pages.test.ts`.
- [x] **4. El golden sin `base`.**
  - Un snapshot del módulo de navegador de un `.fudapi` con funciones y una regla remota, emitido
    **antes** de tocar `emitModule`. No cambia en la tarea 5.
  - *Depende de:* —.
  - *Paquete:* `api`.
  - *Ficheros:* `test/emit/base.test.ts`.
- [x] **5. `emitModule` con `base`.**
  - `EmitModuleOptions { i18n?, base? }` en lugar del quinto parámetro (SDD §3.5). En `browser` y con
    `base` distinto de `/`: `base: "/admin/"` en cada `stub`, en cada regla remota y en cada
    `ruleSend`. Los llamadores, al día (criterio 3).
  - *Depende de:* 2, 4.
  - *Paquete:* `api`, `vite`.
  - *Ficheros:* `packages/api/src/emit/module.ts`, `packages/api/test/emit/base.test.ts`,
    `packages/vite/src/api-modules.ts`.
- [x] **6. Las reglas remotas con `base`.**
  - `Question.base`, desde la regla emitida como `sig`; `askRemote` compone
    `join(base ?? '/', '/_fudic/rule/<id>/<name>')` (criterio 5).
  - *Depende de:* 5.
  - *Paquete:* `forms`.
  - *Ficheros:* `src/contract/remote.ts`, `test/contract/remote.test.ts`.
- [x] **7. El plugin pasa el `base`.**
  - `api-modules.ts` recibe el `base` que resolvió Vite y lo pasa a `emitModule`, en build y en dev.
    Test: un build con `base: '/admin/'` tiene `base:"/admin/"` en el chunk de navegador del `.fudapi`.
  - *Depende de:* 5.
  - *Paquete:* `vite`.
  - *Ficheros:* `src/api-modules.ts`, `src/plugin.ts`, `test/api-base.test.ts`.
- [x] **8. `home` y `back` con el `base`.**
  - `ErrorPage.home` y el comentario nuevo de `back` (`http`); `PageOrigin.home`, `pageOriginOf` y
    `backOf` (`server`); `visit` pasa `home` (`testing`); `ERROR_DATA` del editor (`language-core`)
    (SDD §3.4, §4.4, criterios 9, 10, 11).
  - *Depende de:* —.
  - *Paquete:* `http`, `server`, `testing`, `language-core`.
  - *Ficheros:* `packages/http/src/errors.ts`, `packages/server/src/errors.ts`,
    `packages/server/test/errors.test.ts`, `packages/testing/src/visit.ts`, su test,
    `packages/language-core/src/data.ts`, su test.

## Fase 2 — Qué página usa una app

- [x] **9. `errorPageOf`.**
  - `ErrorPageSource`, `errorPageOf` y `LIBRARY_ERROR_FILE` (SDD §3.3, §4.1). Los seis casos del
    criterio 12, con un `PackageFs` en memoria. Exportado desde `index.ts`. Al 100 %.
  - *Depende de:* —.
  - *Paquete:* `resolve`.
  - *Ficheros:* `src/error-page.ts`, `src/index.ts`, `test/error-page.test.ts`.
- [x] **10. `FUD1570`.**
  - Un fichero, su `.md` en inglés y su línea en `index.ts` (SDD §3.8).
  - *Depende de:* —.
  - *Paquete:* `diagnostics`.
  - *Ficheros:* `src/codes/FUD1570.ts` · `.md`, `src/index.ts`.
- [x] **11. `discoverRoutes` con la cadena.**
  - Parámetro `packages?: PackageFs`; la página sale de `errorPageOf`; `errorPageFrom`; `FUD1570` con
    `ambiguous` (SDD §3.10, criterio 13). Con idiomas, una por idioma (criterio 14).
  - *Depende de:* 9, 10.
  - *Paquete:* `vite`.
  - *Ficheros:* `src/discover.ts`, `test/discover-error-page.test.ts`.
- [x] **12. El plugin dice de dónde sale.**
  - La línea `fudic: error page from <paquete> (<fichero>)` en build y al arrancar dev; `FUD1570` en
    el build y en el overlay (SDD §3.8, §3.9, criterio 16). Dev: crear el fichero de la librería se
    nota en la siguiente petición (criterio 15); si Vite no vigila esa carpeta, se añade al watcher.
  - *Depende de:* 11.
  - *Paquete:* `vite`.
  - *Ficheros:* `src/plugin.ts`, `test/error-page-library.test.ts`.
- [x] **13. `@fudic/testing` con la página de una librería.**
  - `project.ts` pasa por `discoverRoutes`, así que ya la ve: un test con una app sin `_error.fud` y
    una librería con uno, cuyo `visit` de un `load` que lanza pinta la de la librería.
  - *Depende de:* 11, 8.
  - *Paquete:* `testing`.
  - *Ficheros:* `test/error-page-library.test.ts`, su fixture.
- [x] **14. El editor y el typecheck.**
  - `apiContextOf` (`typecheck`) y `#context` (`language-server`) reconocen `src/_error.fud` de una
    librería como página de error (SDD §4.3). Tests: `FUD1010` con un `load` en `src/_error.fudapi` de
    una librería, en los dos (criterio 18); el tipo de `data` en `src/_error.fud` de una librería
    (criterio 17).
  - *Depende de:* 8.
  - *Paquete:* `typecheck`, `language-server`.
  - *Ficheros:* `packages/typecheck/src/api-project.ts`, su test,
    `packages/language-server/src/fudapi/host.ts`, su test.

## Fase 3 — El CLI

- [x] **15. `fudic g error-page`.**
  - `args.ts` (`error-page`, con `--project` y `--force`), `run.ts`, `plans/error-page.ts`, la
    plantilla `error-page.fud` y la ayuda (SDD §3.6). En una librería no pasa por `routeRefusal`. El
    informe, con `errorPageOf` (criterios 19, 21, 22).
  - *Depende de:* 9.
  - *Paquete:* `cli`.
  - *Ficheros:* `src/args.ts`, `src/run.ts`, `src/types.ts`, `src/plans/error-page.ts`,
    `templates/error-page.fud`, `src/help/commands.ts`, `test/error-page.test.ts`.
- [x] **16. La plantilla, renderizada.**
  - La plantilla generada compila sin diagnósticos y pinta `home` o `back` según el criterio 20.
  - *Depende de:* 8, 15.
  - *Paquete:* `cli`.
  - *Ficheros:* `test/error-page-render.test.ts`.
- [x] **17. `g app` añade las librerías con página de error.**
  - `withGuides` pasa a añadir también las librerías con `src/_error.fud` (con el `io` para mirarlo);
    solo en `g app`, no en `g lib` (criterio 23).
  - *Depende de:* 9.
  - *Paquete:* `cli`.
  - *Ficheros:* `src/plans/lib.ts`, `src/plans/app.ts`, `test/app.test.ts`.

## Fase 4 — El MCP

- [x] **18. `fudic_generate` con `error-page`.**
  - `GENERATE_KINDS` y la descripción de la herramienta (criterio 24).
  - *Depende de:* 15.
  - *Paquete:* `mcp`.
  - *Ficheros:* `src/project-tools.ts`, su test.
- [x] **19. `fudic_status` con `errorPage`.**
  - La dependencia `@fudic/resolve`; `projectOf` añade `errorPage` desde `errorPageOf`, con los
    ficheros relativos a la raíz (SDD §3.7). Los cuatro casos, en app y en librería (criterio 25).
  - *Depende de:* 9.
  - *Paquete:* `mcp`.
  - *Ficheros:* `package.json`, `src/status.ts`, `test/status.test.ts`.
- [x] **20. La guía.**
  - `pages.md`, `config.md` y `workflow.md`, en inglés y en español (SDD §3.7). El ejemplo de librería
    con `path=src/_error.fud`. `guide-examples.test.ts` en verde (criterio 26).
  - *Depende de:* 8, 15, 19.
  - *Paquete:* `mcp`.
  - *Ficheros:* `guide/pages.md`, `guide/es/pages.md`, `guide/config.md`, `guide/es/config.md`,
    `guide/workflow.md`, `guide/es/workflow.md`.

## Fase 5 — Los ejemplos y el cierre

- [ ] **21. `examples/basic`.**
  - `_error.fud` con `href=@data.home`; sus tests y e2e siguen en verde.
  - *Depende de:* 8.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `src/routes/_error.fud`.
- [ ] **22. `examples/workspace`: la librería y las dos apps.**
  - `libs/ui/src/_error.fud`; en `admin`, `src/http.fudapi`, la ruta `/fallos` con su `.fudapi` (la
    función que responde, la del 500, la del 403 y el formulario con la regla remota) y `/entrar`; en
    `tienda`, su `src/routes/_error.fud` (SDD §4.5).
  - *Depende de:* 7, 12.
  - *Paquete:* `examples/workspace`.
  - *Ficheros:* `libs/ui/src/_error.fud`, `apps/admin/src/http.fudapi`,
    `apps/admin/src/routes/fallos.fud`, `apps/admin/src/routes/fallos.fudapi`,
    `apps/admin/src/routes/fallos.ts`, `apps/admin/src/routes/entrar.fud`,
    `apps/tienda/src/routes/_error.fud`, `apps/admin/package.json` (si hace falta `@fudic/http`).
- [ ] **23. Los e2e de errores.**
  - Dos `webServer` con `vite preview` (admin y tienda, cada una en su puerto) y
    `tests/errores.spec.ts` con el criterio 1. Una prueba del MCP con el criterio 2: `fudic_status`
    en `apps/admin` y en `apps/tienda`.
  - *Depende de:* 19, 22.
  - *Paquete:* `examples/workspace`, `mcp`.
  - *Ficheros:* `playwright.config.ts`, `tests/errores.spec.ts`, `packages/mcp/test/status-workspace.test.ts`.
- [ ] **24. Cierre.**
  - IDEA-08 §6 y §7 apuntan a esta SDD; `INDEX.md` con el estado y el registro.
  - `pnpm typecheck`, `pnpm build`, la cobertura de SDD §5, y los e2e de `examples/workspace` y
    `examples/basic` en verde (criterio 27).
  - *Depende de:* todas.
  - *Ficheros:* `docs/sdd/ideas/IDEA-08-adelgazar-el-cliente.md`, `docs/sdd/INDEX.md`.
