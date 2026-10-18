# SDD-59 — Tareas

> **SDD:** [SDD-59 — Los términos: un runtime abierto en `@fudic/terms`](./SDD-59-terminos-de-serie.md)
> **Paquetes:** `@fudic/terms` (nuevo) · `@fudic/workbench` · `@fudic/spec` · `@fudic/language-server` · `fudic-vscode` · `examples/basic`
> **Progreso:** 13 / 14 — `Hecho`; queda la prueba de producto de Pedro (tarea 10).

`@fudic/terms` nace al 100 % en las cuatro métricas; los paquetes tocados no bajan de su suelo.

---

## Fase 1 — El runtime en su paquete (3)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 1 | — | **Paquete.** `package.json` (versiones exactas, `playwright-core`), `tsconfig`, `vitest.config.ts` con umbrales al 100, `README.md` en inglés | `packages/terms/*` |
| [x] | 2 | 1 | **Extensión de serie y tipos.** `stock`, `defineExtension`, `BenchExtension`, `TermContext`, `TermHost`, `Term`, `TermMeta`, `TermOutcome`, `Fixtures`, `termsDir` (§3.2–§3.4) | `packages/terms/src/*` |
| [x] | 3 | 2 | **Tests.** Runtime sobre Chrome real: `locate` (uno, varios, ninguno), `act`, `text`, marcas | `packages/terms/test/*` |

## Fase 2 — El banco recibe el runtime (4)

Adelantado de la tarea 13 (decisión de Pedro, 2026-10-17): los tests del banco corren los criterios
de `examples/basic`, así que esta fase ya le instala `@fudic/terms` y adapta sus términos al `ctx`
nuevo (`given/route.js` sin `ctx.goto`). La tarea 13 sigue borrando los duplicados.

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 4 | 2 | **El banco acepta extensiones.** `runCriterion` recibe `BenchExtension[]`: `setup` en orden antes de montar, `context` encadenado desde el `TermHost` (`Page` real, `settled`, `onLocate`); borrar `context.ts` (§4.1, §4.3, §4.4) | `packages/workbench/src/engine.ts` · `src/browser.ts` · `src/run.ts` |
| [x] | 5 | 4 | **Carga.** La sesión resuelve `stock` de `@fudic/terms` y `fudic/bench.js` del proyecto, en ese orden (§3.3, §4.2) | `packages/workbench/src/session.ts` |
| [x] | 6 | 4 | **`$content`.** La página del criterio escribe el contenido dentro del host; `Fixtures` en `@fudic/spec` (§3.4, §4.5) | `packages/workbench/src/pages.ts` · `packages/spec/src/fixtures.ts` |
| [x] | 7 | 4–6 | **Tests.** Criterios §6.3, §6.4, §6.5 con un runtime falso y con el real | `packages/workbench/test/*` |

## Fase 3 — Vocabulario de serie (3)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 8 | 2 | **Los trece términos** de §3.5, solo con el `ctx` de §3.2 | `packages/terms/terms/**/*.js` |
| [x] | 9 | 8, 6 | **Tests.** §6.1 (teclado), §6.2 (slots), §6.7.1–§6.7.6 | `packages/terms/test/*` |
| [ ] | 10 | 9 | **Prueba de Pedro.** Teclado y slot en el banco desde VS Code y `fudic-workbench run` (al final, tras la fase 4: decisión de Pedro) | — |

## Fase 4 — Editor, ejemplo y cierre (4)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 11 | 2 | **Editor.** Capa del framework por proyecto; `fudic g term` con su `@type` (§4.8, §4.10) | `packages/language-server/src/fudspec/host.ts` · `packages/vscode/src/*` · `packages/spec/src/scaffold/term.ts` |
| [x] | 12 | 11 | **Tests.** §6.6, §6.7.7 | `packages/language-server/test/*` · `packages/spec/test/*` |
| [x] | 13 | 8 | **`examples/basic`.** `@fudic/terms` como devDependency, términos duplicados fuera, `route` revisado; §6.7.8 | `examples/basic/*` |
| [x] | 14 | 1–13 | **Cierre.** Estado `Hecho`, registro de progreso, tabla maestra | `docs/sdd/INDEX.md` |
