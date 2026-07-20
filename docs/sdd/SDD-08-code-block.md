# SDD-08 — Bloque `@code` (server / client / neutral)

> **Estado:** `Listo`
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

### 4.4. Qué NO valida SDD-08

- **Máximo un `@server` y un `@client`** (33.b) y **no anidación** (33.a): SDD-08 recoge
  **todas** las regiones de nivel superior en `parts` (aunque haya duplicados); el conteo y la
  unicidad son **semántica (SDD-12)**.
- **Neutro sin side-effects** (33.c), **imports elevados** (33.c): emit/semántica.
- **Cero o un `@code`** (33.d) y su ubicación (`<head>` en página): **SDD-10**.
- **Validez del JS** de cada `NeutralJs`/`ServerRegion`/`ClientRegion`: **Oxc (SDD-11)**.

### 4.5. Códigos `FUD`

SDD-08 reserva **`FUD0110`–`FUD0129`**. Definidos:

| Código | Significado |
|---|---|
| `FUD0110` | Falta `{` tras `@code` / `@server` / `@client`. |
| `FUD0111` | `@server` / `@client` no admiten parámetro (decisión 66): `@server(…)`, `@client(…)`. |

`FUD0112`–`FUD0129` libres (`FUD0112`/`FUD0113` quedan **quemados**: eran la whitelist y los
paréntesis de estrategia, retirados con las decisiones 63–65). El `FUD0002` del balanceador (cuerpo/región sin cerrar) aflora sin
renumerarse.

---

## 5. Invariantes LSP

- **Spans en todo.** `CodeBlockNode`, cada `CodePart` (`.js`) y cada
  `Diagnostic` llevan offset UTF-16. Las regiones cubren el cuerpo sin solapes.
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
