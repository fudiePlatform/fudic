/**
 * A tiny indentation-aware line writer for code generation. It exists so the emit
 * produces readable, correctly-indented source without hand-managed whitespace or
 * nested template-literal concatenation — codegen is structured, not string soup.
 */
export class CodeWriter {
  readonly #lines: string[] = [];
  #depth = 0;

  /** Append one line at the current indentation. An empty string is a blank line. */
  line(text = ''): this {
    this.#lines.push(text === '' ? '' : '  '.repeat(this.#depth) + text);
    return this;
  }

  indent(): this {
    this.#depth += 1;
    return this;
  }

  dedent(): this {
    this.#depth = Math.max(0, this.#depth - 1);
    return this;
  }

  toString(): string {
    return this.#lines.join('\n');
  }
}
