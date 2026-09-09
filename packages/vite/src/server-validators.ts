/**
 * Erasing the body of a `serverValidator` from the CLIENT bundle (SDD-34 §4.7).
 *
 * `serverValidator(fn)` marks a rule that only runs with `{ server: true }` (SDD-33). That it
 * does not RUN in the browser is not enough: its body — a query, an import of the data layer —
 * would still be in the bundle, and the import graph hanging off it with it. A schema is one
 * `.ts` imported by both ends, so the only place this can be done is the build, and only in
 * the half that ships.
 *
 * **The ARGUMENT is replaced, never the call.** `serverValidator(async v => …)` becomes
 * `serverValidator(() => null)`, so the array of validators keeps its length, its order and
 * its behaviour in `$validate()`: a rule that is skipped on the client is skipped in the same
 * position it occupied. Deleting the call would renumber everything after it. And with the
 * original function left with no references, Rollup takes away what hung off it — the import
 * of `db` included, which is the whole point.
 *
 * **Recognised by the imported BINDING, never by the word.** A local function called
 * `serverValidator` is not this one, and a `serverValidator` imported under another name is:
 * `import { serverValidator as onlyOnTheServer } from '@fudic/forms'` is erased, and a
 * homonym declared in the file is left alone. That distinction cannot be made on text, which
 * is why this parses.
 */

import { JsBatch, type OxcNode } from '@fudic/compiler';

/** The module a real `serverValidator` comes from. */
const FORMS = '@fudic/forms';
const VALIDATOR = 'serverValidator';

/** What replaces the erased function: same shape, no body, no imports behind it. */
const EMPTY = '() => null';

/** One replacement, in source coordinates. */
interface Edit {
  readonly start: number;
  readonly end: number;
}

/**
 * The local names `serverValidator` was imported under, from `@fudic/forms`.
 *
 * A namespace import (`import * as forms`) is deliberately NOT followed: `forms.serverValidator(…)`
 * would need member resolution, and a schema is written with named imports. It is left whole
 * rather than half-erased.
 */
function importedNames(statements: readonly OxcNode[]): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of statements) {
    if (statement.type !== 'ImportDeclaration') continue;
    const source = statement['source'] as { value?: unknown } | undefined;
    if (source?.value !== FORMS) continue;
    for (const specifier of (statement['specifiers'] as OxcNode[] | undefined) ?? []) {
      if (specifier.type !== 'ImportSpecifier') continue;
      const imported = specifier['imported'] as { name?: unknown } | undefined;
      const local = specifier['local'] as { name?: unknown } | undefined;
      if (imported?.name === VALIDATOR && typeof local?.name === 'string') names.add(local.name);
    }
  }
  return names;
}

/** Every `<binding>(arg)` in the tree, as the span of its single argument. */
function collect(node: unknown, names: ReadonlySet<string>, out: Edit[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collect(child, names, out);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const current = node as OxcNode;
  if (current.type === 'CallExpression') {
    const callee = current['callee'] as OxcNode | undefined;
    const args = (current['arguments'] as OxcNode[] | undefined) ?? [];
    const only = args.length === 1 ? args[0] : undefined;
    // Exactly one argument: that is `serverValidator`'s signature, and a call with any other
    // shape is not the one this erases — the emit does not guess.
    if (callee?.type === 'Identifier' && names.has(String(callee['name'])) && only !== undefined) {
      out.push({ start: only.start, end: only.end });
    }
  }
  for (const value of Object.values(current)) collect(value, names, out);
}

/**
 * The module with every `serverValidator` argument replaced, or `null` when there is nothing
 * to do — which is every file in the project but the schemas.
 *
 * The cheap text check first: parsing every `.ts` of a build to find the two or three that
 * mention this would be a cost paid by projects that have no forms at all.
 */
export function eraseServerValidators(code: string): string | null {
  if (!code.includes(VALIDATOR) || !code.includes(FORMS)) return null;

  const batch = new JsBatch(code);
  const id = batch.add('module-statements', { start: 0, end: code.length });
  const parsed = batch.parse();
  // `module-statements` yields the statement list. A file that does not parse yields an empty
  // one and is left exactly as it is: this transform is not where a syntax error is reported,
  // and the bundler is about to report it anyway.
  const statements = parsed.value.ast(id) as OxcNode[];
  if (!Array.isArray(statements) || statements.length === 0) return null;

  const names = importedNames(statements);
  if (names.size === 0) return null;

  const edits: Edit[] = [];
  collect(statements, names, edits);
  if (edits.length === 0) return null;
  // Oxc offsets are BUFFER coordinates: mapped back before a single character is cut.
  const map = parsed.value.mapOffset;

  // Descending, so an earlier edit does not move a later one's offsets.
  const spans = edits.map((e) => ({ start: map(e.start), end: map(e.end) }));
  spans.sort((a, b) => b.start - a.start);
  return spans.reduce((out, span) => out.slice(0, span.start) + EMPTY + out.slice(span.end), code);
}
