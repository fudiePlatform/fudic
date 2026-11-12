/**
 * What a page or a flow can call (SDD-82 §3.4, §3.7): one answer for the `Calls` of a route's
 * `.d.ts`, the editor and the project check, so a name a fixture may answer is a name a `.fudspec`
 * may ask about.
 *
 * A route reaches its own functions, those of the components it links by a path of the app (in
 * the order linked), and every `runs remote` rule of the project; the first of two with the same
 * name wins. A flow reaches every function of the project and the same rules.
 *
 * The arguments are the names the bench logs a call with: for a function, the route's params,
 * its own arguments and, when it takes a form, the form's top-level fields; for a rule, the
 * `value` it checks and its `params`.
 */

import type { Span } from '@fudic/diagnostics';
import type { FnDecl, RuleDecl } from './ast.js';
import type { ApiIndex, ApiSource } from './index-api.js';

/** A function or a remote rule, with the arguments a call of it is logged with. */
export interface Callable {
  readonly name: string;
  readonly args: readonly string[];
  /** Absolute path of the `.fudapi` that declares it. */
  readonly path: string;
  /** Its name in that file. */
  readonly span: Span;
  readonly decl: FnDecl | RuleDecl;
}

/** What a route is made of, for the question. */
export interface RouteReach {
  /** Its own `.fudapi`; absent when it has none. */
  readonly source?: ApiSource;
  /** The `<id>` of the `.fudapi` of each component it links. */
  readonly components: readonly string[];
  /** The names of its params. */
  readonly params: readonly string[];
}

/** What a rule is called with: the value under check and its parameters. */
const RULE_ARGS: readonly string[] = ['value', 'params'];

/** Every function and remote rule a route reaches, in the order of the rules above. */
export function routeCallables(index: ApiIndex, route: RouteReach): readonly Callable[] {
  const linked = route.components.flatMap((id) => index.sources.filter((s) => s.id === id));
  const own = route.source === undefined ? [] : functionsOf(route.source, index, route.params);
  return firstByName([...own, ...linked.flatMap((s) => functionsOf(s, index, [])), ...remoteRules(index)]);
}

/** Every function of the project and every remote rule: what a flow can call. */
export function projectCallables(index: ApiIndex): readonly Callable[] {
  return firstByName([...index.sources.flatMap((s) => functionsOf(s, index, [])), ...remoteRules(index)]);
}

function functionsOf(source: ApiSource, index: ApiIndex, params: readonly string[]): readonly Callable[] {
  return source.file.declarations.flatMap((decl) => {
    if (decl.kind !== 'fn') return [];
    const form = decl.form === undefined ? undefined : index.lookup('form', decl.form.name.text)?.decl;
    const fields = form === undefined ? [] : form.fields.map((f) => f.name.text);
    const args = [...new Set([...params, ...decl.args.map((a) => a.name.text), ...fields])];
    return [{ name: decl.name.text, args, path: source.path, span: decl.name.span, decl }];
  });
}

function remoteRules(index: ApiIndex): readonly Callable[] {
  return index
    .all('rule')
    .filter(({ decl }) => decl.runs?.value.text === 'remote')
    .map(({ decl, source }) => ({ name: decl.name.text, args: RULE_ARGS, path: source.path, span: decl.name.span, decl }));
}

function firstByName(all: readonly Callable[]): readonly Callable[] {
  const found = new Map<string, Callable>();
  for (const callable of all) if (!found.has(callable.name)) found.set(callable.name, callable);
  return [...found.values()];
}
