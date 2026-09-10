/**
 * The names a `delegate:` may write (SDD-37 §6.19).
 *
 * The twin of `styleClassNames`, and the same case one door over: a finite, local, ALREADY
 * PARSED list, answered by the server and never by TypeScript. There the names live in the
 * `<style>` of the file; here in the header of the loop the attribute is written in — which
 * the batch parsed once, for the scope of every expression around it.
 *
 * Offering IS validating here, which is where the two part company: a name outside this list
 * is `FUD0662`, so the completion is not a convenience but the way the error stops being
 * written at all.
 */

import type { CachedDocument } from '../document-cache.js';
import { loopBindingNames } from './template-scope.js';

/**
 * The bindings of every loop whose body contains `offset`, innermost last.
 *
 * Every enclosing loop and not only the innermost, because a marker may name any of them
 * (decision 119): `<b delegate:row delegate:tag>` inside two `@foreach` is one element handing
 * over two identities. Source order puts the outer names first, which is the order they are
 * declared in.
 *
 * `headerEnd` is what keeps a name from being offered where it does not exist yet: inside
 * `(const x of xs)` the `x` is being declared, and an attribute cannot be written there at all.
 */
export function delegateNames(document: CachedDocument, offset: number): readonly string[] {
  const names = new Set<string>();
  for (const loop of document.js.loops) {
    if (offset < loop.headerEnd || offset > loop.span.end) continue;
    for (const name of loopBindingNames(loop.statement)) names.add(name);
  }
  return [...names];
}
