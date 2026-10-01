# SDD-51 — Tareas

> **SDD:** [SDD-51 — Lo que se puede escribir en la vista](./SDD-51-expresiones-de-la-vista.md)
> **Paquetes:** `@fudic/diagnostics` · `@fudic/compiler` · `@fudic/dom` · `@fudic/ssr` ·
> `@fudic/vite` · `@fudic/language-core` · `@fudic/language-server`
> **Rama sugerida:** `sdd-51-expresiones-de-la-vista`
> **Progreso:** 0 / 16 — `Listo`.

**Cada tarea nace con sus tests.** Lo nuevo va al 100 % en las cuatro métricas desde su primer
commit (CLAUDE.md). En el compilador, que arrastra deuda, el umbral del paquete no baja y los
ficheros nuevos se miden solos al 100 %.

**El orden manda en tres puntos.**

- **El catálogo (fase 1) va antes que nada.** Cada analizador llama a la función de su código;
  no se escribe un `'FUD09nn'` provisional en ningún sitio.
- **El scope de la vista (tarea 3) va antes que los analizadores.** Tres de los cuatro lo
  necesitan, y escribirlo tres veces es tener tres respuestas distintas a «¿quién declara
  esto?».
- **El corpus es la red.** Tras cada analizador, los `.fud` del repo compilan sin un diagnóstico
  nuevo (criterio 20). Si aparece uno, o el analizador está mal o el `.fud` escribe algo que la
  spec prohíbe; lo segundo se para y se pregunta.

---

## Mapa de dependencias

```
1 catálogo ──→ 2 fragmentos del walk ──→ 3 scope de la vista
                                              │
          ┌──────────────┬──────────────┬─────┴────────┐
          ▼              ▼              ▼              ▼
   4 expresiones   5 sentencias   6 identificadores   7 on*
          └──────────────┴──────┬───────┴──────────────┘
                                ▼
                        8 el pase entero
                                │
9 guardia en dom ──→ 10 ssr e io ──→ 11 emit de setUrl
                                │
        12 proyección sin on* ──→ 13 editor
                                │
              14 gramática ──→ 15 entrega ──→ 16 cierre
```

---

## Fase 1 — el catálogo (1)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 1 | — | **Los diez códigos.** `FUD0900`–`FUD0909`: `.ts` con su función tipada (severidad `error`, mensaje en inglés), `.md` copiado de SDD §5 —cinco líneas, forma de SDD-50 §4.4— y su línea en `index.ts`, en orden. `FUD0908` lleva un parámetro con la palabra clave de la sentencia; los demás, solo el span. Criterio 18 | `diagnostics` | `src/codes/FUD0900`–`0909.{ts,md}` · `src/index.ts` |

## Fase 2 — el recorrido (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 2 | 1 | **Todo fragmento de §3.1 llega al `walk`.** Comprobar uno por uno contra la tabla de SDD §3.1: contenido e implícita, `@raw`, valores de atributo, cabeceras (`@if`, `@while`, `@switch`, `case`, `key`, iterable de `@foreach`, las tres partes de `@for`), argumentos de `@render`/`@RenderSection`/`@RenderBody` y `@{ }`. El que falte se entrega con un callback nuevo, como `hole` en SDD-48. Un test por fragmento que demuestra que el visitor lo recibe con su `fragmentId` | `compiler` | `src/semantic/walk.ts` · `test/semantic/` |
| [ ] | 3 | 2 | **El scope de la vista.** Un módulo que, dado un fragmento, contesta qué nombres ve y cuáles puede reasignar: los del template en scope (`@{ }` de bloques que lo contienen —decisión 17—, cabeceras de bucle, parámetros de snippet), los de nivel superior del `@code` (todas las zonas, imports incluidos), los `let` de la zona neutra, `data` en ruta y layout. Lee el AST de Oxc, no texto. Un `@{ }` hermano **posterior** no está en scope | `compiler` | `src/semantic/view-scope.ts` · `test/semantic/view-scope.test.ts` |

## Fase 3 — los analizadores (5)

Cada uno es una entrada de `ANALYZERS`, con span del nodo culpable vía `mapSpan`, uno por nodo
sin descender en él, y los hermanos sí (SDD §4.2, §4.3).

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 4 | 3 | **`view-expressions`.** La lista blanca de SDD §3.2 sobre todo fragmento de expresión de §3.1, salvo `@evento` y `bus:`. `FUD0900`, `0902`–`0906`. La excepción de la cabecera `@for` consulta el scope. Criterios 1, 2, 3, 6, 7, 8, 9, 12 | `compiler` | `src/semantic/analyzers/view-expressions.ts` · `src/semantic/analyze.ts` · test |
| [ ] | 5 | 3 | **`view-statements`.** La lista blanca de sentencias de SDD §3.3 y las escrituras de §3.5 en `@{ }`: destino identificador (`FUD0900` si es miembro), del template o `let` neutro (`FUD0901`). `FUD0905` para `function`/`class`, `FUD0908` para el resto. `signal-while.fud` y `signal-code.fud` sin diagnósticos. Criterios 4, 5, 11 | `compiler` | `src/semantic/analyzers/view-statements.ts` · test |
| [ ] | 6 | 3 | **`view-identifiers`.** Todo identificador leído y libre resuelve por el scope o por la lista de globales de SDD §3.4 (una constante, exportada para la tarea 12), o es `FUD0907` sobre el nombre. `$…` y `ctx` nunca resuelven. Criterio 10 | `compiler` | `src/semantic/analyzers/view-identifiers.ts` · `src/semantic/view-globals.ts` · test |
| [ ] | 7 | 1 | **`native-event-attributes`.** `FUD0909` sobre el nombre de todo atributo de evento de HTML, sin distinguir mayúsculas, estático o dinámico, en tag nativo o de componente; nunca sobre `.onX` ni `@x`. La lista de eventos es una constante del compilador —el compilador no puede depender del servicio de HTML— y la tarea 12 la ata a la del servicio con un test. Criterio 13 (lado compilador) | `compiler` | `src/semantic/analyzers/native-event-attributes.ts` · `src/semantic/html-events.ts` · test |
| [ ] | 8 | 4, 5, 6, 7 | **El pase entero.** Un fichero con `@(a++)`, `@(window)` y `@{ return; }` da los tres (criterio 14). Los `.fud` del repo, barridos por test, sin un diagnóstico nuevo, y `pnpm build` construye `examples/basic` (criterio 20) | `compiler` | `test/semantic/view.test.ts` |

## Fase 4 — las URL (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 9 | — | **El guardia en el contrato.** La función pura de SDD §3.7 (normalización, esquema en minúsculas, lista blanca, `data:image/` solo en `<img src>`, valor inerte y aviso en desarrollo), `trustedUrl(s)` y su marca, y `setUrl(el, name, value)` en `Dom<N>` y en `browserDom`. Las variantes de `javascript:` del criterio 16, una por test. `@fudic/dom` sigue al 100 % y `"sideEffects": false` | `dom` | `src/url.ts` · `src/dom.ts` · `src/browser.ts` · `src/index.ts` · test |
| [ ] | 10 | 9 | **Los otros dos `$dom`.** `SsrDom.setUrl` con la misma función, y el `$dom` mínimo que el emit fabrica para los atributos del head ([parts.ts:319](../../packages/compiler/src/emit/parts.ts#L319)), que solo tiene `setAttr` y lee lo que necesita de `io`: `io` gana la función del guardia, y el wrapper de `vite` la pone ahí junto a `escapeAttr` | `ssr` · `compiler` · `vite` | `ssr/src/ssr-dom.ts` · `compiler/src/emit/parts.ts` · `vite/src/wrapper.ts` · tests |
| [ ] | 11 | 10 | **El emit decide.** Para los atributos URL de SDD §3.7, el prefijo fijo del valor compuesto —partes literales (decisión 20) y primer tramo de una plantilla— decide: si fija el origen, `setAttr` como hoy; si no, `setUrl`. `srcset`, por candidato. Mismo HTML en servidor y cliente. Criterios 15, 16, 17 | `compiler` | `src/emit/attrs.ts` · test de emit |

## Fase 5 — el editor (2)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 12 | 7 | **La proyección sin `on*`.** `HTML_ATTRIBUTES` filtra los atributos de evento y el comentario que los defendía se reescribe con la razón nueva (CSP, decisión 139). Un test ata la lista del compilador (tarea 7) a los `on*` que devuelve el servicio de HTML: si el servicio gana uno, el test lo dice. Comprobar que `onclick` no da **además** un error de TypeScript que duplique `FUD0909`; si lo da, se queda solo el `FUD`. Criterio 13 (lado editor) | `language-core` | `src/globals.ts` · test |
| [ ] | 13 | 8, 12 | **Se ven en el editor.** Los diez, sobre la conexión LSP viva, con el mismo span que en el build (canal de SDD-35). Criterio 19 | `language-server` | test |

## Fase 6 — cierre (3)

| ✓ | # | dep | tarea | package | fichero |
|---|---|---|---|---|---|
| [ ] | 14 | 8, 11 | **La gramática.** Decisiones 137 (lista blanca de expresiones e identificadores), 138 (sentencias y escrituras de `@{ }`), 139 (`on*` nativo prohibido) y 140 (`setUrl` y `trustedUrl`), con su fila en la tabla índice; la 104 enmendada: fuera `await` de sus ejemplos | — | `docs/gramar/gramatica-v1-decisiones.md` |
| [ ] | 15 | 13, 14 | **Entrega.** `pnpm typecheck`, `pnpm test` y `pnpm build` en verde; cobertura 100 % en `diagnostics`, `dom`, `ssr`, `language-core` y en los ficheros nuevos del compilador, sin `v8 ignore`. Criterio 21 | todos | — |
| [ ] | 16 | 15 | **Cierre.** SDD-51 a `Hecho`, su fila del `INDEX.md` y entrada en el registro de progreso; T-18 de [SDD-25-Task-Claude](./SDD-25-Task-Claude.md) apunta a SDD-51 | — | `docs/sdd/` |

---

## Criterios → tareas

| Criterio | Tareas |
|---|---|
| 1, 2, 3, 6, 7, 8, 9, 12 | 4 |
| 4, 5, 11 | 5 |
| 10 | 6 |
| 13 | 7, 12 |
| 14, 20 | 8 |
| 15, 16, 17 | 9, 10, 11 |
| 18 | 1 |
| 19 | 13 |
| 21 | 15 |
