/**
 * The scope of the view (SDD-51 §3.4, §3.5, §3.8): for every piece of JS the template
 * evaluates, which names it sees and which of them it may reassign.
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

/**
 * What the template declares around a fragment: an immutable chain, innermost first.
 *
 * Besides the names, three facts about them (§3.8): which ones an `@{ }` may reassign — a
 * `let` of an `@{ }`, never a loop header, a `const` or a snippet parameter — which ones an
 * `@{ }` declared, which a handler cannot see because it runs outside the pass, and which
 * neutral `let`s an earlier `@{ }` of this pass has already reseeded.
 */
export interface TemplateScope {
  readonly names: ReadonlySet<string>;
  readonly writable: ReadonlySet<string>;
  readonly inline: ReadonlySet<string>;
  readonly seeded: ReadonlySet<string>;
  readonly parent?: TemplateScope;
}

/**
 * How a fragment was registered in the batch, which is what its AST root looks like — and,
 * for an expression, which of the view's places it sits in: a `key`, the header of a `@while`,
 * the value of a handler and that of a `.prop` each add a rule of their own.
 */
export type FragmentShape =
  | 'expression'
  | 'statements'
  | 'for-header'
  | 'for-of-header'
  | 'key'
  | 'while'
  | 'handler'
  | 'prop';

/** One piece of JS the view evaluates, with its AST and the template scope around it. */
export interface ViewFragment {
  readonly owner: Node;
  readonly shape: FragmentShape;
  /** An expression node, a `ForStatement`/`ForOfStatement`, or an `@{ }`'s statement list. */
  readonly root: OxcNode | readonly OxcNode[];
  readonly scope: TemplateScope;
  /** For a `@while` header: every name an `@{ }` of its body writes, filled as the walk goes. */
  readonly bodyWrites?: ReadonlySet<string>;
}

/** Where a free name of the view comes from (§3.4), or which of those owns a write (§3.5). */
export type NameOrigin =
  | 'template'
  | 'template-fixed'
  | 'neutral-let'
  | 'code'
  | 'server'
  | 'client'
  | 'role'
  | 'global';

/** Every fragment of the view, and what the file around them declares. */
export interface ViewScope {
  readonly fragments: readonly ViewFragment[];
  /** Resolve a name the fragment does not declare itself. `undefined`: nobody provides it. */
  resolve(name: string, scope: TemplateScope): NameOrigin | undefined;
  /** Whether the template name `name` was declared by an `@{ }` (the nearest declaration). */
  inline(name: string, scope: TemplateScope): boolean;
  /** Whether an earlier `@{ }` of this pass has reassigned the neutral `let` `name` plainly. */
  seeded(name: string, scope: TemplateScope): boolean;
  /** Whether `name` is a function the file's `@code` declares. */
  isFunction(name: string): boolean;
  /** Whether `name` is a regex the file's `@code` declares: a literal or a `new RegExp`. */
  isRegex(name: string): boolean;
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

const NONE: ReadonlySet<string> = new Set();
/** The scope with no template around it: what `@code`, the role and the globals alone name. */
export const NO_TEMPLATE: TemplateScope = { names: NONE, writable: NONE, inline: NONE, seeded: NONE };
const EMPTY = NO_TEMPLATE;

/** The scope of the whole view of `input`. Never throws: a fragment with no AST is skipped. */
export function viewScope(input: SemanticInput): ViewScope {
  const code = codeNames(input);
  const role: ReadonlySet<string> = DATA_ROLES.has(input.document.type) ? new Set(['data']) : new Set();
  return {
    fragments: collectFragments(input),
    resolve(name, scope) {
      const own = declaring(name, scope);
      if (own !== undefined) return own.writable.has(name) ? 'template' : 'template-fixed';
      // `$` is the emit's namespace (SDD-15 §4.7): `$dom`, `$shadow`, `$ioc` exist in the
      // render function and are nobody's to read from the view.
      if (name.startsWith('$') || name === CONTEXT) return undefined;
      if (code.neutralLets.has(name)) return 'neutral-let';
      if (code.neutral.has(name)) return 'code';
      // `@server` never reaches the browser, and the plain names of `@client` never reach the
      // server (§3.8): read from the view, each is a `ReferenceError` on the other side. Which
      // layer says so is the caller's business.
      if (code.server.has(name)) return 'server';
      if (code.client.has(name)) return 'client';
      if (role.has(name)) return 'role';
      if (VIEW_GLOBALS.has(name)) return 'global';
      return undefined;
    },
    inline: (name, scope) => declaring(name, scope)?.inline.has(name) === true,
    seeded(name, scope) {
      for (let at: TemplateScope | undefined = scope; at !== undefined; at = at.parent) {
        if (at.seeded.has(name)) return true;
      }
      return false;
    },
    isFunction: (name) => code.functions.has(name),
    isRegex: (name) => code.regexes.has(name),
  };
}

/** The innermost scope of the chain that declares `name`. */
function declaring(name: string, scope: TemplateScope): TemplateScope | undefined {
  for (let at: TemplateScope | undefined = scope; at !== undefined; at = at.parent) {
    if (at.names.has(name)) return at;
  }
  return undefined;
}

/** What one body or one `@{ }` adds to the chain. */
interface Declared {
  readonly names: readonly string[];
  readonly writable?: readonly string[];
  readonly inline?: boolean;
  readonly seeded?: readonly string[];
}

function extend(scope: TemplateScope, declared: Declared): TemplateScope {
  const seeded = declared.seeded ?? [];
  if (declared.names.length === 0 && seeded.length === 0) return scope;
  return {
    names: new Set(declared.names),
    writable: new Set(declared.writable ?? []),
    inline: declared.inline === true ? new Set(declared.names) : NONE,
    seeded: new Set(seeded),
    parent: scope,
  };
}

/** Walk the template once, keeping the scope chain as the emit will build it. */
function collectFragments(input: SemanticInput): readonly ViewFragment[] {
  const out: ViewFragment[] = [];
  const stack: TemplateScope[] = [];
  let current = EMPTY;
  /** The bodies of the `@while`s the walk is inside, each collecting what its `@{ }`s write. */
  const whiles: Set<string>[] = [];
  /** Per open body: the `@while` it is the body of, or `undefined` for any other body. */
  const bodies: (Set<string> | undefined)[] = [];
  /** The `@while` whose header was just seen, and whose body is the next one entered. */
  let pending: Set<string> | undefined;

  const ast = (owner: Node): OxcNode | readonly OxcNode[] | undefined => {
    const id = input.fragmentId(owner);
    return id === undefined ? undefined : input.js.ast(id);
  };
  const add = (owner: Node, shape: FragmentShape, scope: TemplateScope, bodyWrites?: Set<string>): void => {
    const root = ast(owner);
    // A fragment Oxc could not parse comes back as the empty list: FUD0170 already said why.
    if (root === undefined || (shape !== 'statements' && Array.isArray(root))) return;
    out.push({ owner, shape, root, scope, ...(bodyWrites === undefined ? {} : { bodyWrites }) });
  };
  const headerNames = (loop: ForeachNode | ForNode): readonly string[] =>
    loopHeaderNames(ast(loop), loop.type);

  walk(documentRoots(input.document), {
    interpolation(expr) {
      add(expr, 'expression', current);
    },
    binding(expr: RazorExpression, attr: Attribute) {
      const prop = typeof attr.name === 'string' && attr.name.startsWith('.');
      add(expr, isDeferred(expr, attr) ? 'handler' : prop ? 'prop' : 'expression', current);
    },
    inlineCode(node) {
      add(node, 'statements', current);
      const root = ast(node);
      if (!Array.isArray(root)) return;
      const statements = root as readonly OxcNode[];
      for (const body of whiles) for (const name of writtenNames(statements)) body.add(name);
      current = extend(current, {
        names: declaredNames(statements),
        writable: declaredNames(statements, 'let'),
        inline: true,
        seeded: seededNames(statements),
      });
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
        case 'while': {
          const writes = new Set<string>();
          pending = writes;
          add(node, 'while', current, writes);
          if (node.key !== undefined) add(node.key, 'key', current);
          return;
        }
        default: {
          add(node, node.type === 'foreach' ? 'for-of-header' : 'for-header', current);
          // The key is evaluated in the scope of the body (decision 91): it sees the header.
          if (node.key !== undefined) add(node.key, 'key', extend(current, { names: headerNames(node) }));
        }
      }
    },
    enterBlock(owner) {
      stack.push(current);
      const own = owner.type === 'while' ? pending : undefined;
      if (own !== undefined) whiles.push(own);
      bodies.push(own);
      pending = undefined;
      if (owner.type === 'foreach' || owner.type === 'for') {
        current = extend(current, { names: headerNames(owner as ForeachNode | ForNode) });
      } else if (owner.type === 'snippet') {
        current = extend(EMPTY, { names: snippetParams(ast(owner as SnippetDeclNode)) });
      }
    },
    exitBlock() {
      current = stack.pop()!;
      if (bodies.pop() !== undefined) whiles.pop();
    },
  });
  return out;
}

/** The value of an `@event` or `bus:` binding: invoked later, by the handler rule (§3.8). */
function isDeferred(expr: RazorExpression, attr: Attribute): boolean {
  // `bus:( … )` names its event with an expression, and that one IS a value of the view.
  if (typeof attr.name !== 'string') return attr.name !== expr;
  return attr.name.startsWith(EVENT_PREFIX) || attr.name.startsWith(BUS_PREFIX);
}

/** The names a `@snippet` declares: its parameters, read off the `function` Oxc built. */
function snippetParams(root: OxcNode | readonly OxcNode[] | undefined): readonly string[] {
  if (root === undefined || Array.isArray(root)) return [];
  return ((root as OxcNode)['params'] as readonly unknown[]).flatMap((param) => patternNames(param));
}

/**
 * The names a statement list declares at its own level — what an `@{ }` leaves in scope. With
 * `'let'`, only the ones it may reassign later.
 */
export function declaredNames(statements: readonly OxcNode[], only?: 'let'): readonly string[] {
  const out: string[] = [];
  for (const statement of statements) {
    const declared = statementNames(statement);
    if (only === undefined || declared.let) out.push(...declared.names);
  }
  return out;
}

/**
 * The names a statement list reseeds at its own level: `cur = lista;`, a plain assignment
 * whose value does not read the name it writes. After it the pass owns the value, so an
 * `@{ cur = cur.next; }` further down advances a cursor instead of carrying the last pass's.
 */
function seededNames(statements: readonly OxcNode[]): readonly string[] {
  const out: string[] = [];
  for (const statement of statements) {
    if (statement.type !== 'ExpressionStatement') continue;
    const expr = statement['expression'] as OxcNode;
    if (expr.type !== 'AssignmentExpression' || expr['operator'] !== '=') continue;
    const left = expr['left'] as OxcNode;
    if (left.type !== 'Identifier') continue;
    const name = String(left['name']);
    if (!readsName(expr['right'], name)) out.push(name);
  }
  return out;
}

/** Every name a statement list assigns, at any depth: what a `@while` body can advance. */
function writtenNames(statements: readonly OxcNode[]): readonly string[] {
  const out: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const node = value as OxcNode;
    if (node.type === 'AssignmentExpression') out.push(...patternNames(node['left']));
    if (node.type === 'UpdateExpression') out.push(...patternNames(node['argument']));
    for (const key of Object.keys(node)) visit(node[key]);
  };
  visit(statements);
  return out;
}

/** Whether an expression reads `name` anywhere — by identifier, an approximation on purpose. */
export function readsName(node: unknown, name: string): boolean {
  if (Array.isArray(node)) return node.some((item) => readsName(item, name));
  if (typeof node !== 'object' || node === null) return false;
  const value = node as OxcNode;
  if (value.type === 'Identifier' && value['name'] === name) return true;
  return Object.keys(value).some((key) => readsName(value[key], name));
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

/** The top-level names of `@code`, by the zone that declares them (§3.4, §3.8). */
interface CodeNames {
  /** The neutral zone and the reactives of `@client`: what both sides of the view can read. */
  readonly neutral: ReadonlySet<string>;
  readonly neutralLets: ReadonlySet<string>;
  readonly server: ReadonlySet<string>;
  /** The plain names of `@client`: the server renders without them. */
  readonly client: ReadonlySet<string>;
  /** Every function `@code` declares, whatever its zone: printing one prints its source. */
  readonly functions: ReadonlySet<string>;
  /** Every regex `@code` declares: its `test` and `exec` carry `lastIndex` between passes. */
  readonly regexes: ReadonlySet<string>;
}

/** The callee names that make a `@client` binding a reactive the server renders inert. */
const REACTIVE: ReadonlySet<string> = new Set(['signal', 'computed']);

function codeNames(input: SemanticInput): CodeNames {
  const neutral = new Set<string>();
  const neutralLets = new Set<string>();
  const server = new Set<string>();
  const client = new Set<string>();
  const functions = new Set<string>();
  const regexes = new Set<string>();
  for (const part of input.document.code?.parts ?? []) {
    const id = input.fragmentId(part);
    if (id === undefined) continue;
    // A `module-statements` fragment is always a list (SDD-11 §3.2).
    for (const statement of input.js.ast(id) as readonly OxcNode[]) {
      const declared = statementNames(statement);
      const reactive = reactiveNames(statement);
      for (const name of functionNames(statement)) functions.add(name);
      for (const name of regexNames(statement)) regexes.add(name);
      for (const name of declared.names) {
        if (part.type === 'server-region') server.add(name);
        else if (part.type === 'client-region' && !reactive.has(name)) client.add(name);
        else neutral.add(name);
        // The neutral zone is declared INSIDE the render function, so its `let`s are state of
        // the instance and the template may reseed them (§3.5): the cursor of a `@while`.
        if (declared.let && part.type === 'neutral-js') neutralLets.add(name);
      }
    }
  }
  return { neutral, neutralLets, server, client, functions, regexes };
}

/** The names a declaration binds to a regex: `/x/g`, or `new RegExp(…)`. */
function regexNames(statement: OxcNode): readonly string[] {
  if (statement.type !== 'VariableDeclaration') return [];
  const out: string[] = [];
  for (const declaration of statement['declarations'] as readonly OxcNode[]) {
    const init = declaration['init'] as OxcNode | null;
    const id = declaration['id'] as OxcNode;
    if (!init || id.type !== 'Identifier') continue;
    const callee = init.type === 'NewExpression' ? (init['callee'] as OxcNode) : undefined;
    const literal = init.type === 'Literal' && init['regex'] != null;
    if (literal || (callee?.type === 'Identifier' && callee['name'] === 'RegExp')) out.push(String(id['name']));
  }
  return out;
}

/** The names a statement binds to a function: a declaration or a `const f = () => …`. */
function functionNames(statement: OxcNode): readonly string[] {
  const target =
    statement.type === 'ExportNamedDeclaration' ? (statement['declaration'] as OxcNode | null) : statement;
  if (!target) return [];
  if (target.type === 'FunctionDeclaration') return [String((target['id'] as OxcNode)['name'])];
  if (target.type !== 'VariableDeclaration') return [];
  const out: string[] = [];
  for (const declaration of target['declarations'] as readonly OxcNode[]) {
    const init = declaration['init'] as OxcNode | null;
    const id = declaration['id'] as OxcNode;
    if (init && id.type === 'Identifier' && FUNCTIONS.has(init.type)) out.push(String(id['name']));
  }
  return out;
}

const FUNCTIONS: ReadonlySet<string> = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

/** The names of `const x = signal(…)` / `computed(…)`: the server stubs them inert. */
function reactiveNames(statement: OxcNode): ReadonlySet<string> {
  const out = new Set<string>();
  if (statement.type !== 'VariableDeclaration') return out;
  for (const declaration of statement['declarations'] as readonly OxcNode[]) {
    const init = declaration['init'] as OxcNode | null;
    const callee = init?.type === 'CallExpression' ? (init['callee'] as OxcNode) : undefined;
    const id = declaration['id'] as OxcNode;
    if (callee?.type === 'Identifier' && REACTIVE.has(String(callee['name'])) && id.type === 'Identifier') {
      out.add(String(id['name']));
    }
  }
  return out;
}
