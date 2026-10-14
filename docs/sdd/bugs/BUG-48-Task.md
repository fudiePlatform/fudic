# BUG-48 — Tareas

> **BUG:** [BUG-48 — El banco que nadie usaría](./BUG-48-el-banco-que-nadie-usaria.md)
> **Paquetes:** `@fudic/workbench` · `fudic-vscode` · `@fudic/diagnostics` · `examples/basic`
> **Rama:** `bug/48-banco-usable`, desde `main`.
> **Progreso:** 22 / 31 — `En curso` (la tarea 5 está marcada en la rama de tests).

Lo nuevo nace al 100 % en las cuatro métricas. `@fudic/workbench` y `fudic-vscode` no bajan de su
suelo de `main`: antes de tocar nada se mide con `pnpm --filter <pkg> coverage` y se anota aquí.

**Suelo medido (2026-10-14, `main` en `4ae7891`):** `@fudic/workbench` 100 / 100 / 100 / 100 y
`fudic-vscode` 100 / 100 / 100 / 100 (statements / branches / functions / lines). Los dos se
quedan al 100.

**Reparto:** esta sesión implementa (tareas sin «Tests»); la sesión `fudic-39` escribe las
tareas «Tests» y deja la cobertura en el suelo, en su propio worktree sobre esta rama.

---

## Fase 1 — Guardar ejecuta ya, y dos bancos no se pisan (6)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 1 | — | **`hotUpdate`.** Un plugin del banco en la lista de Vite. Al cambiar un `.fud`, avisa cuando Vite llamó a `hotUpdate` para ese fichero en todos sus entornos. `Rerunner` pierde el temporizador y `onFullReload` desaparece (BUG §4.1) | `src/vite.ts` · `src/rerun.ts` · `src/open.ts` |
| [x] | 2 | — | **Sin typecheck.** `fudic({ routesDir, liveCheck: false })` (BUG §4.2) | `src/vite.ts` |
| [x] | 3 | — | **Carpeta por proceso.** `node_modules/.fudic-bench/<pid>/`; al arrancar se borran las hermanas de `pid` muerto (BUG §4.3) | `src/pages.ts` · `src/bench-dir.ts` |
| [x] | 4 | 3 | **Páginas antes que Vite.** La página desnuda `routes/<tag>.fud` se escribe antes de `startVite`; los criterios pasan ya a `routes/<tag>/<slug>.fud` (BUG §4.2, corregido: un slug puede empezar por `_`) | `src/pages.ts` · `src/open.ts` |
| [x] | 5 | 1–4 | **Tests.** Criterios 1, 2, 3 y 4. El 1 con un Vite real y un `.fud` sin JS de cliente; se ve en rojo con el código de `main` | `test/rerun.test.ts` · `test/launch.test.ts` · `test/bench-dir.test.ts` |
| [ ] | 6 | 5 | **Prueba rápida de Pedro.** Guardar `app-card.fud` con el banco abierto se ve en menos de un segundo | — |

## Fase 2 — Un proceso por proyecto (4)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 7 | 3 | **Varios componentes.** Un registro de sesiones por `tag`; páginas en `routes/<tag>/<slug>.fud`, shell en `/__bench/<tag>/`; cada guardado solo a las sesiones que leen ese fichero (BUG §4.4) | `src/open.ts` · `src/session.ts` · `src/pages.ts` · `src/rerun.ts` · `src/bench-server.ts` |
| [x] | 8 | 7 | **Protocolo `v: 2`.** `tag` en todo mensaje, `spec`, `line` y `file` en `session`, `trigger` en `running`, y los tipos de §3.2 y §3.3 | `src/protocol.ts` |
| [x] | 9 | 7, 8 | **`stdin`/`stdout`.** El binario lee órdenes JSON por línea (`open`, `close`, y las de la fase 4) y escribe cada mensaje como una línea. Cerrar `stdin` sigue cerrándolo todo | `src/cli.ts` · `src/bin.ts` · `src/control.ts` |
| [ ] | 10 | 7–9 | **Tests.** Criterio 5 | `test/cli.test.ts` · `test/session.test.ts` |

## Fase 3 — El navegador se elige (2)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 11 | — | **`--browser`.** `auto` = `chrome` → `msedge` → `chromium`; un nombre prueba solo ese. Texto nuevo de `FUD0975` con lo probado y la orden de instalación. El navegador va en la línea JSON (BUG §4.5) | `src/browser.ts` · `src/cli.ts` · `packages/diagnostics/src/codes/FUD0975.*` |
| [ ] | 12 | 11 | **Tests.** Criterio 6, con un `Launcher` inyectado | `test/browser/*` |

## Fase 4 — El motor (6)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 13 | 7 | **Paralelo y orden.** Una cola con `workers` (4 por defecto) y los que no estaban en `pass` delante (BUG §4.6) | `src/runner.ts` · `src/open.ts` |
| [x] | 14 | 13 | **Capturas y marcas.** `before`/`after` del elemento montado; `ctx.locate` guarda la caja; el servidor sirve `/__bench/shot/<tag>/<id>/<n>.png` desde memoria | `src/engine.ts` · `src/context.ts` · `src/browser.ts` · `src/bench-server.ts` |
| [x] | 15 | 13 | **`ignored` y `was`.** `goto` deja `ignored: true` sin evidencia; el resultado lleva el veredicto anterior | `src/engine.ts` · `src/runner.ts` |
| [x] | 16 | 9, 13 | **Órdenes.** `run` (`ids`, `failing`), `pin`, `pause` (con `pending` y `state`), `cancel` (con `cancelled`), en un controlador que usan `stdin` y el WebSocket | `src/control.ts` · `src/runner.ts` |
| [x] | 17 | — | **WebSocket que lee.** Tramas de texto enmascaradas, `close` contestado, `ping`/`pong`, `1003` para lo demás; el servidor pasa las órdenes al controlador (BUG §4.10) | `src/ws.ts` · `src/bench-server.ts` |
| [ ] | 18 | 13–17 | **Tests.** Criterios 7, 8, 9, 10 y 11 | `test/runner.test.ts` · `test/engine.test.ts` · `test/ws.test.ts` · `test/control.test.ts` |

## Fase 5 — `fudic-workbench run` (4)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 19 | 7, 13 | **`runSpecs`.** Encuentra las `.fudspec` (o las de los `<path>`), abre sus sesiones en un proceso sin shell, ejecuta y devuelve `RunSummary` (BUG §4.7) | `src/run.ts` · `src/index.ts` |
| [x] | 20 | 19 | **El subcomando.** Salida legible con esperado frente a obtenido, `--json` con `summary` al final, código de salida, y `FUD0976` sin nada que ejecutar | `src/cli.ts` · `src/report.ts` · `packages/diagnostics/src/codes/FUD0976.*` · `packages/diagnostics/src/index.ts` |
| [x] | 21 | 20 | **El ejemplo.** `"test:spec": "fudic-workbench run"` en `examples/basic`; `then/text.js` devuelve `{ expected, actual }` | `examples/basic/package.json` · `examples/basic/fudic/terms/then/text.js` |
| [ ] | 22 | 19–21 | **Tests.** Criterio 12 | `test/run.test.ts` |

## Fase 6 — El shell (3)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 23 | 8, 14, 16 | **El shell nuevo.** Cabecera con resumen y botones, tarjetas rojas arriba y verdes plegadas, capturas con marcas, esperado frente a obtenido, paso `ignored` atenuado, *Run*/*Pin*/*Live* por tarjeta, un solo panel *Live*, actualización en su sitio, teclado, tema y enlaces a fichero (BUG §4.8) | `src/shell.ts` |
| [ ] | 24 | 23 | **Tests.** Criterio 13, con el script del shell sobre un DOM de test y mensajes simulados | `test/shell.test.ts` |
| [ ] | 25 | 24 | **Prueba de Pedro en el navegador.** La parte del shell del criterio 15 | — |

## Fase 7 — VS Code (4)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 26 | 9 | **Un proceso por proyecto.** `Map<carpeta, proceso>`; `open`/`close` por `stdin`; la última pestaña cierra `stdin`; los mensajes del proceso se leen línea a línea; `--browser` y `--workers` desde los ajustes (BUG §4.9) | `packages/vscode/src/workbench.ts` · `packages/vscode/src/spawn.ts` · `packages/vscode/src/ports.ts` · `packages/vscode/package.json` |
| [x] | 27 | 26 | **La pestaña.** `?theme=` y aviso de cambio de tema; reenvía al editor las peticiones de abrir fichero | `packages/vscode/src/workbench-panel.ts` · `packages/vscode/src/extension.ts` |
| [x] | 28 | 26 | **La `.fudspec`.** Icono en el margen por criterio, CodeLens «▶ Run» y «▶ Run failing» (`fudic.runCriterion`), *Problems* y barra de estado | `packages/vscode/src/workbench-results.ts` · `packages/vscode/src/extension.ts` · `packages/vscode/package.json` |
| [ ] | 29 | 26–28 | **Tests.** Criterio 14, sobre los puertos | `packages/vscode/test/*` |

## Cierre (2)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 30 | 1–29 | **Documentación.** El README de `@fudic/workbench` (binario, `run`, `--browser`, órdenes, evidencia `{ expected, actual }`) | `packages/workbench/README.md` |
| [ ] | 31 | 30 | **Cierre.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde, cobertura del criterio 16. Pedro hace el criterio 15 entero. `Hecho` aquí, en el BUG, en el `INDEX.md` de bugs (tabla y registro) y en el registro del `INDEX.md` maestro | `docs/sdd/bugs/*` · `docs/sdd/INDEX.md` |
