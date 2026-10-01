/**
 * The scope of the view (SDD-51 §3.4, §3.5): for every piece of JS the template evaluates,
 * which names it sees and which of them it may reassign.
 *
 * One answer for the three rules that need it. `view-expressions` asks it for the names a
 * `@for` header declares, `view-statements` for what an `@{ }` may write, `view-identifiers`
 * for what a free name resolves to — and three readings of «who declares this?» would be three
 * different answers to the same question.
 *
 * Everything is read off the Oxc AST the batch already holds, never off text: `obj.title`
 * names no `title`, and only the AST knows it.
 *
 * The template's own declarations follow the emit (decisions 17, 116): an `@{ }` is spliced
 * verbatim into the block that contains it, so what it declares is visible to what comes
 * AFTER it in that block and in the blocks nested inside — never to a sibling written before
 * it, and never outside the block. An element opens no block; an arm, a `case`, a loop body,
 * a `@section` and a `@snippet` do. A `@snippet` body starts from nothing but its parameters:
 * it is expanded somewhere else, and the scope it was written in is not the one it runs in.
 */

import type { Node } from '../types/index.js';
import type { RazorExpression } from '../at/index.js';
import type { Attribute } from '../html/index.js';
import type { ForNode, ForeachNode } from '../control/index.js';
import type { SnippetDeclNode } from '../snippet/index.js';
import { loopHeaderNames, patternNames, type OxcNode } from '../oxc/index.js';
import type { SemanticInput } from './model.js';
import { documentRoots, walk } from './walk.js';
import { VIEW_GLOBALS } from './view-globals.js';

/** What the template declares around a fragment: an immutable chain, innermost first. */
export interface TemplateScope {
  readonly names: ReadonlySet<string>;
  readonly parent?: TemplateScope;
}

/** How a fragment was registered in the batch, which is what its AST root looks like. */
export type FragmentShape = 'expression' | 'statements' | 'for-header' | 'for-of-header';

/** One piece of JS the view evaluates, with its AST and the template scope around it. */
export interface ViewFragment {
  readonly owner: Node;
  readonly shape: FragmentShape;
  /** An expression node, a `ForStatement`/`ForOfStatement`, or an `@{ }`'s statement list. */
  readonly root: OxcNode | readonly OxcNode[];
  readonly scope: TemplateScope;
}

/** Where a free name of the view comes from (§3.4), or which of those owns a write (§3.5). */
export type NameOrigin = 'template' | 'neutral-let' | 'code' | 'role' | 'global';

/** Every fragment of the view, and what the file around them declares. */
export interface ViewScope {
  readonly fragments: readonly ViewFragment[];
  /** Resolve a name the fragment does not declare itself. `undefined`: nobody provides it. */
  resolve(name: string, scope: TemplateScope): NameOrigin | undefined;
}

/** The documents `load()` feeds: a page, a route and a layout read its result as `data`. */
const DATA_ROLES: ReadonlySet<string> = new Set(['page-document', 'route-document', 'layout-document']);

/** The prefixes whose value is a deferred handler, and not the view's (decision 96). */
const EVENT_PREFIX = '@';
const BUS_PREFIX = 'bus:';

/**
 * The context of `@server`, and the one name the role does NOT put in the view. It only exists
 * as a parameter of `load(ctx)` / `layout(ctx, data)`, and a view reading it would be reading
 * whatever the emit happens to call by that name.
 */
const CONTEXT = 'ctx';

const EMPTY: TemplateScope = { names: new Set() };

/** The scope of the whole view of `input`. Never throws: a fragment with no AST is skipped. */
export function viewScope(input: SemanticInput): ViewScope {
  const code = codeNames(input);
  const role: ReadonlySet<string> = DATA_ROLES.has(input.document.type) ? new Set(['data']) : new Set();
  return {
    fragments: collectFragments(input),
    resolve(name, scope) {
      if (inTemplate(name, scope)) return 'template';
      // `$` is the emit's namespace (SDD-15 §4.7): `$dom`, `$shadow`, `$ioc` exist in the
      // render function and are nobody's to read from the view.
      if (name.startsWith('$') || name === CONTEXT) return undefined;
      if (code.neutralLets.has(name)) return 'neutral-let';
      if (code.all.has(name)) return 'code';
      if (role.has(name)) return 'role';
      if (VIEW_GLOBALS.has(name)) return 'global';
      return undefined;
    },
  };
}

function inTemplate(name: string, scope: TemplateScope | undefined): boolean {
  for (let at = scope; at !== undefined; at = at.parent) if (at.names.has(name)) return true;
  return false;
}

function extend(scope: TemplateScope, names: readonly string[]): TemplateScope {
  return names.length === 0 ? scope : { names: new Set(names), parent: scope };
}

/** Walk the template once, keeping the scope chain as the emit will build it. */
function collectFragments(input: SemanticInput): readonly ViewFragment[] {
  const out: ViewFragment[] = [];
  const stack: TemplateScope[] = [];
  let current = EMPTY;

  const ast = (owner: Node): OxcNode | readonly OxcNode[] | undefined => {
    const id = input.fragmentId(owner);
    return id === undefined ? undefined : input.js.ast(id);
  };
  const add = (owner: Node, shape: FragmentShape, scope: TemplateScope): void => {
    const root = ast(owner);
    // A fragment Oxc could not parse comes back as the empty list: FUD0170 already said why.
    if (root === undefined || (shape !== 'statements' && Array.isArray(root))) return;
    out.push({ owner, shape, root, scope });
  };
  const headerNames = (loop: ForeachNode | ForNode): readonly string[] =>
    loopHeaderNames(ast(loop), loop.type);

  walk(documentRoots(input.document), {
    interpolation(expr) {
      add(expr, 'expression', current);
    },
    binding(expr: RazorExpression, attr: Attribute) {
      if (isDeferred(expr, attr)) return;
      add(expr, 'expression', current);
    },
    inlineCode(node) {
      add(node, 'statements', current);
      const root = ast(node);
      if (Array.isArray(root)) current = extend(current, declaredNames(root as readonly OxcNode[]));
    },
    render(node) {
      // Only an argument that reads the scope, written `@name` or `@( … )` (decision 135). One
      // with no `@` is a literal, or `FUD0894` already — a second error on it would say less.
      for (const arg of node.args) {
        if (input.source[arg.value.start - 1] === '@') add(arg, 'expression', current);
      }
    },
    control(node) {
      switch (node.type) {
        case 'if':
          for (const branch of node.branches) add(branch, 'expression', current);
          return;
        case 'switch':
          add(node, 'expression', current);
          for (const branch of node.cases) add(branch, 'expression', current);
          return;
        case 'while':
          add(node, 'expression', current);
          if (node.key !== undefined) add(node.key, 'expression', current);
          return;
        default: {
          add(node, node.type === 'foreach' ? 'for-of-header' : 'for-header', current);
          // The key is evaluated in the scope of the body (decision 91): it sees the header.
          if (node.key !== undefined) add(node.key, 'expression', extend(current, headerNames(node)));
        }
      }
    },
    enterBlock(owner) {
      stack.push(current);
      if (owner.type === 'foreach' || owner.type === 'for') {
        current = extend(current, headerNames(owner as ForeachNode | ForNode));
      } else if (owner.type === 'snippet') {
        current = extend(EMPTY, snippetParams(ast(owner as SnippetDeclNode)));
      }
    },
    exitBlock() {
      current = stack.pop() ?? EMPTY;
    },
  });
  return out;
}

/** The value of an `@event` or `bus:` binding: invoked later, so outside this rule (§3.1). */
function isDeferred(expr: RazorExpression, attr: Attribute): boolean {
  // `bus:( … )` names its event with an expression, and that one IS a value of the view.
  if (typeof attr.name !== 'string') return attr.name !== expr;
  return attr.name.startsWith(EVENT_PREFIX) || attr.name.startsWith(BUS_PREFIX);
}

/** The names a `@snippet` declares: its parameters, read off the `function` Oxc built. */
function snippetParams(root: OxcNode | readonly OxcNode[] | undefined): readonly string[] {
  if (root === undefined || Array.isArray(root)) return [];
  const params = (root as OxcNode)['params'];
  return Array.isArray(params) ? params.flatMap((param: unknown) => patternNames(param)) : [];
}

/** The names a statement list declares at its own level — what an `@{ }` leaves in scope. */
export function declaredNames(statements: readonly OxcNode[]): readonly string[] {
  const out: string[] = [];
  for (const statement of statements) out.push(...statementNames(statement).names);
  return out;
}

/** What one top-level statement declares, and whether it is a `let` (§3.5). */
function statementNames(statement: OxcNode): { readonly names: readonly string[]; readonly let: boolean } {
  switch (statement.type) {
    case 'VariableDeclaration': {
      const declarations = statement['declarations'] as readonly OxcNode[];
      return {
        names: declarations.flatMap((declaration) => patternNames(declaration['id'])),
        let: statement['kind'] === 'let',
      };
    }
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
    case 'TSEnumDeclaration': {
      const id = statement['id'] as OxcNode | null | undefined;
      return { names: id ? [String(id['name'])] : [], let: false };
    }
    case 'ImportDeclaration': {
      const specifiers = statement['specifiers'] as readonly OxcNode[];
      return {
        names: specifiers.map((specifier) => String((specifier['local'] as OxcNode)['name'])),
        let: false,
      };
    }
    case 'ExportNamedDeclaration':
    case 'ExportDefaultDeclaration': {
      const declaration = statement['declaration'] as OxcNode | null | undefined;
      return declaration ? statementNames(declaration) : { names: [], let: false };
    }
    default:
      return { names: [], let: false };
  }
}

/** The top-level names of `@code`, every zone, and the `let`s of the neutral one. */
function codeNames(input: SemanticInput): {
  readonly all: ReadonlySet<string>;
  readonly neutralLets: ReadonlySet<string>;
} {
  const all = new Set<string>();
  const neutralLets = new Set<string>();
  for (const part of input.document.code?.parts ?? []) {
    const id = input.fragmentId(part);
    if (id === undefined) continue;
    const root = input.js.ast(id);
    if (!Array.isArray(root)) continue;
    for (const statement of root as readonly OxcNode[]) {
      const declared = statementNames(statement);
      for (const name of declared.names) {
        all.add(name);
        // The neutral zone is declared INSIDE the render function, so its `let`s are state of
        // the instance and the template may reseed them (§3.5): the cursor of a `@while`.
        if (declared.let && part.type === 'neutral-js') neutralLets.add(name);
      }
    }
  }
  return { all, neutralLets };
}
