# SDD-10 — Estructura del documento

> **Estado:** `Hecho`
> **Depende de:** 00, 05, 08
> **Decisiones de gramática:** 53–62, 75–78

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
output (eso es **emit, SDD-15**), la deduplicación del head (61/62, emit), ni el análisis
semántico profundo (unicidad de regiones `@server`/`@client`, custom element sin `<link>`
declarado: **SDD-12**).

En modo componente impone además la **identidad DSD** (decisión 75): el markup es un único
envoltorio host (`prefix-name`) con su `<template shadowrootmode>`; de ahí sale el `name` del
componente que consumen el resolver, la hoja de estilos del head y el emit.

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

/** Component file: `<link rel="component">`* → `@code`? → `<head>`? → host wrapper (decisions 53, 62, 75). */
export interface ComponentDocument extends Node {
  readonly type: 'component-document';
  /** All top-level `<link rel="component">`, in order. Any number (decision 55). */
  readonly links: readonly ElementNode[];
  /** The single `@code`, if present (decision 54). */
  readonly code?: CodeBlockNode;
  /** The `<head>` fragment, if present (decision 62; holds the component's single `<style>`). */
  readonly head?: ElementNode;
  /** The host wrapper element — the component's identity (decision 75). Absent only on FUD0156 degradation. */
  readonly host?: ElementNode;
  /** The `<template shadowrootmode>` inside the wrapper (decision 75.a). Absent on FUD0157 degradation. */
  readonly template?: ElementNode;
  /** Component tag name, read from `host.name`. Empty string on degradation. */
  readonly name: string;
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

### 4.2. Modo componente (decisiones 53–55, 62, 75–76)

Recorre `children` con una máquina de estados de **cuatro fases en orden estricto**
(decisiones 53, 75):

1. **`links`** — `<link rel="component">` (`isComponentLink`), cualquier número (55).
2. **`code`** — a lo sumo un `CodeBlockNode` (54). Un segundo `@code` → `FUD0154`.
3. **`head`** — a lo sumo un `<head>`-fragment (62).
4. **`host`** — **exactamente un** elemento envolvente: el componente (75).

Un nodo que llega **fuera de fase** (un `<link rel="component">` o un `@code` tras haber
empezado el head/host, etc.) → `FUD0155`. Se coloca igualmente en su campo (recuperación): el
documento se estructura, el diagnóstico avisa.

**Validación del envoltorio (75, 75.a, 76):**

- El elemento de la fase 4 debe ser único y su tag un custom element válido (contiene `-`).
  Falta, sobra (segundo elemento raíz) o tag sin guión → `FUD0156`. Con más de uno, el primero
  válido se toma como `host` (recuperación).
- Dentro de `host`, saltando whitespace/comentarios (56), debe haber **exactamente un** hijo
  elemento y ser `<template>` → si no, `FUD0157` (y `template` queda ausente).
- Esa template debe llevar `shadowrootmode` estático con valor `open` → si falta o el valor
  es otro (incluido `closed`, fuera de v1), `FUD0158`. Los demás atributos DSD estándar pasan
  tal cual (75.a).
- `name` = `host.name`; es la **única fuente** de la identidad del componente. El
  `<head>`-fragment admite **a lo sumo un** `<style>`, sin atributo `host` (76): un segundo
  `<style>` → `FUD0159`; un atributo `host` escrito en el fuente (es un marcador reservado
  del output) → `FUD0160`. (Búsqueda shallow: hijos directos del `<head>`-fragment; SDD-10
  no desciende más.)

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
trata como link normal. El `<head>`-fragment de un componente (decisión 62) queda en `head`;
su elevación al head de la página consumidora y el consumo de sus `<link rel="component">`
internos son **emit** (SDD-15). SDD-10 solo hace la comprobación shallow de los `<style>` del
fragment (§4.2); no desciende más en él.

### 4.5. Códigos `FUD`

SDD-10 reserva **`FUD0150`–`FUD0169`**. Definidos:

| Código | Significado |
|---|---|
| `FUD0150` | Doctype distinto de `<!DOCTYPE html>` (decisión 57). |
| `FUD0151` | Modo página: falta o desorden de `<html>`/`<head>`/`<body>` (decisión 58). |
| `FUD0152` | `<link rel="component">` fuera de `<head>` en modo página (decisión 59). |
| `FUD0153` | `@code` fuera de `<head>` en modo página (decisión 60). |
| `FUD0154` | Más de un `@code` en el documento (decisiones 54, 33.d). |
| `FUD0155` | Orden top-level inválido en componente: link/code/head/host desordenados (decisión 53). |
| `FUD0156` | Envoltorio host inválido: ausente, múltiple, o tag sin guión (decisión 75). |
| `FUD0157` | El envoltorio no contiene exactamente un `<template>` (decisión 75.a). |
| `FUD0158` | `shadowrootmode` ausente o distinto de `open` — `closed` fuera de v1 (decisión 75.a). |
| `FUD0159` | Más de un `<style>` en el `<head>`-fragment del componente (decisión 76). |
| `FUD0160` | Atributo `host` escrito en el fuente — marcador reservado del output (decisión 76). |

`FUD0161`–`FUD0169` libres.

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
   <head>…</head> <app-card><template shadowrootmode="open">…</template></app-card>` ⇒
   `ComponentDocument` con `links` = `[<link>]`, `code` = el `CodeBlockNode`, `head` = el
   fragment, `host` = `<app-card>`, `template` = la template, `name` = `'app-card'`.

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

11. **Envoltorio host (75).** Componente cuyo markup es `<article>…</article>` (sin envoltorio
    custom) ⇒ `FUD0156`. Dos elementos raíz custom ⇒ `FUD0156` (el primero queda como `host`).
    `<appcard>` (sin guión) ⇒ `FUD0156`.

12. **Template DSD (75.a).** `<app-x><div>…</div></app-x>` ⇒ `FUD0157`.
    `<app-x><template>…</template></app-x>` sin `shadowrootmode` ⇒ `FUD0158`.
    `shadowrootmode="lazy"` ⇒ `FUD0158`. `shadowrootmode="closed"` ⇒ `FUD0158` (fuera de v1).
    `shadowrootmode="open"` ⇒ sin error.

13. **`<style>` del head (76).** `<head><style>…</style></head>` con host `<app-x>` ⇒ sin
    error y `name === 'app-x'`. Dos `<style>` en el head ⇒ `FUD0159` en el segundo.
    `<style host="app-x">` escrito en el fuente ⇒ `FUD0160`.

14. **Cobertura.** Cerca del 100 % de líneas/funciones/ramas (los casos cubren ambas máquinas
    de estados y las degradaciones). Cumple el suelo del SDD-00.

---

## 7. Fuera de alcance

- **Emit:** extracción del `@code` (60), elevación/dedupe del `<head>` y del `<head>`-fragment
  (61, 62), consumo de `<link rel="component">`, materialización del DSD (75/78): **SDD-15**.
- **Semántica:** custom element usado sin su `<link rel="component">` (decisión 41), unicidad
  de `@server`/`@client` (33.a/b), interpolación de no-primitivas (19): **SDD-12**.
- **Contenido de los elementos:** ya lo parsearon SDD-05/06/07/08/09. SDD-10 solo el top-level.
- **`LineMap` / línea-columna:** **SDD-13**.
