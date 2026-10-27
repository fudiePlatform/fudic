/**
 * `compileMessage` — the ICU subset messages are written in (SDD-58 §4.2, §4.3).
 *
 * - `{name}`, a hole;
 * - `{n, plural, …}` with CLDR categories, `=N` and `#`;
 * - `{x, select, …}`;
 * - `<n>…</n>` and `<n/>`, the inline elements of a phrase of the view;
 * - ICU quoting: `''` is an apostrophe, and an apostrophe before `{`, `}`, `#` or `<` opens a
 *   quoted run up to the next lone one. Any other apostrophe is itself.
 *
 * It never throws: a broken message is `FUD1024` at its position inside the text, and the
 * value is the text as a single literal — what the build shows when a translation is invalid.
 */

import { FUD1024, span } from '@fudic/diagnostics';
import type { SourceDiagnostic } from '@fudic/diagnostics/types';
import type { CompiledMessage, MessagePart } from './compiled.js';
import type { ParseResult } from './result.js';

/** The CLDR plural categories. */
const CATEGORIES: ReadonlySet<string> = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

const SPACE = /\s*/uy;
const NAME = /[\p{L}\p{N}_$]+/uy;
const NUMBER = /-?\d+(?:\.\d+)?/uy;
const TAG = /<(\/)?(\d+)(\/)?>/uy;

/** Thrown inside the parser only, and always caught by `compileMessage`. */
class IcuError {
  constructor(
    readonly start: number,
    readonly end: number,
    readonly reason: string,
  ) {}
}

/** What closes the run being read: the end of the text, a `}` or the closing tag `</n>`. */
type End = 'eof' | '}' | number;

class Parser {
  #at = 0;

  constructor(readonly text: string) {}

  message(): CompiledMessage {
    return this.#parts('eof', undefined);
  }

  #parts(end: End, pound: string | undefined): MessagePart[] {
    const { text } = this;
    const out: MessagePart[] = [];
    let literal = '';
    const flush = (): void => {
      if (literal !== '') out.push(literal);
      literal = '';
    };
    for (;;) {
      const c = text[this.#at];
      if (c === undefined) {
        if (end === 'eof') break;
        this.#fail(this.#at, this.#at, end === '}' ? "missing '}'" : `missing </${end}>`);
      }
      if (c === "'") {
        literal += this.#apostrophe();
        continue;
      }
      if (c === '{') {
        flush();
        out.push(this.#argument(pound));
        continue;
      }
      if (c === '}') {
        if (end !== '}') this.#fail(this.#at, this.#at + 1, "unmatched '}'");
        this.#at++;
        break;
      }
      if (c === '#' && pound !== undefined) {
        flush();
        out.push({ pound });
        this.#at++;
        continue;
      }
      const tag = c === '<' ? this.#match(TAG) : null;
      if (tag !== null) {
        const [all, close, digits, self] = tag;
        const n = Number(digits);
        const start = this.#at;
        this.#at += all.length;
        if (close !== undefined) {
          if (self !== undefined || end !== n) this.#fail(start, this.#at, `unexpected ${all}`);
          break;
        }
        flush();
        out.push(self !== undefined ? { tag: n } : { tag: n, children: this.#parts(n, pound) });
        continue;
      }
      literal += c;
      this.#at++;
    }
    flush();
    return out;
  }

  /** The text an apostrophe at the cursor stands for, consuming it. */
  #apostrophe(): string {
    const { text } = this;
    const next = text[this.#at + 1];
    if (next === "'") {
      this.#at += 2;
      return "'";
    }
    this.#at++;
    if (next === undefined || !'{}#<'.includes(next)) return "'";
    // A quoted run: literal up to the next lone apostrophe, or to the end of the text.
    let quoted = '';
    while (this.#at < text.length) {
      const c = text[this.#at]!;
      if (c === "'") {
        if (text[this.#at + 1] !== "'") {
          this.#at++;
          break;
        }
        this.#at++;
      }
      quoted += c;
      this.#at++;
    }
    return quoted;
  }

  /** `{name}`, `{name, plural, …}` or `{name, select, …}`, the cursor on its `{`. */
  #argument(pound: string | undefined): MessagePart {
    const start = this.#at;
    this.#at++;
    this.#space();
    const name = this.#name('an argument name');
    this.#space();
    if (this.text[this.#at] === '}') {
      this.#at++;
      return { hole: name };
    }
    this.#expect(',', "'}' or ','");
    this.#space();
    const typeAt = this.#at;
    const type = this.#name('plural or select');
    if (type !== 'plural' && type !== 'select') {
      this.#fail(typeAt, this.#at, `"${type}" is not a supported argument type: use plural or select`);
    }
    this.#space();
    this.#expect(',', "','");

    const cases: Record<string, CompiledMessage> = {};
    const seen = new Set<string>();
    let other: CompiledMessage | undefined;
    for (;;) {
      this.#space();
      if (this.#at >= this.text.length) this.#fail(this.#at, this.#at, "missing '}'");
      if (this.text[this.#at] === '}') {
        this.#at++;
        break;
      }
      const selectorAt = this.#at;
      const selector = this.#selector(type);
      if (seen.has(selector)) this.#fail(selectorAt, this.#at, `the case "${selector}" is repeated`);
      seen.add(selector);
      this.#space();
      this.#expect('{', "'{'");
      // `#` means the value of the INNERMOST plural, so a select passes on the one it got.
      const body = this.#parts('}', type === 'plural' ? name : pound);
      if (selector === 'other') other = body;
      else cases[selector] = body;
    }
    if (other === undefined) this.#fail(start, this.#at, `the ${type} of "${name}" has no "other" case`);
    return type === 'plural' ? { plural: name, cases, other } : { select: name, cases, other };
  }

  /** A case selector: `=N` or a category in a plural, any name in a select. */
  #selector(type: 'plural' | 'select'): string {
    const at = this.#at;
    if (type === 'plural' && this.text[at] === '=') {
      this.#at++;
      const n = this.#match(NUMBER);
      if (n === null) this.#fail(at, this.#at, "expected a number after '='");
      this.#at += n[0].length;
      return `=${n[0]}`;
    }
    const selector = this.#name('a case');
    if (type === 'plural' && !CATEGORIES.has(selector)) {
      this.#fail(at, this.#at, `"${selector}" is not a plural category: use =N, zero, one, two, few, many or other`);
    }
    return selector;
  }

  #name(what: string): string {
    const m = this.#match(NAME);
    if (m === null) this.#fail(this.#at, this.#at + 1, `expected ${what}`);
    this.#at += m[0].length;
    return m[0];
  }

  #expect(c: string, what: string): void {
    if (this.text[this.#at] !== c) this.#fail(this.#at, this.#at + 1, `expected ${what}`);
    this.#at++;
  }

  #space(): void {
    this.#at += this.#match(SPACE)![0].length;
  }

  #match(re: RegExp): RegExpExecArray | null {
    re.lastIndex = this.#at;
    return re.exec(this.text);
  }

  #fail(start: number, end: number, reason: string): never {
    const length = this.text.length;
    throw new IcuError(Math.min(start, length), Math.min(end, length), reason);
  }
}

/**
 * Compile an ICU message. `locale` is the language the text is written in: it only names the
 * translation a `FUD1024` is about, whose span is the position INSIDE `text`.
 */
export function compileMessage(text: string, locale: string): ParseResult<CompiledMessage, SourceDiagnostic> {
  try {
    return { value: new Parser(text).message(), diagnostics: [] };
  } catch (error) {
    const e = error as IcuError;
    // Never empty here: the empty text is a valid message.
    return {
      value: [text],
      diagnostics: [FUD1024({ span: span(e.start, e.end), locale, reason: e.reason })],
    };
  }
}

/** The holes (plural and select arguments included) and the tags a message names, sorted. */
export interface MessageShape {
  readonly holes: readonly string[];
  readonly tags: readonly number[];
}

/** What a translation must keep of its source: the set of holes and tags, in any order. */
export function shapeOf(message: CompiledMessage): MessageShape {
  const holes = new Set<string>();
  const tags = new Set<number>();
  const walk = (parts: CompiledMessage): void => {
    for (const part of parts) {
      if (typeof part === 'string' || 'pound' in part) continue;
      if ('hole' in part) {
        holes.add(part.hole);
      } else if ('tag' in part) {
        tags.add(part.tag);
        if (part.children !== undefined) walk(part.children);
      } else {
        holes.add('plural' in part ? part.plural : part.select);
        Object.values(part.cases).forEach(walk);
        walk(part.other);
      }
    }
  };
  walk(message);
  return { holes: [...holes].sort(), tags: [...tags].sort((a, b) => a - b) };
}
