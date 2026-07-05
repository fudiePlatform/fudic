# SDD-13 — Source maps y `LineMap`

> **Estado:** `Listo`
> **Depende de:** 00, 01, 11
> **Decisiones de gramática:** — (transversal: la conversión offset↔posición que todo SDD difirió aquí)

---

## 1. Contexto y objetivo

Regla de oro del proyecto: **nunca se guardan líneas/columnas**; todo span es un offset UTF-16.
La conversión a posición 2D se **difiere a este SDD**. SDD-13 entrega dos cosas:

1. **`LineMap`** — convierte offset UTF-16 ↔ `(line, character)` sobre el `.fud`, precomputando
   los inicios de línea. Es lo que convierte cada `Diagnostic` (offset) en un `Range` LSP, y lo
   que el generador de source maps usa por dentro. Es el "borde" donde el mundo-offset se
   traduce al mundo línea/columna del editor.

2. **`SourceMapBuilder`** — acumula pares (offset de salida ↔ offset de fuente) y serializa un
   **Source Map v3** (VLQ Base64), para que el output de nivel 1 (HTML, y el JS de niveles
   superiores) apunte de vuelta al `.fud` en devtools y en errores.

SDD-13 es **puro y no falla**: fuera de rango se **clampa**, no se lanza ni se diagnostica. No
emite ningún código `FUD`.

**Composición con SDD-11.** El JS de salida procede del buffer sintético de SDD-11, cuyos nodos
llevan offsets **de buffer**. El emit (SDD-14) traduce buffer→fuente con `JsBatchResult.mapOffset`
y pasa a SDD-13 el offset de **fuente** ya resuelto. SDD-13 no encadena ese salto; recibe el
offset de fuente final.

---

## 2. Dependencias

| SDD | Estado exigido | Qué aporta |
|---|---|---|
| 00 | `Hecho` | TS estricto, Vitest. |
| 01 | `Hecho` | `Span` (la entrada a convertir). |
| 11 | `Hecho` | `JsBatchResult.mapOffset` — upstream de los offsets de JS (compuesto por el emit, no aquí). |

```ts
import { type Span } from '../types/index.js';
```

> **Por qué `Position` no estaba en SDD-01.** SDD-01 mantuvo todo en offsets a propósito y dejó
> la posición 2D para aquí (su §7 lo dice). SDD-13 es el hogar de `Position`/`Range`.

---

## 3. Interfaz pública

Ubicación: `packages/compiler/src/sourcemap/` (`position.ts`, `linemap.ts`, `sourcemap.ts`,
reexportados desde `sourcemap/index.ts`). Todo en inglés.

### 3.1. Posiciones (formato LSP)

```ts
/** 0-based line and 0-based character, in UTF-16 code units — LSP Position exactly. */
export interface Position {
  readonly line: number;
  readonly character: number;
}

/** A [start, end) range in 2D positions — LSP Range. */
export interface Range {
  readonly start: Position;
  readonly end: Position;
}
```

### 3.2. `LineMap`

```ts
/**
 * Precomputed line-start table over a source. O(n) to build, O(log n) per query. Line breaks
 * recognized: `\n`, `\r\n`, `\r`. `character` counts UTF-16 code units from the line start
 * (same unit as Span offsets), so conversion is exact and lossless.
 */
export class LineMap {
  constructor(source: string);
  /** Number of lines (≥ 1). */
  readonly lineCount: number;
  /** (line, character) for a UTF-16 offset. Out-of-range clamps to [0, length]. */
  positionAt(offset: number): Position;
  /** UTF-16 offset for a position. Out-of-range clamps. */
  offsetAt(position: Position): number;
}

/** Convert a Span to an LSP Range via a LineMap. The edge where offsets become positions. */
export function rangeOf(lineMap: LineMap, s: Span): Range;
```

### 3.3. Source Map v3

```ts
export interface SourceMapV3 {
  readonly version: 3;
  readonly file: string;
  readonly sources: readonly string[];
  readonly sourcesContent: readonly (string | null)[];
  readonly names: readonly string[];
  readonly mappings: string; // Base64 VLQ
}

export interface SourceMapOptions {
  /** Generated file name (the emit output). */
  readonly file: string;
  /** The `.fud` path recorded in `sources`. */
  readonly source: string;
  /** The `.fud` text, embedded in `sourcesContent`. */
  readonly sourceContent: string;
  /** LineMap over the ORIGINAL `.fud` source. */
  readonly sourceLineMap: LineMap;
  /** LineMap over the GENERATED output (built by the emit over its own text). */
  readonly generatedLineMap: LineMap;
}

/**
 * Accumulates output↔source segments and serializes a Source Map v3. Both offsets are converted
 * to positions with the respective LineMap; segments are VLQ-encoded. Never throws.
 */
export class SourceMapBuilder {
  constructor(options: SourceMapOptions);
  /** Record that generated `generatedOffset` originates from `.fud` `sourceOffset`. */
  addMapping(generatedOffset: number, sourceOffset: number): void;
  /** Serialize. Idempotent; mappings are sorted by generated position. */
  build(): SourceMapV3;
}
```

---

## 4. Comportamiento

### 4.1. `LineMap`

Construcción: un barrido del `source` guarda el offset de inicio de cada línea (`lineStarts[0]
= 0`; tras cada terminador, el offset siguiente). `\r\n` cuenta como **un** salto (no dos
líneas vacías). `positionAt` hace búsqueda binaria en `lineStarts`; `character = offset −
lineStarts[line]`. `offsetAt` invierte. Fuera de rango se **clampa** a `[0, source.length]` sin
error (regla "nunca lanza", llevada a una utilidad pura).

`character` en **unidades UTF-16**, igual que los offsets de `Span`: es el default de LSP, así
que no hay recodificación. (Negociar columnas UTF-8 con un cliente LSP es futuro; no afecta a la
forma de §3.)

### 4.2. `rangeOf`

`rangeOf(lm, s)` = `{ start: lm.positionAt(s.start), end: lm.positionAt(s.end) }`. Es la función
que la capa LSP aplica a cada `Diagnostic.span` para entregar `Range`. Un span vacío
(`start === end`) da un range vacío (cursor).

### 4.3. `SourceMapBuilder`

`addMapping` acumula `(generatedOffset, sourceOffset)`. `build` los ordena por posición
generada, agrupa por línea generada, y codifica cada segmento como el VLQ de los **deltas**:
`[Δcolumna generada, Δíndice de fuente, Δlínea fuente, Δcolumna fuente]` (4 campos; sin el 5º de
`names` en v1 — no mapeamos identificadores todavía). `sources = [options.source]`,
`sourcesContent = [options.sourceContent]`, `names = []`. Las posiciones salen de los dos
`LineMap`.

### 4.4. Códigos `FUD`

SDD-13 reserva **`FUD0210`–`FUD0229`** pero **no define ninguno**: es conversión pura que clampa
en vez de fallar.

---

## 5. Invariantes LSP

- **El borde de las invariantes.** Todo el proyecto mantiene offsets precisamente para que la
  conversión a línea/columna sea O(log n) y viva en un solo sitio: aquí. `LineMap` es esa pieza.
- **Nunca lanza.** Clamp en vez de excepción, en `LineMap` y en el builder.
- **Lossless.** UTF-16 en ambos lados: offset→posición→offset es identidad dentro de rango.
- **Apto para incremental.** `LineMap` se reconstruye barato; una edición local solo desplaza
  `lineStarts` a partir del punto de cambio (optimización futura; la forma ya lo admite).

---

## 6. Criterios de aceptación

El SDD está `Hecho` cuando:

1. **Typecheck.** `pnpm typecheck` pasa con §3 definido y reexportado.

2. **`LineMap` básico.** Sobre `"ab\ncd"`: `positionAt(0)` ⇒ `{line:0,character:0}`;
   `positionAt(3)` ⇒ `{line:1,character:0}`; `positionAt(4)` ⇒ `{line:1,character:1}`.
   `offsetAt({line:1,character:1})` ⇒ `4`. Roundtrip identidad.

3. **CRLF.** Sobre `"a\r\nb"`: `positionAt(3)` ⇒ `{line:1,character:0}` (el `\r\n` es un salto).

4. **Clamp.** `positionAt(9999)` ⇒ posición del final; `offsetAt({line:99,character:0})` ⇒
   `source.length`. Sin excepción.

5. **`rangeOf`.** `rangeOf(lm, span(0,2))` sobre `"ab\ncd"` ⇒
   `{start:{0,0}, end:{0,2}}`.

6. **Source Map v3 válido.** Con un par de mappings, `build()` produce `{version:3, sources:[…],
   sourcesContent:[…], names:[], mappings:"…"}` y `mappings` decodifica (VLQ) a los segmentos
   esperados.

7. **Composición con SDD-11.** Un offset de nodo JS de buffer, pasado por `mapOffset` (SDD-11) y
   luego a `addMapping`, produce un segmento que apunta a la posición correcta del `.fud`.

8. **Cobertura.** Cerca del 100 % (utilidad pura, sin excusa). Cumple el suelo del SDD-00.

---

## 7. Fuera de alcance

- **Generación del output** (HTML/JS) y el cálculo de qué offset de salida viene de qué offset de
  fuente: **SDD-14 (emit)**, que llama a `addMapping`.
- **Adjuntar el source map** (`//# sourceMappingURL=`, data URL, fichero `.map`): **SDD-14**.
- **Mapeo de `names`/identificadores** (5º campo VLQ): futuro; v1 no mapea nombres.
- **Columnas UTF-8** (negociación LSP `positionEncoding`): futuro.
- **El salto buffer↔fuente del JS** lo hace **SDD-11** (`mapOffset`); SDD-13 recibe offsets de
  fuente ya resueltos.
