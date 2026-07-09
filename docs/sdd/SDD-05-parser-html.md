# SDD-05 — Parser HTML (subset estricto)

> **Estado:** `Listo`
> **Depende de:** 00, 03, 04
> **Decisiones de gramática:** 38–52 (menos las semánticas 45 y 57, que van a SDD-12); 28.a/b (`bus:`; `Attribute.name` puede ser `RazorExpression`)

---

## 1. Contexto y objetivo

El tokenizer (SDD-03) parte el `.fud` en tokens y SDD-04 resuelve el `@` a nivel de átomo.
Falta **construir el árbol**: quién es hijo de quién, qué elemento abre y cierra cada tag,
cómo se agrupan atributos y contenido. Eso es SDD-05: el **parser HTML** de subset estricto
(decisión 38), que **conduce** el `Lexer` de SDD-03 (lo va pidiendo token a token, empuja y
desapila modos en las transiciones dirigidas por tag) y **consume** SDD-04 para cada `@`.

Su salida es un **AST HTML navegable por offset**: `HtmlDocument` → `ElementNode` /
`TextNode` / `CommentNode` / átomos Razor / … Cada nodo lleva su `Span` (regla de oro).

Tres rasgos lo definen:

1. **Subset estricto, sin error recovery de HTML5 (decisión 38).** Tags siempre cerrados
   explícitamente (salvo void, decisión 39), atributos siempre entrecomillados, sin
   inserciones implícitas. Lo que HTML5 "arregla" (un `<p>` sin cerrar, un `<li>` colgando),
   aquí es un **diagnóstico**, no una reparación silenciosa. El navegador ya hará HTML5
   completo sobre el output; el compilador no.

2. **El parser nunca lanza.** Un tag descuadrado, un cierre huérfano o un EOF con elementos
   abiertos se modelan como `Diagnostic` + recuperación **determinista y mínima** (§4.7),
   nunca como excepción. La forma es `ParseResult<HtmlDocument>`.

3. **Frontera limpia con los SDD hermanos por inversión de dependencias.** SDD-06 (control
   de flujo), SDD-07 (bindings) y SDD-08 (`@code`) **dependen de** SDD-05, no al revés. Por
   eso SDD-05 **no los importa**: define la interfaz `AtConstructParser` que *consume*
   (patrón DIP), y esos SDD la implementan e **inyectan**. SDD-05 posee la estructura HTML;
   delega los cuerpos `@`-dirigidos que no le pertenecen.

SDD-05 **no** clasifica bindings (event/property/`ref`/`class:`/`style:`, escape,
interpolación de primitivas: decisiones 18–31 → **SDD-07**); solo produce el atributo
sintáctico (nombre verbatim + partes de valor). **No** parsea cuerpos de control ni `@code`.
**No** produce tokens CSS (decisión 42 → **SDD-09**; hasta entonces `<style>` es opaco).
**No** valida estructura de documento (decisiones 53–62 → **SDD-10**) ni duplicados/doctype
(decisiones 45, 57 → **SDD-12** semántico).

**Repo limpio.** Árbol y matching de tags escritos desde cero; del prototipo solo la *idea*
del patrón visitor y la pila explícita de elementos abiertos. Nada de parse5 (decisión 38).

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | Monorepo pnpm, `@fudic/compiler`, TS 5.9 estricto, Vitest 4.1, fixtures `.fud`. |
| 01 | `Hecho` | `Span`/`span`/`mergeSpans`, `Diagnostic`/`errorDiag`, `ParseResult`/`ok`/`withDiagnostics`, `Node`. *(vía 03/04)* |
| 03 | `Hecho` | `Lexer` (`peek`/`next`/`seekTo`/`pushMode`/`popMode`/`mode`/`atEnd`), taxonomía `Token`, `BalancedGroup`. |
| 04 | `Hecho` | `RazorExpression`, `ControlKeyword`, `TriggerResolution`, `resolveTrigger`, `expressionFromToken`. |

```ts
import { type Node, type Span, span, mergeSpans } from '../types/index.js';
import { type Diagnostic, errorDiag } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
import { type Token, Lexer } from '../lexer/index.js';
import { type BalancedGroup } from '../balancer/index.js';
import {
  type RazorExpression,
  type ControlKeyword,
  type TriggerResolution,
  resolveTrigger,
  expressionFromToken,
} from '../at/index.js';
```

> **Nota TS estricto.** El parser indexa `source` por offset y consulta `source[i]`
> (`string | undefined`, `noUncheckedIndexedAccess`): fuera de rango es EOF, no un bug. Con
> `exactOptionalPropertyTypes`, `ElementNode.closeSpan` **se omite** cuando no hay tag de
> cierre; nunca se asigna `undefined`.

---

## 3. Interfaz pública

Ubicación canónica: `packages/compiler/src/html/` (`nodes.ts`, `parser.ts`, reexportados
desde `html/index.ts`). Todo en inglés.

### 3.1. Discriminantes

```ts
/** decision 51: file starting with `<!DOCTYPE` ⇒ page; else component. */
export type DocumentMode = 'page' | 'component';

/** Active element namespace (decision 41.b). svg/math are case-sensitive, self-close is free. */
export type Namespace = 'html' | 'svg' | 'math';

/** How an element was written / must be closed. */
export type ElementKind =
  | 'normal' //        <name>…</name>
  | 'void' //          <br>, <img>, … (decision 39): no close tag
  | 'self-closing' //  <name/> (decision 40): empty, rewritten at emit
  | 'raw'; //          <script>…</script> (decision 43): opaque body
```

### 3.2. Nodos del árbol HTML

```ts
/** Root of a parsed .fud tree. `mode` is auto-detected (decision 51). */
export interface HtmlDocument extends Node {
  readonly type: 'document';
  readonly mode: DocumentMode;
  readonly children: readonly HtmlContent[];
}

/** An HTML element. Structure only — binding meaning of attributes is SDD-07. */
export interface ElementNode extends Node {
  readonly type: 'element';
  /** Tag name verbatim, case as written (decision 41; svg/math case-sensitive, 41.b). */
  readonly name: string;
  readonly namespace: Namespace;
  readonly kind: ElementKind;
  /** Source order preserved (decision 47). Duplicate detection is semantic (decision 45 → SDD-12). */
  readonly attributes: readonly Attribute[];
  /** Empty for void/self-closing; a single RawTextNode for `raw`. */
  readonly children: readonly HtmlContent[];
  /** `<name …>` / `<name …/>` — the whole start tag. */
  readonly openSpan: Span;
  /** `</name>` — absent for void, self-closing, or an element left unclosed at recovery. */
  readonly closeSpan?: Span;
}

/**
 * A syntactic attribute: verbatim name + ordered value parts. SDD-05 does NOT classify it
 * (event/property/ref/class:/style: is decision 22–30 → SDD-07); it carries the raw name.
 */
export interface Attribute extends Node {
  readonly type: 'attribute';
  /**
   * Attribute name. Usually a verbatim `string` incl. leading `@`/`.` and any `:`
   * (decisions 29, 46), incl. the reserved `bus:` prefix. For the `bus:(expr)="@h"` form
   * (decision 28.b) the name is `RazorExpression` — the tokenizer delivered the `bus:` prefix
   * plus an `explicit-expr`. SDD-05 stays structural; SDD-07 classifies `bus:` ⇒ BusBinding,
   * and its static resolution / matching is SDD-12 (decision 28.c).
   */
  readonly name: string | RazorExpression;
  /** Ordered parts. Empty array ⇒ boolean OR empty value: `x` ≡ `x=""` (decision 44). */
  readonly value: readonly AttributeValuePart[];
}

export type AttributeValuePart = AttributeText | RazorExpression;

/** A literal run inside a quoted attribute value. Verbatim (entities pass-through, decision 49). */
export interface AttributeText extends Node {
  readonly type: 'attribute-text';
  readonly value: string;
}
```

### 3.3. Hojas de contenido

```ts
/** Literal text run. Verbatim: no entity decoding/re-escaping (decision 49). */
export interface TextNode extends Node { readonly type: 'text'; readonly value: string; }

/** `<!-- … -->`. Emitted to output as a DOM comment (decision 48). `value` = inner text. */
export interface CommentNode extends Node { readonly type: 'comment'; readonly value: string; }

/** `<!DOCTYPE …>`. Recognized lexically; only `<!DOCTYPE html>` is valid (decision 57 → SDD-10). */
export interface DoctypeNode extends Node { readonly type: 'doctype'; }

/** `<![CDATA[ … ]]>`. Valid only inside svg/math (decision 50); elsewhere ⇒ FUD0054. */
export interface CdataNode extends Node { readonly type: 'cdata'; readonly value: string; }

/** Opaque body of a raw element (`<script>`, decision 43). `element` = lowercased tag name. */
export interface RawTextNode extends Node {
  readonly type: 'raw-text';
  readonly value: string;
  readonly element: string;
}

/** `@* … *@`. Kept in the AST for spans/LSP, NOT emitted to output (decision 37). */
export interface RazorCommentNode extends Node { readonly type: 'razor-comment'; }

/** `@@` ⇒ a literal `@` in the output (decision 1). */
export interface AtEscapeNode extends Node { readonly type: 'at-escape'; }

/** `@{ … }` inline code (decision 16): opaque JS region, validated by Oxc (SDD-11). */
export interface InlineCodeNode extends Node { readonly type: 'inline-code'; readonly group: BalancedGroup; }

/** `@raw( … )` (SDD-04 `kind: 'raw'`, decision 18/option A): a content expression whose
 *  interpolation is NOT escaped — SDD-07 maps it to `Interpolation { escaped: false }`. */
export interface RawExpressionNode extends Node { readonly type: 'raw-expression'; readonly expr: RazorExpression; }
```

### 3.4. Unión de contenido y punto de extensión

```ts
/**
 * Any node that can appear as a child of an element or at the document top level.
 * `RazorExpression` (from SDD-04) is a bare interpolation atom; its escape / @raw /
 * primitive-only semantics (decisions 18, 19) are SDD-07's, layered over this node.
 */
export type HtmlContent =
  | ElementNode
  | TextNode
  | CommentNode
  | DoctypeNode
  | CdataNode
  | RawTextNode
  | RazorExpression
  | RawExpressionNode
  | RazorCommentNode
  | AtEscapeNode
  | InlineCodeNode
  | RazorConstruct
  | UnhandledConstructNode;

/**
 * A node produced by an injected @-construct parser. Its concrete `type`
 * (`'if' | 'foreach' | 'for' | 'while' | 'switch' | 'code'`) is narrowed by the owning
 * SDD (06/08); SDD-05 only stores it as a child and never inspects its shape.
 */
export interface RazorConstruct extends Node { readonly type: string; }

/** Degraded placeholder when a control/@code trigger is met with no injected handler (FUD0055). */
export interface UnhandledConstructNode extends Node {
  readonly type: 'unhandled-construct';
  readonly keyword: string;
}
```

### 3.5. Inversión de dependencias: el sub-parser de `@`-construcciones

```ts
/**
 * Context SDD-05 hands to an injected @-construct parser so it can recurse back into HTML
 * content (e.g. an `@if` body, a `switch` case). This is the seam that keeps the dependency
 * graph acyclic: SDD-05 owns the HTML tree; SDD-06/08 own their construct grammar.
 */
export interface HtmlParseContext {
  readonly source: string;
  /** The live lexer, positioned by SDD-05 right after the resolved keyword. */
  readonly lexer: Lexer;
  /**
   * Parse a run of HTML content until `stop` matches the upcoming (peeked, NOT consumed)
   * token — e.g. the `}` closing an html_block, or a `case`/`default`/`}` in a switch.
   * The sub-parser (SDD-06) owns the braces/keywords around the body; this only fills it.
   */
  parseContentUntil(stop: (next: Token) => boolean): ParseResult<readonly HtmlContent[]>;
}

/**
 * Injected by the pipeline. SDD-06 implements `parseControl`, SDD-08 implements
 * `parseCodeBlock`. When absent (isolated testing of SDD-05), control/@code degrade to an
 * UnhandledConstructNode + FUD0055. Each method leaves the lexer just past the construct.
 */
export interface AtConstructParser {
  parseControl(
    ctx: HtmlParseContext,
    keyword: ControlKeyword,
    keywordSpan: Span,
  ): ParseResult<RazorConstruct>;
  parseCodeBlock(ctx: HtmlParseContext, keywordSpan: Span): ParseResult<RazorConstruct>;
}
```

### 3.6. Punto de entrada

```ts
export interface HtmlParserOptions {
  /** Injected @-construct parsers (SDD-06/08). Omit ⇒ control/@code ⇒ UnhandledConstructNode. */
  readonly atConstructs?: AtConstructParser;
}

/**
 * Parse a whole .fud source into an HTML AST. Drives a fresh Lexer internally, resolves each
 * `@` via SDD-04, delegates control/@code via `options.atConstructs`. Never throws: a broken
 * tree yields a partial AST plus diagnostics.
 */
export function parseDocument(source: string, options?: HtmlParserOptions): ParseResult<HtmlDocument>;
```

---

## 4. Comportamiento

### 4.1. Detección de modo (decisión 51)

`parseDocument` mira el **primer token significativo** (saltando whitespace). Si es un
`doctype` → `mode: 'page'`. Si no → `mode: 'component'`. El parser admite **múltiples nodos
top-level** sintácticamente (links, `@code`, `<head>`-fragment, envoltorio host); SDD-05 solo
**fija el flag**. Las reglas estructurales de cada modo (`<html>`/`<head>`/`<body>`
obligatorios y ordenados, orden top-level, ubicación de `<link rel="component">` y `@code`,
envoltorio host + `<template shadowrootmode>`: decisiones 53–62 y 75–78) son **SDD-10**.

### 4.2. El bucle de contenido

En modo `html`/`svg`/`math`, SDD-05 pide tokens y despacha por tipo:

| Token de SDD-03 | Acción |
|---|---|
| `text` / `whitespace` | `TextNode` (verbatim, decisión 49). |
| `tag-open-start` | Abre elemento → §4.3. |
| `tag-close` | Cierra elemento → §4.7 (matching + recuperación). |
| `html-comment` | `CommentNode` (emitido, decisión 48). |
| `doctype` | `DoctypeNode` (validez → SDD-12). |
| `cdata` | `CdataNode` si el modo es `svg`/`math`; si no, `FUD0054` (decisión 50). |
| `explicit-expr` | `expressionFromToken(token)` → `RazorExpression`. |
| `inline-code` | `InlineCodeNode` con el `group` (decisión 16; JS a Oxc). |
| `at-escape` | `AtEscapeNode` (decisión 1). |
| `razor-comment` | `RazorCommentNode` (decisión 37; se guarda, no se emite). |
| `at-trigger` | Resuelve con SDD-04 → §4.5. |
| `raw-text` | `RawTextNode` (solo como hijo único de un `raw`, §4.4). |
| `eof` | Fin del nivel actual. |

### 4.3. Apertura de elemento (decisiones 39, 40, 41, 41.b, 43)

Ante `tag-open-start` (name), SDD-05 consume la **lista de atributos** (§4.6) hasta el
cierre del start tag, y decide el `kind`:

- **Self-closing** `/>` (`tag-self-close`, decisión 40): `kind: 'self-closing'`, `children: []`,
  sin `closeSpan`. Vale en cualquier elemento (regla JSX); el emit lo reescribe a par
  abierto/cerrado.
- **Void** (`tag-open-end` y el name está en la **lista cerrada** de void elements,
  decisión 39: `area base br col embed hr img input link meta source track wbr`):
  `kind: 'void'`, `children: []`, sin `closeSpan`. **No** se busca `</name>`; si aparece un
  `</br>` explícito → `FUD0053`.
- **Raw** (`tag-open-end` y name es `script`, decisión 43): `kind: 'raw'`. El `Lexer` ya
  entregó el cuerpo como un único `raw-text` opaco; `children` = `[RawTextNode]`. El cierre
  `</script>` da el `closeSpan`. *(nota: `<title>`/`<textarea>` NO son raw opacos aquí —
  SDD-03 §4.6 los tokeniza como texto + átomos `@`; se parsean como `normal`.)*
- **Normal** en cualquier otro caso: `kind: 'normal'`; se parsea contenido recursivamente
  (§4.2) hasta el `tag-close` que casa (§4.7), que aporta `closeSpan`.

El `name` se guarda **verbatim** (decisión 41: `[a-zA-Z][a-zA-Z0-9-]*`, ya garantizado por el
lexer). El `namespace` sale del `lexer.mode` activo: al entrar en `<svg>`/`<math>` el lexer
empuja `svg`/`math` (decisión 41.b, case-sensitive) y sus descendientes quedan marcados; se
desapila en el cierre. `openSpan` cubre `<name … >`/`<name … />`.

### 4.4. Elementos `raw` y modos delegados

SDD-05 no reimplementa el escaneo opaco: **conduce** los `push/pop` de modo del lexer. Para
`<script>` el lexer devuelve `raw-text` (Razor off, decisión 43). Para `<style>` el lexer
empuja `css`, pero la **producción CSS** es de **SDD-09**; hasta entonces el cuerpo llega como
`raw-text` provisional (SDD-03 §4.7) y SDD-05 lo aloja como tal, sin interpretarlo. SDD-05 no
añade reglas CSS.

### 4.5. El `@` en contenido: dispatch a SDD-04 (decisiones 1–8)

Ante un `at-trigger` (cuyo span es solo el `@`), SDD-05 llama a
`resolveTrigger(source, token.span.start)` y actúa según el `TriggerResolution`:

- **`implicit`** → el `RazorExpression` resuelto es el hijo. `lexer.seekTo(expr.span.end)`.
- **`raw`** → `RawExpressionNode` con `expr` = la expresión interna (SDD-04, `@raw( … )`).
  `seekTo(expression.span.end)`.
- **`control`** → si hay `options.atConstructs`, `seekTo(keywordSpan.end)` y se llama a
  `parseControl(ctx, keyword, keywordSpan)`; el `RazorConstruct` devuelto es el hijo y el
  bucle reanuda en `ctx.lexer.offset`. Sin handler → `UnhandledConstructNode` + `FUD0055`,
  `seekTo(keywordSpan.end)`.
- **`code-block`** → análogo con `parseCodeBlock(ctx, keywordSpan)` (SDD-08).

La forma **explícita** `@( … )` no llega como `at-trigger`: el lexer ya la dio como
`explicit-expr` (§4.2), envuelta con `expressionFromToken`. Así se respeta la cadena
02→03→04→05: SDD-05 nunca re-escanea JS ni vuelve a llamar al balanceador.

### 4.6. Atributos (decisiones 20, 29, 44, 46, 47, 49)

Entre el name del start tag y su cierre, el lexer emite `attr-name` (o, en la forma 28.b,
`explicit-expr` en la ranura de nombre), `attr-eq`, `attr-quote-open`/`attr-quote-close`, y
dentro de comillas `text` + átomos `@`. SDD-05 ensambla un `Attribute` por cada ranura de
nombre:

- **Nombre verbatim**, incluidos `@`/`.` iniciales y cualquier `:` (decisiones 29, 46). SDD-05
  **no** interpreta el prefijo; distinguir event/property/`ref`/`class:`/`style:` es SDD-07.
- **`bus:(expr)` — nombre por expresión (decisión 28.b).** Tras el `attr-name` `bus:`, si sigue
  un `explicit-expr`, `name` = `expressionFromToken(token)` (una `RazorExpression`), no un
  `string`. Es la forma `bus:(EVENTOS.carrito)="@h"`. SDD-05 sigue sin clasificar: solo aloja la
  expresión y su span; que sea `BusBinding` y su resolución a literal es SDD-07/SDD-12 (28.c). La
  forma literal `bus:carrito` es un `attr-name` normal (prefijo reservado).
- **Valor** = partes en orden entre las comillas: `text` → `AttributeText` (verbatim, decisión
  49); átomos `@` → `RazorExpression` (implícita/explícita, vía SDD-04). Concatenación uniforme
  de partes (decisión 20); el emit optimiza el caso estático.
- **Sin `=`** (atributo booleano) **o** `=""` (valor vacío) → `value: []`. Ambos producen el
  **mismo AST** (decisión 44). La semántica de atributo booleano HTML (decisión 21) es SDD-07.
- **Orden preservado** (decisión 47). **Atributos duplicados** (decisión 45) **no** se
  detectan aquí: es análisis semántico (SDD-12); SDD-05 los conserva ambos en orden.

### 4.7. Matching de tags y recuperación (decisión 38)

SDD-05 mantiene una **pila explícita de elementos abiertos**. Subset estricto ⇒ sin
inserciones implícitas; pero "el parser nunca lanza" ⇒ recuperación **determinista y mínima**:

- **`tag-close` que casa con la cima** (mismo name; case-sensitive en svg/math, decisión
  41.b) → cierra el elemento, fija `closeSpan`, desapila.
- **`tag-close` que casa con un ancestro** (no la cima) → los elementos intermedios quedan
  **sin cerrar**: se emite `FUD0052` por cada uno (sin `closeSpan`), se desapila hasta el
  ancestro y se cierra. Recuperación hacia el ancestro: mantiene el árbol bien formado.
- **`tag-close` sin apertura correspondiente** en la pila → `FUD0051`, se ignora el cierre
  (no cuelga: el bucle avanza).
- **EOF con elementos abiertos** → `FUD0052` por cada uno; se cierran sin `closeSpan`.
- **`</br>`** u otro cierre de void → `FUD0053`, se ignora.

Ningún caso lanza; cada uno emite su diagnóstico localizado y el cursor progresa.

### 4.8. Códigos `FUD`

SDD-05 reserva el rango **`FUD0050`–`FUD0069`** (01: `FUD0001`; 02: `0002`–`0009`; 03:
`0010`–`0029`; 04: `0030`–`0049`, reservado). Definidos:

| Código | Significado |
|---|---|
| `FUD0050` | Tag de cierre no casa con el elemento abierto en la cima. |
| `FUD0051` | Tag de cierre sin elemento abierto correspondiente. |
| `FUD0052` | Elemento sin cerrar (antes del cierre del padre o de EOF). |
| `FUD0053` | Tag de cierre para un void element (los void no se cierran, decisión 39). |
| `FUD0054` | `<![CDATA[ … ]]>` fuera de contenido SVG/MathML (decisión 50). |
| `FUD0055` | Construcción `@` de control/`@code` sin sub-parser inyectado (placeholder degradado). |

`FUD0056`–`FUD0069` quedan libres. Los diagnósticos de SDD-02/03/04 (balanceador,
tag mal formado, valor de atributo sin cerrar…) **afloran** por el `ParseResult` sin
renumerarse. *(Nota: `FUD0050` se reserva para el matching descrito en §4.7; la implementación
puede preferir la recuperación-hacia-ancestro (`FUD0052`) y no emitir `FUD0050` — se mantiene
en el catálogo por si se adopta la política estricta "rechaza y trata como texto".)*

---

## 5. Invariantes LSP

- **Spans en todo.** `HtmlDocument`, cada `ElementNode` (`.span`, `.openSpan`, `.closeSpan`),
  cada `Attribute`/`AttributeText`, cada hoja y cada `Diagnostic` llevan offset UTF-16. La
  cobertura del árbol es total: dado un offset, `spanContains` localiza el nodo más ajustado.
- **Nunca lanza.** Tag descuadrado, cierre huérfano, EOF abierto, CDATA fuera de sitio y
  construcción sin handler se modelan como resultados degradados + diagnósticos (los de
  SDD-02/03/04 burbujean), nunca como excepción. El bucle siempre avanza.
- **Navegabilidad por offset.** El árbol es inmutable (`readonly`) y navegable; el parser
  conduce un `Lexer` reanudable (`seekTo`). Forma apta para reparseo incremental futuro.
- **DIP para acíclico.** SDD-05 depende de la *abstracción* `AtConstructParser`, no de SDD-06/08.
  El grafo de dependencias del INDEX se mantiene sin ciclos.

---

## 6. Criterios de aceptación

Entradas reales (fixtures) → árbol esperado. El SDD está `Hecho` cuando:

1. **Typecheck.** `pnpm typecheck` pasa con §3 definido y reexportado desde `html/index.ts`.

2. **Elemento simple.** `<slot></slot>` ⇒ `ElementNode` name `slot`, `kind: 'normal'`,
   `attributes: []`, `children: []`, `openSpan` sobre `<slot>`, `closeSpan` sobre `</slot>`.

3. **Anidamiento y texto.** `<div class="body"><slot></slot></div>` ⇒ `div` con un atributo
   `class` (`value` = `[AttributeText 'body']`) y un hijo `slot`. Spans encajados sin huecos.

4. **Void (decisión 39).** `<meta charset="utf-8">` ⇒ `kind: 'void'`, sin `closeSpan`,
   `children: []`. `<img src="x">` idem. `</br>` suelto ⇒ `FUD0053`.

5. **Self-closing (decisión 40).** `<div/>` ⇒ `kind: 'self-closing'`, `children: []`, sin
   `closeSpan`. `<app-icon name="x"/>` idem con su atributo.

6. **Raw script (decisión 43).** `<script>const x=@y;</script>` ⇒ `kind: 'raw'`, un hijo
   `RawTextNode` (`element: 'script'`, `value: 'const x=@y;'`, `@` **no** interpretado),
   `closeSpan` sobre `</script>`.

7. **Atributos: orden y booleano (decisiones 44, 47).** `<input disabled required>` ⇒ dos
   atributos en orden, ambos `value: []`. `<input disabled="">` ⇒ **mismo AST** que
   `<input disabled>` (decisión 44).

8. **Atributo con interpolación.** `title="@item.title"` ⇒ `Attribute` name `title`,
   `value` = `[RazorExpression]` (implícita `item.title`). `class:highlight="@(variant === 'highlight')"`
   ⇒ name verbatim `class:highlight`, `value` = `[RazorExpression]` explícita. La clasificación
   `class:` como binding NO se hace aquí (es SDD-07).

8.b. **Suscriptor de bus (decisión 28.a/b).** `bus:carrito="@onCarrito(ev)"` ⇒ `Attribute` `name`
   string `bus:carrito`. `bus:(EVENTOS.carrito)="@h"` ⇒ `name` es una `RazorExpression`
   (`EVENTOS.carrito`), no un `string`. `@click="@onClick"` ⇒ `name` string `@click` (host). Que
   `bus:` sea `BusBinding` y su resolución a literal NO se hace aquí (SDD-07/SDD-12).

9. **`@` de contenido.** `<h2>@title</h2>` ⇒ `h2` con un hijo `RazorExpression` (implícita
   `title`). `<h1>@data.title</h1>` ⇒ hijo `RazorExpression` `data.title`.

10. **Átomos Razor de contenido.** `@@` ⇒ `AtEscapeNode`. `@* nota *@` ⇒ `RazorCommentNode`.
    `@{ const n = 1; }` ⇒ `InlineCodeNode` con `group`.

11. **Delegación de control (DIP).** Con un `AtConstructParser` de prueba inyectado,
    `@if (expanded.value) { … }` ⇒ SDD-05 llama a `parseControl` con `keyword: 'if'` y el
    `keywordSpan`, y aloja el `RazorConstruct` devuelto como hijo. `@code { … }` ⇒ llama a
    `parseCodeBlock`. **Sin** handler ⇒ `UnhandledConstructNode` + `FUD0055`.

12. **Comentario y doctype.** `<!-- x -->` ⇒ `CommentNode` (`value: ' x '`, emitido). Fuente
    que empieza por `<!DOCTYPE html>` ⇒ `mode: 'page'` y un `DoctypeNode` top-level.

13. **Modo componente / múltiples nodos top-level (decisión 51).** Fichero sin doctype con dos
    raíces (`<link …>` + `<app-x>…</app-x>`) ⇒ `mode: 'component'`, ambas como hijos top-level.
    (La regla del envoltorio único, decisión 75, la valida SDD-10 — no el parser.)

14. **SVG + CDATA (decisiones 41.b, 50).** `<svg><![CDATA[…]]></svg>` ⇒ `svg` con
    `namespace: 'svg'` y un hijo `CdataNode`. Un `<![CDATA[…]]>` en contenido HTML ⇒ `FUD0054`.

15. **Recuperación (decisión 38, §4.7).** `<b><i></b>` ⇒ `i` sin cerrar + `FUD0052`, `b`
    cerrado. `</p>` sin apertura ⇒ `FUD0051`, ignorado. EOF con `<div>` abierto ⇒ `FUD0052`.
    Ningún caso lanza.

16. **Cobertura.** El módulo se acerca al 100 % de líneas/funciones/ramas (los casos cubren
    cada rama del dispatch y de la recuperación). Cumple el suelo del SDD-00 (80/80/75).

---

## 7. Fuera de alcance

- **Clasificación de bindings.** Distinguir dynamic/property/event/`ref`/`class:`/`style:`,
  escape automático, `@raw`, interpolación solo de primitivas, atributos booleanos
  (decisiones 18–31): **SDD-07**, que reinterpreta el `Attribute`/`RazorExpression` de SDD-05.
- **Cuerpos de control de flujo.** El `(header)` y el `{ html_block }` de `@if`/`@foreach`/
  `@for`/`@while`/`@switch`, el `else` (decisiones 9–17): **SDD-06**, inyectado vía
  `parseControl`. SDD-05 solo delega.
- **`@code`.** El contenedor y sus regiones `@server`/`@client` (decisiones 32–34, 63–66):
  **SDD-08**, inyectado vía `parseCodeBlock`.
- **Producción CSS.** Lista blanca de at-rules, `@` con desambiguación, nesting (decisión 42):
  **SDD-09**. SDD-05 solo conduce el push/pop del modo `css` y aloja el cuerpo opaco provisional.
- **Estructura de documento.** `<html>`/`<head>`/`<body>` obligatorios y ordenados, orden
  top-level, ubicación de `<link rel="component">` y `@code`, elevación de `<head>`
  (decisiones 53–62): **SDD-10**. SDD-05 solo fija `mode`.
- **Reglas semánticas.** Atributos duplicados (decisión 45), custom element sin
  `<link rel="component">` (decisión 41), `ref` en bucle (decisión 31): **SDD-12**. Doctype
  no-`html` (decisión 57): **SDD-10**.
- **Validación del JS.** Contenido de `RazorExpression`/`InlineCodeNode`/`raw`: **Oxc, SDD-11**.
- **`LineMap` / línea-columna:** **SDD-13**. Aquí todo es offset.
