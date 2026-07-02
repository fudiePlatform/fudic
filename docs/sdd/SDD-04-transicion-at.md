# SDD-04 — Reglas de transición del `@`

> **Estado:** `Listo`
> **Depende de:** 00, 01, 02, 03
> **Decisiones de gramática:** 1–8

---

## 1. Contexto y objetivo

El `@` es el único disparador de sintaxis Razor dentro del HTML. SDD-03 ya resolvió, a
nivel léxico, los casos determinables por *lookahead/lookbehind* de un carácter:

- `@@` → token `at-escape` (decisión 1).
- `@* ... *@` → token `razor-comment`.
- `@( ... )` → token `explicit-expr` (con su `BalancedGroup`).
- `@{ ... }` → token `inline-code`.
- `@` precedido de identificador → literal (email, decisión 7).

Y dejó **deliberadamente sin resolver** el caso `@` + identificador, emitiéndolo como un
token `at-trigger` (cuyo span es solo el `@`). **SDD-04 es quien resuelve ese
`at-trigger`**, que es exactamente el punto donde el `@` deja de ser léxico y necesita
gramática. Dos salidas posibles:

1. **Keyword de control / `@code`** (`@if`, `@foreach`, `@for`, `@while`, `@switch`,
   `@else`, `@code`): SDD-04 **reconoce el keyword** y despacha a la capa que parsea el
   cuerpo (SDD-06 para control de flujo, SDD-08 para `@code`). SDD-04 **no** parsea el
   bloque; solo clasifica y localiza el keyword.

2. **Expresión implícita** (`@foo`, `@data.title`, `@data.items.length`): un **camino de
   propiedades** y nada más. SDD-04 **calcula la frontera** aplicando las decisiones 2–5 y
   produce un nodo `RazorExpression`. Cualquier cosa que no sea `identificador('.'ident)*`
   (`?.`, llamadas, índices, `!`, genéricos) se escribe con la forma explícita `@(...)`.

Además, SDD-04 define el **nodo unificado `RazorExpression`** (implícita *y* explícita):
ambas formas son lo mismo aguas abajo —una expresión JS con su span— y SDD-07
(interpolación y bindings) las consume sin distinguir su origen.

SDD-04 **no** valida el JS (eso es Oxc, SDD-11), **no** parsea control de flujo ni
`@code` (SDD-06/08), y **no** decide cómo se *usa* la expresión en HTML —escape,
atributos, eventos— (SDD-07).

**Repo limpio.** Algoritmo de frontera escrito desde cero; del prototipo solo la *idea*
del dispatch por carácter siguiente al `@`.

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | Entorno, TS estricto, fixtures. |
| 01 | `Hecho` | `Span`/`span`/`mergeSpans`, `Diagnostic`, `ParseResult`, `Node`. |
| 02 | `Hecho` | Tipos `BalancedGroup` y `LexRegion` (para envolver `@(...)`). SDD-04 ya **no** invoca al balanceador: la implícita es solo un camino de propiedades. |
| 03 | `Hecho` | `Lexer` (token `at-trigger`, `explicit-expr`, `seekTo`), `JsRegionToken`. |

```ts
import { type Span, span, mergeSpans } from '../types/index.js';
import { type Diagnostic } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
import { type Node } from '../types/index.js';
import { type BalancedGroup, type LexRegion } from '../balancer/index.js';
import { type JsRegionToken } from '../lexer/index.js';
```

> **Nota TS estricto.** El scanner de implícitas indexa `source` por offset; cada
> `source[i]` es `string | undefined`. Un índice fuera de rango es fin de la expresión, no
> un bug.

---

## 3. Interfaz pública

Ubicación canónica: `packages/compiler/src/at/` (`at.ts`, reexportado desde
`at/index.ts`). Todo en inglés.

### 3.1. Nodo de expresión Razor (unificado)

```ts
/** explicit = @( ... ); implicit = @foo.bar(x). Same node downstream (SDD-07). */
export type RazorExpressionKind = 'explicit' | 'implicit';

/**
 * A resolved Razor expression atom: a JS expression located in the source, opaque
 * until Oxc validates it (SDD-11). Produced by SDD-04 from an `at-trigger` (implicit)
 * or wrapping an `explicit-expr` token (explicit).
 */
export interface RazorExpression extends Node {
  readonly type: 'razor-expression';
  readonly kind: RazorExpressionKind;
  /** Whole atom span, leading `@` included: `@data.title` / `@(expr)`. */
  readonly span: Span;
  /** The JS expression only (no `@`, no outer `()`): what is handed to Oxc. */
  readonly expr: Span;
  /**
   * Lexical regions inside `expr` (from the balancer): strings, templates, comments,
   * regex. Always empty for implicit expressions (a plain property path has none); only
   * the explicit form `@( ... )` contributes regions.
   */
  readonly regions: readonly LexRegion[];
}
```

### 3.2. Keywords de control y clasificación

```ts
/** Control keywords recognized after `@`. Body grammar belongs to SDD-06. */
export type ControlKeyword = 'if' | 'else' | 'for' | 'foreach' | 'while' | 'switch';

/**
 * What an `at-trigger` (`@` + identifier) resolves to.
 *  - 'control'    → SDD-06 parses the construct body.
 *  - 'code-block' → @code; SDD-08 parses it.
 *  - 'implicit'   → an implicit expression, fully resolved here.
 */
export type TriggerResolution =
  | { readonly kind: 'control'; readonly keyword: ControlKeyword; readonly keywordSpan: Span }
  | { readonly kind: 'code-block'; readonly keywordSpan: Span }
  | { readonly kind: 'implicit'; readonly expression: RazorExpression };

/**
 * Classify the identifier that follows `@`. Returns the control/code keyword, or
 * null when it is not a reserved Razor keyword (⇒ the trigger is an implicit
 * expression). Pure lookup over the closed keyword set.
 */
export function classifyKeyword(identifier: string): ControlKeyword | 'code' | null;
```

### 3.3. Resolución del disparador y scanner de implícitas

```ts
/**
 * Resolve an `at-trigger`. `atOffset` points at the `@`; the char at atOffset+1 is
 * an identifier-start (guaranteed by the tokenizer, SDD-03). Reads the identifier,
 * dispatches control/code keywords, or scans the implicit expression. Never throws.
 * The caller advances the lexer with `lexer.seekTo(result.value...end)`.
 */
export function resolveTrigger(source: string, atOffset: number): ParseResult<TriggerResolution>;

/**
 * Scan an implicit expression starting at `atOffset` (`@` included). An implicit
 * expression is ONLY a property path: identifier ('.' identifier)*. It stops —
 * silently — at anything else: a trailing `.` with no identifier (decision 2), `?.`,
 * `(`, `[`, `!` (decision 4), `<` (decision 5), whitespace or any operator. Everything
 * beyond a plain path is written with the explicit form `@( ... )`.
 */
export function scanImplicitExpression(source: string, atOffset: number): ParseResult<RazorExpression>;

/** Wrap an `explicit-expr` token (`@( ... )`) into the unified RazorExpression. */
export function expressionFromToken(token: JsRegionToken): RazorExpression;
```

---

## 4. Comportamiento

### 4.1. Reparto del `at_construct` (recordatorio de capas)

La gramática (sección 1–5) lista seis casos tras `@`. Quién resuelve cada uno:

| Caso | Resuelto en |
|---|---|
| `@@` (decisión 1) | SDD-03 (`at-escape`) |
| `@* ... *@` | SDD-03 (`razor-comment`) |
| `@{ js }` | SDD-03 (`inline-code`) |
| `@( expr )` | SDD-03 tokeniza; **SDD-04** lo envuelve en `RazorExpression` |
| `@ keyword ...` | **SDD-04** clasifica; cuerpo en SDD-06/08 |
| `@ implicit` | **SDD-04** (scanner de frontera) |

### 4.2. Clasificación del keyword

Leído el identificador tras `@`, `classifyKeyword` consulta el conjunto **cerrado**:

- `if`, `else`, `for`, `foreach`, `while`, `switch` → `ControlKeyword` ⇒ `kind: 'control'`.
- `code` → `kind: 'code-block'`.
- cualquier otro identificador ⇒ **no** es keyword ⇒ expresión implícita.

No hay keyword "casi reservada": `@return`, `@await`, etc. son expresiones implícitas a
ojos de SDD-04 (su validez la juzga Oxc). El conjunto es el de las decisiones 9–17 y 32.

### 4.3. Frontera de la expresión implícita (decisiones 2–5)

Partiendo del identificador en `atOffset+1`, una expresión implícita es **solo un camino
de propiedades** y se avanza **sin cruzar whitespace**:

```
implicit
  : identifier ('.' identifier)*
```

Cualquier otra cosa **termina** la expresión (parada **silenciosa**: lo que sigue es texto
literal o HTML). En particular:

- **Punto final sin identificador (decisión 2).** `@foo.` ⇒ `@foo` y el `.` queda fuera.
  `@data.title.` ⇒ `@data.title` + `.`. Por eso "Hola @name." funciona.
- **`?.`, llamadas `( ... )` e índices `[ ... ]` → forma explícita.** No forman parte de la
  implícita; se escriben `@(user?.name)`, `@(items.filter(p))`, `@(items[0])`. (La
  decisión 3, que permitía `?.` en implícita, queda **revisada con Pedro**: el `?.` pasa a
  explícita junto con `!` y `<>`.)
- **`!` (decisión 4) y `<` (decisión 5) → forma explícita.** `@(user!.name)`,
  `@(load<T>())`. La implícita corta antes de `!`/`<`, así "Hola @name!" da `name` + `!`.
- Whitespace, operadores, `,`, `;`, EOF… terminan la expresión.

El nodo resultante: `span` cubre `@` + la expresión; `expr` cubre solo el camino (a Oxc);
`regions` queda **vacío** (una implícita no contiene regiones léxicas). Solo la forma
explícita aporta `regions`, vía el `BalancedGroup` del token.

### 4.4. `@(...)` explícita

`expressionFromToken` envuelve el token `explicit-expr` de SDD-03: `span` = el token
completo (`@( ... )`), `expr` = `group.inner`, `regions` = `group.regions`. No se
re-escanea: se reusa el `BalancedGroup` ya calculado por el balanceador.

### 4.5. Decisiones cerradas y punto abierto

1. **Implícita = solo camino de propiedades (cerrado con Pedro).** Ni `?.`, ni llamadas,
   ni índices, ni `!`, ni genéricos en la implícita: todo eso se escribe con `@( ... )`. Es
   la regla más simple y cubre el 100 % de los fixtures (todas sus implícitas son
   `@nombre` / `@a.b.c`). Esto **revisa la decisión 3** del documento de gramática (que
   permitía `?.` en implícita); conviene reflejar ese cambio en
   `gramatica-v1-decisiones.md`.

2. **Paradas silenciosas sin diagnóstico (decisiones 2, 4, 5).** No se avisa al cortar ante
   `.` / `?` / `!` / `<`, porque el caso dominante es puntuación literal (`@name.`,
   `@name?`, `@name!`) y un diagnóstico daría falsos positivos. La guía "usa `@()`" vive en
   la doc, no en el compilador.

3. **(Abierto) Propiedad del nodo `RazorExpression`.** Lo defino aquí (SDD-04), no en
   SDD-07, porque es la salida natural de resolver el `@`; SDD-07 lo envolverá en su
   `Interpolation` / binding. Si lo prefieres en SDD-07, lo movemos y SDD-04 devolvería
   solo spans.

### 4.6. Decisión 8 — `@` en atributos exige comillas

`href=@url` es error; `href="@url"` correcto. La **detección** vive en la gramática de
atributos (SDD-05, que ya exige comillas por la decisión 38): un valor de atributo sin
comillas que contenga `@` no llega siquiera a abrir contexto de valor en el tokenizer.
SDD-04 solo fija el **principio**: el `@` es disparador Razor en posición de contenido o
de valor entrecomillado; nunca como valor de atributo desnudo. La enforcement concreta y
su diagnóstico se reservan a SDD-05.

### 4.7. Códigos `FUD`

SDD-04 reserva el rango **`FUD0030`–`FUD0049`**. En v1 **no define ningún código nuevo**:
las reglas de frontera son paradas silenciosas (§4.3), la validez de la expresión la juzga
Oxc (SDD-11), y la enforcement de la decisión 8 vive en SDD-05. Los diagnósticos del
balanceador (`FUD0002`…) afloran sin renumerar cuando una llamada/índice implícito o un
`@(...)` quedan sin cerrar. El rango queda **reservado** para los errores de despacho de
SDD-06/08 (estructura de control mal formada, `@code` duplicado, etc.).

---

## 5. Invariantes LSP

- **Spans en todo.** `RazorExpression.span`, `.expr`, cada `LexRegion`, `keywordSpan` y
  todo `Diagnostic` llevan offset UTF-16. `span` incluye el `@`; `expr` no.
- **Nunca lanza.** Disparador inválido, expresión truncada por EOF y balanceador sin
  cerrar se modelan como resultados degradados + diagnósticos (bubbled), nunca como
  excepciones.
- **Navegabilidad por offset.** Las funciones reciben `source` + offset y devuelven spans
  consultables; el caller reanuda el `Lexer` con `seekTo(end)`. Forma pura, sin estado
  global → apta para reparseo incremental.

---

## 6. Criterios de aceptación

Entradas reales (fixtures) → resolución esperada. El SDD está `Hecho` cuando:

1. **Typecheck.** `pnpm typecheck` pasa con §3 definido y reexportado.

2. **Implícita simple.** `@title` ⇒ `kind: 'implicit'`, `expr` = `title`, `span` cubre
   `@title`.

3. **Cadena de miembros.** `@data.title` ⇒ implícita, `expr` = `data.title`.
   `@data.items.length` ⇒ `expr` = `data.items.length`.

4. **`?.`, llamadas e índices → explícita.** `@(user?.name)`,
   `@(items.filter(p => p.active))`, `@(items[0].title)` ⇒ `kind: 'explicit'`. En posición
   implícita, `@user?.name` ⇒ `expr` = `user` y `?.name` queda como texto.

5. **`regions` vacío en implícita.** `@data.items.length` ⇒ implícita, `regions: []`. Solo
   `@(...)` aporta regiones.

6. **Parada en cualquier no-identificador.** `@a.b(c)` ⇒ implícita `a.b`; `(c)` queda fuera
   (texto/HTML). `@items[0]` ⇒ implícita `items`; `[0]` queda fuera.

7. **Punto final (decisión 2).** `@foo.` ⇒ `expr` = `foo` (el `.` queda fuera).
   En `<h2>Hola @name.</h2>`, `@name` es la expresión y `.` es texto.

8. **Parada ante `!` (decisión 4).** `@name!` ⇒ `expr` = `name`; el `!` no se consume.

9. **Parada ante `<` (decisión 5).** `@count<10` ⇒ `expr` = `count`; el `<` arranca HTML.

10. **Explícita.** `@(variant === 'highlight')` ⇒ `expressionFromToken` produce
    `kind: 'explicit'`, `expr` = `variant === 'highlight'`, reusando el `BalancedGroup`.

11. **Keywords de control.** `@if (data.items.length === 0)` ⇒ `kind: 'control'`,
    `keyword: 'if'`. `@foreach (const item of data.items)` ⇒ `keyword: 'foreach'`.
    `@code { ... }` ⇒ `kind: 'code-block'`. (El cuerpo NO se parsea aquí.)

12. **Email recap (decisión 7).** `soporte@fudic.dev` en texto **no** llega a SDD-04 (el
    tokenizer lo dio como `text`): no hay `at-trigger`, no hay resolución.

13. **Cobertura.** El módulo se acerca al 100 % de líneas/funciones/ramas; los casos de
    arriba cubren las ramas del scanner. Cumple el suelo del SDD-00 (80/80/75).

---

## 7. Fuera de alcance

- **Estructura de control de flujo.** El cuerpo de `@if`/`@foreach`/`@for`/`@while`/
  `@switch`, el `else` (decisiones 9–17), los `html_block`: **SDD-06**. SDD-04 solo
  clasifica el keyword.
- **`@code` y sus regiones** `@server`/`@client` (decisiones 32–34): **SDD-08**.
- **Uso de la expresión en HTML.** Escape automático, `@raw`, atributos, property/event
  binding, `ref`, `class:`/`style:` (decisiones 18–31): **SDD-07**, que consume el
  `RazorExpression`.
- **Validación del JS.** El parsing y la corrección de `expr` los hace Oxc en **SDD-11**;
  SDD-04 solo delimita.
- **Enforcement de la decisión 8** (comillas obligatorias) y demás gramática de atributos:
  **SDD-05**.
- **`LineMap` / línea-columna:** **SDD-13**.
