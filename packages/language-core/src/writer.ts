/**
 * The write buffer every virtual file is built through (SDD-23 §4.3, §5).
 *
 * Two operations, and the whole design lives in the difference between them:
 *
 *   - `copy(span)` — the user's text, taken verbatim from the source, with a 1:1 mapping
 *     of identical length. Never reformatted, never normalized, never re-indented: any
 *     rewrite would shift columns and ruin hover and rename.
 *   - `scaffold(text)` — text the emitter invented. It carries `SCAFFOLD_CAPS`, so no
 *     capability routes through it and the user never meets an identifier they did not
 *     write.
 *
 * There is no third operation on purpose. Every stretch of a virtual file is either the
 * user's or the compiler's, and the invariant "no emitted text without a `Mapping`"
 * (§5) is enforced by construction: text only enters through these two doors.
 */

import type { Span } from '@fudic/compiler';
import { SCAFFOLD_CAPS, USER_CAPS } from './caps.js';
import type { Mapping, MappingCaps, VirtualFile } from './types.js';

/**
 * Accumulates the text of one virtual file together with its mapping table.
 *
 * Deterministic by construction: same calls in the same order ⇒ same bytes and same
 * mappings, which is what lets the server cache virtuals by document version.
 */
export class VirtualWriter {
  readonly #source: string;
  readonly #chunks: string[] = [];
  readonly #mappings: Mapping[] = [];
  #offset = 0;

  /** @param source The `.fud` text every `copy()` slices from. */
  constructor(source: string) {
    this.#source = source;
  }

  /** Current offset in the generated file — where the next chunk will start. */
  get offset(): number {
    return this.#offset;
  }

  /**
   * Copy a stretch of the source verbatim, mapped 1:1 with `USER_CAPS`.
   *
   * An empty span writes nothing and records no mapping: a zero-length mapping would be a
   * stretch no position can ever fall inside, so it is noise in the table.
   *
   * `caps` is still user text, never scaffolding: the only caller that passes one is the
   * server virtual copying the neutral zone, which the client virtual already owns for
   * completion (`USER_ECHO_CAPS`). It is a profile, not a third door.
   */
  copy(span: Span, caps: MappingCaps = USER_CAPS): void {
    const text = this.#source.slice(span.start, span.end);
    if (text.length === 0) return;
    this.#mappings.push({
      sourceOffset: span.start,
      generatedOffset: this.#offset,
      length: text.length,
      sourceLength: text.length,
      caps,
    });
    this.#push(text);
  }

  /**
   * Write text the emitter invented, with every capability off.
   *
   * `anchor` is the source construct that motivated the scaffolding — the tag whose
   * attributes become an `$attrs<T>({…})`, say. It is recorded for auditing (criterion 11
   * walks the table asking "is this stretch scaffolding, and is it really mute?") and for
   * debugging `fudic/virtualFiles`; it never routes, because `SCAFFOLD_CAPS` turns every
   * capability off. Scaffolding with no meaningful anchor — a newline, a closing brace —
   * takes none, and simply produces no mapping entry.
   */
  scaffold(text: string, anchor?: Span): void {
    if (text.length === 0) return;
    if (anchor !== undefined) {
      this.#mappings.push({
        sourceOffset: anchor.start,
        generatedOffset: this.#offset,
        length: text.length,
        sourceLength: anchor.end - anchor.start,
        caps: SCAFFOLD_CAPS,
      });
    }
    this.#push(text);
  }

  /**
   * Write invented text that nevertheless stands for a source construct, under explicit
   * capabilities. The one use is the tag projected as a type name (`DIAGNOSTIC_ONLY_CAPS`,
   * see `caps.ts`): text the user did not write, whose diagnostic must still reach them.
   */
  projected(text: string, source: Span, caps: MappingCaps): void {
    if (text.length === 0) return;
    this.#mappings.push({
      sourceOffset: source.start,
      generatedOffset: this.#offset,
      length: text.length,
      sourceLength: source.end - source.start,
      caps,
    });
    this.#push(text);
  }

  /** Assemble the virtual file. The writer stays usable afterwards; nothing is consumed. */
  build(fileName: string, languageId: VirtualFile['languageId']): VirtualFile {
    return {
      fileName,
      languageId,
      text: this.#chunks.join(''),
      mappings: [...this.#mappings],
    };
  }

  #push(text: string): void {
    this.#chunks.push(text);
    this.#offset += text.length;
  }
}
