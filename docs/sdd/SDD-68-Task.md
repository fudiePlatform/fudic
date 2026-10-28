# SDD-68 — Tareas

> **SDD:** [SDD-68 — Llamadas sin fontanería](./SDD-68-llamadas-sin-fontaneria.md)
> **Paquetes:** `@fudic/core` · `@fudic/http` · `@fudic/conventions` · `@fudic/compiler` · `examples/basic`
> **Rama:** `sdd-68-llamadas-sin-fontaneria`. Nace de `main` **con SDD-67 en `Hecho`**: el endpoint
> de datos y las llamadas ya viajan en binario.
> **Progreso:** 11 / 20 — `En curso`.

**Dos sesiones.** Una implementa y coordina. La otra escribe los tests de cada fase (las tareas
«Los tests de…») contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test.

**El orden manda en dos puntos.**

- **`owned` va antes que `task`.** Una tarea sin dueño no se puede probar al desmontar, y el
  `effect` tiene que pasar por el mismo sitio.
- **El repintado va antes que el ejemplo.** El ejemplo deja de llamar a `location.reload()` solo
  cuando la página ya se repinta sola; si va antes, `examples/basic` se queda sin actualizar la
  tabla entre commits.

---

## Mapa de dependencias

```
1 owned ─→ 2 effect con dueño ─→ 3 task: latest ─→ 4 task: queue ─→ 5 estado, error y cancel ─→ 6 tests
   │
   ▼
7 owned en el emit ─→ 8 tests
   │
   ▼
9 method en el stub ─→ 10 DATA_STALE_EVENT ─→ 11 el stub avisa y espera ─→ 12 load.fetch ─→ 13 tests
   │
   ▼
14 data refrescable en la ruta ─→ 15 el oyente de la ruta ─→ 16 si falla, recarga ─→ 17 tests
   │
   ▼
18 usuarios.fud ─→ 19 README y docs ─→ 20 tests, entrega y cierre
```

---

## Fase 1 — `task` en `@fudic/core` (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **`owned`.** Una pila de dueños: mientras corre `fn`, lo que se registra en el dueño actual queda en la lista que devuelve (SDD §3.5) | `core` | `src/owner.ts` · `src/index.ts` |
| [x] | 2 | 1 | **`effect` con dueño.** Su desmontaje se registra en el dueño actual, si lo hay; sin dueño, igual que hoy | `core` | `src/effect.ts` |
| [x] | 3 | 1 | **`task`, modo `latest`.** `source` (sin llamar en la primera lectura), `run`, numeración de llamadas para no escribir una sustituida, `initial`, modo por `method` (SDD §4.1, §4.2) | `core` | `src/task.ts` · `src/index.ts` |
| [x] | 4 | 3 | **`task`, modo `queue`.** La cola en orden; ninguna se descarta; `mode` cambia el modo (SDD §4.3) | `core` | `src/task.ts` |
| [x] | 5 | 3, 4 | **Estado, error y `cancel`.** La tabla de SDD §4.4; `run` nunca rechaza; `cancel` aborta y vacía la cola; desmontar = `cancel` + dejar de escuchar + `run` inerte (SDD §4.5, §4.6) | `core` | `src/task.ts` |
| [x] | 6 | 2–5 | **Los tests de la fase.** Criterios 1–10 y 12 (la parte de `core`) con `fn` controladas | `core` | `test/task.test.ts` · `test/owner.test.ts` |

## Fase 2 — el desmontaje en el emit (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 7 | 1 | **`owned` alrededor del `@code`.** En el factory de un componente y de una ruta, el `@code` corre dentro de `owned` y su lista se vuelca en `$d` (SDD §4.6). En el servidor no cambia nada | `compiler` | `src/emit/client.ts` · `src/emit/route-client.ts` |
| [ ] | 8 | 7 | **Los tests de la fase.** Criterios 12 y 13 en un navegador de test (happy-dom): quitar el componente aborta la llamada y para el intervalo; criterio 14 (SSR inerte e hidratación sin diferencias) | `compiler` | `test/**` |

## Fase 3 — el aviso desde `@fudic/http` (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 9 | — | **`method` en el stub.** `ServerFunction.method`, copiado de `spec.method` (SDD §3.2) | `http` | `src/types.ts` · `src/contract/fn.ts` |
| [x] | 10 | — | **`DATA_STALE_EVENT`** y `DataStaleDetail` (SDD §3.3) | `conventions` | `src/index.ts` |
| [x] | 11 | 9, 10 | **El stub avisa y espera.** Tras `invalidate`, si la página actual está entre las rutas invalidadas (concreta o por patrón, con la comparación que usa el SW), despacha el evento, junta lo que le pasan con `wait` y resuelve la llamada después (SDD §4.8, paso 1) | `http` | `src/contract/fn.ts` · `src/client/invalidate.ts` |
| [x] | 12 | — | **`load.fetch`.** La variante de navegador de la pieza `load` pide `DATA_PREFIX + path` y lee el JSON que sirve hoy el endpoint (SDD-70 lo pasará a tramas binarias) (SDD §3.4) | `http` · `api` | `src/contract/page.ts` · emisor del módulo de la ruta |
| [ ] | 13 | 11, 12 | **Los tests de la fase.** El evento sale y la llamada espera a su `wait`; un `get` sin `invalidates` no lo despacha (criterio 18); `load.fetch` decodifica lo que sirve el endpoint | `http` | `test/**` |

## Fase 4 — la ruta se repinta (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 14 | 7 | **`data` refrescable.** En una ruta con `load` y chunk de cliente: `let data = $data` y un contador de versión del que dependen las lecturas de `data` en la vista (SDD §4.8, paso 3) | `compiler` | `src/emit/route-client.ts` · `src/emit/markup-client.ts` |
| [ ] | 15 | 12, 14 | **El oyente de la ruta.** El chunk importa `load.fetch`, escucha `DATA_STALE_EVENT`, pide el `data`, lo cambia y sube el contador; entrega su promesa con `wait` (SDD §4.8, paso 2) | `compiler` · `core` | `src/emit/route-client.ts` · `src/route-data.ts` |
| [ ] | 16 | 15 | **Si falla, recarga.** Un refresco que falla hace `location.reload()` (SDD §4.8, paso 4) | `core` | `src/route-data.ts` |
| [ ] | 17 | 14–16 | **Los tests de la fase.** Criterios 15–17 con el ejemplo en el navegador de test: la fila cambia sin recargar, las filas que siguen son los mismos nodos, y un 500 del endpoint recarga | `compiler` · `examples/basic` | `test/**` |

## Fase 5 — el ejemplo y cierre (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 18 | 6, 17 | **`usuarios.fud`.** `task(search, …)` con `initial: []`, la búsqueda lenta como tarea propia con su «Cancelar», `task(save)` y `task(remove)`; fuera `lanzar`, `buscar`, `busqueda`, `AbortController` y `location.reload()`; los textos de la página dicen lo que se ve en Network (criterio 19) | `examples/basic` | `src/routes/usuarios.fud` |
| [ ] | 19 | 18 | **README y docs.** `task`, sus dos modos, la tabla de estados, qué pasa con `error-pages`, el desmontaje y que una tarea creada en un handler vive con la página; en `@fudic/http`, el campo `method` y el repintado | `core` · `http` | `packages/core/README.md` · `packages/http/README.md` |
| [ ] | 20 | 18, 19 | **Tests, entrega y cierre.** Criterios 11 y 20; `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; lo nuevo al 100 % en las cuatro métricas; SDD-68 y este fichero en `Hecho`, fila y registro del `INDEX.md` | varios | `test/**` · `docs/sdd/*` |
