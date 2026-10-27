# BUG-53 — Tareas

> **BUG:** [BUG-53 — La precarga no conoce el grafo de cada chunk](./BUG-53-precarga-sin-sw-a-medias.md)
> **Paquetes:** `@fudic/core` · `@fudic/transport` · `@fudic/vite` · `examples/basic`
> **Rama:** `bug-53-precarga-con-grafo` (nace de `main`)
> **Progreso:** 0 / 9 — `Listo`.

Primero los tests que fallan, después el arreglo. Las tareas 1 y 2 se ven fallar en los proyectos
`nosw` y con SW antes de tocar el código.

---

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **Test que falla, sin SW.** `/usuarios` en `nosw`: tras `fud:warmed` el primer clic no pide ningún `.js`. Hoy falla. Criterio 1 | `examples/basic` | `tests/hydration.spec.ts` |
| [ ] | 2 | — | **Test que falla, con SW.** Lo mismo con SW, más: ningún `<link rel="modulepreload">` ni aviso de precarga en consola. Hoy falla la parte del clic si las piezas llegan tarde; si pasa, se deja como guardián. Criterios 2 y 3 | `examples/basic` | `tests/sw-network.spec.ts` |
| [ ] | 3 | — | **El manifiesto con el grafo completo.** `hydrate` lleva, por chunk y por idioma, los compartidos y el cierre de piezas `/_fudic/…` con `loadedPieces` (BUG §4.1) | `vite` | `src/plugin.ts` · `src/manifest.ts` · `src/runtime-link.ts` |
| [ ] | 4 | 3 | **`hydrateGraphOf` y `hydrateNameOf` en `transport`**, exportados y publicados como pieza (SDD-45) para el coordinador sin SW (BUG §3) | `transport` | `src/manifest.ts` · `src/urls.ts` · `src/index.ts` |
| [ ] | 5 | 4 | **El SW sin leer bytes.** `warmHydration` pide en paralelo el chunk y su grafo; fuera `runtimeImportsOf` del warm; la regla de «todos o ninguno» igual (BUG §4.2) | `transport` | `src/router.ts` |
| [ ] | 6 | 4 | **El canal sin SW.** `graph` en `PreloadChannelConfig`; el coordinador sin SW lo construye: manifiesto una vez con `priority: 'low'`, lista vacía si el `build` no coincide o no llega; un `<link>` por URL sin repetir; `fud:warmed` cuando cargan todas; sin `graph`, lo de hoy; el comentario corregido (BUG §4.3, §4.4) | `core` · `vite` | `src/hydrate/warm/preload.ts` · `src/coordinator.ts` · `src/plugin.ts` |
| [ ] | 7 | 3–6 | **Los tests unitarios.** Criterios 4–9 | `core` · `transport` · `vite` | `test/**` |
| [ ] | 8 | 1–7 | **Los tests del ejemplo en verde** y la prueba de Pedro en el navegador, con `preview` y `preview:nosw`: pestaña de red al entrar en pantalla y al primer clic, y la consola sin avisos con SW | `examples/basic` | `tests/*` |
| [ ] | 9 | 8 | **Entrega y cierre.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; `core` al 100 % y `transport` y `vite` sin bajar de su suelo (criterio 10); BUG-53 a `Hecho`, su fila en `bugs/INDEX.md` y entrada en el registro de progreso | todos | `docs/sdd/bugs/` |

---

## Criterios → tareas

| Criterio | Tareas |
|---|---|
| 1 | 1, 6, 8 |
| 2, 3 | 2, 5, 8 |
| 4 | 3, 7 |
| 5–9 | 6, 7 |
| 10 | 9 |
