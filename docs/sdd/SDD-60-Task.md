# SDD-60 — Tareas

> **SDD:** [SDD-60 — `.fudapi`: el contrato del servidor fuera del `.fud`](./SDD-60-fudapi.md)
> **Paquetes:** `@fudic/api` (nuevo) · `@fudic/diagnostics` · `@fudic/conventions` · `@fudic/config` ·
> `@fudic/http` · `@fudic/forms` · `@fudic/compiler` · `@fudic/vite` · `@fudic/language-core` ·
> `@fudic/typecheck` · `@fudic/language-server` · `@fudic/formatter` · `@fudic/cli` · `fudic-vscode` ·
> `examples/*` · `packages/testing`
> **Rama:** `sdd-60-fudapi` (nace de `main`)
> **Progreso:** 31 / 64 — `En curso`.

**Dos sesiones.** Una implementa y coordina; la otra escribe los tests de cada fase (las tareas
«Los tests de…»), contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test. Cuando a una sesión se le acaba el contexto, se para y se arranca otra desde
la última tarea marcada.

**El orden manda en cuatro puntos.**

- **El catálogo va antes que el código que lo usa.** Ningún `'FUD1xxx'` provisional.
- **`@fudic/api` está completo y probado (fases 1–3) antes de tocar nada más.** Todo lo demás
  consume su árbol, su índice y su emisor.
- **Lo nuevo convive con lo viejo hasta la fase 11.** Las regiones `@server`/`@client`, el módulo
  `<f>.fud?server`, los stubs leídos con Oxc y las borradoras siguen funcionando mientras se
  migra; se retiran en la tarea 63, cuando ya no queda ninguna región. `FUD1110` se activa en la
  tarea 51.
- **La migración va fichero a fichero:** `usuarios` primero (tarea 62, meta 3), `user-form`
  después (meta 4), el resto del ejemplo al final (meta 5).

---

## Metas — lo que Pedro comprueba

Cada meta cierra una fase. La fase no se da por terminada hasta que Pedro la prueba.

| Meta | Al cerrar | Pedro comprueba |
|---|---|---|
| 1 | Fase 4 | En VS Code, un `.fudapi` con colores, errores en rojo que se van al corregir, completado, hover, ir a la definición y formato. |
| 2 | Fase 5 | En `examples/basic`, un `.ts` de `src/server` que importa `fudic:<id>` tiene completado, y un handler mal tipado sale en rojo; guardar el `.fudapi` actualiza los tipos. |
| 3 | Fase 8 | `usuarios` funciona en el navegador con su `.fudapi` y sus handlers (buscar, cancelar, activar, borrar, `crash`, sesión) mientras el resto del ejemplo sigue con `@server`. |
| 4 | Tarea 47 (a mitad) | El alta de `user-form` en el navegador: letra del NIF, email cogido, 409 de `admin`. |
| 5 | Fase 11 | Todo `examples/basic` sin regiones, igual que hoy en dev, build y preview; un handler mal tipado para el build. |
| 6 | Fase 12 | Entrega: el repositorio sin regiones y todo en verde. |

---

## Mapa de dependencias

```
1 paquete ─→ 2 códigos parser ─→ 3 árbol ─→ 4 líneas ─→ 5 tipos/expr ─→ 6 parseApi ─→ 7 tests
54 rango e INDEX                                                 ├─→ 8 formatApi ─→ 9 tests
                                                                 ▼
          10 códigos validador ─→ 11 índice ─→ 12 validateApi ─→ 13 tests
                                                                 ▼
  META 1   40 servicio .fudapi ─→ 41 completado ─→ 42 hover/def/tokens ─→ 59 VS Code .fudapi ─→ 60 tests
                                                                 ▼
  META 2   14 contract http ─→ 61 ruta/query/uuid ─┐
           15 contract forms ──────────────────────┴→ 16 emitDeclarations ─→ 17 emitModule
           ─→ 43 generación .d.ts ─→ 18 tests del emisor ─→ 64 tests de generación
                                                                 ▼
           19 conventions ─→ 20 config ─→ 21 built-ins forms ─→ 22 built-ins http ─→ 23 tests
                                                                 ▼
           24 link rel=server ─→ 25 nombres en la vista ─→ 26 corte ─→ 27 nivel ─→ 28 diagnósticos ─→ 29 tests
                                                                 ▼
  META 3   30 raíz y registro ─→ 31 módulos fudic: ─→ 32 despacho ─→ 33 wrapper y modo ─→ 34 stubs
           ─→ 36 typecheck y sourcemaps ─→ 62 usuarios migrada ─→ 37 tests
                                                                 ▼
           38 language-core ─→ 39 typecheck ─→ 44 .fud sin zonas ─→ 45 tests
                                                                 ▼
           46 CLI y gramática del .fud ─→ 55 tests
                                                                 ▼
  META 4/5 47 examples/basic ─→ 48 resto de ejemplos ─→ 49 fixtures ─→ 50 tests reescritos
           ─→ 63 fuera lo viejo ─→ 35 fuera borradoras ─→ 51 fuera zonas ─→ 56 tests
                                                                 ▼
  META 6   52 producto ─→ 57 entrega ─→ 53 docs ─→ 58 cierre
```

---

## Fase 1 — paquete y catálogo (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El paquete.** `@fudic/api` con `package.json` (versiones exactas, `@fudic/diagnostics` como única dependencia), `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts` con `coverage.include: ['src/**/*.ts']` y umbral 100 en las cuatro métricas, y `README.md`. Exporta `API_EXTENSION`. No depende de `@fudic/compiler` ni de Oxc | `api` | `packages/api/*` |
| [x] | 2 | 1 | **Los códigos del parser.** `FUD1060`–`FUD1079`: `.ts` con su función tipada, `.md` con la forma de SDD-50 §4.4 (citan `SDD-60`) y su línea en `index.ts` | `diagnostics` | `src/codes/FUD1060`–`1079.{ts,md}` · `src/index.ts` |
| [x] | 54 | — | **El rango.** `FUD1060`–`FUD1139` en la fila de SDD-60 del `INDEX.md` | — | `docs/sdd/INDEX.md` |

## Fase 2 — el parser y el formato (7)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 3 | 1 | **El árbol.** Los nodos de SDD §3.13, de solo lectura, con `Span` en cada uno y `doc` en cada declaración; `ParseResult<T>` propio. `FnDecl` con su ruta (segmentos literales y `:arg`) y sus argumentos marcados ruta/query/cuerpo | `api` | `src/ast.ts` |
| [x] | 4 | 2 | **Las líneas.** Sangrado (múltiplo de 2, tabulador, salto de nivel: `FUD1061`), tokens, cadenas con escapes (`FUD1060`), comentario si `#` abre token salvo en `pattern`, documentación por líneas `#` pegadas | `api` | `src/line.ts` |
| [x] | 5 | 4 | **Tipos y expresiones.** `TypeExpr` (`T[]`, `T?`, `map K V`, nombre, `uuid`; `FUD1067`), literales (`FUD1068`) y la expresión de `require`/`when` con precedencia, de más floja a más fuerte, `or` < `and` < `not` < comparación y `contains` < `valid`/`empty`/`length` (`FUD1069`). *Corregido al implementar: el orden anterior (`not` por encima de la comparación) leía `not acceso.clave contains name` de §3.6 como `(not acceso.clave) contains name`* | `api` | `src/type.ts` · `src/expr.ts` |
| [x] | 6 | 3, 5 | **`parseApi`.** Las declaraciones de SDD §3.2–§3.9 por contexto del padre (con la ruta de función y `query <arg>` de §3.3), continuación de texto, recuperación sin cascada (SDD §4.1), `FUD1062`–`FUD1066`, `FUD1070`–`FUD1079`. Exportado | `api` | `src/parse.ts` · `src/index.ts` |
| [x] | 7 | 6 | **Los tests del parser.** Criterios 1–6, con `@fudic/api` al 100 % | `api` | `test/` |
| [x] | 8 | 6 | **`formatApi`.** SDD §4.9 (fila Formato): sangrado, espacios, columnas alineadas por bloque, línea en blanco entre declaraciones, nada si hay una comilla sin cerrar | `api` | `src/format.ts` |
| [x] | 9 | 8 | **Los tests del formato.** Criterio 7 | `api` | `test/` |

## Fase 3 — índice y validador (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 10 | 2 | **Los códigos del validador.** `FUD1080`–`FUD1091`, `FUD1093`–`FUD1101`, como la tarea 2. `FUD1080` lleva candidatos | `diagnostics` | `src/codes/FUD1080`–`1101.{ts,md}` · `src/index.ts` |
| [x] | 11 | 6, 10 | **`createApiIndex`.** Nombres de proyecto por clase, origen app/paquete, `FUD1081`, candidatos por distancia (como `closest` de `@fudic/spec`), reglas aplicables a un tipo, middlewares heredados por función | `api` | `src/index-api.ts` |
| [x] | 12 | 11 | **`validateApi`.** El orden de SDD §4.2: `FUD1080`, `1082`–`1091`, `1093`–`1101`, con `ApiContext` (hermano de ruta, params, props de layout) | `api` | `src/validate.ts` |
| [x] | 13 | 12 | **Los tests del validador.** Criterios 8–10 (la parte del 9 que lee las carpetas `fudapi/` de las dependencias es del host: se prueba en las tareas 60 y 37) | `api` | `test/` |

## Fase 4 — el editor de `.fudapi` · META 1 (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 40 | 12 | **El servicio `.fudapi`.** `LanguagePlugin` aislado (`fudapi`), host del índice (app + dependencias directas), diagnósticos y formato; un cambio en un `.fudapi` o en el `package.json` revalida los `.fudapi` abiertos | `language-server` | `src/fudapi/*` · `src/server.ts` · `src/uri.ts` |
| [x] | 41 | 40 | **Completado.** Cada fila de SDD §4.9 | `language-server` | `src/fudapi/completion.ts` |
| [x] | 42 | 40 | **Hover, definición y semantic tokens.** También hacia los `.fudapi` de una librería | `language-server` | `src/fudapi/navigation.ts` · `semantic-tokens.ts` |
| [x] | 59 | 42 | **VS Code para `.fudapi`.** SDD §4.10: lenguaje, gramática `source.fudapi`, configuración, icono, `configurationDefaults`, `workspaceContains`, `documentSelector`, `FILE_EVENTS` | `vscode` | `package.json` · `syntaxes/` · `src/client-options.ts` |
| [x] | 60 | 59 | **Los tests del editor `.fudapi`.** Criterios 27 (lado `.fudapi`), 28, 29 y 31; gramática (snapshot), manifiesto, `FILE_EVENTS`, `documentSelector` | `language-server` · `vscode` | `test/` |

## Fase 5 — el emisor y los tipos generados · META 2 (8)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 14 | — | **`@fudic/http/contract`.** Entrada interna para lo generado: verbos, cadena, `middleware` y un `Contract` cuyo `.handle` registra; `.client`/`.server` de un middleware y su registro; `<Fn>Fails`. El registro marca la carpeta de origen y da los errores de duplicado y de carpeta (SDD §3.12). La entrada pública no cambia todavía: lo que lista SDD §3.10 sale de ella en la tarea 63 | `http` | `src/contract/*` · `package.json` |
| [x] | 61 | 14 | **Ruta, query y tipos en el cable.** SDD §3.2 y §3.3: la URL con los params de la página y la ruta de la función rellenos, la query una clave por argumento, `ctx.params`/`ctx.query`/`ctx.args` repartidos; la comprobación de tipo de cada valor en los dos lados (400 con `Problem`, rechazo sin enviar), `uuid` incluido | `http` | `src/contract/*` · `src/client/*` · `src/server/*` |
| [x] | 15 | — | **`@fudic/forms/contract`.** Entrada interna: `form`, `group`, factories, validadores, `require` generado, reglas propias con `.check` registrado (`runs both`/`server`, `async`), `ctx.form` con el valor validado sin `null` donde hay `required`, campo `uuid` con su comprobación implícita. `messages` sustituye a `setMessages`. La entrada pública no cambia todavía (tarea 63) | `forms` | `src/contract/*` · `package.json` |
| [x] | 16 | 12, 14, 15, 61 | **`emitDeclarations`.** El `.d.ts` de SDD §3.11 para cada clase de declaración, determinista | `api` | `src/emit/declarations.ts` |
| [x] | 17 | 16 | **`emitModule`.** Variante de servidor (cadena y despacho) y de navegador (stub `$fn` con su ruta y su query, mitades de cliente del registro, lo de servidor fallando con el mensaje de carpeta). Forms como la declaración de hoy; patrón anclado | `api` | `src/emit/module.ts` |
| [x] | 43 | 17, 40 | **Generación de `.d.ts`.** El language server escribe `.fudic/api/<id>.d.ts` al guardar (y el de quien dependa de lo que cambió) y al arrancar los que falten o estén viejos, solo si cambia. `examples/basic` incluye `.fudic/api/**/*.d.ts` en su tsconfig | `language-server` · `examples/basic` | `src/fudapi/host.ts` · `service.ts` · `tsconfig.json` |
| [x] | 18 | 17 | **Los tests del emisor.** Criterios 11–14 (el 12 con la batería contra `person.form.ts`, `user.form.ts` y `wide.form.ts` de hoy), la parte de forms del 37 y los de `contract` de `http` (ruta, query, tipos) y `forms` | `api` · `http` · `forms` | `test/` |
| [x] | 64 | 43 | **Los tests de generación.** Criterio 30 y el 27 en la parte «tocar el `.fudapi` de una regla revalida el que la usa» | `language-server` | `test/` |

## Fase 6 — configuración y built-ins (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 19 | — | **Convenciones.** `SERVER_DIR`, `BROWSER_DIR`, `API_DIR` y `HTTP_FILE = 'src/http.fudapi'` | `conventions` | `src/index.ts` |
| [x] | 20 | 19 | **`fudic.json`.** `server`, `browser` (y `api` en `kind: lib`) en `ProjectConfig`, relativos y dentro del proyecto, con el valor de las convenciones si faltan; sus diagnósticos en el rango de `@fudic/config` | `config` | `src/read.ts` |
| [x] | 21 | 15, 17 | **Built-ins de forms.** `fudapi/rules.fudapi` y `fudapi/patterns.fudapi` (SDD §3.10) y sus implementaciones en `browser/`, publicadas con el paquete | `forms` | `fudapi/` · `browser/` · `package.json` |
| [x] | 22 | 14, 17 | **Built-ins de http.** `fudapi/middlewares.fudapi` (`csrf`, `error-pages`) y sus mitades en `browser/` y `server/` | `http` | `fudapi/` · `browser/` · `server/` · `package.json` |
| [ ] | 23 | 20–22 | **Los tests de configuración y built-ins.** Criterio 22 (lectura) y 23 | `config` · `forms` · `http` | `test/` |

## Fase 7 — el `.fud` en el compilador (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 24 | 2 | **`<link rel="server">`.** Reconocido en rutas y componentes; `FUD1111`, `FUD1112`; el `href` en el grafo de enlaces. Códigos `FUD1110`–`FUD1115` creados aquí | `compiler` · `diagnostics` | `src/document/structure.ts` · `src/emit/resolve.ts` · `codes/` |
| [ ] | 25 | 24 | **Nombres en la vista.** `data`, funciones y forms de los `.fudapi` enlazados entran en la resolución de SDD-51 (`view-scope.ts`); `FUD1113`–`FUD1115`; `form:=` contra ellos (`FUD1005`/`FUD1006` reescritos) | `compiler` | `src/semantic/*` · `src/emit/controls.ts` |
| [ ] | 26 | 25 | **Un `@code`, corte de servidor.** SDD §4.8: un `@code` sin zonas va entero al cliente; el render del SSR y del SW recibe solo el corte (lo que el markup lee, transitivo, más `provide`). `effect` nunca en el corte. Un `@code` con zonas sigue como hoy hasta la tarea 63 | `compiler` | `src/emit/oxc-code.ts` · `module.ts` · `parts.ts` · `client.ts` · `route-client.ts` |
| [ ] | 27 | 26 | **El nivel de hidratación.** El predicado de `level.ts` sin `client.body`: misma salida para todo lo que hoy existe | `compiler` | `src/emit/level.ts` |
| [ ] | 28 | 26 | **Diagnósticos de zonas.** Reescritos según SDD §4.8. Los retirados (`.ts` borrado, `.md` `retired` con su sustituto) se retiran en la tarea 63. `FUD1110` existe pero no se emite hasta la tarea 51 | `compiler` · `diagnostics` | `src/semantic/analyzers/*` · `src/emit/server-fns.ts` · `codes/` |
| [ ] | 29 | 24–28 | **Los tests del compilador.** Criterios 24, 25 (con `FUD1110` activado en el test) y 33 sobre los fixtures | `compiler` | `test/` |

## Fase 8 — dev, build y runtime · META 3 (8)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 30 | 14, 20 | **La raíz y el registro.** Raíz de servidor y de navegador con `import.meta.glob` sobre las carpetas de la app y de cada librería con `fudapi/`; carga en secuencia marcando carpeta; perezosa en dev, invalidada por HMR | `vite` | `src/api-root.ts` · `src/plugin.ts` |
| [ ] | 31 | 17, 30 | **Módulos `fudic:` y `.d.ts`.** Índice de `.fudapi` (`src/**` + `fudapi/` de dependencias directas), módulo virtual por lado, `.fudic/api/<id>.d.ts` escrito al arrancar, en build y al cambiar, solo si cambia | `vite` | `src/api-modules.ts` · `src/plugin.ts` |
| [ ] | 32 | 30, 61 | **Despacho y 404.** `/_fudic/fn/<id>/<nombre><ruta>` contra el índice y el registro (SDD §4.4); 404 con `Problem` y `detail` solo en dev; `load` sin handler → 404 de página. El despacho de hoy (`r/`, `c/`) sigue sirviendo a lo no migrado | `http` · `vite` | `src/server/functions.ts` · `src/functions.ts` |
| [ ] | 33 | 31 | **Wrapper y modo de ruta.** Una ruta con `<link rel="server">` toma `load`/`paths`/`layout` del registro, y `analyze.ts`/`mode.ts` leen su `.fudapi`. Una ruta con `@server` sigue como hoy hasta la tarea 63 | `vite` · `compiler` | `src/wrapper.ts` · `analyze.ts` · `strategy.ts` · `mode.ts` · `edge.ts` |
| [ ] | 34 | 31 | **Stubs.** Las funciones de un `.fudapi` enlazado salen del módulo `fudic:<id>` de navegador | `compiler` · `vite` | `src/emit/client-fns.ts` · `server-fns.ts` · `transform.ts` |
| [ ] | 36 | 31 | **Typecheck y sourcemaps.** El checker de dev y el de build incluyen las dos carpetas y `.fudic/api`; el build carga una vez la raíz de servidor; bundle de servidor con sourcemaps activados | `vite` · `typecheck` | `src/dev-typecheck.ts` · `background-check.ts` · `edge.ts` |
| [ ] | 62 | 30–36 | **`usuarios` migrada.** `routes/usuarios.fudapi`, sus handlers en `src/server`, `<link rel="server">` y un único `@code`; el resto del ejemplo intacto | `examples/basic` | `src/routes/usuarios.*` · `src/server/` |
| [ ] | 37 | 62 | **Los tests de dev, build y runtime.** Criterios 15–20, 22, 26, 36 y 37 | `vite` · `http` | `test/` |

## Fase 9 — el editor del `.fud` (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 38 | 25 | **language-core.** `data`, funciones y forms declarados desde `fudic:<id>` en el virtual de cliente para un `.fud` con `<link rel="server">`. `emit-server.ts` y `partitionCode` se retiran en la tarea 63 | `language-core` | `src/emit*.ts` · `data.ts` · `server-fns.ts` · `code.ts` |
| [ ] | 39 | 38 | **typecheck.** `rel: 'server'` en el registro de enlaces; `.fudic/api` en el programa | `typecheck` | `src/language-plugin.ts` · `links.ts` · `project.ts` |
| [ ] | 44 | 38 | **El `.fud` en el language server.** `rel="server"` en el completado de `href`; un cambio en un `.fudapi` revalida los `.fud` que lo enlazan; la bombilla de `FUD0702` escribe `layout` en el `.fudapi` hermano. Snippets, completados y acciones de `@server`/`@client` se retiran en la tarea 63 | `language-server` | `src/services/*` |
| [ ] | 45 | 38–44 | **Los tests del editor del `.fud`.** Criterio 27 (lado `.fud`) y los de `language-core` y `typecheck` | `language-server` · `language-core` · `typecheck` | `test/` |

## Fase 10 — CLI (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 46 | 43 | **CLI.** `fudic new` (carpetas, `fudic.json`, tsconfig), `fudic fmt` y `fudic check` con `.fudapi` | `cli` · `formatter` | `cli/src/plans/*` |
| [ ] | 55 | 46 | **Los tests de CLI.** Plantillas de `fudic new`, `fmt` y `check` | `cli` | `test/` |

## Fase 11 — migración y retirada · METAS 4 y 5 (8)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 47 | 37, 45 | **`examples/basic`.** SDD §4.11, con `user-form` primero (meta 4): `.fudapi` por ruta y componente, forms, middlewares, reglas, `http.fudapi`, handlers en `src/server`, mitades en `src/browser`, `<link rel="server">`, un único `@code` | `examples/basic` | `src/**` |
| [ ] | 48 | 47 | **El resto de ejemplos.** `examples/i18n`, `examples/vista-errores` y cualquier otro con regiones | `examples/*` | `src/**` |
| [ ] | 49 | 47 | **Fixtures.** `compiler`, `formatter`, `testing`, `language-core`, `language-server`, `vscode`, `workbench` | varios | `fixtures/` · `test/**/*.fud` |
| [ ] | 50 | 49 | **Tests que escriben regiones.** Reescritos al modelo nuevo sin perder el caso que probaban | varios | `test/` |
| [ ] | 63 | 48–50 | **Fuera lo viejo.** `<f>.fud?server`, `server-module.ts`, los prefijos `r/` y `c/`, `client-fns.ts` y la lectura de cadenas con Oxc, `FUD0393`/`FUD0394`, `emit-server.ts` y `partitionCode`, los snippets y acciones de regiones, la regla de regiones de la gramática del `.fud`, los diagnósticos retirados de SDD §4.8, y de la entrada pública de `@fudic/http` y `@fudic/forms` lo que lista SDD §3.10 | varios | — |
| [ ] | 35 | 63 | **Fuera las borradoras.** `server-validators.ts`, `server-halves.ts`, `redact.ts` y su uso | `vite` · `compiler` | `src/erased-sources.ts` · … |
| [ ] | 51 | 35 | **Fuera las zonas.** `FUD1110` activo; el parser del `@code` ya no da nodos de región | `compiler` | `src/code/*` |
| [ ] | 56 | 51 | **Los tests de la migración.** Criterios 21 y 34 (búsqueda en el repo), la suite del ejemplo en verde y la gramática del `.fud` sin regiones (snapshot) | — | `test/` |

## Fase 12 — entrega · META 6 (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 52 | 56 | **Producto.** Criterio 32: HTML prerenderizado contra el build de `main`, y prueba en el navegador de `usuarios` y `user-form` | `examples/basic` | — |
| [ ] | 57 | 52 | **Entrega.** `pnpm typecheck`, `pnpm test`, `pnpm build` en verde; `@fudic/api` al 100 % sin `v8 ignore`; ningún umbral baja. Criterio 35 | todos | — |
| [ ] | 53 | 57 | **Documentación.** README de `@fudic/api`, `@fudic/http` y `@fudic/forms` (lo que deja de ser público y la forma nueva); nota en IDEA-06 apuntando a SDD-60 | — | `packages/*/README.md` · `docs/sdd/ideas/` |
| [ ] | 58 | 53 | **Cierre.** SDD-60 a `Hecho`, su fila del `INDEX.md` y entrada en el registro de progreso | — | `docs/sdd/` |

---

## Criterios → tareas

| Criterio | Tareas |
|---|---|
| 1–6 | 3–6 · 7 (tests) |
| 7 | 8 · 9 (tests) |
| 8–10 | 11, 12 · 13 (tests) |
| 11–14 | 14–17, 61 · 18 (tests) |
| 15–20, 22, 26 | 30–36 · 37 (tests) |
| 21 | 35 · 56 (tests) |
| 22 (lectura), 23 | 19–22 · 23 (tests) |
| 24, 25, 33 | 24–28 · 29 (tests) |
| 27 | 40, 43, 44 · 60, 64, 45 (tests) |
| 28, 29, 31 | 40–42, 59 · 60 (tests) |
| 30 | 43 · 64 (tests) |
| 32 | 47 · 52 |
| 34 | 51 · 56 |
| 35 | 57 |
| 36 | 61, 32 · 37 (tests) |
| 37 | 61, 15 · 18, 37 (tests) |
