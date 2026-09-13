/**
 * The injection diagnostics that need more than one file (SDD-38 §6.21, §6.22, §6.24).
 *
 * Three of the five, and what they have in common is the reason they are here rather than in
 * `extractCode`: none of them can be answered by the `@code` it is written in. One needs the
 * module next door, one needs to know whether this component hydrates at all, and one needs
 * to know that this file is a route. The other two — a provider registered twice, a provider
 * registered on the side the injection does not run on — are a single `@code` contradicting
 * itself, and they are reported where that region is read.
 *
 * ── `FUD0680` — injecting a service nobody registers ──
 *
 * `inject(Cart)` resolves by walking the container chain and, at the end of it, the root
 * registry — which a module fills by loading: `Service(Cart)` or `provide(Cart, …)`, once,
 * as the one effect a service module has. If nothing anywhere does that, and no component of
 * this page owns `Cart` either, the injection has nothing to find and throws at runtime with
 * the class's name. That is knowable at build time, and this is where it is asked.
 *
 * **One import hop, and the hop is the one the `.fud` itself writes.** The provider is read
 * back to the `import` that bound it, that specifier is resolved and the module is parsed.
 * Nothing beyond it is followed: a service registered in a module the `.fud` does not import
 * directly is out of scope by §7, and gets the runtime error rather than an invented one.
 *
 * **Three silences, and each of them is a rule rather than a gap.**
 *
 * A module that cannot be resolved or read produces nothing. The information is absent, and
 * a diagnostic over an absence would fire on every service outside what this build can see.
 *
 * A provider that is not a class produces nothing. What the injector can serve with no
 * registration at all is a TOKEN, out of the seed the server published (§4.8) — and whether
 * it was published is a fact about a request, not about this file. A class is never seeded,
 * so a class is the only thing this rule can be sure about.
 *
 * A provider some component of the page owns produces nothing. That is the whole of §4.3: a
 * component that declares it is the owner for its subtree, and the root registry is not
 * where it was ever meant to be.
 */

import { parseSync } from 'oxc-parser';
import { errorDiag, type Diagnostic } from '../types/index.js';
import { codeOf, codeOfDocument } from './oxc-code.js';
import { allComponents, type ComponentGraph, type ResolveIo } from './resolve.js';
import { collectTemplateJs } from './constructs.js';
import { hydratableTags, templateOf } from './level.js';
import { freeReferences } from './scope.js';

/** Injecting something no registry will ever hold. */
const FUD_UNREGISTERED_PROVIDER = 'FUD0680';
/** A name the server injected, read by markup the browser re-renders. */
const FUD_SERVER_NAME_IN_TEMPLATE = 'FUD0681';
/** A route reaching for the ambient container, which a route does not have. */
const FUD_ROUTE_AMBIENT_INJECT = 'FUD0683';

/**
 * What a bare specifier may turn into on disk. The `.fud` writes what TypeScript writes —
 * `'../services/cart'` — and the file is one of these; a specifier that already carries its
 * extension is the first candidate and the only one that matches.
 */
const CANDIDATES: readonly string[] = ['', '.ts', '.js', '.mts', '.mjs', '/index.ts', '/index.js'];

/** The module text a specifier names, or `undefined` when this build cannot see it. */
function moduleText(io: ResolveIo, from: string, specifier: string): string | undefined {
  // Relative only: a bare specifier is a package, and a package's registrations are not
  // something a build resolves by joining paths.
  if (!specifier.startsWith('.')) return undefined;
  for (const suffix of CANDIDATES) {
    try {
      return io.read(io.resolve(from, specifier + suffix));
    } catch {
      // Not this candidate. `read` throwing IS the answer, and the loop asks the next one.
    }
  }
  return undefined;
}

/** A node of Oxc's AST, read structurally: this file asks only about shapes it names. */
type Node = Record<string, unknown> & { readonly type: string };

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && typeof (value as Node).type === 'string';

const nameOf = (value: unknown): string | undefined =>
  isNode(value) && value.type === 'Identifier' && typeof value['name'] === 'string'
    ? value['name']
    : undefined;

/** What a module declares as a class, and what it enrols in the root registry. */
interface ModuleFacts {
  readonly classes: ReadonlySet<string>;
  readonly registered: ReadonlySet<string>;
}

/**
 * Read a service module for the two facts this rule needs.
 *
 * Top-level only, because that is where a module's one load-time effect lives: a
 * registration hidden inside a function is not something loading the module performs, and
 * this rule would be guessing about when it runs.
 */
function factsOf(text: string): ModuleFacts {
  const classes = new Set<string>();
  const registered = new Set<string>();
  const parsed = parseSync('service.ts', text, { lang: 'ts', sourceType: 'module' });
  for (const statement of parsed.program.body as unknown as Node[]) {
    const node = statement.type === 'ExportNamedDeclaration' ? statement['declaration'] : statement;
    if (!isNode(node)) continue;
    if (node.type === 'ClassDeclaration') {
      // A class declared at top level carries its name — an anonymous one is only legal as
      // `export default`, which is not a statement this loop ever sees as a declaration.
      const declared = String((node['id'] as Node)['name']);
      classes.add(declared);
      // `@Service class C {}` — the standard decorator, enrolling the class it is on. Oxc
      // gives every class its decorator list, empty when it has none.
      for (const decorator of node['decorators'] as unknown[]) {
        if (isNode(decorator) && nameOf(decorator['expression']) === 'Service') {
          registered.add(declared);
        }
      }
      continue;
    }
    if (node.type !== 'ExpressionStatement') continue;
    const call = node['expression'];
    if (!isNode(call) || call.type !== 'CallExpression') continue;
    const callee = nameOf(call['callee']);
    if (callee !== 'Service' && callee !== 'provide') continue;
    // `Service(C)` and `provide(C, …)` name what they enrol in their first argument, which
    // is the same place `inject(C)` names what it asks for.
    const first = (call['arguments'] as unknown[] | undefined)?.[0];
    const enrolled = nameOf(first);
    if (enrolled !== undefined) registered.add(enrolled);
  }
  return { classes, registered };
}

/** Every provider expression some component of this page declares, in any zone. */
function providedByGraph(graph: ComponentGraph): ReadonlySet<string> {
  const out = new Set<string>();
  for (const comp of allComponents(graph)) {
    for (const call of codeOf(comp).di) {
      if (call.kind === 'provide') out.add(call.provider);
    }
  }
  return out;
}

/**
 * The injection diagnostics a resolved graph can answer (SDD-38 §6.21–§6.24, minus the two
 * a single `@code` settles by itself — those are `extractCode`'s, next to the region it
 * reads).
 *
 * They belong to whoever resolved the graph and holds the I/O — the build — for the same
 * reason the contract diagnostics do: no single file can answer them, and an editor that
 * supplies no way to read the neighbouring module gets silence rather than a wrong answer.
 * None of them stops the emit: the module is written degraded, exactly as §6.26 asks.
 */
export function injectionDiagnostics(graph: ComponentGraph, io: ResolveIo): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  unregisteredProviders(graph, io, out);
  serverNamesInTemplates(graph, out);
  routeAmbientInjections(graph, out);
  return out;
}

/**
 * `FUD0681` — a name injected in `@server`, read by a binding of a template that hydrates.
 *
 * `@server` is emitted into the `.mjs` and nowhere else; the browser chunk of the same
 * component carries its template bindings and not one line of that region. So a binding that
 * reads such a name paints correctly on the server and then, on the first `set`, re-evaluates
 * against an identifier the chunk never declared. It is a `ReferenceError` in the browser
 * with nothing in the build to explain it, which is why the build says it here instead.
 *
 * Only a component that HYDRATES, because that is the whole condition: a level-1 component
 * has no chunk, the server painted its binding once, and the name it read was there.
 */
function serverNamesInTemplates(graph: ComponentGraph, out: Diagnostic[]): void {
  // Computed at most once, and only if some component of the graph injects in `@server` at
  // all — the fixed point walks the whole graph, and almost no page has anything to ask it.
  let hydratable: ReadonlySet<string> | undefined;
  for (const comp of allComponents(graph)) {
    const code = codeOf(comp);
    const injected = new Set<string>();
    for (const call of code.di) {
      if (call.kind === 'inject' && call.zone === 'server' && call.binds !== undefined) {
        injected.add(call.binds);
      }
    }
    if (injected.size === 0) continue;
    hydratable ??= hydratableTags(graph);
    if (!hydratable.has(comp.tag)) continue;
    collectTemplateJs(templateOf(comp), (_kind, at) => {
      // A degraded header needs no guard of its own: the walk that fed Oxc skipped it, so
      // there is no fragment under that span and an empty AST reads nothing.
      const read = freeReferences([code.template.ast(at)]).find((name) => injected.has(name));
      if (read === undefined) return;
      out.push(
        errorDiag(
          FUD_SERVER_NAME_IN_TEMPLATE,
          `\`${read}\` is injected in @server and read by a binding of a component that hydrates: @server never reaches the browser chunk, so the first update throws on a name that is not there.`,
          at,
        ),
      );
    });
  }
}

/**
 * `FUD0683` — `inject(…)` written in the `@server` of a route.
 *
 * There is no ambient container in a route and there cannot be one. `load(ctx)` is the only
 * `async` function of the system, and an ambient container across an `await` is not an error
 * anybody sees: it is silent contamination between concurrent requests, in dev and in the
 * prerender alike, with no `AsyncLocalStorage` in a Service Worker to paper over one end.
 * So a route resolves explicitly, through `ctx.inject(…)`, and this is where writing the
 * other thing gets said out loud.
 *
 * It reads the SAME extraction the route's two emitters read (SDD-39 §4.1). Until then a
 * route never went through `extractCode`, so this question had an Oxc invocation of its own;
 * now that its `@code` is split like a component's, asking twice would be a second parse of
 * one file — which is the golden rule, not an optimisation.
 */
function routeAmbientInjections(graph: ComponentGraph, out: Diagnostic[]): void {
  const entry = graph.entry;
  if (entry.type !== 'page-document' && entry.type !== 'route-document') return;
  // Nothing to read when the file has no server region: `inject` written anywhere else in a
  // route is a different question, and not one this SDD owns.
  if (!(entry.code?.parts ?? []).some((part) => part.type === 'server-region')) return;
  for (const call of codeOfDocument(graph.entrySource, entry).di) {
    if (call.kind !== 'inject' || call.zone !== 'server') continue;
    out.push(
      errorDiag(
        FUD_ROUTE_AMBIENT_INJECT,
        `A route resolves through \`ctx.inject(…)\`: \`load(ctx)\` is the only async function of the system and takes no ambient container, so \`inject(…)\` here has none to read.`,
        call.providerSpan,
      ),
    );
  }
}

/** `FUD0680` for every component of a resolved graph. */
function unregisteredProviders(graph: ComponentGraph, io: ResolveIo, out: Diagnostic[]): void {
  // Asked of a PAGE and never of a component on its own, and that is forced rather than
  // chosen: whether an ancestor owns this provider is a fact about the tree, and a component
  // compiled by itself — which is how the plugin compiles every `.fud` — has no tree. Its own
  // graph holds it and its descendants, so the owner above it is invisible from there and
  // every legitimate `inject` of a component-owned service would be reported. A page's graph
  // is the whole of what it renders, so from there the question has an answer.
  if (graph.entry.type === 'component-document') return;
  const owned = providedByGraph(graph);
  /** One read and one parse per module, however many components inject out of it. */
  const facts = new Map<string, ModuleFacts | null>();

  for (const comp of allComponents(graph)) {
    for (const call of codeOf(comp).di) {
      if (call.kind !== 'inject') continue;
      if (call.from === undefined || owned.has(call.provider)) continue;
      const key = `${comp.path} ${call.from}`;
      let known = facts.get(key);
      if (known === undefined) {
        const text = moduleText(io, comp.path, call.from);
        known = text === undefined ? null : factsOf(text);
        facts.set(key, known);
      }
      if (known === null) continue;
      // Only a class: everything else this module exports may reach the injector through the
      // seed, and a rule that cannot tell those apart would report the seed as an error.
      if (!known.classes.has(call.provider) || known.registered.has(call.provider)) continue;
      out.push(
        errorDiag(
          FUD_UNREGISTERED_PROVIDER,
          `Nothing registers \`${call.provider}\`: its module neither calls \`Service(${call.provider})\` nor \`provide(${call.provider}, …)\`, and no component provides it`,
          call.providerSpan,
        ),
      );
    }
  }
}
