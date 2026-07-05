# Índice maestro de SDD — Compilador `.fud`

> **Qué es esto.** El índice de los Spec-Driven Documents que definen la construcción
> del compilador. Cada SDD describe **qué** construir y **cómo verificar** que está bien,
> no el código. Claude Code lee un SDD, implementa, y los criterios de aceptación del
> propio SDD determinan si la implementación es correcta.
>
> **Flujo de trabajo.** Las specs (SDD-NN) se generan a demanda. Cuando un SDD pasa a
> estado `Listo`, Claude Code lo implementa de forma autocontenida. Un SDD no debería
> requerir leer los otros para implementarse: su sección *Dependencias* declara qué
> interfaces ya están disponibles, y su sección *Interfaz pública* declara qué expone.

---

## Convenciones

### Estados

| Estado | Significado |
|---|---|
| `Pendiente` | Aún no escrito. |
| `Listo` | Spec completa y revisada. Claude Code puede implementar. |
| `En curso` | Claude Code implementando. |
| `Hecho` | Implementado y todos los criterios de aceptación pasan. |
| `Bloqueado` | Esperando a que una dependencia llegue a `Hecho`. |

### Formato de cada SDD

Todos los SDD siguen la misma estructura fija:

1. **Contexto y objetivo** — qué pieza es, dónde encaja en el pipeline.
2. **Dependencias** — qué SDD deben estar en `Hecho` antes, con las interfaces que aportan.
3. **Interfaz pública** — las firmas TypeScript exactas que el módulo expone. Es el contrato.
4. **Comportamiento** — las reglas, ancladas por número a las decisiones de gramática (`gramatica-v1-decisiones.md`).
5. **Invariantes LSP** — spans en todo, no lanzar nunca, navegabilidad por offset. Transversal: presente en cada SDD.
6. **Criterios de aceptación** — la batería de tests que define "hecho". Entradas concretas → salidas esperadas.
7. **Fuera de alcance** — qué NO implementar aquí, para evitar invasión del SDD siguiente.

### Reglas de oro (aplican a todos los SDD)

- **Repo limpio.** El parser se construye desde cero. Del prototipo `compiler-master` (2019)
  se traen *ideas* validadas (identidad de nodos, patrón de visitors, detección `hasShadow`),
  nunca código. No se usa parse5 (decisión 38: subset estricto, sin error recovery HTML5).
- **TypeScript desde el día 1.**
- **Spans universales.** Todo token y todo nodo del AST lleva `Span` (offset inicio/fin). Sin excepción.
- **El parser nunca lanza.** Ante input roto: emite un diagnóstico con su span y continúa. Esto separa
  un compilador batch de un language server.
- **AST navegable por offset** desde el primer commit. El reparseo incremental puro puede diferirse,
  pero solo si la *forma* del AST ya lo permite.
- **Oxc se invoca exactamente una vez por fichero** (los fragmentos JS se acumulan en un buffer
  sintético con tabla de regiones; los spans de error se mapean de vuelta).

---

## Tabla maestra

| SDD | Nombre | Estado | Depende de | Decisiones de gramática |
|---|---|---|---|---|
| [00](./SDD-00-toolchain.md) | Toolchain y dependencias de compilación | `Hecho` | — | — |
| [01](./SDD-01-andamiaje.md) | Andamiaje y tipos base | `Hecho` | 00 | — |
| [02](./SDD-02-balanceador.md) | Balanceador de delimitadores | `Listo` | 00, 01 | 6 |
| [03](./SDD-03-tokenizer.md) | Tokenizer + pila de modos | `Listo` | 00–02 | notas (modos) |
| [04](./SDD-04-transicion-at.md) | Reglas de transición del `@` | `Listo` | 00–03 | 1–8 |
| [05](./SDD-05-parser-html.md) | Parser HTML (subset estricto) | `Listo` | 00, 03, 04 | 38–52 |
| [06](./SDD-06-control-flujo.md) | Construcciones de control de flujo | `Listo` | 00, 04, 05 | 9–17 |
| [07](./SDD-07-bindings.md) | Interpolación y bindings | `Listo` | 00, 04, 05 | 18–31 |
| [08](./SDD-08-code-block.md) | Bloque `@code` (server/client/neutral) | `Listo` | 00, 02, 04, 05 | 32–34, 63–66 |
| [09](./SDD-09-css-razor.md) | CSS con Razor (`<style>`) | `Listo` | 00, 02, 04, 05 | 42 (a–e) |
| [10](./SDD-10-documento.md) | Estructura del documento | `Listo` | 00, 05, 08 | 53–62 |
| [11](./SDD-11-oxc.md) | Integración Oxc | `Listo` | 00, 01, 02 | 6, 32 |
| [12](./SDD-12-semantica.md) | Análisis semántico | `Listo` | 00, 05–11 | 19, 31, 33.a/b/c, 41, 45, 65 |
| [13](./SDD-13-source-maps.md) | Source maps y `LineMap` | `Listo` | 00, 01, 11 | notas |
| [14](./SDD-14-runtime.md) | Runtime (`@fudic/dom`·`ssr`·`core`) | `Listo` | 00, 01 | 67–74 |
| [15](./SDD-15-emit.md) | Emit (AST → runtime) | `Pendiente` | 00, 05–14 | niveles N1–N3 |

---

## Grafo de dependencias

```
SDD-00  Toolchain (entorno: TS, Vite 8, Vitest, Oxc, fixtures)
   │
   ▼
SDD-01  Andamiaje (tipos base: Span, Diagnostic, ParseResult, ModeStack)
   │
   ├─────────────┐
   ▼             ▼
SDD-02        (tipos disponibles para todos)
Balanceador
   │
   ├──────────────────────────┐
   ▼                          ▼
SDD-03  Tokenizer        SDD-11  Oxc
   │                          │
   ▼                          │
SDD-04  Transición @          │
   │                          │
   ▼                          │
SDD-05  Parser HTML           │
   │                          │
   ├──────┬──────┬──────┐     │
   ▼      ▼      ▼      ▼     │
 SDD-06 SDD-07 SDD-08 SDD-09  │   ← paralelizables entre sí
 Control Binds  @code  CSS    │
   │      │      │      │     │
   │      │      ▼      │     │
   │      │   SDD-10    │     │
   │      │   Documento │     │
   │      │      │      │     │
   └──────┴──────┴──────┴─────┘
                 │
                 ▼
          SDD-12  Semántica
                 │
                 ▼
          SDD-13  Source maps
                 │
                 ▼
          SDD-14  Runtime  ◄── contrato Dom<N> + adapters browser/SSR + signal/lifecycle/eventos/estilos
                 │            (independiente del parser; prerrequisito del emit)
                 ▼
          SDD-15  Emit  ◄── HITO: AST → runtime; home + app-card + app-button compilan y corren
```

### Camino crítico

`00 → 01 → 02 → 03 → 04 → 05` en serie. El toolchain (00) y el andamiaje de tipos (01)
son prerrequisito de todo. A partir de ahí, el balanceador, el tokenizer, la transición `@`
y el parser HTML forman la columna vertebral; nada paraleliza aquí.

A partir de `05`, los SDD **06 / 07 / 08 / 09 son paralelizables** entre sí (todos cuelgan
del parser HTML pero no dependen unos de otros). `10` necesita además `08` (el `@code`
participa en la estructura del documento).

`11 (Oxc)` puede arrancar en cuanto exista `02`, en paralelo con toda la rama del tokenizer.

`12` y `13` son convergentes: requieren que la rama de parsing esté completa. `14 (Runtime)` es
**ortogonal al parser**: no ve el AST, define el contrato de ejecución (`Dom<N>` + adapters +
reactividad/lifecycle) y puede implementarse en paralelo. `15 (Emit)` cierra: traduce el AST
(05–12) a llamadas contra el runtime (14) y engancha los source maps (13).

### Transversales (no son fases)

- **Invariantes LSP** (tolerancia a errores, spans, navegabilidad por offset): incrustados en
  cada SDD desde el 00. No se retrofitean.
- **Reparseo incremental**: la *forma* del AST debe permitirlo desde el 01; la implementación
  incremental se difiere a un SDD posterior al 14.
- **Integración Volar / Language Server**: posterior al 14. Consume la API de query por offset
  que los SDD 01–05 ya garantizan.

---

## Hito de cierre

El hito se alcanza con **SDD-14 (Runtime) + SDD-15 (Emit)** juntos: primero el runtime define y
prueba el contrato de ejecución (`Dom<N>`, adapters browser/SSR, `signal`, lifecycle, delegación,
`<style host>`); luego el emit traduce el AST a llamadas contra ese contrato, y los tres ficheros
canónicos `home.fud` + `app-card.fud` + `app-button.fud` **compilan y corren** en su nivel inferido
(N1 = DSD inline cero-JS; N2 = delegación global; N3 = clase + hidratación). Regla de oro
confirmada por Pedro: **no se implementa el emit hasta que el runtime esté implementado y probado.**

---

## Registro de progreso

| Fecha | SDD | Cambio |
|---|---|---|
| 2026-07-05 | 14 | **Re-planificado y redactado (`Listo`).** La antigua SDD-14 (emit nivel 1) se descarta: el emit no puede escribirse contra un runtime inexistente. SDD-14 pasa a ser el **Runtime completo** (`@fudic/dom`·`ssr`·`core`), y el emit se mueve a **SDD-15**. Cierra el contrato `Dom<N>` (construcción/mutación/shadow/adopción) + `browserDom` + `SsrDom` (árbol desacoplado → `renderToString`, resuelve void/rawtext/DSD/escape que el boceto `dom-wrapper.ts` dejaba abierto) + `signal` (DOM-first, decisión 72) + `Render<N>` lifecycle + `FudicElement` (decisión 73) + delegación N2 vs listeners N3 + `<style host>` (67–70) + scheduler de hidratación (74) + `Cursor`. Idea central: **un render, dos adapters** (espejo runtime de "un AST, dos ramas"). Rango `FUD0230`–`FUD0259` reservado y vacío. Decisiones 67–74. Depende solo de 00/01 (ortogonal al parser). |
| 2026-06-24 | 00 | Andamiaje montado como monorepo pnpm: `packages/compiler` (`@fudic/compiler`) con TS 5.9.3 (target ES2024), Vite 8.0.16, Vitest 4.1.9, oxc-parser 0.137.0, pnpm 11.9.0. Criterios de aceptación verdes. |
| 2026-06-24 | 02 | Spec redactada y en estado `Listo`. API: núcleo `scanBalanced(source, openOffset, closer)` + envoltorios `scanParens/Brackets/Braces`. Salida `BalancedGroup` (span, inner, closed, tabla de `LexRegion[]`). Regex vs división por token anterior. Rango `FUD0002`–`FUD0009` reservado. |
| 2026-06-25 | 03 | Spec redactada y en estado `Listo`. Cursor `Lexer` perezoso (`peek`/`next`/`seekTo`, dueño de `ModeStack`). Tokens contextuales con regiones JS opacas (átomos vía balanceador). `@` léxico (`@@`/`@*`/`@(`/`@{` + lookbehind email) en el tokenizer; keywords/implícitas → `at-trigger` para SDD-04. Rango `FUD0010`–`FUD0029`. ⚠️ §4.6 marca contradicción `<title>` opaco (notas modos) vs `home.fud` con `@data.title` — pendiente de confirmar con Pedro. |
| 2026-07-02 | 14 | **Bloqueado antes de redactar.** Contradicción de fondo: el hito dice "3 fixtures → HTML nivel 1 cero-JS", pero la inferencia de niveles de los runtime docs (nivel-3 §9) clasifica `app-button`=N2, `app-card`=N3, `home`=SSR; ninguno es N1 ("sin `@code` ejecutable"). Pendiente decisión de alcance de SDD-14: **A** solo backbone estático DSD (dinámico → post-14), **B** SSG completo con `data-fud-*` (HTML sin JS inline; redefine "nivel 1"), **C** cambiar los fixtures del hito. Recomendada **B**. Pedro lo está analizando. |
| 2026-07-02 | 13 | Spec redactada y en estado `Listo`. Utilidad pura de conversión (hogar de `Position`/`Range`, diferidos desde SDD-01). `LineMap(source)` — offset UTF-16 ↔ `(line, character)` LSP, tabla de inicios de línea (binaria, clamp, `\n`/`\r\n`/`\r`); `rangeOf(lm, span)` convierte cada `Diagnostic` en `Range`. `SourceMapBuilder` — acumula `(genOffset, srcOffset)` y serializa Source Map v3 (VLQ Base64, 4 campos, sin `names` en v1). Composición con SDD-11: el emit resuelve buffer→fuente con `mapOffset` antes de `addMapping`. Nunca lanza (clampa); sin códigos `FUD` (rango `FUD0210`–`FUD0229` reservado, vacío). |
| 2026-07-02 | 12 | Spec redactada y en estado `Listo`. Pasada semántica convergente (SOLID: un *analyzer* por regla; `analyze(input)` → diagnósticos + `SemanticModel`). Cubre lo aplazado: duplicados (45/FUD0190), `ref` en bucle (31/0192), unicidad y anidación de regiones `@code` (33.b/a, 0194/0193), import neutro por efecto (33.c/0196 warning), interpolación no-primitiva evidente (19/0195), custom element sin `<link>` vía `ComponentRegistry` inyectada (41/0191), y resuelve la estrategia `@client` default `interaction` (65). **Hogar del catálogo consolidado FUD** (§5, FUD0001–FUD0209). Rango propio `FUD0190`–`FUD0209`. **Límites de diseño (§8, no bloquean):** 19 completo necesita tipos (Volar); 41 completo necesita resolver cross-file; 33.c "pureza" es indecidible (solo warning). |
| 2026-07-02 | 11 | Spec redactada y en estado `Listo`. Mecanismo de batching de JS: `JsBatch(source).add(kind, span)` acumula fragmentos, `parse()` construye **un** buffer sintético con tabla de regiones e invoca `parseSync` de Oxc **una vez** (memoizado); `JsBatchResult` da `ast(id)` (nodo Oxc por fragmento) + `mapOffset`/`mapSpan` (buffer→fuente). Kinds con envoltorio: `expression`/`module-statements`/`block-statements`/`for-of-header`/`for-header`. Desacoplado del árbol (fragmentos alimentados por el pipeline). Errores Oxc → `FUD0170` con span mapeado. **Aclaración clave:** "Oxc una vez" es parse **sintáctico**; el type-check server/client separado es capa Volar posterior, sin conflicto. Sync (NAPI) elegido; async futuro. Rango `FUD0170`–`FUD0189`. |
| 2026-07-02 | 10 | Spec redactada y en estado `Listo`. Pasada de validación+clasificación sobre el `HtmlDocument` plano de SDD-05: `structureDocument(source, doc)` → `PageDocument | ComponentDocument`. Componente: máquina de 3 fases link→code→markup (53, FUD0155), múltiples links (55), ≤1 `@code` (54, FUD0154). Página: doctype `html` (57, FUD0150; lee `source`), `<html>`→`<head>`→`<body>` obligatorios y ordenados (58, FUD0151), links/`@code` solo en `<head>` (59/60, FUD0152/0153), orden en head no estricto (61). Whitespace/comentarios transparentes (56). Elevación/dedupe de head y head-fragment (61/62) y extracción de `@code` → emit. Rango `FUD0150`–`FUD0169`. **Ajuste:** la validación del doctype (57) pasa de SDD-12 a SDD-10 (corregida la referencia en SDD-05). |
| 2026-07-02 | 09 | Spec redactada y en estado `Listo`. Parsea el cuerpo de `<style>`: desambigua el `@` por lista blanca cerrada de at-rules (`CSS_AT_RULES`, decisión 42.a/b) — dentro→CSS literal, fuera→átomo Razor (`resolveTrigger`/`scanParens`), `@@`→literal (42.c). Salida `StyleNode.parts` plana (`CssText`/`RazorExpression`/`AtEscapeNode`/`RazorCommentNode`); interpolación en prelude y cuerpo (42.d); conteo de llaves valida nesting (42.e, FUD0131). Control de flujo/`@code`/`raw` en CSS **fuera de v1** (FUD0130). Pasada sobre el placeholder de `<style>` de SDD-05 (sin dependencia inversa). Rango `FUD0130`–`FUD0149`. **Strings CSS cerrado con opción A:** interpolación activa dentro de strings (`@@` para literal), como en atributos HTML; solo los comentarios `/* */` quedan sin interpolar. |
| 2026-07-02 | 08 | Spec redactada y en estado `Listo`. Implementa `AtConstructParser.parseCodeBlock` (seam de SDD-05). `CodeBlockNode.parts` = lista ordenada de `NeutralJs`/`ServerRegion`/`ClientRegion` (orden libre, decisión 34). Cuerpo delimitado con `scanBraces`; escaneo de marcadores `@server`/`@client` a nivel superior (salta strings/comentarios/regex/anidados vía balanceador; un `@Component` decorador es JS neutro). Valida sintáctico: `@server(…)` prohibido (66, FUD0111), whitelist de estrategia `eager|viewport|interaction|idle` (64, FUD0112/0113). Cada `.js` es fragmento Oxc independiente (32). Rango `FUD0110`–`FUD0129`. **Diferido a semántica (SDD-12):** unicidad/anidación de regiones (33.a/b), neutro puro (33.c), default `interaction` (65). **Nota:** el EBNF `code_content` dibuja orden fijo — la decisión 34 (libre) manda; alinear el doc de gramática. |
| 2026-07-02 | 07 | Spec redactada y en estado `Listo`. Capa de clasificación pura sobre el árbol de SDD-05: `classifyAttribute(attr)` despacha por nombre a `AttributeBinding`/`PropertyBinding`/`EventBinding`/`RefBinding`/`ClassBinding`/`StyleBinding`; `interpolate(expr)` envuelve la `RazorExpression` de contenido en `Interpolation` (escapada por defecto). Valida solo reglas sintácticas (valor `@` único, sin concat, `ref` id simple); escape real, primitivas (19), booleanos (21), `ref` en bucle (31) y `TrustedHTML` van a emit/SDD-12. Rango `FUD0090`–`FUD0109` (0090–0095). **`@raw` cerrado con opción A:** `raw` es directiva reservada tras `@`. Toca 3 specs — SDD-04 (nuevo `kind: 'raw'` en `TriggerResolution`, §4.4b, invoca `scanParens`), SDD-05 (nodo de contenido `RawExpressionNode`), SDD-07 (`raw-expression` → `Interpolation { escaped: false }`). Aplicado en las tres. |
| 2026-07-02 | 06 | Spec redactada y en estado `Listo`. Control de flujo: implementa `AtConstructParser.parseControl` (seam de SDD-05). Nodos `IfNode`/`ForeachNode`/`ForNode`/`WhileNode`/`SwitchNode` (+ `ConditionalBranch`/`SwitchCase`). Cabecera `( … )` opaca vía `scanParens` (JS a Oxc); cuerpo `{ html_block }` vía recursión `ctx.parseContentUntil`. Cadena `else`/`else if` con `@else`≡`else` (decisión 9) y ws/comentarios entre `}` y `else` (decisión 10). `@switch` sin fall-through (14), test de `case` delimitado hasta el `:` a profundidad 0 con conteo de ternarios (15/§4.5). Rango `FUD0070`–`FUD0089` (0070–0075 definidos). **Cerrado con Pedro:** (1) el `}` crudo cierra bloque, llave literal con `&#125;`; consecuencia: SDD-05/03 deben cortar texto ante `}`/`case`/`default` dentro de un cuerpo de control; (2) test de `case` cortado en el `:` a nivel 0. `for…in`/for-of (11,12) y `@break`/`@continue` (13) se validan en semántica (Oxc/SDD-12). |
| 2026-07-02 | 05 | Spec redactada y en estado `Listo`. Parser HTML de subset estricto (decisión 38): conduce el `Lexer` de SDD-03 y consume SDD-04 por cada `@`. Salida AST navegable: `HtmlDocument`/`ElementNode`/`Attribute` + hojas (`TextNode`, `CommentNode`, `DoctypeNode`, `CdataNode`, `RawTextNode`, `RazorExpression`, `RazorCommentNode`, `AtEscapeNode`, `InlineCodeNode`). Entrada `parseDocument(source, options)`. **Frontera con SDD-06/07/08 por DIP**: interfaz `AtConstructParser` (`parseControl`/`parseCodeBlock`) + `HtmlParseContext.parseContentUntil` inyectados; 05 no importa a sus hermanos y el grafo queda acíclico. Detección componente/página (decisión 51) fija solo `mode`; estructura de documento (53–62) y semántica (45, 57) diferidas a SDD-10/12. Recuperación determinista mínima (§4.7). Rango `FUD0050`–`FUD0069` (0050–0055 definidos). |
| 2026-06-25 | 04 | Spec redactada y en estado `Listo`. Resolvedor del `at-trigger`: `resolveTrigger`/`scanImplicitExpression`/`classifyKeyword`/`expressionFromToken`. Nodo unificado `RazorExpression` (implícita+explícita). **Implícita = solo camino de propiedades `identifier('.'ident)*`** (cerrado con Pedro, opción A): `?.`, llamadas, índices, `!` y genéricos van por `@(...)`. Esto revisa la decisión 3 de gramática (pendiente reflejar en `gramatica-v1-decisiones.md`). SDD-04 ya no llama al balanceador. Rango `FUD0030`–`FUD0049` reservado (sin códigos nuevos en v1). Punto abierto: propiedad del nodo `RazorExpression` (aquí vs SDD-07). |
