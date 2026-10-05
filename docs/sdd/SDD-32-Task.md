# SDD-32 — Tareas

> **SDD:** [SDD-32 — El banco de trabajo](./SDD-32-banco-de-trabajo.md)
> **Paquetes:** `@fudic/workbench` (nuevo) · `fudic-vscode` · `@fudic/dom` · `@fudic/vite` ·
> `@fudic/diagnostics` · `examples/basic`
> **Rama:** `worktree-SDD-32-1-abrir-en-el-navegador` (nace de `main` en `0ebd073`)
> **Progreso:** 26 / 31 — `En curso`.

Sustituye a la lista de tareas de la versión anterior de SDD-32, de la que no se hizo ninguna.

**El orden manda en cuatro puntos.**

- **El bug B va primero y ya está arreglado** (tarea 1). Sin él, `vite dev` da 500 en toda
  página que pinta una URL, y el banco es `vite dev`.
- **Lo puro antes que lo que abre Chrome.** `resolveTarget`, `planBench` y el protocolo se
  prueban sin disco, sin Vite y sin navegador (fase 2). El motor y la sesión vienen después.
- **El `ctx` antes que la sesión.** La espera del gesto (tarea 13) es el arreglo del bug A, y su
  criterio (el 11) se pone en rojo antes de escribirla.
- **El catálogo antes que el código que lo usa.** Ningún `'FUD097n'` escrito a mano.

---

## Mapa de dependencias

```
1 bug B (hecho) ──→ 2 tests de regresión
3 rango e INDEX ──→ 4 códigos
4 ──→ 5 paquete ──→ 6 resolveTarget ──┐
                    7 páginas ────────┼──→ 10 tests puros
                    8 anfitrión ──────┤
                    9 protocolo ──────┘
5 ──→ 11 navegador ──→ 12 ctx ──→ 13 espera del gesto ──→ 14 runCriterion ──→ 15 tests del motor
14 ──→ 16 Vite ──→ 17 sesión ──→ 18 servidor y shell ──→ 19 al guardar ──→ 20 openWorkbench y bin ──→ 21 tests de sesión
20 ──→ 22 manifiesto ──→ 23 lanzar ──→ 24 pestaña ──→ 25 ciclo de vida ──→ 26 tests de la extensión
21, 26 ──→ 27 ejemplo ──→ 28 README ──→ 29 cobertura ──→ 30 prueba de Pedro ──→ 31 cierre
```

---

## Fase 1 — bug B (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El arreglo.** `dev()` lee `import.meta.env.DEV` entero, sin alias ni cast; el tipo en `src/env.d.ts`; guarda `typeof import.meta.env !== 'object'` para Node sin Vite (§9.1). Verificado a mano: `/`, `/blog` y `/about` de `examples/basic` dan 200 en `vite dev`; el `dist` importado con Node no lanza; los tests de `@fudic/dom` pasan | `dom` | `src/url.ts` · `src/env.d.ts` |
| [x] | 2 | 1 | **Tests de regresión.** En `@fudic/dom`, `url.ts` ejecutado por Node sin Vite (proceso hijo, tipos quitados por Node): no lanza y no avisa; `vi.stubEnv` ya lo cubría `url.test.ts`. En `@fudic/vite`, el dev server sirve con 200 una ruta que pinta un `href` desde un valor, con `@fudic/dom` cargado en el module runner. Con el `url.ts` de `main`, el de Vite sale en rojo. Pedro lo probó en el navegador. `@fudic/dom` sigue al 100 % y `@fudic/vite` en su suelo (97,7 / 93,4 / 97,94 / 97,7) | `dom` · `vite` | `test/url-node.test.ts` · `test/dev.test.ts` |

## Fase 2 — catálogo (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 3 | — | **El rango.** `FUD0970`–`FUD0989` en la fila de SDD-32 del `INDEX.md` | — | `docs/sdd/INDEX.md` |
| [x] | 4 | 3 | **Los códigos.** `FUD0970`–`FUD0975` (§4.11): `.ts` con su función tipada, `.md` en inglés con la forma de SDD-50 §4.4 citando `SDD-32`, y su línea en `index.ts`. `@fudic/diagnostics` sigue al 100 % | `diagnostics` | `src/codes/FUD0970`–`0975.{ts,md}` · `src/index.ts` |

## Fase 3 — el paquete y lo puro (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 5 | 4 | **El paquete.** `packages/workbench`: `package.json` con las dependencias de §2.1 (versiones exactas, `vite` y `@fudic/vite` como peer), `bin: { "fudic-workbench": "dist/bin.js" }`, `tsconfig` y `tsconfig.build`, Vitest con `thresholds` al 100 en las cuatro métricas y `coverage.include: ['src/**/*.ts']` desde este commit | `workbench` | `package.json` · `tsconfig*.json` · `vitest.config.ts` · `src/index.ts` |
| [x] | 6 | 5 | **`resolveTarget`.** §4.2, paso 1: `.fud` ↔ `.fudspec` ↔ `.fixture.ts`, componente con tag (`FUD0970`), raíz del proyecto por `fudic.json` y si no `package.json` (`FUD0971`). Sobre un `TargetFs` inyectado | `workbench` | `src/target.ts` |
| [x] | 7 | 5 | **Las páginas.** `planBench` (§4.3): una página por criterio con la forma exacta, `PlannedStep` con los argumentos como se escribieron, `props` fuera de los pasos, criterio sin `props` sin `@code`, `FUD0972` sin `.fudspec` (una tarjeta, componente desnudo) | `workbench` | `src/pages.ts` |
| [x] | 8 | 7 | **El anfitrión `Signal`.** §4.3.1: solo cuando un valor de la fixture es un signal (función con `set`), valor inicial literal por `JSON.stringify` con comprobación de ida y vuelta (`FUD0974`), las demás props reenviadas | `workbench` | `src/host.ts` |
| [x] | 9 | 5 | **El protocolo.** Los tipos de §4.9, `WireDiagnostic` con línea y columna calculadas al serializar, y el frame de texto de RFC 6455 (servidor → cliente, longitudes de 7, 16 y 64 bits) | `workbench` | `src/protocol.ts` · `src/ws.ts` |
| [x] | 10 | 6–9 | **Tests puros.** Criterios 1–7, con el `app-card.fudspec` y su fixture del ejemplo y una página esperada por fichero | `workbench` | `test/target.test.ts` · `test/pages.test.ts` · `test/host.test.ts` · `test/protocol.test.ts` |

## Fase 4 — el motor (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 11 | 5 | **El navegador.** `src/browser.ts`, el único que importa `playwright-core`: `chromium.launch({ channel: 'chrome', headless: true })` adaptado a `BrowserLike`/`PageLike`; sin Chrome, `FUD0975` | `workbench` | `src/browser.ts` |
| [x] | 12 | 11 | **El `ctx`.** §3.4 y §4.6.2: referencias por tag y por rol (con `exact: true`), modo estricto con el número de elementos en el error, `textContent` del árbol aplanado (shadow roots, slots asignados o contenido por defecto, sin `style`/`script`/`template`), `goto` que no navega, 5 s por llamada | `workbench` | `src/context.ts` · `src/flat-text.ts` |
| [x] | 13 | 12 | **(rojo primero) La espera del gesto.** §4.6.3: el script de observación por `addInitScript` (un `Set` de ids de `fud:hydrated`), el host más cercano con `data-fud-id` cruzando shadow roots, `customElements.get` antes de actuar, espera del id y un fotograma. Antes de escribirla, el criterio 11 en rojo con el componente de pestañas | `workbench` | `src/settle.ts` · `src/context.ts` |
| [x] | 14 | 13 | **`runCriterion`.** §4.6.1: página nueva, `routeWebSocket` a todo lo que no sea `/__bench`, pasos en orden, conversión por `meta.params`, `layer` en cada paso, veredicto (`error` corta, `fail` no corta los `then`, `pageerror` es `error`), cierre de la página | `workbench` | `src/engine.ts` |
| [x] | 15 | 14 | **Tests del motor.** Criterios 8–15, con un proyecto de prueba en `test/fixtures/` (componente de pestañas, uno con `Signal<number>` y botón, uno con slot) servido por un Vite de prueba | `workbench` | `test/context.test.ts` · `test/engine.test.ts` · `test/fixtures/**` |

## Fase 5 — la sesión, el servidor y el guardado (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 16 | 14 | **Vite dentro.** §4.5: `createServer` con `configFile: false`, `appType: 'custom'`, `middlewareMode`, `hmr: { server, overlay: false }` y `fudic({ routesDir })` hacia `node_modules/.fudic-bench/<tag>/routes`; la carpeta vaciada al arrancar | `workbench` | `src/vite.ts` · `src/bench-dir.ts` |
| [x] | 17 | 16 | **La sesión.** §4.4: `parseSpec` + `validateSpec` con el catálogo (`fudic/terms/` y la capa del framework si existe), fixture por `ssrLoadModule` invalidando antes (`FUD0973`), términos por `ssrLoadModule`, `planBench` y escritura de páginas | `workbench` | `src/session.ts` |
| [x] | 18 | 17 | **El servidor y el shell.** §4.8: `/__bench/`, `upgrade /__bench/ws` (el resto de `upgrade`, para Vite), Vite detrás, 404. El shell: tira de diagnósticos, una tarjeta por criterio con sus `describe`, veredicto, evidencia e iframe que se recarga al recibir su `result`. Al conectar, el último `session` y los últimos `result` | `workbench` | `src/bench-server.ts` · `src/shell.ts` |
| [x] | 19 | 18 | **Al guardar.** §4.7: clasificación por fichero, el primer `full-reload` tras el cambio de un `.fud` (interceptando `vite.environments.client.hot.send`) con 10 s de reserva, recarga de sesión para `.fudspec` y fixture, invalidación para términos; una ejecución a la vez y como mucho una pendiente | `workbench` | `src/rerun.ts` |
| [x] | 20 | 19 | **`openWorkbench` y el binario.** §3.1 y §3.2: el arranque de §4.2 en orden, la línea JSON, `{error}` con código 1, `stdin` cerrado o `SIGINT` → `close()` (Chrome, Vite, servidor y carpeta salvo `--keep`), idempotente | `workbench` | `src/index.ts` · `src/bin.ts` |
| [x] | 21 | 20 | **Tests de sesión.** Criterios 16–22, el 18 en rojo primero (pestañas con el bug → guardar el arreglo → `pass`) | `workbench` | `test/session.test.ts` · `test/rerun.test.ts` · `test/server.test.ts` · `test/bin.test.ts` |

## Fase 6 — la extensión (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 22 | 20 | **El manifiesto.** `fudic.openWorkbench` en `commands`, el atajo `ctrl+k v` / `cmd+k v` con `when: editorLangId == fudic \|\| editorLangId == fudspec`, `editor/title` con `$(open-preview)` para los dos lenguajes, y el ajuste `fudic.workbench.node`. `COMMAND_IDS` gana la entrada | `vscode` | `package.json` · `src/commands/index.ts` |
| [x] | 23 | 22 | **Lanzar.** Un puerto nuevo, `WorkbenchPort.open(file)`, y su adaptador: resolver `node_modules/@fudic/workbench/dist/bin.js` desde la carpeta del workspace, `spawn` con el `node` del ajuste, leer la primera línea, avisos de §4.11. `EditorPort` acepta también un `.fudspec` activo | `vscode` | `src/ports.ts` · `src/workbench.ts` · `src/commands/workbench.ts` · `src/commands/messages.ts` |
| [x] | 24 | 23 | **La pestaña.** Un `WorkbenchPanelPort` y su adaptador: webview en `ViewColumn.Beside` titulado `Workbench · <tag>`, la URL de la línea JSON tal cual (solo local), CSP con ese origen en `frame-src`, barra como la de la prueba: botón «Abrir en el navegador» → `openExternal` y la URL a la vista | `vscode` | `src/ports.ts` · `src/workbench-panel.ts` · `src/extension.ts` |
| [x] | 25 | 24 | **El ciclo de vida.** `Map<componente, sesión>`: revelar en vez de relanzar, cerrar la pestaña cierra el `stdin`, el proceso que muere lo dice en la pestaña con su último `stderr`, `deactivate` cierra todos | `vscode` | `src/workbench.ts` · `src/extension.ts` |
| [x] | 26 | 25 | **Tests de la extensión.** Criterios 23–27, con dobles de los puertos. `fudic-vscode` sigue al 100 % | `vscode` | `test/workbench.test.ts` · `test/manifest.test.ts` |

## Fase 7 — ejemplo y cierre (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 27 | 21, 26 | **El ejemplo.** `examples/basic` gana el componente de pestañas con su `.fudspec` (criterios 11 y 18) y `@fudic/workbench` como devDependency; `app-card.fudspec` queda con al menos un criterio en verde (criterio 30). Qué se cambia en `app-card` o en su `.fudspec` para eso (§4.2 de la prueba: el host `inline`, el link que navega) se decide con Pedro | `examples/basic` | `src/components/app-tabs.{fud,fudspec}` · `src/components/app-card.*` · `package.json` |
| [ ] | 28 | 27 | **README.** Guía corta en inglés del paquete: qué abre, el binario, el `ctx` de los términos y la espera del gesto. Sin citas a SDD | `workbench` | `README.md` |
| [ ] | 29 | 28 | **Cobertura.** `@fudic/workbench` al 100 % en las cuatro métricas, sin `v8 ignore`; `fudic-vscode`, `@fudic/diagnostics` y `@fudic/dom` sin bajar. `pnpm typecheck` y `pnpm build` en verde | todos | — |
| [ ] | 30 | 29 | **Prueba de Pedro.** La de §6 con el `.vsix` instalado: Ctrl+K V, rojo y verde al guardar, «Abrir en el navegador», y ningún Chrome ni `node` vivo al cerrar VS Code | — | — |
| [ ] | 31 | 30 | **Cierre.** Estado `Hecho` en SDD-32 y en el `INDEX.md`, entrada en el registro de progreso, la nota de la prueba apuntando a §9 | — | `docs/sdd/*` · `docs/banco-de-trabajo/prueba-arquitectura.md` |
