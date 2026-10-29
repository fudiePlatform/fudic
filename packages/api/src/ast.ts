/**
 * The `.fudapi` syntax tree. Every node carries a `Span` (UTF-16 offsets, `[start, end)`) over
 * the original text, every declaration its documentation, and every node is read-only: the
 * language server navigates it by offset and never mutates it.
 *
 * The tree is syntax only. Whether a name exists, a rule applies to a type or a middleware
 * takes those parameters is the validator's business, against the project index.
 */

import type { SourceDiagnostic, Span } from '@fudic/diagnostics';

/** What the parser always answers: a value, partial when the input is broken, and what it found. */
export interface ParseResult<T> {
  readonly value: T;
  readonly diagnostics: readonly SourceDiagnostic[];
}

/** A word with its place: a name, a keyword, a mode. */
export interface Name {
  readonly text: string;
  readonly span: Span;
}

/** The `#` lines right above a line, without their `#`, joined by `\n`. */
interface Documented {
  readonly doc?: string;
}

// ---------------------------------------------------------------------------------------------
// Types and literals
// ---------------------------------------------------------------------------------------------

/** `str`, `html`, `i32`, `uuid`, `Person`: a primitive or a project type, resolved by the validator. */
export interface NamedType {
  readonly kind: 'named';
  readonly name: Name;
  readonly span: Span;
}

/** `T[]`. */
export interface ListType {
  readonly kind: 'list';
  readonly element: TypeExpr;
  readonly span: Span;
}

/** `T?`: the field may be missing. */
export interface OptionalType {
  readonly kind: 'optional';
  readonly inner: TypeExpr;
  readonly span: Span;
}

/** `map K V`. */
export interface MapType {
  readonly kind: 'map';
  readonly keyword: Span;
  readonly key: TypeExpr;
  readonly value: TypeExpr;
  readonly span: Span;
}

export type TypeExpr = NamedType | ListType | OptionalType | MapType;

/** A double-quoted string. `text` is unescaped; `span` includes the quotes. */
export interface StringLiteral {
  readonly kind: 'string';
  readonly text: string;
  readonly span: Span;
}

export interface NumberLiteral {
  readonly kind: 'number';
  readonly value: number;
  readonly span: Span;
}

export interface BoolLiteral {
  readonly kind: 'bool';
  readonly value: boolean;
  readonly span: Span;
}

/** `[]`: the only list a `.fudapi` writes. */
export interface EmptyListLiteral {
  readonly kind: 'empty-list';
  readonly span: Span;
}

/** An unquoted word: a pattern name, a path, an enum member. Its meaning is decided later. */
export interface WordLiteral {
  readonly kind: 'word';
  readonly text: string;
  readonly span: Span;
}

export type Literal = StringLiteral | NumberLiteral | BoolLiteral | EmptyListLiteral | WordLiteral;

// ---------------------------------------------------------------------------------------------
// Expressions of `require` and `when`
// ---------------------------------------------------------------------------------------------

/** `access.key`: a field of the form, through its groups. */
export interface PathExpr {
  readonly kind: 'path';
  readonly segments: readonly Name[];
  readonly span: Span;
}

export interface LiteralExpr {
  readonly kind: 'literal';
  readonly literal: StringLiteral | NumberLiteral | BoolLiteral;
  readonly span: Span;
}

/** `valid c`, `empty c`, `length c`. */
export interface CallExpr {
  readonly kind: 'call';
  readonly fn: Name;
  readonly arg: PathExpr;
  readonly span: Span;
}

export interface NotExpr {
  readonly kind: 'not';
  readonly keyword: Span;
  readonly operand: Expr;
  readonly span: Span;
}

export type BinaryOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | 'contains' | 'and' | 'or';

export interface BinaryExpr {
  readonly kind: 'binary';
  readonly op: BinaryOp;
  readonly opSpan: Span;
  readonly left: Expr;
  readonly right: Expr;
  readonly span: Span;
}

/** `( … )`, kept so that a span over it is its exact text. */
export interface GroupExpr {
  readonly kind: 'group';
  readonly inner: Expr;
  readonly span: Span;
}

export type Expr = PathExpr | LiteralExpr | CallExpr | NotExpr | BinaryExpr | GroupExpr;

// ---------------------------------------------------------------------------------------------
// Clauses shared by functions, `load`, `chain` and middlewares
// ---------------------------------------------------------------------------------------------

/** `routes 403 /entrar`: one parameter line under a `use`. */
export interface MiddlewareArg {
  readonly name: Name;
  readonly values: readonly Literal[];
  readonly span: Span;
}

/** One middleware named by a `use`, with the parameter lines below it. */
export interface MiddlewareRef {
  readonly name: Name;
  /** The lines under the `use`: they belong to its last middleware. */
  readonly args: readonly MiddlewareArg[];
}

export interface UseClause {
  readonly kind: 'use';
  readonly keyword: Span;
  readonly middlewares: readonly MiddlewareRef[];
  readonly span: Span;
}

export interface SkipClause {
  readonly kind: 'skip';
  readonly keyword: Span;
  /** Empty for `skip *`. */
  readonly middlewares: readonly Name[];
  /** `skip *`: every inherited middleware. */
  readonly all?: Span;
  readonly span: Span;
}

export type CompressEncoding = 'gzip' | 'deflate' | 'deflate-raw';

export interface CompressClause {
  readonly kind: 'compress';
  readonly keyword: Span;
  /** Absent for `compress off`. */
  readonly encoding?: Name;
  /** The minimum size in bytes. */
  readonly min?: NumberLiteral;
  /** `compress off`. */
  readonly off?: Span;
  readonly span: Span;
}

/** `fails <code> <status> ["<detail>"]`: a named rejection the handler throws. */
export interface FailsClause extends Documented {
  readonly kind: 'fails';
  readonly keyword: Span;
  readonly code: Name;
  readonly status: NumberLiteral;
  readonly detail?: StringLiteral;
  readonly span: Span;
}

/** `<name>  <type>`: a field of a type, `load`, `adds` or the parameter of a rule/middleware. */
export interface TypedField extends Documented {
  readonly kind: 'field';
  readonly name: Name;
  readonly type: TypeExpr;
  /** `later` after the type: `load` returns this field as a promise. Only a field of `load`. */
  readonly later?: Span;
  readonly span: Span;
}

// ---------------------------------------------------------------------------------------------
// Declarations of a contract file
// ---------------------------------------------------------------------------------------------

export type Verb = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** One segment of a function route: `lines` or `:line`. */
export interface RouteSegment {
  readonly kind: 'literal' | 'param';
  /** Without the `:`. */
  readonly text: string;
  readonly span: Span;
}

/** `/:id/lines/:line`. */
export interface Route {
  readonly segments: readonly RouteSegment[];
  readonly span: Span;
}

/** Where an argument travels (SDD §3.3). */
export type ArgPlace = 'route' | 'query' | 'body';

export interface ArgDecl extends Documented {
  readonly kind: 'arg';
  readonly name: Name;
  readonly type: TypeExpr;
  readonly place: ArgPlace;
  /** The `query` keyword, for a query argument. */
  readonly query?: Span;
  /** The rules below it, as under a form field (SDD-67 §3.5). */
  readonly rules: readonly RuleUse[];
  readonly span: Span;
}

export interface FormRef {
  readonly keyword: Span;
  readonly name: Name;
  readonly span: Span;
}

export interface InvalidatesClause {
  readonly keyword: Span;
  readonly routes: readonly Name[];
  readonly span: Span;
}

export interface ReturnsClause {
  readonly arrow: Span;
  readonly type: TypeExpr;
  readonly span: Span;
}

export interface FnDecl extends Documented {
  readonly kind: 'fn';
  readonly verb: Verb;
  readonly verbSpan: Span;
  readonly name: Name;
  readonly route?: Route;
  readonly uses: readonly UseClause[];
  readonly skips: readonly SkipClause[];
  readonly form?: FormRef;
  readonly invalidates: readonly InvalidatesClause[];
  readonly compress?: CompressClause;
  readonly fails: readonly FailsClause[];
  readonly args: readonly ArgDecl[];
  readonly returns?: ReturnsClause;
  readonly span: Span;
}

export type LoadMode = 'ssg' | 'ssr' | 'sw';
export type LoadPolicy = 'cache-first' | 'network-first' | 'stale-while-revalidate' | 'network-only';

/** `5m`: a number and `s`, `m`, `h` or `d`. */
export interface Duration {
  readonly text: string;
  readonly ms: number;
  readonly span: Span;
}

export interface PageOption {
  readonly keyword: Span;
  readonly value: Name;
  readonly duration?: Duration;
  readonly span: Span;
}

export interface LoadDecl extends Documented {
  readonly kind: 'load';
  readonly keyword: Span;
  readonly mode?: Name;
  readonly ttl?: Duration;
  readonly policy?: Name;
  readonly page?: PageOption;
  readonly uses: readonly UseClause[];
  readonly skips: readonly SkipClause[];
  readonly fails: readonly FailsClause[];
  /** The shape of `data`. */
  readonly fields: readonly TypedField[];
  readonly span: Span;
}

export interface PathsDecl extends Documented {
  readonly kind: 'paths';
  readonly keyword: Span;
  readonly span: Span;
}

export interface LayoutDecl extends Documented {
  readonly kind: 'layout';
  readonly keyword: Span;
  readonly span: Span;
}

export interface ChainDecl extends Documented {
  readonly kind: 'chain';
  readonly keyword: Span;
  readonly uses: readonly UseClause[];
  readonly skips: readonly SkipClause[];
  readonly compress?: CompressClause;
  readonly span: Span;
}

export interface TypeDecl extends Documented {
  readonly kind: 'type';
  readonly keyword: Span;
  readonly name: Name;
  readonly fields: readonly TypedField[];
  readonly span: Span;
}

export interface EnumDecl extends Documented {
  readonly kind: 'enum';
  readonly keyword: Span;
  readonly name: Name;
  readonly members: readonly Name[];
  readonly span: Span;
}

// ---------------------------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------------------------

export type ValidateOnEvent = 'submit' | 'blur' | 'input';
export type ValidityMode = 'rules' | 'interacted';

export interface ValidateOnOption {
  readonly keyword: Span;
  readonly events: readonly Name[];
  readonly span: Span;
}

export interface ValidityOption {
  readonly keyword: Span;
  readonly value: Name;
  readonly span: Span;
}

export interface CatchesOption {
  readonly keyword: Span;
  readonly statuses: readonly NumberLiteral[];
  readonly span: Span;
}

/** `<rule> <arg>* ["<text>"]` under a field or in a `summary`. */
export interface RuleUse extends Documented {
  readonly kind: 'rule-use';
  readonly name: Name;
  readonly args: readonly Literal[];
  readonly text?: StringLiteral;
  readonly span: Span;
}

/** `require <code> <expr> ["<text>"] [on <field>]`. */
export interface RequireRule extends Documented {
  readonly kind: 'require';
  readonly keyword: Span;
  readonly code: Name;
  /** Absent when the expression did not parse (`FUD1069`). */
  readonly expr?: Expr;
  readonly text?: StringLiteral;
  readonly on?: PathExpr;
  readonly span: Span;
}

/** `when <expr>` and the `require` lines below it. */
export interface WhenBlock extends Documented {
  readonly kind: 'when';
  readonly keyword: Span;
  readonly expr?: Expr;
  readonly rules: readonly RequireRule[];
  readonly span: Span;
}

export type SummaryItem = RuleUse | RequireRule | WhenBlock;

export interface SummaryBlock {
  readonly keyword: Span;
  readonly items: readonly SummaryItem[];
  readonly span: Span;
}

/** A form field with a type: `alias  str = ""` and its options and rules below. */
export interface FieldDecl extends Documented {
  readonly kind: 'form-field';
  readonly name: Name;
  readonly type: TypeExpr;
  readonly initial?: Literal;
  readonly validateOn?: ValidateOnOption;
  readonly validity?: ValidityOption;
  /** The text of the range check its type implies. */
  readonly range?: StringLiteral;
  readonly rules: readonly RuleUse[];
  readonly span: Span;
}

/** `access  group`: fields one level down, with their own options and `summary`. */
export interface FormGroup extends Documented {
  readonly kind: 'form-group';
  readonly name: Name;
  readonly keyword: Span;
  readonly validateOn?: ValidateOnOption;
  readonly validity?: ValidityOption;
  readonly fields: readonly FormMember[];
  readonly summary?: SummaryBlock;
  readonly span: Span;
}

export type FormMember = FieldDecl | FormGroup;

export interface FormDecl extends Documented {
  readonly kind: 'form';
  readonly keyword: Span;
  readonly name: Name;
  readonly validateOn?: ValidateOnOption;
  readonly validity?: ValidityOption;
  readonly catches?: CatchesOption;
  readonly fields: readonly FormMember[];
  readonly summary?: SummaryBlock;
  readonly span: Span;
}

export interface MessageEntry extends Documented {
  readonly code: Name;
  readonly text: StringLiteral;
  readonly span: Span;
}

export interface MessagesDecl extends Documented {
  readonly kind: 'messages';
  readonly keyword: Span;
  readonly entries: readonly MessageEntry[];
  readonly span: Span;
}

// ---------------------------------------------------------------------------------------------
// Declarations of an extensions file
// ---------------------------------------------------------------------------------------------

export type RuleTarget = 'field' | 'group' | 'form';

export interface RuleOn {
  readonly keyword: Span;
  readonly target: Name;
  /** The field types it applies to, for `on field`. */
  readonly types: readonly TypeExpr[];
  readonly span: Span;
}

export interface RuleRuns {
  readonly keyword: Span;
  readonly value: Name;
  readonly span: Span;
}

/** `fails <code> [<param>]+` of a rule: the parameters reach its text. */
export interface RuleFails extends Documented {
  readonly keyword: Span;
  readonly code: Name;
  readonly params: readonly Name[];
  readonly span: Span;
}

export interface RuleDecl extends Documented {
  readonly kind: 'rule';
  readonly keyword: Span;
  readonly name: Name;
  readonly on?: RuleOn;
  readonly runs?: RuleRuns;
  readonly async?: Span;
  readonly params: readonly TypedField[];
  readonly fails: readonly RuleFails[];
  readonly span: Span;
}

export interface AddsBlock {
  readonly keyword: Span;
  readonly fields: readonly TypedField[];
  readonly span: Span;
}

export interface MiddlewareDecl extends Documented {
  readonly kind: 'middleware';
  readonly keyword: Span;
  readonly name: Name;
  readonly client?: Span;
  readonly server?: Span;
  readonly params: readonly TypedField[];
  readonly adds?: AddsBlock;
  readonly fails: readonly FailsClause[];
  readonly span: Span;
}

export interface PatternDecl extends Documented {
  readonly kind: 'pattern';
  readonly keyword: Span;
  readonly name: Name;
  /** The rest of the line, as written: the regex without its anchors. */
  readonly source: Name;
  readonly span: Span;
}

export type ContractDecl =
  | FnDecl
  | LoadDecl
  | PathsDecl
  | LayoutDecl
  | ChainDecl
  | FormDecl
  | MessagesDecl;

export type ExtensionDecl = RuleDecl | MiddlewareDecl | PatternDecl;

export type Decl = ContractDecl | ExtensionDecl | TypeDecl | EnumDecl;

/** What a file is, by its first declaration that is not a `type` or an `enum`. */
export type FileRole = 'contract' | 'extensions';

export interface ApiFile {
  readonly kind: 'file';
  readonly declarations: readonly Decl[];
  /** Absent for a file of only types and enums (or none). */
  readonly role?: FileRole;
  readonly span: Span;
}
