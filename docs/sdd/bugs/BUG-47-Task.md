# BUG-47 — Tareas

> **BUG:** [BUG-47 — El navegador recibe código del servidor y un runtime que no se renueva](./BUG-47-lo-que-el-navegador-no-deberia-ver.md)
> **Paquetes:** `@fudic/vite`
> **Rama:** `bug/47-servidor-y-runtime`, desde `main` una vez fusionada `sdd/http`.
> **Progreso:** 11 / 12 — `En curso`.

Lo nuevo nace al 100 % en las cuatro métricas, y `@fudic/vite` no baja de su suelo de `main`.
Antes de tocar nada, se mide ese suelo con `pnpm --filter @fudic/vite coverage`.

---

## Fase 1 — Lo que usa la mitad borrada se va con ella (3)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 1 | — | **Imports huérfanas.** Un módulo nuevo, que recibe el código, su AST y los tramos borrados, y quita cada especificador cuyo nombre local ya no aparece fuera de esos tramos. Si una declaración se queda vacía, se quita entera; `import './x'` se queda (BUG §4.1). Una sola pasada de Oxc por módulo: reutiliza el AST del borrado | `src/orphan-imports.ts` |
| [x] | 2 | 1 | **Los dos borrados lo usan.** `eraseServerHalves` y `eraseServerValidators` devuelven, además del código, los tramos que borraron, y aplican la tarea 1. El transform del plugin encadena los dos como hoy | `src/server-halves.ts` · `src/server-validators.ts` · `src/plugin.ts` |
| [x] | 3 | 1, 2 | **Tests.** Criterios 1, 2 y 3. El 3 con un build real y un `tokens.ts` que acaba en `Service(Tokens)` | `test/orphan-imports.test.ts` · `test/http-build.test.ts` |

## Fase 2 — Los mapas no llevan lo borrado (2)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 4 | 2 | **Anotar y vaciar.** El transform anota el id de cada módulo al que le borró algo. En `generateBundle`, solo en el build de cliente, cada mapa de chunk deja a `null` la entrada de `sourcesContent` de esos módulos, comparando por ruta absoluta y no por el texto relativo de `sources` (BUG §4.2). El pase edge y el prerender no se tocan | `src/plugin.ts` |
| [x] | 5 | 4 | **Tests.** Criterio 4, con `sourcemap: true`: el mapa de `auth.ts` y el de un formulario con `serverValidator` llevan `null`, y uno sin borrado conserva su texto | `test/build-sourcemaps-erased.test.ts` |
| [x] | 5b | 4 | **Chunks del Service Worker y solo tipos** (añadida, BUG §4.1 y §4.4). El pase de enlace borra igual y comparte el registro de módulos borrados; sus mapas se vacían al emitirse. Una import que se queda solo con tipos en línea pasa a `import type`. Tests de los criterios 9 y 10 | `src/erased-sources.ts` · `src/link.ts` · `src/orphan-imports.ts` · `test/*` |

## Fase 3 — La URL del runtime por contenido (3)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 6 | — | **La huella.** Al descubrir las piezas de un paquete, se calcula el SHA-256 de sus `.js` (nombre y bytes, en orden) y el segmento pasa a `<version>-<8 hex>` (BUG §3). `RuntimeFs` gana una lectura de bytes; los tests la inyectan como hoy inyectan `readDir` | `src/runtime-pieces.ts` |
| [x] | 7 | 6 | **La caché.** `runtime-link.ts` sigue leyendo el segmento de la URL de `@fudic/core`. Se comprueba que el nombre resultante es `fudic-runtime-<version>-<huella>` y que el barrido de cachés no cambia | `src/runtime-link.ts` |
| [x] | 8 | 6, 7 | **Tests.** Criterios 5 y 6 | `test/runtime-pieces.test.ts` · `test/runtime-link.test.ts` |
| [x] | 8b | 6 | **Segundo salto** (añadida, BUG §4.5). Al copiar, cada pieza reescribe `/_fudic/<version>/<paquete>/` por el segmento con huella de ese paquete; la huella cubre en cierre transitivo las de los paquetes a los que apuntan sus piezas. Tests del criterio 11 | `src/runtime-pieces.ts` · `src/runtime-link.ts` · `test/*` |

## Fase 4 — Tras la prueba de Pedro (1)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [x] | 8c | 1–8b | **Depurable y csrf** (BUG §4.2 corregido, §4.6). El borrado deja en blanco en vez de recortar; cada entrada JS/TS de `sourcesContent` de un mapa de cliente pasa por el mismo borrado en vez de ir a `null`; un módulo de `@fudic/http` se borra sin la marca de import. Tests de los criterios 4, 10, 12 y 13 | `src/orphan-imports.ts` · `src/server-halves.ts` · `src/erased-sources.ts` · `test/*` |

## Cierre (1)

| ✓ | # | dep | tarea | fichero |
|---|---|---|---|---|
| [ ] | 9 | 1–8 | **Cierre.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde, con la cobertura de §6.8. Pedro hace el criterio 7 en el navegador. `Hecho` en este fichero, en el BUG, en el `INDEX.md` de bugs (tabla y registro) y en el registro del `INDEX.md` maestro | `docs/sdd/bugs/*` · `docs/sdd/INDEX.md` |
