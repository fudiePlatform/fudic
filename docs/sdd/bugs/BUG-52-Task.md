# BUG-52 — Tareas

> **BUG:** [BUG-52 — Tests que dependen de quién los ejecuta](./BUG-52-tests-que-dependen-del-entorno.md)
> **Paquetes:** `@fudic/cli` · `@fudic/terms`
> **Rama:** `bug-52-tests-entorno` (nace de `main`)
> **Progreso:** 2 / 9 — `Listo`.

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
| [x] | 6 | — | **El paso tipado con TypeScript 6.** Los casos del paso tipado corren también con TypeScript 6.0 (dependencia de desarrollo con alias) y dan lo mismo; un `const` de texto con `.length` entre ellos. Fuera las máscaras de `TypeFlags`: la API pública del tipo y las `SymbolFlags` del enum (BUG §4.4). Criterio 6 | `typecheck` | `src/portable-types.ts` · `test/portable-types.test.ts` |
| [x] | 7 | — | **`link-server`.** El snippet de `<link rel="server">` donde un fichero puede enlazar un `.fudapi` (BUG §4.5). Criterio 7. Y la consola de sus tests sin interceptar (BUG §4.6). Criterio 8 | `language-server` | `src/services/snippets.ts` · `test/services/snippets.test.ts` · `vitest.config.ts` |
| [ ] | 8 | 1–7 | **Entrega.** `pnpm test` desde la raíz en verde en Windows en el shell de Claude Code (sin TTY) y en un terminal; ningún umbral baja. Criterio 5 | todos | — |
| [ ] | 9 | 8 | **Cierre.** BUG-52 a `Hecho`, su fila en `bugs/INDEX.md` y entrada en el registro de progreso | — | `docs/sdd/bugs/` |

---

## Criterios → tareas

| Criterio | Tareas |
|---|---|
| 1, 2 | 1, 2 |
| 3 | 3 |
| 4 | 4 |
| 5 | 5, 8 |
| 6 | 6 |
| 7, 8 | 7 |
