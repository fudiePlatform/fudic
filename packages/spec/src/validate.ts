/**
 * The validator: a parsed `.fudspec` checked against what will run it. Each term line against
 * its module (it exists, the module is sound, the arguments match `meta.params` in number and
 * form), and the file against the workspace: the component or the page exists, the fixture lines
 * name what the fixture has, a page with params is opened at a URL, and the terms that name a
 * function, a URL or a file name one that is there.
 *
 * It reads; it never runs. Everything it needs comes in through `SpecContext`, which the host
 * builds from the disk and from the TS program.
 */

import {
  FUD0940,
  FUD0947,
  FUD0948,
  FUD0949,
  FUD0950,
  FUD0951,
  FUD0952,
  FUD0953,
  FUD1500,
  FUD1501,
  FUD1502,
  FUD1503,
  FUD1504,
  FUD1505,
  FUD1506,
  FUD1507,
  FUD1511,
  FUD1512,
  FUD1513,
  type SourceDiagnostic,
  type Span,
} from '@fudic/diagnostics';
import type { Arg, BlockKind, Criterion, HeaderKind, Name, SpecFile, TermLine } from './ast.js';
import type { TermCatalog } from './catalog.js';
import type { FixtureGroup, Fixtures, GroupKey } from './fixtures.js';
import { matchesPattern, type RouteFile } from './routes.js';
import type { ParamType, TermParam } from './term-module.js';

export interface ComponentInfo {
  readonly tag: string;
  /** Absolute path of its `.fud`. */
  readonly path: string;
  /** Props without `?` in `$Props`, or 'unknown' when the type cannot be read. */
  readonly requiredProps: readonly string[] | 'unknown';
}

/** A function or a remote rule a page or a flow can call, with its arguments. */
export interface FunctionInfo {
  readonly name: string;
  readonly args: readonly string[];
  /** Absolute path of the `.fudapi` that declares it. */
  readonly path: string;
  /** Its name in that file. */
  readonly span: Span;
}

/** A page a `page` header names. */
export interface PageInfo extends RouteFile {
  /** Absolute path of its fixture file, whether it exists or not. */
  readonly fixture: string;
  /** Its fixture, read without running it; absent when there is no file. */
  readonly fixtures?: Fixtures;
  /** Whether the route declares `paths`; 'unknown' when the host cannot say. */
  readonly paths: boolean | 'unknown';
  /** What it can call; 'unknown' when the host cannot say. */
  readonly functions: readonly FunctionInfo[] | 'unknown';
}

/** A flow a `flow` header names: nothing to look up but its fixture. */
export interface FlowInfo {
  readonly name: string;
  /** Absolute path of its fixture file, whether it exists or not. */
  readonly fixture: string;
  /** The folder of its `.fudspec`. */
  readonly dir: string;
  readonly fixtures?: Fixtures;
}

export interface SpecContext {
  readonly terms: TermCatalog;
  component(tag: string): ComponentInfo | undefined;
  /** A component's fixture, by its tag. */
  fixtures(tag: string): Fixtures | undefined;
  /** A page by its route as the header writes it: `/blog/[slug]`. */
  page(route: string): PageInfo | undefined;
  flow(name: string): FlowInfo;
  /** Every page of the project. */
  routes(): readonly RouteFile[];
  /** What a flow can call: every function and remote rule of the project; 'unknown' when the host cannot say. */
  functions(): readonly FunctionInfo[] | 'unknown';
  /** Whether a file is there, by its absolute path. */
  exists(path: string): boolean;
}

const TAG = /^[a-z][a-z0-9-]*$/u;

/** Which argument forms each parameter type accepts (SDD-52 §3.5). */
const ACCEPTS: Readonly<Record<ParamType, (arg: Arg) => boolean>> = {
  number: (arg) => arg.kind === 'bare' && Number.isFinite(Number(arg.text)),
  string: (arg) => arg.kind !== 'role',
  token: (arg) => arg.kind === 'bare',
  element: (arg) =>
    arg.kind === 'role' ? arg.steps.every((s) => s.kind === 'role' || TAG.test(s.tag.text)) : arg.kind === 'bare' && TAG.test(arg.text),
};

/** `minHeight` → `min-height`: the file name is the term, and file names are kebab-case. */
export function normalizeTerm(term: string): string {
  return term.replace(/(?<=.)[A-Z]/gu, (upper) => `-${upper}`).toLowerCase();
}

/** A fixture line: the kinds of spec it belongs to, its parameter, and whether it takes several. */
export interface FixtureLine {
  readonly kinds: readonly HeaderKind[];
  readonly param: 'fixture' | 'value' | 'url';
  readonly many: boolean;
  /** The group of a page's or a flow's fixture it names into; absent for `props`, `path` and `url`. */
  readonly group?: GroupKey;
}

/** The lines that are not terms (SDD-82 §3.6): the validator resolves them against the fixture and the page. */
export const FIXTURE_LINES: Readonly<Record<string, FixtureLine>> = {
  props: { kinds: ['component'], param: 'fixture', many: false },
  data: { kinds: ['page'], param: 'fixture', many: true, group: 'data' },
  answers: { kinds: ['page', 'flow'], param: 'fixture', many: true, group: 'calls' },
  services: { kinds: ['page', 'flow'], param: 'fixture', many: false, group: 'services' },
  path: { kinds: ['page'], param: 'value', many: false },
  url: { kinds: ['page', 'flow'], param: 'url', many: false },
};

/** `as <who>`: a line of any block, the person what follows is done by. */
export const AS_LINE = 'as';

/**
 * The fixture line a line of `block` is, or undefined when it is a term (SDD-82 §8.2.12): in
 * `given` the name decides, and elsewhere only where no term of the block has that name —
 * `then url` is a term.
 */
export function fixtureLineOf(name: string, block: BlockKind, terms: TermCatalog): FixtureLine | undefined {
  const line = FIXTURE_LINES[name];
  return line !== undefined && (block === 'given' || terms.resolve(block, name) === undefined) ? line : undefined;
}

const AS_PARAMS: readonly TermParam[] = [{ name: 'who', type: 'token' }];
const BLOCKS: readonly BlockKind[] = ['given', 'when', 'then'];

/** What the file specifies, as far as the context knows it. */
interface Subject {
  readonly kind?: HeaderKind;
  readonly tag?: Name;
  readonly component?: ComponentInfo;
  readonly page?: PageInfo;
  readonly flow?: FlowInfo;
}

/** What every check of one file reads and where it writes. */
interface Env {
  readonly ctx: SpecContext;
  readonly subject: Subject;
  readonly out: SourceDiagnostic[];
}

/** Checks a parsed file. Never throws; the diagnostics come sorted by position. */
export function validateSpec(file: SpecFile, ctx: SpecContext): readonly SourceDiagnostic[] {
  const out: SourceDiagnostic[] = [];
  const env: Env = { ctx, subject: subjectOf(file, ctx, out), out };
  for (const criterion of file.criteria) checkCriterion(criterion, env);
  return out.sort((a, b) => a.span.start - b.span.start);
}

/** The header, looked up: a component that is not there is `FUD0949`, a page `FUD1500`. */
function subjectOf(file: SpecFile, ctx: SpecContext, out: SourceDiagnostic[]): Subject {
  const header = file.header;
  if (header === undefined) return {};
  const name = header.name;
  if (name === undefined) return { kind: header.header };
  switch (header.header) {
    case 'component': {
      const component = ctx.component(name.text);
      if (component === undefined) out.push(FUD0949({ span: name.span, tag: name.text }));
      return { kind: 'component', tag: name, ...(component !== undefined ? { component } : {}) };
    }
    case 'page': {
      const page = ctx.page(name.text);
      if (page === undefined) out.push(FUD1500({ span: name.span, route: name.text }));
      return { kind: 'page', ...(page !== undefined ? { page } : {}) };
    }
    case 'flow':
      return { kind: 'flow', flow: ctx.flow(name.text) };
  }
}

function checkCriterion(criterion: Criterion, env: Env): void {
  // Every fixture line counts as given, even a misplaced one: it already has its own error.
  const named = new Set<string>();
  const placed = new Set<string>();
  for (const block of criterion.blocks) {
    for (const term of block.terms) {
      const name = term.name.text;
      const line = fixtureLineOf(name, block.block, env.ctx.terms);
      if (name === AS_LINE) {
        checkAs(term, env);
      } else if (line !== undefined) {
        named.add(name);
        checkLine(term, line, block.block !== 'given' || placed.has(name), env);
        placed.add(name);
      } else if (checkTerm(term, block.block, env.ctx.terms, env.out)) {
        TERM_CHECKS[`${block.block}/${normalizeTerm(name)}`]?.(term, env);
      }
    }
  }
  const at = criterion.slug?.span ?? criterion.keyword;
  const { component, page } = env.subject;
  const required = component?.requiredProps;
  if (required !== undefined && required !== 'unknown' && required.length > 0 && !named.has('props')) {
    out(env, FUD0951({ span: at, tag: component!.tag, required }));
  }
  if (page !== undefined && page.params.length > 0 && !named.has('path') && !named.has('url')) {
    out(env, FUD1504({ span: at, route: page.route, params: page.params }));
  }
}

const out = (env: Env, d: SourceDiagnostic): void => {
  env.out.push(d);
};

/** A term line: it resolves, its module is sound, and its arguments fit `meta.params`. True when all of that holds. */
function checkTerm(term: TermLine, block: BlockKind, terms: TermCatalog, out: SourceDiagnostic[]): boolean {
  const name = normalizeTerm(term.name.text);
  const module = terms.resolve(block, name);
  if (module === undefined) {
    const available = terms.list(block).map((m) => m.name);
    out.push(FUD0940({ span: term.name.span, term: name, block, available }));
    return false;
  }
  // A broken module is reported on the line that uses it, and its parameters are not trusted.
  if (module.diagnostics.length > 0) {
    for (const d of module.diagnostics) out.push(relocate(d, term.name.span, module.path, 'in the term module'));
    return false;
  }
  return checkArgs(term, module.params, out);
}

/** A problem of another file, moved onto the line that uses it and pointing back at it. */
function relocate(d: SourceDiagnostic, at: Span, path: string, message: string): SourceDiagnostic {
  return {
    severity: d.severity,
    code: d.code,
    message: d.message,
    span: at,
    related: [{ span: d.span, file: path, message }],
  };
}

/** Arity first; with the arity wrong the forms are not checked. True when everything fits. */
function checkArgs(term: TermLine, params: readonly TermParam[], out: SourceDiagnostic[]): boolean {
  if (term.args.length !== params.length) {
    out.push(FUD0947({ span: term.span, term: term.name.text, expected: params.length, actual: term.args.length }));
    return false;
  }
  let fits = true;
  term.args.forEach((arg, i) => {
    const param = params[i] as TermParam;
    if (!ACCEPTS[param.type](arg)) {
      out.push(FUD0948({ span: arg.span, param: param.name, type: param.type, form: arg.kind }));
      fits = false;
    }
  });
  return fits;
}

/** A fixture line: in `given`, once, in a spec of its kind, with names its fixture has. */
function checkLine(term: TermLine, line: FixtureLine, misplaced: boolean, env: Env): void {
  const name = term.name.text;
  if (misplaced) return out(env, FUD0952({ span: term.name.span, line: name }));
  const { kind } = env.subject;
  if (kind !== undefined && !line.kinds.includes(kind)) {
    return out(env, FUD1501({ span: term.name.span, line: name, kind, belongs: line.kinds }));
  }
  const count = line.many ? Math.max(term.args.length, 1) : 1;
  const params = Array.from({ length: count }, (): TermParam => ({ name: line.param, type: 'string' }));
  if (!checkArgs(term, params, env.out)) return;
  LINE_CHECKS[name]?.(term, env);
}

/** What each fixture line checks once it is placed and well formed. */
const LINE_CHECKS: Readonly<Record<string, (term: TermLine, env: Env) => void>> = {
  props: (term, env) => {
    const tag = env.subject.tag;
    // Without a component there is nothing to look the fixture up in, and that has its own error.
    if (tag === undefined) return;
    const fixtures = env.ctx.fixtures(tag.text);
    if (fixtures === undefined) return out(env, FUD0953({ span: term.name.span, fixture: `${tag.text}.fixture.ts` }));
    const arg = term.args[0] as Arg & { text: string };
    if (!fixtures.names.some((n) => n.text === arg.text)) {
      out(env, FUD0950({ span: arg.span, line: 'props', fixture: arg.text, available: fixtures.names.map((n) => n.text) }));
    }
  },
  data: (term, env) => checkNames(term, env),
  answers: (term, env) => checkNames(term, env),
  services: (term, env) => checkNames(term, env),
  path: (term, env) => {
    const page = env.subject.page;
    if (page === undefined) return;
    const fixtures = fixturesOf(term, env);
    if (fixtures === undefined) return;
    const arg = term.args[0] as Arg & { text: string };
    const paths = fixtures.paths;
    if (paths?.names.some((n) => n.text === arg.text) === true) return;
    if (paths?.problem !== undefined) return out(env, relocate(paths.problem, arg.span, fixtures.path, 'in the fixture'));
    out(env, FUD1502({ span: arg.span, value: arg.text, paths: paths?.names.map((n) => n.text) ?? [] }));
  },
  url: (term, env) => {
    const arg = term.args[0] as Arg & { text: string };
    const page = env.subject.page;
    if (page !== undefined && !matchesPattern(page.pattern, arg.text)) {
      out(env, FUD1503({ span: arg.span, url: arg.text, pattern: page.pattern }));
    }
    if (env.subject.kind === 'flow') checkFlowUrl(arg, env);
  },
};

/** The fixture of a page or a flow; undefined, after `FUD0953`, when there is no file. */
function fixturesOf(term: TermLine, env: Env): Fixtures | undefined {
  const owner = env.subject.page ?? env.subject.flow;
  // A page that is not there has its own error, and nothing to look the fixture up in.
  if (owner === undefined) return undefined;
  if (owner.fixtures === undefined) {
    out(env, FUD0953({ span: term.name.span, fixture: owner.fixture.slice(owner.fixture.lastIndexOf('/') + 1) }));
  }
  return owner.fixtures;
}

/** `data`, `answers`, `services`: every name is a key of its group of the fixture. */
function checkNames(term: TermLine, env: Env): void {
  const fixtures = fixturesOf(term, env);
  if (fixtures === undefined) return;
  const group: FixtureGroup | undefined = fixtures[FIXTURE_LINES[term.name.text]!.group!];
  for (const arg of term.args as readonly (Arg & { text: string })[]) {
    if (group?.names.some((n) => n.text === arg.text) === true) continue;
    if (group?.problem !== undefined) out(env, relocate(group.problem, arg.span, fixtures.path, 'in the fixture'));
    else out(env, FUD0950({ span: arg.span, line: term.name.text, fixture: arg.text, available: group?.names.map((n) => n.text) ?? [] }));
  }
}

/** A URL of a flow: some page of the project answers it (`FUD1505`, a warning). */
function checkFlowUrl(arg: Arg & { text: string }, env: Env): void {
  if (!env.ctx.routes().some((r) => matchesPattern(r.pattern, arg.text))) out(env, FUD1505({ span: arg.span, url: arg.text }));
}

/** `as <who>`: one name, and not one of a term — a person is not a step. */
function checkAs(term: TermLine, env: Env): void {
  if (!checkArgs(term, AS_PARAMS, env.out)) return;
  const who = term.args[0] as Arg & { text: string };
  if (BLOCKS.some((block) => env.ctx.terms.resolve(block, normalizeTerm(who.text)) !== undefined)) {
    out(env, FUD1512({ span: who.span, name: who.text }));
  }
}

/** What a page or a flow can call; 'unknown' for a component, or when the host cannot say. */
function reach(env: Env): readonly FunctionInfo[] | 'unknown' {
  const { kind, page } = env.subject;
  if (kind === 'flow') return env.ctx.functions();
  return page?.functions ?? 'unknown';
}

/** The function `called` or `sent` names, after `FUD1506` when it is out of reach. */
function functionOf(term: TermLine, env: Env): FunctionInfo | undefined {
  const functions = reach(env);
  if (functions === 'unknown') return undefined;
  const arg = term.args[0] as Arg & { text: string };
  const found = functions.find((f) => f.name === arg.text);
  if (found === undefined) out(env, FUD1506({ span: arg.span, fn: arg.text, available: functions.map((f) => f.name) }));
  return found;
}

/** The folder of the `.fudspec`: beside the component or the page, or the flows folder. */
function specDir(subject: Subject): string | undefined {
  const path = subject.component?.path ?? subject.page?.path;
  return path === undefined ? subject.flow?.dir : path.slice(0, path.lastIndexOf('/'));
}

/** `dir` joined with a relative path, `.` and `..` resolved. */
function resolvePath(dir: string, relative: string): string {
  const parts = dir.split('/');
  for (const part of relative.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.' && part !== '') parts.push(part);
  }
  return parts.join('/');
}

/** What the terms that name a function, a URL, a list or a file check, past their arguments. */
const TERM_CHECKS: Readonly<Record<string, (term: TermLine, env: Env) => void>> = {
  'when/go': (term, env) => {
    if (env.subject.kind === 'flow') checkFlowUrl(term.args[0] as Arg & { text: string }, env);
  },
  'then/called': (term, env) => {
    functionOf(term, env);
  },
  'then/sent': (term, env) => {
    const fn = functionOf(term, env);
    const field = term.args[1] as Arg & { text: string };
    const arg = field.text.split('.')[0] as string;
    if (fn !== undefined && !fn.args.includes(arg)) out(env, FUD1507({ span: field.span, fn: fn.name, field: arg, args: fn.args }));
  },
  'then/lists': (term, env) => {
    const page = env.subject.page;
    if (page !== undefined && page.paths === false) out(env, FUD1513({ span: term.name.span, route: page.route }));
  },
  'when/upload': (term, env) => {
    const dir = specDir(env.subject);
    const file = term.args[1] as Arg & { text: string };
    if (dir !== undefined && !env.ctx.exists(resolvePath(dir, file.text))) out(env, FUD1511({ span: file.span, path: file.text }));
  },
};
