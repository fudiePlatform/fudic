/**
 * What a loop's element can be keyed by, asked of the projection's TypeScript.
 *
 * A key is a `string` or a `number`: the element itself when it is one, its `id` when that is
 * one, and nothing otherwise — choosing a key for anything else is a design decision, and a bulb
 * that guesses it trades `FUD0540` for a type error.
 */

import type * as ts from 'typescript';
import type { CachedDocument } from '../document-cache.js';
import { nodeAt, projectedOffset } from './forms.js';

/** `self`: key by the element; `id`: key by its `id`. */
export type LoopKey = 'self' | 'id';

/** The key the binding at this `.fud` offset offers, or nothing when no type says so. */
export function loopKeyAt(
  languageService: ts.LanguageService | undefined,
  cached: CachedDocument,
  at: number,
): LoopKey | undefined {
  const program = languageService?.getProgram();
  const source = program?.getSourceFile(cached.path);
  const offset = projectedOffset(cached, at);
  if (program === undefined || source === undefined || offset === undefined) return undefined;

  const checker = program.getTypeChecker();
  const node = nodeAt(source, offset);
  const type = checker.getTypeAtLocation(node);
  if (keyable(checker, type)) return 'self';

  const id = type.getProperty('id');
  return id !== undefined && keyable(checker, checker.getTypeOfSymbolAtLocation(id, node)) ? 'id' : undefined;
}

/** Whether every value of a type is a string, or every one a number: what a key ports as. */
function keyable(checker: ts.TypeChecker, type: ts.Type): boolean {
  return primitiveOf(checker, type) !== undefined;
}

/**
 * The one primitive every value of a type is. By the name each primitive prints as, for the
 * reason `tag-card.ts` gives: TypeScript is a type here, never a runtime value. A union has to be
 * unanimous: `'a' | 'b'` is a string, but `string | number` and an optional `string | undefined`
 * are neither.
 */
function primitiveOf(checker: ts.TypeChecker, type: ts.Type): 'string' | 'number' | undefined {
  if (type.isUnion()) {
    const kinds = new Set(type.types.map((member) => primitiveOf(checker, member)));
    return kinds.size === 1 ? [...kinds][0] : undefined;
  }
  if (type.isStringLiteral()) return 'string';
  if (type.isNumberLiteral()) return 'number';
  const name = checker.typeToString(type);
  return name === 'string' || name === 'number' ? name : undefined;
}
