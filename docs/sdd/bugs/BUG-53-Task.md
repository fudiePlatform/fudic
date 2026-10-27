# BUG-53 — Tareas

> **BUG:** [BUG-53 — La precarga no conoce el grafo de cada chunk](./BUG-53-precarga-sin-sw-a-medias.md)
> **Paquetes:** `@fudic/core` · `@fudic/transport` · `@fudic/vite` · `examples/basic`
> **Rama:** `bug-53-precarga-con-grafo` (nace de `bug-52-tests-entorno`, a petición de Pedro)
> **Progreso:** 10 / 10 — `Hecho`.

Primero los tests que fallan, después el arreglo. Las tareas 1 y 2 se ven fallar en los proyectos
`nosw` y con SW antes de tocar el código.

---

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Test que falla, sin SW.** `/usuarios` en `nosw`: tras `fud:warmed` el primer clic no pide ningún `.js`. Hoy falla. Criterio 1 | `examples/basic` | `tests/hydration.spec.ts` |
| [x] | 2 | — | **Test que falla, con SW.** Lo mismo con SW, más: ningún `<link rel="modulepreload">` ni aviso de precarga en consola. Hoy falla la parte del clic si las piezas llegan tarde; si pasa, se deja como guardián. Criterios 2 y 3 | `examples/basic` | `tests/sw-network.spec.ts` |
| [x] | 3 | — | **El manifiesto con el grafo completo.** `hydrate` lleva, por chunk y por idioma, los compartidos y el cierre de piezas `/_fudic/…` con `loadedPieces` (BUG §4.1) | `vite` | `src/plugin.ts` · `src/manifest.ts` · `src/runtime-link.ts` |
| [x] | 4 | 3 | **`hydrateGraphOf` y `hydrateNameOf` en `transport`**, exportados y publicados como pieza (SDD-45) para el coordinador sin SW (BUG §3) | `transport` | `src/manifest.ts` · `src/urls.ts` · `src/index.ts` |
| [x] | 5 | 4 | **El SW sin leer bytes.** `warmHydration` pide en paralelo el chunk y su grafo; fuera `runtimeImportsOf` del warm; la regla de «todos o ninguno» igual (BUG §4.2) | `transport` | `src/router.ts` |
| [x] | 6 | 4 | **El canal sin SW.** `graph` en `PreloadChannelConfig`; el coordinador sin SW lo construye: manifiesto una vez con `priority: 'low'`, lista vacía si el `build` no coincide o no llega; un `<link>` por URL sin repetir; `fud:warmed` cuando cargan todas; sin `graph`, lo de hoy; el comentario corregido (BUG §4.3, §4.4) | `core` · `vite` | `src/hydrate/warm/preload.ts` · `src/coordinator.ts` · `src/plugin.ts` |
| [x] | 7 | 3–6 | **Los tests unitarios.** Criterios 4–9 | `core` · `transport` · `vite` | `test/**` |
| [x] | 8 | 1–7 | **Los tests del ejemplo en verde** y la prueba de Pedro en el navegador, con `preview` y `preview:nosw`: pestaña de red al entrar en pantalla y al primer clic, y la consola sin avisos con SW | `examples/basic` | `tests/*` |
| [x] | 9 | 8 | **Entrega y cierre.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; `core` al 100 % y `transport` y `vite` sin bajar de su suelo (criterio 10); BUG-53 a `Hecho`, su fila en `bugs/INDEX.md` y entrada en el registro de progreso | todos | `docs/sdd/bugs/` |
| [x] | 10 | 9 | **Ampliado tras la prueba de Pedro: todo `.js` descargado, precargado.** El grafo sigue los `import()` y lleva las piezas que el runtime carga bajo demanda; el `<head>` sin SW precarga el chunk y el grafo de lo que hidrata al cargar (`fud-eager`); e2e con la comprobación de Pedro (BUG §4.1, §4.3.1, criterios 9.1–9.2) | `compiler` · `vite` · `examples/basic` | `src/emit/maps.ts` · `src/plugin.ts` · `src/client.ts` · `src/prune.ts` · `src/runtime-link.ts` · `tests/hydration.spec.ts` |

---

## Criterios → tareas

| Criterio | Tareas |
|---|---|
| 1 | 1, 6, 8 |
| 2, 3 | 2, 5, 8 |
| 4 | 3, 7 |
| 5–9 | 6, 7 |
| 10 | 9 |

## Notas de la implementación

- **Tarea 8.** Playwright entero en verde: 270 de 270 en los tres proyectos. En dos pasadas
  anteriores falló una vez cada uno de dos tests ajenos: el 23 de `hydration.spec.ts` en `dev`
  (no espera a que `product-list` hidrate tras su clic; con el canal de antes falla igual, 2 de 4)
  y la búsqueda de `usuarios.spec.ts` con SW (una vez en unas cien; 70 de 70 al repetirla). La
  prueba en el navegador con `preview` y `preview:nosw` queda para Pedro.
- **El test 21** de `hydration.spec.ts` se endurece en `nosw`: tras la precarga, el gesto no pide
  nada. En `dev` sigue pagando el código compartido, que es lo que dice §6.
- **Tarea 10.** La prueba de Pedro en `/usuarios` sin SW encontró 29 `.js` sin precarga: el chunk de
  la ruta, que hidrata al cargar, y lo que cuelga de él, más lo que se carga con `import()`. Ahora el
  `<head>` los precarga todos (un marcador por ruta que el bundle rellena cuando el grafo existe) y
  el grafo del manifiesto incluye lo dinámico. `vite` en 99,02 / 96,19 / 99,71 / 99,14; `compiler`
  igual que su suelo. Playwright 271 de 271.
