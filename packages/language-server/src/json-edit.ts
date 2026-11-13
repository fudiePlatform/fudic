/**
 * The edits the light bulb makes to a `fudic.json` (SDD-83 §3.11): add an entry to `diagnostics`,
 * an id to `allow`, change a level, take an entry out — each as one replacement of the text as it
 * is written, so the author's layout survives everything the bulb did not touch.
 *
 * It reads JSON with the span of every value and every key. A text that is not JSON gets no tree
 * and therefore no edit: the reader already reports it, and a bulb over a broken file guesses.
 */

import type { Span } from '@fudic/diagnostics';

export type JsonNode = JsonObject | JsonArray | JsonScalar;

export interface JsonObject {
  readonly kind: 'object';
  readonly span: Span;
  readonly members: readonly JsonMember[];
}

export interface JsonArray {
  readonly kind: 'array';
  readonly span: Span;
  readonly items: readonly JsonNode[];
}

export interface JsonScalar {
  readonly kind: 'scalar';
  readonly span: Span;
  readonly value: string | number | boolean | null;
}

export interface JsonMember {
  readonly key: string;
  readonly keySpan: Span;
  readonly value: JsonNode;
}

/** One replacement of the text. Empty span = insert. */
export interface TextEdit {
  readonly span: Span;
  readonly newText: string;
}

/** The tree of `text`, or `undefined` when it is not JSON. */
export function parseJson(text: string): JsonNode | undefined {
  const reader = new Reader(text);
  const value = reader.value();
  return value !== undefined && reader.atEnd() ? value : undefined;
}

class Reader {
  #at = 0;

  constructor(private readonly text: string) {}

  atEnd(): boolean {
    this.#blank();
    return this.#at === this.text.length;
  }

  value(): JsonNode | undefined {
    this.#blank();
    const start = this.#at;
    const char = this.text[start];
    if (char === '{') return this.#object(start);
    if (char === '[') return this.#array(start);
    if (char === '"') {
      const value = this.#string();
      return value === undefined ? undefined : { kind: 'scalar', span: { start, end: this.#at }, value };
    }
    const literal = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/u.exec(this.text.slice(start));
    if (literal === null) return undefined;
    this.#at += literal[0].length;
    return { kind: 'scalar', span: { start, end: this.#at }, value: JSON.parse(literal[0]) as JsonScalar['value'] };
  }

  #object(start: number): JsonObject | undefined {
    this.#at++;
    const members: JsonMember[] = [];
    if (this.#peek() === '}') return { kind: 'object', span: { start, end: ++this.#at }, members };
    for (;;) {
      this.#blank();
      const keyStart = this.#at;
      const key = this.text[keyStart] === '"' ? this.#string() : undefined;
      if (key === undefined) return undefined;
      const keySpan = { start: keyStart, end: this.#at };
      if (this.#peek() !== ':') return undefined;
      this.#at++;
      const value = this.value();
      if (value === undefined) return undefined;
      members.push({ key, keySpan, value });
      const next = this.#peek();
      this.#at++;
      if (next === '}') return { kind: 'object', span: { start, end: this.#at }, members };
      if (next !== ',') return undefined;
    }
  }

  #array(start: number): JsonArray | undefined {
    this.#at++;
    const items: JsonNode[] = [];
    if (this.#peek() === ']') return { kind: 'array', span: { start, end: ++this.#at }, items };
    for (;;) {
      const value = this.value();
      if (value === undefined) return undefined;
      items.push(value);
      const next = this.#peek();
      this.#at++;
      if (next === ']') return { kind: 'array', span: { start, end: this.#at }, items };
      if (next !== ',') return undefined;
    }
  }

  /** A string starting at the cursor, unescaped; the cursor ends past its closing quote. */
  #string(): string | undefined {
    const found = /^"(?:[^"\\\n]|\\.)*"/u.exec(this.text.slice(this.#at));
    if (found === null) return undefined;
    this.#at += found[0].length;
    return JSON.parse(found[0]) as string;
  }

  /** The next character that is not blank, with the cursor on it. */
  #peek(): string | undefined {
    this.#blank();
    return this.text[this.#at];
  }

  #blank(): void {
    while (this.#at < this.text.length && /\s/u.test(this.text[this.#at]!)) this.#at++;
  }
}

/** The member `key` of `node`, when `node` is an object that has it. */
export function memberOf(node: JsonNode | undefined, key: string): JsonMember | undefined {
  return node?.kind === 'object' ? node.members.find((member) => member.key === key) : undefined;
}

/**
 * `"key": valueText` added at the end of `object`: on a line of its own, indented like the members
 * before it, when the object is written over several lines; inline when it is written on one.
 */
export function insertMember(text: string, object: JsonObject, key: string, valueText: string): TextEdit {
  const entry = `${JSON.stringify(key)}: ${valueText}`;
  const last = object.members[object.members.length - 1];
  const close = object.span.end - 1;
  const multiline = text.slice(object.span.start, object.span.end).includes('\n');
  if (last === undefined) {
    if (!multiline) return { span: { start: object.span.start + 1, end: close }, newText: ` ${entry} ` };
    const indent = indentOf(text, object.span.start);
    return { span: { start: object.span.start + 1, end: close }, newText: `\n${indent}${unitOf(text)}${entry}\n${indent}` };
  }
  const separator = multiline ? `,\n${indentOf(text, last.keySpan.start)}` : ', ';
  return { span: { start: last.value.span.end, end: last.value.span.end }, newText: `${separator}${entry}` };
}

/** `itemText` added at the end of `array`, after its last item. */
export function appendItem(array: JsonArray, itemText: string): TextEdit {
  const last = array.items[array.items.length - 1];
  if (last === undefined) return { span: { start: array.span.start + 1, end: array.span.end - 1 }, newText: itemText };
  return { span: { start: last.span.end, end: last.span.end }, newText: `, ${itemText}` };
}

/**
 * One member or item of a container taken out, with the comma that tied it to its neighbours and the
 * blank before the next one: what is left reads as if it had never been written.
 */
export function removeEntry(container: JsonObject | JsonArray, index: number): TextEdit {
  const spans = container.kind === 'object'
    ? container.members.map((member) => ({ start: member.keySpan.start, end: member.value.span.end }))
    : container.items.map((item) => item.span);
  const own = spans[index]!;
  const next = spans[index + 1];
  if (next !== undefined) return { span: { start: own.start, end: next.start }, newText: '' };
  const previous = spans[index - 1];
  if (previous !== undefined) return { span: { start: previous.end, end: own.end }, newText: '' };
  return { span: { start: container.span.start + 1, end: container.span.end - 1 }, newText: '' };
}

/** The blanks that open the line `offset` is on. */
function indentOf(text: string, offset: number): string {
  const line = text.lastIndexOf('\n', offset - 1) + 1;
  return /^[ \t]*/u.exec(text.slice(line))![0];
}

/** One step of the file's indentation: that of its first indented line, two spaces when none is. */
function unitOf(text: string): string {
  return /\n([ \t]+)\S/u.exec(text)?.[1] ?? '  ';
}
