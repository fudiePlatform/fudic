# SDD-07 — Interpolación y bindings

> **Estado:** `Hecho`
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
  | BusBinding
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

/** `@evt="@h"` — host listener; reference or lambda; any event name incl. custom (decisions 26,
 *  27, 28). `name` is a literal string with NO leading `@`. Whether the value is actually a
 *  function is runtime (decision 26). Bus subscription is `BusBinding`, not this (decision 28.d). */
export interface EventBinding extends Node {
  readonly type: 'event';
  readonly name: string;
  readonly value: RazorExpression;
}

/** `bus:evt="@h"` — bus subscriber (decision 28.a–28.d). Listens on the page common ancestor
 *  (`document`), not the host; handler context is the host. Sibling of Class/StyleBinding (22).
 *  `eventName` is a literal `string` (`bus:carrito`) OR a `RazorExpression` (`bus:(expr)`, the
 *  naked explicit expression after `bus:`). Static resolution to a literal and matching-by-value
 *  are SDD-12 (decision 28.c). The desugaring to `document.addEventListener` is emit. */
export interface BusBinding extends Node {
  readonly type: 'bus';
  readonly eventName: string | RazorExpression;
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
export function classifyAttribute(attr: Attribute, source: string): ParseResult<Binding>;

/** Wrap a content RazorExpression as an interpolation. `escaped` is true for a plain `@expr`
 *  and false for `@raw( … )` (the pass derives it from the SDD-05 content node kind). */
export function interpolate(expr: RazorExpression, escaped: boolean): Interpolation;
```

**Corrección — `classifyAttribute` necesita `source` (implementación).** La firma original
(`classifyAttribute(attr)`) era incompatible con dos reglas que el propio SDD le asigna, porque
ambas hablan del **texto**, no del árbol:

1. **`ref` identificador simple (decisión 30, `FUD0094`).** `RazorExpression` guarda `expr` como
   `Span`, no como string, y para una implícita `regions` siempre está vacío. Distinguir `@a` de
   `@a.b` exige leer los caracteres: sin `source` la regla es indecidible.
2. **El prefijo `bus:` de la forma `bus:(expr)` (decisión 28.b).** Cuando el nombre es una
   `RazorExpression`, SDD-05 **sustituye el nombre entero** por ella y el prefijo literal deja de
   estar en el nodo — solo queda en el hueco `[attr.span.start, name.span.start)` del fichero.
   Sin `source` no hay forma de saber si el atributo era `bus:(x)` o `class:(x)`.

Añadir `source: string` es además coherente con SDD-04, cuyas funciones ya son
`f(source, offset)`. La función sigue siendo **pura y sin estado**: `source` es un parámetro de
entrada, no estado compartido.

**Degradación (§7, "el binding que mejor encaje") — política concreta.** Los campos `value` de
`PropertyBinding`/`EventBinding`/… son `RazorExpression` **obligatorios**, así que un binding
inválido no siempre se puede materializar. La regla implementada es:

- Si entre las partes del valor hay **exactamente una** `RazorExpression`, se conserva el binding
  de la clase pedida usando esa expresión (el editor sigue viendo un `property`/`event`/`bus`), y
  se emite el diagnóstico.
- Si hay **cero o más de una**, se degrada a `AttributeBinding` con el **nombre verbatim**
  (prefijo incluido: `.value`, `@click`, `bus:cart`) y las partes tal cual: no se pierde
  información y el nodo sigue siendo navegable por offset.

---

## 4. Comportamiento — dispatch por nombre (decisión 29)

`classifyAttribute` mira el **nombre** del `Attribute` (de SDD-05, `string | RazorExpression`) y despacha:

| Forma del nombre | Binding | Reglas que valida aquí |
|---|---|---|
| `bus:` + nombre/`(expr)` | `BusBinding` | valor = **un** `@`; `eventName` = literal (`bus:carrito`) o la `RazorExpression` (`bus:(expr)`, 28.a–b); resolución a literal en SDD-12 (28.c). |
| `string` que empieza por `@` (`@click`, `@my-event`) | `EventBinding` | valor = **un** `@` (ref o lambda); nombre de host, sin `@` (decisiones 26–28). |
| empieza por `.` (`.value`, `.innerHTML`) | `PropertyBinding` | valor = **un** `@`, sin concatenación; nombre sin `.`, case-sensitive (23, 24, 25). |
| `class:` + nombre | `ClassBinding` | valor = **un** `@` (22). |
| `style:` + nombre | `StyleBinding` | valor = **un** `@` (22). |
| exactamente `ref` | `RefBinding` | valor = **un** `@` que sea **identificador simple** (30). |
| cualquier otro | `AttributeBinding` | partes tal cual; estático y dinámico uniformes (20). |

**"Valor = un `@`"** significa: `attr.value` es exactamente `[RazorExpression]` (longitud 1,
tipo `razor-expression`). Si no —vacío, texto literal, o concatenación— es error (§6). Para
`AttributeBinding` no hay restricción: `title="@item.title"`, `href="/x/@id"` y `class="card"`
son todos válidos (decisión 20).

**`@evento` (host) vs `bus:` (document) — 28.d:** `@click`/`@my-event` es siempre listener de
host (`EventBinding`, `name` literal sin `@`). El prefijo `bus:` es suscripción de bus
(`BusBinding`): `eventName` es literal (`bus:carrito`) o la `RazorExpression` de `bus:(expr)`.
Son opuestos y no se infieren por el nombre (28.d); un mismo componente puede llevar ambos.
La resolución estática a literal y el matching por valor son de **SDD-12** (28.c); el valor de
ambos exige un único `@` handler (`FUD0092`/`FUD0096` si no).

**`ref` identificador simple (30):** el `RazorExpression` debe ser implícito y un único
identificador (sin `.`, sin `(`). `ref="@a.b"` → error.

**Lo que NO se valida aquí:** que el handler evalúe a función (26, runtime); que la
interpolación sea primitiva (19, SDD-12/runtime); `ref` en bucle (31, SDD-12); el omit de
atributo booleano (21, emit); `TrustedHTML` (18, SDD-12); la **resolución estática** del
nombre `bus:` a string literal, el **matching de bus por valor** (28.c, SDD-12) y el
**desugaring** de `bus:` a `document.addEventListener` (emit).

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
| `FUD0096` | `bus:` sin un único handler `@` (decisión 28.a). |
| `FUD0097` | `bus:` sin nombre tras `:` (`bus:="@x"`). |
| `FUD0098` | Nombre-expresión (`prefijo:(expr)`) tras un prefijo que no es `bus:` — p. ej. `class:(x)="@a"`. |
| `FUD0099` | Prefijo de binding sin nombre detrás: `@="@h"` (evento) o `.="@x"` (property). |

`FUD0100`–`FUD0109` libres.

**Corrección — huecos de validación de nombre (implementación).** La tabla original reservaba
código para el prefijo sin nombre solo en `class:`/`style:` (`FUD0095`) y `bus:` (`FUD0097`), y
dejaba dos formas silenciosas:

- **`FUD0098`.** El lexer de SDD-03 abre un nombre-expresión ante **cualquier** `nombre:` seguido
  de `(`, no solo ante `bus:` (`ATTR_NAME_STOP` incluye `(`). Sin este código, `class:(x)="@a"` se
  clasificaría como `BusBinding` — el prefijo real es indistinguible una vez SDD-05 sustituye el
  nombre. La comprobación pertenece a esta capa, que es la que despacha por nombre (decisión 29).
- **`FUD0099`.** Por simetría con `FUD0095`/`FUD0097`: `@="@h"` y `.="@x"` producían un
  `EventBinding`/`PropertyBinding` con nombre vacío, sin error.

Ambos caen dentro del rango `FUD0090`–`FUD0109` que SDD-07 ya tenía reservado.

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

## 9. Criterios de aceptación

**Corrección — sección ausente (implementación).** SDD-07 se redactó sin criterios de
aceptación: su §6 es la tabla de códigos `FUD`, no la lista de "hecho" que el flujo del proyecto
exige (cf. SDD-04 §6). Se añaden aquí, derivados de la tabla de dispatch (§4), de la
interpolación (§5) y de los códigos (§6). Se verifican en
`packages/compiler/test/binding/`.

**Dispatch por nombre (§4)**

1. `class="card"` → `attr` con una parte `attribute-text`; sin diagnósticos.
2. `title="@item.title"` y `href="/x/@id"` → `attr`; la concatenación es legal aquí (decisión 20).
3. `disabled` (sin `=`) → `attr` con `value: []` (decisión 44).
4. `refx`/`classy` **no** son nombres reservados → `attr`.
5. `.value="@model.name"` → `property`, `name: 'value'`, sin el `.` inicial.
6. `.innerHTML="@body"` → `property` conservando el case (decisión 25).
7. `@click="@onClick"` → `event`, `name: 'click'`, sin el `@`; `@my-event` acepta guiones (27).
8. `@click="@(() => go(1))"` → `event` (lambda explícita).
9. `class:success="@(…)"` → `class` con `className: 'success'`; `style:color="@t"` → `style`.
10. `bus:carrito="@onCart"` → `bus` con `eventName` **string**.
11. `bus:(EVENTS.cart)="@onCart"` → `bus` con `eventName` **`RazorExpression`** (28.b).
12. `@click` y `bus:` conviven en el mismo elemento y no se infieren entre sí (28.d).
13. `ref="@input"` → `ref` con la expresión implícita de un solo identificador (30).

**Errores y degradación (§6)**

14. `FUD0090`: `.value="hola"` y `.value` (vacío) → degrada a `attr` con nombre `.value`.
15. `FUD0091`: `.value="/x/@b"` (texto + expresión) → `property` con esa única expresión;
    `.value="@a @b"` (dos expresiones) → degrada a `attr`.
16. `FUD0092`: `@click="onClick"` y `@click="@a@b"`.
17. `FUD0093`: `class:on="yes"`, `style:color` con concatenación.
18. `FUD0094`: `ref="@a.b"` (camino), `ref="@(a)"` (explícita) → se conserva el `RefBinding`;
    `ref="input"` → degrada a `attr`.
19. `FUD0095`: `class:="@x"`; combinado con `FUD0093` cuando además falta la expresión.
20. `FUD0096`: `bus:cart="onCart"`; `FUD0097`: `bus:="@onCart"`.
21. `FUD0098`: `class:(x)="@a"`. `FUD0099`: `@="@h"`, `.="@a"`.

**Interpolación (§5)**

22. `@post.body` y `@(post.body)` → `Interpolation { escaped: true }` (decisión 18).
23. `@raw(post.body)` → `Interpolation { escaped: false }`, con el span cubriendo **toda** la
    directiva `@raw( … )`, para que emit la sustituya entera.

**Invariantes (§7)**

24. Todo `Binding` conserva el span de su `Attribute`; toda `Interpolation`, el de su expresión.
25. Todo `Diagnostic` lleva span no vacío y dentro del fichero, severidad `error` y código
    `FUD\d{4}` dentro de `FUD0090`–`FUD0109`.
26. `classifyAttribute` nunca lanza y es pura: dos llamadas sobre el mismo atributo dan
    resultados iguales.
27. Los cuatro fixtures canónicos (`home`, `app-card`, `app-button`, `app-badge`) se clasifican
    **enteros sin un solo diagnóstico**: `class:` → `class`, `@click`/`@press` → `event`,
    `disabled="@disabled"` → `attr` (el omit de la decisión 21 es de emit), y `home.fud` produce
    exclusivamente `attr`.

---

## 10. Fuera de alcance

- **Escape HTML real, `TrustedHTML`, primitivas (18, 19):** emit + semántica (SDD-12).
- **Omit de atributo booleano (21):** emit (lista estándar de booleanos).
- **`ref` en bucle → error (31):** contextual → SDD-12.
- **Validación de que el handler es función (26):** runtime.
- **Validación del JS de cada `RazorExpression`:** Oxc (SDD-11).
- **`LineMap` / línea-columna:** SDD-13.
