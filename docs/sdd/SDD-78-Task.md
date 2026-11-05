# SDD-78 — Tareas

> **SDD:** [SDD-78 — El MCP de fudic: ver la pieza](./SDD-78-ver-la-pieza.md)
> **Paquetes:** `@fudic/mcp` · `@fudic/testing` · `@fudic/workbench` · `@fudic/history` ·
> `@fudic/vite` · `@fudic/diagnostics`
> **Rama:** `sdd-78-ver-la-pieza`, desde `main` con SDD-77 ya mezclada.
> **Progreso:** 14 / 19 — `Listo`.

**Antes de empezar:** SDD-77 tiene que estar entera en `main`, `fudic_status` incluido (sus tareas
25–30). La 78 le añade una fase y reglas de `next`.

**El orden de trabajo es el de SDD-77:** en cada fase, primero la implementación; Pedro la prueba
en Claude Web (SDD §6.1) sobre un proyecto creado a mano fuera del repo, con el MCP instalado desde
el registro local (`pnpm registry` y `npm install -g @fudic/cli@0.0.1 @fudic/mcp@0.0.1 --registry
http://localhost:4873`), y después los tests de la fase. Una fase no se cierra sin su prueba. Lo que
falle es bug de la fase. Si un test destapa un defecto, se corrige el código, no el test. Commit
siempre con rutas explícitas.

**Fudic del proyecto** (SDD-77 §8.2.7): el dev server, `@fudic/testing` y el banco se cargan desde
el `node_modules` del proyecto; sin ellos, `FUD1207` diciendo qué instalar.

## Fase 1 — la base (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Los códigos.** `FUD1420`–`FUD1428` (SDD §3.5), cada uno con su `.ts`, su `.md` de unas cinco líneas y su línea en `index.ts`; el rango en el `INDEX.md` | `diagnostics` | `src/codes/FUD142*.ts` · `src/codes/FUD142*.md` · `src/index.ts` |
| [x] | 2 | — | **MCP Apps.** `@modelcontextprotocol/ext-apps` `1.7.5` exacta, solo en `@fudic/mcp`, sin React. El recurso `ui://fudic/view.html` (`text/html;profile=mcp-app`): un solo HTML construido con el paquete, con el `App` de `app-with-deps` en línea y sin peticiones de red; pinta el `preview` de `render` en un `<iframe srcdoc>` y los casos de `look` lado a lado. Registro con `registerAppResource`/`registerAppTool` (SDD §3.2) | `mcp` | `package.json` · `src/view/*` · `src/apps.ts` · `tsconfig.build.json` |
| [x] | 3 | 2 | **Las instrucciones.** La línea de aprobaciones nombra `approved` y `look`; la línea de «ver» (SDD §3.3); cada una solo si sus herramientas están registradas | `mcp` | `src/instructions.ts` |
| [x] | 4 | 1–3 | **Los tests de la fase.** Criterio 1 (salvo el recuento de herramientas, que se cierra en la tarea 18) | `mcp` | `test/**` |

## Fase 2 — `fudic_render` (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 5 | 2 | **Render en happy-dom.** Dentro del vitest del proyecto, como `runTests` (SDD §8.1.3): `visit(url)` para una ruta y `mount` con el caso de la fixture más `props` para un componente; `outline`, `html` (DSD sin mapas ni scripts) y `select`; `calls` con las funciones llamadas y `FUD1423` para una sin handler; `FUD1420`, `FUD1421`, `FUD1422`. La vista previa en `_meta`, con las hojas globales en línea y sin scripts | `testing` · `mcp` | `src/render-run.ts` (`@fudic/testing/run`) · `src/render.ts` |
| [x] | 6 | 5 | **Render en el navegador.** `engine: "browser"`: el montaje del banco y `outlineOf`; `FUD1428` para una prop que no es JSON; los códigos de SDD-64 si no hay navegador. Entra en la cola de ejecuciones de `fudic_test`/`fudic_spec_run` | `workbench` · `mcp` | `src/render.ts` (workbench, exportado) · `src/render.ts` |
| [x] | 7 | 5, 6 | **Los tests de la fase.** Criterios 2–6. **Prueba en Claude Web:** fila «Render» | `testing` · `workbench` · `mcp` | `test/**` |

## Fase 3 — el dev server: `fudic_preview` y `fudic_call` (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 8 | — | **El dev server del MCP.** `createServer` de Vite con el `vite.config` del proyecto, en proceso, arrancado la primera vez que se pide y vivo lo que vive el MCP. Por stdio escucha en `127.0.0.1:4318` (o el siguiente libre); por HTTP, en modo middleware. Guarda las excepciones del SSR y de los handlers para devolverlas una vez (`FUD1425`, con posición); `FUD1424` si no arranca | `mcp` | `src/dev-server.ts` |
| [x] | 9 | 8 | **La puerta por cookie.** En el servidor HTTP: `/mcp/<secret>` sigue siendo el MCP; `/_fudic/preview/<secret>?to=…` pone la cookie `fudic-preview` (`HttpOnly`, `SameSite=Lax`, `Secure` por https, valor derivado del secreto) y redirige; todo lo demás va a Vite solo con la cookie, si no `404` sin cuerpo; el upgrade del HMR pasa por la misma puerta; `--new-secret` invalida las cookies | `mcp` | `src/http.ts` · `src/gate.ts` |
| [x] | 10 | 8, 9 | **`fudic_preview`.** `state` (`starting` espera hasta 30 s, `ready`, `failed`), `local` y `public` (solo con el túnel arriba), `routes` (estáticas y las de `paths()`), `route` como `to` (`FUD1422` si no casa), los errores guardados y el `next` de SDD §4.3 | `mcp` | `src/tools/preview.ts` |
| [x] | 11 | 8 | **`fudic_call`.** La petición de `$fn` a `/_fudic/fn/<id>/<nombre>…` contra el dev server, sin cookie; `args` y `params`; `status` y `value` o `problem` sin `isError`; `FUD1405` con la más parecida, `FUD1423` sin llamar; `next` con un `Problem` que la función no declara | `mcp` | `src/tools/call.ts` |
| [ ] | 12 | 8–11 | **Los tests de la fase.** Criterios 7–10, con el HMR conectando por la puerta. **Prueba en Claude Web:** filas «Call» y «Preview» (la URL pública en el móvil) | `mcp` | `test/**` |

## Fase 4 — `look` (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 13 | 1 | **El hash del aspecto y la fase 8.** `lookHash` = `InputGraph.filesOf(unit)` sin `.test.ts` ni `.fudspec`, más las hojas globales del proyecto y de cada librería que adopta (SDD §3.4), dado a `@fudic/history` con `HistoryIo.lookHash`. La fase `look` solo en componentes; la regla de `next` de SDD §4.5 (`none` y `expired`); `done` exige la fase 8 (`FUD1407` la nombra) | `mcp` | `src/look-hash.ts` · `src/phases.ts` · `src/tools/status.ts` |
| [x] | 14 | 2, 13 | **`fudic_look`.** Cada caso de la fixture en el navegador del banco, captura del host, `.fudic/looks/<tag>/<lookHash>/<caso>.png` y limpieza de las carpetas huérfanas; comparación por píxeles con la carpeta del último `look` (`new`, `same`, `changed`, `gone`; todo `new` si no está en el disco); bloques `image` (como mucho 8); `cases`; `FUD1420` por caso, `FUD1421`, `FUD1426`; la cola de ejecuciones | `workbench` · `mcp` | `src/look.ts` (workbench, exportado) · `src/tools/look.ts` |
| [x] | 15 | 13, 14 | **`fudic_record { event: "look" }` y la guía.** `look by <usuario> hash <lookHash>` solo si hay capturas del hash de ahora (`FUD1427` si no). La guía `workflow` cuenta la fase `look`, «mirar no es aprobar» y cuándo se pide; sus ejemplos siguen compilando | `mcp` | `src/record.ts` · `guide/workflow.md` |
| [ ] | 16 | 13–15 | **Los tests de la fase.** Criterios 11–14. **Prueba en Claude Web:** fila «Look» | `mcp` | `test/**` |

## Fase 5 — de punta a punta y entrega (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 17 | 16 | **De punta a punta en Claude Web.** Fila «De punta a punta» de SDD §6.1: el guion de SDD-77 entero, cada componente con su `look` aprobado y la URL de la preview del escaparate al final. Lo que falle se arregla aquí y se repite la prueba entera | — | — |
| [ ] | 18 | 17 | **Docs y entrega.** README de `@fudic/mcp` (en inglés, sin citar SDD): ver una pieza, la preview por el túnel y su cookie, el aspecto. Criterios 1 (18 y 21 herramientas) y 15. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; `@fudic/mcp` al 100 % en las cuatro métricas y lo nuevo de los demás paquetes también | `mcp` | `packages/mcp/README.md` |
| [ ] | 19 | 18 | **Cierre.** SDD-78 y este fichero en `Hecho`; fila y registro de progreso del `INDEX.md`; IDEA-07 §11.2 apunta a SDD-78 | — | `docs/sdd/*` |
