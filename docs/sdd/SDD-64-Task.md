# SDD-64 — Tareas

> **SDD:** [SDD-64 — Resultados que una máquina entiende](./SDD-64-resultados-legibles.md)
> **Paquetes:** `@fudic/diagnostics` · `@fudic/terms` · `@fudic/workbench` · `@fudic/compiler` ·
> `@fudic/vite` · `@fudic/testing`
> **Rama:** `sdd-64-resultados-legibles`, desde `main`.
> **Progreso:** 0 / 26 — `Listo`.

**Dos sesiones.** Una implementa y coordina. La otra escribe los tests de cada fase (las tareas
«Los tests de…») contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test.

**El orden manda en dos puntos.**

- **El catálogo va antes que el código que lo usa.** Ningún `'FUD12xx'` provisional.
- **`data-fud-src` va antes que el `source` del informe**: la marca no tiene qué leer sin él.

---

## Mapa de dependencias

```
1 códigos ─→ 2 Position
   │
   ▼
3 evidencia de los términos ─→ 4 reportOf ─→ 5 runSpecs y run --json ─→ 6 capturas en disco ─→ 7 tests
   │
   ▼
8 FudicCompileError ─→ 9 problemas con código ─→ 10 tests
   │
   ▼
11 sourceLocations en el SSR ─→ 12 en el cliente ─→ 13 opción en vite y testing ─→ 14 la marca lo lee
─→ 15 source en el informe ─→ 16 tests
   │
   ▼
17 runTests ─→ 18 fail y broken ─→ 19 último informe y failing ─→ 20 tests
   │
   ▼
21 outline en happy-dom ─→ 22 outlineOf ─→ 23 tests de los dos motores
   │
   ▼
24 docs ─→ 25 entrega ─→ 26 cierre
```

---

## Fase 1 — catálogo y posiciones (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **Los códigos.** `FUD1200`–`FUD1207`: `.ts` con su función tipada, `.md` con la forma de SDD-50 §4.4 y el «Fix» de SDD §5, y su línea en `index.ts`. El rango en la fila de SDD-64 del `INDEX.md` | `diagnostics` | `src/codes/FUD1200`–`1207.{ts,md}` · `src/index.ts` |
| [ ] | 2 | — | **`Position` y `formatPosition`** (SDD §3.1) | `diagnostics` | `src/position.ts` · `src/index.ts` |

## Fase 2 — el informe de un criterio (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 3 | — | **La evidencia.** `Evidence` de texto en `TermOutcome`; cada `then` de serie la devuelve según la tabla de SDD §4.2, pase o no | `terms` | `src/types.ts` · `terms/then/*.js` |
| [ ] | 4 | 2, 3 | **`reportOf(session, result)`.** Pura: `at` de criterio y pasos desde los `Span` de la `.fudspec`, `failed` (primer `then` en rojo), la normalización de la evidencia de un término del proyecto (SDD §4.2) | `workbench` | `src/report-of.ts` |
| [ ] | 5 | 4 | **`runSpecs` y `run --json`.** `RunSummary.reports`; la línea `report` tras cada `result`; los mensajes de antes sin cambios | `workbench` | `src/run.ts` · `src/run-cli.ts` · `src/protocol.ts` |
| [ ] | 6 | 5 | **Capturas en disco.** `.fudic/runs/<tag>/<id>.{before,after}.png` de los criterios que no pasan; se borran las de los que pasan; `shots` del informe | `workbench` | `src/run.ts` |
| [ ] | 7 | 3–6 | **Los tests de la fase.** Criterios 1 (sin `source`), 2–7 | `workbench` · `terms` | `test/**` |

## Fase 3 — los problemas con código (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 8 | 1 | **`FudicCompileError`.** El error del transform lleva `fudic.diagnostics` con todos los errores; `isFudicCompileError`; `message`, `loc`, `frame` como hoy | `vite` | `src/report.ts` · `src/index.ts` |
| [ ] | 9 | 1, 8 | **Los problemas.** Clasificar la excepción de un paso (`FUD1201`–`1204`, `StepFailed.code`), página que no carga (`1200`), `pageErrors` (`1205`), `bench.js` (`1206`), y el `problem` del banco con `diagnostics` (los del `.fud` o `1207`). `broken` en el informe | `workbench` | `src/engine.ts` · `src/bench.ts` · `src/session.ts` · `src/protocol.ts` · `src/report-of.ts` |
| [ ] | 10 | 8, 9 | **Los tests de la fase.** Criterios 8–10, 20 | `workbench` · `vite` | `test/**` |

## Fase 4 — del DOM al fuente (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 11 | — | **`sourceLocations` en el SSR.** Opción de compilación; cada elemento del template lleva `data-fud-src` con la posición de su apertura, relativa a la raíz del proyecto (SDD §4.4) | `compiler` | `src/emit/markup.ts` · `src/emit/module.ts` |
| [ ] | 12 | 11 | **En el cliente.** El camino que fabrica escribe el mismo atributo; el que adopta no escribe nada | `compiler` | `src/emit/markup-client.ts` |
| [ ] | 13 | 11 | **La opción en el plugin y en el harness.** `fudic({ sourceLocations })`, `fudicTest({ sourceLocations })`; el banco la enciende siempre | `vite` · `testing` · `workbench` | `vite/src/index.ts` · `testing/src/config.ts` · `workbench/src/*` |
| [ ] | 14 | 13 | **La marca lo lee.** `onLocate` lee `data-fud-src` del elemento o del primer ancestro que lo tenga, cruzando shadow roots; `Mark.source` | `terms` · `workbench` | `terms/src/locate.ts` · `workbench/src/engine.ts` · `src/protocol.ts` |
| [ ] | 15 | 4, 14 | **`source` en el informe.** Posición y `quote` leído del fichero | `workbench` | `src/report-of.ts` |
| [ ] | 16 | 11–15 | **Los tests de la fase.** Criterios 1 (con `source`), 11–14 | `compiler` · `workbench` | `test/**` |

## Fase 5 — los tests unitarios (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 17 | 8 | **`runTests`.** Entrada `@fudic/testing/run`: `createVitest` en proceso, el `vitest.config` del proyecto, reporter en memoria; `paths` y `names` | `testing` | `src/run.ts` · `package.json` (`exports`) |
| [ ] | 18 | 17 | **`fail` y `broken`.** Por el nombre del error; fichero que no carga con `name: null` y los diagnósticos de un `FudicCompileError`; `at` y `quote` de la pila; `expected` y `actual` | `testing` | `src/run.ts` |
| [ ] | 19 | 5, 17 | **Último informe y `failing`.** `.fudic/runs/last-spec.json` y `last-test.json`; `failing` en `runSpecs` y `runTests` (SDD §4.6) | `workbench` · `testing` | `src/run.ts` (los dos) |
| [ ] | 20 | 17–19 | **Los tests de la fase.** Criterios 15–19 | `testing` | `test/run*.test.ts` |

## Fase 6 — el árbol de roles (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 21 | — | **`outline` en happy-dom.** Árbol aplanado (shadow roots y slots), rol, nombre y estados con `aria-query` y `dom-accessibility-api`, en el formato de Playwright (SDD §4.7) | `testing` | `src/outline.ts` · `src/index.ts` · `package.json` |
| [ ] | 22 | — | **`outlineOf` en el navegador.** `ariaSnapshot()` de Playwright | `workbench` | `src/outline.ts` · `src/index.ts` |
| [ ] | 23 | 21, 22 | **Los tests de los dos motores.** Criterios 21 y 22: el mismo texto en las ocho piezas | `testing` · `workbench` | `test/outline*.test.ts` |

## Fase 7 — cierre (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 24 | 23 | **Docs.** README de `@fudic/workbench` (el informe, `run --json`), de `@fudic/terms` (`Evidence` para quien escribe un término) y de `@fudic/testing` (`runTests`, `outline` y lo que happy-dom no sabe), en inglés y sin citar SDD | varios | `packages/*/README.md` |
| [ ] | 25 | 24 | **Entrega.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; lo nuevo al 100 % en las cuatro métricas sin `v8 ignore`; ningún umbral baja (criterio 23) | — | — |
| [ ] | 26 | 25 | **Cierre.** SDD-64 y este fichero en `Hecho`; fila y registro de progreso del `INDEX.md` | — | `docs/sdd/*` |
