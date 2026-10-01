/**
 * What the JS of the view may DO (SDD-51 §3.2–§3.5): one walk over the Oxc AST of every
 * fragment, by WHITE list.
 *
 * Each node is matched against the forms the spec enumerates; a form that is not there is an
 * error, so whatever Oxc learns to parse tomorrow is refused by default. A forbidden node is
 * reported once and NOT descended into — `@(async () => await x)` is one finding, not two —
 * while its siblings still are, so a file with three faults shows the three (§4.3).
 *
 * The three analyzers share this walk and split its findings by `rule`, because they are three
 * readings of one traversal: what an expression may be, what an `@{ }` may hold, and what a
 * free name may resolve to. Walking three times would be three chances to disagree about
 * where a scope opens. The findings are memoized per input, so the walk runs once per pass.
 *
 * Never throws: an AST of an unexpected shape is a node not on the list, not an exception.
 */

import {
  FUD0900,
  FUD0901,
  FUD0902,
  FUD0903,
  FUD0904,
  FUD0905,
  FUD0906,
  FUD0907,
  FUD0908,
} from '@fudic/diagnostics';
import { walkPattern, type OxcNode } from '../oxc/index.js';
import type { Diagnostic, Span } from '../types/index.js';
import type { SemanticInput } from './model.js';
import { viewScope, type TemplateScope, type ViewFragment, type ViewScope } from './view-scope.js';

/** Which analyzer reports a finding: the expression list, the `@{ }` list, or free names. */
export type ViewRule = 'expression' | 'statement' | 'identifier';

export interface ViewFinding {
  readonly rule: ViewRule;
  readonly diagnostic: Diagnostic;
}

const memo = new WeakMap<SemanticInput, readonly ViewFinding[]>();

/** Every finding of the view of `input`, computed once per input. */
export function viewFindings(input: SemanticInput): readonly ViewFinding[] {
  let findings = memo.get(input);
  if (findings === undefined) {
    const view = viewScope(input);
    const out: ViewFinding[] = [];
    for (const fragment of view.fragments) new FragmentCheck(input, view, fragment, out).run();
    findings = out;
    memo.set(input, findings);
  }
  return findings;
}

// ── Typed access over the untyped Oxc node ──
function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as OxcNode).type === 'string';
}
const field = (node: OxcNode, key: string): unknown => node[key];
const child = (node: OxcNode, key: string): OxcNode | undefined => {
  const value = node[key];
  return isNode(value) ? value : undefined;
};
const children = (node: OxcNode, key: string): readonly unknown[] => {
  const value = node[key];
  return Array.isArray(value) ? (value as readonly unknown[]) : [];
};
const nameOf = (node: OxcNode): string => String(node['name']);

/**
 * The wrappers TypeScript erases and the parentheses `preserveParens` keeps: none of them
 * changes what the expression inside does, so the walk sees through them.
 */
const TRANSPARENT: ReadonlySet<string> = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
]);

function unwrap(node: OxcNode): OxcNode {
  let current = node;
  for (let inner = child(current, 'expression'); TRANSPARENT.has(current.type) && inner; ) {
    current = inner;
    inner = child(current, 'expression');
  }
  return current;
}

/** The checks over one fragment. Lives as long as the fragment's walk. */
class FragmentCheck {
  readonly #input: SemanticInput;
  readonly #view: ViewScope;
  readonly #fragment: ViewFragment;
  readonly #template: TemplateScope;
  readonly #out: ViewFinding[];
  /** What the fragment declares itself: arrow parameters, `@{ }` bindings, `for` heads. */
  readonly #frames: Set<string>[] = [];
  /** Loops and switches of the fragment's own, for `break` / `continue` (§3.3). */
  #loops = 0;
  #switches = 0;

  constructor(input: SemanticInput, view: ViewScope, fragment: ViewFragment, out: ViewFinding[]) {
    this.#input = input;
    this.#view = view;
    this.#fragment = fragment;
    this.#template = fragment.scope;
    this.#out = out;
  }

  run(): void {
    const { root, shape } = this.#fragment;
    this.#frames.push(new Set());
    if (shape === 'statements') {
      for (const statement of root as readonly OxcNode[]) this.#statement(statement);
    } else if (shape === 'expression') {
      this.#expression(root as OxcNode);
    } else {
      this.#header(root as OxcNode);
    }
    this.#frames.pop();
  }

  // ── Reporting ──

  #span(node: OxcNode): { readonly span: Span } {
    return { span: this.#input.js.mapSpan(node.start, node.end) };
  }

  #report(rule: ViewRule, diagnostic: Diagnostic): void {
    this.#out.push({ rule, diagnostic });
  }

  // ── Names ──

  #declare(name: string): void {
    this.#frames[this.#frames.length - 1]!.add(name);
  }

  #local(name: string): boolean {
    return this.#frames.some((frame) => frame.has(name));
  }

  #scoped(body: () => void): void {
    this.#frames.push(new Set());
    body();
    this.#frames.pop();
  }

  /** Bind what a pattern declares; the defaults and computed keys inside it are reads. */
  #bind(pattern: unknown): void {
    walkPattern(pattern, {
      name: (node) => this.#declare(nameOf(node)),
      expression: (node) => {
        if (isNode(node)) this.#expression(node);
      },
    });
  }

  /** A name READ by the view (§3.4). */
  #read(node: OxcNode): void {
    const name = nameOf(node);
    if (this.#local(name)) return;
    if (name === 'arguments') {
      this.#report('expression', FUD0904(this.#span(node)));
      return;
    }
    if (this.#view.resolve(name, this.#template) === undefined) {
      this.#report('identifier', FUD0907(this.#span(node)));
    }
  }

  // ── Expressions (§3.2) ──

  #expression(node: OxcNode): void {
    switch (node.type) {
      case 'Identifier':
        this.#read(node);
        return;
      case 'Literal':
        return;
      case 'TemplateLiteral':
        this.#each(children(node, 'expressions'));
        return;
      case 'TaggedTemplateExpression':
        this.#optional(child(node, 'tag'));
        this.#optional(child(node, 'quasi'));
        return;
      case 'MemberExpression':
        this.#optional(child(node, 'object'));
        if (field(node, 'computed') === true) this.#optional(child(node, 'property'));
        return;
      case 'ChainExpression':
      case 'ParenthesizedExpression':
      case 'TSAsExpression':
      case 'TSSatisfiesExpression':
      case 'TSNonNullExpression':
      case 'TSTypeAssertion':
      case 'TSInstantiationExpression':
        // Only the expression: a type annotation is not a value and names nothing to read.
        this.#optional(child(node, 'expression'));
        return;
      case 'CallExpression':
      case 'NewExpression':
        this.#optional(child(node, 'callee'));
        this.#each(children(node, 'arguments'));
        return;
      case 'SpreadElement':
        this.#optional(child(node, 'argument'));
        return;
      case 'UnaryExpression':
        if (field(node, 'operator') === 'delete') {
          this.#report('expression', FUD0900(this.#span(node)));
          return;
        }
        this.#optional(child(node, 'argument'));
        return;
      case 'BinaryExpression':
      case 'LogicalExpression':
        this.#optional(child(node, 'left'));
        this.#optional(child(node, 'right'));
        return;
      case 'ConditionalExpression':
        this.#optional(child(node, 'test'));
        this.#optional(child(node, 'consequent'));
        this.#optional(child(node, 'alternate'));
        return;
      case 'ArrayExpression':
        this.#each(children(node, 'elements'));
        return;
      case 'ObjectExpression':
        for (const property of children(node, 'properties')) if (isNode(property)) this.#property(property);
        return;
      case 'ArrowFunctionExpression':
        this.#arrow(node);
        return;
      case 'FunctionExpression':
        this.#report('expression', (field(node, 'async') === true ? FUD0902 : FUD0905)(this.#span(node)));
        return;
      case 'ClassExpression':
        this.#report('expression', FUD0905(this.#span(node)));
        return;
      case 'AssignmentExpression':
      case 'UpdateExpression':
        this.#report('expression', FUD0900(this.#span(node)));
        return;
      case 'AwaitExpression':
      case 'YieldExpression':
        this.#report('expression', FUD0902(this.#span(node)));
        return;
      case 'ImportExpression':
        this.#report('expression', FUD0903(this.#span(node)));
        return;
      case 'MetaProperty': {
        const meta = child(node, 'meta');
        const code = meta !== undefined && nameOf(meta) === 'import' ? FUD0903 : FUD0904;
        this.#report('expression', code(this.#span(node)));
        return;
      }
      case 'ThisExpression':
      case 'Super':
        this.#report('expression', FUD0904(this.#span(node)));
        return;
      case 'SequenceExpression':
        this.#report('expression', FUD0906(this.#span(node)));
        return;
      default:
        // Not on the list (§5): refused, as code the view has no business holding.
        this.#report('expression', FUD0905(this.#span(node)));
    }
  }

  #optional(node: OxcNode | undefined): void {
    if (node !== undefined) this.#expression(node);
  }

  /** A list of expressions: arguments, elements, template parts. A hole is nothing. */
  #each(nodes: readonly unknown[]): void {
    for (const node of nodes) if (isNode(node)) this.#expression(node);
  }

  /** `key: value` and `key` are values; a method, getter or setter defines code (§3.2). */
  #property(property: OxcNode): void {
    if (property.type === 'SpreadElement') {
      this.#optional(child(property, 'argument'));
      return;
    }
    if (property.type !== 'Property' || field(property, 'method') === true || field(property, 'kind') !== 'init') {
      this.#report('expression', FUD0905(this.#span(property)));
      return;
    }
    if (field(property, 'computed') === true) this.#optional(child(property, 'key'));
    this.#optional(child(property, 'value'));
  }

  /** An arrow is a value only with an expression body, and never `async` (§3.2). */
  #arrow(node: OxcNode): void {
    if (field(node, 'async') === true) {
      this.#report('expression', FUD0902(this.#span(node)));
      return;
    }
    if (field(node, 'expression') !== true) {
      this.#report('expression', FUD0905(this.#span(node)));
      return;
    }
    this.#scoped(() => {
      for (const param of children(node, 'params')) this.#bind(param);
      this.#optional(child(node, 'body'));
    });
  }

  // ── Headers of `@for` / `@foreach` (§3.2, the one exception to FUD0900) ──

  #header(node: OxcNode): void {
    if (node.type === 'ForStatement') {
      this.#forHeader(node);
      return;
    }
    // `for-of-header` (and a `for…in` someone wrote in a `@foreach`, which is not this rule's).
    if (field(node, 'await') === true) {
      this.#report('expression', FUD0902(this.#span(node)));
      return;
    }
    this.#optional(child(node, 'right'));
    const left = child(node, 'left');
    if (left?.type === 'VariableDeclaration') {
      for (const declaration of children(left, 'declarations')) {
        if (isNode(declaration)) this.#bind(field(declaration, 'id'));
      }
    } else if (left !== undefined) {
      // `@foreach (x of xs)` writes a name that lives somewhere else.
      this.#report('expression', FUD0900(this.#span(left)));
    }
  }

  /** `let i = 0; i < n; i++`: init and update may write what THIS header declares, only. */
  #forHeader(node: OxcNode): void {
    const own = new Set<string>();
    const init = child(node, 'init');
    if (init?.type === 'VariableDeclaration') {
      for (const declaration of children(init, 'declarations')) {
        if (!isNode(declaration)) continue;
        this.#optional(child(declaration, 'init'));
        walkPattern(field(declaration, 'id'), {
          name: (name) => {
            own.add(nameOf(name));
            this.#declare(nameOf(name));
          },
          expression: (expr) => {
            if (isNode(expr)) this.#expression(expr);
          },
        });
      }
    } else if (init !== undefined) {
      this.#headerWrite(init, own);
    }
    this.#optional(child(node, 'test'));
    const update = child(node, 'update');
    if (update !== undefined) this.#headerWrite(update, own);
  }

  /** An init or update of a `@for`: a write is fine when its target is the header's own. */
  #headerWrite(node: OxcNode, own: ReadonlySet<string>): void {
    const expr = unwrap(node);
    if (expr.type === 'AssignmentExpression' || expr.type === 'UpdateExpression') {
      const target = child(expr, expr.type === 'AssignmentExpression' ? 'left' : 'argument');
      const leaf = target === undefined ? undefined : unwrap(target);
      if (leaf?.type === 'Identifier' && own.has(nameOf(leaf))) {
        if (expr.type === 'AssignmentExpression') this.#optional(child(expr, 'right'));
        return;
      }
      this.#report('expression', FUD0900(this.#span(expr)));
      return;
    }
    this.#expression(node);
  }

  // ── Statements of `@{ }` (§3.3) and its writes (§3.5) ──

  #statement(node: OxcNode): void {
    switch (node.type) {
      case 'VariableDeclaration':
        this.#declaration(node);
        return;
      case 'ExpressionStatement':
        this.#effect(child(node, 'expression'));
        return;
      case 'IfStatement':
        this.#optional(child(node, 'test'));
        this.#body(child(node, 'consequent'));
        this.#body(child(node, 'alternate'));
        return;
      case 'SwitchStatement':
        this.#optional(child(node, 'discriminant'));
        this.#switches++;
        this.#scoped(() => {
          for (const branch of children(node, 'cases')) {
            if (!isNode(branch)) continue;
            this.#optional(child(branch, 'test'));
            for (const statement of children(branch, 'consequent')) {
              if (isNode(statement)) this.#statement(statement);
            }
          }
        });
        this.#switches--;
        return;
      case 'ForStatement':
        this.#scoped(() => {
          const init = child(node, 'init');
          if (init?.type === 'VariableDeclaration') this.#declaration(init);
          else this.#effect(init);
          this.#optional(child(node, 'test'));
          this.#effect(child(node, 'update'));
          this.#loop(child(node, 'body'));
        });
        return;
      case 'ForOfStatement':
      case 'ForInStatement':
        if (field(node, 'await') === true) {
          this.#report('expression', FUD0902(this.#keyword(node, 'for await')));
          return;
        }
        this.#scoped(() => {
          this.#optional(child(node, 'right'));
          const left = child(node, 'left');
          if (left?.type === 'VariableDeclaration') this.#declaration(left, false);
          else if (left !== undefined) this.#write(left);
          this.#loop(child(node, 'body'));
        });
        return;
      case 'WhileStatement':
        this.#optional(child(node, 'test'));
        this.#loop(child(node, 'body'));
        return;
      case 'DoWhileStatement':
        this.#loop(child(node, 'body'));
        this.#optional(child(node, 'test'));
        return;
      case 'BreakStatement':
      case 'ContinueStatement': {
        const keyword = node.type === 'BreakStatement' ? 'break' : 'continue';
        const inside = node.type === 'BreakStatement' ? this.#loops + this.#switches > 0 : this.#loops > 0;
        if (child(node, 'label') !== undefined || !inside) {
          this.#report('statement', FUD0908({ ...this.#keyword(node, keyword), keyword }));
        }
        return;
      }
      case 'BlockStatement':
        this.#scoped(() => {
          for (const statement of children(node, 'body')) if (isNode(statement)) this.#statement(statement);
        });
        return;
      case 'EmptyStatement':
      case 'TSTypeAliasDeclaration':
      case 'TSInterfaceDeclaration':
        // A type emits nothing; there is nothing in it to run.
        return;
      case 'FunctionDeclaration':
        this.#report('statement', (field(node, 'async') === true ? FUD0902 : FUD0905)(this.#span(node)));
        return;
      case 'ClassDeclaration':
        this.#report('statement', FUD0905(this.#span(node)));
        return;
      case 'LabeledStatement': {
        const label = child(node, 'label');
        const at = label ?? node;
        this.#report('statement', FUD0908({ ...this.#span(at), keyword: `${this.#text(at)}:` }));
        return;
      }
      default: {
        // `return`, `throw`, `try`, `with`, `debugger`, `enum`, `using`… and whatever else.
        const keyword = this.#firstWord(node);
        this.#report('statement', FUD0908({ ...this.#keyword(node, keyword), keyword }));
      }
    }
  }

  /** `const` / `let` declare; `var` leaks out of the block, `using` disposes (§3.3). */
  #declaration(node: OxcNode, withInit = true): void {
    const kind = String(field(node, 'kind'));
    if (kind !== 'const' && kind !== 'let') {
      const keyword = this.#firstWord(node);
      const code = kind === 'await using' ? FUD0902 : undefined;
      if (code !== undefined) this.#report('expression', code(this.#keyword(node, keyword)));
      else this.#report('statement', FUD0908({ ...this.#keyword(node, keyword), keyword }));
      return;
    }
    for (const declaration of children(node, 'declarations')) {
      if (!isNode(declaration)) continue;
      if (withInit) this.#optional(child(declaration, 'init'));
      this.#bind(field(declaration, 'id'));
    }
  }

  /** The body of an `if`: one statement or a block, each with its own scope. */
  #body(node: OxcNode | undefined): void {
    if (node === undefined) return;
    this.#scoped(() => this.#statement(node));
  }

  #loop(node: OxcNode | undefined): void {
    this.#loops++;
    this.#body(node);
    this.#loops--;
  }

  /**
   * An expression in statement position — or the init and update of an `@{ }` loop. The one
   * place a write is legal: `total = a + b;`, `i++`, `({ a, b } = obj);` (§3.5).
   */
  #effect(node: OxcNode | undefined): void {
    if (node === undefined) return;
    const expr = unwrap(node);
    if (expr.type === 'AssignmentExpression') {
      this.#optional(child(expr, 'right'));
      const left = child(expr, 'left');
      if (left !== undefined) this.#write(left);
      return;
    }
    if (expr.type === 'UpdateExpression') {
      const argument = child(expr, 'argument');
      if (argument !== undefined) this.#write(argument);
      return;
    }
    this.#expression(node);
  }

  /**
   * The target of a write in `@{ }`: a variable, never a member (FUD0900), and a variable the
   * template owns — declared by the template or a neutral `let` (FUD0901). A destructuring
   * target is judged leaf by leaf; its defaults and computed keys are reads.
   */
  #write(target: OxcNode): void {
    const node = unwrap(target);
    switch (node.type) {
      case 'Identifier': {
        const name = nameOf(node);
        if (this.#local(name)) return;
        const origin = this.#view.resolve(name, this.#template);
        if (origin !== 'template' && origin !== 'neutral-let') {
          this.#report('statement', FUD0901(this.#span(node)));
        }
        return;
      }
      case 'MemberExpression':
        this.#report('statement', FUD0900(this.#span(node)));
        return;
      case 'ObjectPattern':
        for (const property of children(node, 'properties')) {
          if (!isNode(property)) continue;
          if (property.type === 'RestElement') {
            this.#writeChild(property, 'argument');
            continue;
          }
          if (field(property, 'computed') === true) this.#optional(child(property, 'key'));
          this.#writeChild(property, 'value');
        }
        return;
      case 'ArrayPattern':
        for (const element of children(node, 'elements')) if (isNode(element)) this.#write(element);
        return;
      case 'AssignmentPattern':
        this.#optional(child(node, 'right'));
        this.#writeChild(node, 'left');
        return;
      case 'RestElement':
        this.#writeChild(node, 'argument');
        return;
      default:
        this.#report('statement', FUD0900(this.#span(node)));
    }
  }

  #writeChild(node: OxcNode, key: string): void {
    const target = child(node, key);
    if (target !== undefined) this.#write(target);
  }

  // ── Source text, for the keyword a FUD0908 names and underlines (§4.2) ──

  #text(node: OxcNode): string {
    const at = this.#input.js.mapSpan(node.start, node.end);
    return this.#input.source.slice(at.start, at.end);
  }

  #firstWord(node: OxcNode): string {
    return /^[A-Za-z_$][\w$]*(?:\s+using)?/u.exec(this.#text(node))?.[0] ?? node.type;
  }

  /** The span of the statement's opening keyword, not of the whole statement. */
  #keyword(node: OxcNode, keyword: string): { readonly span: Span } {
    const text = this.#text(node);
    const length = text.startsWith(keyword) ? keyword.length : text.length;
    return { span: this.#input.js.mapSpan(node.start, node.start + length) };
  }
}
