# SDD-10 — Estructura del documento

> **Estado:** `Listo`
> **Depende de:** 00, 05, 08
> **Decisiones de gramática:** 53–62

---

## 1. Contexto y objetivo

SDD-05 produce un `HtmlDocument` **plano**: `mode` (page/component, decisión 51) + `children`
en orden de fuente. SDD-10 **impone la estructura** de ese top-level y lo reorganiza en un
documento tipado, separando las piezas con significado (los `<link rel="component">`, el
`@code`, el `<head>`/`<body>` en página) en campos nombrados, y emitiendo diagnósticos cuando
el orden o la obligatoriedad se violan.

Es una pasada de **validación + clasificación** sobre el árbol de SDD-05: no vuelve a
tokenizar ni parsea contenido nuevo. Consume el `CodeBlockNode` de SDD-08 tal cual.

SDD-10 **no** hace: la extracción/elevación real del `@code` y del `<head>`-fragment en el
output (eso es **emit, SDD-14**), la deduplicación del head (61/62, emit), ni el análisis
semántico profundo (unicidad de regiones `@server`/`@client`, custom element sin `<link>`
declarado: **SDD-12**).

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | Monorepo, TS estricto, Vitest. |
| 01 | `Hecho` | `Node`, `Span`, `Diagnostic`/`errorDiag`, `ParseResult`. *(vía 05)* |
| 05 | `Hecho` | `HtmlDocument`, `ElementNode`, `DoctypeNode`, `HtmlContent`, `Attribute`. |
| 08 | `Hecho` | `CodeBlockNode` (el `@code` ya parseado, alojado como hijo por SDD-05). |

```ts
import { type Node, type Span } from '../types/index.js';
import { type Diagnostic, errorDiag, type ParseResult } from '../types/index.js';
import {
  type HtmlDocument,
  type ElementNode,
  type DoctypeNode,
  type HtmlContent,
  type Attribute,
} from '../html/index.js';
import { type CodeBlockNode } from '../code/index.js';
```

> **Por qué recibe `source`.** La única validación que no se resuelve con el árbol es la
> decisión 57 (solo `<!DOCTYPE html>`): el `DoctypeNode` de SDD-05 no lleva su texto. SDD-10
> lee el span del doctype sobre `source` para comprobarlo.

---

## 3. Interfaz pública

Ubicación: `packages/compiler/src/document/` (`nodes.ts`, `structure.ts`, reexportados desde
`document/index.ts`). Todo en inglés.

```ts
export type StructuredDocument = PageDocument | ComponentDocument;

/** Component file: `<link rel="component">`* → `@code`? → markup* (decision 53). */
export interface ComponentDocument extends Node {
  readonly type: 'component-document';
  /** All top-level `<link rel="component">`, in order. Any number (decision 55). */
  readonly links: readonly ElementNode[];
  /** The single `@code`, if present (decision 54). */
  readonly code?: CodeBlockNode;
  /** Remaining top-level markup, in order (fragments allowed, decision 52; `<head>` allowed, 62). */
  readonly markup: readonly HtmlContent[];
}

/** Page file: `<!DOCTYPE html>` + `<html><head>…</head><body>…</body></html>` (decisions 57, 58). */
export interface PageDocument extends Node {
  readonly type: 'page-document';
  readonly doctype: DoctypeNode;
  readonly html: ElementNode;
  readonly head: ElementNode;
  readonly body: ElementNode;
  /** `<link rel="component">` found inside `<head>` (decision 59). */
  readonly links: readonly ElementNode[];
  /** `@code` found inside `<head>` (decision 60). */
  readonly code?: CodeBlockNode;
}

/** True if `el` is `<link>` with a static `rel="component"` (a framework component import). */
export function isComponentLink(el: ElementNode): boolean;

/**
 * Impose document structure on a parsed `HtmlDocument`. Dispatches by `doc.mode`, validates
 * ordering/obligatoriness, and lifts links/`@code`/head/body into named fields. Never throws;
 * violations are diagnostics and the result is still filled best-effort.
 */
export function structureDocument(source: string, doc: HtmlDocument): ParseResult<StructuredDocument>;
```

---

## 4. Comportamiento

### 4.1. Whitespace y comentarios son transparentes (decisión 56)

Al validar orden, SDD-10 **ignora** los `TextNode` de solo whitespace, los `CommentNode` y los
`RazorCommentNode`: pueden aparecer libremente entre nodos top-level. Se conservan en `markup`
(componente) para el emit, que los descarta.

### 4.2. Modo componente (decisiones 52–55, 62)

Recorre `children` con una máquina de estados de **tres fases en orden estricto** (decisión 53):

1. **`links`** — `<link rel="component">` (`isComponentLink`), cualquier número (55).
2. **`code`** — a lo sumo un `CodeBlockNode` (54). Un segundo `@code` → `FUD0154`.
3. **`markup`** — todo lo demás (elementos, interpolaciones, control, `<head>`-fragment de 62).

Un nodo que llega **fuera de fase** (un `<link rel="component">` o un `@code` tras haber
empezado el markup, o un `@code` antes de un link) → `FUD0155`. Se coloca igualmente en su
campo (recuperación): el documento se estructura, el diagnóstico avisa.

### 4.3. Modo página (decisiones 57–60)

1. **Doctype (57).** El primer nodo significativo es el `DoctypeNode`. Su texto (leído de
   `source`, case-insensitive) debe ser `<!DOCTYPE html>` → `FUD0150` si no.
2. **`<html>` → `<head>` → `<body>` (58).** El `<html>` es el elemento raíz; dentro, saltando
   whitespace, `<head>` **primero** y `<body>` **después**, **ambos obligatorios**. Falta o
   desorden → `FUD0151`.
3. **Dentro de `<head>` (59, 60, 61).** Se recogen los `<link rel="component">` (`links`) y el
   `@code` (`code`, ≤1 → `FUD0154`). El orden dentro del head **no es estricto** (61): el emit
   eleva y deduplica. Otro contenido de head (`<title>`, `<meta>`, `<style>`) queda en el
   `<head>` tal cual.
4. **Fuera de sitio.** Un `<link rel="component">` fuera del `<head>` (p. ej. en `<body>`) →
   `FUD0152` (59). Un `@code` fuera del `<head>` → `FUD0153` (60).

### 4.4. `isComponentLink` y el caso 62

`isComponentLink(el)` = `el.name === 'link'` **y** tiene un `Attribute` `rel` con valor
**estático** `component`. Un `rel` dinámico (`rel="@x"`) no es estáticamente decidible → se
trata como link normal (markup). El `<head>`-fragment de un componente (decisión 62) queda en
`markup`; su elevación al head de la página consumidora y el consumo de sus
`<link rel="component">` internos son **emit** (SDD-14). SDD-10 no desciende en él.

### 4.5. Códigos `FUD`

SDD-10 reserva **`FUD0150`–`FUD0169`**. Definidos:

| Código | Significado |
|---|---|
| `FUD0150` | Doctype distinto de `<!DOCTYPE html>` (decisión 57). |
| `FUD0151` | Modo página: falta o desorden de `<html>`/`<head>`/`<body>` (decisión 58). |
| `FUD0152` | `<link rel="component">` fuera de `<head>` en modo página (decisión 59). |
| `FUD0153` | `@code` fuera de `<head>` en modo página (decisión 60). |
| `FUD0154` | Más de un `@code` en el documento (decisiones 54, 33.d). |
| `FUD0155` | Orden top-level inválido en componente: link/code/markup desordenados (decisión 53). |

`FUD0156`–`FUD0169` libres.

---

## 5. Invariantes LSP

- **Spans en todo.** `StructuredDocument` y cada `Diagnostic` llevan offset UTF-16; los nodos
  reubicados conservan su span de SDD-05.
- **Nunca lanza.** Doctype inválido, `<head>`/`<body>` ausentes, piezas fuera de sitio →
  resultado degradado (documento estructurado best-effort) + diagnóstico, nunca excepción.
- **Puro.** Sobre nodos inmutables; apto para reparseo incremental.

---

## 6. Criterios de aceptación

Entradas reales (fixtures) → `StructuredDocument`. El SDD está `Hecho` cuando:

1. **Typecheck.** `pnpm typecheck` pasa con §3 definido y reexportado.

2. **Componente (fixture `app-card`).** `<link rel="component" href="./app-button.fud"> @code {…}
   <article class="card">…</article>` ⇒ `ComponentDocument` con `links` = `[<link>]`, `code` =
   el `CodeBlockNode`, `markup` = `[<article>]`.

3. **Múltiples links (55).** Dos `<link rel="component">` seguidos ⇒ ambos en `links`, sin error.

4. **Orden inválido en componente (53).** `<article>…</article> <link rel="component" …>` ⇒
   `FUD0155`; el link va igualmente a `links`.

5. **Dos `@code` (54).** Dos bloques `@code` ⇒ `FUD0154`; el segundo se descarta o marca.

6. **Página (fixture `home`).** `<!DOCTYPE html><html><head><link rel="component" …>@code{…}
   <title>@data.title</title></head><body>…</body></html>` ⇒ `PageDocument` con `doctype`,
   `html`, `head`, `body`, `links` = `[<link>]`, `code` = el `@code` del head.

7. **Doctype inválido (57).** `<!DOCTYPE HTML5>` ⇒ `FUD0150`. `<!DOCTYPE html>` (cualquier
   caja) ⇒ válido.

8. **`<head>`/`<body>` (58).** Página sin `<body>` ⇒ `FUD0151`. `<body>` antes de `<head>` ⇒
   `FUD0151`.

9. **Fuera de sitio en página (59, 60).** `<link rel="component">` en `<body>` ⇒ `FUD0152`.
   `@code` en `<body>` ⇒ `FUD0153`.

10. **Whitespace/comentarios transparentes (56).** Whitespace y `<!-- … -->` entre links y
    `@code` no rompen el orden.

11. **Cobertura.** Cerca del 100 % de líneas/funciones/ramas (los casos cubren ambas máquinas
    de estados y las degradaciones). Cumple el suelo del SDD-00.

---

## 7. Fuera de alcance

- **Emit:** extracción del `@code` (60), elevación/dedupe del `<head>` y del `<head>`-fragment
  (61, 62), consumo de `<link rel="component">`: **SDD-14**.
- **Semántica:** custom element usado sin su `<link rel="component">` (decisión 41), unicidad
  de `@server`/`@client` (33.a/b), interpolación de no-primitivas (19): **SDD-12**.
- **Contenido de los elementos:** ya lo parsearon SDD-05/06/07/08/09. SDD-10 solo el top-level.
- **`LineMap` / línea-columna:** **SDD-13**.
