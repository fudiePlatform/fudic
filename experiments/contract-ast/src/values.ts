/**
 * The two values a contract points at with `typeof`: a middleware (`middleware<Adds>()…`) and a
 * form (`form({…})`). Both are read from the initializer's AST, never run: what is not a literal
 * there is reported.
 */

import { child, children, nameOf, str, typeArgs, type Node } from './ast.ts';
import type { FormField, FormModel, MiddlewareModel, TypeModel, ValidatorModel } from './model.ts';
import type { Parsed, Project } from './project.ts';
import type { Resolved, Scopes } from './scope.ts';
import type { Types } from './types.ts';

const CONTROL_TYPES: Readonly<Record<string, TypeModel>> = {
  str: { kind: 'string' },
  bool: { kind: 'boolean' },
  date: { kind: 'nullable', of: { kind: 'date' } },
  u8: { kind: 'nullable', of: { kind: 'number', width: 'u8' } },
  i8: { kind: 'nullable', of: { kind: 'number', width: 'i8' } },
  u16: { kind: 'nullable', of: { kind: 'number', width: 'u16' } },
  i16: { kind: 'nullable', of: { kind: 'number', width: 'i16' } },
  u32: { kind: 'nullable', of: { kind: 'number', width: 'u32' } },
  i32: { kind: 'nullable', of: { kind: 'number', width: 'i32' } },
  f32: { kind: 'nullable', of: { kind: 'number', width: 'f32' } },
  f64: { kind: 'nullable', of: { kind: 'number', width: 'f64' } },
};

/** Validators fudic ports to every language. Anything else is logic to port by hand. */
const PORTED: ReadonlySet<string> = new Set(['required', 'email', 'min', 'max', 'minLength', 'maxLength', 'pattern']);

/** What `literalValue` answers for anything that is not a literal. */
const NOT_LITERAL = Symbol('not-literal');

export class Values {
  readonly middlewares: Record<string, MiddlewareModel> = {};
  readonly forms: Record<string, FormModel> = {};
  readonly #project: Project;
  readonly #scopes: Scopes;
  readonly #types: Types;

  constructor(project: Project, scopes: Scopes, types: Types) {
    this.#project = project;
    this.#scopes = scopes;
    this.#types = types;
  }

  /** The value behind `typeof x`, in the file that writes it. */
  resolve(file: Parsed, query: Node): Resolved {
    const name = nameOf(child(query, 'exprName'));
    if (name === null) return { kind: 'missing', why: '`typeof` of something that is not a plain name' };
    return this.#scopes.lookup(file, name, 'value');
  }

  /** A middleware ref, or `null` after reporting why it is not one. */
  middleware(file: Parsed, query: Node): string | null {
    const found = this.resolve(file, query);
    if (found.kind !== 'decl') {
      this.#project.report('error', 'unresolved', found.kind === 'missing' ? found.why : 'a builtin is not a middleware', file, query);
      return null;
    }
    const ref = `${found.file.rel}#${found.name}`;
    if (this.middlewares[ref] !== undefined) return ref;

    const declarator = found.node;
    const init = child(declarator, 'init');
    const annotation = child(child(declarator, 'id') ?? declarator, 'typeAnnotation');
    if (init?.type === 'ArrowFunctionExpression' || init?.type === 'FunctionExpression' || found.node.type === 'FunctionDeclaration' || annotation !== null) {
      this.#project.report('error', 'shared-middleware', `"${found.name}" is a plain function on both sides: with another backend its server half cannot be TS`, found.file, declarator);
      this.middlewares[ref] = { name: found.name, file: found.file.rel, adds: null, client: true };
      return ref;
    }

    const chain = callChain(init);
    const base = chain === null ? null : this.#callee(found.file, chain.base);
    if (chain === null || base === null || base.module !== '@fudic/http' || base.name !== 'middleware') {
      this.#project.report('error', 'not-a-middleware', `"${found.name}" is not built with middleware() from @fudic/http`, found.file, declarator);
      return null;
    }
    if (chain.calls.includes('server')) {
      this.#project.report('note', 'server-half-in-ts', `"${found.name}" writes its server half in TS: only a Node backend runs it`, found.file, declarator);
    }
    const [adds] = typeArgs(chain.base);
    this.middlewares[ref] = {
      name: found.name,
      file: found.file.rel,
      adds: adds === undefined ? null : this.#types.convert(found.file, adds),
      client: chain.calls.includes('client'),
    };
    return ref;
  }

  /** A form ref, or `null` when the value is not a `form(…)`. Reports nothing on `null`. */
  form(file: Parsed, query: Node): string | null {
    const found = this.resolve(file, query);
    if (found.kind !== 'decl' || found.node.type !== 'VariableDeclarator') return null;
    const init = child(found.node, 'init');
    if (init?.type !== 'CallExpression') return null;
    const callee = this.#callee(found.file, init);
    if (callee?.module !== '@fudic/forms' || callee.name !== 'form') return null;

    const ref = `${found.file.rel}#${found.name}`;
    if (this.forms[ref] !== undefined) return ref;
    const [schema, options] = children(init, 'arguments');
    this.forms[ref] = {
      name: found.name,
      file: found.file.rel,
      fields: schema?.type === 'ObjectExpression' ? this.#fields(found.file, schema) : [],
      catches: this.#catches(found.file, options),
    };
    if (schema?.type !== 'ObjectExpression') this.#project.report('error', 'form-schema', 'the schema of form() is not an object literal', found.file, init);
    return ref;
  }

  #fields(file: Parsed, schema: Node): FormField[] {
    const out: FormField[] = [];
    for (const prop of children(schema, 'properties')) {
      const name = prop.type === 'Property' ? nameOf(child(prop, 'key')) : null;
      const value = child(prop, 'value');
      if (name === null || value?.type !== 'CallExpression') {
        this.#project.report('error', 'form-field', 'a form field that is not `name: control(…)`', file, prop);
        continue;
      }
      const callee = this.#callee(file, value);
      const args = children(value, 'arguments');
      if (callee?.module === '@fudic/forms' && callee.name === 'group') {
        const inner = args[0];
        out.push({ name, group: inner?.type === 'ObjectExpression' ? this.#fields(file, inner) : [] });
        continue;
      }
      if (callee?.module !== '@fudic/forms') {
        this.#project.report('error', 'form-control', `field "${name}" is not built with a control of @fudic/forms`, file, value);
        continue;
      }
      out.push(this.#control(file, name, callee.name, args, value));
    }
    return out;
  }

  #control(file: Parsed, name: string, control: string, args: readonly Node[], at: Node): FormField {
    let type: TypeModel;
    let rest = args;
    if (control === 'arr') {
      const element = nameOf(args[0] ?? null);
      const of = element === null ? undefined : CONTROL_TYPES[element];
      type = of === undefined
        ? this.#bad(file, at, 'form-control', `arr() of something that is not a typed control`)
        : { kind: 'array', of: of.kind === 'nullable' ? of.of : of };
      rest = args.slice(1);
    } else {
      const known = CONTROL_TYPES[control];
      type = known ?? this.#bad(file, at, 'form-control', `"${control}" is not a typed control: the field has no type to generate`);
    }
    const [initialNode, validatorsNode, optionsNode] = rest;
    const initial = initialNode === undefined ? undefined : literalValue(initialNode);
    if (initial === NOT_LITERAL) this.#project.report('error', 'non-literal-initial', `the initial value of "${name}" is not a literal`, file, initialNode ?? at);
    return {
      name,
      control,
      type,
      initial: initial === NOT_LITERAL ? null : initial,
      validators: validatorsNode === undefined ? [] : this.#validators(file, validatorsNode),
      messages: messageKeys(optionsNode),
    };
  }

  #validators(file: Parsed, list: Node): ValidatorModel[] {
    if (list.type !== 'ArrayExpression') {
      this.#project.report('error', 'validators', 'the validators are not an array literal', file, list);
      return [];
    }
    const out: ValidatorModel[] = [];
    for (const item of children(list, 'elements')) {
      const call = item.type === 'CallExpression' ? item : null;
      const callee = this.#callee(file, call ?? item);
      const name = callee?.name ?? nameOf(item) ?? '?';
      const args = call === null ? [] : children(call, 'arguments');

      if (callee?.module === '@fudic/forms' && name === 'serverValidator') {
        this.#project.report('error', 'server-code-in-form', 'serverValidator() holds server code inside the form: with another backend it has to be a named hole the backend implements', file, item);
        out.push({ name, args: ['<server code>'] });
        continue;
      }
      if (callee?.module !== '@fudic/forms' || !PORTED.has(name)) {
        this.#project.report('error', 'custom-validator', `validator "${name}" is not one fudic ports: its logic would have to be written again in every language`, file, item);
      }
      const values = args.map((a) => literalValue(a));
      if (values.includes(NOT_LITERAL)) this.#project.report('error', 'non-literal-argument', `an argument of "${name}" is not a literal`, file, item);
      if (name === 'pattern') this.#project.report('note', 'regex-dialect', 'pattern() also runs on the server: the regex has to mean the same in the backend\'s dialect', file, item);
      out.push({ name, args: values.map((v) => (v === NOT_LITERAL ? null : v)) });
    }
    return out;
  }

  #catches(file: Parsed, options: Node | undefined): number[] {
    if (options?.type !== 'ObjectExpression') return [];
    for (const prop of children(options, 'properties')) {
      if (nameOf(child(prop, 'key')) !== 'catches') continue;
      const value = literalValue(child(prop, 'value') ?? prop);
      if (Array.isArray(value) && value.every((v) => typeof v === 'number')) return value;
      this.#project.report('error', 'non-literal-argument', '`catches` is not an array of numbers', file, prop);
    }
    return [];
  }

  /** Where the function a call calls comes from, when it is a plain imported name. */
  #callee(file: Parsed, call: Node): { module: string; name: string } | null {
    const target = call.type === 'CallExpression' ? child(call, 'callee') : call;
    const name = nameOf(target);
    if (name === null) return null;
    const found = this.#scopes.lookup(file, name, 'value');
    return found.kind === 'builtin' ? { module: found.module, name: found.name } : null;
  }

  #bad(file: Parsed, node: Node, code: string, message: string): TypeModel {
    this.#project.report('error', code, message, file, node);
    return { kind: 'unsupported', what: message };
  }
}

/** `a().b().c()` → base call `a()` and `['b', 'c']`. */
function callChain(node: Node | null): { base: Node; calls: string[] } | null {
  const calls: string[] = [];
  let current = node;
  while (current?.type === 'CallExpression') {
    const callee = child(current, 'callee');
    if (callee?.type !== 'MemberExpression') return { base: current, calls: calls.reverse() };
    const property = nameOf(child(callee, 'property'));
    if (property !== null) calls.push(property);
    current = child(callee, 'object');
  }
  return null;
}

function literalValue(node: Node): unknown {
  switch (node.type) {
    case 'Literal': {
      const regex = child(node, 'regex') ?? (node['regex'] as Node | undefined) ?? null;
      if (regex !== null && typeof regex === 'object') return { regex: str(regex, 'pattern'), flags: str(regex, 'flags') };
      return node['value'];
    }
    case 'Identifier': return node['name'] === 'undefined' ? undefined : NOT_LITERAL;
    case 'UnaryExpression': {
      const arg = child(node, 'argument');
      const value = arg === null ? NOT_LITERAL : literalValue(arg);
      return node['operator'] === '-' && typeof value === 'number' ? -value : NOT_LITERAL;
    }
    case 'TemplateLiteral':
      return children(node, 'expressions').length === 0
        ? children(node, 'quasis').map((q) => (q['value'] as { cooked?: string }).cooked ?? '').join('')
        : NOT_LITERAL;
    case 'ArrayExpression': {
      const items = children(node, 'elements').map(literalValue);
      return items.includes(NOT_LITERAL) ? NOT_LITERAL : items;
    }
    default: return NOT_LITERAL;
  }
}

/** The keys of `{ messages: { … } }`. */
function messageKeys(options: Node | undefined): string[] {
  if (options?.type !== 'ObjectExpression') return [];
  for (const prop of children(options, 'properties')) {
    if (nameOf(child(prop, 'key')) !== 'messages') continue;
    const value = child(prop, 'value');
    if (value?.type === 'ObjectExpression') {
      return children(value, 'properties').map((p) => nameOf(child(p, 'key'))).filter((k): k is string => k !== null);
    }
  }
  return [];
}
