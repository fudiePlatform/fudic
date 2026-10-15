/**
 * `$message` — the runtime piece of a message that needs a choice only the value can make:
 * a plural or a select (SDD-58 §4.3). A message without one is compiled to a literal or a
 * template literal and never reaches here.
 *
 * Tags render as their content: a message with tags belongs to the view, where the emit
 * builds the elements itself; here only the text of a branch is wanted.
 */

import type { CompiledMessage, MessageArg } from '../compiled.js';

const pluralRules = new Map<string, Intl.PluralRules>();
const numbers = new Map<string, Intl.NumberFormat>();

/** Renders a compiled ICU message that needs a runtime choice: plural or select. */
export function $message(parts: CompiledMessage, args: Readonly<Record<string, MessageArg>>, locale: string): string {
  let out = '';
  for (const part of parts) {
    if (typeof part === 'string') {
      out += part;
    } else if ('hole' in part) {
      out += String(args[part.hole] ?? '');
    } else if ('pound' in part) {
      out += cached(numbers, locale, () => new Intl.NumberFormat(locale)).format(Number(args[part.pound] ?? 0));
    } else if ('tag' in part) {
      out += $message(part.children ?? [], args, locale);
    } else if ('plural' in part) {
      out += $message(pluralCase(part.cases, part.other, args[part.plural] ?? 0, locale), args, locale);
    } else {
      const value = String(args[part.select] ?? '');
      out += $message(Object.hasOwn(part.cases, value) ? part.cases[value]! : part.other, args, locale);
    }
  }
  return out;
}

/** `=N` first, then the CLDR category of the value in `locale`, then `other`. */
function pluralCase(
  cases: Readonly<Record<string, CompiledMessage>>,
  other: CompiledMessage,
  value: MessageArg,
  locale: string,
): CompiledMessage {
  const n = Number(value);
  const exact = `=${n}`;
  if (Object.hasOwn(cases, exact)) return cases[exact]!;
  const category = cached(pluralRules, locale, () => new Intl.PluralRules(locale)).select(n);
  return Object.hasOwn(cases, category) ? cases[category]! : other;
}

function cached<T>(map: Map<string, T>, locale: string, make: () => T): T {
  let value = map.get(locale);
  if (value === undefined) {
    value = make();
    map.set(locale, value);
  }
  return value;
}
