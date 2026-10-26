/**
 * The typed pass of the portable view (SDD-61 §4.2): what the compiler cannot say without types.
 *
 * - a call with no arguments reads something reactive, or it is `FUD1140`;
 * - a condition and a logical operand are a `boolean` (`FUD1151`): the view has no truthiness;
 * - an operator gets the operands it ports for (`FUD1152`);
 * - what the view and the server cut read has a type every backend has (`FUD1153`).
 *
 * WHERE comes from the compiler, which walked the view and the server cut: their Oxc nodes, each
 * with the place it sits in, never a handler nor a callback. The checker answers WHAT each one
 * is, over the projection: a node's `.fud` span crosses into the client virtual through its
 * mappings, and the node of the program with exactly that span is the one asked. A span that
 * does not cross — scaffolding, a pipe rewritten as `$pipe(…)` — is asked nothing. Every
 * diagnostic is on the `.fud` span of the Oxc node, so the editor and the build, which hand
 * over different programs, report the same span.
 *
 * Symbols by the name the checker prints, as `propShapes` reads them: the program may come from
 * another copy of TypeScript. Type-only import of `typescript`, for the same reason, and a few
 * `TypeFlags` and `SymbolFlags` as literals, whose values every 5.x shares.
 *
 * One voice per fact: what the compiler reports (a call with arguments, `new`, an arrow outside
 * a collection operation, a literal) is not entered, and a type TypeScript could not resolve is
 * not judged again. Never throws: a node of an unexpected shape is asked nothing.
 */

import type * as ts from 'typescript';
import {
  documentRoots,
  portableRegions,
  spreadExpr,
  walk,
  type OxcNode,
  type PortableRegions,
  type PortableRoot,
  type Span,
} from '@fudic/compiler';
import { FUD1140, FUD1151, FUD1152, FUD1153, type SourceDiagnostic } from '@fudic/diagnostics';
import type { Mapping, VirtualFile } from '@fudic/language-core';
import { semanticInput } from './fudic-diagnostics.js';
import type { ProjectedFud } from './project.js';

/** `ts.TypeFlags`: `Enum | EnumLiteral`, `BigInt | BigIntLiteral`, `Intersection`. */
const ENUM_LIKE = (1 << 5) | (1 << 10);
const BIGINT_LIKE = (1 << 6) | (1 << 11);
const INTERSECTION = 1 << 21;
/** `ts.SymbolFlags.Class`. */
const CLASS = 1 << 5;

const PROPS_EXPORT = '$Props';

/** The four collection operations (§3.5 bis). */
const COLLECTION: ReadonlySet<string> = new Set(['filter', 'map', 'reduce', 'toSorted']);

/** What a call with no arguments may read (§3.3), by the name of its type or of its alias. */
const REACTIVE: ReadonlySet<string> = new Set(['Signal', 'Computed', 'Readable', 'Control', 'TypedControl', '$ControlNode']);

/** The generic types of the catalogue that port when what they hold does (§3.10). */
const HOLDERS: ReadonlySet<string> = new Set(['Signal', 'Computed', 'Readable']);

/** The types of the catalogue that port as they are (§3.10): URLs, HTML, pipes, forms. */
const CATALOGUE: ReadonlySet<string> = new Set([
  'TrustedURL',
  'TrustedHTML',
  '$TrustedURL',
  '$TrustedHTML',
  'Pipe',
  '$Pipe',
  'Form',
  'FormApi',
  'GroupNode',
  'Control',
  'TypedControl',
  '$ControlNode',
  '$FormNode',
  'Issue',
  'LoadData',
]);

/** The names an anonymous object type prints its symbol as. */
const ANONYMOUS: ReadonlySet<string> = new Set(['__type', '__object']);

/** What an operand is, for the operators of §3.4. */
type Kind = 'number' | 'string' | 'boolean' | 'date' | 'absent' | 'any' | 'other';

/** Every diagnostic of the typed pass over `document`, on the `.fud`. */
export function portableTypeDiagnostics(program: ts.Program, document: ProjectedFud): readonly SourceDiagnostic[] {
  const file = program.getSourceFile(document.path);
  const client = document.virtuals.find((virtual) => virtual.languageId !== 'css');
  if (file === undefined || client === undefined) return [];
  return new PortableTypes(program, file, client, document).run();
}

class PortableTypes {
  readonly #checker: ts.TypeChecker;
  readonly #regions: PortableRegions;
  readonly #out: SourceDiagnostic[] = [];

  constructor(
    private readonly program: ts.Program,
    private readonly file: ts.SourceFile,
    private readonly client: VirtualFile,
    private readonly document: ProjectedFud,
  ) {
    this.#checker = program.getTypeChecker();
    this.#regions = portableRegions(semanticInput(document));
  }

  run(): readonly SourceDiagnostic[] {
    const regions = this.#regions;
    for (const root of regions.view) this.#root(root);
    for (const node of regions.cut) this.#expression(node);
    for (const declarator of regions.declarations) this.#declaration(declarator);
    for (const parameter of regions.parameters) this.#parameter(parameter);
    this.#props();
    this.#spreads();
    return this.#out;
  }

  // ── Reporting ──

  #span(node: OxcNode): Span {
    return this.#regions.span(node);
  }

  /** The name a binding declares, without the type annotation Oxc spans along with it. */
  #name(binding: OxcNode): Span {
    const at = this.#span(binding);
    return { start: at.start, end: at.start + nameOf(binding).length };
  }

  #report(diagnostic: SourceDiagnostic): void {
    this.#out.push(diagnostic);
  }

  // ── The program ──

  /** The node of the projection written exactly where `at` is in the `.fud`. */
  #nodeAt(at: Span): ts.Node | undefined {
    const range = generatedRange(this.client.mappings, at);
    if (range === undefined) return undefined;
    const [start, end] = range;
    let found: ts.Node | undefined;
    const visit = (node: ts.Node): void => {
      if (node.getStart(this.file) > start || node.getEnd() < end) return;
      // The deepest of the nodes with that very span: an expression, not its statement.
      if (node.getStart(this.file) === start && node.getEnd() === end) found = node;
      node.forEachChild(visit);
    };
    this.file.forEachChild(visit);
    return found;
  }

  /** The type of what `node` evaluates to, or `undefined` when it does not cross. */
  #typeOf(node: OxcNode): ts.Type | undefined {
    const found = this.#nodeAt(this.#span(node));
    return found === undefined ? undefined : this.#checker.getTypeAtLocation(found);
  }

  // ── The roots ──

  #root(root: PortableRoot): void {
    const node = root.node as OxcNode;
    switch (root.place) {
      case 'statements':
        for (const statement of root.node as readonly OxcNode[]) this.#statement(statement);
        return;
      case 'condition':
        this.#condition(node);
        this.#expression(node);
        return;
      case 'subject':
        this.#scalar(node);
        this.#expression(node);
        return;
      case 'key':
        this.#scalar(node);
        this.#expression(node);
        return;
      case 'for':
        this.#for(node);
        return;
      case 'for-of':
        this.#forOf(node);
        return;
      default:
        this.#expression(node);
    }
  }

  /** A statement of an `@{ }`: a declaration, or an assignment (§3.7). */
  #statement(statement: OxcNode): void {
    if (statement.type === 'VariableDeclaration') {
      for (const declarator of children(statement, 'declarations')) {
        this.#pattern(child(declarator, 'id')!);
        const init = child(declarator, 'init');
        if (init !== undefined) this.#expression(init);
      }
      return;
    }
    if (statement.type === 'ExpressionStatement') this.#expression(child(statement, 'expression')!);
  }

  /** `@for (let i = 0; c; paso)`: what it declares, a `boolean` condition, and its step. */
  #for(node: OxcNode): void {
    const init = child(node, 'init');
    if (init?.type === 'VariableDeclaration') this.#statement(init);
    const test = child(node, 'test');
    if (test !== undefined) {
      this.#condition(test);
      this.#expression(test);
    }
    const update = child(node, 'update');
    if (update !== undefined) this.#expression(update);
  }

  /** `@foreach (const x of xs)`: `xs` is a list, and a pattern does not take a `map` apart. */
  #forOf(node: OxcNode): void {
    const left = child(node, 'left');
    if (left?.type === 'VariableDeclaration') {
      for (const declarator of children(left, 'declarations')) this.#pattern(child(declarator, 'id')!);
    }
    const right = child(node, 'right')!;
    const type = this.#typeOf(right);
    if (type !== undefined && !this.#isAny(type) && !this.#isList(present(this.#checker, type))) {
      this.#report(FUD1153({ span: this.#span(right) }));
    }
    this.#expression(right);
  }

  // ── Expressions ──

  #expression(node: OxcNode): void {
    switch (node.type) {
      case 'ParenthesizedExpression':
      case 'ChainExpression':
        this.#expression(child(node, 'expression')!);
        return;
      case 'CallExpression':
        this.#call(node);
        return;
      case 'MemberExpression':
        this.#member(node);
        return;
      case 'BinaryExpression':
        this.#binary(node);
        return;
      case 'LogicalExpression':
        this.#logical(node);
        return;
      case 'UnaryExpression':
        this.#unary(node);
        return;
      case 'ConditionalExpression':
        this.#condition(child(node, 'test')!);
        for (const key of ['test', 'consequent', 'alternate']) this.#expression(child(node, key)!);
        return;
      case 'TemplateLiteral':
        for (const hole of children(node, 'expressions')) {
          this.#operand(hole, '`${…}`', (kind) => kind === 'string' || kind === 'number');
          this.#expression(hole);
        }
        return;
      case 'AssignmentExpression':
        this.#expression(child(node, 'right')!);
        return;
      default:
      // A name or a literal holds nothing to ask; anything else is a node the compiler has
      // already refused, and is not entered (§5).
    }
  }

  /** A call: a reactive read with no arguments (§3.3), or a collection operation (§3.5 bis). */
  #call(node: OxcNode): void {
    const callee = child(node, 'callee')!;
    const args = children(node, 'arguments');
    if (args.length === 0) {
      if (!isPath(callee)) return;
      const type = this.#typeOf(callee);
      if (type !== undefined && !this.#isAny(type) && !this.#isReactive(type)) {
        const at = this.#span(callee);
        this.#report(FUD1140({ span: at, callee: this.document.source.slice(at.start, at.end) }));
      }
      return;
    }
    const operation = callee.type === 'MemberExpression' && field(callee, 'computed') !== true ? nameOf(child(callee, 'property')!) : '';
    if (COLLECTION.has(operation)) this.#collection(node, child(callee, 'object')!, operation, args);
  }

  /** `xs.filter(…)` and the other three, over a list, with the types §3.5 bis asks of each. */
  #collection(node: OxcNode, list: OxcNode, operation: string, args: readonly OxcNode[]): void {
    const type = this.#typeOf(list);
    if (type !== undefined && !this.#isAny(type) && !this.#isList(present(this.#checker, type))) {
      this.#report(FUD1153({ span: this.#span(list) }));
    }
    this.#expression(list);
    const arrow = args[0]!;
    // Any other argument is the compiler's `FUD1145`.
    if (arrow.type !== 'ArrowFunctionExpression' || field(arrow, 'expression') !== true) return;
    const body = child(arrow, 'body')!;
    switch (operation) {
      case 'filter':
        this.#condition(body);
        break;
      case 'toSorted':
        this.#operand(body, 'toSorted', (kind) => kind === 'number');
        break;
      case 'map':
        this.#portable(body);
        break;
      default: {
        // The accumulator: what the initial value is, and what the whole `reduce` gives.
        const initial = args[1];
        if (initial !== undefined) {
          this.#portable(initial);
          this.#expression(initial);
        }
      }
    }
    this.#expression(body);
  }

  /** `a.b` and `a[i]`: an index on a list or a `map` (§3.5), and `.length` (§3.5 bis). */
  #member(node: OxcNode): void {
    const object = child(node, 'object')!;
    const property = child(node, 'property')!;
    const type = this.#typeOf(object);
    if (field(node, 'computed') === true) {
      if (type !== undefined && !this.#isAny(type) && !this.#indexes(present(this.#checker, type), property)) {
        this.#report(FUD1153({ span: this.#span(node) }));
      }
      this.#expression(object);
      this.#expression(property);
      return;
    }
    if (nameOf(property) === 'length' && type !== undefined && !this.#isAny(type) && !this.#hasLength(present(this.#checker, type))) {
      this.#report(FUD1153({ span: this.#span(node) }));
    }
    this.#expression(object);
  }

  #binary(node: OxcNode): void {
    const operator = String(field(node, 'operator'));
    const left = child(node, 'left')!;
    const right = child(node, 'right')!;
    // `a | preset` is the pipe (SDD-58): what it formats is the pipe's to type.
    if (operator === '|') {
      this.#expression(left);
      return;
    }
    switch (operator) {
      case '+':
        this.#plus(left, right);
        break;
      case '-':
      case '*':
      case '/':
      case '%':
        for (const operand of [left, right]) this.#operand(operand, operator, (kind) => kind === 'number');
        break;
      case '<':
      case '<=':
      case '>':
      case '>=':
        this.#relational(left, right, operator);
        break;
      case '===':
      case '!==':
        this.#equality(left, right, operator);
        break;
      default:
      // Any other operator is the compiler's `FUD1142`.
    }
    this.#expression(left);
    this.#expression(right);
  }

  #logical(node: OxcNode): void {
    const left = child(node, 'left')!;
    const right = child(node, 'right')!;
    if (field(node, 'operator') !== '??') {
      this.#condition(left);
      this.#condition(right);
    }
    this.#expression(left);
    this.#expression(right);
  }

  #unary(node: OxcNode): void {
    const argument = child(node, 'argument')!;
    const operator = field(node, 'operator');
    if (operator === '!') this.#condition(argument);
    else if (operator === '-') this.#operand(argument, '-', (kind) => kind === 'number');
    this.#expression(argument);
  }

  // ── The rules of §3.4 ──

  /** A condition: a `boolean`, and nothing else (`FUD1151`). */
  #condition(node: OxcNode): void {
    const kind = this.#kindOf(node);
    if (kind !== undefined && kind !== 'any' && kind !== 'boolean') this.#report(FUD1151({ span: this.#span(node) }));
  }

  /** An operand `operator` takes only when `accepts` its kind (`FUD1152`). */
  #operand(node: OxcNode, operator: string, accepts: (kind: Kind) => boolean): void {
    const kind = this.#kindOf(node);
    if (kind !== undefined && kind !== 'any' && !accepts(kind)) this.#report(FUD1152({ span: this.#span(node), operator }));
  }

  /** `+`: two numbers add; a string with a string or a number concatenates. */
  #plus(left: OxcNode, right: OxcNode): void {
    const kinds = [this.#kindOf(left), this.#kindOf(right)];
    if (kinds.includes(undefined) || kinds.includes('any')) return;
    const text = kinds.includes('string');
    [left, right].forEach((operand, i) => {
      const kind = kinds[i];
      const fits = kind === 'number' || (text && kind === 'string');
      if (!fits) this.#report(FUD1152({ span: this.#span(operand), operator: '+' }));
    });
  }

  /** `<` and the rest: two numbers, two strings or two dates. The odd one out is the culprit. */
  #relational(left: OxcNode, right: OxcNode, operator: string): void {
    const kinds = [this.#kindOf(left), this.#kindOf(right)];
    if (kinds.includes(undefined) || kinds.includes('any')) return;
    const ordered = (kind: Kind | undefined): boolean => kind === 'number' || kind === 'string' || kind === 'date';
    if (!ordered(kinds[0])) this.#report(FUD1152({ span: this.#span(left), operator }));
    if (!ordered(kinds[1]) || (ordered(kinds[0]) && kinds[1] !== kinds[0])) {
      this.#report(FUD1152({ span: this.#span(right), operator }));
    }
  }

  /**
   * `===`: two primitives — whose mismatch TypeScript already reports — or a test of presence
   * against `null`/`undefined`. An object on either side compares identities, which no other
   * backend has.
   */
  #equality(left: OxcNode, right: OxcNode, operator: string): void {
    const kinds = [this.#kindOf(left, true), this.#kindOf(right, true)];
    if (kinds.includes(undefined) || kinds.includes('any') || kinds.includes('absent')) return;
    [left, right].forEach((operand, i) => {
      const kind = kinds[i];
      if (kind !== 'number' && kind !== 'string' && kind !== 'boolean') {
        this.#report(FUD1152({ span: this.#span(operand), operator }));
      }
    });
  }

  /** The subject of a `@switch` and a `key`: a string or a number (`FUD1153`). */
  #scalar(node: OxcNode): void {
    const kind = this.#kindOf(node);
    if (kind !== undefined && kind !== 'any' && kind !== 'string' && kind !== 'number') this.#report(FUD1153({ span: this.#span(node) }));
  }

  // ── Kinds ──

  /**
   * What `node` is to an operator. With `presence`, a `T | null` is a `T`: what `===` compares;
   * without, it may be absent, and is not a `T`.
   */
  #kindOf(node: OxcNode, presence = false): Kind | undefined {
    const type = this.#typeOf(node);
    return type === undefined ? undefined : this.#kind(type, presence);
  }

  #kind(type: ts.Type, presence: boolean): Kind {
    if (this.#isAny(type)) return 'any';
    const members = type.isUnion() ? type.types : [type];
    const absent = members.filter((member) => isAbsent(this.#checker, member));
    if (absent.length === members.length) return 'absent';
    if (absent.length > 0 && !presence) return 'other';
    const kinds = new Set(members.filter((member) => !isAbsent(this.#checker, member)).map((member) => this.#single(member)));
    return kinds.size === 1 ? [...kinds][0]! : 'other';
  }

  #single(type: ts.Type): Kind {
    const name = this.#checker.typeToString(type);
    if (name === 'number' || type.isNumberLiteral() || (type.flags & ENUM_LIKE) !== 0) return 'number';
    if (name === 'string' || type.isStringLiteral()) return 'string';
    if (name === 'boolean' || name === 'true' || name === 'false') return 'boolean';
    return this.#isDate(type) ? 'date' : 'other';
  }

  // ── Shapes ──

  /** `any`, or a type TypeScript could not resolve: either way, not this pass's to judge. */
  #isAny(type: ts.Type): boolean {
    return this.#checker.typeToString(type) === 'any';
  }

  #isList(type: ts.Type): boolean {
    return this.#checker.isArrayType(type);
  }

  /** A `map`: an object with an index signature and no named member (§3.10). */
  #isMap(type: ts.Type): boolean {
    return (
      !this.#checker.isArrayType(type) &&
      type.getCallSignatures().length === 0 &&
      this.#checker.getPropertiesOfType(type).length === 0 &&
      this.#checker.getIndexInfosOfType(type).length > 0
    );
  }

  #isDate(type: ts.Type): boolean {
    return type.getSymbol()?.name === 'Date' && this.#fromLibrary(type.getSymbol()!);
  }

  #fromLibrary(symbol: ts.Symbol): boolean {
    return (symbol.declarations ?? []).some((d) => this.program.isSourceFileDefaultLibrary(d.getSourceFile()));
  }

  /** Whether `object[property]` ports: a number into a list, or a key into a `map`. */
  #indexes(object: ts.Type, property: OxcNode): boolean {
    if (this.#isMap(object)) return true;
    return this.#isList(object) && this.#kindOf(property) !== 'string';
  }

  /** `.length` of a list, of a text, or a field of that name a type of the author declares. */
  #hasLength(type: ts.Type): boolean {
    if (this.#isList(type) || this.#kind(type, false) === 'string') return true;
    if (this.#isMap(type)) return false;
    const length = this.#checker.getPropertyOfType(type, 'length');
    return length !== undefined && !this.#fromLibrary(length);
  }

  /** Whether a call with no arguments to a value of `type` reads something reactive (§3.3). */
  #isReactive(type: ts.Type): boolean {
    return isReactive(this.#checker, type);
  }

  // ── Portable types (§3.10) ──

  /** `FUD1153` on `node` when what it evaluates to does not port. */
  #portable(node: OxcNode): void {
    this.#portableAt(this.#span(node));
  }

  /**
   * Whether `type` exists in every backend. `callable` admits a function: only the type of a
   * prop, a callback. `seen` holds the named types being looked into above this one.
   */
  #ports(type: ts.Type, callable: boolean, seen: Set<ts.Type>): boolean {
    if (this.#isAny(type)) return this.#unresolved(type);
    const name = this.#checker.typeToString(type);
    if (PRIMITIVES.has(name) || type.isStringLiteral() || type.isNumberLiteral() || (type.flags & ENUM_LIKE) !== 0) return true;
    if ((type.flags & BIGINT_LIKE) !== 0) return false;
    if (type.isUnion()) return this.#union(type, seen);
    const named = type.aliasSymbol?.name ?? type.getSymbol()?.name ?? '';
    const alias = type.aliasSymbol?.name;
    // `Readable` is generic: an instance of it always carries its arguments.
    if (alias !== undefined && HOLDERS.has(alias)) return this.#holds(type.aliasTypeArguments!, seen);
    if (HOLDERS.has(type.getSymbol()?.name ?? '')) return this.#holds(this.#checker.getTypeArguments(type as ts.TypeReference), seen);
    if (CATALOGUE.has(named) || CATALOGUE.has(type.getSymbol()?.name ?? '')) return true;
    if (this.#isDate(type)) return true;
    if (type.getCallSignatures().length > 0) return callable;
    if ((type.flags & INTERSECTION) !== 0 || this.#checker.isTupleType(type)) return false;
    if (this.#isList(type)) return this.#holds(this.#checker.getTypeArguments(type as ts.TypeReference), seen);
    if (this.#isMap(type)) return this.#checker.getIndexInfosOfType(type).every((info) => this.#ports(info.type, false, seen));
    return this.#object(type, seen);
  }

  /** A type `@fudic/typecheck` could not resolve prints `any` too: TypeScript says why. */
  #unresolved(type: ts.Type): boolean {
    return (type as { readonly intrinsicName?: string }).intrinsicName === 'error';
  }

  #holds(args: readonly ts.Type[], seen: Set<ts.Type>): boolean {
    return args.every((arg) => this.#ports(arg, false, seen));
  }

  /** A union ports as an `enum` of literals, or as one type that may be absent. */
  #union(type: ts.UnionType, seen: Set<ts.Type>): boolean {
    const present = type.types.filter((member) => !isAbsent(this.#checker, member));
    if (present.every((member) => member.isStringLiteral())) return true;
    if (present.every((member) => this.#single(member) === 'boolean')) return true;
    if (present.every((member) => member.isNumberLiteral() || (member.flags & ENUM_LIKE) !== 0)) return true;
    return present.length === 1 && this.#ports(present[0]!, false, seen);
  }

  /** An object: a named type whose members port, never an anonymous one, a class or a library type. */
  #object(type: ts.Type, seen: Set<ts.Type>): boolean {
    const symbol = type.getSymbol();
    const named = type.aliasSymbol !== undefined || (symbol !== undefined && !ANONYMOUS.has(symbol.name));
    if (!named || symbol === undefined) return false;
    if ((symbol.flags & CLASS) !== 0 || this.#fromLibrary(symbol)) return false;
    if (seen.has(type)) return true;
    seen.add(type);
    return this.#checker
      .getPropertiesOfType(type)
      .every((prop) => this.#ports(this.#checker.getTypeOfSymbolAtLocation(prop, this.file), false, seen));
  }

  // ── What the server holds ──

  /** A declarator of the cut: its type ports, and a literal of data has a named type (§3.9). */
  #declaration(declarator: OxcNode): void {
    const id = child(declarator, 'id')!;
    if (id.type === 'ObjectPattern') {
      this.#pattern(id);
      return;
    }
    // A literal with no named type is said once, on the literal: the declaration's type is only
    // the literal's, and saying it on the name too would be the same fact twice.
    const init = child(declarator, 'init')!;
    const before = this.#out.length;
    this.#literals(dataOf(init));
    // A `satisfies` names the type of its literal without making it the declaration's: the
    // literal is what it holds, and the literal has been judged.
    if (this.#out.length === before && !satisfied(init)) this.#portableAt(this.#name(id));
  }

  /** `FUD1153` on `at` when what is written there does not port. */
  #portableAt(at: Span): void {
    const node = this.#nodeAt(at);
    if (node !== undefined && !this.#ports(this.#checker.getTypeAtLocation(node), false, new Set())) this.#report(FUD1153({ span: at }));
  }

  /** Every object literal of a literal of data, each with a named type (§3.9). */
  #literals(node: OxcNode): void {
    if (node.type === 'ArrayExpression') {
      for (const element of children(node, 'elements')) this.#literals(element);
      return;
    }
    if (node.type !== 'ObjectExpression') return;
    const literal = this.#nodeAt(this.#span(node));
    if (literal === undefined) return;
    const context = this.#checker.getContextualType(literal as ts.Expression);
    if (context === undefined || !this.#named(context)) {
      this.#report(FUD1153({ span: this.#span(node) }));
      return;
    }
    // A spread has no value of its own: what it spreads was typed where it was declared.
    const values = children(node, 'properties').map((property) => property['value']).filter(isNode);
    for (const value of values) this.#literals(unwrap(value));
  }

  /** A contextual type with a name: the type the author gave the literal. */
  #named(type: ts.Type): boolean {
    const members = type.isUnion() ? type.types.filter((member) => !isAbsent(this.#checker, member)) : [type];
    return members.every((member) => member.aliasSymbol !== undefined || !ANONYMOUS.has(member.getSymbol()?.name ?? '__type'));
  }

  /** An object pattern does not take a `map` apart: its keys are the runtime's (§3.6). */
  #pattern(pattern: OxcNode): void {
    if (pattern.type === 'AssignmentPattern') {
      this.#expression(child(pattern, 'right')!);
      this.#pattern(child(pattern, 'left')!);
      return;
    }
    if (pattern.type !== 'ObjectPattern') return;
    const type = this.#typeOf(pattern);
    if (type !== undefined && this.#isMap(present(this.#checker, type))) this.#report(FUD1153({ span: this.#span(pattern) }));
    for (const property of children(pattern, 'properties')) {
      this.#pattern(child(property, property.type === 'RestElement' ? 'argument' : 'value')!);
    }
  }

  /** A parameter of a `@snippet`: its type ports, once per parameter (§3.10). */
  #parameter(parameter: OxcNode): void {
    const binding = parameter.type === 'AssignmentPattern' ? child(parameter, 'left')! : parameter;
    if (binding.type === 'Identifier') this.#portableAt(this.#name(binding));
  }

  /** The props of the component: each one ports, a callback included, once per member (§3.10). */
  #props(): void {
    // The projection always exports `$Slots` and `$Sections`: it is a module.
    const module = this.#checker.getSymbolAtLocation(this.file)!;
    // The projection always exports `$Props`: `never` for a file that declares none.
    const contract = this.#checker.getExportsOfModule(module).find((it) => it.name === PROPS_EXPORT)!;
    for (const prop of this.#checker.getPropertiesOfType(this.#checker.getDeclaredTypeOfSymbol(contract))) {
      const declaration = prop.declarations?.[0] as ts.NamedDeclaration | undefined;
      const name = declaration?.name;
      if (name === undefined || declaration!.getSourceFile() !== this.file) continue;
      const at = sourceRange(this.client.mappings, name.getStart(this.file), name.getEnd());
      if (at === undefined) continue;
      const type = this.#checker.getNonNullableType(this.#checker.getTypeOfSymbolAtLocation(prop, this.file));
      if (!this.#ports(type, true, new Set())) this.#report(FUD1153({ span: at }));
    }
  }

  /** `<input ...mapa>`: a spread hands over named fields, which a `map` has none of (§3.8). */
  #spreads(): void {
    const spans: Span[] = [];
    walk(documentRoots(this.document.document), {
      element(el) {
        for (const attr of el.attributes) {
          const at = spreadExpr(attr);
          if (at !== null) spans.push(at);
        }
      },
    });
    for (const at of spans) {
      const node = this.#nodeAt(at);
      if (node !== undefined && this.#isMap(present(this.#checker, this.#checker.getTypeAtLocation(node)))) {
        this.#report(FUD1153({ span: at }));
      }
    }
  }
}

/**
 * Whether a call with no arguments to a value of `type` reads something reactive (§3.3). The
 * editor's completion asks the same question, so it is answered here once.
 */
export function isReactive(checker: ts.TypeChecker, type: ts.Type): boolean {
  const members = type.isUnion() ? type.types.filter((member) => !isAbsent(checker, member)) : [type];
  return members.every((member) => REACTIVE.has(member.aliasSymbol?.name ?? '') || REACTIVE.has(member.getSymbol()?.name ?? ''));
}

/** The primitive names that port (§3.10); `never` is the element of an empty list. */
const PRIMITIVES: ReadonlySet<string> = new Set(['string', 'number', 'boolean', 'true', 'false', 'null', 'undefined', 'never']);

/** `null`, `undefined` or `void`: what presence tests for. */
function isAbsent(checker: ts.TypeChecker, type: ts.Type): boolean {
  const name = checker.typeToString(type);
  return name === 'null' || name === 'undefined' || name === 'void';
}

/** `type` without its `null` and `undefined`: what `?.` and `?.[]` read. */
function present(checker: ts.TypeChecker, type: ts.Type): ts.Type {
  return checker.getNonNullableType(type);
}

/**
 * Where a `.fud` span is in the projection: both ends inside stretches copied one to one that
 * allow a diagnostic. `undefined` for anything that was not copied as written.
 */
function generatedRange(mappings: readonly Mapping[], at: Span): readonly [number, number] | undefined {
  const start = mappings.find((m) => copied(m) && m.sourceOffset <= at.start && at.start < m.sourceOffset + m.sourceLength);
  const end = mappings.find((m) => copied(m) && m.sourceOffset < at.end && at.end <= m.sourceOffset + m.sourceLength);
  if (start === undefined || end === undefined) return undefined;
  return [start.generatedOffset + at.start - start.sourceOffset, end.generatedOffset + at.end - end.sourceOffset];
}

/** The reverse, for a node the checker found: a member of `$Props`. */
function sourceRange(mappings: readonly Mapping[], start: number, end: number): Span | undefined {
  const first = mappings.find((m) => copied(m) && m.generatedOffset <= start && start < m.generatedOffset + m.length);
  const last = mappings.find((m) => copied(m) && m.generatedOffset < end && end <= m.generatedOffset + m.length);
  if (first === undefined || last === undefined) return undefined;
  return { start: first.sourceOffset + start - first.generatedOffset, end: last.sourceOffset + end - last.generatedOffset };
}

function copied(mapping: Mapping): boolean {
  return mapping.caps.verification && mapping.length === mapping.sourceLength;
}

// ── The Oxc AST ──

function child(node: OxcNode, key: string): OxcNode | undefined {
  const value = node[key];
  return isNode(value) ? value : undefined;
}

function children(node: OxcNode, key: string): readonly OxcNode[] {
  // Only ever asked for a list ESTree always has: arguments, declarations, elements, properties.
  return (node[key] as readonly unknown[]).filter(isNode);
}

function field(node: OxcNode, key: string): unknown {
  return node[key];
}

function nameOf(node: OxcNode): string {
  return String(node['name']);
}

function isNode(value: unknown): value is OxcNode {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string';
}

/** A name, or a path of names: what a reactive read is called on (§3.3). */
function isPath(node: OxcNode): boolean {
  if (node.type === 'Identifier') return true;
  return node.type === 'MemberExpression' && field(node, 'computed') !== true && isPath(child(node, 'object')!);
}

/** The value inside parentheses and a `satisfies`: what gives a literal of data its type. */
function unwrap(node: OxcNode): OxcNode {
  let current = node;
  while (current.type === 'ParenthesizedExpression' || current.type === 'TSSatisfiesExpression') {
    current = child(current, 'expression')!;
  }
  return current;
}

/** `{ … } satisfies T`, in parentheses or not. */
function satisfied(init: OxcNode): boolean {
  let current = init;
  while (current.type === 'ParenthesizedExpression') current = child(current, 'expression')!;
  return current.type === 'TSSatisfiesExpression';
}

/** The literal of data of an initializer: itself, or the value of a `signal(…)`. */
function dataOf(init: OxcNode): OxcNode {
  const value = unwrap(init);
  if (value.type !== 'CallExpression') return value;
  const first = children(value, 'arguments')[0];
  return first === undefined ? value : unwrap(first);
}
