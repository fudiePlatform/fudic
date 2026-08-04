# SDD-12 — Análisis semántico

> **Estado:** `Hecho`
> **Depende de:** 00, 05–11
> **Decisiones de gramática:** 19, 31, 33.a/b/c, 41, 45 · 28.c (§8.4)

---

## 1. Contexto y objetivo

Todo lo que las capas de parsing **no** podían decidir localmente aterriza aquí. El parser es
tolerante y estructural; SDD-12 es la pasada que, con el **documento estructurado** (SDD-10), el
**árbol** (05–09) y el **AST JS** de Oxc (SDD-11) a la vista a la vez, aplica las reglas que
exigen contexto: unicidad, anidamiento, referencias cruzadas y tipos.

Produce **diagnósticos** y un pequeño **modelo semántico** con los hechos resueltos que el emit
necesita (nivel efectivo por componente, catálogo de componentes, mapa de bus).

Diseño **SOLID**: cada regla es un *analyzer* independiente; `analyze()` los corre y agrega sus
diagnósticos. Añadir una regla nueva es añadir un analyzer, no tocar los demás.

SDD-12 es además el **hogar del catálogo consolidado de códigos `FUD`** (§5), como fijaron
SDD-01 y la convención del proyecto.

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | TS estricto, Vitest. |
| 01 | `Hecho` | `Diagnostic`/`errorDiag`/`warningDiag`, `ParseResult`, `Node`, `Span`. |
| 05 | `Hecho` | `ElementNode`, `Attribute`, `HtmlContent` (recorrido del árbol). |
| 06 | `Hecho` | `ForeachNode`/`ForNode`/`WhileNode` (contexto de bucle, decisión 31). |
| 07 | `Hecho` | `classifyAttribute` (para localizar `RefBinding`), `Interpolation`. |
| 08 | `Hecho` | `CodeBlockNode`, `ServerRegion`/`ClientRegion`. |
| 10 | `Hecho` | `StructuredDocument` (documento ya validado estructuralmente). |
| 11 | `Hecho` | `JsBatchResult` (`ast(id)`), `OxcNode` (decisión 19). |

```ts
import { type Node, type Span } from '../types/index.js';
import { type Diagnostic, errorDiag, warningDiag, type ParseResult } from '../types/index.js';
import { type StructuredDocument } from '../document/index.js';
import { type ElementNode, type Attribute, type HtmlContent } from '../html/index.js';
import { classifyAttribute } from '../binding/index.js';
import { type ForeachNode, type ForNode, type WhileNode } from '../control/index.js';
import { type ClientRegion } from '../code/index.js';
import { type JsBatchResult, type OxcNode, type FragmentId } from '../oxc/index.js';
```

---

## 3. Interfaz pública

Ubicación: `packages/compiler/src/semantic/` (`analyzers/*.ts`, `analyze.ts`, reexportados
desde `semantic/index.ts`). Todo en inglés.

```ts
/** Everything an analyzer needs. Assembled by the pipeline. */
export interface SemanticInput {
  readonly source: string;
  readonly document: StructuredDocument;
  /** Batched JS AST (SDD-11). */
  readonly js: JsBatchResult;
  /** The Oxc fragment a JS-bearing node was registered as (RazorExpression, region, header). */
  fragmentId(node: Node): FragmentId | undefined;
  /** Declared component tags (from `<link rel="component">`). Injected; see §7 for its origin. */
  readonly components: ComponentRegistry;
}

/** Resolves whether a custom tag is a declared component (decision 41). Cross-file; injected (DIP). */
export interface ComponentRegistry {
  has(tag: string): boolean;
}

/** Resolved semantic facts the emit consumes. */
export interface SemanticModel {
}

/** One semantic rule. Reports diagnostics and may contribute to the model. */
export interface Analyzer {
  readonly name: string;
  run(input: SemanticInput, report: (d: Diagnostic) => void): void;
}

/** The ordered list of analyzers (§4). SOLID: one rule per unit. */
export const ANALYZERS: readonly Analyzer[];

/** Run every analyzer over the input. Never throws. */
export function analyze(input: SemanticInput): ParseResult<SemanticModel>;
```

---

## 4. Analyzers (una regla por unidad)

| Analyzer | Decisión | Qué comprueba | Diagnóstico / resultado |
|---|---|---|---|
| `duplicate-attributes` | 45 | Dos `Attribute` con el mismo nombre en un elemento. | `FUD0190` en el segundo. |
| `ref-in-loop` | 31 | Un `RefBinding` (vía `classifyAttribute`) dentro del subárbol de `@foreach`/`@for`/`@while`. | `FUD0192`. |
| `code-region-uniqueness` | 33.b | Más de un `@server` o `@client` en `CodeBlockNode.parts`. | `FUD0194` en el repetido. |
| `code-region-nesting` | 33.a | `@server`/`@client` anidado: escanea el **texto** de cada región buscando marcadores (SDD-08 no desciende). | `FUD0193`. |
| `neutral-imports` | 33.c | Import **solo por efecto** (sin bindings, `import './x'`) en zona neutra. | `FUD0196` (warning). |
| `primitive-interpolation` | 19 | Interpolación cuyo `ast` es literal `Array`/`Object` (no-primitiva **evidente**). | `FUD0195`. |
| `component-declared` | 41 | Elemento custom (nombre con `-`) usado sin estar en `ComponentRegistry`. | `FUD0191`. |

**Recorrido.** La mayoría de analyzers recorren el árbol una vez; `ref-in-loop` mantiene un
contador de profundidad de bucle. `code-region-*` operan sobre el `@code` del documento.

**Whitelist de tipos en `<script>`** (mencionada en la nota de gramática): descartada en la
decisión 43; no hay analyzer. El patrón queda por si una futura regla de `<script>` lo necesita.

---

## 5. Catálogo consolidado de códigos `FUD`

Cada SDD reserva su rango; aquí está el registro maestro. Formato `FUD` + 4 dígitos.

| Rango | SDD | Códigos definidos |
|---|---|---|
| `FUD0001` | 01 | `0001` pop de `ModeStack` sobre el modo de fondo. |
| `FUD0002`–`0009` | 02 | `0002` grupo balanceado sin cerrar (resto reservado). |
| `FUD0010`–`0029` | 03 | `0010` char tras `@` inválido · `0011` comentario Razor sin cerrar · `0012` comentario HTML sin cerrar · `0013` tag mal formado · `0014` raw sin cerrar · `0015` valor de atributo sin cerrar · `0016` CDATA sin terminar. |
| `FUD0030`–`0049` | 04 | (reservado; `@raw` sin cerrar aflora `0002`). |
| `FUD0050`–`0069` | 05 | `0050` cierre no casa · `0051` cierre huérfano · `0052` elemento sin cerrar · `0053` cierre de void · `0054` CDATA fuera de svg/math · `0055` construcción `@` sin handler. |
| `FUD0070`–`0089` | 06 | `0070` falta `(` · `0071` falta `{` · `0072` bloque sin cerrar · `0073` `else` huérfano · `0074` contenido antes del primer `case` · `0075` `case`/`default` sin `:`. |
| `FUD0090`–`0109` | 07 | `0090` property sin `@` · `0091` property con concatenación · `0092` event sin `@` único · `0093` `class:`/`style:` sin `@` único · `0094` `ref` no identificador simple · `0095` `class:`/`style:` sin nombre · `0096` `bus:` sin `@` único · `0097` `bus:` sin nombre. |
| `FUD0110`–`0129` | 08 | `0110` falta `{` · `0111` `@server(…)` / `@client(…)` (66). `0112`/`0113` quemados (estrategias retiradas). |
| `FUD0130`–`0149` | 09 | `0130` construcción Razor no permitida en `<style>` · `0131` llaves CSS desbalanceadas. |
| `FUD0150`–`0169` | 10 | `0150` doctype ≠ `html` · `0151` `<html>`/`<head>`/`<body>` faltante o desordenado · `0152` `<link rel="component">` fuera de `<head>` · `0153` `@code` fuera de `<head>` · `0154` más de un `@code` · `0155` orden top-level inválido en componente · `0156` envoltorio host inválido (decisión 75) · `0157` template única ausente en el envoltorio · `0158` `shadowrootmode` inválido · `0159` más de un `<style>` en el head del componente · `0160` atributo `host` escrito en fuente (marcador de output). |
| `FUD0170`–`0189` | 11 | `0170` error de sintaxis JS/TS de Oxc (span mapeado). |
| `FUD0190`–`0209` | 12 | `0190` atributo duplicado · `0191` custom element sin `<link rel="component">` · `0192` `ref` en bucle · `0193` `@server`/`@client` anidado · `0194` más de un `@server`/`@client` · `0195` interpolación no-primitiva (literal array/objeto) · `0196` import por efecto en zona neutra (warning). |

| `FUD0460`–`0479` | 24 | `0460` `href` de un `<link>` que no resuelve a ningún `.fud` · `0461` identificador de usuario con prefijo `$` (namespace reservado al compilador). |
| `FUD0480`–`0499` | 26 | `0480` `<style>` dejado sin formatear (placeholder Razor irreconstruible, o el CSS no parsea) · `0481` fragmento JS/TS dejado como estaba escrito porque no parsea · `0482` fallo interno del formateador (el único `error` del rango; el fichero se devuelve intacto). |
| `FUD0500`–`0519` | 27 | `0500` un chunk no termina en un hash de 8 caracteres, así que el nombrado por build id **no se aplica a ninguno** (media nomenclatura es peor que ninguna) · `0501` dos chunks quedarían con el mismo nombre al quitarles el hash; ese par lo conserva. Ninguno de los dos rompe el build. |
| `FUD0520`–`0539` | 28 | **Reservado y vacío.** Un snippet que no aplica no se ofrece, y lo que un snippet inserte lo diagnostica el código que ya existe para esa construcción (`0156`, `0430`, `0432`…). |

`FUD0197`–`0209` libres para SDD-12. Severidades: todos `error` salvo `0196` (`warning`).

Los rangos de los SDD 13–23 se anotan aquí a medida que cada spec define códigos propios; los
que faltan viven documentados en su propio SDD (`FUD0420`–`0439` en SDD-21, `FUD0440`–`0459` en
SDD-22, que además no son `Diagnostic` sino `CliError`: una colisión de ficheros no tiene span).
`FUD0462`–`0479` quedan libres para SDD-24.

`FUD0450` lo define SDD-26 dentro del rango de SDD-22, y es deliberado: `fudic fmt` rechaza con
él un fichero que no parsea, y ese es un error de la CLI, no del formateador — su sitio es el
rango de la CLI. `0480` y `0481` son `info`: no son fallos, son el formateador diciendo qué
dejó como lo encontró. Un `.fud` que no parsea no produce ninguno de los tres: no se formatea
en absoluto, en silencio (§4.6).

---

## 6. Invariantes LSP

- **Spans en todo.** Cada diagnóstico se localiza en el nodo ofensor (atributo, `ref`, marcador
  de región, interpolación). Los que vienen del JS usan `js.mapSpan`.
- **Nunca lanza.** Cada analyzer captura lo suyo; un fragmento sin AST (error previo de Oxc) se
  salta sin romper (el `FUD0170` ya lo cubrió).
- **Aditivo.** SDD-12 no muta el árbol; produce diagnósticos + `SemanticModel`. Reparseo/
  reanálisis incremental posible porque los analyzers son puros sobre la entrada.
- **DIP.** La resolución de componentes (41) entra por `ComponentRegistry` inyectada; SDD-12 no
  carga ficheros.

---

## 7. Criterios de aceptación

El SDD está `Hecho` cuando:

1. **Typecheck.** `pnpm typecheck` pasa con §3 definido y reexportado.

2. **Atributos duplicados (45).** `<div class="a" class="b">` ⇒ `FUD0190` en el segundo `class`.

3. **`ref` en bucle (31).** `@foreach (const x of xs) { <input ref="@r"> }` ⇒ `FUD0192`. El
   mismo `ref` fuera de bucle ⇒ sin error.

4. **Unicidad de regiones (33.b).** `@code { @server{} @server{} }` ⇒ `FUD0194`. Un `@server` +
   un `@client` ⇒ sin error.

5. **Anidación de regiones (33.a).** `@code { @client { @server {} } }` ⇒ `FUD0193` (escaneo de
   texto de la región).

6. **Interpolación no-primitiva (19).** `@([1, 2, 3])` en contenido ⇒ `FUD0195`. `@title` (no
   literal) ⇒ sin error aquí (se difiere al type-check; §8).

7. **Custom element sin declarar (41).** `<app-card>` con `components.has('app-card') === false`
   ⇒ `FUD0191`. Con registry que lo tiene ⇒ sin error. `<div>` (sin `-`) nunca se comprueba.

8. **Sin estrategia de hidratación.** `model` no expone `strategies`: las decisiones 63–65
   están retiradas y ningún analyzer las resuelve. Un `.fud` con `@client(viewport)` produce
   `FUD0111` en SDD-08, no una estrategia.

9. **Import neutro por efecto (33.c).** `@code { import './reset.css'; }` ⇒ `FUD0196` (warning).

10. **Cobertura.** Cerca del 100 % de líneas/funciones/ramas; cada analyzer con su caso
    positivo y negativo. Cumple el suelo del SDD-00.

---

## 8. Límites de alcance (no bloquean, son de diseño)

Tres reglas no son **totalmente** decidibles aquí sin más maquinaria; SDD-12 cubre la parte
decidible y delega el resto:

1. **Primitivas (19) — parcial.** Sin type-checking, SDD-12 solo caza literales array/objeto
   **evidentes**. La detección completa (una variable tipada `User[]`) necesita **tipos** →
   capa Volar/tsc; lo no detectable es error en **runtime** (lo dice la propia decisión 19).

2. **Componente declarado (41) — cross-file.** Casar el tag custom con el fichero que lo define
   exige resolver `<link rel="component">` (cargar el `.fud` enlazado y leer el tag de su
   envoltorio host, decisión 75). Eso es un **resolver multi-fichero** (fuera de v1). SDD-12 usa una `ComponentRegistry` inyectada; con
   una vacía, en single-file, marca todo custom no registrado.

3. **Pureza del neutro (33.c) — indecidible.** "Sin side effects" no es estáticamente
   decidible. SDD-12 solo avisa (warning) del caso claro: import por efecto. El resto es
   convención/lint.

4. **Nombre de bus `bus:X`/`bus:(X)` y `emit(X,…)` → resolución a literal (28.c) — pendiente.**
   Para la hidratación dirigida se necesita el **valor string** del nombre, tanto del
   `BusBinding.eventName` (suscriptor, 28.a/b) como del primer argumento de `emit` (emisor). La
   regla (a implementar en el futuro SDD de emit de bus, aún no escrito; aquí **registrada**, no
   activa):
   - **Resolución.** `expr` participa en el bus **solo si** resuelve estáticamente a un string
     literal por **constant folding de una sola rama**: referencia a un `const` / objeto
     `as const` (importado o local), siguiendo el binding hasta su declaración con el AST de
     Oxc (SDD-11). Indexación dinámica (`EVENTOS[k]`), template literal interpolado o retorno de
     llamada **no** resuelven.
   - **Postura permisiva — NO es error.** Un `bus:(expr)` no resoluble funciona como listener DOM
     normal en runtime; simplemente **no participa** en la hidratación dirigida. No hay código
     `FUD` asociado (no protegemos lo que no vemos estáticamente).
   - **Matching por valor (mecanismo único).** Emisor↔suscriptor se casan por el **string
     resuelto**, no por identidad de símbolo: `bus:carrito` (literal) y `bus:(EVENTOS.carrito)`
     que resuelve a `'carrito'` producen la **misma** entrada de bus.
   - **Salida.** El nombre resuelto es un **hecho del `SemanticModel`** que consume el emit de
     bus; su forma concreta (mapa `tag → eventos`) la define ese SDD futuro, fuera de v1.

---

## 9. Fuera de alcance

- **Type-checking real** (tipos, primitivas completas, server/client como contextos): capa
  **Volar/tsc** posterior (usa los fragmentos de SDD-11).
- **Resolver multi-fichero** de `<link rel="component">`: futuro.
- **Emit** (expansión de componentes, hidratación, escape, elevación de imports): **SDD-14**.
  SDD-12 solo entrega diagnósticos + `SemanticModel`.
- **`LineMap` / línea-columna:** **SDD-13**.
