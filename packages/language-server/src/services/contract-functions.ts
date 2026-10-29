/**
 * The two positions whose answer is a server function (BUG-59): the first argument of a
 * `task(` and the value of a `form:=`. The list there is the functions of the `.fudapi` the
 * file links and nothing else. TypeScript offers every name in scope — `salir`, `satisfies`,
 * `SharedArrayBuffer`, the `SaveFails` types of each contract — because `task` takes any
 * callable; the view offers its whole scope. The one the developer is reaching for is declared
 * in the contract.
 *
 * The list is built here and not filtered out of TypeScript's: `(` is not one of TypeScript's
 * trigger characters, so typing `task(` never asks it, and at `form:=` it is not the one that
 * answers.
 */

import { parseApi } from '@fudic/api';
import { attributeValueSpan } from '@fudic/compiler';
import type { Span } from '@fudic/diagnostics';
import { attributeOf, resolveFrom, serverLinksOf } from '@fudic/typecheck';
import type { CachedDocument } from '../document-cache.js';
import type { ApiFiles } from './href.js';

/** `task(` and the name being written, right before the caret. */
const TASK_ARGUMENT = /\btask\(\s*([\w$]*)$/u;
/** `form:=`, quoted or not, and the `@name` being written. */
const FORM_SEND = /\bform:="?(@?[\w$]*)$/u;
/** Far enough back to see either, without reading the file per keystroke. */
const LOOK_BACK = 120;

export interface ContractFunctions {
  /** The functions the linked contracts declare. */
  readonly names: ReadonlySet<string>;
  /** What is written in front of a name: `@` in a binding of the view, nothing in `@code`. */
  readonly prefix: '' | '@';
  /** What an item replaces: the part of the name already written. */
  readonly span: Span;
}

/**
 * The functions at a position that takes one. `undefined` anywhere else, and where the file
 * links no function: then the position is whoever answered it before, and an empty list would
 * be a wrong answer.
 */
export function contractFunctionsAt(cached: CachedDocument, offset: number, apis: ApiFiles): ContractFunctions | undefined {
  const before = cached.source.slice(Math.max(0, offset - LOOK_BACK), offset);
  const task = TASK_ARGUMENT.exec(before);
  const form = task === null ? FORM_SEND.exec(before) : null;
  const written = task?.[1] ?? form?.[1];
  if (written === undefined) return undefined;

  const names = new Set<string>();
  for (const link of serverLinksOf(cached.document)) {
    const attribute = attributeOf(link, 'href');
    const value = attribute === undefined ? undefined : attributeValueSpan(cached.source, attribute);
    if (value === undefined) continue;
    const text = apis.read(resolveFrom(cached.path, cached.source.slice(value.start, value.end)));
    for (const declaration of parseApi(text ?? '').value.declarations) {
      if (declaration.kind === 'fn') names.add(declaration.name.text);
    }
  }
  if (names.size === 0) return undefined;
  return { names, prefix: task === null ? '@' : '', span: { start: offset - written.length, end: offset } };
}
