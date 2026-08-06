/**
 * A tiny indentation-aware line writer for code generation. It exists so the emit
 * produces readable, correctly-indented source without hand-managed whitespace or
 * nested template-literal concatenation — codegen is structured, not string soup.
 *
 * It also carries the output↔source mapping (SDD-13 / SDD-19 §4.6): a line may be
 * built from typed segments, some anchored to a `.fud` source offset. Because the
 * writer is the single place that knows the output layout (indentation + line joins),
 * it is the single place that can turn those anchors into generated offsets — the
 * pairs `SourceMapBuilder` consumes. Plain `line()` calls carry no mapping.
 */

/** A generated↔source offset pair: `generatedOffset` in the emit output, `sourceOffset` in the `.fud`. */
export interface EmitMapping {
  readonly generatedOffset: number;
  readonly sourceOffset: number;
}

/** A fragment of a line anchored to a `.fud` source offset (a verbatim slice of user code). */
export interface MappedPart {
  readonly text: string;
  /** UTF-16 offset in the `.fud` source this fragment was sliced from. */
  readonly src: number;
}

/** A piece of a line: a literal string, or a source-anchored fragment. */
export type LinePart = string | MappedPart;

interface Segment {
  readonly text: string;
  readonly src?: number;
}

interface Line {
  readonly indent: number;
  readonly segments: readonly Segment[];
}

const toSegment = (part: LinePart): Segment =>
  typeof part === 'string' ? { text: part } : { text: part.text, src: part.src };

export class CodeWriter {
  readonly #lines: Line[] = [];
  #depth = 0;

  /** Append one line at the current indentation. An empty string is a blank line. */
  line(text = ''): this {
    // A blank line stays blank regardless of depth (matches the historical `''` output).
    this.#lines.push(text === '' ? { indent: 0, segments: [] } : { indent: this.#depth, segments: [{ text }] });
    return this;
  }

  /**
   * Append one line built from mixed parts at the current indentation. A plain string
   * part is literal; a `MappedPart` is a verbatim source slice anchored to its offset,
   * recorded as a mapping. The concatenated text is byte-identical to the equivalent
   * `line(concatenation)`.
   */
  mappedLine(...parts: readonly LinePart[]): this {
    this.#lines.push({ indent: this.#depth, segments: parts.map(toSegment) });
    return this;
  }

  /**
   * Splice another writer's lines in at the current indentation, carrying their
   * mappings. Each incoming line is re-indented by the current depth — byte-identical
   * to copying `other.toString().split('\n')` through `line()`, but the source anchors
   * survive the copy (splitting to strings would lose them).
   */
  appendWriter(other: CodeWriter): this {
    for (const l of other.#lines) {
      this.#lines.push({ indent: l.segments.length === 0 ? 0 : this.#depth + l.indent, segments: l.segments });
    }
    return this;
  }

  /** Whether nothing has been written yet — an empty body is emitted as `() => {}`. */
  get empty(): boolean {
    return this.#lines.length === 0;
  }

  indent(): this {
    this.#depth += 1;
    return this;
  }

  dedent(): this {
    this.#depth = Math.max(0, this.#depth - 1);
    return this;
  }

  #renderLine(l: Line): string {
    if (l.segments.length === 0) return '';
    return '  '.repeat(l.indent) + l.segments.map((s) => s.text).join('');
  }

  toString(): string {
    return this.#lines.map((l) => this.#renderLine(l)).join('\n');
  }

  /**
   * The output↔source mappings anchored so far, with generated offsets computed over
   * the final `toString()` layout. Sorted by nothing here — `SourceMapBuilder` sorts.
   */
  mappings(): readonly EmitMapping[] {
    const out: EmitMapping[] = [];
    let offset = 0;
    this.#lines.forEach((l, i) => {
      const prefixLen = l.segments.length === 0 ? 0 : l.indent * 2;
      let col = prefixLen;
      for (const seg of l.segments) {
        if (seg.src !== undefined) out.push({ generatedOffset: offset + col, sourceOffset: seg.src });
        col += seg.text.length;
      }
      offset += col; // prefix + all segment text = the rendered line length
      if (i < this.#lines.length - 1) offset += 1; // the '\n' inserted by join
    });
    return out;
  }
}
