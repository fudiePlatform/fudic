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
import { JsBatch, type OxcNode } from '../oxc/index.js';

/** One destructured prop from `props<T>()`, with its default expression source if any. */
export interface Prop {
  readonly name: string;
  readonly def?: string;
}

/** One `const x = signal(init)` declaration; `init` is the initial-value source. */
export interface Signal {
  readonly name: string;
  readonly init: string;
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

export interface ExtractedCode {
  readonly props: Prop[];
  readonly signals: Signal[];
  readonly client: ClientCode;
}

// ── Typed access over the untyped Oxc node (the only place that indexes by name) ──
const is = (node: OxcNode | undefined, type: string): boolean => node?.type === type;
const field = (node: OxcNode, key: string): OxcNode | undefined => node[key] as OxcNode | undefined;
const fieldArray = (node: OxcNode, key: string): OxcNode[] => (node[key] as OxcNode[] | undefined) ?? [];
const name = (node: OxcNode): string => String(node['name']);

type MapOffset = (bufferOffset: number) => number;

/**
 * Extract, in ONE Oxc invocation for the whole file, everything the two emit branches need
 * out of `@code`: the `props<T>()` pattern (with its defaults), the `signal()` initials the
 * server branch renders inert, and the `@client` region split into imports and body.
 */
export function extractCode(source: string, doc: ComponentDocument): ExtractedCode {
  const props: Prop[] = [];
  const signals: Signal[] = [];
  const client: ClientCode = { imports: [], body: [] };
  if (!doc.code) return { props, signals, client };

  const batch = new JsBatch(source);
  const parts = doc.code.parts;
  const ids = parts.map((p) => batch.add('module-statements', p.js));
  const result = batch.parse();
  const map = result.value.mapOffset;

  ids.forEach((id, i) => {
    const root = result.value.ast(id);
    const stmts = Array.isArray(root) ? (root as OxcNode[]) : [root as OxcNode];
    const isClient = parts[i]!.type === 'client-region';
    for (const stmt of stmts) {
      if (isClient) readClientStatement(stmt, source, map, client);
      if (!is(stmt, 'VariableDeclaration')) continue;
      for (const decl of fieldArray(stmt, 'declarations')) {
        readDeclarator(decl, source, map, props, signals);
      }
    }
  });
  return { props, signals, client };
}

/** Route one top-level statement of `@client` to the module scope or to the closure. */
function readClientStatement(
  stmt: OxcNode,
  source: string,
  map: MapOffset,
  client: ClientCode,
): void {
  const text = source.slice(map(stmt.start), map(stmt.end));
  (is(stmt, 'ImportDeclaration') ? client.imports : client.body).push(text);
}

/** Route a single `const … = call(...)` declarator to props (ObjectPattern) or signals. */
function readDeclarator(
  decl: OxcNode,
  source: string,
  map: MapOffset,
  props: Prop[],
  signals: Signal[],
): void {
  const init = field(decl, 'init');
  const id = field(decl, 'id');
  if (!init || !id || !is(init, 'CallExpression')) return;
  const callee = field(init, 'callee');
  const called = is(callee, 'Identifier') ? name(callee!) : '';

  if (called === 'props' && is(id, 'ObjectPattern')) {
    for (const property of fieldArray(id, 'properties')) readProp(property, source, map, props);
  } else if (called === 'signal' && is(id, 'Identifier')) {
    const arg = fieldArray(init, 'arguments')[0];
    signals.push({ name: name(id), init: arg ? source.slice(map(arg.start), map(arg.end)) : 'undefined' });
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
