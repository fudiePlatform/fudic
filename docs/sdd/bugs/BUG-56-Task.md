# BUG-56 — Tareas

> **BUG:** [BUG-56 — El Service Worker guarda para siempre el `data` y las llamadas GET](./BUG-56-sw-cachea-data-y-llamadas-como-runtime.md)
> **Paquetes:** `@fudic/transport`
> **Rama:** `sdd-68-llamadas-sin-fontaneria` (a petición de Pedro: se cierra el producto aquí)
> **Progreso:** 2 / 2 — `Hecho`.

---

## Fase 1 — Solo el runtime en la caché del runtime

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 1 | **`isRuntimePiece` exige el directorio de una versión**, y es la única pregunta al servir, al depositar y en `keepRuntime`. Tests: `data`, `fn` y `marker` no se sirven ni se guardan; las piezas, como antes. Criterios 1–2 | `transport` | `src/router.ts` · `test/router.test.ts` |

## Cierre

| ✓ | # | tarea |
|---|---|---|
| [x] | 2 | El e2e de `/usuarios` con Service Worker en verde (criterio 3, junto con BUG-55); `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; BUG-56 a `Hecho` con su fila y su entrada en `bugs/INDEX.md` |

## Notas de la implementación

- **Suelo de `transport` al empezar:** 98,66 / 95,83 / 97,82 / 98,77. Al cerrar la fase:
  98,66 / 96,19 / 97,82 / 98,77. El arreglo quita una rama cubierta; para no bajar del suelo se
  cubre una de las que ya estaban sin probar (el origen por defecto sin `location`).
