# BUG-51 — Tareas

> **BUG:** [BUG-51 — Forms y http invasivos, una página de error mágica y una CLI lenta y muda](./BUG-51-forms-http-invasivos-y-una-cli-lenta.md)
> **Paquetes:** `@fudic/http` · `@fudic/forms` · `@fudic/compiler` · `@fudic/vite` · `@fudic/language-core` · `@fudic/language-server` · `@fudic/diagnostics` · `@fudic/testing` · `@fudic/cli` · `examples/basic`
> **Rama:** `bug-51-forms-http-cli` (implementación) y `bug-51-forms-http-cli-tests` (tests), desde `main` en `d6c0ce0`.
> **Progreso:** 30 / 30 — `Hecho` (2026-10-19).

Dos sesiones en paralelo: una implementa y commitea por fases, la otra escribe los tests de cada
fase en su propio worktree y devuelve el commit, la cobertura y los bugs que encuentra. Lo nuevo
nace al 100 % en las cuatro métricas; `compiler`, `vite` y `cli` no bajan de su suelo.

---

## Fase 1 — Editor (5)

| ✓ | # | dep | tarea | commit |
|---|---|---|---|---|
| [x] | 1 | — | **El `href` de un `<link rel>` de fudic, solo con la lista del servidor.** `silenceOwnedPositions` declina ahí al servicio HTML (§4.4) | `ca68573` |
| [x] | 2 | — | **Oferta de `form:`** en `<form control=@f>` sin `form:` (`formAttributeOffers`) | `ca68573` |
| [x] | 3 | — | **`fudic:result` y `fudic:error`** en el `$on` de la proyección; el nombre parcial admite `:` | `ca68573` |
| [x] | 4 | — | **`form:=@save` sin comillas** en FUD1005, FUD1006, el README de http y el ejemplo | `ca68573` |
| [x] | 5 | 1–4 | **Tests** de la fase | `3b0b87a` |

## Fase 2 — `errorPages` y `_error.fud` (6)

| ✓ | # | dep | tarea | commit |
|---|---|---|---|---|
| [x] | 6 | — | **`errorPages(routes?)`**: rutas por status, URL o función del error; vuelve a lanzar abort, 422 y lo que el form se queda (§4.1) | `8317ca4` |
| [x] | 7 | — | **El `detail` llega a la página de error** en `?detail=`, recortado a 300; `problemOfUrl` en dev y preview | `8317ca4` · `8a30aa2` |
| [x] | 8 | — | **`ErrorPage`** de `@fudic/http`, declarado y documentado como el `data` de `_error.fud` | `8317ca4` |
| [x] | 9 | 6 | **Plantilla de la CLI** con `errorPages()` | `8317ca4` |
| [x] | 10 | 6–8 | **Ejemplo:** un 403 a `/entrar` y un 401 que dice «sin token» | `8317ca4` |
| [x] | 11 | 6–10 | **Tests** de la fase | `24da073` |

## Fase 3 — Lo que se queda un formulario (4)

| ✓ | # | dep | tarea | commit |
|---|---|---|---|---|
| [x] | 12 | — | **`form(…, { catches })`**, `$catches`, `DEFAULT_CATCHES` en su módulo (§4.2) | `71347ec` · `7aafd3e` |
| [x] | 13 | 12 | **`bindForm` pinta lo atrapado**: `errors`/`summary` del servidor, o la regla `server` | `71347ec` · `7aafd3e` |
| [x] | 14 | 12 | **Ejemplo:** `catches` explícito y un 409 por nombre reservado | `71347ec` |
| [x] | 15 | 12–14 | **Tests** de la fase | `24da073` |

## Fase 4 — El resumen del autor (4)

| ✓ | # | dep | tarea | commit |
|---|---|---|---|---|
| [x] | 16 | — | **El mapa ruta → id de cada `<form>`**, como sexto argumento de `bindForm` (§4.3) | `b096253` |
| [x] | 17 | 16 | **`$issues()` con `href`** y un clic que mueve el foco, también desde un componente hijo; solo con `#id` | `b096253` · `8a30aa2` |
| [x] | 18 | 17 | **Ejemplo:** `form-errores.fud` pinta el resumen de `user-form` | `b096253` |
| [x] | 19 | 16–18 | **Tests** de la fase | `70be550` |

## Fase 5 — `dev`, `preview`, `test` y `spec` (6)

| ✓ | # | dep | tarea | commit |
|---|---|---|---|---|
| [x] | 20 | — | **El typecheck de `dev` en un proceso hijo**, con vuelta al checker en proceso (§4.5) | `097a67e` |
| [x] | 21 | — | **La salida de `dev` y `preview`**: progreso, tiempos, líneas de Vite con prefijo, `NO_COLOR` | `097a67e` · `db4cf16` |
| [x] | 22 | — | **`test` y `spec` por proyecto**, con cabecera, resumen y `--silent`; `--dry-run` y `--json` como cualquier plan | `097a67e` · `db4cf16` |
| [x] | 23 | — | **`--port` en los ejemplos de la ayuda** (ya existía) | `097a67e` |
| [x] | 24 | — | **Editar una ruta sin `@client` recarga el navegador** (`hotUpdate`); el banco, que reejecuta solo, lo apaga con `serverReload: false` | `0e595f0` · `c6cdd44` |
| [x] | 25 | 20–24 | **Tests** de la fase | `dd1a2b4` · `0e476ab` · `e656c56` |

## Fase 6 — Rendimiento (5)

| ✓ | # | dep | tarea | commit |
|---|---|---|---|---|
| [x] | 26 | — | **Workers que ejecutan muchos ficheros**: `forks`, `isolate: false` y `vi.resetModules()` al final de cada fichero (§4.6) | `2f717ba` |
| [x] | 27 | — | **Un solo vitest** para los proyectos que conservan `vitest run` | `2f717ba` |
| [x] | 28 | — | **`diagnostics` y `compiler` empaquetados**, planes de la CLI bajo demanda, `dirs.ts`; `inlineSources` en `testing` | `2f717ba` · `b096253` |
| [x] | 29 | — | **La página nunca espera al typecheck** (decisión de Pedro) | `6950078` |
| [x] | 30 | 26–29 | **Cierre.** Tests de la fase, `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; estado `Hecho`, índices y registro de progreso | `e656c56` · `c6cdd44` · este cierre |
