# SDD-82 — Tareas

> **SDD:** [SDD-82 — Specs de página y de flujo](./SDD-82-specs-de-pagina-y-de-flujo.md)
> **Paquetes:** `@fudic/spec` · `@fudic/terms` · `@fudic/workbench` · `@fudic/vite` · `@fudic/http` · `@fudic/api` ·
> `@fudic/testing` · `@fudic/language-server` · `@fudic/vscode` · `@fudic/cli` · `@fudic/mcp` ·
> `@fudic/diagnostics` · `examples/basic`
> **Rama:** `sdd-82-specs-de-pagina-y-de-flujo`, desde `main` con SDD-81 ya mezclada.
> **Progreso:** 29 / 36 — `En curso`. Fases 1–8 hechas; sigue la fase 9 (ejemplo, guía y cierre).

## Relevo (2026-11-11, al cerrar las fases 4 y 5)

**Dónde estamos.** Fases 1–5 commiteadas en la rama (sin push). La tarea 16 quedó cerrada con el
camino (b) de Pedro: los criterios con `offline` corren contra el build del banco servido con
`vite preview` (SDD §8.2.24–25); el criterio 22 pasa entero. El vocabulario de §3.7 está en
`@fudic/terms`, con sus tests contra Chrome (criterio 24) y extremo a extremo sobre el banco
(`test/browser/app-vocabulary.test.ts`, criterios 25–28). Decisiones de la fase en SDD §8.2.24–34.

**Para quien siga.**

- Las decisiones tomadas al implementar están en SDD §8.2.13–34 (forma final de `BenchHooks`,
  `codes` en el módulo de servidor, `benchRoot` en `@fudic/ssr`, `fails(0)` como `Response.error()`,
  id de criterio, `as` abre la URL del criterio, `meta.negative`, etc.).
- El `dist` de `@fudic/terms` es lo que el banco carga: tras tocar `src/` o los términos, `pnpm
  --filter @fudic/terms build` antes de las pruebas del workbench, o el `ctx` llega viejo.
- Para el ejemplo (fase 9): `abre-sin-red` y `de-verdad-con-cookie` ya están ajustados en §4.9
  (SDD §8.2.32).
- Una página de la app solo carga el runtime y el SW si su `<head>` lleva
  `<script type="module" src="fudic:runtime">`.
- **Entorno Windows:** lanzar las pruebas desde la ruta con `C:` mayúscula
  (`cd /c/Users/...`). Con el cwd en `c:\…` minúscula, los `vi.mock` de Vitest no casan y fallan
  ~40 pruebas del workbench que no tienen nada roto.
- Bajo carga, `workbench.test.ts > the shell paints one card…` puede agotar su espera; pasa sola.
- **Grabar (fase 6, SDD §8.2.35–40):** `runSpecs(paths, { record: true })` devuelve `recording`
  (grabados, no grabados, diagnósticos); es lo que `fudic_spec_run { record: true }` de la fase 7
  tiene que llamar. Lo que escribe vive en `@fudic/spec` (`literalOf`, `recordFixture`,
  `recordLines`, `emptyFixture`) y en `workbench/src/record.ts`.
- **Fase 7 (SDD §8.2.42–46):** la bombilla «crear la fixture» de una página (fase 8) escribe lo mismo
  que `fudic g spec /<ruta>`: `pageFixtureModule` de `@fudic/spec` con los campos de `loadFields`
  (`@fudic/typecheck/api`). Los e2e del MCP (`spec-run-e2e`, `render-e2e`, `preview-e2e`) abren
  navegador y Vite: no lanzarlos a la vez que otra cobertura pesada, o agotan sus esperas.
- **Fase 8 (SDD §8.2.47–50):** lo que alcanza una página sale de `routeCallables` de `@fudic/api`
  (el mismo `Calls` del `.d.ts`); el `check` y el editor ya lo pasan a `specContextOf`, así que
  `FUD1506`/`FUD1507`/`FUD1513` salen de verdad: los `sent`/`called` del ejemplo (fase 9) tienen
  que nombrar funciones y argumentos que existen. La gramática ya pinta `page`, `flow`, las líneas
  de fixture, `as`, `>` y `~`. El banco sigue sin hacer esa comprobación (SDD §8.2.47): la hacen el
  editor y el `check`.
- **Pendiente de comprobar (visto al cerrar la fase 8):** en una pasada completa de `pnpm --filter
  @fudic/mcp test`, `preview-e2e.test.ts > a handler that throws while it runs…` falló una vez: `GET
  /productos/roto` dio 404 en vez de 500. No se reprodujo (el fichero solo y otra pasada completa,
  en verde). Un 404 ahí es «ninguna ruta casó» (el `notFound` del middleware de dev), así que puede
  ser una carrera real del servidor de desarrollo mientras vuelve a leer las rutas, no solo carga.
  Hay que buscar la causa antes del cierre (tarea 36): no vale volver a lanzarlo hasta que salga
  verde.

**Una sesión.** La misma que implementa escribe los tests de cada fase (las tareas «Los tests
de…») contra los criterios de SDD §6, y la fase cierra con `typecheck`, `test` y `coverage` en
verde. Si un test destapa un defecto, se corrige el código, no el test. Cada fase cerrada va a
`origin`.

**El orden manda en tres puntos.**

- **La página quieta antes que el vocabulario.** Un `then` en negativo escrito antes de §4.5 pasa en
  falso, y sus tests mentirían.
- **Los hooks antes que el banco de páginas.** Sin `BenchHooks` en el plugin no hay forma de falsear
  `load` ni llamadas.
- **El ejemplo al final.** Necesita `/entrar`, `/usuarios/nuevo` y `MemoryUsers`, y los criterios de
  §4.9 son la prueba de todo lo anterior.

---

## Fase 1 — diagnósticos

- [x] **1. Diagnósticos.**
  - `FUD1500`–`FUD1515`, cada uno con su función, su `.md` y su línea en `index.ts`.
  - Textos nuevos de `FUD0922`, `FUD0930`, `FUD0933`, `FUD0950`, `FUD0952` y `FUD0953` (SDD §3.11).
  - *Depende de:* —.
  - *Paquete:* `diagnostics`.
  - *Ficheros:* `src/codes/FUD15*.{ts,md}`, `src/codes/FUD09{22,30,33,50,52,53}.{ts,md}`,
    `src/index.ts`.

## Fase 2 — la `.fudspec`

- [x] **2. Cabeceras y orden de bloques.**
  - `page` y `flow` en `levelOf`; `HeaderDecl` en lugar de `ComponentDecl`.
  - El orden de §3.2 en lugar del índice creciente.
  - El formateador con las cabeceras nuevas.
  - *Depende de:* 1.
  - *Paquete:* `spec`.
  - *Ficheros:* `src/line.ts`, `src/parse.ts`, `src/ast.ts`, `src/format.ts`.
- [x] **3. Referencias con `>` y `~`.**
  - `RoleArg.steps` con su modo de nombre y `FUD1509`.
  - `locatorOf` encadena los pasos y aplica `exact: false` con `~`.
  - *Depende de:* 2.
  - *Paquetes:* `spec`, `terms`.
  - *Ficheros:* `spec/src/line.ts`, `spec/src/ast.ts`, `terms/src/locate.ts`.
- [x] **4. La fixture leída sin ejecutar.**
  - `readFixtures` da `data`, `paths` (valores), `calls`, `services` y la forma de componente.
  - `FUD1510`.
  - `fixturePathOf` para páginas y flujos.
  - *Depende de:* 2.
  - *Paquete:* `spec`.
  - *Ficheros:* `src/fixtures.ts`, `src/context.ts`.
- [x] **5. El validador.**
  - `SpecContext` con `page(route)` y `functions(scope)`.
  - Las líneas de fixture de §3.6 y `as`.
  - `FUD1500`–`FUD1507`, `FUD1511`–`FUD1513`.
  - `FUD0950`/`FUD0952`/`FUD0953` generalizados.
  - *Depende de:* 3, 4.
  - *Paquete:* `spec`.
  - *Ficheros:* `src/validate.ts`, `src/context.ts`.
- [x] **6. Los ayudantes y los tipos de fixture.**
  - `later`, `later.never`, `later.fails`, `fails`, `redirects` y `file`, como datos.
  - `FixtureOf`, `Answer`, `Failed`, `Redirected` y `FlowFixtures`.
  - *Depende de:* —.
  - *Paquete:* `spec`.
  - *Ficheros:* `src/helpers.ts`, `src/fixture-types.ts`, `src/index.ts`.
- [x] **7. `Fixtures` en el `.d.ts` de una ruta.**
  - `data` si hay `load`, `paths` si hay `paths`.
  - `calls` con cada función de la ruta y de sus componentes, y las reglas `remote`.
  - Los `fails` por código (SDD §3.4).
  - *Depende de:* 6.
  - *Paquetes:* `api`, `vite`.
  - *Ficheros:* `api/src/emit/declarations.ts`, `vite/src/api-modules.ts`.
- [x] **8. Los tests de la fase.** Criterios 1–9.
  - *Depende de:* 2–7.
  - *Paquetes:* `spec`, `terms`, `api`, `typecheck`, `cli`.
  - *Ficheros:* `test/**`.

## Fase 3 — el plugin y el servidor del banco

- [x] **9. `BenchHooks` en el plugin.**
  - Se leen de `globalThis[Symbol.for('fudic.bench')]`.
  - Render y endpoint de datos con `ctx.data` (los `later` a promesas; `Failed` y `Redirected`).
  - Llamadas y reglas `remote` con `answer`, en el formato de la función y sin handler.
  - `services` en el contenedor raíz; `now` para `Date`.
  - Sin prerender para una petición con criterio (SDD §3.8, §4.2).
  - *Depende de:* 6.
  - *Paquetes:* `vite`, `http`.
  - *Ficheros:* `vite/src/bench-hooks.ts`, `vite/src/plugin.ts`, `vite/src/serve.ts`,
    `vite/src/wrapper.ts`, `http/src/contract/server.ts`.
- [x] **10. El registro de llamadas.**
  - Por criterio: nombre, argumentos decodificados, falsa o de verdad, estado (SDD §4.4).
  - *Depende de:* 9.
  - *Paquete:* `vite`.
  - *Fichero:* `src/bench-hooks.ts`.
- [x] **11. Los tests de la fase.**
  - Criterios 10–17 y 23 en el modelo, con los hooks y un servidor en memoria.
  - *Depende de:* 9, 10.
  - *Paquetes:* `vite`, `http`.
  - *Ficheros:* `test/**`.

## Fase 4 — el banco

- [x] **12. La página quieta.**
  - Un script de inicio que cuenta peticiones, temporizadores cortos y frames, en el documento y en
    el SW.
  - La espera tras cada `when` y antes de cada `then`, con `FUD1508`.
  - Positivos que reintentan, negativos una vez (SDD §4.5).
  - *Depende de:* 1.
  - *Paquetes:* `workbench`, `terms`.
  - *Ficheros:* `workbench/src/settle.ts`, `workbench/src/engine.ts`, `terms/src/types.ts`.
- [x] **13. Destinos de página y de flujo.**
  - `resolveTarget` para `page` y `flow`.
  - El segundo Vite, el de la app, con la configuración del usuario, su `routesDir` y el SW en modo
    preview.
  - Los hooks instalados en `globalThis` (SDD §3.8).
  - *Depende de:* 9.
  - *Paquete:* `workbench`.
  - *Ficheros:* `src/target.ts`, `src/project.ts`, `src/vite.ts`.
- [x] **14. Montar un criterio.**
  - Contexto nuevo con la cookie `fudic-bench`.
  - Las líneas de fixture del criterio en los hooks.
  - `services` instanciados al empezar y soltados al acabar.
  - `as` con contextos con nombre.
  - El registro de llamadas en el informe (SDD §4.2–§4.4).
  - *Depende de:* 10, 13.
  - *Paquete:* `workbench`.
  - *Ficheros:* `src/session.ts`, `src/engine.ts`, `src/pages.ts`, `src/browser.ts`,
    `src/report-of.ts`, `src/report.ts`.
- [x] **15. El contrato para otros backends.** `GET /__bench/criterion/<id>` (SDD §3.8).
  - *Depende de:* 14.
  - *Paquete:* `workbench`.
  - *Fichero:* `src/bench-server.ts`.
- [x] **16. Los tests de la fase.** Criterios 19–22, 29–31 y 34, con Playwright.
  - El 22 contra el build del banco (SDD §8.2.24–25): una página visitada se abre sin red desde el
    SW, al principio o tras cortar; una nunca vista falla como el navegador.
  - *Depende de:* 12–15.
  - *Paquetes:* `workbench`.
  - *Ficheros:* `test/**`.

## Fase 5 — el vocabulario

- [x] **17. `given`.**
  - `cookie`, `locale`, `media`, `viewport`, `clock`, `offline`.
  - El reloj llega también al servidor por `now`.
  - *Depende de:* 12, 14.
  - *Paquete:* `terms`.
  - *Ficheros:* `terms/given/*.js`, `src/stock.ts`.
- [x] **18. `when`.**
  - `go`, `back`, `forward`, `reload`, `check`, `uncheck`, `select`, `hover`, `upload`, `wait`,
    `offline`, `online`.
  - *Depende de:* 12.
  - *Paquete:* `terms`.
  - *Ficheros:* `terms/when/*.js`.
- [x] **19. `then`.**
  - `title`, `url`, `status`, `count`, `value`, `checked`, `unchecked`, `enabled`, `disabled`,
    `called`, `sent`, `lists`, `not-reloaded`, `requests`, `header`, `downloaded`.
  - El `ctx` gana lo que necesitan: el registro de llamadas, la última respuesta de documento, las
    peticiones del último `when`, las descargas y `paths()`.
  - *Depende de:* 12, 14.
  - *Paquetes:* `terms`, `workbench`.
  - *Ficheros:* `terms/then/*.js`, `terms/src/types.ts`, `terms/src/stock.ts`,
    `workbench/src/extension.ts`.
- [x] **20. Los tests de la fase.** Criterios 24–28: cada término con un caso que pasa y otro que falla.
  - Contra Chrome en `terms`, y los 25–28 también extremo a extremo sobre el banco en `workbench`.
  - *Depende de:* 17–19.
  - *Paquete:* `terms`.
  - *Ficheros:* `test/**`.

## Fase 6 — grabar

- [x] **21. `record`.**
  - `fudic-workbench record` ejecuta sin `data` ni `answers`.
  - Escribe `data` y `calls` con el nombre del criterio; los ficheros, con sus bytes.
  - Reescribe las líneas de la `.fudspec`.
  - `FUD1515` (SDD §3.9).
  - *Depende de:* 14.
  - *Paquetes:* `workbench`, `spec`.
  - *Ficheros:* `workbench/src/record.ts`, `workbench/src/run-cli.ts`, `spec/src/scaffold/fixture.ts`.
- [x] **22. Los tests de la fase.** Criterios 32–33.
  - *Depende de:* 21.
  - *Paquete:* `workbench`.
  - *Ficheros:* `test/**`.

## Fase 7 — CLI, testing y MCP

- [x] **23. La CLI.**
  - `fudic g spec /<ruta>`, con la fixture hecha desde `LoadData` y `paths`.
  - `fudic g flow <nombre>`.
  - `run` con las tres clases.
  - La ayuda y el README.
  - *Depende de:* 5, 7.
  - *Paquetes:* `cli`, `spec`.
  - *Ficheros:* `cli/src/plans/spec.ts`, `cli/src/plans/flow.ts`, `cli/src/help/commands.ts`,
    `spec/src/scaffold/spec.ts`, `spec/src/scaffold/fixture.ts`.
- [x] **24. `@fudic/testing`.** `visit(url, { fixture, answers })` aplica la fixture de la ruta como el banco.
  - *Depende de:* 9.
  - *Paquete:* `testing`.
  - *Ficheros:* `src/visit.ts`, `src/page.ts`, `src/server.ts`.
- [x] **25. El MCP.**
  - `fudic_spec_run` con página, flujo, `record` y el registro de llamadas.
  - `fudic_render` y `fudic_preview` con `fixture`.
  - *Depende de:* 14, 21.
  - *Paquete:* `mcp`.
  - *Ficheros:* `src/runs.ts`, `src/render.ts`, `src/preview.ts`, `src/server.ts`.
- [x] **26. Los tests de la fase.** Criterios 35, 37 y 38.
  - *Depende de:* 23–25.
  - *Paquetes:* `cli`, `testing`, `mcp`.
  - *Ficheros:* `test/**`.

## Fase 8 — el editor

- [x] **27. El servicio de la `.fudspec`.**
  - Completado de cabeceras, líneas de fixture, `path`, `url`/`go`, `called`/`sent` y `as`.
  - Hover e ir a la definición a la fixture, al `.fudapi` y a la ruta.
  - Las bombillas de SDD §3.10.
  - El host con rutas y funciones.
  - *Depende de:* 5.
  - *Paquete:* `language-server`.
  - *Ficheros:* `src/fudspec/completion.ts`, `src/fudspec/navigation.ts`, `src/fudspec/actions.ts`,
    `src/fudspec/host.ts`, `src/fudspec/snippets.ts`, `src/fudspec/semantic-tokens.ts`.
- [x] **28. La gramática TextMate.** `page`, `flow`, las líneas de fixture, `as`, `>` y `~`.
  - *Depende de:* —.
  - *Paquete:* `vscode`.
  - *Fichero:* `syntaxes/fudspec.tmLanguage.json`.
- [x] **29. Los tests de la fase.** Criterio 36, por el plugin del language server.
  - *Depende de:* 27, 28.
  - *Paquetes:* `language-server`, `vscode`.
  - *Ficheros:* `test/**`.

## Fase 9 — ejemplo, guía y cierre

- [ ] **30. El ejemplo.**
  - `/entrar` con su formulario que lleva a `/`; `/usuarios/nuevo`; `MemoryUsers`.
  - Las fixtures y specs de §4.9: `routes/usuarios`, `routes/blog/[slug]`, `routes/espera` y
    `src/flows/alta-de-usuario`.
  - *Depende de:* 19, 21.
  - *Paquete:* `examples/basic`.
  - *Ficheros:* `src/routes/entrar.{fud,fudapi}`, `src/routes/usuarios/nuevo.{fud,fudapi}`,
    `src/services/memory-users.ts`, `src/routes/**/*.{fudspec,fixture.ts}`, `src/flows/**`.
- [ ] **31. Los tests del ejemplo.** Criterio 39: `fudic-workbench run` sobre el ejemplo, en verde.
  - *Depende de:* 30.
  - *Paquete:* `examples/basic`.
- [ ] **32. La guía del MCP y los README.**
  - `fudspec.md` y su copia en español: «Pages» y «Flows».
  - `spec`, `terms` y `workbench/README.md` (criterio 40).
  - *Depende de:* 30.
  - *Paquetes:* `mcp`, `spec`, `terms`, `workbench`.
  - *Ficheros:* `guide/**`, `README.md`.
- [ ] **33. El `.vsix` de la rama.**
  - *Depende de:* 29.
  - *Paquete:* `vscode`.
- [ ] **34. `docs/PENDIENTE.md` e INDEX.** El estado, el registro de progreso y la nota 5 cerrada.
  - *Depende de:* 31, 32.
  - *Paquete:* docs.
- [ ] **35. La prueba de Pedro.** SDD §6.1, con el `.vsix` de la rama.
  - *Depende de:* 33, 34.
- [ ] **36. Cierre.**
  - `pnpm typecheck`, `pnpm test`, `pnpm build` en verde (criterio 41).
  - Cobertura al 100 % de §5.
  - El 404 intermitente de `preview-e2e` del MCP, explicado y corregido (ver «Pendiente de
    comprobar» en el relevo).
  - Estado `Hecho` y merge `--no-ff` a `main`.
  - *Depende de:* 35.
