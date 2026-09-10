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
import type { CodeBlockNode } from '../code/index.js';
import type { ResolvedComponent } from './resolve.js';
import type { Diagnostic, Span } from '../types/index.js';
import { errorDiag, isEmptySpan, span } from '../types/index.js';
import { JsBatch, type OxcNode } from '../oxc/index.js';
import { collectTemplateJs } from './constructs.js';
import {
  changeableBindings,
  freeReferences,
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

/** One edit already applied to a statement's text, by how much it moved what follows. */
export interface Splice {
  readonly at: number;
  /** The characters gained — NEGATIVE when the edit replaced more than it wrote. */
  readonly length: number;
}

/**
 * One `inject(...)` or `provide(...)` written in a `@code`, in SOURCE coordinates
 * (SDD-38 §3.4).
 *
 * By offset and never by text, for the same reason `emit(…)` is: the body of a region is
 * copied verbatim, so an `"inject("` inside a string and a `// inject(` in a comment are
 * not calls — and `import { inject as ask }` is legal, after which the name to rewrite is
 * `ask`. Both facts are the AST's to state.
 */
export interface DiCall {
  readonly kind: 'inject' | 'provide';
  /** The zone it was written in — the zone decides where it runs (SDD-38 §4.1). */
  readonly zone: CodeZone;
  /** The provider expression's source, verbatim: `Cart`, `LOCALE`. */
  readonly provider: string;
  /** Where that expression is, in SOURCE coordinates: the span a diagnostic points at. */
  readonly providerSpan: Span;
  /**
   * The module specifier the provider's leading identifier was imported from, when it was
   * imported at all. It is the one import hop a build follows to ask whether anybody
   * registers this class — and its absence is why a locally declared provider is never
   * reported (SDD-38 §6.21).
   */
  readonly from?: string;
  /**
   * The name this call was declared INTO, when it was the whole initialiser of one:
   * `db` in `const db = inject(Db)`. Absent for a call written anywhere else, because
   * only a name a region binds can be read from somewhere the region does not reach.
   */
  readonly binds?: string;
  /** Start of the callee identifier, and of the `(` after it: the rewrite is a prefix splice. */
  readonly at: number;
  readonly open: number;
}

/** Which of the three zones of `@code` a statement was written in (SDD-08 §4.2). */
export type CodeZone = 'neutral' | 'server' | 'client';

/**
 * The top-level statements of one zone, split where the JS module grammar forces it: an
 * `import` is only legal at module scope, and everything else belongs inside the function
 * the zone is emitted into.
 *
 * The same shape as `ClientCode`, and deliberately so — three zones, one way of carrying
 * their text, so no emitter has to learn a second one.
 */
export interface ZoneCode {
  readonly imports: string[];
  readonly body: ClientStatement[];
}

/** The `@server` region of a COMPONENT, which until SDD-38 reached nowhere at all. */
export type ServerCode = ZoneCode;

/** The neutral zone's DI lines, once per branch: the two differ only by the `provide`s. */
export interface NeutralCode {
  /** Everything that injects or provides. */
  readonly server: ZoneCode;
  /** Only what injects. */
  readonly client: ZoneCode;
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
   * Every `emit(...)` of `@client` (§4.4), as the walk finds them — the patches are applied
   * by descending offset, so the order they arrive in is not one of. Empty when the
   * component does
   * not import `emit` from `@fudic/dom`, and that is the whole test: a raw
   * `host.dispatchEvent(...)` is valid DOM and stays untouched, because it does not
   * participate in directed hydration — which is exactly the distinction `emit` buys.
   */
  readonly emitCalls: readonly EmitCall[];
  /**
   * Every `inject`/`provide` of this `@code`, in source order (SDD-38 §3.4).
   *
   * Empty when the component does not import them from `@fudic/di`, and that is the whole
   * test — a local function of the same name is the author's, and a DI call is a fact about
   * bindings rather than about a word.
   */
  readonly di: readonly DiCall[];
  /**
   * The `@server` region's top-level statements, with the DI calls already rewritten
   * (SDD-38 §4.1). Empty for the components — every one of them until now — that write none.
   */
  readonly server: ServerCode;
  /**
   * The NEUTRAL statements that hold a DI call, once per branch that runs them.
   *
   * The neutral zone has never been emitted: it is mined for `props<T>()` and for the
   * reactive declarations, and the rest of it reaches neither branch. What SDD-38 adds is
   * exactly the statements that inject or provide, because those run on both sides — and
   * nothing else, so a component that writes no DI emits the same bytes it emitted before.
   *
   * The two lists differ by one rule: **a `provide` never reaches the browser.** The owning
   * ancestor may be N1 and have no chunk at all, so its factory cannot live inside it — it
   * lives in the route's IoC module, which is downloaded only if somebody on that route
   * injects (SDD-38 §4.5).
   */
  readonly neutral: NeutralCode;
  /**
   * The statements that REGISTER and run in a browser — the neutral zone's and `@client`'s
   * — with the imports they reference (SDD-38 §4.5).
   *
   * They are what the component's IoC module is built out of, and the reason there is one:
   * the owning ancestor may be N1, with no chunk at all, so its factory cannot live inside
   * it. It lives beside it, in a module that is fetched only when the page publishes a map
   * that names this tag.
   */
  readonly providers: ZoneCode;
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
  const serverStatements: OxcNode[] = [];
  const neutralStatements: OxcNode[] = [];
  ids.forEach((id, i) => {
    const root = result.value.ast(id);
    const stmts = Array.isArray(root) ? (root as OxcNode[]) : [root as OxcNode];
    const zone = zoneOf(parts[i]!.type);
    for (const stmt of stmts) {
      if (zone === 'client') clientStatements.push(stmt);
      else {
        if (zone === 'server') serverStatements.push(stmt);
        else neutralStatements.push(stmt);
        checkNeutralEffect(stmt, map, own);
      }
      if (!is(stmt, 'VariableDeclaration')) continue;
      for (const decl of fieldArray(stmt, 'declarations')) {
        readDeclarator(decl, source, map, props, signals, named);
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

  // The DI calls of the THREE zones, in one pass over the bindings `@fudic/di` was imported
  // under. The names are gathered across the whole `@code` because the zones are fragments
  // of one module: an `import { inject }` written in the neutral chunk is the binding a
  // `@server` region three lines down is calling.
  const di: DiCall[] = [];
  const allStatements = [...neutralStatements, ...serverStatements, ...clientStatements];
  const bindings = diBindings(allStatements);
  const rewritten = new Set(bindings.keys());
  if (bindings.size > 0) {
    const imports = importSources(allStatements);
    const scan = { bindings, imports, source, map, out: di };
    collectDiCalls(neutralStatements, { ...scan, zone: 'neutral' });
    collectDiCalls(serverStatements, { ...scan, zone: 'server' });
    collectDiCalls(clientStatements, { ...scan, zone: 'client' });
    checkDiZones(di, own);
  }
  const diEdits = di.map(rewriteOf);

  for (const stmt of clientStatements) {
    // A `provide` written in `@client` is not part of the chunk: it belongs to the IoC
    // module like every other registration, and `$own` — the container it registers into —
    // does not exist on this side at all.
    if (holdsDi(stmt, map, di, 'client', 'provide')) continue;
    readClientStatement(stmt, source, map, client, emitCalls, cellReads, diEdits);
  }

  return {
    props,
    signals,
    client,
    template,
    mutable: changeableBindings(clientStatements),
    clientNames: topLevelBindings(clientStatements),
    clientFunctions: topLevelFunctions(clientStatements),
    setCalls: setCalls(clientStatements),
    emitCalls,
    di,
    server: zoneCode(serverStatements, source, map, diEdits, () => true, rewritten),
    // Only the statements that hold a DI call, so a component that writes none emits the
    // same bytes it emitted before this SDD existed.
    neutral: {
      server: zoneCode(
        neutralStatements,
        source,
        map,
        diEdits,
        (stmt) => holdsDi(stmt, map, di, 'neutral'),
        rewritten,
      ),
      client: zoneCode(
        neutralStatements,
        source,
        map,
        diEdits,
        (stmt) => holdsDi(stmt, map, di, 'neutral', 'inject'),
        rewritten,
      ),
    },
    providers: mergeZones(
      zoneCode(
        neutralStatements,
        source,
        map,
        diEdits,
        (stmt) => holdsDi(stmt, map, di, 'neutral', 'provide'),
        rewritten,
      ),
      zoneCode(
        clientStatements,
        source,
        map,
        diEdits,
        (stmt) => holdsDi(stmt, map, di, 'client', 'provide'),
        rewritten,
      ),
    ),
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
 * The DI calls of a `@code` that is NOT a component's — a page's, a route's, a layout's.
 *
 * Those three roles never reach `extractCode`: they declare no props, no reactive names and
 * no client region, and their `@code` is the `?server` module the plugin copies out verbatim.
 * So this is the one and only Oxc invocation such a file gets, and it exists for one question
 * — is somebody calling `inject(…)` where `ctx.inject(…)` is the only thing that works
 * (SDD-38 §6.24) — asked by reading the AST, because a `// inject(` in a comment is not a call.
 */
export function extractDiCalls(source: string, code: CodeBlockNode | undefined): readonly DiCall[] {
  const parts = code?.parts ?? [];
  if (parts.length === 0) return [];
  const batch = new JsBatch(source);
  const ids = parts.map((p) => batch.add('module-statements', p.js));
  const result = batch.parse();
  const map = result.value.mapOffset;

  const byZone: Record<CodeZone, OxcNode[]> = { neutral: [], server: [], client: [] };
  ids.forEach((id, i) => {
    // A `module-statements` fragment is a LIST of top-level statements, always — that is
    // what the kind means, and the batch has no other shape to hand back for it.
    byZone[zoneOf(parts[i]!.type)].push(...(result.value.ast(id) as readonly OxcNode[]));
  });

  const all = [...byZone.neutral, ...byZone.server, ...byZone.client];
  const bindings = diBindings(all);
  if (bindings.size === 0) return [];
  const out: DiCall[] = [];
  const scan = { bindings, imports: importSources(all), source, map, out };
  for (const zone of ['neutral', 'server', 'client'] as const) {
    collectDiCalls(byZone[zone], { ...scan, zone });
  }
  return out;
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
  di: readonly Edit[],
): void {
  const start = map(stmt.start);
  const edits = [...hostEdits(calls), ...cellEdits(cellReads), ...di];
  const { text, splices } = applyEdits(source.slice(start, map(stmt.end)), start, edits);
  if (is(stmt, 'ImportDeclaration')) client.imports.push(text);
  else client.body.push({ text, at: start, splices });
}

/** The zone a `@code` part belongs to — the only place the node type becomes a zone. */
function zoneOf(type: string): CodeZone {
  if (type === 'client-region') return 'client';
  return type === 'server-region' ? 'server' : 'neutral';
}

/** The package `inject` and `provide` come from. Anything else of that name is the author's. */
const DI_PACKAGE = '@fudic/di';

/**
 * The local names `inject` and `provide` were imported under, mapped back to which one they
 * are. `import { inject as ask }` is legal JS and then the name to rewrite is `ask`.
 */
function diBindings(statements: readonly OxcNode[]): ReadonlyMap<string, DiCall['kind']> {
  const out = new Map<string, DiCall['kind']>();
  for (const stmt of statements) {
    if (!is(stmt, 'ImportDeclaration') || field(stmt, 'source')!['value'] !== DI_PACKAGE) continue;
    for (const spec of fieldArray(stmt, 'specifiers')) {
      const imported = field(spec, 'imported');
      if (imported === undefined) continue; // a default or namespace specifier imports no NAME
      const what = name(imported);
      if (what === 'inject' || what === 'provide') out.set(name(field(spec, 'local')!), what);
    }
  }
  return out;
}

/**
 * Every call of one of those bindings, however deep — a `provide` inside an `@if` header is
 * as much a registration as one at the top of the region. The walk is generic for the same
 * reason `collectEmitCalls`'s is: what it must never do is match text, and a node it does not
 * know about cannot hide a call.
 */
function collectDiCalls(node: unknown, scan: DiScan, binds?: string): void {
  if (Array.isArray(node)) {
    for (const child of node) collectDiCalls(child, scan, binds);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const current = node as OxcNode;
  const { source, map } = scan;
  const callee = is(current, 'CallExpression') ? field(current, 'callee') : undefined;
  const kind = is(callee, 'Identifier') ? scan.bindings.get(name(callee)) : undefined;
  if (kind !== undefined) {
    const first = fieldArray(current, 'arguments')[0];
    const at = map(callee!.start);
    const providerSpan =
      first === undefined ? span(at, at) : span(map(first.start), map(first.end));
    // The LEADING identifier, because that is the binding an import declares: `services.Cart`
    // is imported as `services`, and what a build can ask about is the module it came from.
    const root = first === undefined ? undefined : rootIdentifier(first);
    const from = root === undefined ? undefined : scan.imports.get(root);
    scan.out.push({
      kind,
      zone: scan.zone,
      // Verbatim, because the provider is an EXPRESSION the route's IoC module has to write
      // back out: `Cart`, `LOCALE`, `services.Cart`. Reading it as a name would lose the
      // second and the third.
      provider: first === undefined ? '' : source.slice(providerSpan.start, providerSpan.end),
      providerSpan,
      ...(from === undefined ? {} : { from }),
      ...(binds === undefined ? {} : { binds }),
      at,
      open: source.indexOf('(', map(callee!.end)),
    });
  }
  // A declarator hands its name DOWN, and only into its initialiser: `const db = inject(Db)`
  // binds `db`, and the arguments of that same call bind nothing. One level and no further,
  // because a call buried inside a lambda runs when the lambda does, not when the region loads.
  const declared = is(current, 'VariableDeclarator') ? declaredName(current) : undefined;
  for (const [key, value] of Object.entries(current)) {
    collectDiCalls(value, scan, key === 'init' ? declared : undefined);
  }
}

/** Everything one zone's walk needs, so the recursion carries a context and not a parameter list. */
interface DiScan {
  readonly bindings: ReadonlyMap<string, DiCall['kind']>;
  readonly imports: ReadonlyMap<string, string>;
  readonly zone: CodeZone;
  readonly source: string;
  readonly map: MapOffset;
  readonly out: DiCall[];
}

/** The name a declarator declares, when it declares a plain one: a pattern destructures. */
function declaredName(declarator: OxcNode): string | undefined {
  const id = field(declarator, 'id');
  return is(id, 'Identifier') ? name(id) : undefined;
}

/**
 * The name at the head of a provider expression: `Cart` in `Cart`, and in `services.Cart`.
 * Anything else — a call, a literal, a template — has no binding to follow, and `undefined`
 * is what says so.
 */
function rootIdentifier(node: OxcNode): string | undefined {
  if (is(node, 'Identifier')) return name(node);
  // A member expression always has an object — that is what makes it one — so the recursion
  // has no missing case to guard against.
  if (is(node, 'MemberExpression')) return rootIdentifier(field(node, 'object')!);
  return undefined;
}

/**
 * The two contradictions a single `@code` can hold on its own (SDD-38 §6.23, §6.25).
 *
 * Both are asked HERE and not of the graph, because both are answered by one file: they are
 * about what this `@code` says against itself, and no ancestor can make either of them true
 * or false. Neither stops the emit — the module is written degraded and the browser gets the
 * runtime error it would have got anyway, which is the whole point of reporting it first.
 *
 * `FUD0684` — the same provider registered twice. The second registration silently replaces
 * the first, so one of the two factories is dead code and the author cannot tell which.
 *
 * `FUD0682` — a provider registered on ONE side and injected on the other. The two lines
 * never run in the same process, so the registration this injection was written for is not
 * there when it asks. The neutral zone is never a mismatch, on either end: it runs on both
 * sides, which is exactly what makes it the answer to this diagnostic.
 */
function checkDiZones(di: readonly DiCall[], out: Diagnostic[]): void {
  const provideZones = new Map<string, Set<CodeZone>>();
  for (const call of di) {
    if (call.kind !== 'provide' || call.provider === '') continue;
    const seen = provideZones.get(call.provider);
    if (seen === undefined) {
      provideZones.set(call.provider, new Set([call.zone]));
      continue;
    }
    seen.add(call.zone);
    out.push(
      errorDiag(
        'FUD0684',
        `\`${call.provider}\` is provided twice in this @code: the second registration replaces the first, and one of the two factories never runs.`,
        call.providerSpan,
      ),
    );
  }
  for (const call of di) {
    if (call.kind !== 'inject' || call.zone === 'neutral') continue;
    const zones = provideZones.get(call.provider);
    // Only when the file provides it and provides it NOWHERE this injection runs. A provider
    // this file does not write at all is an ancestor's or a `@Service`'s, and that is FUD0680's
    // question — asked of the graph, with the module next door open.
    if (zones === undefined || zones.has('neutral') || zones.has(call.zone)) continue;
    const there = call.zone === 'client' ? '@server' : '@client';
    out.push(
      errorDiag(
        'FUD0682',
        `\`${call.provider}\` is injected in @${call.zone} but this @code only provides it in ${there}: the two never run on the same side. Move the provider to the neutral zone to have it on both.`,
        call.providerSpan,
      ),
    );
  }
}

/**
 * Every name an `import` of this `@code` binds, mapped to the module it came from.
 *
 * Named, default and namespace specifiers alike: what the caller asks is «where does this
 * name come from», and all three answer it.
 */
function importSources(statements: readonly OxcNode[]): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const stmt of statements) {
    if (!is(stmt, 'ImportDeclaration')) continue;
    // The source of an import is a string literal by grammar: there is no other shape to
    // tell apart, the way `diBindings` reads the very same field.
    const specifier = String(field(stmt, 'source')!['value']);
    for (const spec of fieldArray(stmt, 'specifiers')) {
      out.set(name(field(spec, 'local')!), specifier);
    }
  }
  return out;
}

/**
 * The container each form resolves against, and the name it is written under (SDD-38 §4.6).
 *
 * `$ioc` is the container this component resolves FROM — the one its ancestor handed it, or,
 * when it declares providers of its own, the one it owns. `$own` is that owned container,
 * and only a component that declares a provider has one. Both are inside the `$` reserve of
 * SDD-15 §4.7, so the author cannot collide with either.
 */
const DI_TARGET: Readonly<Record<DiCall['kind'], string>> = {
  inject: 'injectFrom($ioc, ',
  provide: 'provideIn($own, ',
};

/** The prefix splice one DI call turns into: `inject(` → `injectFrom($ioc, `. */
function rewriteOf(call: DiCall): Edit {
  return { at: call.at, remove: call.open + 1 - call.at, text: DI_TARGET[call.kind] };
}

/** Whether a statement of `zone` contains a DI call — by offset, never by text. */
function holdsDi(
  stmt: OxcNode,
  map: MapOffset,
  di: readonly DiCall[],
  zone: CodeZone,
  kind?: DiCall['kind'],
): boolean {
  const start = map(stmt.start);
  const end = map(stmt.end);
  return di.some(
    (c) =>
      c.zone === zone && (kind === undefined || c.kind === kind) && c.at >= start && c.at < end,
  );
}

/** Two zones' worth of the same thing, in source order, with the imports deduplicated. */
function mergeZones(first: ZoneCode, second: ZoneCode): ZoneCode {
  return {
    imports: [...new Set([...first.imports, ...second.imports])],
    body: [...first.body, ...second.body].sort((a, b) => a.at - b.at),
  };
}

/**
 * The helpers a branch has to import from `@fudic/di` for the calls it emits.
 *
 * The author imported `inject` and `provide`; what the rewrite wrote is `injectFrom` and
 * `provideIn`, so the import that covers the emitted text is this one and not theirs — which
 * still travels with its zone, unused and shaken out.
 */
export function diHelpers(
  di: readonly DiCall[],
  keep: (call: DiCall) => boolean,
): readonly string[] {
  const out: string[] = [];
  for (const call of di) {
    if (!keep(call)) continue;
    const helper = call.kind === 'inject' ? 'injectFrom' : 'provideIn';
    if (!out.includes(helper)) out.push(helper);
  }
  return out.sort();
}

/** The local names an `import` declaration binds. Empty for a bare `import 'side-effect.js'`. */
function importBindings(declaration: OxcNode): readonly string[] {
  return fieldArray(declaration, 'specifiers').map((spec) => name(field(spec, 'local')!));
}

/**
 * One zone's top-level statements as text, with the DI calls already rewritten.
 *
 * `keep` decides which non-import statements survive: everything, for `@server`, whose whole
 * region is emitted; only the ones that hold a DI call, for the neutral zone, which has never
 * been emitted and must not start emitting anything else now.
 *
 * An import survives when one of the kept statements references it — or when it binds nothing
 * at all, because a bare `import '../services/cart.js'` is imported precisely for the one
 * effect a service module has: enrolling itself in the root registry.
 */
function zoneCode(
  statements: readonly OxcNode[],
  source: string,
  map: MapOffset,
  di: readonly Edit[],
  keep: (stmt: OxcNode) => boolean,
  rewritten: ReadonlySet<string> = new Set(),
): ZoneCode {
  const imports: OxcNode[] = [];
  const kept: OxcNode[] = [];
  for (const stmt of statements) {
    if (is(stmt, 'ImportDeclaration')) imports.push(stmt);
    else if (keep(stmt)) kept.push(stmt);
  }
  if (kept.length === 0) return { imports: [], body: [] };
  // The names the rewrite consumed do not count as references: `inject(Cart)` became
  // `injectFrom($ioc, Cart)`, so the author's `import { inject }` covers nothing the emitted
  // text says, and the emit writes the import it does need itself.
  const referenced = new Set(freeReferences(kept).filter((name) => !rewritten.has(name)));
  const text = (stmt: OxcNode): ClientStatement => {
    const start = map(stmt.start);
    const applied = applyEdits(source.slice(start, map(stmt.end)), start, di);
    return { text: applied.text, at: start, splices: applied.splices };
  };
  return {
    imports: imports
      .filter((imp) => {
        const bound = importBindings(imp);
        return bound.length === 0 || bound.some((n) => referenced.has(n));
      })
      .map((imp) => text(imp).text),
    body: kept.map(text),
  };
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
interface Edit {
  /** Where it lands, in SOURCE coordinates. */
  readonly at: number;
  /** How many characters it replaces. `0` for an insertion, which most of them are. */
  readonly remove: number;
  readonly text: string;
}

/** `emit('x', d)` → `emit.call($host, 'x', d)`, as two insertions per call. */
function hostEdits(calls: readonly EmitCall[]): Edit[] {
  return calls.flatMap((call) => [
    { at: call.calleeEnd, remove: 0, text: '.call' },
    { at: call.hostAt, remove: 0, text: call.hasArgs ? '$host, ' : '$host' },
  ]);
}

/**
 * The read of a callback that arrived as a cell (BUG-24 §4.6): `onSave(x)` is written
 * `onSave()(x)`, because what the prop holds is the cell and the function is inside it.
 */
function cellEdits(cellReads: readonly number[]): Edit[] {
  return cellReads.map((at) => ({ at, remove: 0, text: '()' }));
}

/**
 * Apply every edit that falls inside one statement's text, back to front.
 *
 * Back to front and never as a `replace` over the source: an `emit` inside a string or a
 * comment is not a call, and an edit nested in another one's arguments must not move the
 * offsets of the edit around it.
 *
 * The `splices` come back so a LATER pass — the one that knows the graph, and therefore
 * which names occupy a cell (BUG-24 §4.4) — can land on a character rather than on where
 * the author's source used to have one. A splice's length is what the edit GAINED, so a
 * rewrite that replaces more than it writes carries a negative one and moves what follows
 * backwards, which is exactly what it did.
 */
function applyEdits(
  text: string,
  offset: number,
  edits: readonly Edit[],
): { text: string; splices: Splice[] } {
  const inside = edits
    .filter((e) => e.at >= offset && e.at + e.remove <= offset + text.length)
    .map((e) => ({ at: e.at - offset, remove: e.remove, text: e.text }))
    .sort((a, b) => b.at - a.at);
  const out = inside.reduce(
    (acc, e) => acc.slice(0, e.at) + e.text + acc.slice(e.at + e.remove),
    text,
  );
  return { text: out, splices: inside.map((e) => ({ at: e.at, length: e.text.length - e.remove })) };
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

/** Route a single `const … = call(...)` declarator to props (ObjectPattern) or reactives. */
function readDeclarator(
  decl: OxcNode,
  source: string,
  map: MapOffset,
  props: Prop[],
  signals: Reactive[],
  named: ReadonlyMap<string, OxcNode>,
): void {
  const init = field(decl, 'init');
  const id = field(decl, 'id');
  if (!init || !id || !is(init, 'CallExpression')) return;
  const callee = field(init, 'callee');
  const called = is(callee, 'Identifier') ? name(callee!) : '';

  if (called === 'props' && is(id, 'ObjectPattern')) {
    const declared = declaredMembers(init, named);
    for (const property of fieldArray(id, 'properties'))
      readProp(property, source, map, props, declared);
  } else if ((called === 'signal' || called === 'computed') && is(id, 'Identifier')) {
    const arg = fieldArray(init, 'arguments')[0];
    // A `computed` with no argument would be a program that cannot run; `undefined` keeps
    // the emit total and lets the author's own tooling say so.
    signals.push({
      name: name(id),
      init: arg ? source.slice(map(arg.start), map(arg.end)) : 'undefined',
      kind: called,
      at: map(init.start),
    });
  }
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
