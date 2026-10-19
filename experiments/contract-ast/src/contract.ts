/**
 * One contract: the default-exported interface of the file a `<link rel="server">` points at.
 * Each member is `name: Verb<(args) => Result, [typeof mw, …], { options }>`, or the method
 * `load(): Data`, and becomes a `FunctionModel`.
 */

import { annotated, child, children, nameOf, typeArgs, type Node } from './ast.ts';
import type { ContractModel, FunctionModel, Param, TypeModel, Verb } from './model.ts';
import type { Parsed, Project } from './project.ts';
import type { Scopes } from './scope.ts';
import type { Types } from './types.ts';
import type { Values } from './values.ts';

const VERBS: Readonly<Record<string, Verb>> = {
  Get: 'GET', Post: 'POST', Put: 'PUT', Patch: 'PATCH', Delete: 'DELETE', Load: 'LOAD',
};

export class Contracts {
  readonly #project: Project;
  readonly #scopes: Scopes;
  readonly #types: Types;
  readonly #values: Values;

  constructor(project: Project, scopes: Scopes, types: Types, values: Values) {
    this.#project = project;
    this.#scopes = scopes;
    this.#types = types;
    this.#values = values;
  }

  read(fud: string, file: Parsed): ContractModel {
    const kind = file.rel.includes('routes/') ? 'route' : file.rel.includes('components/') ? 'component' : 'unknown';
    const found = this.#scopes.exported(file, 'default', 'type');
    if (found.kind !== 'decl' || found.node.type !== 'TSInterfaceDeclaration') {
      this.#project.report('error', 'no-contract', 'the file has no `export default interface`', file, null);
      return { kind, fud, file: file.rel, interface: '?', functions: [] };
    }
    const iface = found.node;
    if (children(iface, 'extends').length > 0) {
      this.#project.report('note', 'contract-extends', 'the contract extends another interface: its members are not read', found.file, iface);
    }
    const functions: FunctionModel[] = [];
    for (const member of children(child(iface, 'body') ?? iface, 'body')) {
      const fn = this.#member(found.file, member, kind);
      if (fn !== null) functions.push(fn);
    }
    return { kind, fud, file: file.rel, interface: nameOf(child(iface, 'id')) ?? '?', functions };
  }

  #member(file: Parsed, member: Node, kind: ContractModel['kind']): FunctionModel | null {
    const name = nameOf(child(member, 'key'));
    if (name === null) {
      this.#project.report('error', 'contract-member', 'a member without a plain name', file, member);
      return null;
    }
    if (member.type === 'TSMethodSignature') {
      if (name !== 'load') {
        this.#project.report('error', 'no-verb', `"${name}" is a method: say its verb with Get/Post/Put/Patch/Delete`, file, member);
        return null;
      }
      return this.#fn(file, name, 'LOAD', member, [], null, kind);
    }
    if (member.type !== 'TSPropertySignature') {
      this.#project.report('error', 'contract-member', `${member.type.replace(/^TS/u, '')} in a contract`, file, member);
      return null;
    }
    const marker = annotated(member);
    const markerName = marker?.type === 'TSTypeReference' ? nameOf(child(marker, 'typeName')) : null;
    const found = markerName === null ? null : this.#scopes.lookup(file, markerName, 'type');
    const verb = found?.kind === 'builtin' && found.module === '@fudic/contract' ? VERBS[found.name] : undefined;
    if (marker === null || verb === undefined) {
      this.#project.report('error', 'no-verb', `"${name}" is not typed with a verb marker of @fudic/contract`, file, member);
      return null;
    }
    const [signature, second, third] = typeArgs(marker);
    if (signature?.type !== 'TSFunctionType') {
      this.#project.report('error', 'no-signature', `the first argument of ${markerName ?? '?'} is not a function type`, file, marker);
      return null;
    }
    return verb === 'LOAD'
      ? this.#fn(file, name, verb, signature, [], second ?? null, kind)
      : this.#fn(file, name, verb, signature, second === undefined ? [] : this.#middlewares(file, second), third ?? null, kind);
  }

  #fn(file: Parsed, name: string, verb: Verb, signature: Node, middlewares: string[], options: Node | null, kind: ContractModel['kind']): FunctionModel {
    if (verb === 'LOAD' && kind !== 'route') this.#project.report('error', 'load-outside-route', 'only a route has a `load`', file, signature);
    if (verb === 'LOAD' && name !== 'load') this.#project.report('error', 'load-name', `a Load marker on "${name}": it has to be called \`load\``, file, signature);
    const params = this.#params(file, signature);
    if (verb === 'GET' && params.some((p) => p.type.kind === 'form')) {
      this.#project.report('error', 'form-on-get', `"${name}" takes a form with GET: a form travels in the body`, file, signature);
    }
    const result = annotated(child(signature, 'returnType') ?? signature) ?? child(signature, 'returnType');
    return {
      name,
      verb,
      params,
      result: this.#types.convert(file, result),
      middlewares,
      options: options === null ? {} : this.#options(file, options),
    };
  }

  #params(file: Parsed, signature: Node): Param[] {
    const out: Param[] = [];
    for (const param of children(signature, 'params')) {
      if (param.type !== 'Identifier') {
        this.#project.report('error', 'param', `${param.type} as a parameter: only \`name: Type\``, file, param);
        continue;
      }
      const type = annotated(param);
      out.push({ name: nameOf(param) ?? '?', optional: param['optional'] === true, type: this.#paramType(file, type) });
    }
    return out;
  }

  /** A `typeof form` parameter is the whole form; anything else goes through `Types`. */
  #paramType(file: Parsed, type: Node | null): TypeModel {
    if (type?.type === 'TSTypeQuery') {
      const form = this.#values.form(file, type);
      if (form !== null) return { kind: 'form', ref: form };
      this.#project.report('error', 'typeof-param', '`typeof` of a parameter that is not a form()', file, type);
      return { kind: 'unsupported', what: 'typeof' };
    }
    return this.#types.convert(file, type);
  }

  #middlewares(file: Parsed, list: Node): string[] {
    if (list.type !== 'TSTupleType') {
      this.#project.report('error', 'middlewares', 'the middlewares are not a tuple `[typeof a, typeof b]`', file, list);
      return [];
    }
    const out: string[] = [];
    for (const item of children(list, 'elementTypes')) {
      if (item.type !== 'TSTypeQuery') {
        this.#project.report('error', 'middlewares', 'a middleware that is not `typeof name`', file, item);
        continue;
      }
      const ref = this.#values.middleware(file, item);
      if (ref !== null) out.push(ref);
    }
    return out;
  }

  /** `{ invalidates: ["/a"]; strategy: "ssr" }`: literal types read as values. */
  #options(file: Parsed, node: Node): Record<string, unknown> {
    if (node.type !== 'TSTypeLiteral') {
      this.#project.report('error', 'options', 'the options are not a type literal `{ … }`', file, node);
      return {};
    }
    const out: Record<string, unknown> = {};
    for (const member of children(node, 'members')) {
      const name = nameOf(child(member, 'key'));
      const value = typeValue(annotated(member));
      if (name === null || value === undefined) {
        this.#project.report('error', 'options', 'an option whose type is not a literal or a tuple of literals', file, member);
        continue;
      }
      out[name] = value;
    }
    return out;
  }
}

/** The value a literal type spells: `"a"`, `1`, `false`, `["a", "b"]`. */
function typeValue(node: Node | null): unknown {
  if (node === null) return undefined;
  if (node.type === 'TSLiteralType') return child(node, 'literal')?.['value'];
  if (node.type === 'TSTupleType') {
    const items = children(node, 'elementTypes').map(typeValue);
    return items.includes(undefined) ? undefined : items;
  }
  return undefined;
}
