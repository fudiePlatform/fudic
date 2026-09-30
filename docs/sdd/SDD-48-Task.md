# SDD-48 — Tareas

> **SDD:** [SDD-48 — Componentes y snippets en el layout, y huecos con slot](./SDD-48-componentes-en-layout.md)
> **Paquetes:** `@fudic/compiler` · `@fudic/language-core` · `@fudic/language-server` ·
> `@fudic/formatter` · `fudic-vscode` · `@fudic/example-basic`
> **Rama:** `worktree-SDD-48-componentes-layout`
> **Progreso:** 21 / 26

Se implementó al revés de lo habitual, por decisión expresa de Pedro: primero el código y la
evidencia en `examples/basic`, para que la probara en el navegador y en el editor; después este
documento; y los tests y la cobertura al final (fase 5). Sus pruebas en el editor destaparon tres
tandas de fallos —el fichero que dejaba de ser layout al reescribir su `@RenderBody()`, el
autocompletado de los huecos y de `@render`, y el color del nombre de un snippet— y la decisión
de escribir los argumentos de `@render` como una prop (decisión 135).

---

## Fase 1 — el compilador (9)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 1 | — | **Argumentos de los huecos.** `slot:` en `@RenderBody`, `required:` y `slot:` en `@RenderSection`; `SlotArgument`; `FUD0433` para lo que no encaja | `compiler` | `src/layout/nodes.ts` · `src/layout/layout.ts` · `src/layout/index.ts` |
| [x] | 2 | — | **El body de un layout es marcado.** `FUD0704` retirado, `FUD0705` solo para `@{ }`; `FUD0443` para un hueco dentro de un constructo; el recorrido gana `inlineCode` y `hole` | `compiler` | `src/semantic/analyzers/layout-body.ts` · `src/semantic/walk.ts` · `src/emit/layout-code.ts` |
| [x] | 3 | 1 | **El contrato ruta↔layout.** `holeContractDiagnostics` y `missingRequiredSections` (`FUD0440`–`FUD0442`), llamados desde `resolveDocument` | `compiler` | `src/layout/contract.ts` · `src/emit/resolve.ts` |
| [x] | 4 | 1 | **La ruta sella el slot.** `MarkupEmitter.emitSlotted`; el módulo de ruta lo usa con los slots de su layout | `compiler` | `src/emit/markup.ts` · `src/emit/layout.ts` |
| [x] | 5 | 1 | **`slot:` contra el componente de alrededor.** `slot-name` (`FUD0199`) recibe los huecos | `compiler` | `src/semantic/analyzers/slot-name.ts` |
| [x] | 6 | 2 | **Anclas del layout.** `<!--fud:l-->` tras cada constructo más externo del body; `composePage` da pasos `anchor` y el chunk de la ruta salta a ellos | `compiler` | `src/emit/markup.ts` · `src/emit/compose.ts` · `src/emit/route-client.ts` |
| [x] | 7 | 2 | **Un layout por cualquier hueco.** Un shell sin `@RenderBody()` pero con otro hueco es layout con `FUD0423` en su propio fichero | `compiler` | `src/document/structure.ts` |
| [x] | 8 | — | **Argumentos de `@render` como props.** Literal tal cual, `@nombre` / `@a.b` / `@( … )` sin la `@` en el valor; `FUD0444`, `FUD0445`; `FUD0833` retirado | `compiler` | `src/snippet/parser.ts` |
| [x] | 9 | 5 | **La raíz de un `@snippet` no conoce su componente.** `slot-name` no comprueba un `slot=` en ella | `compiler` | `src/semantic/analyzers/slot-name.ts` |

## Fase 2 — el editor (8)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 10 | 3 | **Diagnósticos y bombilla del contrato.** `holes` en el índice; el servicio de huecos; la bombilla de `FUD0440` | `language-server` | `src/workspace-index.ts` · `src/mode.ts` · `src/services/holes.ts` · `src/services/compiler-diagnostics.ts` · `src/services/actions.ts` |
| [x] | 11 | 2 | **Un `@` en el body del layout.** Las props en todo el layout, el control de flujo, `@render` donde hay snippets, `@RenderBody($0)` que abre la lista | `language-server` | `src/services/template-scope.ts` · `src/services/snippets.ts` |
| [x] | 12 | 1 | **Los paréntesis de un hueco.** Argumentos que faltan, cada slot como `slot: "x"`, valores tras `slot:` y `required:`, nombres dentro de las comillas; `(` y `,` como disparadores que solo contestan ahí | `language-server` | `src/services/hole-args.ts` · `src/services/plugin.ts` · `src/capabilities.ts` |
| [x] | 13 | 1 | **`slot:` en la proyección.** `$intoSlot<$Slots>` sobre el literal del hueco | `language-core` | `src/template/sections.ts` · `src/template/attrs.ts` · `src/emit-client.ts` |
| [x] | 14 | 9 | **Un snippet sin host.** `host: null` en la raíz de un cuerpo de `@snippet`: su `slot=` no es `TS2345` | `language-core` | `src/template/context.ts` · `src/template/snippets.ts` · `src/emit-client.ts` |
| [x] | 15 | 8 | **`@render` en el editor.** Tras `@render `, snippets locales, importados y espacios de nombres; entre paréntesis, valores de la vista con `@` y parámetros; bombilla de `FUD0444`; `snippets` en el índice | `language-server` | `src/services/render.ts` · `src/services/plugin.ts` · `src/services/actions.ts` · `src/workspace-index.ts` · `src/mode.ts` |
| [x] | 16 | 15 | **El color del nombre de un snippet.** `USER_UNCOLOURED_CAPS` en la proyección; el servidor lo pinta `function` | `language-core` · `language-server` | `src/caps.ts` · `src/template/snippets.ts` · `src/services/semantic-tokens.ts` |
| [x] | 17 | 8 | **El formateador conserva la `@`.** Y deja `@( … )` tal cual | `formatter` | `src/print/snippet.ts` |

## Fase 3 — la evidencia (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 18 | 1–9 | **El layout con marco.** `app-marco` (rejilla y CSS), el snippet del pie, `_layout-marco.fud` con props, contador interactivo y `@foreach` delante de los huecos; `/marco` y `/marco-sin-lateral`; enlace en `site-nav` | `example-basic` | `src/components/app-marco.fud` · `src/snippets/marco.fud` · `src/layouts/_layout-marco.fud` · `src/routes/marco.fud` · `src/routes/marco-sin-lateral.fud` · `src/components/site-nav.fud` |
| [x] | 19 | 8 | **Snippets con valores del scope.** `/snippets` pasa `@destacada`, un `@( … )` y un `@foreach`; los fixtures que pasaban referencias sin `@` las llevan | `example-basic` · `compiler` · `formatter` | `src/routes/snippets.fud` · `fixtures/app-panel.fud` · `fixtures/own/snippets.fud` |
| [x] | 20 | 18, 19 | **Pedro en navegador y editor.** Criterio 19 | — | — |

## Fase 4 — la documentación (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [x] | 21 | 20 | **La spec, este Task y las anotaciones.** Decisiones 133–135; enmiendas en SDD-21, SDD-29, SDD-40 y BUG-44; fila y registro en el `INDEX.md` | — | `docs/sdd/*` · `docs/gramar/gramatica-v1-decisiones.md` |

## Fase 5 — tests y cobertura (4)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 22 | 4 | **El slot también en el cliente.** Una raíz que el chunk de la ruta crea al re-renderizar un `@if` o un bucle reactivo de un hueco con slot sale con su `slot=`. Criterio 5 | `compiler` | `src/emit/markup-client.ts` · `src/emit/route-client.ts` |
| [ ] | 23 | 1–9 | **Compilador y formateador.** Criterios 1–11; se reescriben los tests de `FUD0704`/`FUD0705`/`FUD0833` y el de un `@RenderBody()` dentro de un constructo, que pasan a esperar lo contrario | `compiler` · `formatter` | `test/layout/*` · `test/semantic/layout-body.test.ts` · `test/emit/layout-props.test.ts` · `test/emit/route-client.test.ts` · `test/snippet/parser.test.ts` · `test/print/snippets.test.ts` |
| [ ] | 24 | 10–16 | **Editor.** Criterios 12–17; los de aceptación ya escritos (`holes`, `layout-editor`, el de gramática) más los unitarios que la cobertura pida; se rehacen los que esperaban la regla del body de BUG-44 | `language-core` · `language-server` · `fudic-vscode` | `test/acceptance/holes.test.ts` · `test/acceptance/layout-editor.test.ts` · `test/services/*` · `test/grammar.test.ts` |
| [ ] | 25 | 22–24 | **`pnpm test` verde y cobertura.** Ficheros nuevos al 100 % en las cuatro; ningún paquete por debajo de su suelo en `main`. Criterio 20 | todos | — |

## Cierre (1)

| ✓ | # | dep | tarea |
|---|---|---|---|
| [ ] | 26 | 25 | `pnpm typecheck`, `pnpm test` y `pnpm build` verdes; SDD-48 a `Hecho` en la tabla y el registro del `INDEX.md` |
