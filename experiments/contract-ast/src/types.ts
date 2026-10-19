/**
 * From TS type nodes to `TypeModel`, under the subset of IDEA-05 §3.2. Oxc gives the syntax;
 * evaluating a type is ours. What the subset admits is read straight off the AST; what needs a
 * type checker (`Omit`, generics, conditional types…) is reported, never guessed.
 *
 * Declared types are kept by name in `types`, registered before their body is read so a type
 * that refers to itself ends instead of looping.
 */

import { annotated, child, children, nameOf, typeArgs, type Node } from './ast.ts';
import type { Field, NamedType, TypeModel, Width } from './model.ts';
import type { Parsed, Project } from './project.ts';
import type { Scopes } from './scope.ts';

const WIDTHS: ReadonlySet<string> = new Set<Width>(['u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32', 'f64']);
const UTILITIES: ReadonlySet<string> = new Set([
  'Partial', 'Required', 'Pick', 'Omit', 'Exclude', 'Extract', 'NonNullable', 'ReturnType',
  'Parameters', 'Awaited', 'InstanceType', 'Uppercase', 'Lowercase', 'Capitalize', 'Uncapitalize',
]);

/** What a `typeof x` in type position resolves to; the form extractor answers it. */
export type QueryResolver = (file: Parsed, node: Node) => TypeModel;

export class Types {
  readonly named: Record<string, NamedType> = {};
  readonly #project: Project;
  readonly #scopes: Scopes;
  #query: QueryResolver = () => ({ kind: 'unsupported', what: 'typeof' });

  constructor(project: Project, scopes: Scopes) {
    this.#project = project;
    this.#scopes = scopes;
  }

  onQuery(resolver: QueryResolver): void {
    this.#query = resolver;
  }

  convert(file: Parsed, node: Node | null): TypeModel {
    if (node === null) return this.#bad(file, null, 'missing-type', 'a type annotation is missing');
    switch (node.type) {
      case 'TSStringKeyword': return { kind: 'string' };
      case 'TSBooleanKeyword': return { kind: 'boolean' };
      case 'TSVoidKeyword':
      case 'TSUndefinedKeyword': return { kind: 'void' };
      case 'TSNumberKeyword':
        this.#project.report('error', 'number-without-width', 'bare `number`: use a width (u8…f64) so the backend knows its type', file, node);
        return { kind: 'number', width: null };
      case 'TSArrayType': return { kind: 'array', of: this.convert(file, child(node, 'elementType')) };
      case 'TSTypeOperator':
        if (node['operator'] === 'readonly') return this.convert(file, child(node, 'typeAnnotation'));
        return this.#bad(file, node, 'unsupported-type', `type operator "${String(node['operator'])}"`);
      case 'TSParenthesizedType': return this.convert(file, child(node, 'typeAnnotation'));
      case 'TSUnionType': return this.#union(file, node);
      case 'TSLiteralType': {
        const value = literal(node);
        return value === undefined
          ? this.#bad(file, node, 'unsupported-type', 'a literal type that is not a string or a number')
          : { kind: 'enum', values: [value] };
      }
      case 'TSTypeLiteral': return { kind: 'object', fields: this.fields(file, children(node, 'members')) };
      case 'TSTypeReference': return this.#reference(file, node);
      case 'TSTypeQuery': return this.#query(file, node);
      default:
        return this.#bad(file, node, 'unsupported-type', `${node.type.replace(/^TS/u, '')} is outside the contract subset`);
    }
  }

  /** The members of an interface body or a type literal. */
  fields(file: Parsed, members: readonly Node[]): Field[] {
    const out: Field[] = [];
    for (const member of members) {
      if (member.type !== 'TSPropertySignature' || member['computed'] === true) {
        this.#bad(file, member, 'unsupported-member', `${member.type.replace(/^TS/u, '')} in a data type: only plain properties`);
        continue;
      }
      const name = nameOf(child(member, 'key'));
      if (name === null) continue;
      out.push({ name, optional: member['optional'] === true, type: this.convert(file, annotated(member)) });
    }
    return out;
  }

  #union(file: Parsed, node: Node): TypeModel {
    const members = children(node, 'types');
    const absent = members.filter((m) => m.type === 'TSNullKeyword' || m.type === 'TSUndefinedKeyword');
    const present = members.filter((m) => !absent.includes(m));
    let inner: TypeModel;
    if (present.length === 1) inner = this.convert(file, present[0] ?? null);
    else if (present.every((m) => m.type === 'TSLiteralType' && literal(m) !== undefined)) {
      inner = { kind: 'enum', values: present.map((m) => literal(m) as string | number) };
    } else if (present.length === 2 && present.every((m) => m.type === 'TSLiteralType' && typeof (child(m, 'literal')?.['value']) === 'boolean')) {
      inner = { kind: 'boolean' };
    } else {
      inner = this.#bad(file, node, 'unsupported-union', 'a union that is not literals or `T | null`: no backend has one');
    }
    return absent.length > 0 ? { kind: 'nullable', of: inner } : inner;
  }

  #reference(file: Parsed, node: Node): TypeModel {
    const typeName = child(node, 'typeName');
    const name = nameOf(typeName);
    if (name === null) return this.#bad(file, node, 'unsupported-type', 'a qualified type name (`a.B`)');
    const args = typeArgs(node);
    const found = this.#scopes.lookup(file, name, 'type');

    if (found.kind === 'missing') return this.#global(file, node, name, args, found.why);
    if (found.kind === 'builtin') {
      if (found.module === '@fudic/contract' && WIDTHS.has(found.name)) return { kind: 'number', width: found.name as Width };
      return this.#bad(file, node, 'misplaced-builtin', `${found.module} "${found.name}" where a data type goes`);
    }
    if (args.length > 0 || child(found.node, 'typeParameters') !== null) {
      return this.#bad(file, node, 'generic', `"${name}" is generic: the subset has no generics`);
    }
    return this.#declared(found.file, found.node, found.name);
  }

  /** A name nobody declared: the handful of TS globals the subset understands. */
  #global(file: Parsed, node: Node, name: string, args: readonly Node[], why: string): TypeModel {
    const [first, second] = args;
    switch (name) {
      case 'Date': return { kind: 'date' };
      case 'Array':
      case 'ReadonlyArray': return { kind: 'array', of: this.convert(file, first ?? null) };
      case 'Readonly':
      case 'Promise': return this.convert(file, first ?? null);
      case 'Record':
        if (first?.type !== 'TSStringKeyword') return this.#bad(file, node, 'unsupported-type', '`Record` with keys that are not `string`');
        return { kind: 'record', of: this.convert(file, second ?? null) };
      default:
        if (UTILITIES.has(name)) return this.#bad(file, node, 'utility-type', `\`${name}<…>\` needs a type checker: declare the resulting type`);
        return this.#bad(file, node, 'unresolved', why);
    }
  }

  #declared(file: Parsed, node: Node, name: string): TypeModel {
    const ref = `${file.rel}#${name}`;
    if (this.named[ref] !== undefined) return { kind: 'named', ref };
    const entry = { name, file: file.rel, type: { kind: 'unsupported', what: 'pending' } as TypeModel };
    this.named[ref] = entry;

    if (node.type === 'TSInterfaceDeclaration') {
      const fields: Field[] = [];
      for (const heritage of children(node, 'extends')) fields.push(...this.#inherited(file, heritage));
      fields.push(...this.fields(file, children(child(node, 'body') ?? node, 'body')));
      entry.type = { kind: 'object', fields };
    } else if (node.type === 'TSTypeAliasDeclaration') {
      entry.type = this.convert(file, child(node, 'typeAnnotation'));
    } else {
      entry.type = this.#bad(file, node, 'unsupported-declaration', `${node.type.replace(/^TS/u, '')} "${name}": use an interface, or a union of literals for an enum`);
    }
    return { kind: 'named', ref };
  }

  /** The fields an `interface X extends Y` takes from `Y`. */
  #inherited(file: Parsed, heritage: Node): Field[] {
    const name = nameOf(child(heritage, 'expression'));
    if (name === null) {
      this.#bad(file, heritage, 'unsupported-type', 'extends something that is not a plain name');
      return [];
    }
    const model = this.#reference(file, { ...heritage, type: 'TSTypeReference', typeName: child(heritage, 'expression') });
    if (model.kind !== 'named') return [];
    const base = this.named[model.ref]?.type;
    return base?.kind === 'object' ? [...base.fields] : [];
  }

  #bad(file: Parsed, node: Node | null, code: string, message: string): TypeModel {
    this.#project.report('error', code, message, file, node);
    return { kind: 'unsupported', what: message };
  }
}

function literal(node: Node): string | number | undefined {
  const value = child(node, 'literal')?.['value'];
  return typeof value === 'string' || typeof value === 'number' ? value : undefined;
}
