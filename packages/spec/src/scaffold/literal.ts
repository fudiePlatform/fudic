/**
 * A value as TypeScript source a fixture can hold (SDD-82 §3.9): what `record` writes of what the
 * real server answered. Plain data is written as it is; the markers of a fixture — a failure, a
 * redirect, a file, a `later` — as the helper call that makes them, so the file reads as if it
 * had been written by hand. What has no literal (a function, a class instance, a cycle) is not
 * written: the answer says where it was and what it is (`FUD1515`).
 */

import { keyOf, quote } from './shape.js';

/** The helpers of `@fudic/spec` a literal may call. */
export type Helper = 'fails' | 'file' | 'later' | 'redirects';

export interface Literal {
  readonly source: string;
  /** The helpers it calls: what the fixture has to import. */
  readonly helpers: ReadonlySet<Helper>;
}

/** Why a value has no literal: where it is (`data.ana.users.0.created`) and what it is (`a Date`). */
export interface Unwritable {
  readonly at: string;
  readonly found: string;
}

/** A line that grows longer than this breaks its object or array, one entry per line. */
const WIDTH = 100;

/** Whether `literalOf` answered a literal. */
export const isLiteral = (written: Literal | Unwritable): written is Literal => 'source' in written;

/**
 * `value` as source, indented as if it started on a line indented by `indent`; or why it cannot
 * be written. `at` names the value for the answer: each step down adds `.<key>`.
 */
export function literalOf(value: unknown, at: string, indent = ''): Literal | Unwritable {
  const helpers = new Set<Helper>();
  try {
    return { source: new Printer(helpers).print(value, at, indent, new Set()), helpers };
  } catch (error) {
    return (error as Thrown).unwritable;
  }
}

/** What a value with no literal throws, up to `literalOf`. */
class Thrown {
  constructor(readonly unwritable: Unwritable) {}
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** A plain object: one whose prototype is `Object.prototype` or none. */
function isPlain(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** What a value with no literal is, for the answer. */
function describe(value: unknown): string {
  if (typeof value === 'function') return 'a function';
  if (typeof value === 'symbol') return 'a symbol';
  const name = (Object.getPrototypeOf(value) as { constructor?: { name?: string } }).constructor?.name;
  return name === undefined || name === '' ? 'a class instance' : `a ${name}`;
}

class Printer {
  constructor(private readonly helpers: Set<Helper>) {}

  print(value: unknown, at: string, indent: string, seen: Set<object>): string {
    switch (typeof value) {
      case 'undefined':
        return 'undefined';
      case 'boolean':
        return String(value);
      case 'number':
        return Object.is(value, -0) ? '-0' : String(value);
      case 'bigint':
        return `${value}n`;
      case 'string':
        return quote(value);
      case 'object':
        if (value === null) return 'null';
        break;
      default:
        throw new Thrown({ at, found: describe(value) });
    }
    if (seen.has(value)) throw new Thrown({ at, found: 'a cycle' });
    const inner = new Set(seen).add(value);
    if (Array.isArray(value)) {
      const items = Array.from(value, (item, i) => this.print(item, `${at}.${i}`, `${indent}  `, inner));
      return this.join('[', items, ']', indent);
    }
    if (!isPlain(value)) throw new Thrown({ at, found: describe(value) });
    const marker = this.marker(value as Record<string, unknown>, at, indent, inner);
    if (marker !== undefined) return marker;
    const entries = Object.entries(value).map(([key, item]) => `${keyOf(key)}: ${this.print(item, `${at}.${key}`, `${indent}  `, inner)}`);
    return this.join('{', entries, '}', indent, ' ');
  }

  /** A marker of a fixture as the helper call that makes it; undefined for plain data. */
  private marker(value: Record<string, unknown>, at: string, indent: string, seen: Set<object>): string | undefined {
    const fails = value['$fails'];
    if (isObject(fails)) {
      this.helpers.add('fails');
      return typeof fails['code'] === 'string' ? `fails(${quote(fails['code'])})` : `fails(${String(fails['status'])}, ${quote(String(fails['title']))})`;
    }
    if (typeof value['$redirects'] === 'string') {
      this.helpers.add('redirects');
      const status = value['status'] === 303 || value['status'] === undefined ? '' : `, ${String(value['status'])}`;
      return `redirects(${quote(value['$redirects'])}${status})`;
    }
    if (typeof value['$file'] === 'string') {
      this.helpers.add('file');
      const options = (['type', 'name'] as const).filter((key) => typeof value[key] === 'string').map((key) => `${key}: ${quote(value[key] as string)}`);
      return `file(${quote(value['$file'])}${options.length === 0 ? '' : `, { ${options.join(', ')} }`})`;
    }
    const later = value['$later'];
    if (later === undefined) return undefined;
    this.helpers.add('later');
    if (later === 'never') return 'later.never()';
    const failed = value['fails'];
    if (isObject(failed)) return `later.fails(${String(later)}, ${String(failed['status'])}, ${quote(String(failed['title']))})`;
    return `later(${String(later)}, ${this.print(value['value'], `${at}.value`, indent, seen)})`;
  }

  /** Items between brackets: on one line while it fits, else one per line. */
  private join(open: string, items: readonly string[], close: string, indent: string, pad = ''): string {
    if (items.length === 0) return `${open}${close}`;
    const line = `${open}${pad}${items.join(', ')}${pad}${close}`;
    if (indent.length + line.length <= WIDTH && !line.includes('\n')) return line;
    return `${open}\n${items.map((item) => `${indent}  ${item},\n`).join('')}${indent}${close}`;
  }
}
