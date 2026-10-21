# SDD-60 — Tareas

> **SDD:** [SDD-60 — `.fudapi`: el contrato del servidor fuera del `.fud`](./SDD-60-fudapi.md)
> **Paquetes:** `@fudic/api` (nuevo) · `@fudic/diagnostics` · `@fudic/conventions` · `@fudic/config` ·
> `@fudic/http` · `@fudic/forms` · `@fudic/compiler` · `@fudic/vite` · `@fudic/language-core` ·
> `@fudic/typecheck` · `@fudic/language-server` · `@fudic/formatter` · `@fudic/cli` · `fudic-vscode` ·
> `examples/*` · `packages/testing`
> **Rama:** `sdd-60-fudapi` (nace de `main`)
> **Progreso:** 0 / 58 — `Listo`.

**Dos sesiones.** Una implementa y coordina; la otra escribe los tests de cada fase (las tareas
«Los tests de…»), contra los criterios de SDD §6. Si un test destapa un defecto, se corrige el
código, no el test. Cuando a una sesión se le acaba el contexto, se para y se arranca otra desde
la última tarea marcada.

**El orden manda en tres puntos.**

- **El catálogo va antes que el código que lo usa.** Ningún `'FUD1xxx'` provisional.
- **`@fudic/api` está completo y probado (fases 1–5) antes de tocar el compilador.** Todo lo demás
  consume su árbol, su índice y su emisor.
- **La migración (fase 11) va al final, fichero a fichero, con `examples/basic` primero.** Hasta
  entonces las regiones siguen funcionando: `FUD1110` se activa en la tarea 47, cuando ya no
  queda ninguna.

---

## Mapa de dependencias

```
1 paquete ─→ 2 códigos parser ─→ 3 árbol ─→ 4 líneas ─→ 5 tipos/expr ─→ 6 parseApi ─→ 7 tests
54 rango e INDEX                                                    │
                                                                    ├─→ 8 formatApi ─→ 9 tests
                                                                    ▼
          10 códigos validador ─→ 11 índice ─→ 12 validateApi ─→ 13 tests
                                                    │
                                                    ▼
          14 contract de http ─→ 16 emitDeclarations ─→ 17 emitModule ─→ 18 tests del emisor
          15 contract de forms ─┘
                                                    │
  19 conventions ─→ 20 config ─→ 21 built-ins forms ─→ 22 built-ins http ─→ 23 tests
                                                    │
                                                    ▼
  24 link rel=server ─→ 25 nombres en la vista ─→ 26 corte de servidor ─→ 27 nivel ─→ 28 diagnósticos .fud ─→ 29 tests
                                                    │
                                                    ▼
  30 raíz y registro ─→ 31 módulos fudic: y .d.ts ─→ 32 despacho y 404 ─→ 33 wrapper y modo ─→ 34 stubs
  ─→ 35 fuera borradoras ─→ 36 typecheck y sourcemaps ─→ 37 tests
                                                    │
                                                    ▼
  38 language-core ─→ 39 typecheck ─→ 40 servicio .fudapi ─→ 41 completado ─→ 42 hover/def/tokens
  ─→ 43 generación e invalidación ─→ 44 .fud sin zonas ─→ 45 tests
                                                    │
                                                    ▼
  46 VS Code y CLI ─→ 55 tests
                                                    │
                                                    ▼
  47 examples/basic ─→ 48 resto de ejemplos ─→ 49 fixtures ─→ 50 tests reescritos ─→ 51 fuera zonas ─→ 56 tests
                                                    │
                                                    ▼
                         52 producto ─→ 57 entrega ─→ 53 docs ─→ 58 cierre
```

---

## Fase 1 — paquete y catálogo (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **El paquete.** `@fudic/api` con `package.json` (versiones exactas, `@fudic/diagnostics` como única dependencia), `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts` con `coverage.include: ['src/**/*.ts']` y umbral 100 en las cuatro métricas, y `README.md`. Exporta `API_EXTENSION`. No depende de `@fudic/compiler` ni de Oxc | `api` | `packages/api/*` |
| [ ] | 2 | 1 | **Los códigos del parser.** `FUD1060`–`FUD1079`: `.ts` con su función tipada, `.md` con la forma de SDD-50 §4.4 (citan `SDD-60`) y su línea en `index.ts` | `diagnostics` | `src/codes/FUD1060`–`1079.{ts,md}` · `src/index.ts` |
| [ ] | 54 | — | **El rango.** `FUD1060`–`FUD1139` en la fila de SDD-60 del `INDEX.md` | — | `docs/sdd/INDEX.md` |

## Fase 2 — el parser y el formato (7)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 3 | 1 | **El árbol.** Los nodos de SDD §3.13, de solo lectura, con `Span` en cada uno y `doc` en cada declaración; `ParseResult<T>` propio | `api` | `src/ast.ts` |
| [ ] | 4 | 2 | **Las líneas.** Sangrado (múltiplo de 2, tabulador, salto de nivel: `FUD1061`), tokens, cadenas con escapes (`FUD1060`), comentario si `#` abre token salvo en `pattern`, documentación por líneas `#` pegadas | `api` | `src/line.ts` |
| [ ] | 5 | 4 | **Tipos y expresiones.** `TypeExpr` (`T[]`, `T?`, `map K V`, nombre; `FUD1067`), literales (`FUD1068`) y la expresión de `require`/`when` con precedencia `not` > comparación > `contains` > `and` > `or` (`FUD1069`) | `api` | `src/type.ts` · `src/expr.ts` |
| [ ] | 6 | 3, 5 | **`parseApi`.** Las declaraciones de SDD §3.2–§3.9 por contexto del padre, continuación de texto, recuperación sin cascada (SDD §4.1), `FUD1062`–`FUD1066`, `FUD1070`–`FUD1079`. Exportado | `api` | `src/parse.ts` · `src/index.ts` |
| [ ] | 7 | 6 | **Los tests del parser.** Criterios 1–6, con `@fudic/api` al 100 % | `api` | `test/` |
| [ ] | 8 | 6 | **`formatApi`.** SDD §4.9 (fila Formato): sangrado, espacios, columnas alineadas por bloque, línea en blanco entre declaraciones, nada si hay una comilla sin cerrar | `api` | `src/format.ts` |
| [ ] | 9 | 8 | **Los tests del formato.** Criterio 7 | `api` | `test/` |

## Fase 3 — índice y validador (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 10 | 2 | **Los códigos del validador.** `FUD1080`–`FUD1091`, `FUD1093`–`FUD1098`, como la tarea 2. `FUD1080` lleva candidatos | `diagnostics` | `src/codes/FUD1080`–`1098.{ts,md}` · `src/index.ts` |
| [ ] | 11 | 6, 10 | **`createApiIndex`.** Nombres de proyecto por clase, origen app/paquete, `FUD1081`, candidatos por distancia (como `closest` de `@fudic/spec`), reglas aplicables a un tipo, middlewares heredados por función | `api` | `src/index-api.ts` |
| [ ] | 12 | 11 | **`validateApi`.** El orden de SDD §4.2: `FUD1080`, `1082`–`1091`, `1093`–`1098`, con `ApiContext` (hermano de ruta, params, props de layout) | `api` | `src/validate.ts` |
| [ ] | 13 | 12 | **Los tests del validador.** Criterios 8–10 | `api` | `test/` |

## Fase 4 — el emisor TS (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 14 | — | **`@fudic/http/contract`.** Entrada interna para lo generado: verbos, cadena, `middleware` y un `Contract` cuyo `.handle` registra; `.client`/`.server` de un middleware y su registro; `<Fn>Fails`. El registro marca la carpeta de origen y da los errores de duplicado y de carpeta (SDD §3.12). Fuera de la entrada pública lo que lista SDD §3.10 | `http` | `src/contract/*` · `src/index.ts` · `package.json` |
| [ ] | 15 | — | **`@fudic/forms/contract`.** Entrada interna: `form`, `group`, factories, validadores, `require` generado, reglas propias con `.check` registrado (`runs both`/`server`, `async`), `ctx.form` con el valor validado sin `null` donde hay `required`. Fuera de la pública lo que lista SDD §3.10; `messages` sustituye a `setMessages` | `forms` | `src/contract/*` · `src/index.ts` · `package.json` |
| [ ] | 16 | 12, 14, 15 | **`emitDeclarations`.** El `.d.ts` de SDD §3.11 para cada clase de declaración, determinista | `api` | `src/emit/declarations.ts` |
| [ ] | 17 | 16 | **`emitModule`.** Variante de servidor (cadena y despacho) y de navegador (stub `$fn`, mitades de cliente del registro, lo de servidor fallando con el mensaje de carpeta). Forms como la declaración de hoy; patrón anclado | `api` | `src/emit/module.ts` |
| [ ] | 18 | 17 | **Los tests del emisor.** Criterios 11–14 (el 12 con la batería contra `person.form.ts`, `user.form.ts` y `wide.form.ts` de hoy) y los de `contract` de `http` y `forms` | `api` · `http` · `forms` | `test/` |

## Fase 5 — configuración y built-ins (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 19 | — | **Convenciones.** `SERVER_DIR`, `BROWSER_DIR`, `API_DIR` y `HTTP_FILE = 'src/http.fudapi'` | `conventions` | `src/index.ts` |
| [ ] | 20 | 19 | **`fudic.json`.** `server`, `browser` (y `api` en `kind: lib`) en `ProjectConfig`, relativos y dentro del proyecto, con el valor de las convenciones si faltan; sus diagnósticos en el rango de `@fudic/config` | `config` | `src/read.ts` |
| [ ] | 21 | 15, 17 | **Built-ins de forms.** `fudapi/rules.fudapi` y `fudapi/patterns.fudapi` (SDD §3.10) y sus implementaciones en `browser/`, publicadas con el paquete | `forms` | `fudapi/` · `browser/` · `package.json` |
| [ ] | 22 | 14, 17 | **Built-ins de http.** `fudapi/middlewares.fudapi` (`csrf`, `error-pages`) y sus mitades en `browser/` y `server/` | `http` | `fudapi/` · `browser/` · `server/` · `package.json` |
| [ ] | 23 | 20–22 | **Los tests de configuración y built-ins.** Criterio 22 (lectura) y 23 | `config` · `forms` · `http` | `test/` |

## Fase 6 — el `.fud` en el compilador (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 24 | 2 | **`<link rel="server">`.** Reconocido en rutas y componentes; `FUD1111`, `FUD1112`; el `href` en el grafo de enlaces. Códigos `FUD1110`–`FUD1115` creados aquí | `compiler` · `diagnostics` | `src/document/structure.ts` · `src/emit/resolve.ts` · `codes/` |
| [ ] | 25 | 24 | **Nombres en la vista.** `data`, funciones y forms de los `.fudapi` enlazados entran en la resolución de SDD-51 (`view-scope.ts`); `FUD1113`–`FUD1115`; `form:=` contra ellos (`FUD1005`/`FUD1006` reescritos) | `compiler` | `src/semantic/*` · `src/emit/controls.ts` |
| [ ] | 26 | 25 | **Un `@code`, corte de servidor.** SDD §4.8: el `@code` sin zonas va entero al cliente; el render del SSR y del SW recibe solo el corte (lo que el markup lee, transitivo, más `provide`). `effect` nunca en el corte | `compiler` | `src/emit/oxc-code.ts` · `module.ts` · `parts.ts` · `client.ts` · `route-client.ts` |
| [ ] | 27 | 26 | **El nivel de hidratación.** El predicado de `level.ts` sin `client.body`: misma salida para todo lo que hoy existe | `compiler` | `src/emit/level.ts` |
| [ ] | 28 | 26 | **Diagnósticos de zonas.** Reescritos y retirados según SDD §4.8 (`.ts` borrado, `.md` `retired` con su sustituto). `FUD1110` existe pero no se emite hasta la tarea 51 | `compiler` · `diagnostics` | `src/semantic/analyzers/*` · `src/emit/server-fns.ts` · `codes/` |
| [ ] | 29 | 24–28 | **Los tests del compilador.** Criterios 24, 25 (con `FUD1110` activado en el test) y 33 sobre los fixtures | `compiler` | `test/` |

## Fase 7 — dev, build y runtime (8)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 30 | 14, 20 | **La raíz y el registro.** Raíz de servidor y de navegador con `import.meta.glob` sobre las carpetas de la app y de cada librería con `fudapi/`; carga en secuencia marcando carpeta; perezosa en dev, invalidada por HMR | `vite` | `src/api-root.ts` · `src/plugin.ts` |
| [ ] | 31 | 17, 30 | **Módulos `fudic:` y `.d.ts`.** Índice de `.fudapi` (`src/**` + `fudapi/` de dependencias directas), módulo virtual por lado, `.fudic/api/<id>.d.ts` escrito al arrancar, en build y al cambiar, solo si cambia | `vite` | `src/api-modules.ts` · `src/plugin.ts` |
| [ ] | 32 | 30 | **Despacho y 404.** `/_fudic/fn/<id>/<nombre>` contra el registro; 404 con `Problem` y `detail` solo en dev; `load` sin handler → 404 de página | `http` · `vite` | `src/server/functions.ts` · `src/functions.ts` |
| [ ] | 33 | 31 | **Wrapper y modo de ruta.** El wrapper toma `load`/`paths`/`layout` del registro; `analyze.ts` y `mode.ts` leen el `.fudapi` enlazado; fuera `<f>.fud?server`, `server-module.ts`, `FUD0393`/`FUD0394` | `vite` · `compiler` | `src/wrapper.ts` · `analyze.ts` · `strategy.ts` · `mode.ts` · `edge.ts` |
| [ ] | 34 | 31 | **Stubs.** El cliente toma sus funciones del módulo `fudic:<id>` de navegador; fuera `client-fns.ts` y la lectura de cadenas con Oxc | `compiler` · `vite` | `src/emit/client-fns.ts` · `server-fns.ts` · `transform.ts` |
| [ ] | 35 | 34 | **Fuera las borradoras.** `server-validators.ts`, `server-halves.ts`, `redact.ts` y su uso | `vite` · `compiler` | `src/erased-sources.ts` · … |
| [ ] | 36 | 31 | **Typecheck y sourcemaps.** El checker de dev y el de build incluyen las dos carpetas y `.fudic/api`; el build carga una vez la raíz de servidor; bundle de servidor con sourcemaps activados | `vite` · `typecheck` | `src/dev-typecheck.ts` · `background-check.ts` · `edge.ts` |
| [ ] | 37 | 30–36 | **Los tests de dev, build y runtime.** Criterios 15–22 y 26 | `vite` · `http` | `test/` |

## Fase 8 — editor (8)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 38 | 25 | **language-core.** Fuera `emit-server.ts` y `partitionCode`; `data`, funciones y forms declarados desde `fudic:<id>` en el virtual de cliente | `language-core` | `src/emit*.ts` · `data.ts` · `server-fns.ts` · `code.ts` |
| [ ] | 39 | 38 | **typecheck.** Sin script extra de servidor; `rel: 'server'` en el registro de enlaces; `.fudic/api` en el programa | `typecheck` | `src/language-plugin.ts` · `links.ts` · `project.ts` |
| [ ] | 40 | 12 | **El servicio `.fudapi`.** `LanguagePlugin` aislado (`fudapi`), host del índice (app + dependencias directas), diagnósticos y formato | `language-server` | `src/fudapi/*` · `src/server.ts` · `src/uri.ts` |
| [ ] | 41 | 40 | **Completado.** Cada fila de SDD §4.9 | `language-server` | `src/fudapi/completion.ts` |
| [ ] | 42 | 40 | **Hover, definición y semantic tokens.** También hacia los `.fudapi` de una librería | `language-server` | `src/fudapi/navigation.ts` · `semantic-tokens.ts` |
| [ ] | 43 | 40 | **Generación e invalidación.** `.d.ts` al guardar y al arrancar; un cambio en un `.fudapi` o en el `package.json` revalida los abiertos y los `.fud` que enlazan | `language-server` | `src/fudapi/host.ts` · `service.ts` |
| [ ] | 44 | 38 | **El `.fud` sin zonas.** `rel="server"` en el completado de `href`; fuera snippets, completados y acciones de `@server`/`@client`; la bombilla de `FUD0702` escribe `layout` en el `.fudapi` hermano | `language-server` | `src/services/*` |
| [ ] | 45 | 38–44 | **Los tests del editor.** Criterios 27–31 y los de `language-core` y `typecheck` | `language-server` · `language-core` · `typecheck` | `test/` |

## Fase 9 — VS Code y CLI (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 46 | 43 | **Wiring y CLI.** SDD §4.10: lenguaje, gramática `source.fudapi`, configuración, icono, `configurationDefaults`, `workspaceContains`, `documentSelector`, `FILE_EVENTS`; regla de regiones fuera de la gramática del `.fud`. `fudic new` (carpetas, `fudic.json`, tsconfig), `fudic fmt` y `fudic check` con `.fudapi` | `vscode` · `cli` · `formatter` | `package.json` · `syntaxes/` · `src/client-options.ts` · `cli/src/plans/*` |
| [ ] | 55 | 46 | **Los tests de VS Code y CLI.** Gramática (snapshot), manifiesto, `FILE_EVENTS`, `documentSelector`, plantillas de `fudic new`, `fmt` y `check` | `vscode` · `cli` | `test/` |

## Fase 10 — migración (6)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 47 | 37, 45 | **`examples/basic`.** SDD §4.11: `.fudapi` por ruta y componente, forms, middlewares, reglas, `http.fudapi`, handlers en `src/server`, mitades en `src/browser`, `<link rel="server">`, un único `@code` | `examples/basic` | `src/**` |
| [ ] | 48 | 47 | **El resto de ejemplos.** `examples/i18n`, `examples/vista-errores` y cualquier otro con regiones | `examples/*` | `src/**` |
| [ ] | 49 | 47 | **Fixtures.** `compiler`, `formatter`, `testing`, `language-core`, `language-server`, `vscode`, `workbench` | varios | `fixtures/` · `test/**/*.fud` |
| [ ] | 50 | 49 | **Tests que escriben regiones.** Reescritos al modelo nuevo sin perder el caso que probaban | varios | `test/` |
| [ ] | 51 | 48–50 | **Fuera las zonas.** `FUD1110` activo; el parser del `@code` ya no da nodos de región | `compiler` | `src/code/*` |
| [ ] | 56 | 51 | **Los tests de la migración.** Criterio 34 (búsqueda en el repo) y la suite del ejemplo en verde | — | `test/` |

## Fase 11 — entrega (4)

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
| 11–14 | 14–17 · 18 (tests) |
| 15–22, 26 | 30–36 · 37 (tests) |
| 22 (lectura), 23 | 19–22 · 23 (tests) |
| 24, 25, 33 | 24–28 · 29 (tests) |
| 27–31 | 38–44 · 45 (tests) |
| 32 | 47 · 52 |
| 34 | 51 · 56 |
| 35 | 57 |
