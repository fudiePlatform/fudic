/**
 * Oxc integration (SDD-11): the lexical/syntactic bridge that upholds the golden
 * rule "Oxc is invoked exactly once per file". Every JS/TS fragment of a `.fud`
 * (Razor expressions, control headers, `case` tests, `@{ … }`, and the
 * neutral/`@server`/`@client` regions of `@code`) is accumulated into ONE
 * synthetic buffer with a region table, parsed with a single `parseSync` call,
 * and mapped back — AST nodes and error spans — to the original source offsets.
 *
 * SDD-11 is purely syntactic: it validates syntax and yields an AST. It does NOT
 * type-check nor resolve scopes (that is the later Volar/tsc layer). It knows
 * nothing about the SDD-05/06/08 tree; it receives JS spans plus their kind.
 */

import {
  type Span,
  span,
  type Diagnostic,
  errorDiag,
  type ParseResult,
  withDiagnostics,
} from '../types/index.js';
import { parseSync } from 'oxc-parser';

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

export interface JsBatchResult {
  /**
   * The Oxc AST root for a fragment. Shape depends on the kind (§4.1):
   * - `expression`     → the inner `Expression` (the synthetic `( … )` wrapper is unwrapped).
   * - `module-statements` / `block-statements` → the `Statement[]` list.
   * - `for-of-header`  → the `ForOfStatement`.
   * - `for-header`     → the `ForStatement`.
   *
   * NOTE: §3 of the spec types this as `OxcNode`, but its own comment and the
   * acceptance criteria (#3/#4) require a `Statement[]` for the two statement
   * kinds, so the return type is widened to the union. Node `start`/`end` stay in
   * BUFFER coordinates; callers use `mapSpan` for source coordinates.
   */
  ast(id: FragmentId): OxcNode | readonly OxcNode[];
  /** Map a buffer offset (from an Oxc node) back to the original .fud source. */
  mapOffset(bufferOffset: number): number;
  /** Map a buffer [start, end) back to an original-source Span. */
  mapSpan(bufferStart: number, bufferEnd: number): Span;
}

/** Diagnostic code range reserved by SDD-11 is FUD0170–FUD0189. */
const FUD_OXC_SYNTAX = 'FUD0170';

/** Synthetic filename: `.ts` enables TypeScript; no JSX appears in the JS of a `.fud`. */
const SYNTHETIC_FILENAME = 'fudic-batch.ts';

/** Verbatim-copied text is wrapped so the concatenated buffer stays valid JS/TS (§4.1). */
const WRAPPERS: Readonly<Record<JsFragmentKind, { readonly prefix: string; readonly suffix: string }>> = {
  expression: { prefix: '(', suffix: ');' },
  'module-statements': { prefix: '', suffix: '' },
  'block-statements': { prefix: '{', suffix: '}' },
  'for-of-header': { prefix: 'for (', suffix: ') {}' },
  'for-header': { prefix: 'for (', suffix: ') {}' },
};

/** A registered fragment in original-source coordinates. */
interface Fragment {
  readonly kind: JsFragmentKind;
  readonly srcStart: number;
  readonly srcEnd: number;
}

/** A fragment after buffer construction: same text length in source and buffer (§4.2). */
interface PlacedFragment extends Fragment {
  /** Buffer offset where the wrapper prefix begins. */
  readonly bufChunkStart: number;
  /** Buffer offset where the verbatim copy begins (after the prefix). */
  readonly bufTextStart: number;
  /** Verbatim text length (identical in source and buffer). */
  readonly textLen: number;
  /** Buffer offset just past the wrapper suffix (before the `\n` separator). */
  readonly bufChunkEnd: number;
}

/**
 * Accumulates JS fragments, builds ONE synthetic buffer with a region table, and
 * drives Oxc once. Never throws: Oxc syntax errors become mapped diagnostics.
 */
export class JsBatch {
  readonly #source: string;
  readonly #fragments: Fragment[] = [];
  #result: ParseResult<JsBatchResult> | undefined;

  constructor(source: string) {
    this.#source = source;
  }

  /** Register a fragment at `sp` (original-source coordinates). Returns its id. Order-preserving. */
  add(kind: JsFragmentKind, sp: Span): FragmentId {
    const id = this.#fragments.length;
    this.#fragments.push({ kind, srcStart: sp.start, srcEnd: sp.end });
    // A late registration invalidates the memoized buffer so a re-parse sees it.
    this.#result = undefined;
    return id;
  }

  /** Build the buffer and invoke Oxc exactly once. Memoized: repeated calls reuse the result. */
  parse(): ParseResult<JsBatchResult> {
    if (this.#result !== undefined) return this.#result;
    this.#result = this.#build();
    return this.#result;
  }

  #build(): ParseResult<JsBatchResult> {
    // 1. Concatenate the wrapped fragments into the synthetic buffer (§4.2).
    const placed: PlacedFragment[] = [];
    let buffer = '';
    for (const frag of this.#fragments) {
      const wrap = WRAPPERS[frag.kind];
      const bufChunkStart = buffer.length;
      buffer += wrap.prefix;
      const bufTextStart = buffer.length;
      const text = this.#source.slice(frag.srcStart, frag.srcEnd);
      buffer += text;
      buffer += wrap.suffix;
      const bufChunkEnd = buffer.length;
      buffer += '\n'; // synthetic separator: one fragment per line(s)
      placed.push({
        ...frag,
        bufChunkStart,
        bufTextStart,
        textLen: text.length,
        bufChunkEnd,
      });
    }

    // 2. Invoke Oxc exactly once (§4.3). Synchronous: native NAPI, deterministic, LSP-fit.
    const parsed = parseSync(SYNTHETIC_FILENAME, buffer, {
      lang: 'ts',
      sourceType: 'module',
      preserveParens: true,
    });

    // 3. Partition the top-level statements per fragment by buffer position.
    const body = parsed.program.body as unknown as OxcNode[];
    const roots = extractRoots(placed, body);

    // 4. Build the mapping primitives (§4.4).
    const mapOffset = (bufOffset: number): number => mapBufferOffset(placed, bufOffset);
    const mapSpan = (a: number, b: number): Span => span(mapOffset(a), mapOffset(b));

    // 5. Relocate Oxc errors to source spans (§4.5). Never propagate exceptions.
    const diagnostics: Diagnostic[] = [];
    for (const err of parsed.errors) {
      const label = err.labels[0];
      const sp = label
        ? mapSpan(label.start, label.end)
        : mapSpan(0, buffer.length);
      diagnostics.push(errorDiag(FUD_OXC_SYNTAX, err.message, sp));
    }

    const result: JsBatchResult = {
      ast: (id) => {
        const root = roots[id];
        return root ?? [];
      },
      mapOffset,
      mapSpan,
    };
    return withDiagnostics(result, diagnostics);
  }
}

/** Extract the AST root per fragment (§4.1) from the flat top-level statement list. */
function extractRoots(
  placed: readonly PlacedFragment[],
  body: readonly OxcNode[],
): (OxcNode | readonly OxcNode[])[] {
  // Bucket top-level statements into their owning fragment by buffer offset. Both
  // `placed` and `body` are ordered ascending, so a single forward pointer suffices.
  const buckets: OxcNode[][] = placed.map(() => []);
  let ri = 0;
  for (const stmt of body) {
    while (ri < placed.length && stmt.start >= placed[ri]!.bufChunkEnd) ri += 1;
    if (ri >= placed.length) break;
    if (stmt.start >= placed[ri]!.bufChunkStart) buckets[ri]!.push(stmt);
  }

  return placed.map((frag, i) => extractRoot(frag.kind, buckets[i]!));
}

/** Apply the per-kind extraction (§4.1) to one fragment's top-level statements. */
function extractRoot(
  kind: JsFragmentKind,
  stmts: readonly OxcNode[],
): OxcNode | readonly OxcNode[] {
  switch (kind) {
    case 'module-statements':
      return stmts;
    case 'block-statements': {
      // The lone `{ … }` chunk is a BlockStatement; return its `.body` list.
      const block = stmts[0];
      return (block?.['body'] as readonly OxcNode[] | undefined) ?? [];
    }
    case 'expression': {
      // `( expr );` → an ExpressionStatement whose `.expression` is the synthetic
      // ParenthesizedExpression (preserveParens is on); unwrap it one level.
      const expr = stmts[0]?.['expression'] as OxcNode | undefined;
      if (expr === undefined) return [];
      return (expr['expression'] as OxcNode | undefined) ?? expr;
    }
    case 'for-of-header':
    case 'for-header':
      // `for ( header ) {}` → the sole ForOfStatement / ForStatement.
      return stmts[0] ?? [];
  }
}

/**
 * Map a buffer offset back to the original source (§4.4). Locates the fragment
 * whose chunk contains the offset (or the adjacent one, for wrapper-zone offsets)
 * and applies the linear translation, clamped to the fragment's source span.
 */
function mapBufferOffset(placed: readonly PlacedFragment[], bufOffset: number): number {
  if (placed.length === 0) return bufOffset;

  // Last fragment whose chunk begins at or before the offset: the one containing
  // it, or — when the offset falls in a synthetic separator/wrapper gap — the
  // adjacent fragment, so an error stays anchored within its span.
  let chosen = placed[0]!;
  for (const frag of placed) {
    if (frag.bufChunkStart <= bufOffset) chosen = frag;
    else break;
  }

  const bufTextEnd = chosen.bufTextStart + chosen.textLen;
  const clamped = bufOffset < chosen.bufTextStart
    ? chosen.bufTextStart
    : bufOffset > bufTextEnd
      ? bufTextEnd
      : bufOffset;
  return chosen.srcStart + (clamped - chosen.bufTextStart);
}
