/**
 * The injection diagnostics that need more than one file (SDD-38 §6.21, §6.22).
 *
 * One of them, and the reason it is here rather than in `extractCode`: it cannot be answered by
 * the `@code` it is written in, it needs the module next door. (`FUD0683` — `inject` in a
 * route's `@server` — was retired by SDD-56, and `FUD0681` — a name injected in `@server` read
 * by a hydrating binding — by SDD-60, with the regions.) A provider registered twice is a single
 * `@code` contradicting itself, and it is reported where that `@code` is read.
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
import type { Diagnostic } from '../types/index.js';
import { FUD0680 } from '@fudic/diagnostics';
import { codeOf } from './oxc-code.js';
import { allComponents, type ComponentGraph, type ResolveIo } from './resolve.js';

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
 * The injection diagnostic a resolved graph can answer (SDD-38 §6.21).
 *
 * It belongs to whoever resolved the graph and holds the I/O — the build — for the same
 * reason the contract diagnostics do: no single file can answer it, and an editor that
 * supplies no way to read the neighbouring module gets silence rather than a wrong answer.
 * It does not stop the emit: the module is written degraded, exactly as §6.26 asks.
 */
export function injectionDiagnostics(graph: ComponentGraph, io: ResolveIo): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  unregisteredProviders(graph, io, out);
  return out;
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
      out.push(FUD0680({ span: call.providerSpan, provider: call.provider }));
    }
  }
}
