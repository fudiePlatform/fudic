# SDD-35 — Tareas

> **SDD:** [SDD-35 — O compila o no compila](./SDD-35-compilo-o-no-compilo.md)
> **Paquetes:** `@fudic/typecheck` (nuevo) · `@fudic/language-server` · `@fudic/vite` ·
> `@fudic/compiler` · `@fudic/example-basic`
> **Rama:** por crear desde `main`
> **Progreso:** 0 / 22

**El orden manda en tres puntos.**

- **La 1 va antes que todo.** El hueco se ve fallar antes de taparlo; si no, el test solo
  demuestra que el código nuevo hace lo que hace.
- **La mudanza (fase 2) va antes que el chequeo.** El chequeo se escribe sobre la máquina ya
  movida. Al revés, se escribiría una segunda máquina «provisional», que es lo que este SDD
  existe para impedir.
- **La paridad (12) va antes que el build.** Hasta que el corpus da lo mismo por los dos caminos,
  enchufar el chequeo al build solo traslada las diferencias a otro sitio.

---

## Mapa de dependencias

```
1 la medida
2 paquete ──→ 3 receta ──→ 4 registry ──→ 5 globals ──→ 6 LanguagePlugin ──→ 7 reglas FUD ──→ 8 el servidor importa
                                                                                              │
              9 ficheros y opciones ──→ 10 Program y diagnósticos ──→ 11 orden y formato ──→ 12 paridad
                                                                                              │
                                                  13 retirar FUD0197–0199 ────────────────────┤
                                                                                              │
              14 buildStart ──→ 15 transform con posición ──→ 16 caminos que descartan       │
              17 dev vivo ──→ 18 página bloqueada ──→ 19 middleware de scripts               │
                                                                                              │
              20 examples/basic ──→ 21 Chrome ──→ 22 cierre ◄─────────────────────────────────┘
```

---

## Fase 1 — la medida (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **El hueco, en rojo.** Un build real con `.tone="@(42)"` contra `tone?: 'neutral' \| 'success' \| 'info'` que afirma que el build **falla**. Hoy pasa, y el test queda en rojo en su propio commit. Criterio 1 | `vite` | `test/build-typecheck.test.ts` |

## Fase 2 — la mudanza (7)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 2 | — | **El paquete.** `@fudic/typecheck`: `package.json` con versiones exactas (`typescript` 5.9.3, `@volar/language-core` y `@volar/typescript` 2.4.28 de runtime; `@volar/language-server` 2.4.28 solo dev), `tsconfig` que extiende la base, `vitest.config.ts` con `include: ['src/**/*.ts']` y umbrales al 100 en las cuatro | `typecheck` | `package.json` · `tsconfig*.json` · `vitest.config.ts` · `src/index.ts` |
| [ ] | 3 | 2 | **La receta.** `parse.ts`, `js-batch.ts` y la parte de `document-cache.ts` que hace parse → lote → emit, como `projectFud`. La caché por versión se queda en el servidor | `typecheck` · `language-server` | `src/project.ts` · `src/parse.ts` · `src/js-batch.ts` |
| [ ] | 4 | 3 | **El registry.** `createFileRegistry` sobre un puerto `resolve(from, href)`, y de `mode.ts` lo que hace falta para el tag de un fichero y los huecos de un layout. Lo que es solo del editor se queda (§4.1) | `typecheck` · `language-server` | `src/file-registry.ts` · `src/mode.ts` |
| [ ] | 5 | 3 | **Los globals y los ficheros del proyecto.** `mountGlobals` y el barrido de `project-files.ts` / `node-fs.ts` (`node_modules`, `dist`, `.git` fuera; librerías por `findLibraries`, marcadas externas) | `typecheck` · `language-server` | `src/globals.ts` · `src/files.ts` |
| [ ] | 6 | 4, 5 | **El `LanguagePlugin`.** `language-plugin.ts` y `mappings.ts` como `fudLanguagePlugin`, sin dependencia de `@volar/language-server` | `typecheck` · `language-server` | `src/language-plugin.ts` · `src/mappings.ts` |
| [ ] | 7 | 4 | **Las reglas `FUD` del editor.** `fudicDiagnostics` con `semanticDiagnostics`, `href.ts`, `holes.ts`, `reserved-dollar.ts`, sobre el puerto del índice | `typecheck` · `language-server` | `src/fudic-diagnostics.ts` |
| [ ] | 8 | 3–7 | **El servidor importa.** `language-server/src` ya no contiene ninguna función movida, y su `WorkspaceIndex` implementa los puertos. Sus tests de aceptación pasan **sin cambiar una expectativa**. Criterio 5 | `language-server` | `src/**` |

## Fase 3 — el chequeo (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 9 | 5 | **Ficheros y opciones.** Todos los `.fud` del proyecto y los de librerías; `tsconfig` más cercano con `.fud` registrado, `outDir` anulado y `noEmit`; sin él, las opciones inferidas de Volar como constante, el test que las compara con las de `@volar/language-server`, y `FUD0870`. Criterios 4, 11 | `typecheck` | `src/options.ts` · `src/checker.ts` |
| [ ] | 10 | 6, 7, 9 | **El `Program` y lo que se recoge.** `proxyCreateProgram` con `fudLanguagePlugin`; sintácticos + semánticos (+ declaración si se pide) y `fudicDiagnostics`; librerías calladas; `error` / `warning` y nada más; un fichero que no parsea se proyecta igual; `invalidate` y `oldProgram`. Criterios 9, 10, 12, 13 | `typecheck` | `src/checker.ts` |
| [ ] | 11 | 10 | **Orden, formato y fallo honesto.** Orden ruta → offset → código; `formatProblem` con `LineMap` y trozo de código; un `ts` que lanza da `FUD0871`, nunca un chequeo vacío. Criterios 16, 17 | `typecheck` | `src/format.ts` · `src/diagnostics.ts` |
| [ ] | 12 | 8, 11 | **La paridad.** El corpus de §6.3 por el servidor y por `createProjectChecker`, comparando conjuntos `error`/`warning` (fichero, span, código, severidad). Una diferencia aquí es un defecto de la mudanza y se arregla en la mudanza. Criterio 3 | `typecheck` | `test/parity.test.ts` · `test/fixtures/**` |

## Fase 4 — una voz por hecho (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 13 | 12 | **Retirar `FUD0197`–`FUD0199`.** Fuera de `contractDiagnostics` y del pase semántico; borrar los analizadores que solo existían para ellos; sus casos pasan al corpus de paridad con su `TS`. SDD-12 los anota como retirados. Criterio 14 | `compiler` · `vite` | `src/semantic/analyzers/**` · `vite/src/transform.ts` · `docs/sdd/SDD-12-semantica.md` |

## Fase 5 — el build (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 14 | 12 | **El chequeo en `buildStart`**, antes de compilar: todos los problemas impresos con `formatProblem`, un `this.error` con el resumen `N errores en M ficheros`, nada escrito. La tarea 1 pasa a verde. Criterios 2, 6, 7, 8 | `vite` | `src/typecheck.ts` · `src/plugin.ts` |
| [ ] | 15 | 14 | **El `transform` con posición.** `loc` y `frame` en cada `this.error` / `this.warn`; todos los diagnósticos de un fichero y un solo fallo; lo que ya dijo el chequeo no se repite. El comentario obsoleto «Neither aborts the build» se corrige | `vite` | `src/plugin.ts` · `src/diagnostics.ts` |
| [ ] | 16 | 15 | **Los caminos que descartan.** `?client`, `?ioc`, `link`, `edge` y `analyzePage` reportan sus diagnósticos. Un test por camino. Criterio 15 | `vite` | `src/plugin.ts` · `src/link.ts` · `src/edge.ts` · `src/analyze.ts` |

## Fase 6 — el dev server (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 17 | 14 | **El chequeo vivo.** Un `ProjectChecker` en `configureServer`; vigila `CheckReport.inputs` y los `.fud` que aparecen o se van; `invalidate` + `check`; terminal con todo, overlay con el primero (`server.ws.send({ type: 'error' })`), `full-reload` al quedar limpio. Criterio 19 | `vite` | `src/dev-typecheck.ts` · `src/plugin.ts` |
| [ ] | 18 | 17 | **La página bloqueada.** El middleware HTML mira el grafo de la ruta pedida (`resolveDocument`) contra el último reporte, espera una comprobación en curso, y con un error llama a `next(err)` con `loc` y `frame`. Criterio 18 | `vite` | `src/plugin.ts` · `src/serve.ts` |
| [ ] | 19 | 17 | **El middleware de scripts** deja el `500` con comentario y pasa el error a `next(err)`. Criterio 20 | `vite` | `src/plugin.ts` |

## Fase 7 — la evidencia y el cierre (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 20 | 16, 18 | **`examples/basic` compila bajo la regla.** `pnpm build` y `pnpm dev` limpios. Lo que salga se arregla en el ejemplo o en la proyección, nunca en el chequeo. Criterio 21 | `example-basic` | `examples/basic/**` |
| [ ] | 21 | 20 | **Pedro en Chrome.** `.tone="@(42)"` en una página: overlay en `pnpm dev`, `pnpm build` en rojo, y al quitarlo la página vuelve sola. Criterio 22 | — | — |
| [ ] | 22 | todas | **Cierre.** `pnpm typecheck`, `pnpm test`, `pnpm build`. Los 24 criterios de §6 verdes. `@fudic/typecheck` al 100 % en las cuatro, los ficheros nuevos de `vite` con umbral por fichero al 100, `language-server` sigue al 100. SDD-35 a `Hecho` en [INDEX.md](./INDEX.md). Criterios 23, 24 | — | [INDEX.md](./INDEX.md) |
