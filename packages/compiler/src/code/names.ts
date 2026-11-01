/**
 * The names a `@code` block brings into the view (SDD-71 §8.2, 5): what it imports and what it
 * declares. It is what decides whether `@x | name`, with blanks around the bar, is a pipe — a
 * rule the author can read in their own file, with no types involved.
 *
 * A LEXICAL reading, not a parse: Oxc runs once per file, after the template is parsed. The
 * block's strings, templates, comments and regex come blanked out (`regions`), so a name inside
 * them is never taken. A name declared in a nested scope is taken too: the view then refers to
 * a name it cannot see, and the typed pass says so — it never turns silently into text.
 */

import type { CodeBlockNode } from './nodes.js';

const NAME = String.raw`[\p{ID_Start}$_][\p{ID_Continue}$]*`;
const IDENTIFIER = new RegExp(NAME, 'gu');
/** `const x`, `let x`, `var x`, `function x`, `function* x`, `class x`. */
const DECLARATION = new RegExp(String.raw`\b(?:const|let|var|class|function\s*\*?)\s+(${NAME})`, 'gu');
/** `const { a, b: c } =` and `const [a, b] =`: the pattern, up to its `=`. */
const PATTERN = /\b(?:const|let|var)\s*([{[][^=]*)=/gu;
/** `import a, { b as c, type d } from` and `import * as ns from`: the clause, up to `from`. */
const IMPORT = /\bimport(?=[\s{*])([^;]*?)\bfrom\b/gu;
/** Words of a clause or a pattern that are never a name it binds. */
const KEYWORDS: ReadonlySet<string> = new Set(['import', 'type', 'as', 'from', 'const', 'let', 'var']);

/**
 * The block's text with every lexical region blanked. The regions come in source order, and one
 * nested in a template's `${…}` is listed on its own too: the template already blanked it.
 */
function blanked(source: string, block: CodeBlockNode): string {
  let text = '';
  let at = block.span.start;
  for (const { span: region } of block.regions) {
    if (region.start < at) continue;
    text += source.slice(at, region.start) + ' '.repeat(region.end - region.start);
    at = region.end;
  }
  return text + source.slice(at, block.span.end);
}

/** Every name of `clause` but the keywords and those renamed by the `as` behind them. */
function namesOf(clause: string, skipKeys: boolean): string[] {
  const out: string[] = [];
  for (const match of clause.matchAll(IDENTIFIER)) {
    const after = clause.slice(match.index + match[0].length);
    if (KEYWORDS.has(match[0]) || /^\s+as\b/u.test(after)) continue;
    if (skipKeys && /^\s*:/u.test(after)) continue;
    out.push(match[0]);
  }
  return out;
}

/** The names `block` imports or declares, read from `source`. */
export function codeNames(source: string, block: CodeBlockNode): ReadonlySet<string> {
  const text = blanked(source, block);
  const names = new Set<string>();
  for (const match of text.matchAll(DECLARATION)) names.add(match[1]!);
  for (const match of text.matchAll(PATTERN)) for (const name of namesOf(match[1]!, true)) names.add(name);
  for (const match of text.matchAll(IMPORT)) for (const name of namesOf(match[1]!, false)) names.add(name);
  return names;
}
