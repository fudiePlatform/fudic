# BUG-34 — Tareas

> **BUG:** [BUG-34 — El plugin reconstruye la tabla de rutas reactivas en cada `transform`](./BUG-34-tabla-de-rutas-por-modulo.md)
> **Paquetes:** `@fudic/vite`
> **Rama:** `worktree-worktree-sdd-39-rutas-reactivas` (el defecto nace con SDD-39 y se
> arregla donde vive)
> **Progreso:** 4 / 4

Cuatro tareas, y el orden habitual va del revés en este BUG: **la corrección aterrizó
primero**, porque la medida que la justifica es el propio aviso de rolldown y ese se ve
sin escribir una línea de test. Los dos tests se escribieron después, contra el código ya
arreglado, y se vieron fallar revirtiendo la línea 187 — dos de los cuatro en rojo, con el
contador en 4 y en 2 donde tiene que decir 1.

---

## Mapa de dependencias

```
1 el caché  ──→  2 salida idéntica  ──→  3 el contador  ──→  4 la invalidación
   (hecho)          (hecho, a mano)         (hecho)            (hecho)
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
| [x] | 3 | 1 | **(visto fallar revirtiendo la 1)** **El contador.** `routeNameLookup` envuelto por un espía: transformar cuatro `.fud` del mismo build construye la tabla **una vez**, y transformar el mismo dos veces tampoco la reconstruye. Contra el código roto los contadores dan 4 y 2. Criterio 1 | `vite` | `test/route-name-cache.test.ts` |
| [x] | 4 | 3 | **La invalidación.** Una ruta aparece entre dos descubrimientos: `buildStart` reasigna `builds`, la tabla se reconstruye una sola vez y la ruta nueva publica su nombre. Más la ruta sin mitad de cliente, que sigue sin nombre. Es lo que sostiene el dev server, donde `builds` se reasigna en cada petición. Criterio 2 | `vite` | `test/route-name-cache.test.ts` |

---

## Notas

- **Fichero de test nuevo, no fichero de `src` nuevo.** La corrección no añade un módulo:
  son diez líneas dentro de `plugin.ts`, que arrastra deuda conocida. Lo que sí nace al
  100 % es ese código, y así está — las dos caras de la condición medidas sobre el informe
  de cobertura (45/53 y 98/54), sin un solo `ignore`.
- **El suelo del paquete no se movió.** `@fudic/vite` estaba en 96,19 / 90,17 / 96,37 /
  96,09 antes de estos tests y sigue igual: las líneas nuevas ya las pisaban los tests de
  build, y lo que estos cuatro añaden es la afirmación que faltaba, no cobertura.
- **El espía envuelve un solo export.** `vi.mock` sobre `client.js` reexporta el resto tal
  cual, así que el descubrimiento de componentes, la sonda de DI y los helpers de id son
  los reales. Envolver el módulo entero habría sido probar el mock.
- **Lo que este BUG deja anotado y no toca** está en §7: los tres builds anidados de
  `generateBundle` (1 187 ms) y `loadWithSourceMap` sin caché (~170 ms). Ninguno de los dos
  cuenta para el aviso de rolldown, que solo mide `transform`.
