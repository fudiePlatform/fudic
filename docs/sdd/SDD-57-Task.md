# SDD-57 — Tareas

> **SDD:** [SDD-57 — Tests unitarios de componentes, rutas, layouts y snippets](./SDD-57-tests-unitarios.md)
> **Paquetes:** `@fudic/testing` (nuevo) · `@fudic/vite` · `@fudic/core` · `@fudic/http` ·
> `@fudic/example-basic`
> **Rama:** `sdd-57-tests-unitarios` (nace de `main`)
> **Progreso:** 22 / 30 — `Listo`.

**El orden manda en cuatro puntos.**

- **Se mide antes de construir.** La tarea 2 comprueba que el entorno `fudic` carga los tres
  sabores de un `.fud` en un solo grafo y que `vi.mock` llega a un módulo importado desde
  `?server`. §4.1 depende de ello.
- **Montar va antes que los gestos, y los gestos antes que el servidor.** `submit` espera a las
  peticiones (§4.7), así que el rastreo de pendientes tiene que existir antes que el `fetch` del
  harness.
- **La matriz va después de `mount` en los dos caminos.** Sin `via: 'client'` no hay con qué
  comparar.
- **El ejemplo va antes del cierre, y lo ejecuta Pedro.** Corre los tests, rompe algo a propósito
  y lee el fallo.

`@fudic/testing` es un paquete nuevo: nace con `thresholds` al 100 en las cuatro métricas y
`coverage.include: ['src/**/*.ts']`. Lo que se añada a `@fudic/vite`, `@fudic/core` o
`@fudic/http` también entra al 100, sin bajar el suelo de `main` de esos paquetes.

---

## Mapa de dependencias

```
1 paquete ──→ 2 medir ──→ 3 fudicTest y entorno ──→ 4 errores de compilación
                               │
                               ▼
5 aplicar DSD ──→ 6 init y shadowOf ──→ 7 mount ssr ──→ 8 hidratación ──→ 9 mount client ──→ 10 providers ──→ 11 tests
                               │
                               ▼
12 consultas ──→ 13 gestos y settled ──→ 14 aislamiento ──→ 15 tests
                               │
                               ▼
16 tabla de funciones ──→ 17 fetch del harness ──→ 18 providers en servidor ──→ 19 clientGraphOf ──→ 20 tests
                               │
21 worker simulado ──→ 22 tests
                               │
23 matriz y arreglos ──→ 24 contrato del HTML
                               │
25 visit ──→ 26 renderLayout ──→ 27 renderSnippet
                               ▼
                 28 ejemplo ──→ 29 README y prueba de Pedro ──→ 30 cierre
```

---

## Fase 1 — paquete y entorno (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Paquete.** `@fudic/testing` con exports `.` y `./config`, versiones exactas: `happy-dom` 20.10.6 (la del repo), `@testing-library/dom`, `@testing-library/user-event` y `@testing-library/jest-dom`; `vitest` como `peerDependency`. `@fudic/vite`, `@fudic/core`, `@fudic/ssr`, `@fudic/http` y `@fudic/di` como dependencias. `vitest.config` con umbrales al 100 | `testing` | `package.json` · `tsconfig*.json` · `vitest.config.ts` |
| [x] | 2 | 1 | **Medir.** Un entorno de vitest con los globals de happy-dom y `viteEnvironment: 'ssr'`, con el plugin `fudic()`, importa un `.fud` a secas, su `?client` y su `?server`. Un `vi.mock` del test sustituye un módulo que importa el `?server`. Se anota el resultado en esta tarea. Si `vi.mock` no llega, se rediseña §4.1 antes de seguir. **Resultado (2026-10-14): pasa.** El entorno es el `happy-dom` de vitest con `viteEnvironment: 'ssr'` (importado de `vitest/runtime`; `vitest/environments` está deprecado desde 4.1). El `.fud` a secas exporta `render` y `tag`, `?client` define el tag y `?server` exporta la función; su `handle` devuelve lo del `vi.mock` del test sobre el módulo que el `?server` importa. §4.1 se queda como está | `testing` | `test/spike.test.ts` |
| [x] | 3 | 2 | **`fudicTest()` y el entorno `fudic`.** El plugin del proyecto con sus opciones, el entorno de §4.1 y la URL `http://localhost/`. Criterio 1. El entorno sale de `vitest/runtime` (`vitest/environments` está deprecado desde 4.1) | `testing` | `src/config.ts` · `src/environment.ts` |
| [x] | 4 | 3 | **Errores de compilación** (decisión 8.1.7). Importar un `.fud` con errores rechaza con ellos pintados como en el build. Una expresión rota (`@(`) daba el `PARSE_ERROR` de Oxc sobre el `.fud.ts` generado: `compileFud` devuelve el módulo a `null` cuando el emit ya tiene errores, y sale el diagnóstico FUD, también en `vite dev`. Criterio 2 | `vite` · `testing` | `packages/vite/src/compile.ts` · `test/compile-errors.test.ts` |

## Fase 2 — montar (7)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 5 | 3 | **Aplicar el DSD** (§4.2, pasos 2 y 3): del template más interno al más externo, `attachShadow` con el `init` de sus atributos, adoptar las hojas de `shadowrootadoptedstylesheets`, mover el contenido y quitar el template. El contenido se importa al documento antes de aplicar nada: lo que parsea un `<template>` es de su documento inerte | `testing` | `src/dsd.ts` · `src/document.ts` |
| [x] | 6 | 5 | **Apuntar el `init` y `shadowOf`** (§4.4). Envolver `attachShadow` mientras el entorno vive; `shadowOf` con el specifier de cada hoja adoptada y `'self'` para la propia. Se instala en el `setupFiles` que registra `fudicTest()`; `forgetShadowInits` queda listo para el `afterEach` de la tarea 14 | `testing` | `src/shadow.ts` · `src/setup.ts` |
| [x] | 7 | 6 | **`mount` vía `ssr`** (§4.2, paso 1; decisión 8.1.9): una página anfitriona virtual instancia el componente con sus props como literales JSON, y se pinta con `emitRenderChunk` + `renderRouteHtml` por el grafo de vitest. El generador del anfitrión (`src/host.ts`) es el que usará `renderSnippet` (tarea 27); el pintado de una página (`src/page.ts`) es el que reutilizará `visit` (tarea 25). Los ficheros generados van a `node_modules/.fudic-test/` (`src/cache.ts`), y el plugin `fudic:test` añade `$file` al módulo de un `.fud` | `testing` | `src/mount.ts` · `src/host.ts` · `src/page.ts` · `src/cache.ts` · `src/config.ts` |
| [x] | 8 | 7 | **Hidratación** (§4.5): `installHydration` con `document`, `resolveChunk` e `importModule` por el grafo de vitest, e `importDeferred` con las piezas de ese grafo. El upgrade en el sitio que happy-dom no hace (decisión 8.1.10). Cada import cuenta como pendiente: `src/pending.ts` nace aquí y la tarea 13 lo completa | `testing` | `src/hydrate.ts` · `src/upgrade.ts` · `src/pending.ts` |
| [x] | 9 | 7 | **`mount` vía `client`** (§4.3): `createElement`, props como las asigna un padre: `c([props])` en el orden de `propsOf`, y `t.props` con `u()` | `testing` | `src/mount.ts` |
| [x] | 10 | 7 | **`providers` en el cliente:** un contenedor raíz del test con los proveedores encima del árbol, como pares `{ provide, use }` (decisión 8.1.11). El árbol se levanta como el coordinador: desde `fud-ioc` y `fud-di`, o una raíz sola | `testing` | `src/providers.ts` |
| [x] | 11 | 7–10 | **Tests.** Criterios 3, 4, 5, 7 y 8, con componentes de prueba en `test/fixtures/` | `testing` | `test/mount.test.ts` · `test/fixtures/*.fud` |

## Fase 3 — consultas, gestos y espera (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 12 | 7 | **Consultas que bajan por shadow roots**, sobre Testing Library, más `query` y `errorOf` (el slot al que apunta el `aria-describedby` del control con esa etiqueta; decisión 8.1.15) | `testing` | `src/queries.ts` |
| [x] | 13 | 12 | **Gestos y `settled`** (§4.7). Rastreo de lo pendiente: peticiones, chunks y microtareas. Ningún `setTimeout` de espera. `submit` pulsa el botón de envío y `clear` selecciona y borra (decisiones 8.1.16 y 8.1.17) | `testing` | `src/gestures.ts` · `src/pending.ts` |
| [x] | 14 | 13 | **Aislamiento** (§4.8): el `afterEach` que registra el entorno, con un registro de deshacer al que cada pieza añade el suyo (`onCleanup`). Las constantes salen a `src/constants.ts` y los paquetes del harness van a Node (decisión 8.1.18) | `testing` | `src/cleanup.ts` · `src/setup.ts` · `src/constants.ts` |
| [x] | 15 | 12–14 | **Tests.** Criterios 6, 27 y 28. Del 27 quedan el `fetch` y el worker, que llegan con las tareas 17 y 21 y se prueban en las 20 y 22 | `testing` | `test/queries.test.ts` · `test/isolation.test.ts` |

## Fase 4 — el servidor en memoria (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 16 | 3 | **La tabla de funciones por el grafo de vitest.** `devSource` ya recibía el cargador como parámetro; `@fudic/vite` lo expone, con lo demás que el harness necesita, en la entrada `@fudic/vite/harness`, que no carga Vite (decisión 8.1.21) | `vite` · `testing` | `packages/vite/src/harness.ts` · `src/server.ts` |
| [x] | 17 | 13, 16 | **El `fetch` del harness** (§4.6): `fetch` del test, `/_fudic/fn/` a `functionsHandler`, cualquier otra URL lanza nombrándola. Cada petición cuenta como pendiente. Añade lo que añade un navegador (cookies, `Origin`, `Sec-Fetch-Site`), guarda las cookies que fija la respuesta y el entorno conserva el `Request`/`Response`/`Headers` de Node (decisiones 8.1.20 y 8.1.22) | `testing` | `src/fetch.ts` · `src/environment.ts` |
| [x] | 18 | 10, 17 | **`providers` en el servidor:** encima del contenedor de la petición. `@fudic/http` gana la opción `container` de `dispatch`; la página que pinta el harness pasa su raíz por los mismos overrides (decisión 8.1.21) | `testing` · `http` | `src/providers.ts` · `src/page.ts` · `packages/http/src/server/dispatch.ts` |
| [x] | 19 | 3 | **`clientGraphOf` y `toReach`** (§3.10): la transformación de cliente del plugin, recorriendo imports sin ejecutar, con un Vite propio del worker y la poda del bundler: un import que nadie usa se sigue si el módulo tiene efectos de nivel superior (decisión 8.1.23; BUG-47 queda documentado en su test) | `testing` | `src/client-graph.ts` · `src/matchers.ts` |
| [x] | 20 | 16–19 | **Tests.** Criterios 12 a 18, y la parte de `fetch` del criterio 27 | `testing` | `test/app/*.test.ts` · `test/app/src/` |

## Fase 5 — Service Worker (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 21 | 17 | **Worker simulado** (§3.6): `navigator.serviceWorker.controller` que apunta los paths y contesta por el `MessageChannel`; `t.invalidated`. La respuesta cuenta como pendiente hasta que la página cierra su puerto (decisión 8.1.24) | `testing` | `src/sw.ts` |
| [x] | 22 | 21 | **Tests.** Criterios 19 y 20, y la parte del worker del criterio 27 | `testing` | `test/app/sw.test.ts` |

## Fase 6 — variantes del `<template>` (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 23 | 6, 9 | **La matriz.** Siete componentes de prueba (sin atributos, cada uno de los cinco `shadowroot*` y los cuatro de §6.9 juntos) montados por los dos caminos. Cada diferencia entre `ssr` y `client` se arregla en el compilador o en el runtime (decisión 8.1.5) y se anota aquí. Criterios 9 y 10. **Ya visto:** el serializador de `@fudic/ssr` no escribe `shadowrootclonable` ni `shadowrootserializable` en el `<template>`, así que por `ssr` esas dos opciones salen siempre a `false` | `testing` · `core` · `compiler` | `test/template.test.ts` · `test/fixtures/tpl-*.fud` |
| [ ] | 24 | 7 | **El contrato del HTML:** `renderToHtml` y el matcher `toContainTemplate`. Criterio 11 | `testing` | `src/matchers.ts` · `test/template.test.ts` |

## Fase 7 — rutas, layouts y snippets (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 25 | 8, 17 | **`visit`** (§4.9): routing del plugin, `emitRenderChunk`, `load` por el grafo de vitest o `data` en su lugar, y el documento entero sustituido. `@fudic/vite` expone lo que haga falta sin cambiar `vite dev`. Criterios 21, 22 y 23. Reutiliza `renderPage` (`src/page.ts`) y `showPage` (`src/document.ts`) de la tarea 7 | `testing` · `vite` | `src/visit.ts` · `test/app/visit.test.ts` · `test/app/src/routes/` |
| [ ] | 26 | 25 | **`renderLayout`:** `route` con closures que escriben `head`, `body` y las secciones. Criterio 24 | `testing` | `src/layout.ts` · `test/layout.test.ts` |
| [ ] | 27 | 7 | **`renderSnippet`** (§4.10): el anfitrión virtual con `<link rel="snippet">`, el `scope` como literales y `@render <call>`. Criterios 25 y 26 | `testing` | `src/snippet.ts` · `test/snippet.test.ts` |

## Fase 8 — ejemplo y entrega (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 28 | 1–27 | **Ejemplo.** `vitest.config.ts` con `fudicTest()`, script `test`, y los tests del criterio 29 junto a cada fichero | `example-basic` | `vitest.config.ts` · `src/**/*.test.ts` |
| [ ] | 29 | 28 | **README y prueba.** README de `@fudic/testing` en inglés, corto y sin citas a SDD. Pedro ejecuta los tests del ejemplo, en terminal y en modo watch, rompe un componente, un middleware y un `serverValidator` a propósito, y lee cada fallo | `testing` · `example-basic` | `packages/testing/README.md` |
| [ ] | 30 | 1–29 | **Cierre.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde. `@fudic/testing` al 100 % en las cuatro métricas y ningún paquete por debajo de su suelo de `main`. Estado `Hecho` en la SDD, en este fichero y en el `INDEX.md`, con su entrada en el registro de progreso | — | `docs/sdd/SDD-57-*.md` · `docs/sdd/INDEX.md` |
