# BUG-54 — Tareas

> **BUG:** [BUG-54 — Sin Service Worker, cada página descarga el manifiesto entero](./BUG-54-sin-sw-se-descarga-el-manifiesto-entero.md)
> **Paquetes:** `@fudic/vite` · `@fudic/transport` · `examples/basic`
> **Rama:** `sdd-68-llamadas-sin-fontaneria` (a petición de Pedro)
> **Progreso:** 3 / 3 — `Hecho`.

---

| ✓ | # | tarea | package | fichero |
|---|---|---|---|---|
| [x] | 1 | **El grafo dentro del coordinador.** `embedsGraph` en lugar de `manifest`; `warms` por ruta; el marcador y su sustitución en coordinadores, chunks de enlace y de borde, también con las comillas escapadas de un coordinador incrustado. Criterios 1, 2 y 4 | `vite` | `src/coordinator.ts` · `src/client.ts` · `src/plugin.ts` · `test/coordinator.test.ts` · `test/plugin.test.ts` · `test/build-runtime-linked.test.ts` |
| [x] | 2 | **`transport/urls` sin el lector del manifiesto**, y el e2e de `/usuarios` sin SW comprueba que no se pide el manifiesto. Criterio 3 | `transport` · `examples/basic` | `src/urls.ts` · `src/manifest.ts` · `tests/hydration.spec.ts` |
| [x] | 3 | **Cierre.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; `vite` y `transport` sin bajar de su suelo; la prueba de Pedro en el navegador; BUG-54 en `bugs/INDEX.md` | todos | `docs/sdd/bugs/` |

## Notas de la implementación

- Lo empezó otra sesión (commit `wip` de la tarea 1) y lo terminó esta.
- **Una rama que no puede darse.** `graphLiteral` contemplaba un tag sin chunk. No ocurre: los tags
  que una ruta calienta salen de sus componentes y de su mitad cliente, y todos tienen chunk en
  cuanto la ruta no está excluida, que es cuando tiene coordinador. Se quitó en vez de inventarle
  un test.
- **Suelos.** `vite` 99,03 / 96,27 / 99,71 / 99,14 (suelo 99,02 / 96,21 / 99,71 / 99,14).
  `transport` sin bajar.
- `examples/basic` sin SW: ningún coordinador lleva el marcador ni nombra `fudic-routes.json`; el
  de `/formularios` pesa 3,6 kB con el grafo solo de sus tags. Playwright entero en verde.
