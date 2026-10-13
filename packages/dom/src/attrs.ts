/**
 * The attributes a spread writes on a native element: `<input ...resto>`.
 *
 * ONE pure function decides what an object becomes, and every adapter calls it — the server
 * serializes what it returns, the browser applies it — so the two paint the same attributes.
 *
 * Only scalars cross. A string, a number or a bigint is written as its text, `true` as the
 * empty value of a boolean attribute, and `false`, `null` and `undefined` leave the attribute
 * out, as a lone `attr=@value` does. An object, a function or a symbol is not an attribute and
 * is skipped — except a `trustedUrl(…)` on a URL attribute, which is what that mark is for.
 *
 * What a spread may never write: a name that is not a plain attribute name, and an `on*`
 * handler, which would be markup running code the author never wrote in the view. A URL
 * attribute goes through the same guard `setUrl` applies.
 */

import { guardUrl, isTrustedUrl, safeUrl } from './url.js';

/**
 * The attributes a browser navigates to or loads from. The same list the compiler guards an
 * interpolated `href="@url"` with (`isUrlAttr` in `@fudic/compiler`): the two must agree, or a
 * value would be guarded written one way and not the other.
 */
const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'poster',
  'cite',
  'xlink:href',
  'srcset',
  'imagesrcset',
  'ping',
]);

function isUrlAttribute(tag: string, name: string): boolean {
  const attribute = name.toLowerCase();
  return URL_ATTRIBUTES.has(attribute) || (attribute === 'data' && tag.toLowerCase() === 'object');
}

/** A name `setAttribute` takes on every engine, and that no parser reads as anything else. */
const NAME = /^[A-Za-z_][\w.:-]*$/u;

/** What turns an unsafe URL into the inert one: with the dev warning, or silently. */
type Guard = (tag: string, name: string, value: unknown) => string;

/** The text an attribute is written with, or `undefined` when the value writes none. */
function textOf(tag: string, name: string, value: unknown, guard: Guard): string | undefined {
  if (value === true) return '';
  const url = isUrlAttribute(tag, name);
  if (url && isTrustedUrl(value)) return guard(tag, name, value);
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return undefined;
  return url ? guard(tag, name, value) : String(value);
}

function read(tag: string, objects: readonly unknown[], except: readonly string[], guard: Guard): Map<string, string> {
  const skip = new Set(except.map((name) => name.toLowerCase()));
  const out = new Map<string, string>();
  for (const object of objects) {
    if (typeof object !== 'object' || object === null) continue;
    for (const [name, value] of Object.entries(object)) {
      if (!NAME.test(name) || /^on/iu.test(name) || skip.has(name.toLowerCase())) continue;
      const text = textOf(tag, name, value, guard);
      // Two spreads on one element: the later one wins a key it WRITES, as two props spreads do.
      if (text !== undefined) out.set(name, text);
    }
  }
  return out;
}

/**
 * The attributes `objects` write on a `<tag>`, in order: every key of each object, the later
 * object winning a key both write, minus the names in `except` — the attributes the element
 * writes explicitly, which win wherever the spread sits.
 */
export function attrsOf(tag: string, objects: readonly unknown[], except: readonly string[]): ReadonlyMap<string, string> {
  return read(tag, objects, except, guardUrl);
}

/** What one spread write changes: the attributes to set, and the ones to take off. */
export interface AttrsDiff {
  readonly set: readonly (readonly [name: string, value: string])[];
  readonly remove: readonly string[];
}

/**
 * From what the spread wrote last (`prev`, `undefined` the first time) to what it writes now:
 * only the attributes whose text changed are set, and the ones that are gone are removed. The
 * previous objects are read again rather than the element, so an attribute the element got
 * some other way is never taken for the spread's.
 */
export function attrsDiff(
  tag: string,
  next: readonly unknown[],
  prev: readonly unknown[] | undefined,
  except: readonly string[],
): AttrsDiff {
  const now = attrsOf(tag, next, except);
  // `safeUrl` and not the guard: the previous values already warned when they were written.
  const before = prev === undefined ? new Map<string, string>() : read(tag, prev, except, safeUrl);
  return {
    set: [...now].filter(([name, text]) => before.get(name) !== text),
    remove: [...before.keys()].filter((name) => !now.has(name)),
  };
}
