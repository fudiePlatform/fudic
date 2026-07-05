# SDD-06 — Construcciones de control de flujo

> **Estado:** `Listo`
> **Depende de:** 00, 04, 05
> **Decisiones de gramática:** 9–17

---

## 1. Contexto y objetivo

SDD-05 construye el árbol HTML y, ante un `@` que resuelve a **keyword de control**
(`@if`/`@else`/`@for`/`@foreach`/`@while`/`@switch`), **delega** el cuerpo por inversión de
dependencias: llama a `AtConstructParser.parseControl(ctx, keyword, keywordSpan)` con el
lexer situado justo tras el keyword. **SDD-06 es esa implementación.** Parsea la cabecera
`( … )`, el cuerpo `{ html_content* }`, las cadenas `else`/`else if` y los `case`/`default`
del `switch`, y devuelve un `ControlNode` que SDD-05 aloja como hijo.

Cuatro rasgos lo definen:

1. **Posee la puntuación estructural del `@`, no el JS.** SDD-06 reconoce `(`, `)`, `{`, `}`,
   `else`, `case`, `default`, `:` — la **gramática Razor**. El contenido de las cabeceras
   (`data.items.length === 0`, `const item of data.items`) es **JS opaco**: se delimita con
   el balanceador (SDD-02) y lo valida **Oxc** (SDD-11). SDD-06 nunca parsea JS.

2. **Recursión mutua con SDD-05 por el seam.** El cuerpo `{ … }` es **contenido HTML**, que
   puede contener más elementos, interpolaciones y construcciones `@` anidadas. SDD-06 lo
   rellena llamando de vuelta a `ctx.parseContentUntil(stop)`. Así `@if` dentro de `@foreach`
   dentro de `<p>` funciona sin que SDD-06 reimplemente el parser HTML ni SDD-05 conozca el
   control de flujo. El grafo se mantiene acíclico (05 define el seam; 06 lo usa).

3. **El parser nunca lanza.** Cabecera sin `(`, bloque sin `}`, `else` huérfano o EOF a media
   construcción se modelan como `Diagnostic` + nodo degradado. La forma es
   `ParseResult<ControlNode>`.

4. **`@switch` sin fall-through (decisión 14).** Cada `case` construye su propio cuerpo
   independiente; la ausencia de fall-through es **estructural** (SDD-06 no encadena cuerpos),
   no una comprobación posterior.

SDD-06 **no** posee: `@code`/`@server`/`@client` (decisiones 32–34 → **SDD-08**), la
interpolación y los bindings del contenido (decisiones 18–31 → **SDD-07**, que consume el
árbol), la validación del JS de cabeceras y de `@{ … }` (**Oxc**, SDD-11), ni las reglas
semánticas sobre bucles (`ref` en bucle, decisión 31 → **SDD-12**).

**Repo limpio.** Reparto de cabecera/cuerpo y cadena `else` escritos desde cero; del prototipo
solo la *idea* del alternado de modos HTML↔JS por transición.

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | Monorepo pnpm, TS 5.9 estricto, Vitest 4.1, fixtures `.fud`. |
| 01 | `Hecho` | `Span`/`span`/`mergeSpans`, `Diagnostic`/`errorDiag`, `ParseResult`/`ok`/`withDiagnostics`, `Node`. *(vía 04/05)* |
| 02 | `Hecho` | `BalancedGroup`, `scanParens` — para delimitar la cabecera `( … )` opaca. |
| 04 | `Hecho` | `ControlKeyword` (`'if'|'else'|'for'|'foreach'|'while'|'switch'`). |
| 05 | `Hecho` | `HtmlContent`, `HtmlParseContext` (`source`, `lexer`, `parseContentUntil`), `RazorConstruct`, `AtConstructParser`. |

```ts
import { type Node, type Span, span, mergeSpans } from '../types/index.js';
import { type Diagnostic, errorDiag } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
import { type BalancedGroup, scanParens } from '../balancer/index.js';
import { type ControlKeyword } from '../at/index.js';
import { type HtmlContent, type HtmlParseContext, type RazorConstruct } from '../html/index.js';
```

> **Contrato con el seam de SDD-05 (§3.5 de SDD-05).** `parseContentUntil(stop)` parsea
> contenido HTML y se detiene, **sin consumir**, cuando `stop` casa con el siguiente límite.
> SDD-06 depende de que SDD-05 **haga significativo el `}` de cierre de bloque** (y, en
> `switch`, los keywords `case`/`default`) dentro de un cuerpo de control: son las únicas
> marcas que SDD-06 necesita reconocer para cerrar cada nivel. Es la lectura prevista del
> seam de SDD-05, que ya anticipa "`}` que cierra un html_block" como límite. Ver §4.6 y §4.8.1.

> **Nota TS estricto.** SDD-06 indexa `source` por offset para saltar whitespace/comentarios
> y localizar `(`/`{`/`}`/`else`; `source[i]` es `string | undefined` (fuera de rango = EOF).
> Con `exactOptionalPropertyTypes`, `IfNode.elseBody` y `SwitchCase.test` **se omiten** cuando
> no aplican; nunca se asignan `undefined`.

---

## 3. Interfaz pública

Ubicación canónica: `packages/compiler/src/control/` (`nodes.ts`, `control.ts`, reexportados
desde `control/index.ts`). Todo en inglés.

### 3.1. Nodos de control

```ts
/** Every control construct SDD-06 produces. Assignable to SDD-05's RazorConstruct. */
export type ControlNode = IfNode | ForeachNode | ForNode | WhileNode | SwitchNode;

/**
 * A parenthesized control header `( … )`: opaque JS delimited by the balancer, validated by
 * Oxc (SDD-11). `.inner` is the JS span handed to Oxc; `.regions` are its lexical regions.
 * Used as the condition of `@if`/`@while`, the discriminant of `@switch`, and the for/for-of
 * header of `@for`/`@foreach` (whose for-of vs C-style shape is checked semantically, §4.4).
 */
export type ControlHeader = BalancedGroup;

/** `@if (…) { … } (else if (…) { … })* (else { … })?` — decisions 9, 10. */
export interface IfNode extends Node {
  readonly type: 'if';
  /** [0] is the `if`; [1..] are `else if` branches, in source order. Always ≥ 1. */
  readonly branches: readonly ConditionalBranch[];
  /** Trailing `else` body, when present. Absent ⇒ no final else. */
  readonly elseBody?: readonly HtmlContent[];
}

/** One `if` / `else if` arm: condition + block body. */
export interface ConditionalBranch {
  readonly header: ControlHeader;
  readonly body: readonly HtmlContent[];
  /** Whole arm span (`if`/`else if` keyword through its closing `}`). */
  readonly span: Span;
}

/** `@foreach (const x of xs) { … }` — declarative for-of iteration (decision 11). */
export interface ForeachNode extends Node {
  readonly type: 'foreach';
  readonly header: ControlHeader;
  readonly body: readonly HtmlContent[];
}

/** `@for (let i = 0; i < n; i++) { … }` — C-style indexed iteration (decision 11). */
export interface ForNode extends Node {
  readonly type: 'for';
  readonly header: ControlHeader;
  readonly body: readonly HtmlContent[];
}

/** `@while (cond) { … }`. */
export interface WhileNode extends Node {
  readonly type: 'while';
  readonly header: ControlHeader;
  readonly body: readonly HtmlContent[];
}

/** `@switch (expr) { case …: … default: … }` — no fall-through (decision 14). */
export interface SwitchNode extends Node {
  readonly type: 'switch';
  readonly header: ControlHeader;
  readonly cases: readonly SwitchCase[];
}

/** A `case <expr>:` (arbitrary expression, decision 15) or `default:`. Independent body. */
export interface SwitchCase extends Node {
  readonly type: 'switch-case';
  /** The `case` test: opaque JS up to the label `:`. Absent ⇒ this is the `default` case. */
  readonly test?: Span;
  readonly body: readonly HtmlContent[];
}
```

### 3.2. Punto de entrada (implementa `AtConstructParser.parseControl`)

```ts
/**
 * Parse a control-flow construct. `keyword` is the resolved control keyword (SDD-04),
 * `keywordSpan` locates it, and `ctx.lexer` sits right after `keywordSpan.end`. Reads the
 * header via the balancer and the body via `ctx.parseContentUntil`, recursing into HTML.
 * Never throws; leaves the lexer just past the construct's closing `}`.
 *
 * Signature-compatible with SDD-05's `AtConstructParser.parseControl`, so the pipeline can
 * inject `{ parseControl, parseCodeBlock }` (parseCodeBlock is SDD-08's).
 */
export function parseControl(
  ctx: HtmlParseContext,
  keyword: ControlKeyword,
  keywordSpan: Span,
): ParseResult<ControlNode>;
```

---

## 4. Comportamiento

### 4.1. Esquema común: cabecera + bloque

Salvo `@else` (que no lleva cabecera propia si es el final), todo keyword sigue el patrón
`AT keyword WS* ( header ) WS* { html_block }`:

1. **Cabecera.** Desde `keywordSpan.end`, saltar `WS*` a nivel de offset. El siguiente
   carácter debe ser `(` → `FUD0070` si no. Llamar a `scanParens(source, offsetDe'(')`; el
   `BalancedGroup` resultante es el `header` (JS opaco). Si no cierra, el balanceador emite
   `FUD0002` (burbujea) y la construcción degrada. `seekTo(header.span.end)`.
2. **Bloque.** Saltar `WS*`; el siguiente carácter debe ser `{` → `FUD0071` si no.
   `seekTo` tras el `{` y parsear el cuerpo con `ctx.parseContentUntil(stop)` (§4.6). Tras el
   cuerpo, consumir el `}` de cierre; si falta antes de EOF → `FUD0072`. `seekTo` tras el `}`.

`@while`, `@for`, `@foreach` son exactamente este patrón, cambiando solo el `type` del nodo y
la naturaleza JS de la cabecera (§4.4). El `span` del nodo cubre `@keyword … }`.

### 4.2. `@if` / `else` / `else if` (decisiones 9, 10)

`@if` parsea su primera `ConditionalBranch` (cabecera + bloque, §4.1). Luego, en bucle:

- Saltar, a nivel de offset, **whitespace y comentarios `@* … *@`** (decisión 10: ambos
  permitidos entre `}` y `else`).
- Buscar `else`. **Se acepta con y sin `@`** (decisión 9): tanto `@else` (que llega como
  `at-trigger` → `resolveTrigger` → `keyword: 'else'`) como el literal `else`. SDD-06 lo
  reconoce a nivel de offset tras el `}`.
  - Si tras `else` viene `if`/`@if` + `(` → otra `ConditionalBranch` (else-if); continúa el
    bucle.
  - Si tras `else` viene `{` → `elseBody` (bloque final); termina.
- Si no hay `else` → la construcción termina; `elseBody` se omite.

El `else` **no** genera nodo propio: se pliega en `branches` (los else-if) y `elseBody` (el
else final). Un `else`/`@else` sin `@if` previo lo detecta SDD-05 al resolver el trigger:
`parseControl` con `keyword: 'else'` en posición inicial ⇒ `FUD0073` y nodo `if` degradado
(sin branches), porque un `else` suelto no abre construcción.

### 4.3. `@switch` (decisiones 14, 15)

`@switch (expr) {` como en §4.1 hasta el `{`. Dentro, en bucle hasta el `}` de cierre:

- Saltar whitespace/comentarios. Antes del primer `case`/`default`, cualquier **otro
  contenido** es error → `FUD0074` (se emite y se descarta hasta el siguiente boundary): un
  `switch` solo contiene casos.
- **`case`** → tras `WS+`, delimitar el **test**: JS opaco hasta el `:` de etiqueta a nivel
  0 (§4.5). Falta `:` → `FUD0075`. El cuerpo es `html_content*` hasta el siguiente
  `case`/`default`/`}` (decisión 14: sin fall-through, cuerpos independientes).
- **`default`** → tras `WS*`, un `:` (`FUD0075` si falta), luego cuerpo igual. `test` se omite.
- **`}`** → fin del `switch`.

Los cuerpos de `case`/`default` **no van entre llaves** (grammar §6): son runs de contenido
delimitados por los keywords `case`/`default` y el `}` final (§4.6).

### 4.4. `for` vs `foreach`, y qué NO valida SDD-06 (decisiones 11, 12, 13)

- `@foreach` (decisión 11) espera cabecera **for-of** (`const item of data.items`); `@for`
  espera cabecera **C-style** (`let i = 0; i < n; i++`). SDD-06 solo **registra el keyword**;
  la cabecera se guarda opaca.
- La cabecera es **JS opaco para Oxc**. Validar que un `@foreach` es realmente `for…of` y
  **no `for…in`** (decisión 12), o que no hay `@break`/`@continue` fuera de sitio (decisión
  13), exige el AST JS: es **semántico** (Oxc/SDD-11 + SDD-12), no sintáctico aquí. SDD-06 no
  mira dentro de la cabecera. *(La gramática dice "a nivel de sintaxis Razor", pero en esta
  arquitectura todo JS se delega a Oxc; ver §4.8.2.)*
- `@{ … }` (código inline, decisiones 16, 17) **no** es de SDD-06: el lexer lo dio como
  `inline-code` y SDD-05 lo alojó como `InlineCodeNode` hoja. Su JS lo valida Oxc.

### 4.5. Delimitación del test de `case` (decisión 15)

El test admite **cualquier expresión** y termina en `:`. Un escaneo ingenuo fallaría con
ternarios (`a ? b : c`), tipos (`x as T`) u objetos. SDD-06 escanea desde el inicio del test
hasta el **primer `:` en profundidad 0**, contando como el balanceador (SDD-02): paréntesis
`()`, corchetes `[]`, llaves `{}`, strings, templates, regex y comentarios; **más** un
contador de ternarios (`?` incrementa, `:` decrementa antes de considerarlo etiqueta). El `:`
etiqueta es el primero con profundidad de delimitadores 0 y de ternario 0. `test` = el span
del JS entre `case` y ese `:` (a Oxc). Sin `:` antes de `}`/EOF → `FUD0075`.

### 4.6. La frontera del `html_block` (recursión con SDD-05)

El cuerpo se rellena con `ctx.parseContentUntil(stop)`, donde `stop` reconoce el límite:

- **Bloques `{ … }`** (`if`/`for`/`foreach`/`while` y else): `stop` = el `}` de cierre de
  **este** bloque. Las construcciones anidadas consumen sus propias llaves recursivamente
  (cada `parseControl` anidado cierra su `}`), así que dentro del contenido directo de un
  bloque el único `}` significativo es su propio cierre.
- **Cuerpos de `case`/`default`**: `stop` = el siguiente `case`, `default` o el `}` del
  `switch`.

Para que `stop` sea decidible, SDD-05 hace **significativo el `}`** (y, en switch, los
keywords `case`/`default`) dentro de un cuerpo de control: rompen el run de texto y afloran
como límite inspeccionable (§2). Un `{`/`}` **literal** en texto de markup se escribe con
**entidad HTML** (`&#123;` / `&#125;`), coherente con la decisión 49 (entities pass-through);
así nunca se confunde con un cierre de bloque. Ver §4.8.1.

### 4.7. Códigos `FUD`

SDD-06 reserva el rango **`FUD0070`–`FUD0089`** (01: `FUD0001`; 02: `0002`–`0009`; 03:
`0010`–`0029`; 04: `0030`–`0049`, reservado; 05: `0050`–`0069`). Definidos:

| Código | Significado |
|---|---|
| `FUD0070` | Falta `(` tras el keyword de control (`@if`, `@while`, …). |
| `FUD0071` | Falta `{` para abrir el cuerpo del bloque. |
| `FUD0072` | Bloque sin cerrar (`}` ausente antes de EOF o del cierre del padre). |
| `FUD0073` | `else`/`@else` sin un `@if` previo. |
| `FUD0074` | Contenido antes del primer `case`/`default` en `@switch` (solo whitespace/comentarios). |
| `FUD0075` | Etiqueta `case`/`default` sin `:`. |

`FUD0076`–`FUD0089` quedan libres. Los diagnósticos del balanceador (`FUD0002`, cabecera sin
cerrar) y de SDD-05 (contenido) **afloran** por el `ParseResult` sin renumerarse.

### 4.8. Decisiones cerradas

1. **Cierre de bloque por `}` crudo; llave literal con entidad (cerrado con Pedro).** El `}`
   de cierre siempre cierra el bloque; una llave literal en markup se escribe `&#123;`/`&#125;`
   (decisión 49). No hay ambigüedad porque no hay `}` literal suelto. **Consecuencia mecánica
   (no es decisión):** SDD-05/03 deben hacer que un `}` crudo corte el run de texto dentro de
   un cuerpo de control (y, en switch, los keywords `case`/`default`), para que afloren como
   límite en `parseContentUntil`. Fuera de un bloque Razor, `}` sigue siendo texto normal.

2. **Test de `case` cortado en el `:` a nivel 0 (cerrado con Pedro).** Se cuenta profundidad
   de delimitadores y de ternario (`?` sube, `:` baja); el `:` etiqueta es el primero a nivel
   0/0 (§4.5). No se exige paréntesis en el test.

3. **Enforcement de decisiones 11–13 en semántica, no aquí.** `for…in` rechazado (12) y la
   forma for-of vs C-style (11) requieren el AST JS de Oxc; `@break`/`@continue` (13) viven en
   `@{ }`. SDD-06 delega su validación a SDD-11/12 y solo conserva el keyword. Coherente con
   SDD-04 (la validez del JS la juzga Oxc); **matiza la letra** de la gramática ("a nivel de
   sintaxis Razor") — reflejar en `gramatica-v1-decisiones.md`.

4. **El `else` no es nodo.** Se pliega en `IfNode.branches`/`elseBody`.

---

## 5. Invariantes LSP

- **Spans en todo.** Cada `ControlNode` (`.span`), cada `ConditionalBranch`/`SwitchCase`
  (`.span`), cada `header` (`BalancedGroup.span`/`.inner`) y cada `Diagnostic` llevan offset
  UTF-16. El cuerpo son nodos `HtmlContent` de SDD-05, ya con span. Cobertura sin huecos.
- **Nunca lanza.** Falta de `(`/`{`/`}`, `else` huérfano, `case` sin `:` y EOF a media
  construcción se modelan como resultados degradados + diagnósticos (los de SDD-02/05
  burbujean), nunca como excepción. El cursor siempre progresa.
- **Navegabilidad por offset.** SDD-06 conduce el mismo `Lexer` reanudable (`seekTo`) y
  recursa vía `ctx.parseContentUntil`. Nodos inmutables (`readonly`): forma apta para
  reparseo incremental.
- **DIP.** SDD-06 implementa la abstracción `AtConstructParser.parseControl` de SDD-05; no la
  importa al revés. Grafo acíclico.

---

## 6. Criterios de aceptación

Entradas reales (fixtures) → árbol esperado. Los tests inyectan un `HtmlParseContext` real de
SDD-05 (con `parseControl` de SDD-06 cableado). El SDD está `Hecho` cuando:

1. **Typecheck.** `pnpm typecheck` pasa con §3 definido y reexportado desde `control/index.ts`.

2. **`@if` simple.** `@if (data.items.length === 0) { <p>Vacío</p> }` ⇒ `IfNode`, una
   `ConditionalBranch` con `header.inner` = `data.items.length === 0` y `body` = `[<p>]`, sin
   `elseBody`. `span` cubre desde `@if` hasta el `}`.

3. **`@if … else`.** `@if (expanded.value) { "Cerrar" } else { "Abrir" }` ⇒ una branch +
   `elseBody` = `["Abrir"]` (texto literal). Whitespace entre `}` y `else` tolerado (decisión
   10).

4. **`else if` encadenado (decisión 9).** `@if (a) { … } else if (b) { … } else { … }` ⇒
   `branches.length === 2` (`a`, `b`) + `elseBody`. Acepta también `@else`/`@else @if`.

5. **`@foreach` (decisión 11).** `@foreach (const item of data.items) { <app-card title="@item.title">@item.description</app-card> }`
   ⇒ `ForeachNode`, `header.inner` = `const item of data.items`, `body` con un `ElementNode`
   `app-card` cuyo atributo y contenido son `RazorExpression` (resueltos por SDD-05/04).

6. **`@for` y `@while`.** `@for (let i = 0; i < n; i++) { … }` ⇒ `ForNode`.
   `@while (cond) { … }` ⇒ `WhileNode`. Cabecera opaca en ambos.

7. **`@switch` (decisiones 14, 15).** `@switch (variant) { case 'highlight': <b>H</b> default: <span>D</span> }`
   ⇒ `SwitchNode` con dos `SwitchCase`: la primera `test` = `'highlight'` y `body` = `[<b>]`;
   la segunda sin `test` (default) y `body` = `[<span>]`. Sin fall-through (cuerpos separados).

8. **Test de `case` con ternario/`:` interno (§4.5).** `case cond ? 'a' : 'b':` ⇒ `test` =
   `cond ? 'a' : 'b'` (el `:` del ternario **no** cierra la etiqueta; sí el segundo).

9. **Anidamiento.** `@foreach (const x of xs) { @if (x.active) { <li>@x.name</li> } }` ⇒
   `ForeachNode` cuyo `body` contiene un `IfNode` cuyo `body` contiene el `<li>`. La recursión
   por `ctx.parseContentUntil` cierra cada `}` en su nivel.

10. **Llave literal vía entidad (§4.6).** `@if (a) { <p>&#123;x&#125;</p> }` ⇒ `body` = `[<p>]`
    con texto `&#123;x&#125;` (verbatim, decisión 49); el `}` real cierra el bloque.

11. **Degradaciones (nunca lanza).**
    - `@if data.x { … }` (sin `(`) ⇒ `FUD0070`, nodo degradado.
    - `@if (a) <p>…` (sin `{`) ⇒ `FUD0071`.
    - `@if (a) { <p>` en EOF ⇒ `FUD0072` (bloque sin cerrar).
    - `@if (a + b { … }` (cabecera sin cerrar) ⇒ `FUD0002` del balanceador aflora.
    - `else { … }` sin `@if` previo ⇒ `FUD0073`.
    - `@switch (x) { case 1 <b/> }` (sin `:`) ⇒ `FUD0075`.

12. **Cobertura.** El módulo se acerca al 100 % de líneas/funciones/ramas (los casos cubren
    cada branch del dispatch, la cadena else, el switch y las degradaciones). Cumple el suelo
    del SDD-00 (80/80/75).

---

## 7. Fuera de alcance

- **`@code` y regiones `@server`/`@client`** (decisiones 32–34, 63–66): **SDD-08**, que
  implementa `AtConstructParser.parseCodeBlock`. SDD-06 solo el control de flujo.
- **Interpolación y bindings del contenido** (escape, `@raw`, event/property/`ref`/`class:`/
  `style:`, primitivas: decisiones 18–31): **SDD-07**, que consume los `HtmlContent` de los
  cuerpos. SDD-06 no interpreta el contenido; lo delega a SDD-05.
- **Validación del JS.** Cabeceras (`( … )`), tests de `case` y `@{ … }` son spans opacos; su
  parsing y corrección —incluido `for…in` rechazado (12), for-of vs C-style (11)— los hace
  **Oxc (SDD-11)** y la **semántica (SDD-12)**.
- **`ref` dentro de bucle → error** (decisión 31) y demás reglas sobre bucles: **SDD-12**.
- **`@{ … }` inline** (decisiones 16, 17): el nodo lo produce **SDD-05** (`InlineCodeNode`);
  su JS lo valida Oxc. SDD-06 no lo toca.
- **Significancia léxica de `}`/`case`/`default`** en el cuerpo: la aporta el seam de
  **SDD-05/03** (§2, §4.8.1). SDD-06 solo la consume.
- **`LineMap` / línea-columna:** **SDD-13**. Aquí todo es offset.
