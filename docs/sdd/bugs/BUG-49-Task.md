# BUG-49 — Tareas

> **BUG:** [BUG-49 — El banco que no se ve trabajar](./BUG-49-el-banco-que-no-se-ve-trabajar.md)
> **Paquetes:** `@fudic/workbench` · `fudic-vscode` · `examples/basic`
> **Rama:** `worktree-workbench` (worktree `workbrench`), desde `main` en `4867866`.
> **Progreso:** 12 / 15 — `En curso`: faltan las pruebas de Pedro (6, 13) y el cierre (15).

Lo nuevo nace al 100 % en las cuatro métricas, y los paquetes tocados no bajan de su suelo.

**Suelo medido (2026-10-15, `4867866`):** `@fudic/workbench` 100 / 100 / 100 / 100 y
`fudic-vscode` 100 / 100 / 100 / 100 (statements / branches / functions / lines).

**Reparto:** esta sesión implementa; la sesión `workbrench-tests` escribe las tareas «Tests» en su
worktree (`workbrench-tests`, rama `workbrench-tests`) sobre esta rama, y se mezcla aquí.

---

## Fase 1 — VS Code: el clic se ve, y las lentes de la spec (3)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 1 | — | **Lentes.** `specLenses`: Run all · Run failing · Pause/Resume (n) · Cancel sobre `component`, Run por criterio, spinners; `act`, `lensState`, `onLensesChanged`; el mensaje `state` (BUG §4.2) | `packages/vscode/src/workbench.ts` · `packages/vscode/src/extension.ts` |
| [x] | 2 | — | **Respuesta inmediata.** Pestaña al pulsar con `startingHtml`, `load(url, title)`, fallos en la pestaña, cierre durante el arranque, progreso de ventana, marcas optimistas, barra de estado que gira (BUG §4.1) | `packages/vscode/src/workbench.ts` · `packages/vscode/src/ports.ts` · `packages/vscode/src/workbench-panel.ts` · `packages/vscode/src/extension.ts` |
| [x] | 3 | 1, 2 | **Tests.** Criterios 1–4 (`f43ec86`, 353 tests, 100 %) | `packages/vscode/test/*` |

## Fase 2 — El servidor manda lo que la página necesita (3)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 4 | — | **Datos nuevos.** Línea de cada paso, `props`, viewport fijo, `ShotRef` con tamaño, `setAttribute` que devuelve el valor anterior y el término del ejemplo que lo usa (BUG §3.1–§3.3) | `src/pages.ts` · `src/session.ts` · `src/protocol.ts` · `src/bench.ts` · `src/run.ts` · `src/browser.ts` · `src/context.ts` · `README.md` · `examples/basic/fudic/terms/when/set-attribute.js` |
| [x] | 5 | 4 | **Tests.** Criterio 5 (`e81a232`) | `packages/workbench/test/*` |
| [ ] | 6 | 5 | **Prueba de Pedro.** `destacada-al-cambiar-variante` dice `(before: "default")` | — |

## Fase 3 — La página nueva, quieta (3)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 7 | 4 | **Shell rediseñado.** Cabecera en dos filas, tarjetas en dos columnas, pasos con línea y ✓/✗, modos de captura, *Expand*, hover; capturas que guardan su hueco, sin plegado ni reordenación a mitad de ejecución (BUG §4.3, §4.4). Tras la primera prueba de Pedro: rojas abiertas y verdes plegadas al acabar, flecha y *Expand all*, barras finas, *Pin* sin «⊤» y sin *Slider* | `src/shell.ts` |
| [x] | 8 | 7 | **La pestaña.** Sin barra; reenvía `fudic:openInBrowser` y `fudic:hover`; `highlight` ilumina la línea en el editor | `packages/vscode/src/workbench-panel.ts` · `packages/vscode/src/extension.ts` |
| [x] | 9 | 7, 8 | **Tests.** Criterios 6 y 7 (`3f6f73c`: 26 tests del shell sobre Chrome real) | `packages/workbench/test/browser/shell.test.ts` · `packages/vscode/test/*` |

## Fase 4 — Run all sin pagar los contextos (2)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 10 | — | **Páginas de repuesto.** `SPARE_PAGES` abiertas al arrancar y al quedar ocioso; cerrar cierra el contexto una vez. Medido antes y después (BUG §4.5) | `src/browser.ts` |
| [x] | 11 | 10 | **Medida.** Tabla de BUG §4.5, con un test temporal que no se commitea | — |
| [x] | 12 | 10 | **Tests.** Criterio 8 (las ramas del repuesto: hueco vacío, apertura que falla, doble cierre, relleno al quedar ocioso; `3f6f73c`). `@fudic/workbench` 317 tests y `fudic-vscode` 355, los dos al 100 % | `packages/workbench/test/spare-pages.test.ts` |

## Cierre (3)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [ ] | 13 | 3, 5, 9, 12 | **Prueba de Pedro.** Criterio 10, en VS Code (extensión instalada desde esta rama) y en el navegador | — |
| [x] | 14 | 1–12 | **Documentación.** Este BUG, su Task y el README del banco (`setAttribute`) | `docs/sdd/bugs/BUG-49-*` · `packages/workbench/README.md` |
| [ ] | 15 | 13, 14 | **Cierre.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde con la cobertura del criterio 9. `Hecho` aquí, en el BUG, en el `INDEX.md` de bugs (tabla y registro) y en el registro del `INDEX.md` maestro | `docs/sdd/bugs/*` · `docs/sdd/INDEX.md` |
