# SDD-09 — CSS con Razor (`<style>`)

> **Estado:** `Listo`
> **Depende de:** 00, 02, 04, 05
> **Decisiones de gramática:** 42 (a–e)

---

## 1. Contexto y objetivo

SDD-03 empuja el modo `css` al entrar en `<style>` pero difiere la **producción** de CSS a
este SDD (hasta ahora, cuerpo opaco provisional). **SDD-09 parsea ese cuerpo.**

El problema central es **desambiguar el `@`** dentro de CSS (decisión 42): un `@` puede ser
una **at-rule CSS** (`@media`, `@keyframes`…) o un **átomo Razor** (`@bp.tablet`). Se decide
por **lista blanca cerrada** de at-rules (42.a/b): si el identificador tras `@` está en la
lista → es CSS literal; si no → es Razor. Más `@@` → `@` literal (42.c).

SDD-09 produce una secuencia plana de **texto CSS literal + átomos Razor** (`parts`), con
interpolación activa en prelude y cuerpo de at-rules (42.d) y **conteo correcto de llaves**
para validar el anidamiento (42.e). **No** construye un AST CSS completo (selectores/
declaraciones): el navegador parsea el CSS real; el compilador solo interpola Razor y valida
balance. **No** hace el scoping de la hoja del componente (eso es emit, SDD-15 §4.8).

**v1: interpolación, no control de flujo.** `@if`/`@foreach`/`@code` dentro de `<style>` están
**fuera de alcance** en v1 → diagnóstico (§4.4). Reservado para el futuro.

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | Monorepo, TS estricto, Vitest. |
| 01 | `Hecho` | `Node`, `Span`, `Diagnostic`/`errorDiag`, `ParseResult`. *(vía 04/05)* |
| 02 | `Hecho` | `scanParens`, `BalancedGroup` — para `@( … )` explícita en CSS. |
| 04 | `Hecho` | `RazorExpression`, `resolveTrigger` — para `@expr` implícita. |
| 05 | `Hecho` | `AtEscapeNode`, `RazorCommentNode` (reutilizados como partes de CSS). |

```ts
import { type Node, type Span, span, mergeSpans } from '../types/index.js';
import { type Diagnostic, errorDiag, type ParseResult } from '../types/index.js';
import { type RazorExpression, resolveTrigger } from '../at/index.js';
import { type BalancedGroup, scanParens } from '../balancer/index.js';
import { type AtEscapeNode, type RazorCommentNode } from '../html/index.js';
```

> **Cableado.** SDD-05 produce el `<style>` con su cuerpo como span provisional (SDD-05 §4.4).
> SDD-09 es una pasada que toma ese span y lo sustituye por un `StyleNode`. No requiere cambiar
> SDD-05 (no hay dependencia inversa).

---

## 3. Interfaz pública

Ubicación: `packages/compiler/src/css/` (`nodes.ts`, `atrules.ts`, `css.ts`, reexportados
desde `css/index.ts`). Todo en inglés.

```ts
/** Parsed `<style>` body: literal CSS interleaved with Razor atoms, in source order. */
export interface StyleNode extends Node {
  readonly type: 'style-content';
  readonly parts: readonly CssPart[];
}

export type CssPart = CssText | RazorExpression | AtEscapeNode | RazorCommentNode;

/** A literal CSS run (includes CSS at-rule keywords). Verbatim passthrough (like decision 49). */
export interface CssText extends Node {
  readonly type: 'css-text';
  readonly value: string;
}

/** The closed whitelist of CSS at-rules (decision 42.a/b). Lowercase, ASCII-case-insensitive match. */
export const CSS_AT_RULES: ReadonlySet<string>;

/** True if `name` (the identifier after `@`, without `@`) is a whitelisted CSS at-rule. */
export function isCssAtRule(name: string): boolean;

/**
 * Parse a `<style>` body span into a StyleNode. Disambiguates every `@` via the whitelist,
 * embeds Razor expression atoms, and validates brace balance. Never throws.
 */
export function parseStyle(source: string, body: Span): ParseResult<StyleNode>;
```

`CSS_AT_RULES` (42.a): `charset`, `import`, `namespace`, `media`, `supports`, `container`,
`layer`, `scope`, `starting-style`, `keyframes`, `font-face`, `font-feature-values`,
`font-palette-values`, `counter-style`, `page`, `property`, `document`.

---

## 4. Comportamiento

### 4.1. Escaneo del cuerpo

Sobre `body`, SDD-09 acumula `CssText` y corta en `@`. La desambiguación del `@` (§4.2) es
**uniforme** en todo el cuerpo, incluidas las **strings CSS** `" … "` / `' … '`: la
interpolación está activa dentro de ellas (opción A cerrada con Pedro); un `@` literal en una
string se escribe `@@`. Los **comentarios CSS `/* … */`** son la única excepción: se absorben
como texto literal y **desactivan** la lectura de `@` dentro (un `@media`/`@label` en un
comentario es literal). SDD-09 rastrea strings y comentarios solo para que sus `{`/`}` y `/*`
no afecten al conteo de llaves (§4.3).

### 4.2. Desambiguación del `@` (decisión 42)

| Caso | Resultado |
|---|---|
| `@@` | `AtEscapeNode` — `@` literal en el output (42.c). |
| `@* … *@` | `RazorCommentNode` (no se emite, decisión 37). |
| `@` + ident **en `CSS_AT_RULES`** | CSS literal: se absorbe `@name` en `CssText` y sigue el escaneo (Razor sigue activo en prelude/cuerpo, 42.d). |
| `@(` | `RazorExpression` explícita: `scanParens` delimita `( … )`; `expr` = inner, `regions` del grupo (`FUD0002` si no cierra). |
| `@` + ident **fuera** de la lista | `resolveTrigger` → si es expresión implícita, `RazorExpression`; si es control/`@code`/`raw` → `FUD0130` (§4.4). |
| `@` + otro (ws, símbolo) | texto literal (el navegador lo juzga). |

El identificador para la prueba de whitelist se lee `[a-zA-Z][a-zA-Z0-9-]*` (cubre
`font-face`, `starting-style`). Ninguna at-rule colisiona con un keyword de control Razor, así
que la pertenencia a la lista separa limpio.

### 4.3. Conteo de llaves y anidamiento (decisión 42.e)

SDD-09 cuenta `{`/`}` fuera de comentarios y strings, soportando nesting CSS nativo. Al llegar
al final de `body`, si el balance no es 0 → `FUD0131` (bloque CSS sin cerrar). El conteo es
solo validación; `parts` queda plano (sin árbol de reglas en v1).

### 4.4. Control de flujo en CSS: fuera de v1

`@if`/`@foreach`/`@for`/`@while`/`@switch`/`@code` dentro de `<style>` → `FUD0130`. Se degrada
(se emite el `@keyword` como texto) y se sigue. Reservado para una extensión futura.

### 4.5. Códigos `FUD`

SDD-09 reserva **`FUD0130`–`FUD0149`**. Definidos:

| Código | Significado |
|---|---|
| `FUD0130` | Construcción Razor no permitida en `<style>` en v1 (control/`@code`/`raw`). |
| `FUD0131` | Llaves CSS desbalanceadas en `<style>` (decisión 42.e). |

`FUD0132`–`FUD0149` libres. El `FUD0002` del balanceador (`@( … )` sin cerrar) aflora sin
renumerarse.

---

## 5. Invariantes LSP

- **Spans en todo.** `StyleNode`, cada `CssPart` y cada `Diagnostic` llevan offset UTF-16. Las
  partes cubren `body` sin huecos ni solapes.
- **Nunca lanza.** `@(` sin cerrar, construcción no permitida y llaves desbalanceadas →
  resultado degradado + diagnóstico, nunca excepción.
- **Interpolación reutiliza SDD-04.** Los átomos son `RazorExpression` idénticos a los de
  HTML: SDD-11 los valida con Oxc y el emit los interpola igual, sin distinguir origen.

---

## 6. Criterios de aceptación

Entradas reales (fixtures) → `StyleNode`. El SDD está `Hecho` cuando:

1. **Typecheck.** `pnpm typecheck` pasa con §3 definido y reexportado.

2. **CSS estático (fixture `app-card`).** `:host { display: block; } .card { border: 1px solid #ddd; }`
   ⇒ `parts` = un único `CssText` (verbatim), balance de llaves 0.

3. **At-rule + interpolación (42.a, 42.d).** `@media (min-width: @bp.tablet) { .card { gap: @gap; } }`
   ⇒ `parts` = `[CssText '@media (min-width: ', RazorExpression 'bp.tablet', CssText ') { .card { gap: ', RazorExpression 'gap', CssText '; } }']`.

4. **Whitelist (42.b).** `@keyframes spin { … }` ⇒ `@keyframes` es CSS literal. `@bp` (no en
   lista) ⇒ `RazorExpression`.

5. **Escape `@@` (42.c).** `content: "\00a0"; /* @@ */` y `a::before { content: "@@"; }` ⇒
   `AtEscapeNode` donde haya `@@` (emite `@`).

6. **Explícita `@( … )`.** `width: @(base * 2);` ⇒ `RazorExpression` explícita `base * 2`.
   `width: @(base * 2;` (sin cerrar) ⇒ `FUD0002`.

7. **Comentario vs string.** `/* @media no cuenta */` ⇒ literal, sin interpolación.
   `content: "hola @name"` ⇒ interpolación activa (opción A): `RazorExpression 'name'`.

8. **Nesting desbalanceado (42.e).** `.card { color: red` (sin `}`) ⇒ `FUD0131`.

9. **Control fuera de v1 (§4.4).** `@if (x) { … }` en `<style>` ⇒ `FUD0130`.

10. **Cobertura.** Cerca del 100 % de líneas/funciones/ramas (los casos cubren la
    desambiguación, el conteo de llaves y las degradaciones). Cumple el suelo del SDD-00.

---

## 7. Fuera de alcance

- **Scoping de la hoja del componente** (`:host`, aislamiento): **emit (SDD-15 §4.8; SDD-18 para la hoja compartida)**.
- **AST CSS estructurado** (selectores, declaraciones, especificidad): no en v1; el navegador
  parsea el CSS real.
- **Control de flujo / `@code` en CSS:** fuera de v1 (§4.4).
- **Validación del JS** de cada `RazorExpression`: **Oxc (SDD-11)**.
- **Ampliar la whitelist** ante una at-rule nueva (42.b): cambio de código, no heurística.
- **`LineMap` / línea-columna:** **SDD-13**.

---

## 8. Strings CSS — resuelto (opción A)

La interpolación Razor está **activa dentro de strings CSS** (cerrado con Pedro), igual que en
valores de atributo HTML (decisión 20). `content: "@label"` interpola; un `@` literal se
escribe `@@` (coherente con 42.c). La única zona sin interpolación es el comentario CSS
`/* … */` (§4.1).
