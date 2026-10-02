/**
 * The validator: a parsed `.fudspec` checked against what will run it. Each term line against
 * its module (it exists, the module is sound, the arguments match `meta.params` in number and
 * form), and the file against the workspace (the component exists, its fixtures exist, and a
 * component with required props gets them in every criterion).
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
  type SourceDiagnostic,
  type Span,
} from '@fudic/diagnostics';
import type { Arg, BlockKind, Criterion, Name, SpecFile, TermLine } from './ast.js';
import type { TermCatalog } from './catalog.js';
import type { Fixtures } from './fixtures.js';
import type { ParamType, TermParam } from './term-module.js';

export interface ComponentInfo {
  readonly tag: string;
  /** Absolute path of its `.fud`. */
  readonly path: string;
  /** Props without `?` in `$Props`, or 'unknown' when the type cannot be read. */
  readonly requiredProps: readonly string[] | 'unknown';
}

export interface SpecContext {
  readonly terms: TermCatalog;
  component(tag: string): ComponentInfo | undefined;
  fixtures(tag: string): Fixtures | undefined;
}

/** The one line that is not a term: the validator resolves it against the component. */
const PROPS = 'props';
const PROPS_PARAMS: readonly TermParam[] = [{ name: 'fixture', type: 'string' }];

const TAG = /^[a-z][a-z0-9-]*$/u;

/** Which argument forms each parameter type accepts (SDD-52 §3.5). */
const ACCEPTS: Readonly<Record<ParamType, (arg: Arg) => boolean>> = {
  number: (arg) => arg.kind === 'bare' && Number.isFinite(Number(arg.text)),
  string: (arg) => arg.kind !== 'role',
  token: (arg) => arg.kind === 'bare',
  element: (arg) => arg.kind === 'role' || (arg.kind === 'bare' && TAG.test(arg.text)),
};

/** `minHeight` → `min-height`: the file name is the term, and file names are kebab-case. */
function kebab(term: string): string {
  return term.replace(/(?<=.)[A-Z]/gu, (upper) => `-${upper}`).toLowerCase();
}

/** Checks a parsed file. Never throws; the diagnostics come sorted by position. */
export function validateSpec(file: SpecFile, ctx: SpecContext): readonly SourceDiagnostic[] {
  const out: SourceDiagnostic[] = [];
  const tag = file.component?.tag;
  const component = tag === undefined ? undefined : checkComponent(tag, ctx, out);
  for (const criterion of file.criteria) checkCriterion(criterion, tag, component, ctx, out);
  return out.sort((a, b) => a.span.start - b.span.start);
}

function checkComponent(tag: Name, ctx: SpecContext, out: SourceDiagnostic[]): ComponentInfo | undefined {
  const component = ctx.component(tag.text);
  if (component === undefined) out.push(FUD0949({ span: tag.span, tag: tag.text }));
  return component;
}

function checkCriterion(
  criterion: Criterion,
  tag: Name | undefined,
  component: ComponentInfo | undefined,
  ctx: SpecContext,
  out: SourceDiagnostic[],
): void {
  // Any `props` line counts, even a misplaced one: it already has its own error.
  let props = false;
  for (const block of criterion.blocks) {
    for (const term of block.terms) {
      if (term.name.text === PROPS) {
        checkProps(term, block.block, props, tag, ctx, out);
        props = true;
      } else {
        checkTerm(term, block.block, ctx.terms, out);
      }
    }
  }
  if (props || component === undefined) return;
  const required = component.requiredProps;
  if (required !== 'unknown' && required.length > 0) {
    out.push(FUD0951({ span: criterion.slug?.span ?? criterion.keyword, tag: component.tag, required }));
  }
}

/** A term line: it resolves, its module is sound, and its arguments fit `meta.params`. */
function checkTerm(term: TermLine, block: BlockKind, terms: TermCatalog, out: SourceDiagnostic[]): void {
  const name = kebab(term.name.text);
  const module = terms.resolve(block, name);
  if (module === undefined) {
    const available = terms.list(block).map((m) => m.name);
    out.push(FUD0940({ span: term.name.span, term: name, block, available }));
    return;
  }
  // A broken module is reported on the line that uses it, and its parameters are not trusted.
  if (module.diagnostics.length > 0) {
    for (const d of module.diagnostics) out.push(relocate(d, term.name.span, module.path));
    return;
  }
  checkArgs(term, module.params, out);
}

/** A module's own problem, moved onto the line that uses the module and pointing back at it. */
function relocate(d: SourceDiagnostic, at: Span, path: string): SourceDiagnostic {
  return {
    severity: d.severity,
    code: d.code,
    message: d.message,
    span: at,
    related: [{ span: d.span, file: path, message: 'in the term module' }],
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
    const param = params[i];
    if (param !== undefined && !ACCEPTS[param.type](arg)) {
      out.push(FUD0948({ span: arg.span, param: param.name, type: param.type, form: arg.kind }));
      fits = false;
    }
  });
  return fits;
}

/** `props <fixture>`: in `given`, once, with one name that the fixture file has. */
function checkProps(
  term: TermLine,
  block: BlockKind,
  seen: boolean,
  tag: Name | undefined,
  ctx: SpecContext,
  out: SourceDiagnostic[],
): void {
  if (block !== 'given' || seen) {
    out.push(FUD0952({ span: term.name.span }));
    return;
  }
  const [arg] = term.args;
  // Without a component there is nothing to look the fixture up in, and that has its own error.
  if (!checkArgs(term, PROPS_PARAMS, out) || arg === undefined || arg.kind === 'role' || tag === undefined) return;
  const fixtures = ctx.fixtures(tag.text);
  if (fixtures === undefined) {
    out.push(FUD0953({ span: term.name.span, tag: tag.text }));
    return;
  }
  if (!fixtures.names.some((n) => n.text === arg.text)) {
    out.push(FUD0950({ span: arg.span, fixture: arg.text, available: fixtures.names.map((n) => n.text) }));
  }
}
