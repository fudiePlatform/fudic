/**
 * `Mode` / `ModeStack` — the parser's explicit mode stack, operational from this
 * SDD (SDD-01 §3.4, §4.4). SDD-02/03/04/05/09 push and pop it on each transition.
 * The stack never empties: there is always a background mode.
 */

import { emptySpan } from './span.js';
import { errorDiag } from './diagnostic.js';
import { ok, withDiagnostics, type ParseResult } from './result.js';

/**
 * Parser modes (from the "Parser modes" notes in gramatica-v1-decisiones.md).
 * The taxonomy is closed in v1. The MEANING of each mode (what it recognizes) is
 * the job of SDD-03+; here we only fix the set and the stack mechanics.
 */
export type Mode = 'html' | 'js' | 'css' | 'raw' | 'svg' | 'math';

/**
 * Explicit stack of modes. Operational from this SDD: SDD-02/03/04/05/09 push and
 * pop it on each documented transition. There is always a background mode: the
 * stack is initialized with a base mode and never becomes empty.
 */
export class ModeStack {
  /** Invariant: length >= 1 at all times. Index 0 is the background mode. */
  readonly #stack: Mode[];

  /** Creates the stack with a single background mode (defaults to 'html'). */
  constructor(base: Mode = 'html') {
    this.#stack = [base];
  }

  /** Current mode (top). Never undefined: the stack never empties. */
  get current(): Mode {
    // Safe by the length >= 1 invariant; the `!` documents that guarantee
    // against noUncheckedIndexedAccess.
    return this.#stack[this.#stack.length - 1]!;
  }

  /** Current depth (>= 1). */
  get depth(): number {
    return this.#stack.length;
  }

  /** Pushes a new mode. */
  push(mode: Mode): void {
    this.#stack.push(mode);
  }

  /**
   * Pops the top mode and returns it. `at` is the parser's current offset: it is
   * only used to locate the diagnostic when the pop is invalid. If only the
   * background mode remains, it does NOT pop and returns a ParseResult<Mode> with
   * a FUD0001 diagnostic at emptySpan(at) (it does not throw): an extra pop is a
   * bug in the calling phase, but the parser must not break. The offset is
   * required because every Diagnostic carries a span: without it the invariant
   * would be impossible.
   */
  pop(at: number): ParseResult<Mode> {
    if (this.#stack.length <= 1) {
      return withDiagnostics(this.current, [
        errorDiag('FUD0001', 'mode stack underflow: pop on the background mode', emptySpan(at)),
      ]);
    }
    return ok(this.#stack.pop()!);
  }

  /** Independent copy of the stack (for future re-parse checkpoints). */
  clone(): ModeStack {
    const copy = new ModeStack(this.#stack[0]!);
    // Replace the contents with a full copy, reusing the base already set by the
    // constructor without duplicating it.
    copy.#stack.length = 0;
    copy.#stack.push(...this.#stack);
    return copy;
  }
}
