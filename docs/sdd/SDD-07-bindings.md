# SDD-07 — Interpolación y bindings

> **Estado:** `Listo`
> **Depende de:** 00, 04, 05
> **Decisiones de gramática:** 18–31

---

## 1. Contexto y objetivo

SDD-05 produce el atributo **sintáctico** (nombre verbatim + partes de valor) y deja el `@`
de contenido como `RazorExpression` **desnuda**. SDD-07 **clasifica**: lee el nombre de cada
`Attribute` y decide si es atributo normal, property binding, event binding, `ref`, `class:` o
`style:`; y envuelve la `RazorExpression` de contenido en una `Interpolation` (escapada por
defecto). Es una capa de **refinamiento puro** sobre el árbol de SDD-05: no toca el lexer ni
parsea JS.

SDD-07 **no** hace: el escape HTML en sí (emit), la comprobación de "solo primitivas"
(decisión 19: semántica SDD-12 / runtime), el `omit si falsy` de atributos booleanos (decisión
21: emit), la detección de `TrustedHTML` (decisión 18: tipos → SDD-12), ni `ref` en bucle
(decisión 31: contextual → SDD-12). SDD-07 **marca**; emit/semántica **aplican**.

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | Monorepo, TS estricto, Vitest. |
| 01 | `Hecho` | `Node`, `Span`, `Diagnostic`/`errorDiag`, `ParseResult`. *(vía 04/05)* |
| 04 | `Hecho` | `RazorExpression` (átomo unificado implícita/explícita). |
| 05 | `Hecho` | `Attribute`, `AttributeValuePart` (`AttributeText | RazorExpression`). |

```ts
import { type Node, type Span } from '../types/index.js';
import { type Diagnostic, errorDiag, type ParseResult } from '../types/index.js';
import { type RazorExpression } from '../at/index.js';
import { type Attribute, type AttributeValuePart } from '../html/index.js';
```

---

## 3. Interfaz pública

Ubicación: `packages/compiler/src/binding/` (`nodes.ts`, `classify.ts`, reexportados desde
`binding/index.ts`). Todo en inglés.

### 3.1. Nodos de binding

```ts
/** A classified attribute. SDD-05 gives the raw `Attribute`; SDD-07 dispatches by name. */
export type Binding =
  | AttributeBinding
  | PropertyBinding
  | EventBinding
  | RefBinding
  | ClassBinding
  | StyleBinding;

/** Plain attribute: static text and/or interpolation parts, treated uniformly (decision 20).
 *  Empty `value` ⇒ boolean/empty attribute (decision 44); the omit-if-falsy of standard
 *  boolean attributes (decision 21) is applied at emit. */
export interface AttributeBinding extends Node {
  readonly type: 'attr';
  readonly name: string;
  readonly value: readonly AttributeValuePart[];
}

/** `.prop="@x"` — exactly one expression, no concatenation, case-sensitive name
 *  (decisions 23, 24, 25). `name` has no leading `.`. */
export interface PropertyBinding extends Node {
  readonly type: 'property';
  readonly name: string;
  readonly value: RazorExpression;
}

/** `@evt="@h"` — reference or lambda; any event name incl. custom (decisions 26, 27, 28).
 *  `name` has no leading `@`. Whether the value is actually a function is runtime (decision 26). */
export interface EventBinding extends Node {
  readonly type: 'event';
  readonly name: string;
  readonly value: RazorExpression;
}

/** `ref="@id"` — a single simple identifier (decision 30). Loop use is rejected in SDD-12 (31). */
export interface RefBinding extends Node {
  readonly type: 'ref';
  readonly value: RazorExpression;
}

/** `class:foo="@x"` — conditional class (decision 22). */
export interface ClassBinding extends Node {
  readonly type: 'class';
  readonly className: string;
  readonly value: RazorExpression;
}

/** `style:foo="@x"` — conditional style property (decision 22). */
export interface StyleBinding extends Node {
  readonly type: 'style';
  readonly property: string;
  readonly value: RazorExpression;
}
```

### 3.2. Interpolación de contenido

```ts
/** Content interpolation. `escaped: true` by default (decision 18); `false` for `@raw` (option A):
 *  SDD-05 delivers a `raw-expression` node ⇒ `escaped: false`; a bare `razor-expression` ⇒ true. */
export interface Interpolation extends Node {
  readonly type: 'interpolation';
  readonly expr: RazorExpression;
  readonly escaped: boolean;
}
```

### 3.3. Clasificadores (funciones puras)

```ts
/** Classify one raw attribute into its binding kind. Validates the structural rules SDD-07
 *  owns (single `@` value, no concat, simple ref id). Never throws. */
export function classifyAttribute(attr: Attribute): ParseResult<Binding>;

/** Wrap a content RazorExpression as an interpolation. `escaped` is true for a plain `@expr`
 *  and false for `@raw( … )` (the pass derives it from the SDD-05 content node kind). */
export function interpolate(expr: RazorExpression, escaped: boolean): Interpolation;
```

---

## 4. Comportamiento — dispatch por nombre (decisión 29)

`classifyAttribute` mira el **nombre** del `Attribute` (verbatim de SDD-05) y despacha:

| Forma del nombre | Binding | Reglas que valida aquí |
|---|---|---|
| empieza por `@` (`@click`, `@my-event`) | `EventBinding` | valor = **un** `@` (ref o lambda); nombre sin `@` (decisiones 26–28). |
| empieza por `.` (`.value`, `.innerHTML`) | `PropertyBinding` | valor = **un** `@`, sin concatenación; nombre sin `.`, case-sensitive (23, 24, 25). |
| `class:` + nombre | `ClassBinding` | valor = **un** `@` (22). |
| `style:` + nombre | `StyleBinding` | valor = **un** `@` (22). |
| exactamente `ref` | `RefBinding` | valor = **un** `@` que sea **identificador simple** (30). |
| cualquier otro | `AttributeBinding` | partes tal cual; estático y dinámico uniformes (20). |

**"Valor = un `@`"** significa: `attr.value` es exactamente `[RazorExpression]` (longitud 1,
tipo `razor-expression`). Si no —vacío, texto literal, o concatenación— es error (§6). Para
`AttributeBinding` no hay restricción: `title="@item.title"`, `href="/x/@id"` y `class="card"`
son todos válidos (decisión 20).

**`ref` identificador simple (30):** el `RazorExpression` debe ser implícito y un único
identificador (sin `.`, sin `(`). `ref="@a.b"` → error.

**Lo que NO se valida aquí:** que el handler evalúe a función (26, runtime); que la
interpolación sea primitiva (19, SDD-12/runtime); `ref` en bucle (31, SDD-12); el omit de
atributo booleano (21, emit); `TrustedHTML` (18, SDD-12).

---

## 5. Interpolación de contenido (decisión 18)

Cada nodo de interpolación de contenido de SDD-05 se envuelve en `Interpolation`:

- `razor-expression` (`@x`, `@(x)`) → `escaped: true` (decisión 18).
- `raw-expression` (`@raw( … )`, opción A) → `escaped: false`.

SDD-04 reconoce `@raw( … )` como directiva y SDD-05 lo entrega como nodo `raw-expression`
(ver §8). El escape en sí (sustituir `<`, `&`, …) y el chequeo de primitivas (19) son de
emit/semántica, no de aquí.

---

## 6. Códigos `FUD`

SDD-07 reserva **`FUD0090`–`FUD0109`**. Definidos:

| Código | Significado |
|---|---|
| `FUD0090` | Property binding sin valor `@` (p. ej. `.value="hola"`) — decisión 23. |
| `FUD0091` | Property binding con concatenación / múltiples partes — decisión 24. |
| `FUD0092` | Event binding sin un único handler `@`. |
| `FUD0093` | `class:`/`style:` sin un único valor `@` — decisión 22. |
| `FUD0094` | `ref` cuyo valor no es un identificador simple — decisión 30. |
| `FUD0095` | `class:`/`style:` sin nombre tras `:` (`class:="@x"`). |

`FUD0096`–`FUD0109` libres.

---

## 7. Invariantes LSP

- **Spans en todo.** Cada `Binding`, `Interpolation` y `Diagnostic` conserva el span de su
  `Attribute`/`RazorExpression` de origen.
- **Nunca lanza.** Reglas incumplidas → `ParseResult` degradado (se devuelve el binding que
  mejor encaje + diagnóstico), nunca excepción.
- **Puro.** `classifyAttribute`/`interpolate` son funciones sin estado sobre nodos inmutables:
  aptas para reparseo incremental y para llamarse on-demand desde emit/semántica.

---

## 8. `@raw( … )` — resuelto (opción A)

`raw` es una **directiva reservada** tras `@` (cerrado con Pedro). El reparto:

- **SDD-04** reconoce `@raw` seguido de `(`, delimita el `( … )` con el balanceador y devuelve
  `{ kind: 'raw', expression, keywordSpan }`. `@raw` sin `(` es una implícita normal.
- **SDD-05** aloja ese resolution como nodo de contenido `raw-expression` (hermano de
  `razor-expression`).
- **SDD-07** mapea `raw-expression` → `Interpolation { escaped: false }`.

`@(post.body)` escapa; `@raw(post.body)` no.

---

## 9. Fuera de alcance

- **Escape HTML real, `TrustedHTML`, primitivas (18, 19):** emit + semántica (SDD-12).
- **Omit de atributo booleano (21):** emit (lista estándar de booleanos).
- **`ref` en bucle → error (31):** contextual → SDD-12.
- **Validación de que el handler es función (26):** runtime.
- **Validación del JS de cada `RazorExpression`:** Oxc (SDD-11).
- **`LineMap` / línea-columna:** SDD-13.
