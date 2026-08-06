/**
 * HTML character references, on the strict subset (decision 38, decision 49 as BUG-14 §3.2
 * corrects it).
 *
 * The rule the whole module implements, in one line: **the data of a text node is text, not
 * markup.** `&lt;` in the source is a `<` in the data, and each output re-encodes it the way
 * its medium demands — the serializer escapes, the DOM does not need to. Pass-through was
 * coherent while the compiler only ever emitted text; it stopped being coherent the moment
 * the other half builds DOM, because `textContent` does not interpret entities and the same
 * template would paint `<html>` on the server and `&lt;html&gt;` after hydrating.
 *
 * The subset is the five XML named references plus the numeric forms, and it is not a
 * shortcut: a name outside it is a DIAGNOSTIC, which is a better answer than shipping the
 * ~2.200-entry HTML5 table into every compiler process to spell `&hellip;` — a character the
 * author can simply type.
 *
 * Two faces, one grammar, and that is the point of the module: the parser reports what it
 * cannot resolve (`unknownReferences`), the emit resolves what is left (`decodeEntities`).
 * Neither owns the regex alone, so neither can drift from the other.
 */

import { span, type Span } from '../types/index.js';

/** The five named references of XML — the whole named subset (decision 38). */
const NAMED: ReadonlyMap<string, string> = new Map([
  ['lt', '<'],
  ['gt', '>'],
  ['amp', '&'],
  ['quot', '"'],
  ['apos', "'"],
]);

/**
 * A WELL-FORMED reference: `&name;`, `&#123;`, `&#x7b;`. A bare `&` that opens none of these
 * is not a reference at all — `Fish & Chips` is text an author writes every day, and the one
 * thing this must never do is turn it into an error.
 */
const REFERENCE = /&(?:([a-zA-Z][a-zA-Z0-9]*)|#([0-9]+)|#[xX]([0-9a-fA-F]+));/gu;

/** The last code point Unicode defines. Past it there is no character to produce. */
const MAX_CODE_POINT = 0x10ffff;

/** Surrogate halves: they encode a character, they are not one. */
const SURROGATE_FIRST = 0xd800;
const SURROGATE_LAST = 0xdfff;

/** The character a well-formed reference denotes, or `null` when it denotes none. */
function resolve(name: string | undefined, decimal: string | undefined, hex: string | undefined): string | null {
  if (name !== undefined) return NAMED.get(name) ?? null;
  const code = decimal !== undefined ? Number.parseInt(decimal, 10) : Number.parseInt(hex!, 16);
  if (code > MAX_CODE_POINT) return null;
  if (code >= SURROGATE_FIRST && code <= SURROGATE_LAST) return null;
  return String.fromCodePoint(code);
}

/**
 * Decode every reference of the subset. Anything else — a bare `&`, a name outside the
 * subset, a code point that is not a character — is left EXACTLY as written: the parser has
 * already reported it, and mangling it on the way out would only hide what it said.
 */
export function decodeEntities(text: string): string {
  return text.replace(REFERENCE, (whole, name: string | undefined, dec: string | undefined, hex: string | undefined) =>
    resolve(name, dec, hex) ?? whole,
  );
}

/** A reference that is well-formed but denotes no character. */
export interface UnknownReference {
  /** Its span in the source, `base` being where `text` starts. */
  readonly span: Span;
  /** The reference verbatim, for the message. */
  readonly text: string;
}

/**
 * Every well-formed reference in `text` that the subset cannot resolve, located in the
 * source. `base` is the offset `text` starts at.
 */
export function unknownReferences(text: string, base: number): readonly UnknownReference[] {
  const found: UnknownReference[] = [];
  for (const match of text.matchAll(REFERENCE)) {
    const whole = match[0];
    if (resolve(match[1], match[2], match[3]) !== null) continue;
    const start = base + match.index;
    found.push({ span: span(start, start + whole.length), text: whole });
  }
  return found;
}
