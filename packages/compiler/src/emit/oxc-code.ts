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
import type { ResolvedComponent } from './resolve.js';
import type { Diagnostic, Span } from '../types/index.js';
import { errorDiag, isEmptySpan } from '../types/index.js';
import { JsBatch, type OxcNode } from '../oxc/index.js';
import { collectTemplateJs } from './constructs.js';
import {
  changeableBindings,
  reservedIdentifiers,
  setCalls,
  topLevelBindings,
  topLevelFunctions,
  type FragmentAst,
} from './scope.js';

/** One destructured prop from `props<T>()`, with its default expression source if any. */
export interface Prop {
  readonly name: string;
  readonly def?: string;
  /**
   * `false` only when the key of `T` is written WITHOUT `?`. When `T` cannot be read at all
   * nothing can be proven about it, so every prop reads as optional and a build invents no
   * error (BUG-23 §4.4).
   */
  readonly optional: boolean;
  /**
   * What the child asks to be handed by REFERENCE (props-spec decision 86): `'signal'` when
   * its type is `Signal<…>`, `'fn'` when it is a function signature, absent otherwise.
   *
   * It is read off `T` and nowhere else, for the same reason `optional` is: what decides the
   * form of the crossing is what the CHILD declares, and a `T` this file cannot read declares
   * nothing — so a build with no type argument marks no channel and everything keeps crossing
   * by value, byte for byte (BUG-23 §4.4).
   */
  readonly channel?: 'signal' | 'fn';
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
  /**
   * Where the `signal(…)` / `computed(…)` CALL starts in the `.fud`.
   *
   * The client emit splices `$pK ?? ` in front of it when the name occupies a cell (BUG-24
   * §4.4), and an offset is the only way to do that: the `@client` body is copied verbatim,
   * so a `signal` inside a string or a comment is not a declaration and a text search would
   * not know the difference.
   */
  readonly at: number;
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
  /**
   * The event name, when the first argument RESOLVES statically (§4.4, decision 28.c) —
   * and in v1 that means a string literal and nothing else. It is what puts this tag in
   * `fud-bus`; the splice above happens either way.
   *
   * Absent is not an error and produces no diagnostic: the binding still works as a plain
   * DOM listener, it just does not take part in directed hydration. We do not protect what
   * we cannot see. A `const` local and an imported `as const` are the widening decision 28.c
   * also admits; the second needs the module graph, which one file's model does not have.
   */
  readonly name?: string;
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
  readonly body: ClientStatement[];
}

/**
 * One top-level statement of the NEUTRAL zone — the half of `@code` that runs on BOTH sides,
 * and until SDD-34 the half that reached NEITHER emitted module.
 *
 * The zone used to contribute only two things: the `props<T>()` destructuring and the
 * reactive declarations, both of which the emit writes in its own shape. Everything else was
 * read for those two facts and then dropped, so decision 33.c — *imports inside the regions,
 * hoisted at emit* — was true of `@client` alone, and an `import { userForm } from
 * './user.form.js'` named a binding that existed in no module. That is the shape SDD-34 needs:
 * a form is written in a `.ts` and IMPORTED by the view, so that the server renders its values
 * and the client hydrates the very same object — and `control="@userForm.title"` compiles to a
 * call that has to find `userForm` on both sides.
 *
 * **What declares a TYPE and nothing else does not travel.** A `type Post = …`, an
 * `interface`, an `import type` — the emit reads them (that is how `props<T>()` resolves) and
 * neither module runs them. The same goes for a type specifier inside a value import, which is
 * why a mixed `import { type Post, userForm }` is NARROWED rather than copied: the specifier
 * sits in the middle of a list and cutting it textually would take a comma with it.
 *
 * Everything else is the author's source, verbatim — annotations included. A neutral
 * `const f: Form<Post> = form(schema)` is TypeScript, so both emitted modules are TypeScript
 * whenever the author wrote it, and both are stripped by the plugin on their way through the
 * bundler. That was already the rule for the client chunk (`?client`) and for `@server`; the
 * component's server module joins them, because until now nothing of the author's ever
 * reached it.
 */
export interface NeutralStatement {
  /** The author's source, with any type-only import specifier removed. */
  readonly text: string;
  /** An `import` is only legal at module scope; everything else goes inside the function. */
  readonly hoisted: boolean;
}

/**
 * One top-level statement of `@client`, and where it came from.
 *
 * The offset travels with the text because a later pass — the one that knows the GRAPH, and
 * therefore which names occupy a cell — has to splice into it (BUG-24 §4.4). `extractCode`
 * cannot do that itself: whether a name crosses by reference is a fact about the CHILD, and
 * this pass reads one file.
 */
export interface ClientStatement {
  /** The statement's source, with the `emit(…)` host and the cell reads already spliced in. */
  readonly text: string;
  /** Where `text` starts in the `.fud`. */
  readonly at: number;
  /**
   * What this pass already inserted, as an offset RELATIVE to `at` and the length it added.
   *
   * A later splice has to land on a character, and the characters moved: without this the
   * cell rewrite of BUG-24 §4.4 would compute its position against the author's source and
   * write into the middle of an `emit.call($host, …)` this pass had put there.
   */
  readonly splices: readonly Splice[];
}

/** One insertion already applied to a statement's text. */
export interface Splice {
  readonly at: number;
  readonly length: number;
}

/** Where a source-relative offset ended up in a statement's text, after its own splices. */
export function splicedOffset(statement: ClientStatement, sourceOffset: number): number {
  const rel = sourceOffset - statement.at;
  return statement.splices.reduce((out, s) => (s.at <= rel ? out + s.length : out), rel);
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
  /**
   * The neutral zone, in source order, minus what the emit writes in its own shape.
   *
   * A `props<T>()` destructuring and a `signal(...)`/`computed(...)` declaration are NOT here:
   * the two modules each write their own form of those — the props pattern with its defaults,
   * the reactive inert on the server and cell-spliced on the client — and copying the source
   * beside them would declare the same name twice.
   */
  readonly neutral: readonly NeutralStatement[];
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
   * The names `@code { @client }` declares at its top level, in the order it declares them.
   *
   * It is what orders the cells of a component inside its payload slice (BUG-24 §4.2), and it
   * covers a `function` as much as a `const`: a callback crosses by reference exactly like a
   * signal does, and the two have to be laid out by one rule.
   */
  readonly clientNames: readonly string[];
  /**
   * The `@client` names declared as FUNCTIONS, and the ones this component calls `.set(…)` on.
   *
   * Both are what the crossing rules of §4.9 compare a value against: a callback prop has to
   * be fed a function, and a `computed` may not cross to a prop the child WRITES — a derived
   * value is not writable (SDD-31 §4.3), and the child is the one who would try.
   */
  readonly clientFunctions: ReadonlySet<string>;
  readonly setCalls: ReadonlySet<string>;
  /**
   * The names `@code { @client }` IMPORTS from another module — a store, in practice.
   *
   * They are the reactive sources this file cannot prove anything about: the module is
   * somewhere else, the emit is per file, and `const count = signal(0)` in `store.ts` is a
   * declaration this component never sees. Without them a module-level signal crosses by
   * reference, reads correctly, and never repaints — the value is right and nobody is
   * listening, which is a defect that appears and vanishes with whatever repaints beside it.
   *
   * Type-only imports are NOT here: they are erased, and a `$sub` on an erased binding is a
   * `ReferenceError`. Neither are the framework's own packages — `signal`, `computed`,
   * `emit` and their siblings are never a component's state, and a line per import is a line
   * every instance of the tag downloads.
   */
  readonly clientImports: readonly string[];
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

  // The named types of `@code`, collected BEFORE anything is read: `props<Props>()` may be
  // written above its own `type Props = { … }`, and a hoisted declaration is visible either way.
  const named = new Map<string, OxcNode>();
  ids.forEach((id) => {
    const root = result.value.ast(id);
    const stmts = Array.isArray(root) ? (root as OxcNode[]) : [root as OxcNode];
    for (const stmt of stmts) collectNamedType(stmt, named);
  });

  const clientStatements: OxcNode[] = [];
  // Every top-level statement of `@code`, whichever region it came from. Imports are read
  // off THIS and not off `clientStatements`, because a module the TEMPLATE reads usually
  // sits in the neutral zone: the template is painted on both sides, so a store imported
  // inside `@client` leaves the server with no such name and the route fails to prerender.
  // The neutral zone is where it has to go, and it is just as reactive there.
  const allStatements: OxcNode[] = [];
  const neutral: NeutralStatement[] = [];
  ids.forEach((id, i) => {
    const root = result.value.ast(id);
    const stmts = Array.isArray(root) ? (root as OxcNode[]) : [root as OxcNode];
    const isClient = parts[i]!.type === 'client-region';
    for (const stmt of stmts) {
      allStatements.push(stmt);
      if (isClient) clientStatements.push(stmt);
      else checkNeutralEffect(stmt, map, own);
      // The declarators are read on BOTH sides — a `signal(...)` is as reactive in the
      // neutral zone as in `@client` — and what comes back is what the emit does NOT write
      // in a shape of its own, which is exactly what the neutral zone still has to carry.
      const remaining = readDeclarators(stmt, source, map, props, signals, named);
      if (isClient) continue;
      const kept = neutralStatement(stmt, remaining, source, map);
      if (kept !== undefined) neutral.push(kept);
    }
  });

  const template: TemplateJs = {
    ast: (at) => {
      const id = fragments.get(spanKey(at));
      return id === undefined ? [] : result.value.ast(id);
    },
    offset: map,
  };
  checkReservedPrefix(clientStatements, map, own);

  const binding = emitBinding(clientStatements);
  const emitCalls: EmitCall[] = [];
  if (binding !== undefined) collectEmitCalls(clientStatements, binding, map, emitCalls);
  // The body is read AFTER the calls are known: each statement is copied with the host
  // spliced into every `emit(...)` it holds (§4.4).
  // The callbacks this component received as cells: reading one is CALLING it (§4.6, step 4),
  // and the names are its own props, so no graph is needed to know them.
  const callbacks = new Set(props.flatMap((p) => (p.channel === 'fn' ? [p.name] : [])));
  const cellReads: number[] = [];
  if (callbacks.size > 0) collectCellReads(clientStatements, callbacks, map, cellReads);
  for (const stmt of clientStatements) {
    readClientStatement(stmt, source, map, client, emitCalls, cellReads);
  }

  return {
    props,
    signals,
    client,
    neutral,
    template,
    mutable: changeableBindings(clientStatements),
    clientNames: topLevelBindings(clientStatements),
    clientFunctions: topLevelFunctions(clientStatements),
    setCalls: setCalls(clientStatements),
    clientImports: importedBindings(allStatements),
    emitCalls,
    diagnostics: [...result.diagnostics, ...own],
  };
}

/**
 * `extractCode` of one resolved component, memoized ON the component itself.
 *
 * The golden rule is one Oxc invocation per FILE, and by now four readers want the same
 * answers about the same `@code`: the server module, the client chunk, the parent that
 * composes its child's positional array (`childProps`), and the effective level of the page
 * (`level.ts`, which asks about every component of the graph). The graph resolves each file
 * to a single `ResolvedComponent`, so a `WeakMap` keyed by it is what keeps that rule intact
 * without any reader having to know about the others.
 */
const codeCache = new WeakMap<ResolvedComponent, ExtractedCode>();

export function codeOf(comp: ResolvedComponent): ExtractedCode {
  const cached = codeCache.get(comp);
  if (cached !== undefined) return cached;
  const code = extractCode(comp.source, comp.doc);
  codeCache.set(comp, code);
  return code;
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

/**
 * A user identifier prefixed with `$` inside `@code { @client }` → `FUD0290` (SDD-15 §4.7).
 *
 * The body of `@client` is copied VERBATIM into the factory closure, where it shares one
 * lexical scope with everything the emit introduces — `$dom`, `$shadow`, `$props`, `$n1`,
 * `$m`, `$s`, `$a`, `$host`. The reservation is what keeps those two vocabularies apart, and
 * it binds the emit too: every name the emit puts in that closure starts with `$`, with no
 * exceptions to remember (BUG-12 §2.5).
 *
 * Prohibited as a PREFIX, not anywhere: `foo$` and `obs$` are the author's, because the emit
 * only ever writes the `$` first. And it is a fact about BINDINGS, which is why it is decided
 * on the AST: `obj.$bar` reaches into somebody else's object and introduces nothing here,
 * a `"$dom"` inside a string is text, and a lexer over the source could tell neither.
 *
 * The emit does not throw: the diagnostic is reported and the region is still copied. What
 * the author gets is the error with its span, in the batch compiler and in the language
 * server alike, instead of a `SyntaxError` from a bundler about a name they never saw.
 */
function checkReservedPrefix(
  statements: readonly OxcNode[],
  map: MapOffset,
  out: Diagnostic[],
): void {
  for (const id of reservedIdentifiers(statements)) {
    out.push(
      errorDiag(
        'FUD0290',
        `"${name(id)}" is reserved: the $ prefix belongs to the identifiers the compiler emits into this scope. Rename it — a trailing $ ("${name(id).slice(1)}$") is yours.`,
        { start: map(id.start), end: map(id.end) },
      ),
    );
  }
}

/** The package `emit` comes from. Anything else of that name is the author's own. */
const DOM_PACKAGE = '@fudic/dom';

/** The framework's own scope: nothing imported from it is a component's reactive state. */
const FRAMEWORK_SCOPE = '@fudic/';

/**
 * The local names `@client` imports from modules that are not the framework's own.
 *
 * A default import and a namespace import count: `import store from './s.js'` and
 * `import * as store from './s.js'` both bind a name the template can read, and neither can
 * be proved non-reactive here. What does not count is a type — `import type { … }` and the
 * per-specifier `import { type X }` — because those are erased before the chunk runs, and
 * subscribing an erased binding is a `ReferenceError` on the first hookup.
 */
function importedBindings(statements: readonly OxcNode[]): readonly string[] {
  const out: string[] = [];
  for (const stmt of statements) {
    if (!is(stmt, 'ImportDeclaration')) continue;
    if (stmt['importKind'] === 'type') continue;
    const from = field(stmt, 'source')!['value'];
    if (typeof from === 'string' && from.startsWith(FRAMEWORK_SCOPE)) continue;
    for (const spec of fieldArray(stmt, 'specifiers')) {
      if (spec['importKind'] === 'type') continue;
      out.push(name(field(spec, 'local')!));
    }
  }
  return out;
}

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
    // A string literal is the whole of v1's resolution. Anything else — an identifier, a
    // template literal, a member expression — leaves the name absent, which is the
    // permissive posture and not a hole to fill by default.
    const literal = is(first, 'Literal') ? first['value'] : undefined;
    out.push({
      calleeEnd: map(callee!.end),
      // With no arguments there is nothing to insert BEFORE, so `$host` goes where the
      // call closes: a `CallExpression` always ends at its `)`.
      hostAt: first === undefined ? map(current.end - 1) : map(first.start),
      hasArgs: first !== undefined,
      ...(typeof literal === 'string' ? { name: literal } : {}),
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
  cellReads: readonly number[],
): void {
  const start = map(stmt.start);
  const { text, splices } = withHost(source.slice(start, map(stmt.end)), start, calls, cellReads);
  if (is(stmt, 'ImportDeclaration')) client.imports.push(text);
  else client.body.push({ text, at: start, splices });
}

/**
 * Every call to a prop that arrived as a CELL, by the offset where its read goes.
 *
 * The walk is generic for the same reason `collectEmitCalls`'s is: what it must never do is
 * match text, and a node it does not know about cannot hide a call. Only a call — `onSave(x)`
 * — is rewritten. A bare `onSave` handed on somewhere else is the cell itself, which is what
 * a component forwarding the callback to its own child has to pass.
 */
function collectCellReads(node: unknown, names: ReadonlySet<string>, map: MapOffset, out: number[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectCellReads(child, names, map, out);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const current = node as OxcNode;
  if (is(current, 'CallExpression')) {
    const callee = field(current, 'callee');
    if (is(callee, 'Identifier') && names.has(name(callee))) out.push(map(callee.end));
  }
  for (const value of Object.values(current)) collectCellReads(value, names, map, out);
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
function withHost(
  text: string,
  offset: number,
  calls: readonly EmitCall[],
  cellReads: readonly number[],
): { text: string; splices: Splice[] } {
  const edits: { at: number; text: string }[] = [];
  for (const call of calls) {
    if (call.calleeEnd <= offset || call.calleeEnd > offset + text.length) continue;
    edits.push({ at: call.calleeEnd - offset, text: '.call' });
    edits.push({ at: call.hostAt - offset, text: call.hasArgs ? '$host, ' : '$host' });
  }
  // The read of a callback that arrived as a cell (BUG-24 §4.6): `onSave(x)` is written
  // `onSave()(x)`, because what the prop holds is the cell and the function is inside it.
  for (const at of cellReads) {
    if (at <= offset || at > offset + text.length) continue;
    edits.push({ at: at - offset, text: '()' });
  }
  edits.sort((a, b) => b.at - a.at);
  const out = edits.reduce((acc, e) => acc.slice(0, e.at) + e.text + acc.slice(e.at), text);
  return { text: out, splices: edits.map((e) => ({ at: e.at, length: e.text.length })) };
}

/**
 * Read every declarator of a statement, and answer which of them the emit does NOT write in a
 * shape of its own.
 *
 * `readDeclarator` recognises exactly two forms — the `props<T>()` destructuring and a
 * `signal(...)`/`computed(...)` — and both of those come out of the emit written differently
 * from how they went in: the props pattern carries its defaults, the reactive is inert on the
 * server and cell-spliced on the client. Copying the source beside them would declare the same
 * name twice, so what this returns is the REST — and it is a per-declarator answer rather than
 * a per-statement one, so that a `const a = 1, n = signal(0)` keeps `a` instead of losing it to
 * a rule that could only say yes or no about the whole line.
 *
 * `undefined` for a statement that declares no variables at all: there is nothing to narrow.
 */
function readDeclarators(
  stmt: OxcNode,
  source: string,
  map: MapOffset,
  props: Prop[],
  signals: Reactive[],
  named: ReadonlyMap<string, OxcNode>,
): readonly OxcNode[] | undefined {
  if (!is(stmt, 'VariableDeclaration')) return undefined;
  const remaining: OxcNode[] = [];
  for (const decl of fieldArray(stmt, 'declarations')) {
    if (!readDeclarator(decl, source, map, props, signals, named)) remaining.push(decl);
  }
  return remaining;
}

/** Statement types that declare a TYPE and nothing else: read by the emit, run by nobody. */
const TYPE_ONLY_STATEMENTS: ReadonlySet<string> = new Set([
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSModuleDeclaration',
  'TSDeclareFunction',
  'TSImportEqualsDeclaration',
]);

/**
 * One neutral statement as the modules need it, or `undefined` when nothing of it travels —
 * because the emit already writes everything it declared, or because it declares only a type.
 */
function neutralStatement(
  stmt: OxcNode,
  remaining: readonly OxcNode[] | undefined,
  source: string,
  map: MapOffset,
): NeutralStatement | undefined {
  const slice = (node: OxcNode): string => source.slice(map(node.start), map(node.end));
  if (remaining !== undefined) {
    if (remaining.length === 0) return undefined; // props / reactives: the emit writes them
    // `remaining` is only defined for a `VariableDeclaration`, and one always has a `kind`.
    const kind = String(stmt['kind']);
    // Rebuilt from the declarators that survived, so a mixed line keeps exactly its own half
    // instead of being lost to a rule that could only say yes or no about the whole thing.
    return { text: `${kind} ${remaining.map(slice).join(', ')};`, hoisted: false };
  }
  if (TYPE_ONLY_STATEMENTS.has(stmt.type)) return undefined;
  if (!is(stmt, 'ImportDeclaration')) return { text: slice(stmt), hoisted: false };
  const value = valueImport(stmt, source, map);
  return value === null ? undefined : { text: value, hoisted: true };
}

/**
 * An import with its type specifiers removed: `null` when everything it names is a type, the
 * verbatim text when nothing is, and a rebuilt one when it mixes the two.
 *
 * The mixed form (`import { type Post, userForm } from './user.form.js'`) is what forces a
 * rebuild rather than a slice: the type specifier sits in the middle of the list, and cutting
 * it out textually means also cutting the comma that belongs to its neighbour.
 */
function valueImport(stmt: OxcNode, source: string, map: MapOffset): string | null {
  if (stmt['importKind'] === 'type') return null;
  const specifiers = fieldArray(stmt, 'specifiers');
  const kept = specifiers.filter((s) => s['importKind'] !== 'type');
  // A side-effect import (`import './reset.css'`) names nothing and still has to travel: it is
  // the one shape `specifiers` is empty for, and dropping it would drop the effect.
  if (kept.length === specifiers.length) return source.slice(map(stmt.start), map(stmt.end));
  if (kept.length === 0) return null;

  // Every specifier has a `local` and every import has a `source`: the grammar says so, and a
  // guard for either would be a branch no input can reach.
  const heads: string[] = [];
  const members: string[] = [];
  // A NAMESPACE specifier is not among these: `import * as ns, { a } from '…'` is not
  // grammatical, so an import that has named specifiers to narrow has no `* as` in it. What is
  // left is the default specifier and the named ones.
  for (const specifier of kept) {
    const local = name(field(specifier, 'local')!);
    if (is(specifier, 'ImportDefaultSpecifier')) {
      heads.push(local);
      continue;
    }
    // The imported name is an identifier, or a STRING — `import { "a-b" as ab }`, the
    // arbitrary module namespace name of ES2022. Both have to survive the rebuild.
    const imported = field(specifier, 'imported')!;
    const from = is(imported, 'Identifier') ? name(imported) : JSON.stringify(imported['value']);
    members.push(from === local ? local : `${from} as ${local}`);
  }
  if (members.length > 0) heads.push(`{ ${members.join(', ')} }`);
  const from = field(stmt, 'source')!;
  return `import ${heads.join(', ')} from ${source.slice(map(from.start), map(from.end))};`;
}

/**
 * Index one statement's named type under its name, when it declares members this file can read.
 *
 * `type Props = { … }` and `interface Props { … }`, exported or not. A type that is imported, or
 * built out of another one (`Omit<…>`, a union, a generic), is deliberately NOT here: resolving
 * those is typechecking, and this pass reads an AST.
 */
function collectNamedType(statement: OxcNode, out: Map<string, OxcNode>): void {
  const stmt = is(statement, 'ExportNamedDeclaration')
    ? field(statement, 'declaration')
    : statement;
  if (stmt === undefined) return;
  const id = field(stmt, 'id');
  if (!is(id, 'Identifier')) return;

  if (is(stmt, 'TSTypeAliasDeclaration')) {
    const body = field(stmt, 'typeAnnotation');
    if (is(body, 'TSTypeLiteral')) out.set(name(id), body);
    return;
  }
  // An interface's members live one level deeper, in its `body`, but they are the same
  // `TSPropertySignature` list a type literal holds — so the reader below is the same one.
  if (is(stmt, 'TSInterfaceDeclaration')) {
    const body = field(stmt, 'body');
    if (is(body, 'TSInterfaceBody')) out.set(name(id), body);
  }
}

/**
 * Route a single `const … = call(...)` declarator to props (ObjectPattern) or reactives, and
 * answer whether it was one of the two — that is, whether the EMIT writes it in a shape of its
 * own and the author's line must not be copied beside it.
 */
function readDeclarator(
  decl: OxcNode,
  source: string,
  map: MapOffset,
  props: Prop[],
  signals: Reactive[],
  named: ReadonlyMap<string, OxcNode>,
): boolean {
  const init = field(decl, 'init');
  const id = field(decl, 'id');
  if (!init || !id || !is(init, 'CallExpression')) return false;
  const callee = field(init, 'callee');
  const called = is(callee, 'Identifier') ? name(callee!) : '';

  if (called === 'props' && is(id, 'ObjectPattern')) {
    const declared = declaredMembers(init, named);
    for (const property of fieldArray(id, 'properties'))
      readProp(property, source, map, props, declared);
    // RECOGNISED, and that is what the answer means — not «it produced something». A
    // `const {} = props<Props>()` declares no prop and is still the emit's to write: copying
    // it into a module would call a `props` that exists nowhere.
    return true;
  }
  if ((called === 'signal' || called === 'computed') && is(id, 'Identifier')) {
    const arg = fieldArray(init, 'arguments')[0];
    // A `computed` with no argument would be a program that cannot run; `undefined` keeps
    // the emit total and lets the author's own tooling say so.
    signals.push({
      name: name(id),
      init: arg ? source.slice(map(arg.start), map(arg.end)) : 'undefined',
      kind: called,
      at: map(init.start),
    });
    return true;
  }
  return false;
}


/**
 * What `props<T>()`'s type argument declares about each of its keys: the `?`, and the channel.
 *
 * `T` is read when it is a type literal, and when it is a NAME this file declares as one —
 * `type Props = { … }` or `interface Props { … }` in the same `@code`. That second case is not
 * a concession: it is what most components are actually written as, and the members are right
 * there in the AST.
 *
 * Empty for everything else — no type argument, a type from another file, one built out of
 * others, an index signature, a key that is not a plain identifier. «Not provable», «not
 * required» and «crosses by value» are the same answer here on purpose: it is what keeps the
 * build from reporting a missing prop it cannot demonstrate is missing, and from moving a
 * crossing it cannot demonstrate the child asked for.
 */
/**
 * The node whose members `T` names, or `undefined` when this file cannot say.
 *
 * One hop and no more: a name resolves to the declaration collected above, and a name that
 * resolves to another name does not chase it. A chain of aliases is a typechecker's job.
 */
function resolveTypeMembers(
  argument: OxcNode | undefined,
  named: ReadonlyMap<string, OxcNode>,
): OxcNode | undefined {
  if (is(argument, 'TSTypeLiteral')) return argument;
  if (!is(argument, 'TSTypeReference')) return undefined;
  const typeName = field(argument, 'typeName');
  // A qualified name (`Ns.Props`) is not something this file declared, and a generic
  // instantiation (`Props<T>`) is not the type its members were written for.
  if (!is(typeName, 'Identifier') || field(argument, 'typeArguments') != null) return undefined;
  return named.get(name(typeName));
}

/** The member list of a type literal or of an interface body — the same signatures, one level apart. */
function members(node: OxcNode): readonly OxcNode[] {
  return fieldArray(node, is(node, 'TSTypeLiteral') ? 'members' : 'body');
}

/** What `T` says about ONE key: whether it is required, and whether it asks for a channel. */
interface DeclaredMember {
  readonly required: boolean;
  readonly channel?: 'signal' | 'fn';
}

/** The type `Signal<T>` is written as. By NAME, because this pass reads an AST, not types. */
const SIGNAL_TYPE = 'Signal';

/**
 * The channel a member's TYPE asks for (props-spec decision 86), or `undefined` for a plain
 * value.
 *
 * Two shapes and no more. `Signal<T>` — by the name, which is the same commitment
 * `reactiveNames` makes about `signal(…)`: what a component declares is read off what it
 * wrote, not off a resolved type, because resolving one is a typechecker's job and this pass
 * has an AST. And a function SIGNATURE, `(x: T) => void`, which is the only way to declare a
 * callback in a type literal — a `Function` or a named alias resolves to nothing here, and
 * nothing is what it marks.
 */
function channelOf(member: OxcNode): 'signal' | 'fn' | undefined {
  // `{ value }` — a member with no type at all — parses, and its annotation comes back as
  // `null`. The `is` check is what makes this total: a key that declares nothing declares no
  // channel either, and the emit does not throw over a `T` the author is halfway through.
  const annotation = field(member, 'typeAnnotation');
  if (!is(annotation, 'TSTypeAnnotation')) return undefined;
  const type = field(annotation, 'typeAnnotation');
  if (is(type, 'TSFunctionType')) return 'fn';
  if (!is(type, 'TSTypeReference')) return undefined;
  const typeName = field(type, 'typeName');
  return is(typeName, 'Identifier') && name(typeName) === SIGNAL_TYPE ? 'signal' : undefined;
}

function declaredMembers(
  call: OxcNode,
  named: ReadonlyMap<string, OxcNode>,
): ReadonlyMap<string, DeclaredMember> {
  const args = field(call, 'typeArguments');
  const argument = args ? fieldArray(args, 'params')[0] : undefined;
  const literal = resolveTypeMembers(argument, named);
  const out = new Map<string, DeclaredMember>();
  if (literal === undefined) return out;
  for (const member of members(literal)) {
    const key = field(member, 'key');
    if (!is(member, 'TSPropertySignature') || !is(key, 'Identifier')) continue;
    const channel = channelOf(member);
    out.set(name(key), {
      required: member['optional'] !== true,
      ...(channel === undefined ? {} : { channel }),
    });
  }
  return out;
}

/** Flatten one `{ a, b = expr }` property, taking the default's source verbatim. */
function readProp(
  property: OxcNode,
  source: string,
  map: MapOffset,
  out: Prop[],
  declared: ReadonlyMap<string, DeclaredMember>,
): void {
  const key = field(property, 'key');
  if (!is(property, 'Property') || !is(key, 'Identifier')) return;
  const propName = name(key);
  const member = declared.get(propName);
  const optional = member === undefined || !member.required;
  const channel = member?.channel === undefined ? {} : { channel: member.channel };
  const value = field(property, 'value');
  if (value && is(value, 'AssignmentPattern')) {
    const right = field(value, 'right')!;
    const def = source.slice(map(right.start), map(right.end));
    out.push({ name: propName, def, optional, ...channel });
  } else {
    out.push({ name: propName, optional, ...channel });
  }
}
