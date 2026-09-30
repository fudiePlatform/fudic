/**
 * Selectors, read far enough to ask one question: can this match anything on the page?
 * (SDD-49 §3.2, §4.3)
 *
 * The model keeps what restricts a match — type, classes, ids, attributes, the arguments of
 * `:is()` — and files every other pseudo-class under `pseudo`, where the prune reads the few
 * with a meaning of their own (`:root`, `:host`). Specificity, the structure of combinators
 * and the arguments of `:not()` / `:has()` are not modelled: none of them can make a rule
 * apply to an element that is not on the page.
 *
 * Anything it does not understand makes the WHOLE list `null`, and a `null` list keeps its
 * rule. That is the direction the prune is allowed to err in.
 */

export type Combinator = ' ' | '>' | '+' | '~';

/** The operators an attribute selector can compare its value with. */
export type AttributeOperator = '=' | '~=' | '|=' | '^=' | '$=' | '*=';

export interface AttributeSelector {
  readonly name: string;
  /** Absent for `[name]`, and for a comparison the prune does not attempt (the `i` flag). */
  readonly value?: string;
  /** How `value` is compared; present exactly when `value` is. */
  readonly operator?: AttributeOperator;
}

export interface CompoundSelector {
  /** Lower case; absent for `*`, `&` or no type at all. */
  readonly type?: string;
  readonly classes: readonly string[];
  readonly ids: readonly string[];
  readonly attributes: readonly AttributeSelector[];
  /** `:is()` / `:where()` / `:matches()`: one of its arguments matching is enough. */
  readonly anyOf: readonly (readonly ComplexSelector[])[];
  /** Every other pseudo, lower case and without colons — only to decide the rules of §4.3. */
  readonly pseudo: readonly string[];
  /** `::slotted(x)` → x. */
  readonly slotted?: ComplexSelector;
  /** `::part(n)` → n, as written (one or more names). */
  readonly part?: string;
}

export interface ComplexSelector {
  readonly compounds: readonly CompoundSelector[];
  /** `compounds.length - 1` of them. */
  readonly combinators: readonly Combinator[];
}

const SPACE = /\s/u;
const NAME_START = /[A-Za-z_\u0080-￿-]/u;
const NAME = /[\w\u0080-￿-]/u;
const HEX = /[0-9A-Fa-f]/u;
const ANY_OF = new Set(['is', 'where', 'matches', '-webkit-any', '-moz-any']);
const OPERATORS = new Set<string>(['=', '~=', '|=', '^=', '$=', '*=']);

/** Thrown inside this module only, and caught by `parseSelectorList`: «I do not understand». */
class Unreadable {}

/** A selector prelude without its comments, which may sit anywhere whitespace may. */
function withoutComments(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"' || ch === "'") {
      const end = endOfString(text, i);
      out += text.slice(i, end);
      i = end;
    } else if (ch === '/' && text[i + 1] === '*') {
      const close = text.indexOf('*/', i + 2);
      if (close === -1) throw new Unreadable();
      out += ' ';
      i = close + 2;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

function endOfString(text: string, start: number): number {
  const quote = text[start];
  let i = start + 1;
  while (i < text.length) {
    if (text[i] === '\\') i += 2;
    else if (text[i] === quote) return i + 1;
    else i += 1;
  }
  throw new Unreadable();
}

/** `text` split at the top-level commas, outside parentheses, brackets and strings. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = endOfString(text, i);
      continue;
    }
    if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(from, i));
      from = i + 1;
    }
    i += 1;
  }
  parts.push(text.slice(from));
  return parts;
}

/** A cursor over one complex selector. */
class SelectorReader {
  readonly #text: string;
  #i = 0;

  constructor(text: string) {
    this.#text = text;
  }

  #peek(offset = 0): string | undefined {
    return this.#text[this.#i + offset];
  }

  #spaces(): boolean {
    const from = this.#i;
    while (this.#i < this.#text.length && SPACE.test(this.#text[this.#i]!)) this.#i += 1;
    return this.#i > from;
  }

  /** An identifier with its escapes resolved: `.md\:flex` is the class `md:flex`. */
  #ident(): string {
    const text = this.#text;
    let out = '';
    const first = this.#peek();
    if (first === undefined || !(NAME_START.test(first) || first === '\\')) throw new Unreadable();
    while (this.#i < text.length) {
      const ch = text[this.#i]!;
      if (ch === '\\') {
        this.#i += 1;
        let hex = '';
        while (hex.length < 6 && this.#i < text.length && HEX.test(text[this.#i]!)) {
          hex += text[this.#i];
          this.#i += 1;
        }
        if (hex !== '') {
          out += String.fromCodePoint(Number.parseInt(hex, 16));
          if (this.#i < text.length && SPACE.test(text[this.#i]!)) this.#i += 1;
        } else if (this.#i < text.length) {
          out += text[this.#i];
          this.#i += 1;
        } else {
          throw new Unreadable();
        }
      } else if (NAME.test(ch)) {
        out += ch;
        this.#i += 1;
      } else {
        break;
      }
    }
    return out;
  }

  /** The text between the `(` at the cursor and its `)`, the cursor left past the `)`. */
  #arguments(): string {
    const text = this.#text;
    const open = this.#i;
    let depth = 0;
    while (this.#i < text.length) {
      const ch = text[this.#i]!;
      if (ch === '\\') {
        this.#i += 2;
        continue;
      }
      if (ch === '"' || ch === "'") {
        this.#i = endOfString(text, this.#i);
        continue;
      }
      if (ch === '(') depth += 1;
      else if (ch === ')') {
        depth -= 1;
        if (depth === 0) {
          this.#i += 1;
          return text.slice(open + 1, this.#i - 1);
        }
      }
      this.#i += 1;
    }
    throw new Unreadable();
  }

  #attribute(): AttributeSelector {
    const text = this.#text;
    this.#i += 1; // [
    this.#spaces();
    if (this.#peek() === '*' || this.#peek() === '|') throw new Unreadable();
    const name = this.#ident().toLowerCase();
    if (this.#peek() === '|' && this.#peek(1) !== '=') throw new Unreadable();
    this.#spaces();
    if (this.#peek() === ']') {
      this.#i += 1;
      return { name };
    }
    const op = this.#peek() === '=' ? '=' : `${this.#peek() ?? ''}${this.#peek(1) ?? ''}`;
    if (!OPERATORS.has(op)) throw new Unreadable();
    this.#i += op.length;
    this.#spaces();
    let value: string;
    const q = this.#peek();
    if (q === '"' || q === "'") {
      const end = endOfString(text, this.#i);
      value = unescapeString(text.slice(this.#i + 1, end - 1));
      this.#i = end;
    } else {
      value = this.#ident();
    }
    this.#spaces();
    let flagged = false;
    if (this.#peek() !== ']') {
      const flag = this.#ident().toLowerCase();
      if (flag !== 'i' && flag !== 's') throw new Unreadable();
      flagged = flag === 'i';
      this.#spaces();
    }
    if (this.#peek() !== ']') throw new Unreadable();
    this.#i += 1;
    // A case-insensitive comparison is kept by name alone: conservative, and rare.
    return flagged ? { name } : { name, value, operator: op as AttributeOperator };
  }

  /** One compound, or `null` when the cursor is not at the start of one. */
  #compound(): CompoundSelector | null {
    let type: string | undefined;
    const classes: string[] = [];
    const ids: string[] = [];
    const attributes: AttributeSelector[] = [];
    const anyOf: (readonly ComplexSelector[])[] = [];
    const pseudo: string[] = [];
    let slotted: ComplexSelector | undefined;
    let part: string | undefined;
    let any = false;

    const first = this.#peek();
    if (first === '*') {
      this.#i += 1;
      any = true;
      if (this.#peek() === '|') throw new Unreadable();
    } else if (first === '&') {
      this.#i += 1;
      any = true;
    } else if (first !== undefined && (NAME_START.test(first) || first === '\\')) {
      type = this.#ident().toLowerCase();
      any = true;
      if (this.#peek() === '|') throw new Unreadable();
    }

    for (;;) {
      const ch = this.#peek();
      if (ch === '.') {
        this.#i += 1;
        classes.push(this.#ident());
      } else if (ch === '#') {
        this.#i += 1;
        ids.push(this.#ident());
      } else if (ch === '[') {
        attributes.push(this.#attribute());
      } else if (ch === '&') {
        this.#i += 1;
      } else if (ch === ':') {
        this.#i += 1;
        const element = this.#peek() === ':';
        if (element) this.#i += 1;
        const name = this.#ident().toLowerCase();
        const args = this.#peek() === '(' ? this.#arguments() : null;
        if (!element && args !== null && ANY_OF.has(name)) {
          const list = parseList(args);
          if (list === null) throw new Unreadable();
          anyOf.push(list);
        } else if (element && name === 'slotted') {
          const list = args === null ? null : parseList(args);
          if (list === null || list.length !== 1) throw new Unreadable();
          slotted = list[0];
        } else if (element && name === 'part') {
          if (args === null || args.trim() === '') throw new Unreadable();
          part = args.trim();
        } else {
          pseudo.push(name);
        }
      } else {
        break;
      }
      any = true;
    }
    if (!any) return null;
    return {
      ...(type === undefined ? {} : { type }),
      classes,
      ids,
      attributes,
      anyOf,
      pseudo,
      ...(slotted === undefined ? {} : { slotted }),
      ...(part === undefined ? {} : { part }),
    };
  }

  /** The whole text as one complex selector. */
  complex(): ComplexSelector {
    const compounds: CompoundSelector[] = [];
    const combinators: Combinator[] = [];
    this.#spaces();
    // A relative selector (`> li` inside a nested rule): the leading combinator is structure,
    // and structure is not checked (§4.3).
    if (this.#peek() === '>' || this.#peek() === '+' || this.#peek() === '~') {
      this.#i += 1;
      this.#spaces();
    }
    for (;;) {
      const compound = this.#compound();
      if (compound === null) throw new Unreadable();
      compounds.push(compound);
      const spaced = this.#spaces();
      if (this.#i >= this.#text.length) break;
      const ch = this.#peek()!;
      if (ch === '>' || ch === '+' || ch === '~') {
        if (this.#peek(1) === ch && ch !== '>') throw new Unreadable();
        this.#i += 1;
        this.#spaces();
        combinators.push(ch);
      } else if (spaced) {
        combinators.push(' ');
      } else {
        throw new Unreadable();
      }
    }
    return { compounds, combinators };
  }
}

/** A string value with its escapes resolved. */
function unescapeString(text: string): string {
  return text.replace(/\\([0-9A-Fa-f]{1,6}\s?|[\s\S])/gu, (_, esc: string) =>
    HEX.test(esc[0]!) ? String.fromCodePoint(Number.parseInt(esc.trim(), 16)) : esc,
  );
}

function parseList(text: string): readonly ComplexSelector[] | null {
  try {
    const parts = splitTopLevel(withoutComments(text));
    return parts.map((part) => {
      if (part.trim() === '') throw new Unreadable();
      return new SelectorReader(part.trim()).complex();
    });
  } catch {
    // Whatever stopped the reader, the answer is the same one: not understood, rule kept.
    return null;
  }
}

/** `null` when the prelude is not understood: the rule is kept (§4.3). */
export function parseSelectorList(prelude: string): readonly ComplexSelector[] | null {
  return parseList(prelude);
}

/**
 * The selectors of a list as the author wrote them, one string each — what the prune keeps
 * when it drops some of a list and not the rest. `null` when the list cannot be split, and
 * then nothing is dropped from it.
 */
export function splitSelectorList(prelude: string): readonly string[] | null {
  try {
    return splitTopLevel(prelude);
  } catch {
    return null;
  }
}
