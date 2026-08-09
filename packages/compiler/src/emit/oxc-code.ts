/**
 * `@code` extraction for the SSR emit: read the component's `props<T>()` object pattern
 * and its `signal(init)` declarations out of the JS parsed by Oxc (SDD-11).
 *
 * Oxc hands back an untyped estree-shaped node whose children are reached by property
 * name. That stringly-typed access is quarantined here behind `field` / `fieldArray`
 * and the `is()` discriminant check, so the traversal below reads as plain typed code
 * and the rest of the emit never touches an `OxcNode` index. Offsets come back in the
 * synthetic batch buffer and are mapped to the original source via `mapOffset`.
 */

import type { ComponentDocument } from '../document/index.js';
import type { Diagnostic, Span } from '../types/index.js';
import { errorDiag, isEmptySpan } from '../types/index.js';
import { JsBatch, type OxcNode } from '../oxc/index.js';
import { collectTemplateJs } from './constructs.js';
import { changeableBindings, type FragmentAst } from './scope.js';

/** One destructured prop from `props<T>()`, with its default expression source if any. */
export interface Prop {
  readonly name: string;
  readonly def?: string;
}

/**
 * One reactive declaration of `@code`: `const x = signal(init)` or
 * `const x = computed(fn)`.
 *
 * Both kinds go in the SAME list on purpose (SDD-31 §4.7). What that list answers is «can
 * this name move?», and the answer decides whether a `.prop` crosses a value or a reference
 * (decision 84) and whether the parent emits a subscription — and it is the same answer for
 * the two. Only the server's inert stub cares which one it is, so only `kind` distinguishes
 * them.
 */
export interface Reactive {
  readonly name: string;
  /** `signal` → the initial value's source. `computed` → the derive function's, verbatim. */
  readonly init: string;
  readonly kind: 'signal' | 'computed';
}

/**
 * One call to the `emit` of `@fudic/dom` inside `@code { @client }`, in SOURCE coordinates
 * (SDD-15 §4.4). The developer writes `emit(name, detail)` and never sees the host; the
 * compiler splices it in as the `this` of the call, so the exported type stays honest.
 *
 * Three offsets and not a text match, because none of this is a `replace` over the source:
 * `import { emit as fire }` is legal and then the name to patch is `fire`, and an `emit`
 * inside a string or a comment is not a call at all. Both facts are the AST's to state.
 */
export interface EmitCall {
  /** End of the callee identifier: where `.call` is spliced in. */
  readonly calleeEnd: number;
  /** Where `$host` goes: before the first argument, or before the `)` of a call with none. */
  readonly hostAt: number;
  /** Whether the call already carries arguments, and so needs a comma after `$host`. */
  readonly hasArgs: boolean;
}

/**
 * The `@code { @client }` body, split where the JS module grammar forces it: an `import`
 * declaration is only legal at the top level of a module, but the rest of the region has
 * to live INSIDE the factory closure, because that is where it is per instance (§4.7).
 *
 * Both halves are the author's source, copied verbatim — including its TypeScript. The
 * emitted chunk is bundler input, and stripping types is the bundler's job (esbuild, via
 * the Vite plugin); the compiler parses JS/TS, it does not transpile it.
 */
export interface ClientCode {
  /** `import` declarations, hoisted to module scope. */
  readonly imports: string[];
  /** Everything else, in source order, for the body of the factory closure. */
  readonly body: string[];
}

/**
 * The AST of every JS fragment the TEMPLATE holds — interpolations, attribute values,
 * control headers, keys and `@{ … }` — keyed by its source span.
 *
 * It exists because the block render has to tell a reference from a declaration (SDD-30
 * §3.3), and that is a question only the AST answers. Registering these in the SAME batch
 * as `@code` is what keeps the golden rule intact: one Oxc invocation per file, whether it
 * is asked one question or a hundred.
 */
export interface TemplateJs {
  /** The AST at `span`, or an empty list when nothing was registered there. */
  ast(span: Span): FragmentAst;
  /**
   * A node offset back in the `.fud`. Oxc node offsets are BUFFER coordinates (§4.4), and
   * an emitter that has to slice a sub-expression out of a fragment — the callee of an
   * event binding, its argument list — needs the source positions to do it.
   */
  offset(bufferOffset: number): number;
}

export interface ExtractedCode {
  readonly props: Prop[];
  /** Every name the component declares with `signal(...)` or `computed(...)`, in order. */
  readonly signals: Reactive[];
  readonly client: ClientCode;
  /** The parsed JS of the template. Empty for a document with no renderable tree. */
  readonly template: TemplateJs;
  /**
   * The `@code { @client }` names whose VALUE can change (§3.3).
   *
   * They are what a block has to take by parameter. A `const` or a `function` nobody
   * reassigns is not here: `u` would have nothing new to hand it, so it reaches the block
   * through the closure and a parameter for it would be noise in the signature.
   */
  readonly mutable: ReadonlySet<string>;
  /**
   * Every `emit(...)` of `@client` (§4.4), as the walk finds them — the patches are applied
   * by descending offset, so the order they arrive in is not one of. Empty when the
   * component does
   * not import `emit` from `@fudic/dom`, and that is the whole test: a raw
   * `host.dispatchEvent(...)` is valid DOM and stays untouched, because it does not
   * participate in directed hydration — which is exactly the distinction `emit` buys.
   */
  readonly emitCalls: readonly EmitCall[];
  /**
   * What Oxc had to say about this `@code`, already in source coordinates (BUG-13 §5.3).
   *
   * Without them the three lists above are ambiguous: empty reads as "there was no code"
   * whether the block was absent or unparseable, and the emit then writes a module that
   * references identifiers nobody declares. Empty here means the JS parsed.
   */
  readonly diagnostics: readonly Diagnostic[];
}

// ── Typed access over the untyped Oxc node (the only place that indexes by name) ──
// A type predicate, not just a boolean: a node reached by `field` may be absent, and the
// check that says which kind it is is also the check that says it is there.
const is = (node: OxcNode | undefined, type: string): node is OxcNode => node?.type === type;
const field = (node: OxcNode, key: string): OxcNode | undefined => node[key] as OxcNode | undefined;
const fieldArray = (node: OxcNode, key: string): OxcNode[] => (node[key] as OxcNode[] | undefined) ?? [];
const name = (node: OxcNode): string => String(node['name']);

type MapOffset = (bufferOffset: number) => number;

/**
 * Extract, in ONE Oxc invocation for the whole file, everything the two emit branches need
 * out of `@code`: the `props<T>()` pattern (with its defaults), the `signal()` initials the
 * server branch renders inert, and the `@client` region split into imports and body.
 *
 * The batch's diagnostics come out with them. A parse that failed is not a component
 * without code, and the caller is the only one that can still tell the difference.
 */
export function extractCode(source: string, doc: ComponentDocument): ExtractedCode {
  const props: Prop[] = [];
  const signals: Reactive[] = [];
  const client: ClientCode = { imports: [], body: [] };
  const own: Diagnostic[] = [];

  const batch = new JsBatch(source);
  const parts = doc.code?.parts ?? [];
  const ids = parts.map((p) => batch.add('module-statements', p.js));
  // The template's fragments go into the SAME batch, after `@code`: registration order is
  // only the order of the synthetic buffer, and the spans are what anyone looks them up by.
  const fragments = new Map<string, number>();
  collectTemplateJs(doc.template?.children ?? [], (kind, at) => {
    if (isEmptySpan(at)) return; // a degraded header has its own diagnostic already
    fragments.set(spanKey(at), batch.add(kind, at));
  });

  const result = batch.parse();
  const map = result.value.mapOffset;

  const clientStatements: OxcNode[] = [];
  ids.forEach((id, i) => {
    const root = result.value.ast(id);
    const stmts = Array.isArray(root) ? (root as OxcNode[]) : [root as OxcNode];
    const isClient = parts[i]!.type === 'client-region';
    for (const stmt of stmts) {
      if (isClient) clientStatements.push(stmt);
      else checkNeutralEffect(stmt, map, own);
      if (!is(stmt, 'VariableDeclaration')) continue;
      for (const decl of fieldArray(stmt, 'declarations')) {
        readDeclarator(decl, source, map, props, signals);
      }
    }
  });

  const template: TemplateJs = {
    ast: (at) => {
      const id = fragments.get(spanKey(at));
      return id === undefined ? [] : result.value.ast(id);
    },
    offset: map,
  };
  const binding = emitBinding(clientStatements);
  const emitCalls: EmitCall[] = [];
  if (binding !== undefined) collectEmitCalls(clientStatements, binding, map, emitCalls);
  // The body is read AFTER the calls are known: each statement is copied with the host
  // spliced into every `emit(...)` it holds (§4.4).
  for (const stmt of clientStatements) readClientStatement(stmt, source, map, client, emitCalls);

  return {
    props,
    signals,
    client,
    template,
    mutable: changeableBindings(clientStatements),
    emitCalls,
    diagnostics: [...result.diagnostics, ...own],
  };
}

/**
 * `effect(...)` outside `@code { @client }` → `FUD0570` (SDD-31 §5).
 *
 * An effect is, by definition, what happens AFTER the first render, and the server has no
 * such moment. The statement is dropped — the neutral zone only ever contributed props and
 * reactive declarations to the emit anyway — and the rest of the file is emitted: the emit
 * does not throw. `computed` and `batch` are not flagged; both have a server meaning.
 */
function checkNeutralEffect(stmt: OxcNode, map: MapOffset, out: Diagnostic[]): void {
  // The two shapes an `effect(...)` takes: called for its side effect, or bound to keep its
  // teardown. Anything else lands as `undefined` here and falls out on the first check.
  const calls = is(stmt, 'VariableDeclaration')
    ? fieldArray(stmt, 'declarations').map((decl) => field(decl, 'init'))
    : [field(stmt, 'expression')];
  for (const call of calls) {
    if (!is(call, 'CallExpression')) continue;
    const callee = field(call, 'callee');
    if (!is(callee, 'Identifier') || name(callee) !== 'effect') continue;
    out.push(
      errorDiag(
        'FUD0570',
        'effect(...) belongs in @code { @client }: an effect runs after the first render, and the server has none.',
        { start: map(call.start), end: map(call.end) },
      ),
    );
  }
}

/** The package `emit` comes from. Anything else of that name is the author's own. */
const DOM_PACKAGE = '@fudic/dom';

/**
 * The local name `emit` was imported under, or `undefined` when it was not imported.
 *
 * `import { emit as fire }` is legal JS, and then the name to rewrite is `fire`. Reading it
 * off the `ImportDeclaration` is what makes the rewrite a fact about bindings rather than a
 * search for a word — a component that never imports `emit` has none, whatever it spells.
 */
function emitBinding(statements: readonly OxcNode[]): string | undefined {
  for (const stmt of statements) {
    if (!is(stmt, 'ImportDeclaration') || field(stmt, 'source')!['value'] !== DOM_PACKAGE) continue;
    for (const spec of fieldArray(stmt, 'specifiers')) {
      // A default or namespace specifier imports no NAME: `emit` cannot be reached that way.
      const imported = field(spec, 'imported');
      if (imported !== undefined && name(imported) === 'emit') return name(field(spec, 'local')!);
    }
  }
  return undefined;
}

/**
 * Every call of `binding`, however deep — a handler nested three functions down emits just
 * as much as a statement at the top of the region. The walk is generic on purpose: what it
 * must never do is match text, and a node it does not know about cannot hide a call.
 */
function collectEmitCalls(node: unknown, binding: string, map: MapOffset, out: EmitCall[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectEmitCalls(child, binding, map, out);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const current = node as OxcNode;
  const callee = is(current, 'CallExpression') ? field(current, 'callee') : undefined;
  if (is(callee, 'Identifier') && name(callee!) === binding) {
    const first = fieldArray(current, 'arguments')[0];
    out.push({
      calleeEnd: map(callee!.end),
      // With no arguments there is nothing to insert BEFORE, so `$host` goes where the
      // call closes: a `CallExpression` always ends at its `)`.
      hostAt: first === undefined ? map(current.end - 1) : map(first.start),
      hasArgs: first !== undefined,
    });
  }
  for (const value of Object.values(current)) collectEmitCalls(value, binding, map, out);
}

const spanKey = (at: Span): string => `${at.start},${at.end}`;

/** Route one top-level statement of `@client` to the module scope or to the closure. */
function readClientStatement(
  stmt: OxcNode,
  source: string,
  map: MapOffset,
  client: ClientCode,
  calls: readonly EmitCall[],
): void {
  const start = map(stmt.start);
  const text = withHost(source.slice(start, map(stmt.end)), start, calls);
  (is(stmt, 'ImportDeclaration') ? client.imports : client.body).push(text);
}

/**
 * Splice the host into every `emit(...)` of one statement: `emit('x', d)` becomes
 * `emit.call($host, 'x', d)`, so the host arrives as `this` (§4.4).
 *
 * The developer never sees it. Putting it in the signature would leak a compiler concern
 * into user code, which is why the type `@fudic/dom` exports lies by omission on purpose.
 * Nor is the host a delicate choice: `emit` forces `composed: true`, and a composed event
 * is RETARGETED to the host the moment it leaves the shadow — dispatching from any inner
 * node would look the same to the subscriber. The host is simply the node the controller
 * already holds, and the one that does not depend on where the call is written.
 *
 * The edits are applied by OFFSET and back to front, never by regular expression: an
 * `emit` inside a string or a comment is not a call, and a call nested in another one's
 * arguments must not move the offsets of the call around it.
 */
function withHost(text: string, offset: number, calls: readonly EmitCall[]): string {
  const edits: { at: number; text: string }[] = [];
  for (const call of calls) {
    if (call.calleeEnd <= offset || call.calleeEnd > offset + text.length) continue;
    edits.push({ at: call.calleeEnd - offset, text: '.call' });
    edits.push({ at: call.hostAt - offset, text: call.hasArgs ? '$host, ' : '$host' });
  }
  edits.sort((a, b) => b.at - a.at);
  return edits.reduce((out, edit) => out.slice(0, edit.at) + edit.text + out.slice(edit.at), text);
}

/** Route a single `const … = call(...)` declarator to props (ObjectPattern) or reactives. */
function readDeclarator(
  decl: OxcNode,
  source: string,
  map: MapOffset,
  props: Prop[],
  signals: Reactive[],
): void {
  const init = field(decl, 'init');
  const id = field(decl, 'id');
  if (!init || !id || !is(init, 'CallExpression')) return;
  const callee = field(init, 'callee');
  const called = is(callee, 'Identifier') ? name(callee!) : '';

  if (called === 'props' && is(id, 'ObjectPattern')) {
    for (const property of fieldArray(id, 'properties')) readProp(property, source, map, props);
  } else if ((called === 'signal' || called === 'computed') && is(id, 'Identifier')) {
    const arg = fieldArray(init, 'arguments')[0];
    // A `computed` with no argument would be a program that cannot run; `undefined` keeps
    // the emit total and lets the author's own tooling say so.
    signals.push({
      name: name(id),
      init: arg ? source.slice(map(arg.start), map(arg.end)) : 'undefined',
      kind: called,
    });
  }
}

/** Flatten one `{ a, b = expr }` property, taking the default's source verbatim. */
function readProp(property: OxcNode, source: string, map: MapOffset, out: Prop[]): void {
  const key = field(property, 'key');
  if (!is(property, 'Property') || !is(key, 'Identifier')) return;
  const value = field(property, 'value');
  if (value && is(value, 'AssignmentPattern')) {
    const right = field(value, 'right')!;
    out.push({ name: name(key!), def: source.slice(map(right.start), map(right.end)) });
  } else {
    out.push({ name: name(key!) });
  }
}
