# SDD-01 — Andamiaje y tipos base

> **Estado:** `Listo`
> **Depende de:** 00
> **Decisiones de gramática:** — (transversal, no implementa reglas de lenguaje)

---

## 1. Contexto y objetivo

Definir el **vocabulario de tipos compartido** que toda la columna vertebral del
compilador (SDD-02 a SDD-14) importa sin reimplementar. Son cuatro piezas:

- `Span` — la unidad de localización por offset que viaja en *todo* token y *todo*
  nodo del AST. Es el sustrato físico de las invariantes LSP.
- `Diagnostic` — el objeto de error/aviso que el parser **emite en lugar de lanzar**.
- `ParseResult<T>` — el contenedor uniforme `{ value, diagnostics }` que devuelve
  cada fase, de modo que un input roto nunca interrumpe el pipeline.
- `ModeStack` — la pila explícita de modos del parser (`html`/`js`/`css`/`raw`/`svg`/
  `math`), operativa, que SDD-03 en adelante empuja y desapila en cada transición.

Más la **raíz de la jerarquía de nodos** del AST (`Node` base), que materializa
físicamente la invariante "spans universales / navegable por offset desde el primer
commit": si el tipo base no obliga a llevar `span`, la invariante es papel mojado.

Este SDD **no parsea nada**. No hay tokenizer, ni reglas del `@`, ni HTML. Entrega
tipos y dos utilidades mínimas (constructor de `Span`, helpers de `ModeStack`) con
sus tests. Es el andamiaje sobre el que cuelga el resto: cuando está `Hecho`, cualquier
SDD posterior puede `import` estos tipos y empezar a su lógica sin definir contratos
base por su cuenta (lo que provocaría divergencia de formas de `Span`/`Diagnostic`
entre módulos, el bug estructural que este SDD existe para prevenir).

**Repo limpio.** Tipos escritos desde cero. Del prototipo `compiler-master` (2019)
se hereda *una idea* —la identidad de nodos para hidratación (`__key`,
`__instanceParentKey`)—, no su forma concreta; aquí solo se reserva el **lugar**
arquitectónico de esa identidad en el `Node` base (§4.5), sin implementar la lógica
de hidratación, que es competencia del emit (SDD-14+).

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | Monorepo pnpm, `@fudic/compiler`, TS 5.9 estricto (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), Vitest 4.1, fixtures `.fud`. |

Ninguna dependencia de lógica. Solo se apoya en el entorno del SDD-00.

> **Nota sobre TS estricto (heredado del 00).** `exactOptionalPropertyTypes` está
> activo: todo campo opcional de los tipos de este SDD (`{ x?: T }`) **no** es
> intercambiable con `{ x: T | undefined }`. Las firmas de §3 lo respetan
> deliberadamente; al implementar, no relajar a `| undefined` "por comodidad".

---

## 3. Interfaz pública

Las firmas siguientes son **el contrato**. Cualquier SDD posterior importa de aquí
y no las redefine. Ubicación canónica: `packages/compiler/src/types/` (un fichero por
grupo: `span.ts`, `diagnostic.ts`, `result.ts`, `mode.ts`, `node.ts`), reexportados
desde `packages/compiler/src/types/index.ts`.

### 3.1. `Span`

```ts
/**
 * Rango medio-abierto [start, end) en offsets de carácter UTF-16 sobre el
 * texto fuente original del fichero .fud (la misma unidad que usa el editor
 * y el protocolo LSP). NUNCA en líneas/columnas: la conversión a posición
 * 2D se difiere a un LineMap en SDD-13.
 */
export interface Span {
  /** Offset del primer carácter incluido. >= 0. */
  readonly start: number;
  /** Offset del primer carácter EXCLUIDO. >= start. end === start ⇒ span vacío. */
  readonly end: number;
}

/**
 * Construye un Span. Precondición del llamante: 0 <= start <= end. Si start > end
 * (bug de la fase llamante) NO lanza: normaliza intercambiando los offsets — el
 * constructor no tiene contexto de fuente para emitir un Diagnostic localizado.
 */
export function span(start: number, end: number): Span;

/** Span vacío en una posición (start === end). Útil para inserciones/errores puntuales. */
export function emptySpan(at: number): Span;

/** Longitud del span (end - start). 0 ⇒ span vacío. */
export function spanLength(s: Span): number;

/** True si el span es vacío (start === end). */
export function isEmptySpan(s: Span): boolean;

/**
 * Une dos spans en el menor rango que cubre AMBOS (bounding span), tragando el
 * hueco intermedio si son disjuntos: NO es una unión de intervalos. El orden de
 * los argumentos es indiferente.
 */
export function mergeSpans(a: Span, b: Span): Span;

/**
 * True si offset está dentro de [span.start, span.end). Base de la navegación por
 * offset. Por ser medio-abierto, un span vacío (start === end) no contiene NINGÚN
 * offset: un nodo de span vacío nunca será el resultado de una query de cobertura.
 */
export function spanContains(s: Span, offset: number): boolean;
```

### 3.2. `Diagnostic`

```ts
/**
 * Las cuatro severidades de LSP (DiagnosticSeverity: Error/Warning/Information/Hint).
 * Fiel al protocolo desde el principio para que los switch exhaustivos de SDD-12+
 * no tengan que ampliarse después (cambio no-aditivo si se difiere 'hint').
 */
export type Severity = 'error' | 'warning' | 'info' | 'hint';

/**
 * Un problema detectado durante el parsing o análisis. El parser EMITE
 * diagnostics, nunca lanza (regla de oro del INDEX). Todo Diagnostic lleva
 * span: un error sin localización no es accionable en un language server.
 */
export interface Diagnostic {
  readonly severity: Severity;
  /** Código estable y legible. Convención: "FUD" + número. P. ej. "FUD0001". */
  readonly code: string;
  /** Mensaje humano, en una línea, sin punto final. */
  readonly message: string;
  /** Localización en el fuente. Obligatorio. */
  readonly span: Span;
}

/** Helpers de construcción. severity implícito en el nombre. */
export function errorDiag(code: string, message: string, span: Span): Diagnostic;
export function warningDiag(code: string, message: string, span: Span): Diagnostic;
export function infoDiag(code: string, message: string, span: Span): Diagnostic;
export function hintDiag(code: string, message: string, span: Span): Diagnostic;
```

> **Registro de códigos `FUDxxxx`.** Este SDD fija el *formato* (`FUD` + 4 dígitos) y el
> tipo, y reserva **un único** código: `FUD0001` — pop de `ModeStack` sobre el modo de
> fondo (§3.4). Es el único error que este andamiaje detecta. Cada SDD posterior reserva
> su propio rango y lo anota; el catálogo consolidado vive en el SDD-12 (semántica), que
> es el mayor productor de diagnósticos.

### 3.3. `ParseResult`

```ts
/**
 * Resultado uniforme de toda fase del pipeline. SIEMPRE devuelve un value
 * (posiblemente parcial/degradado) MÁS la lista de diagnostics. Nunca lanza.
 * "value parcial + diagnostics" es lo que distingue un language server de un
 * compilador batch: el editor necesita un AST aunque el código esté roto.
 */
export interface ParseResult<T> {
  readonly value: T;
  readonly diagnostics: readonly Diagnostic[];
}

/** Resultado sin errores. */
export function ok<T>(value: T): ParseResult<T>;

/** Resultado con value (parcial admitido) y diagnostics. */
export function withDiagnostics<T>(
  value: T,
  diagnostics: readonly Diagnostic[],
): ParseResult<T>;

/**
 * Combina los diagnostics de varios sub-resultados en uno solo, conservando
 * el value del propio nodo. Azúcar para fases que agregan hijos.
 */
export function collectDiagnostics(
  ...results: readonly ParseResult<unknown>[]
): readonly Diagnostic[];
```

### 3.4. `Mode` y `ModeStack`

```ts
/**
 * Modos del parser (notas de "Modos del parser" en gramatica-v1-decisiones.md).
 * La taxonomía es cerrada en v1. El SIGNIFICADO de cada modo (qué reconoce) es
 * competencia de SDD-03+; aquí solo se fija el conjunto y la mecánica de pila.
 */
export type Mode = 'html' | 'js' | 'css' | 'raw' | 'svg' | 'math';

/**
 * Pila explícita de modos. Operativa desde este SDD: SDD-02/03/04/05/09 la
 * empujan y desapilan en cada transición documentada. Siempre hay un modo de
 * fondo: la pila se inicializa con un modo base y nunca queda vacía.
 */
export class ModeStack {
  /** Crea la pila con un único modo de fondo (por defecto 'html'). */
  constructor(base?: Mode);

  /** Modo actual (cima). Nunca undefined: la pila nunca se vacía. */
  get current(): Mode;

  /** Profundidad actual (>= 1). */
  get depth(): number;

  /** Empuja un modo nuevo. */
  push(mode: Mode): void;

  /**
   * Desapila el modo de cima y lo devuelve. `at` es el offset actual del parser:
   * solo se usa para localizar el diagnóstico cuando el pop es inválido. Si solo
   * queda el modo de fondo, NO desapila y devuelve un ParseResult<Mode> con un
   * diagnóstico FUD0001 en emptySpan(at) (no lanza): un pop de más es un bug de la
   * fase llamante, pero el parser no debe romperse. El offset es obligatorio porque
   * todo Diagnostic lleva span (§3.2): sin él la invariante sería imposible.
   */
  pop(at: number): ParseResult<Mode>;

  /** Copia independiente de la pila (para checkpoints de reparseo futuro). */
  clone(): ModeStack;
}
```

### 3.5. `Node` base del AST

```ts
/**
 * Raíz de toda la jerarquía de nodos del AST. Materializa físicamente la
 * invariante "spans universales": es IMPOSIBLE construir un nodo sin span.
 * Los nodos concretos (elementos HTML, expresiones Razor, bloques @code, ...)
 * los definen los SDD 05-10 extendiendo esta base; aquí solo existe el contrato.
 */
export interface Node {
  /**
   * Discriminante de la unión de nodos. Cada SDD posterior añade sus literales.
   * Tipado como string aquí; los SDD concretos lo estrechan con sus propios
   * tipos que extienden Node.
   */
  readonly type: string;

  /** Localización del nodo completo en el fuente. Obligatorio, sin excepción. */
  readonly span: Span;
}

/**
 * Identidad de nodo para hidratación, heredada como IDEA del prototipo
 * compiler-master (2019): __key / __instanceParentKey. Se reserva aquí el
 * LUGAR en el tipo, opcional, para que el emit (SDD-14+) lo rellene; el parser
 * no lo asigna. Mantenerlo fuera del Node base evita contaminar el AST de
 * parsing con conceptos de runtime.
 */
export interface HydratableNode extends Node {
  readonly key?: string;
  readonly instanceParentKey?: string;
}
```

> **Por qué `Token` NO está aquí.** El tipo `Token` y su taxonomía dependen de los
> modos y de las reglas de transición del `@`, que son competencia del tokenizer
> (SDD-03). Definirlo en el 01 invadiría el 03 (regla del INDEX: cada SDD declara su
> "Fuera de alcance" para no pisar al siguiente). El 01 entrega lo que `Token` y `Node`
> *comparten* —`Span`—, no las taxonomías.

---

## 4. Comportamiento

No hay decisiones de gramática que anclar (este SDD es transversal). Las reglas son
invariantes estructurales:

### 4.1. Spans en offsets UTF-16, medio-abiertos

`Span` es `[start, end)` en **offsets de carácter UTF-16** sobre el fuente original,
la misma unidad del `Position` de LSP. No se guardan líneas ni columnas en ningún nodo:
esa conversión la hará un `LineMap` precalculado en SDD-13, bajo demanda. Mantener todo
en offsets hace el merge de spans (`mergeSpans`) y la navegación (`spanContains`) O(1)
y triviales de componer.

`mergeSpans` produce el *bounding span* (el menor rango que cubre ambos), no la unión de
intervalos: si los spans son disjuntos, el hueco intermedio queda incluido. Para la query
"¿qué nodo cubre el offset N?" (§5), `spanLength`/`isEmptySpan` permiten elegir el nodo más
ajustado sin reimplementar `end - start` en cada SDD aguas arriba. Por ser medio-abierto, un
span vacío no cubre ningún offset.

### 4.2. Normalización de `Span`

`span(start, end)` exige `0 <= start <= end`. Un `start > end` es un bug de la fase
llamante; en construcción se **normaliza** (se intercambian) y, dado que el constructor
no tiene contexto de fuente para emitir un `Diagnostic`, se documenta como precondición
del llamante. El span vacío (`start === end`) es legítimo y frecuente (errores puntuales,
inserciones).

### 4.3. El parser nunca lanza — materializado en `ParseResult`

`ParseResult<T>` es el mecanismo que convierte la regla de oro "el parser nunca lanza"
en una forma de tipo. Toda fase devuelve `{ value, diagnostics }` con un `value` siempre
presente (degradado si hace falta). `pop(at)` de `ModeStack` sobre el modo de fondo es el
único punto de este SDD que *podría* querer lanzar y, en su lugar, devuelve un
`ParseResult<Mode>` con un diagnóstico `FUD0001` localizado en `emptySpan(at)` — ejemplo
canónico del patrón que seguirán todos. Por eso `pop` recibe el offset: sin él, el
diagnóstico no podría llevar `span`, violando la propia invariante que este SDD cimenta.

### 4.4. La pila de modos nunca se vacía

`ModeStack` se construye con un modo de fondo (por defecto `'html'`, el modo por defecto
del parser según las notas de gramática) y garantiza `depth >= 1` en todo momento.
`current` y `pop` nunca devuelven `undefined` por pila vacía. Esto elimina una
clase entera de `undefined`-checks aguas arriba.

### 4.5. Identidad de nodo reservada, no implementada

`HydratableNode` reserva `key`/`instanceParentKey` como **lugar** para la identidad de
hidratación heredada del prototipo de 2019. Este SDD no asigna esos campos ni define
cómo se calculan: es responsabilidad del emit (SDD-14+). Separarlo del `Node` base
mantiene el AST de parsing limpio de conceptos de runtime.

---

## 5. Invariantes LSP

Este SDD **es** el cimiento de las invariantes LSP; no las "respeta", las hace posibles:

- **Spans en todo.** `Node.span` y la `span` de `Diagnostic` son obligatorias a nivel
  de tipo. Es imposible, en el resto del proyecto, construir un nodo o un diagnóstico sin
  localización.
- **Nunca lanzar.** `ParseResult<T>` da forma de tipo a la regla. No hay `throw` en el
  código de este SDD (ni en el resto que use estos tipos correctamente).
- **Navegabilidad por offset.** `spanContains` es la primitiva sobre la que SDD-01..05
  construirán la query "¿qué nodo cubre el offset N?" que el language server necesita.
  Existe desde el primer commit.
- **Forma apta para reparseo incremental.** `ModeStack.clone()` permite capturar
  checkpoints de estado del parser; los nodos inmutables (`readonly`) permiten compartir
  subárboles intactos entre reparseos. La *implementación* incremental se difiere (post
  SDD-14), pero la *forma* ya lo permite, como exige el INDEX.

---

## 6. Criterios de aceptación

El SDD está `Hecho` cuando, sobre `@fudic/compiler`:

1. **Typecheck.** `pnpm typecheck` pasa con los tipos de §3 definidos y reexportados
   desde `src/types/index.ts`, bajo el TS estricto del SDD-00 (incluyendo
   `exactOptionalPropertyTypes` y `noUncheckedIndexedAccess`).

2. **`Span`.**
   - `span(3, 7)` ⇒ `{ start: 3, end: 7 }`.
   - `span(5, 5)` (vacío) válido; `emptySpan(5)` equivale a `span(5, 5)`.
   - `span(7, 3)` (start > end) ⇒ `{ start: 3, end: 7 }` (normaliza, no lanza).
   - `spanLength(span(2, 5))` ⇒ `3`; `spanLength(span(5, 5))` ⇒ `0`.
   - `isEmptySpan(span(5, 5))` ⇒ `true`; `isEmptySpan(span(2, 5))` ⇒ `false`.
   - `mergeSpans(span(2,5), span(8,10))` ⇒ `{ start: 2, end: 10 }`.
   - `mergeSpans(span(8,10), span(2,5))` ⇒ `{ start: 2, end: 10 }` (orden indiferente).
   - `spanContains(span(2,5), 2)` ⇒ `true`; `spanContains(span(2,5), 5)` ⇒ `false`
     (medio-abierto); `spanContains(span(2,5), 4)` ⇒ `true`.
   - `spanContains(span(5,5), 5)` ⇒ `false` (un span vacío no contiene ningún offset).

3. **`Diagnostic`.**
   - `errorDiag('FUD0001', 'algo', span(0,1))` ⇒ objeto con `severity: 'error'`,
     `code`, `message`, `span`.
   - `warningDiag` / `infoDiag` / `hintDiag` producen `severity` correcto
     (`'warning'` / `'info'` / `'hint'`).
   - El `code` se conserva literal (no se reformatea).

4. **`ParseResult`.**
   - `ok(42)` ⇒ `{ value: 42, diagnostics: [] }`.
   - `withDiagnostics('x', [d])` ⇒ `{ value: 'x', diagnostics: [d] }`.
   - `collectDiagnostics(ok(1), withDiagnostics(2, [d]))` ⇒ `[d]` (concatena en orden).

5. **`ModeStack`.**
   - `new ModeStack()` ⇒ `current === 'html'`, `depth === 1`.
   - `new ModeStack('css')` ⇒ `current === 'css'`.
   - Tras `push('js')`: `current === 'js'`, `depth === 2`.
   - `pop(at)` sobre esa pila ⇒ `ParseResult<Mode>` con `value === 'js'`, `diagnostics: []`,
     y la pila queda en `current === 'html'`, `depth === 1`.
   - `pop(at)` sobre la pila ya en el modo de fondo ⇒ **no** desapila (`depth` sigue 1),
     devuelve un `ParseResult<Mode>` con `value` igual al modo de fondo y **un**
     diagnóstico `severity: 'error'`, `code === 'FUD0001'`, localizado en `emptySpan(at)`.
     No lanza.
   - `clone()` produce una pila independiente: mutar la copia no afecta al original.

6. **Inmutabilidad.** Los objetos `Span`/`Diagnostic`/`ParseResult` son `readonly` a
   nivel de tipo; un intento de reasignar `s.start` no compila (verificado por
   `pnpm typecheck`, no por test en runtime).

7. **Cobertura.** El módulo de tipos se acerca al 100 % de líneas/funciones (son
   utilidades puras y pequeñas; no hay excusa para menos). Cumple holgadamente el suelo
   global del SDD-00 (80/80/75).

---

## 7. Fuera de alcance

- **Tokenizer y `Token`.** Tipo `Token`, taxonomía de tokens y mecánica de tokenización:
  SDD-03. Aquí solo el `Span` que `Token` compartirá.
- **Nodos concretos del AST.** Elementos HTML, atributos, expresiones Razor, bloques
  `@code`, etc.: los definen SDD-05..10 extendiendo `Node`. Aquí solo la raíz.
- **Reglas de transición del `@`** y cualquier semántica de modos (qué reconoce cada
  modo, cuándo se hace push/pop): SDD-04 y el tokenizer (SDD-03). Aquí solo el conjunto
  `Mode` y la pila como estructura.
- **`LineMap` / conversión offset↔línea-columna.** SDD-13 (source maps).
- **Lógica de hidratación** (cálculo de `key`/`instanceParentKey`): emit, SDD-14+. Aquí
  solo se reserva el campo en `HydratableNode`.
- **Catálogo de códigos `FUDxxxx` concretos.** Cada SDD reserva los suyos; consolidado en
  SDD-12. Aquí solo el formato.
- **Balanceador de delimitadores.** SDD-02; consume estos tipos pero no se define aquí.
