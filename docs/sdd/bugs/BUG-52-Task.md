# BUG-52 — Tareas

> **BUG:** [BUG-52 — Tests que dependen de quién los ejecuta](./BUG-52-tests-que-dependen-del-entorno.md)
> **Paquetes:** `@fudic/cli` · `@fudic/terms`
> **Rama:** `bug-52-tests-entorno` (nace de `main`)
> **Progreso:** 0 / 7 — `Listo`.

Primero el test que falla, después el arreglo. Las tareas 1–3 se ven fallar en Windows sin TTY
antes de tocar el código.

---

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **Test que falla: sin terminal, sin color.** `nodeServeDeps` en `win32` sin TTY: el hijo recibe `NO_COLOR=1` y ninguna línea lleva `\u001b[`. Y con TTY recibe `FORCE_COLOR=1`. Criterios 1 y 2 | `cli` | `test/serve/node-deps.test.ts` |
| [ ] | 2 | 1 | **El arreglo.** Sin TTY, el entorno del hijo lleva `NO_COLOR=1` y no lleva `FORCE_COLOR` (BUG §4.1) | `cli` | `src/serve/workspace.ts:146-147` |
| [ ] | 3 | — | **El test del runner.** Quitar los códigos ANSI antes de comparar el resumen, y un caso con `FORCE_COLOR=1` en el entorno del hijo. Criterio 3 | `cli` | `test/workspace/vitest-projects.test.ts` |
| [ ] | 4 | — | **El límite del navegador.** `hookTimeout: 60_000` en la configuración de `@fudic/terms`. Criterio 4 | `terms` | `vitest.config.ts` |
| [ ] | 5 | — | **El alcance.** Buscar otros tests que comparen salida de procesos con color y otros `beforeAll` que lancen un navegador con el límite por defecto (`workbench`, `testing`); arreglar los que haya con la misma regla | varios | `test/` · `vitest.config.ts` |
| [ ] | 6 | 1–5 | **Entrega.** `pnpm test` desde la raíz en verde en Windows en el shell de Claude Code (sin TTY) y en un terminal; ningún umbral baja. Criterio 5 | todos | — |
| [ ] | 7 | 6 | **Cierre.** BUG-52 a `Hecho`, su fila en `bugs/INDEX.md` y entrada en el registro de progreso | — | `docs/sdd/bugs/` |

---

## Criterios → tareas

| Criterio | Tareas |
|---|---|
| 1, 2 | 1, 2 |
| 3 | 3 |
| 4 | 4 |
| 5 | 5, 6 |
