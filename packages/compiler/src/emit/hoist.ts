/**
 * What an `@{ … }` declares, lifted to the closure that holds it (SDD-85, decided with Pedro on
 * 2026-11-16).
 *
 * The server writes the whole template into ONE function, so a name an `@{ }` declares is seen by
 * everything after it: the texts, the attributes, the headers and the bodies of the blocks. The
 * client does not: it writes the same statements into three bodies — `c`, `h` and `u` — and a
 * block is a function declared beside them, not inside them. A `let` in `c` was invisible to the
 * block that read it, and creating the component threw `x is not defined`.
 *
 * So on the client the declaration goes to the closure — `let x;` once, beside the blocks — and
 * each body keeps the statement where it is, as an assignment: it runs in the same place as on the
 * server, in the same order, every pass, and every function of the closure reads the same `x`.
 * Only the declarations at the top of the `@{ }`: one inside a nested block of the author's is the
 * author's scope, and stays where it is.
 */

import { patternNames, type OxcNode } from '../oxc/index.js';
import type { Span } from '../types/index.js';
import type { TemplateJs } from './oxc-code.js';

/** The statements of an `@{ }` as each body runs them, and the names they declare. */
export interface Hoisted {
  /** The statements, with every top-level declaration written as an assignment. */
  readonly js: string;
  /** The names those declarations bound, in source order: the closure declares them. */
  readonly names: readonly string[];
}

const isDeclaration = (node: OxcNode): boolean => node.type === 'VariableDeclaration';

/** Lift the top-level declarations of the `@{ }` whose statements are at `span`. */
export function hoistInlineCode(source: string, span: Span, template: TemplateJs): Hoisted {
  // The statement list of the region: what `TemplateJs` registers for a `block-statements` fragment.
  const statements = template.ast(span) as readonly OxcNode[];
  const slice = (node: OxcNode): string => source.slice(template.offset(node.start), template.offset(node.end));
  const names: string[] = [];
  let js = '';
  let at = span.start;
  for (const statement of statements.filter(isDeclaration)) {
    const from = template.offset(statement.start);
    js += source.slice(at, from);
    const parts = (statement['declarations'] as readonly OxcNode[]).map((declarator) => {
      const id = declarator['id'] as OxcNode;
      names.push(...patternNames(id));
      const init = declarator['init'] as OxcNode | null;
      return `${target(id, slice)} = ${init === null ? 'undefined' : slice(init)}`;
    });
    // A destructuring object on the left of `=` would open a block: in parentheses it does not.
    js += `${parts.map((part) => (part.startsWith('{') ? `(${part})` : part)).join(', ')};`;
    at = template.offset(statement.end);
  }
  js += source.slice(at, span.end);
  return { js, names };
}

/**
 * What a declarator binds, written as the target of an assignment: the name alone, or the
 * pattern without the type the author gave it — `x: number = 1` is no assignment.
 */
function target(id: OxcNode, slice: (node: OxcNode) => string): string {
  if (id.type === 'Identifier') return String(id['name']);
  const annotation = id['typeAnnotation'] as OxcNode | null | undefined;
  const text = slice(id);
  return annotation == null ? text : text.slice(0, annotation.start - id.start).trimEnd();
}
