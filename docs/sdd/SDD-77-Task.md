# SDD-77 — Tareas

> **SDD:** [SDD-77 — El MCP de fudic: crear con fudic desde un chat](./SDD-77-mcp-desde-el-chat.md)
> **Paquetes:** `@fudic/mcp` (nuevo) · `@fudic/typecheck` · `@fudic/spec` · `@fudic/vite` ·
> `@fudic/language-server` · `@fudic/cli` · `@fudic/workbench` · `@fudic/diagnostics`
> **Rama:** `sdd-77-mcp-desde-el-chat`, desde `main`.
> **Progreso:** 28 / 30 — `En curso`.

**Dos sesiones.** Una implementa y coordina. La otra escribe los tests de cada fase (las tareas
«Los tests de…») contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test.

**Cada fase termina con la prueba de Pedro en Claude Web** (SDD §6.1), sobre un proyecto creado a
mano fuera del repo y con el MCP instalado desde el registro local (`scripts/local-registry.mjs`),
como lo instalaría un usuario. La fase no se cierra sin esa prueba. Lo que falle es bug de la fase.
Hasta la tarea 26, `fudic new` aún no trae el MCP: en las pruebas se usa el MCP instalado en global
(SDD §8.2.7).

## Traspaso (2026-11-04, cierre) — leer primero

- **Fase 7 implementada y probada salvo la tarea 28**: `fudic_status` (SDD §8.2.50–52), lo que deja
  `fudic new` (§8.2.53), sus tests (`test/status.test.ts`, criterios 21–23), `verify:generated`
  con el MCP de cada proyecto, y el README. `@fudic/mcp` al 100 % en las cuatro métricas.
- **El workspace se trabaja proyecto a proyecto** (§8.2.50): era lo que faltaba para la prueba de
  punta a punta, que crea un workspace con su librería.
- **Falta solo la 28** (Pedro, en Claude Web, con el MCP reinstalado desde `pnpm registry`) y,
  tras ella, la 30 (cierre en `INDEX.md` e IDEA-07).

## Traspaso (2026-11-04, noche)

- **Los tests de las fases 1 a 6 están cerrados** (tareas 5, 10, 14, 18, 21, 24): `@fudic/mcp` al
  100 % en las cuatro métricas (411 tests), `language-server/src/project.ts` y
  `project-symbols.ts` también. Pedro probó las fases 2 a 6 en Claude Web: funcionan; tiene una
  lista de mejoras del chat que pasará aparte.
- **Los tests destaparon defectos, ya arreglados en `src`** (SDD §8.2.42–49): la raíz de un
  workspace no era proyecto para el MCP; un plan que lanza escapaba sin diagnóstico (`FUD1411`,
  nuevo: el criterio 26 cuenta ya doce códigos, `FUD1400`–`FUD1411`); `done` no cerraba una pieza
  completa; las rutas del servicio de proyecto (`c:/…`) no casaban con las del MCP en Windows; el
  `at` de librerías; `source` bajo `node_modules`; `fudic_write` sin `content` ni `edits`.
- **Sigue la fase 7 en otra sesión** (tareas 25–30), desde lo de abajo. Ojo con la raíz de un
  workspace: `fudic_check`, `phases` (`isLibrary`) y `fudic_contract` (`foldersOf`) leen el
  `fudic.json` de la raíz, que en un workspace no existe; `fudic_status` tiene que recorrer sus
  proyectos.
- **Para probar en Claude Web:** el registro local sigue abierto en este worktree; tras cambiar el
  MCP, `pnpm registry` de nuevo y reinstalar en global (abajo, «Cómo se prueba»).

## Traspaso (2026-11-04, tarde)

**Orden nuevo de Pedro:** no se para entre fases aunque falten sus tests. Al acabar la
implementación, las fases de test que falten se reparten: una la hace el implementador y otra la
sesión de tests; el implementador coordina. Commit siempre con rutas explícitas (nunca `-a`).

- **Implementado y comiteado en `sdd-77-mcp-desde-el-chat`** (último `c6961ed7`, sin push): fases
  1 a 6 enteras (tareas 1–4, 6–9, 11–13, 15–17, 19–20, 22–23). Las decisiones de cada una, en SDD
  §8.2.8–41. Todo probado a mano con proyectos reales (scripts de la sesión en su scratchpad, no en
  el repo): build roto por `.fudspec`/`.fudapi`, check/fix/format, ficheros, symbols/describe/contract
  (criterios 15–17 cumplidos a mano sobre `examples/workspace/apps/tienda` y una copia de la guía),
  new en seco, generate con `started`, record, test y spec_run en Chrome.
- **Sigue: fase 7.** Tarea 25 `fudic_status`: `phases.ts` (`unitsOf`, `showcaseCurrent`) ya calcula
  las fases; falta la herramienta, la regla de `next` de §4.4 y la memoria de temas leídos por
  sesión. **Antes**, en `language-server/src/project-symbols.ts`, `routePattern` usa la raíz del MCP:
  en un workspace tiene que usar la carpeta con `fudic.json` de cada fichero (3 llamadas). Cuando
  exista `fudic_status`, `project-tools.ts` ya cambia su `next` solo. Luego tareas 26 (`fudic new`
  deja `@fudic/mcp`, `.mcp.json`, `AGENTS.md`, `CLAUDE.md`), 28 (punta a punta en Claude Web), 29
  (README) y 30 (cierre). El criterio 26 dice «ocho códigos»: ya son once (`FUD1400`–`FUD1410`).
- **Pedro no ha probado en Claude Web las fases 2–6.** Para probar: `pnpm registry` (se cerró),
  reinstalar en global `@fudic/cli` y `@fudic/mcp` desde Verdaccio, `fudic-mcp --http --tunnel`.
- **Sesión de tests:** `sdd-77-mcp-desde-el-chat-1a` (antes `-41`), worktree
  `.claude/worktrees/sdd-77-tests`, rama `sdd-77-tests`. **Ha parado** por orden de Pedro. Sus fases
  1 y 2 (tareas 5 y 10) están mezcladas aquí (`2de95b30`, `a7d81763`): todo en verde, `spec`,
  `typecheck` y lo de las fases 1–2 de `mcp` al 100 %. Ver su «Relevo de la sesión de tests» más
  abajo. **Fases de test sin hacer:** 3 (tarea 14), 4 (18), 5 (21) y 6 (24): una nueva sesión de
  tests sigue con 14, 18 y 21; la 24 se reparte al acabar la implementación.

## Dónde estamos (2026-11-04, mañana)

**El orden de trabajo lo marcó Pedro:** en cada fase, primero **solo la implementación**; Pedro la
prueba en Claude Web, se afina con lo que vea, y **después** se escriben los tests (seguramente otra
sesión). No se cierra una fase sin su prueba en Claude Web.

- **Fase 1: implementada** (commit `b7ef49b5`), tareas 1–4. **Probada por Pedro en Claude Web
  (2026-11-04): todo correcto.** Pendiente: la tarea 5 (tests), encargada a la sesión de tests
  `sdd-77-mcp-desde-el-chat-41`.
- La guía la redactaron cuatro agentes desde el código, los README y los ejemplos que compilan.
  **Cada bloque se compiló** en una copia limpia de una app de `fudic new` (`vite build`, con los
  paquetes que añadirían `fudic_add`/`fudic_generate`): los buenos de cada tema juntos, sin
  diagnósticos; cada `broken=FUDnnnn` solo, con su código. Los `.test.ts` de `testing` pasan con
  vitest (17 tests). Los `.fudspec` no se ejecutaron en el navegador. Es lo que la tarea 5
  convierte en test (criterio 8); el script era de la sesión y no está en el repo.
- Quedan dos avisos ciertos en `html-css` (`FUD0742`, `FUD0852`): sus componentes no los usa
  ninguna página del ejemplo. No son errores.

**Cómo se prueba en esta máquina** (lo dejó montado la sesión del 2026-11-04):

1. En el worktree, `pnpm registry`: construye, publica `@fudic/*` en Verdaccio
   (`http://localhost:4873`) y se queda abierto. Tiene que seguir abierto mientras se prueba.
2. CLI y MCP en global desde ese registro:
   `npm install -g @fudic/cli@0.0.1 @fudic/mcp@0.0.1 --registry http://localhost:4873`.
   **Tras cada cambio** del MCP: volver a `pnpm registry` y a esta instalación (Verdaccio borra y
   republica `0.0.1` en cada arranque).
3. `cloudflared` instalado con `winget install Cloudflare.cloudflared` (en
   `C:\Program Files (x86)\cloudflared`); una terminal abierta antes de instalarlo no lo ve.
4. Pedro, en una terminal nueva y en una carpeta fuera del repo: `fudic new demo`, `cd demo`,
   `fudic-mcp --http --tunnel`, y pega la URL pública en Claude → Settings → Connectors → Add
   custom connector. Una conversación nueva por prueba. La URL del túnel cambia en cada arranque.

**Lo que salió en la fase 1 y queda por hacer** (no es de esta spec salvo lo marcado):

- La instantánea `new-compat` de la CLI cambia por `@fudic/dom` en las plantillas (SDD §8.2.3):
  la actualiza la sesión de tests.
- `packages/diagnostics/test/branches.test.ts` no tiene aún los mensajes de `FUD1400`–`FUD1407`
  (tarea 5).
- READMEs desactualizados que la guía no siguió: `packages/core/README.md` dice que `task.run()`
  resuelve con `undefined` (devuelve `{ ok, status, value | error }`); `packages/http/README.md`
  dice que toda mutación repinta la página (solo si su ruta está en `invalidates`);
  `packages/vite/README.md` enseña `@server` con `load` en el `@code` (hoy `FUD1110`).

## Relevo de la sesión de tests (2026-11-04)

Lo deja la sesión de tests, que trabajó en el worktree `.claude/worktrees/sdd-77-tests`, rama
`sdd-77-tests`. **Nunca escribas en el worktree de la coordinadora**
(`.claude/worktrees/sdd-77-mcp-desde-el-chat`): los commits se mezclan. Trabaja en el tuyo, que
salga de la rama `sdd-77-mcp-desde-el-chat`. La coordinadora lo mezcla y marca la tarea.

**Hecho:**

- **Tarea 5 (fase 1):** mezclada en `sdd-77-mcp-desde-el-chat` y marcada.
- **Tarea 10 (fase 2):** escrita, en verde y marcada en `sdd-77-tests`, **sin mezclar todavía**. La rama ya
  incluye `c266f1a3` (fases 3 a 5 de la coordinadora). Falta la prueba de Pedro en Claude Web de
  la fila «Comprobar», y el overlay de una `.fudspec` rota en `vite dev`, en el navegador.
  - spec: `test/context.test.ts` (specContextOf, installedTerms, fixturePathOf, termRootsOf, nombres).
  - typecheck: `test/fudspec-check.test.ts` (`.fudspec` en `check()`, FUD0951 con las props del
    contrato, caché por texto, fs sin `specFiles`/`readDirectory`, `languageService()`) y
    `test/api-project.test.ts` (lector de `.fudapi`, `apiContextOf`, `apiDiagnostics`,
    `writeApiDeclarations`).
  - vite: `test/api-build-errors.test.ts` (el build falla una vez con `.fudspec` y `.fudapi` rotos,
    en el mismo sitio que `check()`) y `test/dev-typecheck.test.ts` (dev recomprueba con un
    `.fudapi`/`.fudspec` nuevo y con `fudic/terms/`; overlay real de una `.fudspec` rota).
  - language-server: `test/acceptance/fudspec-projects.test.ts` (el editor y `check()` marcan una
    `.fudspec` igual: criterio 5).
  - mcp: `test/fudic.test.ts`, `test/locate.test.ts`, `test/checks.test.ts`, `test/check.test.ts`
    (con `fudic_check` por un cliente sobre una app de `fudic new`: criterio 12).
  - Tests que la fase 2 rompió a propósito, ajustados: `typecheck/test/implementations.test.ts`
    (J, J2, J3 y «link without href»: una ruta para el `.fudapi` con `load`),
    `vite/test/api-build-errors.test.ts` (el error del build es el recuento; el problema va al log),
    `language-server/test/acceptance/parity.test.ts` (compara todo salvo `.fudapi` y `.fudspec`,
    §8.2.18), y los seis `cli/test/fixes-*.test.ts` de `.fudspec`: la CLI gana `@fudic/terms` en
    `devDependencies`, como ya decía el comentario de `fixes/pairs.ts`.
- **Cobertura** al cerrar la tarea 10: spec y typecheck al 100 % en las cuatro métricas. En mcp, todo
  lo de las fases 1 y 2 está al 100 % (`args`, `bin`, `check`, `checks`, `diagnostics`, `fudic`,
  `guide`, `http`, `instructions`, `locate`, `main`, `project`, `respond`, `secret`, `tunnel`). Lo
  que queda por debajo es de las fases 3 a 5. En vite, cada línea nueva de la fase está cubierta
  (el paquete arrastra deuda heredada).

**Lo que tiene que hacer la sesión que da el relevo:**

1. Avisar a la coordinadora para que mezcle `sdd-77-tests` (la tarea 10 ya va marcada en ella).
2. Esperar a que la coordinadora diga qué tarea de tests sigue. Pendientes: **14** (fase 3: fix,
   format, files/read/write y el servicio de proyecto; criterios 9–11, 13 y 14), **18** (fase 4:
   symbols, describe, contract; criterios 15–17) y **21** (fase 5: new, generate, add, record;
   criterios 18–20). Cada una, solo cuando Pedro haya probado su fase en Claude Web.
3. En cada una, las reglas que se siguieron aquí:
   - Solo `test/**`. Si un test destapa un bug de `src`, para y avisa a la coordinadora con
     `SendMessage`; no se arregla `src` desde la sesión de tests.
   - `@fudic/mcp` al 100 % en las cuatro métricas sobre `src/**/*.ts`. Lo que toca proceso, git,
     cloudflared o disco va con deps inyectadas o con `vi.mock`; nunca se lanza nada real.
   - Para un proyecto de verdad: `newApp()` de `packages/mcp/test/helpers.ts` (lo que escribe
     `fudic new`, con el `node_modules` del MCP enlazado). Para un cliente MCP: `connect()`.
   - Antes de cerrar, pasar los tests de **todos** los paquetes que tocó la fase (cli, typecheck,
     vite, language-server, workbench, spec, diagnostics), no solo los de mcp: un cambio de la
     coordinadora puede romper tests de otros paquetes, y esos los arregla la sesión de tests.
   - Commit en la rama propia y push a origin; responder a la coordinadora con el hash y la
     cobertura.
4. Las sesiones cambian de nombre al reiniciarse: busca el de la coordinadora con `ListAgents`.

---

## Mapa de dependencias

```
1 paquete y códigos ─→ 2 servidor stdio+http ─→ 3 secreto y túnel ─→ 4 guía ─→ 5 tests ─→ [Claude Web]
                                                                         │
6 specContextOf ─→ 7 .fudspec en check() ─→ 8 build y dev ─→ 9 fudic_check ─→ 10 tests ─→ [Claude Web]
                                                                         │
11 servicio de proyecto (repairs) ─→ 12 files/read/write ─→ 13 fix y format ─→ 14 tests ─→ [Claude Web]
                                                                         │
15 symbols ─→ 16 describe ─→ 17 contract ─→ 18 tests ─→ [Claude Web]
                                                                         │
19 new/generate/add ─→ 20 record ─→ 21 tests ─→ [Claude Web]
                                                                         │
22 fudic_test ─→ 23 fudic_spec_run ─→ 24 tests ─→ [Claude Web]
                                                                         │
25 fudic_status ─→ 26 lo que deja fudic new ─→ 27 tests ─→ 28 punta a punta en Claude Web ─→ 29 docs ─→ 30 cierre
```

---

## Fase 1 — el servidor y la guía (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El paquete y los códigos.** `packages/mcp` con `bin` `fudic-mcp`, el SDK de MCP y `zod` en versión exacta, umbrales al 100 % en las cuatro métricas e `include: ['src/**/*.ts']`. `FUD1400`–`FUD1407` con `.ts`, `.md` y línea en `index.ts`; el rango en la fila de SDD-77 del `INDEX.md` | `mcp` · `diagnostics` | `packages/mcp/*` · `src/codes/FUD1400`–`1407.{ts,md}` |
| [x] | 2 | 1 | **El servidor.** Un `McpServer` con dos transportes (stdio, Streamable HTTP en `127.0.0.1`); `instructions` (SDD §3.3); prompt `new-app`; la forma común de las respuestas (§3.4: `fudicVersion`, `commit`, `structuredContent` + `text`, `isError` con diagnósticos); las herramientas de ficheros solo en HTTP | `mcp` | `src/server.ts` · `src/transports.ts` · `src/respond.ts` · `src/bin.ts` |
| [x] | 3 | 2 | **Secreto y túnel.** `.fudic/mcp/secret`, `/mcp/<secret>` y `404` para lo demás, `--new-secret`, `--port`; `--tunnel` lanza `cloudflared` y lee su URL (`FUD1406` sin él); la salida de la terminal (§3.1) | `mcp` | `src/secret.ts` · `src/tunnel.ts` · `src/bin.ts` |
| [x] | 4 | 2 | **`fudic_guide`.** Los nueve temas en `guide/*.md` (§4.3), con lo de SDD-68 a 76; un código como tema con `explain()` y `related`; `TS…`; `FUD1403` | `mcp` | `guide/*.md` · `src/tools/guide.ts` |
| [x] | 5 | 2–4 | **Los tests de la fase.** Criterios 1–4, 7 y 8 (cada bloque ` ```fud ` compila; cada `broken` da su código). **Prueba en Claude Web:** fila «Servidor y guía» | `mcp` | `test/**` |

## Fase 2 — `.fudspec` en el build y `fudic_check` (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 6 | — | **`specContextOf`.** Lo que construyen `fudspec/host.ts` y `session.ts` pasa a `@fudic/spec`; los dos lo usan sin cambiar su salida | `spec` · `language-server` · `workbench` | `src/context.ts` · `src/fudspec/host.ts` · `src/session.ts` |
| [x] | 7 | 6 | **`.fudspec` en `check()`.** Parse y `validateSpec` de cada `.fudspec` en el `CheckReport`, en su orden; `invalidate` las relee | `typecheck` | `src/checker.ts` |
| [x] | 8 | 7 | **Build y dev.** Una `.fudspec` rota rompe `pnpm build` y saca el overlay; cada problema una sola vez en el informe final | `vite` | `src/plugin.ts` · `src/api-modules.ts` |
| [x] | 9 | 7 | **`fudic_check`.** Un checker por MCP, invalidado por fichero y por fecha en stdio; `summary`, `limit`, `codes`, `at` + `quote`, `fixable` (una sola reparación: con la tarea 11, hasta entonces `false`), `next` | `mcp` | `src/project.ts` · `src/tools/check.ts` · `src/locate.ts` |
| [x] | 10 | 6–9 | **Los tests de la fase.** Criterios 5, 6 y 12. **Prueba en Claude Web:** fila «Comprobar», y Pedro comprueba en el navegador que `vite dev` enseña el overlay de una `.fudspec` rota | `spec` · `typecheck` · `vite` · `mcp` | `test/**` |

## Fase 3 — ficheros, fix y format (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 11 | — | **El servicio de proyecto.** `@fudic/language-server/project`: `openProject(root)` con `repairs`, `symbols`, `describe` e `invalidate`, sobre el mismo `WorkspaceIndex` y `repairsFor` que el editor (SDD §3.5); `fixable` en `check` pasa a usarlo | `language-server` · `mcp` | `src/project.ts` · `package.json` (`exports`) |
| [x] | 12 | 9 | **`files`, `read`, `write`.** La carpeta como frontera (`FUD1400`, enlaces simbólicos incluidos), `FUD1401`, ediciones todas o ninguna (`FUD1402`), la respuesta de `write` con los diagnósticos de lo escrito | `mcp` | `src/tools/files.ts` · `src/sandbox.ts` |
| [x] | 13 | 11, 12 | **`fix` y `format`.** Reparaciones de una sola opción hasta 5 vueltas, `applied`, `diff`, `remaining` con `options`; `format` sobre `planFmt`; los dos con `apply` y `dryRun` | `mcp` | `src/tools/fix.ts` · `src/tools/format.ts` · `src/diff.ts` |
| [x] | 14 | 11–13 | **Los tests de la fase.** Criterios 9–11, 13 y 14. **Prueba en Claude Web:** fila «Ficheros» | `language-server` · `mcp` | `test/**` |

## Fase 4 — lo que existe (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 15 | 11 | **`fudic_symbols`.** Los siete `kind`, con origen, `at` y la primera línea de la doc; funciones `connected`/`missing` con `implementationsOf`; tokens con `group` | `language-server` · `mcp` | `src/project.ts` · `src/tools/symbols.ts` |
| [x] | 16 | 11 | **`fudic_describe`.** El contrato de SDD-63 entero y el `example` generado desde él; rutas, tipos, funciones y tokens; `FUD1405` con el más parecido | `language-server` · `mcp` | `src/project.ts` · `src/tools/describe.ts` · `src/example.ts` |
| [x] | 17 | 15 | **`fudic_contract`.** Cada declaración que pide handler, su firma del `.d.ts`, su fichero y un esqueleto que compila | `mcp` | `src/tools/contract.ts` |
| [x] | 18 | 15–17 | **Los tests de la fase.** Criterios 15–17. **Prueba en Claude Web:** fila «Lo que existe» | `mcp` | `test/**` |

## Fase 5 — crear y anotar (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 19 | 9 | **`new`, `generate`, `add`.** Los `plan*` de la CLI con su esquema JSON por `kind`, `apply` con sus comandos, `dryRun`; `purpose` obligatorio en `component` y `page`, y su línea `started`; el checker se invalida con lo aplicado | `mcp` | `src/tools/plans.ts` · `src/schemas.ts` |
| [x] | 20 | 19 | **`fudic_record`.** `approved` y `accepted` con los planes de la CLI; `reopened`; `done` con `documented` y `connected` delante, y `FUD1407` si falta una fase | `mcp` | `src/tools/record.ts` · `src/phases.ts` |
| [x] | 21 | 19, 20 | **Los tests de la fase.** Criterios 18–20 (cada `kind` contra el plan de la CLI). **Prueba en Claude Web:** fila «Crear» | `mcp` | `test/**` |

## Fase 6 — ejecutar (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 22 | 9 | **`fudic_test`.** `runTests` en proceso, `fail` frente a `broken` con sus diagnósticos, `failing`, `snapshot` + `recordTestRun`, `next` según la fase; una ejecución a la vez | `mcp` | `src/tools/test.ts` · `src/queue.ts` |
| [x] | 23 | 22 | **`fudic_spec_run`.** `runSpecs` en proceso, el paso en rojo con `expected`/`got`, `source` + `quote`, `shot`, `failing`, `recordSpecRun` | `mcp` | `src/tools/spec-run.ts` |
| [x] | 24 | 22, 23 | **Los tests de la fase.** Criterios 24 y 25. **Prueba en Claude Web:** fila «Ejecutar» | `mcp` | `test/**` |

## Fase 7 — `status`, `fudic new` y la prueba de punta a punta (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 25 | 20, 23 | **`fudic_status`.** Proyecto, unidades y sus siete fases (SDD §4.4) desde `unitState`, el pase y los ficheros; la regla de `next` en su orden; «Call fudic_guide…» la primera vez en la sesión | `mcp` | `src/status.ts` · `src/phases.ts` · `src/session.ts` · `src/checks.ts` · `src/runs.ts` |
| [x] | 26 | 1 | **Lo que deja `fudic new`.** `@fudic/mcp` en `devDependencies`, `.mcp.json`, `AGENTS.md` y `CLAUDE.md` (SDD §3.7), en app sola y en workspace; `verify:generated` arranca el MCP del proyecto y llama a `fudic_status` | `cli` · raíz | `templates/*` · `src/plans/new.ts` · `src/plans/workspace.ts` · `scripts/verify-generated.mjs` |
| [x] | 27 | 25, 26 | **Los tests de la fase.** Criterios 21–23. `pnpm verify:generated` en verde | `mcp` · `cli` | `test/**` |
| [ ] | 28 | 27 | **De punta a punta en Claude Web.** Fila «De punta a punta» de SDD §6.1: la librería de IDEA-07 §10 en una conversación nueva, sin ningún fichero escrito a mano. Lo que falle se arregla aquí y se repite la prueba entera | — | — |
| [x] | 29 | 28 | **Docs y entrega.** README de `@fudic/mcp` en inglés y sin citar SDD: arrancarlo, conectarlo a Claude Code y a Claude Web, el túnel y lo que significa el secreto. `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; lo nuevo al 100 % (criterio 26) | `mcp` | `packages/mcp/README.md` |
| [ ] | 30 | 29 | **Cierre.** SDD-77 y este fichero en `Hecho`; fila y registro de progreso del `INDEX.md`; IDEA-07 §11.2 apunta a SDD-77 | — | `docs/sdd/*` |
