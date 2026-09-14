# BUG-34 — Tareas

> **BUG:** [BUG-34 — El plugin reconstruye la tabla de rutas reactivas en cada `transform`](./BUG-34-tabla-de-rutas-por-modulo.md)
> **Paquetes:** `@fudic/vite`
> **Rama:** `worktree-worktree-sdd-39-rutas-reactivas` (el defecto nace con SDD-39 y se
> arregla donde vive)
> **Progreso:** 2 / 4

Cuatro tareas, y el orden habitual va del revés en este BUG: **la corrección aterrizó
primero**, porque la medida que la justifica es el propio aviso de rolldown y ese se ve
sin escribir una línea de test. Los dos tests que quedan se escriben contra el código ya
arreglado y tienen que verse fallar revirtiendo la línea 187 — un `git stash` de dos
líneas, no una reconstrucción.

---

## Mapa de dependencias

```
1 el caché  ──→  2 salida idéntica  ──→  3 el contador  ──→  4 la invalidación
   (hecho)          (hecho, a mano)         (pendiente)        (pendiente)
```

---

## Fase 1 — la corrección (1, 2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El lector se conserva.** `routeNameOf` deja de invocar `routeNameLookup` por llamada y guarda el lector junto al `builds` del que salió; se reconstruye cuando la identidad de `builds` cambia. §4 | `vite` | `src/plugin.ts` |
| [x] | 2 | 1 | **La salida no se movió.** Listado de `dist/` de `examples/basic` antes y después: 109 ficheros, mismos hashes, mismo build id, diff vacío. Y el aviso `PLUGIN_TIMINGS` no aparece en tres builds seguidos. Criterios 3 y 4 | — | `examples/basic` |

---

## Fase 2 — los tests (3, 4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 3 | 1 | **(se ve fallar revirtiendo la 1)** **El contador.** Un `ResolveIo` instrumentado que cuenta resoluciones: transformar N `.fud` del mismo build resuelve las rutas **una vez**, no N. Contra el código roto el contador crece linealmente con N. Criterio 1 | `vite` | `test/plugin.test.ts` |
| [ ] | 4 | 3 | **La invalidación.** Transformar con un `builds`, sustituirlo por otro array en el que la ruta pasa a ser reactiva, y comprobar que la llamada siguiente publica el nombre nuevo. Es lo que sostiene el dev server, donde `builds` se reasigna en cada petición. Criterio 2 | `vite` | `test/plugin.test.ts` |

---

## Notas

- **No hay cobertura nueva que perseguir.** La corrección no añade una rama que un test no
  recorra ya: las dos caras del `if` las pisan las tareas 3 y 4.
- **Lo que este BUG deja anotado y no toca** está en §7: los tres builds anidados de
  `generateBundle` (1 187 ms) y `loadWithSourceMap` sin caché (~170 ms). Ninguno de los dos
  cuenta para el aviso de rolldown, que solo mide `transform`.
