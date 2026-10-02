# SDD-52 — Tareas

> **SDD:** [SDD-52 — El lenguaje `.fudspec`](./SDD-52-fudspec.md)
> **Paquetes:** `@fudic/spec` · `@fudic/diagnostics` · `@fudic/language-server` · `fudic-vscode`
> **Rama:** `sdd-52-fudspec` (nace de `worktree-sdd-32-abrir-en-el-navegador`)
> **Progreso:** 15 / 28 — `En curso`.

**El parser se escribió sin tests, por decisión de Pedro.** Las tareas 1–6 se hicieron solo con
`typecheck` y `build`; sus tests (tarea 7) los escribió otra sesión y dejan `@fudic/spec` al 100 %
en las cuatro métricas.

**El validador, igual.** Las tareas 8–14 se hicieron con `typecheck`, `build` y una prueba de humo
desechable; sus tests (tarea 28) los escribe otra sesión. Hasta entonces `pnpm coverage` de
`@fudic/spec` no llega a su umbral del 100 %, que no se baja.

**El orden manda en dos puntos.**

- **Las preguntas de SDD §8 (tarea 8) van antes que el validador.** La primera decide si
  existe el `.fixture.ts` tal como está escrito.
- **El catálogo va antes que el código que lo usa.** Ningún `'FUD09nn'` provisional.

---

## Mapa de dependencias

```
1 paquete ──→ 2 códigos del parser ──→ 3 árbol ──→ 4 líneas ──→ 5 argumentos ──→ 6 parseSpec ──→ 7 tests del parser
27 rango e INDEX                                                                        │
                                                                                         ▼
8 preguntas §8 ──→ 9 códigos del validador ──→ 10 lectura de meta ──→ 11 catálogo por capas
                                         └───→ 12 fixtures                    │
                                                  └──────────┬────────────────┘
                                                             ▼
                                              13 términos ──→ 14 componente y props
                                                                       │
15 gramática ──→ 16 language-configuration                             │
                                                                       ▼
                          17 LanguagePlugin aislado ──→ 18 host del validador ──→ 19 diagnósticos
                                                                       ├──→ 20 completado
                                                                       ├──→ 21 hover y definición
                                                                       ├──→ 22 semantic tokens
                                                                       └──→ 23 invalidación
                                                                                  │
                                                       24 wiring VS Code ──→ 25 entrega ──→ 26 cierre
```

---

## Fase 1 — paquete y catálogo (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **El paquete.** `@fudic/spec` con `package.json` (versiones exactas, `@fudic/diagnostics` como única dependencia), `tsconfig.json`, `tsconfig.build.json`, `vitest.config.ts` con `coverage.include: ['src/**/*.ts']` y umbral 100 en las cuatro métricas, y `README.md`. No depende de `@fudic/compiler` | `spec` | `packages/spec/*` |
| [x] | 2 | 1 | **Los dieciséis códigos del parser.** `FUD0920`–`FUD0935`: `.ts` con su función tipada (severidad `error`, mensaje en inglés, sin ramas), `.md` con la forma de SDD-50 §4.4 y su línea en `index.ts`, en orden. `@fudic/diagnostics` sigue al 100 %: sus tests genéricos recorren todo código nuevo | `diagnostics` | `src/codes/FUD0920`–`0935.{ts,md}` · `src/index.ts` |
| [x] | 27 | — | **El rango.** `FUD0920`–`FUD0959` reservado en la fila de SDD-52 del `INDEX.md`; los `.md` de `FUD0920`–`0935` citan `SDD-52` | — | `docs/sdd/INDEX.md` |

## Fase 2 — el parser (5)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 3 | 1 | **El árbol.** Los tipos de SDD §3.3, de solo lectura, con `Span` en cada nodo; `ParseResult<T>` propio (no se importa del compilador) | `spec` | `src/ast.ts` |
| [x] | 4 | 2 | **Las líneas.** `readLine`: indentación (ancho, span, tabulador), tokens con sus secciones entre comillas (escapes `\"` y `\\`, sin cruzar de línea, `FUD0920` si no cierran) y el comentario cuando `#` abre un token | `spec` | `src/line.ts` |
| [x] | 5 | 4 | **Los argumentos.** `toArg`: `bare`, `string` (con `contentSpan`) o `role` (`role:x` y `role:x/"nombre"`). Lo mal formado es `FUD0935` y se degrada a `bare`; con una comilla sin cerrar, solo `FUD0920` | `spec` | `src/args.ts` |
| [x] | 6 | 3, 5 | **`parseSpec`.** Las reglas de SDD §4.1: niveles 0/2/4 con recuperación por primera palabra, sumideros sin cascada, cierre de criterio con `FUD0933`/`FUD0934`, `FUD0922` en `[0, 0)`, diagnósticos ordenados por posición y saltos `\n`, `\r\n` y `\r`. Exportado desde `index.ts` | `spec` | `src/parse.ts` · `src/index.ts` |
| [x] | 7 | 6 | **Los tests del parser**. Criterios 1–10, con `@fudic/spec` al 100 % en las cuatro métricas. Si un test destapa un defecto, se corrige el parser, no el test | `spec` | `test/` |

## Fase 3 — el validador (8)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 8 | — | **Las preguntas de SDD §8**, cerradas como decisiones en la spec (§8 y §8.1, con `SpecFs` y `TermRoot`): el `.fixture.ts` en el editor, callbacks y slots, fixture por defecto | — | `docs/sdd/SDD-52-fudspec.md` |
| [x] | 9 | 8 | **Los quince códigos del validador.** `FUD0940`–`FUD0954`, igual que la tarea 2. `FUD0940` y `FUD0950` llevan la lista de nombres disponibles | `diagnostics` | `src/codes/FUD0940`–`0954.{ts,md}` · `src/index.ts` |
| [x] | 10 | 9 | **`readTermModule`.** `oxc-parser` (misma versión exacta que el compilador) como dependencia de `@fudic/spec`. Extrae `meta` sin ejecutar: objeto literal, `name`/`block`/`params` literales, tipos de la lista cerrada, nombres de parámetro únicos, texto fuente de `describe`, exports `run` y `selfTest`. `FUD0941`–`0946`, `FUD0954`. Criterios 14, 15 | `spec` | `src/term-module.ts` |
| [x] | 11 | 10 | **`createTermCatalog`.** Las dos raíces en orden, primera coincidencia entera, `SpecFs` inyectado, `resolve` y `list` por bloque. Criterios 11, 13 | `spec` | `src/catalog.ts` |
| [x] | 12 | 9 | **`readFixtures`.** Las claves del `export default`, con y sin `satisfies`, con y sin comillas, cada una con su span. Criterio 19 | `spec` | `src/fixtures.ts` |
| [x] | 13 | 11 | **`validateSpec`: términos.** Normalización a kebab-case, `FUD0940` con la lista del bloque, problemas del módulo sobre el término con `related` al `.js`, aridad (`FUD0947`) y tipos según SDD §3.5 (`FUD0948`). Criterios 12, 16 | `spec` | `src/validate.ts` |
| [x] | 14 | 12, 13 | **`validateSpec`: componente y props.** `FUD0949`; `props` como primitiva: `FUD0950`, `FUD0952`, `FUD0953`; `FUD0951` solo con `requiredProps` no vacío. Criterios 17, 18 | `spec` | `src/validate.ts` |
| [ ] | 28 | 10–14 | **Los tests del validador** (otra sesión). Criterios 11–19, con `@fudic/spec` al 100 % en las cuatro métricas. Si un test destapa un defecto, se corrige el validador, no el test | `spec` | `test/` |

## Fase 4 — el colorizer (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 15 | 6 | **La gramática.** `source.fudspec` con los scopes de SDD §4.3 y un test de snapshot de tokens sobre el fichero canónico y sobre uno con todos los casos. Criterio 20 | `vscode` | `syntaxes/fudspec.tmLanguage.json` |
| [ ] | 16 | 15 | **`language-configuration`.** Comentario `#`, cierre de comillas, indentación de dos espacios | `vscode` | `language-configuration.fudspec.json` |

## Fase 5 — el language server (7)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 17 | 6 | **El `LanguagePlugin` aislado.** Reconoce solo `.fudspec` (`languageId: 'fudspec'`, sin códigos embebidos), registrado junto al del `.fud`. Comprobar servicio por servicio (HTML, CSS, TS, fudic, etiquetas) que ninguno responde en una `.fudspec`; el que responda se acota. Criterio 24 | `language-server` | `src/fudspec/language-plugin.ts` · `src/server.ts` |
| [ ] | 18 | 14, 17 | **El host del validador.** `SpecFs` sobre el sistema de ficheros del servidor; raíces `<workspace>/fudic/terms/` y la del framework; `component(tag)` desde el índice del workspace; `requiredProps` con el programa TS de `@fudic/typecheck` sobre `$Props` (`'unknown'` si no se puede leer); `fixtures(tag)` del `<tag>.fixture.ts` hermano | `language-server` | `src/fudspec/host.ts` |
| [ ] | 19 | 18 | **Diagnósticos.** Parser más validador en cada cambio. Criterio 21 | `language-server` | `src/fudspec/service.ts` |
| [ ] | 20 | 18 | **Completado.** Palabras clave por indentación; términos del bloque con su capa; argumentos según `meta.params` (tags y `role:` para `element`); claves de fixture tras `props`. Criterio 22 | `language-server` | `src/fudspec/completion.ts` |
| [ ] | 21 | 18 | **Hover e ir a la definición.** Firma, `describe`, capa y ruta; término → `.js`, `component` → `.fud`, `props x` → la clave. Criterio 23 | `language-server` | `src/fudspec/hover.ts` · `src/fudspec/definition.ts` |
| [ ] | 22 | 18 | **Semantic tokens.** Término existente frente a inexistente, argumento `element` como tag | `language-server` | `src/fudspec/semantic-tokens.ts` |
| [ ] | 23 | 19 | **Invalidación.** Un cambio en `fudic/terms/**/*.js`, en un `*.fixture.ts` o en un `.fud` revalida las `.fudspec` abiertas. Criterio 25 | `language-server` | `src/fudspec/service.ts` |

## Fase 6 — VS Code y cierre (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 24 | 16, 23 | **El wiring.** `contributes.languages` (`fudspec`, `.fudspec`, configuración e icono claro/oscuro), `contributes.grammars`, `workspaceContains:**/*.fudspec`, `documentSelector` con `fudspec` y vigilancia de ficheros para la tarea 23. Criterio 26 | `vscode` | `package.json` · `src/client-options.ts` · `icons/` |
| [ ] | 25 | 7, 24, 28 | **Entrega.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; `@fudic/spec` y `@fudic/diagnostics` al 100 % sin `v8 ignore`; el umbral de `language-server` y `vscode` no baja. Criterio 27 | todos | — |
| [ ] | 26 | 25 | **Cierre.** SDD-52 a `Hecho`, su fila del `INDEX.md` y entrada en el registro de progreso | — | `docs/sdd/` |

---

## Criterios → tareas

| Criterio | Tareas |
|---|---|
| 1–10 | 3, 4, 5, 6 (código) · 7 (tests) |
| 11, 13 | 11 · 28 (tests) |
| 12, 16 | 13 · 28 (tests) |
| 14, 15 | 10 · 28 (tests) |
| 17, 18 | 14 · 28 (tests) |
| 19 | 12 · 28 (tests) |
| 20 | 15 |
| 21 | 19 |
| 22 | 20 |
| 23 | 21 |
| 24 | 17 |
| 25 | 23 |
| 26 | 24 |
| 27 | 25 |
