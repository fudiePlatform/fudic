# SDD-08 — Bloque `@code` (server / client / neutral)

> **Estado:** `Hecho`
> **Depende de:** 00, 02, 04, 05
> **Decisiones de gramática:** 32–34, 66 (63–65 retiradas: ver §1)

---

## 1. Contexto y objetivo

SDD-05 delega el `@code` por inversión de dependencias: al resolver el trigger a
`kind: 'code-block'`, llama a `AtConstructParser.parseCodeBlock(ctx, keywordSpan)` con el
lexer justo tras `code`. **SDD-08 es esa implementación.**

El cuerpo de `@code { … }` es **JS**, no HTML. Dentro aparecen dos regiones Razor genuinas
(decisión 32) — `@server { … }` y `@client { … }` — separadas por **JS neutro**.
SDD-08 **delimita** las tres cosas (neutro, server, client) como spans independientes que
Oxc valida por separado (SDD-11); **no** parsea el JS.

SDD-08 posee la puntuación Razor del bloque (`@code`/`@server`/`@client` y las llaves) y las
validaciones **sintácticas** (decisión 66). **No** posee: número de `@code` por componente
(33.d) ni su ubicación (SDD-10); "máximo un `@server`/`@client`" y "no anidables" (33.a/b) y
"neutro sin side-effects" (33.c) → **semántica, SDD-12**; la validez del JS → **Oxc, SDD-11**.

> **Ni `@server` ni `@client` admiten parámetro** (decisión 66, ampliada). Las estrategias de
> hidratación declaradas por el componente (antiguas decisiones 63–65) están **retiradas**: un
> componente se coloca donde el consumidor quiera y su código no puede declarar cuándo se
> hidrata. La hidratación la gobierna el capturador global de SDD-17.

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | Monorepo, TS estricto, Vitest. |
| 01 | `Hecho` | `Node`, `Span`, `Diagnostic`/`errorDiag`, `ParseResult`. *(vía 05)* |
| 02 | `Hecho` | `BalancedGroup`, `scanBraces` — para delimitar `@code { … }` y cada `{ … }` de región. |
| 04 | `Hecho` | Clasifica `code` → `kind: 'code-block'` y enruta a SDD-08. |
| 05 | `Hecho` | `HtmlParseContext` (`source`, `lexer`), `RazorConstruct`, `AtConstructParser`. |

```ts
import { type Node, type Span, span, mergeSpans } from '../types/index.js';
import { type Diagnostic, errorDiag, type ParseResult } from '../types/index.js';
import { type BalancedGroup, scanBraces } from '../balancer/index.js';
import { type HtmlParseContext, type RazorConstruct } from '../html/index.js';
```

> **SDD-08 no usa `ctx.parseContentUntil`.** Ese seam es para cuerpos HTML; el cuerpo de
> `@code` es JS. SDD-08 trabaja sobre `ctx.source` con el balanceador y reposiciona el lexer
> con `seekTo` al terminar.

---

## 3. Interfaz pública

Ubicación: `packages/compiler/src/code/` (`nodes.ts`, `code.ts`, reexportados desde
`code/index.ts`). Todo en inglés.

```ts
/** `@code { … }` — one container per component (33.d is enforced in SDD-10). */
export interface CodeBlockNode extends Node {
  readonly type: 'code';
  /** Neutral JS chunks and `@server`/`@client` regions, in source order (free order, 34). */
  readonly parts: readonly CodePart[];
}

export type CodePart = NeutralJs | ServerRegion | ClientRegion;

/** JS between the braces / between regions. Independent Oxc fragment (32). Whitespace-only
 *  chunks are omitted. Side-effect restriction (33.c) is semantic. */
export interface NeutralJs extends Node {
  readonly type: 'neutral-js';
  readonly js: Span;
}

/** `@server { js }` (32). `@server(…)` is an error (66). Independent server Oxc fragment. */
export interface ServerRegion extends Node {
  readonly type: 'server-region';
  /** Inner of the `{ … }` (to Oxc). */
  readonly js: Span;
}
// En una región, `span` cubre el marcador entero (`@server { … }`, `@` incluido) y `js` solo
// el interior de las llaves. En un `NeutralJs`, `span` y `js` coinciden: el tramo neutro no
// es más que su JS. (Corrección de implementación: §3 no decía qué era `span` en cada parte.)

/** `@client { js }` (32). Independent client Oxc fragment. No parameter (66). */
export interface ClientRegion extends Node {
  readonly type: 'client-region';
  readonly js: Span;
}

/**
 * Parse a `@code { … }` block. `ctx.lexer` sits right after `keywordSpan.end` (`code`).
 * Delimits the body with `scanBraces`, then splits it into neutral JS chunks and
 * `@server`/`@client` regions. Never throws; leaves the lexer past the closing `}`.
 * Signature-compatible with `AtConstructParser.parseCodeBlock`.
 */
export function parseCodeBlock(ctx: HtmlParseContext, keywordSpan: Span): ParseResult<CodeBlockNode>;
```

---

## 4. Comportamiento

### 4.1. Delimitar el cuerpo

Desde `keywordSpan.end`: saltar `WS*`, esperar `{` → `FUD0110` si falta. `scanBraces(source,
offsetDe'{')` delimita todo el `@code { … }` (cuenta correctamente las llaves anidadas de las
regiones y del JS). Cuerpo = `group.inner`. Si no cierra, `FUD0002` del balanceador aflora.
`seekTo(group.span.end)`. El `span` del nodo cubre `@code … }`.

> **Corrección (de dónde sale el `@`).** El `span` del nodo debe empezar en el `@`, pero
> `parseCodeBlock` solo recibe `keywordSpan`, que por contrato de SDD-04 cubre **el
> identificador `code` y nunca el `@` que lo precede** — y no recibe el offset del trigger.
> El `@` se deriva, pues, como `keywordSpan.start - 1`, que es exactamente lo que SDD-05
> hace en su propio `#unhandled`. La implementación comprueba que ahí haya de verdad un
> `@` y, si no (span construido a mano, jamás producido por SDD-04), arranca el nodo en
> `keywordSpan.start` en vez de inventarse un offset anterior al construct.

Si tras `@code` no hay `{`, el valor degradado es un `CodeBlockNode` con `parts: []` y
`span` = `@code`; el lexer no se mueve (SDD-05 ya lo dejó en `keywordSpan.end`, así que el
bucle de contenido progresa igual y el texto siguiente se tokeniza como HTML).

### 4.2. Escaneo de marcadores de región

Sobre el cuerpo, SDD-08 avanza a **nivel superior**, saltando —vía el balanceador— strings,
templates, comentarios, regex y cualquier grupo anidado `(`/`[`/`{`. Solo dos cosas cortan el
JS neutro: un **`@server`** o un **`@client`** con frontera de palabra (seguido de `(`, `{` o
whitespace). Cualquier otro `@…` (p. ej. un decorador TS `@Component`) **es JS neutro** y se
deja para Oxc.

- El tramo `[inicio, marcador)` es un `NeutralJs` (omitido si es solo whitespace).
- **`@server`** → si le sigue `(` es error `FUD0111` (decisión 66). Saltar `WS*`, esperar `{`
  (`FUD0110`), `scanBraces` → `ServerRegion` con `js` = inner. Continuar tras el `}`.
- **`@client`** → simétrico a `@server`: si le sigue `(` es error `FUD0111` (decisión 66,
  ampliada). Saltar `WS*`, esperar `{` (`FUD0110`), `scanBraces` → `ClientRegion`. Continuar
  tras el `}`.

Al llegar al final del cuerpo, el último tramo neutro se cierra. **SDD-08 no desciende** en el
`{ … }` de una región (es JS opaco para Oxc): por eso un `@server`/`@client` **anidado** no lo
ve SDD-08 (queda dentro del JS de la región) — su detección limpia es semántica (§6, nota 2).

> **Corrección (cómo se salta lo opaco: el balanceador no tiene esa API).** §4.2 pedía
> saltar strings/templates/comentarios/regex «vía el balanceador», pero SDD-02 solo expone
> `scanBalanced(source, offsetDelAbridor, closer)`: sabe recorrer **grupos**, no «sáltame la
> siguiente región opaca». Reimplementar aquí un mini-lexer de JS (con la heurística
> regex-vs-división incluida) sería duplicar SDD-02, así que la implementación reutiliza el
> trabajo que el balanceador **ya hizo**: el único `scanBraces` del cuerpo devuelve
> `group.regions`, la lista **completa y ordenada** de regiones opacas a cualquier
> profundidad. El escaneo de marcadores es entonces una pasada lineal sobre el cuerpo que
> (a) salta cualquier offset que caiga dentro de una región, avanzando un puntero sobre esa
> lista ya ordenada, y (b) lleva un **contador de profundidad** de `(`/`[`/`{` para que un
> `@server` escrito dentro de un grupo anidado no cuente como marcador de nivel superior.
> Una sola pasada, cero lógica de lexing JS duplicada.
>
> El contador se satura en 0 al decrementar: con un bloque sin cerrar el cuerpo llega hasta
> EOF y puede arrastrar cierres huérfanos, y una profundidad negativa dejaría ciego el
> escáner para todos los marcadores posteriores.

> **Corrección (recuperación tras `FUD0111`).** §4.2 decía que `@server(…)` es error pero no
> qué se hace después. Se resuelve por el criterio LSP: **emitir `FUD0111`, saltar el grupo
> de paréntesis y seguir con el `WS* {` normal**, de modo que la región *sí* se delimita y
> se emite su nodo. El editor conserva un `ServerRegion`/`ClientRegion` navegable y con su
> JS listo para Oxc; el usuario solo ve el error del parámetro, no una cascada.

> **Corrección (recuperación tras `FUD0110` en un marcador).** Si tras `@server`/`@client`
> no hay `{`, se emite `FUD0110` y **no se crea nodo de región**: el marcador se queda
> dentro del tramo neutro que ya se estaba acumulando (no se corta el chunk). Así el cuerpo
> sigue cubierto sin huecos, en vez de perderse un trozo de texto entre dos partes.

> **Corrección (frontera de palabra al final del cuerpo).** La regla «seguido de `(`, `{` o
> whitespace» implica que un `@server` pegado al `}` que cierra el `@code` (o a EOF) **no
> es** marcador y queda como JS neutro. Es coherente: sin llaves no hay región que delimitar,
> y Oxc rechazará ese JS de todos modos.

### 4.3. Qué NO valida SDD-08

- **Máximo un `@server` y un `@client`** (33.b) y **no anidación** (33.a): SDD-08 recoge
  **todas** las regiones de nivel superior en `parts` (aunque haya duplicados); el conteo y la
  unicidad son **semántica (SDD-12)**.
- **Neutro sin side-effects** (33.c), **imports elevados** (33.c): emit/semántica.
- **Cero o un `@code`** (33.d) y su ubicación (`<head>` en página): **SDD-10**.
- **Validez del JS** de cada `NeutralJs`/`ServerRegion`/`ClientRegion`: **Oxc (SDD-11)**.

### 4.4. Códigos `FUD`

SDD-08 reserva **`FUD0110`–`FUD0129`**. Definidos:

| Código | Significado |
|---|---|
| `FUD0110` | Falta `{` tras `@code` / `@server` / `@client`. |
| `FUD0111` | `@server` / `@client` no admiten parámetro (decisión 66): `@server(…)`, `@client(…)`. |
| `FUD0114` | Comentario Razor dentro de `@code` (decisión 35.a, BUG-13): dentro del bloque se comenta con `//` y `/* */`. Uno por comentario, con el span completo del `@*` al `*@`, en cualquiera de las tres posiciones —zona neutra, `@server`, `@client`—. El texto **no** se recorta: el comentario se queda en su chunk, como el marcador sin `{` se queda tras un `FUD0110`. El balanceador lo trata como región opaca, así que sus llaves no cuentan y el bloque cierra en su `}`. |

`FUD0112`–`FUD0129` libres salvo `FUD0114` (`FUD0112`/`FUD0113` quedan **quemados**: eran la whitelist y los
paréntesis de estrategia, retirados con las decisiones 63–65). El `FUD0002` del balanceador (cuerpo/región sin cerrar) aflora sin
renumerarse.

---

## 5. Invariantes LSP

- **Spans en todo.** `CodeBlockNode`, cada `CodePart` (`.js`) y cada
  `Diagnostic` llevan offset UTF-16. Las partes van **en orden de fuente y sin solapes**.
  *(Corrección: la redacción original decía que «cubren el cuerpo», y no es cierto — §3
  manda omitir los tramos neutros que son solo whitespace, así que entre dos partes puede
  quedar hueco en blanco. Lo que sí se garantiza es orden y no solape.)*
- **Nunca lanza.** Falta de `{`, parámetro en `@server`/`@client` y cuerpo/región sin cerrar
  → resultado degradado + diagnóstico (el `FUD0002` burbujea), nunca excepción.
- **Fragmentos JS aislados (decisión 32).** Cada `.js` es un span independiente listo para que
  SDD-11 lo acumule en el buffer sintético de Oxc. SDD-08 no invoca a Oxc.
- **DIP.** SDD-08 implementa `AtConstructParser.parseCodeBlock` de SDD-05; grafo acíclico.

---

## 6. Criterios de aceptación

Entradas reales (fixtures) → nodo esperado. El SDD está `Hecho` cuando:

1. **Typecheck.** `pnpm typecheck` pasa con §3 definido y reexportado.

2. **`@code` con neutro + server.** `@code { type User = {…}; @server { import {db} from './db'; async function load(){…} } }`
   ⇒ `CodeBlockNode` con `parts` = `[NeutralJs(type User…), ServerRegion(js = import…load…)]`.

3. **`@client` con neutro.** `@code { @client { import {signal} from '@f'; const s = signal(false); } }`
   ⇒ `parts` = `[ClientRegion]`.

4. **`@client` no admite parámetro (decisión 66).** `@client(viewport) { … }` ⇒ `FUD0111`.

5. **`@server(…)` (decisión 66).** `@server(x) { … }` ⇒ `FUD0111`.

6. **Orden libre (decisión 34).** `@code { @client { … } const K = 1; @server { … } }` ⇒
   `parts` = `[ClientRegion, NeutralJs, ServerRegion]` en ese orden.

7. **Decorador no es marcador.** `@code { @Component() class X {} }` ⇒ un único `NeutralJs`
   (el `@Component` es JS, no región). Ningún `ServerRegion`/`ClientRegion`.

8. **`@code` vacío.** `@code {}` ⇒ `CodeBlockNode` con `parts` = `[]`.

9. **Degradaciones.** `@code type X` (sin `{`) ⇒ `FUD0110`. `@code { @server { …` en EOF ⇒
   `FUD0002` (sin cerrar). Nunca lanza.

   *(Precisión de implementación: ese último caso emite **dos** `FUD0002`, uno por el bloque
   `@code` sin cerrar y otro por la región sin cerrar. Se aceptan los dos: ambos son ciertos
   y cada uno apunta a una llave distinta que el usuario tiene que cerrar. El criterio se
   verifica con «contiene `FUD0002`», no con «es exactamente `[FUD0002]`».)*

10. **Cobertura.** Cerca del 100 % de líneas/funciones/ramas (los casos cubren el escaneo de
    marcadores y las degradaciones). Cumple el suelo del SDD-00 (80/80/75).

---

## 7. Notas (no bloquean)

1. **Grammar vs decisión 34.** La gramática de referencia (`code_content`) dibuja un orden
   fijo `neutral server neutral client neutral`; la **decisión 34 (orden libre) manda**.
   SDD-08 acepta cualquier intercalado. Conviene alinear el EBNF en `gramatica-v1-decisiones.md`.

2. **Anidación `@server`/`@client` (33.a).** Como SDD-08 no entra en el JS de una región, un
   marcador anidado queda dentro de JS opaco y lo rechazaría **Oxc** (no un diagnóstico 33.a
   limpio). Para un error 33.a legible, **SDD-12** debe escanear el texto de cada región en
   busca de `@server`/`@client`. Es coherente con "33.a es semántico" del doc de gramática.

---

## 8. Fuera de alcance

- **Reglas de documento:** cero/un `@code` (33.d), ubicación en `<head>` en página (60),
  orden top-level (53): **SDD-10**.
- **Unicidad y anidación de regiones (33.a/b), neutro puro (33.c):** **SDD-12**.
- **Elevación/dedupe de imports (33.c):** emit (SDD-14).
- **Validación del JS** de neutro y regiones: **Oxc (SDD-11)**.
- **`LineMap` / línea-columna:** **SDD-13**.
