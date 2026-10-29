# BUG-60 — Tareas

> **BUG:** [BUG-60 — `fud-data` repite los nombres de los campos en cada fila](./BUG-60-fud-data-sin-claves.md)
> **Paquetes:** `@fudic/ssr` · `@fudic/core` · `@fudic/api` · `@fudic/vite` · `@fudic/compiler`
> **Rama:** `sdd-68-llamadas-sin-fontaneria` (a petición de Pedro: se cierra el producto aquí)
> **Progreso:** 5 / 6 — `Borrador`.

---

## Fase 1 — el formato, en sus dos extremos

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 1 | **Empaquetar**: `packData(shape, value)`. Criterios 2 y 3 | `ssr` | `src/data-pack.ts` · `test/data-pack.test.ts` |
| [x] | 2 | **Desempaquetar**: `unpackData(shape, raw)`. Criterios 2 y 3 | `core` | `src/hydrate/data.ts` · `test/hydrate/data.test.ts` |

## Fase 2 — la forma de `data`, del `.fudapi` al compilador

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 3 | **`dataShape`** del `load` y de los tipos que nombra; `LinkedApi.data` desde `linked()`. Criterio 2 | `api` · `vite` · `compiler` | `src/data-shape.ts` · `test/data-shape.test.ts` · `src/api-modules.ts` · `test/api-units.test.ts` · `src/types/io.ts` |

## Fase 3 — el emit

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 4 | **El bloque empaquetado** y el chunk que lo desempaqueta; `packData` en el `io` del wrapper. Criterios 1, 4, 5 y 6 | `compiler` · `vite` | `src/emit/maps.ts` · `src/emit/route-client.ts` · `src/emit/api-links.ts` · `test/emit/hydrate/packed-data.test.ts` · `src/wrapper.ts` |

## Cierre

| ✓ | # | tarea |
|---|---|---|
| [x] | 5 | `pnpm typecheck`, `pnpm test` y `pnpm build` en verde |
| [ ] | 6 | Prueba de Pedro en el navegador sobre `/usuarios`; BUG-60 a `Hecho` con su fila y su entrada en `bugs/INDEX.md` |
