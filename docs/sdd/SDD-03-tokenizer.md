# SDD-03 — Tokenizer + pila de modos

> **Estado:** `Listo`
> **Depende de:** 00, 01, 02
> **Decisiones de gramática:** notas "Modos del parser"; 1, 7 (transición `@` léxica); 38–41, 48, 57 (formas HTML); 43 (`<script>` raw)

---

## 1. Contexto y objetivo

El tokenizer es la primera capa que **lee el texto del `.fud`** y lo parte en una
secuencia de **tokens**, cada uno con su `Span` (regla de oro). Es la columna vertebral
sobre la que se montan las reglas del `@` (SDD-04) y el parser HTML (SDD-05): ambos
**conducen** este tokenizer, no lo reimplementan.

Tres rasgos lo definen, y son las decisiones cerradas con Pedro:

1. **Cursor perezoso.** No devuelve la lista entera de golpe: es un objeto `Lexer` con
   `peek()` / `next()` que guarda dentro la `ModeStack` de SDD-01. Las capas de arriba lo
   van pidiendo token a token y le indican los cambios de modo sobre la marcha. Es lo que
   un language server necesita (mirar adelante, reanudar) y lo que permite el reparseo
   incremental futuro.

2. **Tokens contextuales con regiones JS opacas.** Emite tokens estructurales de HTML
   (no terminales carácter-a-carácter) y trata cada **región JS balanceada** (`@(...)`,
   `@{...}`) como **un átomo opaco** cuyo `Span` sale del balanceador (SDD-02). El JS de
   dentro **no se tokeniza aquí**: lo valida Oxc en SDD-11. Esto materializa "Oxc se
   invoca una sola vez por fichero".

3. **El tokenizer resuelve el `@` léxico y llama al balanceador.** Los casos de `@`
   determinables por *lookahead* (`@@`, `@*...*@`, `@(...)`, `@{...}`) y la *lookbehind* de
   email (decisión 7) los resuelve el tokenizer. Los **keywords/control** (`@if`,
   `@foreach`, `@code`…) y las **expresiones implícitas** (`@foo.bar`) los emite como un
   disparador `at-trigger` y se los deja a SDD-04. El balanceador lo invocan tanto este
   SDD (para `@(...)` / `@{...}`) como SDD-04 (para las cabeceras de control); ambos viven
   sobre SDD-02.

Este SDD es el primero que define el tipo **`Token`** y su taxonomía. SDD-01 lo dejó
fuera a propósito porque la taxonomía depende de los modos, que llegan aquí.

**Repo limpio.** Del prototipo `compiler-master` (2019) se hereda la *idea* del patrón
de pila de modos y de tokenizer contextual, nunca su código ni parse5.

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | Monorepo pnpm, `@fudic/compiler`, TS 5.9 estricto, Vitest 4.1, fixtures `.fud`. |
| 01 | `Hecho` | `Span`/`span`/`emptySpan`/`mergeSpans`, `Diagnostic`/`errorDiag`, `ParseResult`/`ok`/`withDiagnostics`, `Mode`, `ModeStack`. |
| 02 | `Hecho` | `scanParens`/`scanBraces`, `BalancedGroup`, `LexRegion` — para las regiones JS opacas. |

```ts
import { type Span, span, emptySpan, mergeSpans } from '../types/index.js';
import { type Diagnostic, errorDiag } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
import { type Mode, ModeStack } from '../types/index.js';
import { type BalancedGroup, scanParens, scanBraces } from '../balancer/index.js';
```

> **Nota TS estricto (heredado del 00).** El tokenizer indexa `source` por offset de
> forma intensiva; cada `source[i]` es `string | undefined` (`noUncheckedIndexedAccess`)
> y un índice fuera de rango es EOF, no un bug. Los campos de los tipos de §3 no son
> opcionales: nada de `| undefined`.

---

## 3. Interfaz pública

Ubicación canónica: `packages/compiler/src/lexer/` (`token.ts`, `lexer.ts`,
reexportados desde `lexer/index.ts`). Todo en inglés.

### 3.1. Taxonomía de tokens

```ts
/**
 * Kind discriminant of a Token. Contextual, NOT character-level: a start tag is
 * one `tag-open-start` token, not LT + IDENT. Balanced JS regions are single
 * opaque atoms (`explicit-expr`, `inline-code`); their JS is validated by Oxc later.
 */
export type TokenType =
  // Content
  | 'text' // literal text run in content/value position
  | 'whitespace' // insignificant whitespace (inside tags, between top-level nodes)
  // Tags
  | 'tag-open-start' // `<name`  (carries `name`)
  | 'tag-open-end' // `>` that ends a start tag
  | 'tag-self-close' // `/>` (decision 40)
  | 'tag-close' // `</name>` (carries `name`)
  // Attributes
  | 'attr-name' // attribute name, incl. leading `@`/`.` and any `:` (carries `name`)
  | 'attr-eq' // `=`
  | 'attr-quote-open' // opening `"`
  | 'attr-quote-close' // closing `"`
  // HTML literals emitted verbatim
  | 'html-comment' // `<!-- ... -->` (decision 48, emitted)
  | 'doctype' // `<!DOCTYPE html>` (decision 57)
  | 'cdata' // `<![CDATA[ ... ]]>` (decision 50, svg/math only — validity is semantic)
  // Razor atoms resolved lexically by the tokenizer
  | 'at-escape' // `@@` → literal `@` (decision 1)
  | 'razor-comment' // `@* ... *@` (decisions 35–37; not emitted to output, but tokenized)
  | 'explicit-expr' // `@( ... )` (carries `group`)
  | 'inline-code' // `@{ ... }` (carries `group`)
  | 'at-trigger' // `@` before a keyword/identifier — deferred to SDD-04. Span = the `@`.
  // Raw element body
  | 'raw-text' // opaque body of a raw element (carries `element`)
  // Sentinel
  | 'eof'; // end of input (idempotent)

export interface BaseToken {
  readonly type: TokenType;
  readonly span: Span;
}

/** `tag-open-start` / `tag-close` carry the tag name, verbatim (case as written). */
export interface NamedTagToken extends BaseToken {
  readonly type: 'tag-open-start' | 'tag-close';
  readonly name: string;
}

/** `attr-name` carries the full attribute name (leading `@`/`.` and `:` included). */
export interface AttrNameToken extends BaseToken {
  readonly type: 'attr-name';
  readonly name: string;
}

/** `explicit-expr` / `inline-code` carry the balancer result for the opaque JS region. */
export interface JsRegionToken extends BaseToken {
  readonly type: 'explicit-expr' | 'inline-code';
  readonly group: BalancedGroup;
}

/** `raw-text` carries the lowercased element name it belongs to (`script`/`title`/…). */
export interface RawTextToken extends BaseToken {
  readonly type: 'raw-text';
  readonly element: string;
}

/** Tokens with no extra payload beyond type + span. */
export interface PlainToken extends BaseToken {
  readonly type: Exclude<
    TokenType,
    'tag-open-start' | 'tag-close' | 'attr-name' | 'explicit-expr' | 'inline-code' | 'raw-text'
  >;
}

export type Token = NamedTagToken | AttrNameToken | JsRegionToken | RawTextToken | PlainToken;
```

### 3.2. El cursor `Lexer`

```ts
/**
 * Lazy, mode-driven tokenizer cursor. Holds the live ModeStack. The upper layers
 * (SDD-04/05/06) drive it: they pull tokens, push/pop modes at the transitions they
 * own, and seek to resume after a balanced header. Never throws.
 */
export class Lexer {
  /** baseMode defaults to 'html' (the parser's default mode, SDD-01 §4.4). */
  constructor(source: string, baseMode?: Mode);

  /** Current scan offset (the start of the next token). */
  get offset(): number;

  /** Current mode (top of the stack). Never undefined: the stack never empties. */
  get mode(): Mode;

  /** True once the cursor has reached the end of source. */
  get atEnd(): boolean;

  /**
   * The next token WITHOUT consuming it. Best-effort lookahead for the parser's
   * decisions; the authoritative diagnostics of that token are delivered when it is
   * consumed via next() (a one-token buffer prevents double emission).
   */
  peek(): Token;

  /** Consume and return the next token plus any diagnostics produced reading it. */
  next(): ParseResult<Token>;

  /** Push a new mode (raw/css/svg/math/js). The caller documents the transition. */
  pushMode(mode: Mode): void;

  /** Pop the current mode. Delegates to ModeStack.pop (FUD0001 on background pop). */
  popMode(at: number): ParseResult<Mode>;

  /**
   * Reposition the cursor to `offset` (must be >= current offset; forward-only).
   * Used by SDD-04 to resume html-mode tokenization right after a balanced control
   * header it consumed via the balancer. Clears the lookahead buffer.
   */
  seekTo(offset: number): void;
}
```

---

## 4. Comportamiento

### 4.1. Cobertura total, sin solapes

Los tokens que produce el `Lexer` **cubren el `source` por completo y sin huecos ni
solapes**: cada carácter pertenece a exactamente un token. La whitespace estructuralmente
insignificante (entre atributos, entre nodos top-level) se emite como `whitespace`; la
whitespace de contenido va dentro de `text`. Esto mantiene la navegabilidad por offset
exacta y simplifica el reparseo.

### 4.2. Modos y transiciones que el tokenizer posee

El tokenizer es dueño de las transiciones de modo **dirigidas por tag** (léxicas). Las
transiciones a `js` (cabeceras de control, `@code`) NO son suyas: las hace SDD-04/08.

| Disparador (en `html`/`svg`/`math`) | Acción | Salida | Decisión |
|---|---|---|---|
| `<script>` | push `raw` (Razor **off**) | `raw-text` opaco hasta `</script>` | 43 |
| `<title>` / `<textarea>` | push `raw` (Razor **on**) | texto + átomos `@`, sin tags, hasta el cierre | ver §4.6 (a confirmar) |
| `<style>` | push `css` | regiones CSS — **producción en SDD-09** (placeholder §4.7) | 42 |
| `<svg>` / `<math>` (raíz) | push `svg`/`math` | tokens HTML case-sensitive, self-close libre, CDATA | 41.b, 50 |

El cierre del elemento correspondiente hace `pop`. La taxonomía `Mode` es cerrada
(SDD-01); no se añaden modos.

### 4.3. Tokenización en modo `html` (backbone)

- **Texto.** Una tirada de contenido hasta el siguiente `<` o `@` significativo se emite
  como `text`.
- **Tags.** `<` seguido de letra (decisión 41, `[a-zA-Z]`) abre `tag-open-start` con el
  `name`. Dentro de la lista de atributos se emiten `attr-name`, `attr-eq`,
  `attr-quote-open` / `attr-quote-close` y, entre comillas, `text` + átomos `@`
  (los valores admiten interpolación, decisión 20). El cierre del start tag es
  `tag-open-end` (`>`) o `tag-self-close` (`/>`, decisión 40). `</name>` es un
  `tag-close`. La whitespace entre atributos es `whitespace`.
- **`<!-- ... -->`** → `html-comment` (decisión 48). **`<!DOCTYPE html>`** → `doctype`
  (decisión 57). El reconocimiento es léxico; la validez (p. ej. otros doctypes) es
  semántica (SDD-12).
- **Posición del atributo.** Un `@` en posición de **nombre de atributo** (p. ej.
  `@click`) es parte del `attr-name`, no un disparador Razor (decisión 29). El tokenizer
  distingue por posición.

### 4.4. El carácter `@` en modo `html` (y en valores de atributo)

Al ver un `@` en posición de contenido o de valor, el tokenizer decide por **lookbehind**
y **lookahead** de un carácter:

1. **Email (lookbehind, decisión 7).** Si el carácter inmediatamente anterior es de
   identificador (forma palabra con lo previo, p. ej. `user@`), el `@` es **literal**: se
   absorbe en el `text` circundante. Permite `user@dominio.com` sin escape.
2. **`@@` (decisión 1)** → token `at-escape` (representa un `@` literal en el output).
3. **`@* ... *@`** → token `razor-comment`. El tokenizer escanea hasta el primer `*@`
   (no anidable, decisión 36). Sin `*@` antes de EOF → `FUD0011`, token degradado hasta EOF.
4. **`@(`** → token `explicit-expr`: el tokenizer llama a `scanParens(source, offsetDe'(')`
   y guarda el `BalancedGroup` resultante. El JS interno queda opaco. Los diagnósticos del
   balanceador (FUD0002…) afloran en el `ParseResult` de `next()`.
5. **`@{`** → token `inline-code`, análogo con `scanBraces`.
6. **`@` + inicio de identificador** (`@if`, `@foreach`, `@code`, `@title`, `@foo`…) →
   token `at-trigger` cuyo `span` cubre **solo** el `@`. El tokenizer **no** consume el
   identificador ni decide si es keyword o implícita: eso es SDD-04, que reanuda desde
   `token.span.end` (con `seekTo` y, si procede, `pushMode('js')` + balanceador para la
   cabecera). Así se respeta la cadena 02→03→04.
7. **Cualquier otro carácter tras `@`** (espacio, EOF, símbolo no válido) → `FUD0010`; el
   `@` se emite como `text` literal (degradación, nunca lanza).

### 4.5. Modo `raw` con Razor desactivado: `<script>` (decisión 43)

Tras el `tag-open-end` de un `<script ...>`, push `raw` con Razor **off**. Todo el cuerpo
es **opaco**: un único `raw-text` (con `element: 'script'`) hasta el `</script>` de cierre
(case-insensitive). Ni tags ni `@` se procesan dentro. Sin cierre antes de EOF → `FUD0014`.

### 4.6. ⚠️ Cuestión a confirmar con Pedro — `<title>` / `<textarea>`

Las **notas "Modos del parser"** dicen literalmente que `raw` cubre "`<script>`,
`<textarea>`, `<title>`. **Opaco** hasta la tag de cierre". Pero el fixture `home.fud`
contiene:

```fud
<title>@data.title</title>
```

— Razor **dentro** de `<title>`. Si `<title>` fuese opaco, `@data.title` no se
interpolaría y el fixture sería inválido. **Las dos cosas no pueden ser ciertas a la vez.**

La decisión 43 solo declara opaco a **`<script>`** ("`<script>` raw puro. Sin
procesamiento de Razor"); no extiende esa opacidad a `title`/`textarea`. Y para un título
dinámico hace falta interpolación.

**Resolución provisional adoptada en esta spec** (a validar): `<script>` es `raw` opaco
(§4.5); `<title>` y `<textarea>` entran en `raw` pero con **Razor activo**: se tokenizan
como **texto + átomos `@`, sin tags anidados** (equivalente a RCDATA de HTML). Se mantiene
dentro de la taxonomía cerrada `Mode` usando un flag interno "Razor on/off" sobre el modo
`raw`, sin añadir un modo nuevo. Si prefieres opacidad estricta para los tres (y entonces
corregir `home.fud`), lo cambiamos.

### 4.7. Modo `css`: placeholder hasta SDD-09

El tokenizer hace el `push`/`pop` de `css` en `<style>`/`</style>` (le pertenece la
transición), pero la **producción de tokens CSS** —lista blanca de at-rules, `@` con
desambiguación, conteo de llaves con nesting (decisión 42.a–e)— es de **SDD-09**. Hasta
que SDD-09 aterrice, el modo `css` trata el cuerpo como `raw-text` opaco hasta `</style>`,
**provisional y explícitamente marcado** como punto de extensión. No se define aquí ninguna
regla CSS.

### 4.8. Modos `svg` / `math` (decisión 41.b, 50)

Iguales en forma a `html` pero: nombres **case-sensitive**, self-close siempre permitido
(estilo XML), y `<![CDATA[ ... ]]>` reconocido como `cdata`. Push al entrar en la raíz
`<svg>`/`<math>`, pop en su cierre. Las reglas de árbol siguen siendo de SDD-05.

### 4.9. EOF y degradación

`next()` al final devuelve siempre un token `eof` (idempotente; `peek()` también).
Cualquier construcción sin terminar emite su diagnóstico específico (§4.10) y degrada el
token hasta EOF; el cursor nunca lanza ni se cuelga (siempre avanza al menos un carácter).

### 4.10. Catálogo de códigos `FUD` de este SDD

SDD-03 reserva el rango **`FUD0010`–`FUD0029`** (SDD-01: `FUD0001`; SDD-02:
`FUD0002`–`FUD0009`). Definidos:

| Código | Significado |
|---|---|
| `FUD0010` | Carácter tras `@` no inicia una construcción Razor válida. |
| `FUD0011` | Comentario Razor sin terminar (`@*` sin `*@`). |
| `FUD0012` | Comentario HTML sin terminar (`<!--` sin `-->`). |
| `FUD0013` | Tag mal formado (`<` no seguido de nombre válido, `/` o `!`). |
| `FUD0014` | Elemento raw sin cerrar (no aparece la tag de cierre). |
| `FUD0015` | Valor de atributo sin cerrar (falta la comilla de cierre). |
| `FUD0016` | Sección CDATA sin terminar. |

`FUD0017`–`FUD0029` quedan libres para ampliación. Los diagnósticos del balanceador
(`FUD0002`…) afloran a través de `next()` cuando el tokenizer lo invoca; no se renumeran.

---

## 5. Invariantes LSP

- **Spans en todo.** Cada `Token.span`, cada `name`/`element` (derivado de su span), cada
  `BalancedGroup` anidado y cada `Diagnostic` llevan localización UTF-16. La cobertura es
  total y sin huecos (§4.1): dado un offset, hay siempre exactamente un token que lo cubre.
- **Nunca lanza.** EOF, construcciones sin terminar, `@` inválido y pop sobre el modo de
  fondo se modelan como diagnósticos sobre tokens degradados, no como excepciones. `next()`
  siempre progresa.
- **Navegabilidad por offset.** El cursor expone `offset` y `seekTo`; `peek` permite
  decidir sin consumir. Un language server puede situar el cursor en cualquier punto.
- **Forma apta para reparseo incremental.** El `Lexer` encapsula todo su estado (offset +
  `ModeStack`); `ModeStack.clone()` permite capturar checkpoints. La *implementación*
  incremental se difiere, pero la *forma* ya lo admite.

---

## 6. Criterios de aceptación

Entradas reales (de los fixtures) → tokens esperados. El SDD está `Hecho` cuando:

1. **Typecheck.** `pnpm typecheck` pasa con §3 definido y reexportado.

2. **Tag simple.** `<slot></slot>` ⇒ `tag-open-start`(name `slot`), `tag-open-end`,
   `tag-close`(name `slot`). Spans contiguos cubriendo toda la entrada.

3. **Texto + disparador.** `<h2>@title</h2>` ⇒ `tag-open-start` `h2`, `tag-open-end`,
   `at-trigger` (span = el `@`, longitud 1), … `tag-close` `h2`. El tokenizer **no**
   tokeniza `title` como parte del `@` (eso es SDD-04).

4. **Expresión explícita opaca.** `class:highlight="@(variant === 'highlight')"` ⇒
   `attr-name`(name `class:highlight`), `attr-eq`, `attr-quote-open`, `explicit-expr`
   (con `group.inner` cubriendo `variant === 'highlight'`), `attr-quote-close`.

5. **`@` en nombre de atributo (event).** `@click="@onClick"` ⇒ `attr-name`(name
   `@click`), `attr-eq`, `attr-quote-open`, `at-trigger`, `attr-quote-close`. El primer
   `@` es parte del nombre (decisión 29); el segundo es disparador.

6. **Email (lookbehind, decisión 7).** En texto, `user@dominio.com` ⇒ un único `text`
   sin `at-trigger`: el `@` precedido de identificador es literal.

7. **Escape y comentario.** `@@` ⇒ `at-escape`. `@* hola *@` ⇒ `razor-comment` cubriendo
   todo. `@* sin cierre` ⇒ `razor-comment` degradado + `FUD0011`.

8. **Doctype y comentario HTML.** `<!DOCTYPE html>` ⇒ `doctype`. `<!-- x -->` ⇒
   `html-comment`. `<!-- x` (sin cierre) ⇒ `html-comment` degradado + `FUD0012`.

9. **`<script>` opaco (decisión 43).** `<script>const x=@y;</script>` ⇒ `tag-open-start`,
   `tag-open-end`, **un** `raw-text`(element `script`) con el cuerpo literal `const x=@y;`
   (el `@` **no** dispara nada dentro), `tag-close`. Push/pop de modo `raw` verificado.

10. **`<title>` con Razor (resolución §4.6).** `<title>@data.title</title>` ⇒
    `tag-open-start`, `tag-open-end`, `at-trigger`, …, `tag-close`. (Test sujeto a la
    confirmación de §4.6.)

11. **`<style>` push css (placeholder §4.7).** `<style host="x">:host{}</style>` ⇒
    `tag-open-start`(`style`) con atributos, `tag-open-end`, push `css`, cuerpo provisional,
    pop, `tag-close`.

12. **Balanceador sin cerrar aflora.** `@(a + b` ⇒ `explicit-expr` degradado y un
    diagnóstico `FUD0002` (del balanceador) en el `ParseResult` de ese `next()`.

13. **EOF idempotente.** Tras consumir todo, `next()` y `peek()` devuelven `eof` siempre.

14. **Cobertura.** El módulo del lexer se acerca al 100 % de líneas/funciones/ramas; los
    casos de arriba cubren las ramas de cada modo. Cumple el suelo del SDD-00 (80/80/75).

---

## 7. Fuera de alcance

- **La gramática del `@`.** Distinguir keyword vs implícita, el límite de la expresión
  implícita (decisiones 2, 3), las cabeceras de control (`@if`/`@foreach`/`@code`) y el
  push de modo `js`: **SDD-04** (y SDD-06/08). El tokenizer solo emite `at-trigger` y los
  átomos léxicos.
- **Validación del JS opaco.** El contenido de `explicit-expr`/`inline-code`/`raw` no se
  valida aquí; lo parsea Oxc en **SDD-11** a partir del `BalancedGroup`.
- **Producción de tokens CSS.** Lista blanca de at-rules, `@` con desambiguación, nesting
  (decisión 42): **SDD-09**. Aquí solo el push/pop del modo `css` y un placeholder opaco.
- **Construcción del árbol HTML.** Elementos, anidamiento, void elements (decisión 39),
  atributos duplicados (45), interpretación event/property/static de los atributos:
  **SDD-05** (y SDD-07 para bindings). El tokenizer da los tokens, no el árbol.
- **`LineMap` / línea-columna.** **SDD-13**. Aquí todo es offset.
- **Decisión síncrono/asíncrono de Oxc.** **SDD-11**.
