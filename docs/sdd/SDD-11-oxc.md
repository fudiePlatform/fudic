# SDD-11 — Integración Oxc

> **Estado:** `Listo`
> **Depende de:** 00, 01, 02
> **Decisiones de gramática:** 6, 32

---

## 1. Contexto y objetivo

Todo el JS/TS de un `.fud` está **repartido**: `expr` de cada `RazorExpression`, cabeceras de
control (`@if`/`@foreach`/…), tests de `case`, `@{ … }`, y las regiones neutro/`@server`/
`@client` de `@code`. La regla de oro dice: **Oxc se invoca exactamente una vez por fichero**;
los fragmentos se acumulan en un **buffer sintético** con **tabla de regiones**, y los spans de
error (y los nodos del AST) se **mapean de vuelta** al `.fud` original.

**SDD-11 es ese mecanismo.** No sabe nada del árbol de SDD-05/06/08: recibe **spans de JS** con
su **kind**, construye el buffer, llama a Oxc una vez, y devuelve, por fragmento, el **nodo AST**
de Oxc más funciones de **mapeo de offset** buffer→fuente. Es puro puente léxico/sintáctico.

**Qué es y qué no.** SDD-11 hace **parsing sintáctico** (Oxc): valida sintaxis y entrega AST.
**No** hace **type-checking** ni resolución de scopes. Por eso "una vez por fichero" no choca
con la separación server/client: la sintaxis no depende del entorno; el type-check con contextos
separados (tipos Node vs DOM) es capa **Volar/tsc posterior** (post-14), que genera sus propios
ficheros virtuales a partir de estos mismos fragmentos. SDD-11 entrega el AST una vez.

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | `oxc-parser` (0.137.0) como dep de runtime del compilador; TS estricto; Vitest. |
| 01 | `Hecho` | `Span`/`span`, `Diagnostic`/`errorDiag`, `ParseResult`. |
| 02 | `Hecho` | El balanceador ya delimitó cada fragmento (decisión 6, estrategia a): SDD-11 recibe substrings limpios. |

```ts
import { type Span, span } from '../types/index.js';
import { type Diagnostic, errorDiag, type ParseResult } from '../types/index.js';
import { parseSync } from 'oxc-parser';
```

> **No depende de 03–10.** Los fragmentos los alimenta el pipeline (o SDD-12/14), que recorre el
> árbol y registra cada span de JS. SDD-11 se testea aislado con fragmentos a mano.

---

## 3. Interfaz pública

Ubicación: `packages/compiler/src/oxc/` (`batch.ts`, reexportado desde `oxc/index.ts`).
Todo en inglés.

```ts
/** How a JS fragment must be wrapped so the synthetic buffer is valid JS/TS (§4.1). */
export type JsFragmentKind =
  | 'expression' //        RazorExpression.expr, if/while/switch header, case test
  | 'module-statements' // @code region (neutral/server/client): top-level, imports allowed
  | 'block-statements' //  @{ … } inline code: lexically scoped block
  | 'for-of-header' //     @foreach header: `const x of xs`
  | 'for-header'; //       @for header: `let i = 0; i < n; i++`

export type FragmentId = number;

/** Minimal shape of an Oxc AST node. `start`/`end` are BUFFER offsets until mapped (§4.4).
 *  The full node types come from oxc-parser; this is the bridge surface SDD-12/14 traverse. */
export interface OxcNode {
  readonly type: string;
  readonly start: number;
  readonly end: number;
  readonly [key: string]: unknown;
}

/**
 * Accumulates JS fragments, builds ONE synthetic buffer with a region table, and drives Oxc
 * once. Never throws: Oxc syntax errors become mapped diagnostics.
 */
export class JsBatch {
  constructor(source: string);
  /** Register a fragment at `span` (original-source coordinates). Returns its id. Order-preserving. */
  add(kind: JsFragmentKind, span: Span): FragmentId;
  /** Build the buffer and invoke Oxc exactly once. Memoized: repeated calls reuse the result. */
  parse(): ParseResult<JsBatchResult>;
}

export interface JsBatchResult {
  /** The Oxc AST root for a fragment: Expression / Statement[] / ForOfStatement / ForStatement. */
  ast(id: FragmentId): OxcNode;
  /** Map a buffer offset (from an Oxc node) back to the original .fud source. */
  mapOffset(bufferOffset: number): number;
  /** Map a buffer [start, end) back to an original-source Span. */
  mapSpan(bufferStart: number, bufferEnd: number): Span;
}
```

---

## 4. Comportamiento

### 4.1. Kinds y envoltorios

Cada fragmento se copia **verbatim** y se envuelve para que el buffer sea JS/TS válido y el
sub-AST sea recuperable:

| kind | Envoltorio en el buffer | Nodo devuelto por `ast()` |
|---|---|---|
| `expression` | `(` + texto + `);` | la `Expression` interna |
| `module-statements` | texto tal cual, a **nivel de módulo** (imports válidos, decisión 33.c) | el `Statement[]` |
| `block-statements` | `{` + texto + `}` | el `Statement[]` del bloque |
| `for-of-header` | `for (` + texto + `) {}` | el `ForOfStatement` |
| `for-header` | `for (` + texto + `) {}` | el `ForStatement` |

Las declaraciones de las regiones `@code` quedan a nivel de módulo (scope compartido del
componente, intencional); las expresiones son sentencias `(e);` que las referencian. Una
referencia no resuelta (`item` fuera de su bucle) **no es error sintáctico**: la corrección de
scopes/tipos es posterior (Volar), no de SDD-11.

### 4.2. Buffer sintético y tabla de regiones

Los fragmentos se concatenan, cada uno en su(s) línea(s), separados por `\n`. Por cada
fragmento se guarda una entrada `{ srcStart, srcEnd, bufStart }`: el texto copiado tiene la
**misma longitud** en fuente y buffer, así que el mapeo dentro de un fragmento es lineal. Los
caracteres de envoltorio (`(`, `);`, `for (…){}`, `\n`) son sintéticos y no mapean a fuente.

### 4.3. Una sola invocación a Oxc

`parse()` llama a `parseSync(filename, buffer, options)` **una vez**. `filename` sintético con
extensión `.ts` (TS activado; sin JSX en el JS de `.fud`); `sourceType: module` (imports). Se
elige **síncrono** (native NAPI, rápido, determinista, apto para LSP); el modo asíncrono queda
como optimización futura para ficheros muy grandes. La llamada es idempotente (memoizada).

### 4.4. Mapeo de vuelta (regla de oro)

- `mapOffset(bufOffset)`: localiza la entrada cuyo `[bufStart, bufStart + (srcEnd−srcStart))`
  contiene el offset → `srcStart + (bufOffset − bufStart)`. Un offset en zona de envoltorio se
  atribuye al fragmento adyacente (para localizar el error sin salirse de su span).
- `mapSpan(a, b)` = `span(mapOffset(a), mapOffset(b))`.
- `ast(id)`: localiza el nodo raíz del fragmento por su región de buffer y aplica la extracción
  por kind (§4.1). Los `start/end` de los nodos siguen siendo de buffer; el consumidor
  (SDD-12/14) usa `mapSpan` cuando necesita coordenadas de fuente.

### 4.5. Diagnósticos

Los errores de Oxc se convierten en `Diagnostic` con código **`FUD0170`**, mensaje de Oxc y
`span` **mapeado** a la fuente. Si un error cae en zona de envoltorio, se ancla al fragmento
adyacente. SDD-11 no reinterpreta la semántica del error; solo lo relocaliza.

### 4.6. Códigos `FUD` y decisión 6

SDD-11 reserva **`FUD0170`–`FUD0189`**. Definido: `FUD0170` — error de sintaxis JS/TS
reportado por Oxc (mensaje pasado, span mapeado). `FUD0171`–`FUD0189` libres.

**Decisión 6 (estrategia a).** El balanceador propio delimita el fragmento (cuenta strings,
templates, regex, comentarios) **antes** de SDD-11; aquí solo se copia el substring ya limpio.
Migración futura a la estrategia (b) —si Oxc expone parsing de expresión con delimitador— sin
cambiar §3.

---

## 5. Invariantes LSP

- **Spans en todo.** Todo `Diagnostic` sale con span de fuente (mapeado). `mapOffset`/`mapSpan`
  son la primitiva que devuelve la navegación por offset tras el rodeo por el buffer.
- **Nunca lanza.** Errores de sintaxis → diagnósticos; un buffer vacío (cero fragmentos) →
  resultado vacío sin error. Oxc no se deja propagar excepciones.
- **Una invocación.** El buffer materializa "Oxc una vez por fichero"; `parse()` memoiza.
- **Apto para incremental.** El `JsBatch` encapsula su estado; reconstruir el buffer ante un
  cambio es local a los fragmentos afectados (la implementación incremental se difiere).

---

## 6. Criterios de aceptación

El SDD está `Hecho` cuando:

1. **Typecheck.** `pnpm typecheck` pasa con §3 definido y reexportado.

2. **Expresión.** `add('expression', span de 'variant === "highlight"')` → tras `parse()`,
   `ast(id)` es una `BinaryExpression`; `mapSpan(ast.start, ast.end)` cubre el texto original.

3. **Statements de módulo con import.** `add('module-statements', span de "import {db} from './db';
   async function load(){}")` → parsea sin error; `ast(id)` es el `Statement[]` con un
   `ImportDeclaration`.

4. **`@{ }` bloque.** `add('block-statements', span de "const n = 1;")` → `Statement[]` con una
   `VariableDeclaration`.

5. **Cabecera for-of / for.** `add('for-of-header', 'const item of data.items')` → `ForOfStatement`.
   `add('for-header', 'let i = 0; i < n; i++')` → `ForStatement`.

6. **Una sola llamada a Oxc.** Con varios fragmentos añadidos, `parse()` invoca `parseSync`
   **una vez** (verificado con spy/mock). Segunda llamada a `parse()` no reinvoca (memoiza).

7. **Error mapeado (FUD0170).** `add('expression', span de 'a +')` → un `Diagnostic` `FUD0170`
   cuyo `span` cae dentro del fragmento en la **fuente original**, no en el buffer.

8. **Mapeo lineal.** Para un fragmento en offset de fuente `S`, un nodo Oxc en buffer `B`
   cumple `mapOffset(B) === S + (B − bufStart)`.

9. **Cobertura.** Cerca del 100 % de líneas/funciones/ramas (los kinds, el mapeo y el error).
   Cumple el suelo del SDD-00.

---

## 7. Fuera de alcance

- **Type-checking y resolución de scopes** (server vs client, `this`, tipos): capa Volar/tsc
  posterior; genera ficheros virtuales desde estos fragmentos. No es SDD-11.
- **Análisis semántico** sobre el AST (primitivas 19, `for…in` 12, unicidad de regiones 33.a/b):
  **SDD-12**, que consume `ast(id)`.
- **Recolección de fragmentos desde el árbol.** La hace el pipeline recorriendo SDD-05/06/08/09;
  SDD-11 solo recibe spans.
- **Emit del JS** (hidratación, bundling, elevación de imports): **SDD-14**.
- **`LineMap` / línea-columna:** **SDD-13** (SDD-11 mapea offset↔offset, no a línea/columna).
