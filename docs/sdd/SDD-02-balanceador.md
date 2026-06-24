# SDD-02 — Balanceador de delimitadores

> **Estado:** `Listo`
> **Depende de:** 00, 01
> **Decisiones de gramática:** 6 (más las notas "Delegación a Oxc")

---

## 1. Contexto y objetivo

El compilador delega el parsing de JS/TS a **Oxc**, pero Oxc parsea un programa o un
fragmento completo: no sabe dónde, dentro del texto de un fichero `.fud`, **termina** una
expresión Razor. Esa frontera la marca el delimitador de cierre que casa con el de
apertura — el `)` de `@(...)`, el `}` de `@code { ... }` o de una cabecera con cuerpo. Y
localizar ese cierre exige entender la estructura léxica de JS lo justo para **no
contar** los delimitadores que viven dentro de un string, un comentario, un template o
una expresión regular.

Este SDD entrega ese **escáner léxico propio**: el *balanceador*. Dado el offset de un
delimitador de apertura, avanza carácter a carácter contando profundidad de paréntesis,
brackets y llaves —saltándose las zonas opacas— hasta el cierre que equilibra la
apertura. Es la pieza que la decisión 6 nombra como "balanceador propio cuenta
delimitadores ... hasta el `)` de cierre, luego pasa el substring a Oxc para validar".

El balanceador hace **solo** eso:

- **Localiza el límite** y devuelve su `Span`.
- **Describe las regiones léxicas** que atravesó (strings, templates, comentarios, regex),
  como una tabla que SDD-11 reaprovecha al construir el buffer sintético para Oxc, sin
  reescanear.

Y **no** hace, deliberadamente:

- **No valida el JS.** No comprueba que la expresión sea sintácticamente correcta; eso es
  Oxc (SDD-11). El balanceador solo equilibra delimitadores.
- **No toca la pila de modos.** `ModeStack` la empujan y desapilan el tokenizer y las
  reglas del `@` (SDD-03/04). El balanceador es una función pura sin estado de parser.
- **No conoce el `@`.** No sabe nada de expresiones implícitas, keywords de control ni
  email-heuristics. Recibe un offset que ya apunta a un delimitador; quién lo coloca ahí
  es asunto del llamante.

**Repo limpio.** Del prototipo `compiler-master` (2019) se hereda únicamente la *idea* de
que el conteo de delimitadores con conciencia léxica es responsabilidad del framework, no
de Babel/Oxc. El algoritmo se escribe desde cero; no se importa parse5, Babel ni código
del prototipo.

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | Monorepo pnpm, `@fudic/compiler`, TS 5.9 estricto, Vitest 4.1. |
| 01 | `Hecho` | Tipos base que este módulo consume sin redefinir. |

Las firmas concretas de SDD-01 que este SDD usa:

```ts
import { type Span, span, mergeSpans, emptySpan } from '../types/index.js';
import { type Diagnostic, errorDiag } from '../types/index.js';
import { type ParseResult, ok, withDiagnostics } from '../types/index.js';
```

- `span(start, end)`, `emptySpan(at)`, `mergeSpans(a, b)` para construir los rangos.
- `errorDiag(code, message, span)` para los diagnósticos (severidad `error`).
- `ok(value)` / `withDiagnostics(value, diags)` para el resultado uniforme.

> **Nota TS estricto (heredado del 00).** `exactOptionalPropertyTypes` y
> `noUncheckedIndexedAccess` están activos. El balanceador indexa el `source` por offset
> de forma intensiva: cada acceso `source[i]` es `string | undefined` y debe tratarse
> como tal (un offset fuera de rango es EOF, no un bug). Los campos de los tipos de §3 no
> son opcionales, así que no hay `| undefined` que relajar.

Ninguna dependencia de Oxc en este SDD: el balanceador es JS puro y no invoca al parser
nativo. La integración con Oxc consume su salida en SDD-11.

---

## 3. Interfaz pública

Las firmas siguientes son **el contrato**. Ubicación canónica:
`packages/compiler/src/balancer/balancer.ts`, reexportado desde
`packages/compiler/src/balancer/index.ts` y, a su vez, desde la raíz del paquete cuando
proceda. Todo en inglés.

### 3.1. Regiones léxicas

```ts
/**
 * Kind of opaque lexical region the balancer skipped over while counting. These
 * are the JS constructs inside which delimiters DO NOT count toward balancing.
 * 'template' covers the whole template literal; its `${ ... }` interpolations are
 * NOT opaque (delimiters inside them count again) and are not listed as regions.
 */
export type LexRegionKind =
  | 'string' // '...' or "..."
  | 'template' // `...` (including its `${}` substitutions, as one region)
  | 'line-comment' // // ... up to end of line
  | 'block-comment' // /* ... */
  | 'regex'; // /.../flags

/**
 * One opaque region found inside a balanced group. Its span covers the region in
 * full, delimiters included (the quotes, the slashes, the comment markers). The
 * balancer already walked every one of these while scanning; emitting them lets
 * SDD-11 reuse the work instead of re-lexing the substring for Oxc.
 */
export interface LexRegion {
  readonly kind: LexRegionKind;
  readonly span: Span;
}
```

### 3.2. Grupo balanceado

```ts
/**
 * Result of balancing a delimited group. The `value` is ALWAYS present, even when
 * the group is not closed (degraded result): the parser never throws (SDD-01).
 */
export interface BalancedGroup {
  /**
   * The full group, opening delimiter included. When `closed` is true, the closing
   * delimiter is included too: [openOffset, closeOffset + 1). When `closed` is false
   * (EOF reached first), it runs to the end of source: [openOffset, source.length).
   */
  readonly span: Span;

  /**
   * The content BETWEEN the delimiters — what gets handed to Oxc. When `closed`:
   * [openOffset + 1, closeOffset). When not closed: [openOffset + 1, source.length).
   * Empty span when the group is empty (e.g. `()`).
   */
  readonly inner: Span;

  /**
   * True iff the matching closing delimiter was found. False ⇒ EOF was reached
   * first and the result is degraded; a diagnostic is present in the ParseResult.
   * Kept on the value (not derived from diagnostics) so consumers can branch
   * without inspecting the diagnostics list.
   */
  readonly closed: boolean;

  /** Opaque lexical regions found inside the group, in source order. */
  readonly regions: readonly LexRegion[];
}
```

### 3.3. Funciones de escaneo

```ts
/** The closing delimiters the balancer understands. The opener is implied by it. */
export type Closer = ')' | ']' | '}';

/**
 * Scans a balanced delimited group. `openOffset` MUST point at the opening
 * delimiter that pairs with `closer` ( '(' for ')', '[' for ']', '{' for '}' ).
 * Walks forward counting nesting depth across all three delimiter pairs, skipping
 * strings, templates, comments and regex literals, until the delimiter that closes
 * `openOffset` is found.
 *
 * Never throws. On unterminated input (EOF before the closer, or an unterminated
 * string/template/comment/regex) it returns a degraded BalancedGroup (`closed: false`)
 * plus a located Diagnostic. If `openOffset` does not point at the expected opener
 * (caller bug) it returns an empty degraded group with FUD0007 and does not scan.
 */
export function scanBalanced(
  source: string,
  openOffset: number,
  closer: Closer,
): ParseResult<BalancedGroup>;

/** Thin wrapper: scans a `( ... )` group. `at` points at the `(`. */
export function scanParens(source: string, at: number): ParseResult<BalancedGroup>;

/** Thin wrapper: scans a `[ ... ]` group. `at` points at the `[`. */
export function scanBrackets(source: string, at: number): ParseResult<BalancedGroup>;

/** Thin wrapper: scans a `{ ... }` group. `at` points at the `{`. */
export function scanBraces(source: string, at: number): ParseResult<BalancedGroup>;
```

> **Por qué una sola función núcleo.** Las tres formas (`()`, `[]`, `{}`) comparten el
> 100 % del algoritmo de conteo y de reconocimiento de zonas opacas; lo único que cambia
> es qué cierre concreto equilibra la apertura. Un núcleo parametrizado por `closer` con
> tres envoltorios finos es la forma SOLID: una sola responsabilidad, un solo punto donde
> vive la lógica de regex/strings/templates. Los envoltorios existen para que cada sitio
> de llamada (SDD-04/06/08) se lea como su intención (`scanParens` en `@(...)`, `scanBraces`
> en `@code { ... }`).

---

## 4. Comportamiento

Anclado a la **decisión 6** y a las notas "Delegación a Oxc" de
`gramatica-v1-decisiones.md`.

### 4.1. Verificación de la apertura

`scanBalanced` empieza comprobando que `source[openOffset]` es el opener que corresponde
a `closer` (`(`→`)`, `[`→`]`, `{`→`}`). Si no lo es —un bug de la fase llamante—, **no
escanea**: devuelve un `BalancedGroup` degradado vacío (`span` y `inner` =
`emptySpan(openOffset)`, `closed: false`, `regions: []`) y un diagnóstico `FUD0007`
localizado en `emptySpan(openOffset)`. No lanza, igual que `ModeStack.pop` en SDD-01 ante
un pop de más.

### 4.2. Conteo de delimitadores

Tras consumir la apertura (profundidad = 1), se avanza carácter a carácter en lo que se
considera "código" (fuera de zonas opacas):

- Cualquiera de `(`, `[`, `{` incrementa la profundidad **de su propio tipo**.
- Cualquiera de `)`, `]`, `}` decrementa la del suyo.
- Cuando la profundidad del tipo de `closer` vuelve a 0, ese carácter es el cierre: se
  termina con `closed: true`.

El conteo es por tipo de delimitador y se equilibra de forma independiente, suficiente
para v1: el balanceador localiza el cierre, y Oxc valida después que el anidamiento sea
realmente correcto (p. ej. `( ] )` lo acepta el balanceador como cierre en el `)` y lo
rechaza Oxc). Esta división de trabajo es la propia decisión 6.

### 4.3. Zonas opacas y su terminación

Dentro de estas zonas, los delimitadores **no** cuentan. Cada zona reconocida se añade a
`regions` con su `kind` y su `span` (delimitadores incluidos). Terminación de cada una:

- **String** `'...'` / `"..."` — termina en la comilla del mismo tipo. `\` escapa el
  siguiente carácter (incluida la comilla). Si llega un fin de línea o EOF sin cerrar:
  diagnóstico `FUD0003` y se da por cerrada en EOF (degradación).
- **Template** `` `...` `` — termina en el backtick de cierre. `\` escapa. Una secuencia
  `${` abre una **interpolación**: dentro de ella el texto es código otra vez (los
  delimitadores cuentan, y se pueden anidar más templates), y se cierra con el `}` que
  equilibra ese `${`. La región `template` cubre el template completo, interpolaciones
  incluidas. Sin cerrar a EOF: `FUD0004`.
- **Comentario de línea** `// ...` — termina en el siguiente `\n` (no incluido) o en EOF.
  Nunca es un error (un comentario de línea sin `\n` final es válido).
- **Comentario de bloque** `/* ... */` — termina en `*/`. Sin cerrar a EOF: `FUD0005`.
- **Regex** `/.../flags` — termina en el `/` de cierre que no esté dentro de una clase
  `[...]` (dentro de la clase, `/` es literal) ni escapado por `\`. Tras el `/` de cierre
  se consumen las flags (`[a-z]*`). Sin cerrar a fin de línea o EOF: `FUD0006`.

### 4.4. Regex vs división — el carácter `/`

Un `/` en "código" es **inicio de regex** o el **operador división/inicio de comentario**.
Se distingue por la **clase del último token significativo** (los blancos y los comentarios
no son significativos), método estándar de lexer:

- Si el último token significativo es **value-producing**, el `/` es **división** (o `//`
  / `/*` si le sigue `/` o `*`). Son value-producing:
  - un identificador que **no** sea de los keywords de la lista de abajo,
  - un literal numérico,
  - un string o un template ya cerrados,
  - una regex ya cerrada,
  - un `)` o un `]` de cierre,
  - los keywords-valor `this`, `super`, `true`, `false`, `null`.
- En cualquier otro caso (principio del grupo, tras `(` `[` `{` `,` `;` `:` `=` y demás
  operadores, tras `=>`, o tras un keyword de los que **fuerzan expresión**), el `/` es
  **inicio de regex**.

Keywords que **fuerzan regex** (no son value-producing aunque sean identificadores):
`return`, `typeof`, `instanceof`, `in`, `of`, `new`, `delete`, `void`, `do`, `else`,
`yield`, `await`, `case`.

El balanceador mantiene para esto un único estado mínimo: la clase del último token
significativo emitido. No construye un AST ni una lista de tokens; solo recuerda "lo
anterior era un valor / no lo era".

**Limitación documentada (borde conocido v1).** El `}` que cierra un *bloque* de sentencias
seguido de `/` (p. ej. `if (x) { ... } /re/.test(y)`) es ambiguo sin parsear: tras un
bloque, `/` es regex; tras un objeto literal, es división. El balanceador trata `}` como
**no** value-producing (lo trata como cierre de bloque → siguiente `/` es regex), que es
lo correcto en contexto de sentencia. En contexto de *expresión* `@(...)` este caso no
aparece (no hay bloques de sentencias), y si surgiera un mis-balanceo, Oxc lo reportaría
aguas abajo al validar el substring. Igual ocurre con el rarísimo `)` de una cabecera de
control seguido de regex en `@code`; se acepta el mismo criterio que cualquier lexer
pragmático. No se intenta resolver con parsing en v1.

### 4.5. Degradación ante EOF

Si se alcanza el final de `source` con profundidad > 0 (nunca llegó el cierre), el
resultado es degradado: `closed: false`, `span` = `[openOffset, source.length)`, `inner`
= `[openOffset + 1, source.length)`, `regions` con todo lo hallado, y un diagnóstico
`FUD0002` localizado en `emptySpan(source.length)` (el punto donde se esperaba el cierre).
Si la causa raíz fue una zona opaca sin terminar, el diagnóstico es el específico de esa
zona (`FUD0003`..`FUD0006`) en lugar de —o además de— `FUD0002`; la implementación emite
el más específico y no duplica.

### 4.6. Catálogo de códigos `FUD` de este SDD

SDD-02 reserva el rango **`FUD0002`–`FUD0009`** (SDD-01 fijó `FUD0001`). Definidos:

| Código | Significado |
|---|---|
| `FUD0002` | Grupo delimitado sin cerrar (EOF antes del cierre). |
| `FUD0003` | String literal sin terminar. |
| `FUD0004` | Template literal sin terminar. |
| `FUD0005` | Comentario de bloque sin terminar. |
| `FUD0006` | Expresión regular sin terminar. |
| `FUD0007` | El offset de apertura no apunta al delimitador esperado (bug del llamante). |

`FUD0008`–`FUD0009` quedan libres para ampliación dentro de este SDD. El catálogo
consolidado vive en SDD-12.

---

## 5. Invariantes LSP

- **Spans en todo.** `BalancedGroup.span`, `.inner`, la `span` de cada `LexRegion` y la de
  cada `Diagnostic` son obligatorias y en offsets UTF-16 sobre el `source` original. No se
  guardan líneas/columnas.
- **El parser nunca lanza.** `scanBalanced` devuelve siempre un `ParseResult<BalancedGroup>`
  con `value` presente, degradado si hace falta. EOF, zonas sin terminar y opener
  incorrecto se modelan como diagnósticos, no como excepciones.
- **Navegabilidad por offset.** Todos los spans devueltos son consultables con
  `spanContains`; la tabla de regiones permite, dado un offset, saber si cae dentro de un
  string/comentario/regex sin reescanear (útil para el language server: hover, no
  autocompletar dentro de un comentario, etc.).
- **Forma apta para reparseo incremental.** `scanBalanced` es una **función pura**: no
  muta `source`, no guarda estado global, su salida depende solo de los argumentos. Un
  reparseo futuro puede reinvocarla sobre una subcadena sin efectos de orden.

---

## 6. Criterios de aceptación

El SDD está `Hecho` cuando, sobre `@fudic/compiler`:

1. **Typecheck.** `pnpm typecheck` pasa con los tipos de §3 definidos y reexportados.

2. **Balanceo anidado básico** (`closed: true`, `span` e `inner` correctos):
   - `scanParens('(a(b)c)', 0)` ⇒ `span [0,7)`, `inner [1,6)`, `regions: []`.
   - `scanBrackets('[a[b]c]', 0)` ⇒ `span [0,7)`, `inner [1,6)`.
   - `scanBraces('{a{b}c}', 0)` ⇒ `span [0,7)`, `inner [1,6)`.
   - `scanParens('()', 0)` ⇒ `inner` vacío (`[1,1)`), `closed: true`.

3. **Delimitadores dentro de zonas opacas NO cuentan:**
   - `scanParens('("a)b")', 0)` ⇒ `closed: true`, `span [0,7)`, una región `string` en
     `[1,6)`.
   - `scanParens('(/* ) */)', 0)` ⇒ `closed: true`, una región `block-comment`.
   - `scanParens('(/[)]/)', 0)` ⇒ `closed: true`, una región `regex` (`/[)]/`); el `)`
     interno no cierra.
   - `scanParens("('a\\')b')", 0)` (comilla escapada) ⇒ el string no termina en la comilla
     escapada.

4. **Template con `${}` que reabre el conteo:**
   - ``scanParens('(`x${ f(`)`) }y`)', 0)`` ⇒ `closed: true`; el `)` dentro de `f(...)` en
     la interpolación cuenta y se equilibra; la región `template` cubre todo el template.

5. **Regex vs división (clase de token anterior):**
   - En `'(a / b)'`: el `/` es división → 0 regiones `regex`.
   - En `'(return /x/)'`: el `/` es regex → 1 región `regex` `/x/`.
   - En `'(x => /a/)'`: regex tras `=>`.
   - En `'(f() /2/g)'`: tras `)` value-producing, `/` es división → 0 `regex`.
   - En `'([1] , /a/)'`: tras `,`, `/` es regex.

6. **Degradación ante EOF** (no lanza):
   - `scanParens('(a + b', 0)` ⇒ `closed: false`, `span [0,6)`, `inner [1,6)`, **un**
     diagnóstico `FUD0002` `severity: 'error'` en `emptySpan(6)`.
   - `scanParens('("abc)', 0)` ⇒ `closed: false`, diagnóstico `FUD0003` (string sin
     terminar).
   - ``scanParens('(`abc)', 0)`` ⇒ `FUD0004`.
   - `scanParens('(/* abc)', 0)` ⇒ `FUD0005`.
   - `scanParens('(/abc)', 0)` (regex sin cerrar en la línea) ⇒ `FUD0006`.

7. **Opener incorrecto** (bug del llamante, no lanza):
   - `scanParens('xyz', 0)` (no hay `(` en 0) ⇒ `closed: false`, `span`/`inner`
     `emptySpan(0)`, un diagnóstico `FUD0007`.

8. **Tabla de regiones completa y ordenada:**
   - `scanParens('( "s" /* c */ /re/ )', 0)` ⇒ `regions` en orden de aparición:
     `string`, `block-comment`, `regex`, cada una con su `span` exacto.

9. **Cobertura.** El módulo del balanceador se acerca al 100 % de líneas/funciones/ramas
   (escáner puro, sin dependencias externas; los casos límite de §6 cubren las ramas).
   Cumple holgadamente el suelo del SDD-00 (80/80/75).

---

## 7. Fuera de alcance

- **Validación del JS/TS.** El balanceador no comprueba que el contenido sea una expresión
  o sentencia válida; solo equilibra delimitadores. El parsing y la validación del AST son
  de **Oxc / SDD-11**, que recibe `inner` como substring.
- **Construcción del buffer sintético para Oxc.** Acumular varios fragmentos en un único
  buffer con tabla de regiones para invocar Oxc una sola vez por fichero es de **SDD-11**;
  aquí solo se produce la `LexRegion[]` que aquel consumirá.
- **`ModeStack` push/pop.** Las transiciones de modo del parser son de **SDD-03/04**. El
  balanceador es una función pura ajena a la pila de modos.
- **Reglas de transición del `@`.** Cómo se decide que en cierto offset empieza un
  `@(...)`, una expresión implícita, un `@code`, etc., es de **SDD-04**. El balanceador
  recibe el offset ya resuelto.
- **CSS y la lista blanca de at-rules.** El conteo de llaves en `<style>` (decisión 42.e)
  lo aborda **SDD-09**; podrá reutilizar `scanBraces`, pero las reglas de desambiguación
  CSS no se definen aquí.
- **Conversión offset↔línea/columna.** El `LineMap` es de **SDD-13**; aquí todo es offset.
