/**
 * The light bulb of a `.fudspec` (SDD-53 §4.5).
 *
 * As in the `.fud` (SDD-36): every action hangs on a diagnostic of this server and carries its
 * whole `WorkspaceEdit`, no `command` and no `resolve`. The diagnostics are recomputed here rather
 * than taken from the request — the parse is a few dozen lines, and a repair computed against a
 * span the client rendered a keystroke ago edits the wrong stretch.
 *
 * What a repair writes into another file — a term module, a fixture — is `@fudic/spec`'s, the
 * same text `fudic g` writes, so the terminal and the bulb never disagree about a new file.
 */

import type { CodeAction, TextEdit, WorkspaceEdit } from '@volar/language-service';
import type { FudCode, SourceDiagnostic, Span } from '@fudic/diagnostics';
import {
  closest,
  fixtureEntry,
  fixtureModule,
  formatSpec,
  normalizeTerm,
  termModule,
  validateSpec,
  type BareArg,
  type BlockKind,
  type Criterion,
  type Name,
  type PropField,
  type StringArg,
  type TermLine,
} from '@fudic/spec';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { pathToUri } from '../uri.js';
import { rangeIn, spanRange, termLines, type SpecDocument } from './document.js';
import type { SpecHost } from './host.js';
import { siblingTag } from './snippets.js';

/** The props of the component at a path, as shapes; undefined when no program can say. */
export type PropsOf = (componentPath: string) => readonly PropField[] | undefined;

export interface SpecActionDeps {
  readonly spec: SpecDocument;
  readonly host: SpecHost;
  /** Volar's document: edits of this file are written against its uri, which Volar maps back. */
  readonly document: TextDocument;
  /** The requested stretch, as offsets of the `.fudspec`. */
  readonly start: number;
  readonly end: number;
  readonly propsOf: PropsOf;
}

/** What a repairer is handed. */
interface Repair extends SpecActionDeps {
  readonly diagnostic: SourceDiagnostic;
}

type Repairer = (repair: Repair) => readonly CodeAction[];

/** The key a `props` line proposes when the component has no fixture file yet. */
const BASE_FIXTURE = 'base';

/** One action that replaces stretches of the `.fudspec`. */
function local(repair: Repair, title: string, edits: readonly { span: Span; newText: string }[]): CodeAction {
  const changes: TextEdit[] = edits.map((edit) => ({ range: spanRange(repair.spec, edit.span), newText: edit.newText }));
  return { title, kind: 'quickfix', edit: { changes: { [repair.document.uri]: changes } } };
}

/** One action that creates a file with its text. Nothing happens to a file that already exists. */
function create(title: string, path: string, text: string): CodeAction {
  const uri = pathToUri(path).toString();
  const edit: WorkspaceEdit = {
    documentChanges: [
      { kind: 'create', uri, options: { ignoreIfExists: true } },
      { textDocument: { uri, version: null }, edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: text }] },
    ],
  };
  return { title, kind: 'quickfix', edit };
}

/** The term line the diagnostic is on, with its block. */
function termAt(repair: Repair): { readonly block: BlockKind; readonly term: TermLine } | undefined {
  const at = repair.diagnostic.span.start;
  return termLines(repair.spec.file).find(({ term }) => term.span.start <= at && at < term.span.end);
}

/** The criterion the diagnostic is on. */
function criterionAt(repair: Repair): Criterion | undefined {
  const at = repair.diagnostic.span.start;
  return repair.spec.file.criteria.find((c) => c.span.start <= at && at <= c.span.end);
}

/** Every key the `props` lines of the file name, in order of appearance, once each. */
function propsKeys(repair: Repair): readonly string[] {
  const keys = termLines(repair.spec.file).flatMap(({ term }) => {
    const [arg] = term.args;
    return term.name.text === 'props' && arg !== undefined && arg.kind !== 'role' ? [arg.text] : [];
  });
  return [...new Set(keys)];
}

/** An argument as it can be written back: bare when nothing in it needs quotes. */
function argumentText(text: string): string {
  return /^[^\s"#]+$/u.test(text) ? text : `"${text.replace(/[\\"]/gu, (c) => `\\${c}`)}"`;
}

/**
 * The repairers run only on a diagnostic the validator has just emitted, and each code exists
 * only in the state its repairer reads: FUD0940 and FUD0947 sit on a term line, FUD0949,
 * FUD0950, FUD0951 and FUD0953 need the `component` line and its tag, and the last three need
 * that component to exist. The non-null assertions below say so instead of guarding against a
 * state the code cannot reach.
 */

/** The tag of the `component` line; every caller runs on a code that needs it. */
function declaredTag(repair: Repair): Name {
  return repair.spec.file.component!.tag!;
}

/** The props of the declared component, which exists, or none when no program can read them. */
function fieldsOf(repair: Repair, tag: string): readonly PropField[] {
  return repair.propsOf(repair.host.component(tag)!.path) ?? [];
}

/** FUD0940: the term does not exist — the closest one, and a new module. */
const unknownTerm: Repairer = (repair) => {
  const { block, term } = termAt(repair)!;
  const name = normalizeTerm(term.name.text);
  const actions: CodeAction[] = [];

  const near = closest(name, repair.host.terms(repair.spec.path).list(block).map((m) => m.name));
  if (near !== undefined) actions.push(local(repair, `Change to '${near}'`, [{ span: term.name.span, newText: near }]));

  const root = repair.host.workspaceTerms(repair.spec.path);
  if (root !== undefined) {
    // As many `string` parameters as the line has arguments: the line stays valid, and the
    // author narrows each type in the module.
    const params = term.args.map((_, i) => ({ name: `arg${i + 1}`, type: 'string' as const }));
    actions.push(create(`Create ${block}/${name}.js`, `${root}/${block}/${name}.js`, termModule(block, name, params)));
  }
  return actions;
};

/** FUD0949: the component does not exist — the closest tag. */
const unknownComponent: Repairer = (repair) => {
  const tag = declaredTag(repair);
  const near = closest(tag.text, repair.host.componentTags());
  return near === undefined ? [] : [local(repair, `Change to '${near}'`, [{ span: tag.span, newText: near }])];
};

/** FUD0922: no `component` line — the component the file is named after. */
const missingComponent: Repairer = (repair) => {
  const tag = siblingTag(repair.spec);
  if (repair.host.component(tag) === undefined) return [];
  return [local(repair, `Add 'component ${tag}'`, [{ span: { start: 0, end: 0 }, newText: `component ${tag}\n\n` }])];
};

/** FUD0953: no fixture file — create it, with every key the file names, filled by type. */
const missingFixtures: Repairer = (repair) => {
  const tag = declaredTag(repair).text;
  const path = repair.host.fixturePath(tag);
  if (path === undefined) return [];
  const file = path.slice(path.lastIndexOf('/') + 1);
  // The code is emitted on a `props` line with a name, so there is always a key.
  return [create(`Create ${file}`, path, fixtureModule(tag, propsKeys(repair), fieldsOf(repair, tag)))];
};

/** FUD0950: the fixture does not exist — the closest key, or the key added to the file. */
const unknownFixture: Repairer = (repair) => {
  const tag = declaredTag(repair).text;
  // Emitted only when the fixture file was read and the line names a key that is not in it.
  const fixtures = repair.host.fixtures(tag)!;
  const arg = termAt(repair)!.term.args[0] as BareArg | StringArg;
  const actions: CodeAction[] = [];

  const near = closest(arg.text, fixtures.names.map((n) => n.text));
  if (near !== undefined) actions.push(local(repair, `Change to '${near}'`, [{ span: arg.span, newText: argumentText(near) }]));

  if (fixtures.end !== undefined) {
    const uri = pathToUri(fixtures.path).toString();
    const at = rangeIn(repair.spec, fixtures.path, { start: fixtures.end, end: fixtures.end }, (p) => repair.host.read(p));
    const newText = `  ${fixtureEntry(arg.text, fieldsOf(repair, tag))},\n`;
    const file = fixtures.path.slice(fixtures.path.lastIndexOf('/') + 1);
    actions.push({
      title: `Add '${arg.text}' to ${file}`,
      kind: 'quickfix',
      edit: { documentChanges: [{ textDocument: { uri, version: null }, edits: [{ range: at, newText }] }] },
    });
  }
  return actions;
};

/** FUD0951: the component needs props and the criterion has none — a `props` line in `given`. */
const missingProps: Repairer = (repair) => {
  const criterion = criterionAt(repair)!;
  const tag = declaredTag(repair).text;
  const key = argumentText(repair.host.fixtures(tag)?.names[0]?.text ?? BASE_FIXTURE);
  const given = criterion.blocks.find((b) => b.block === 'given');
  const edit =
    given === undefined
      ? { span: atEnd(criterion.slug?.span ?? criterion.keyword), newText: `\n  given\n    props ${key}` }
      : { span: atEnd(given.keyword), newText: `\n    props ${key}` };
  return [local(repair, `Add 'props ${key}'`, [edit])];
};

/** FUD0947: the number of arguments — complete with a marker per missing one, or drop the extra. */
const wrongArity: Repairer = (repair) => {
  const { block, term } = termAt(repair)!;
  // A `props` line has no module: its arity has nothing to complete from.
  const module = repair.host.terms(repair.spec.path).resolve(block, normalizeTerm(term.name.text));
  if (module === undefined) return [];
  const { params } = module;
  if (term.args.length < params.length) {
    const missing = params.slice(term.args.length).map((p) => ` <${p.name}>`).join('');
    return [local(repair, 'Complete the arguments', [{ span: atEnd(term.span), newText: missing }])];
  }
  const last = params.length === 0 ? term.name.span : (term.args[params.length - 1] as { span: Span }).span;
  return [local(repair, 'Remove the extra arguments', [{ span: { start: last.end, end: term.span.end }, newText: '' }])];
};

/** FUD0921: a wrong indentation — the formatter puts every line where it goes. */
const badIndentation: Repairer = (repair) => {
  const formatted = formatSpec(repair.spec.text);
  // FUD0921 is a line the formatter moves, so a formatted text always differs.
  if (!formatted.ok) return [];
  return [local(repair, 'Format the document', [{ span: { start: 0, end: repair.spec.text.length }, newText: formatted.text }])];
};

/** The empty span right after `span`. */
function atEnd(span: Span): Span {
  return { start: span.end, end: span.end };
}

const REPAIRS: ReadonlyMap<FudCode, Repairer> = new Map<FudCode, Repairer>([
  ['FUD0940', unknownTerm],
  ['FUD0949', unknownComponent],
  ['FUD0922', missingComponent],
  ['FUD0953', missingFixtures],
  ['FUD0950', unknownFixture],
  ['FUD0951', missingProps],
  ['FUD0947', wrongArity],
  ['FUD0921', badIndentation],
]);

/**
 * The actions of the diagnostics that touch `[start, end]`. Two diagnostics can propose the same
 * repair — every badly indented line «Format the document», every `props` line of a file
 * without fixtures «Create <tag>.fixture.ts» — and the bulb lists each one once. Same title AND
 * same edit: two lines with the same typo each keep their own «Change to».
 */
export function specCodeActions(deps: SpecActionDeps): CodeAction[] {
  const { spec, host, start, end } = deps;
  const diagnostics = [...spec.parseDiagnostics, ...validateSpec(spec.file, host.context(spec.path))];
  const actions = new Map<string, CodeAction>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.span.start > end || diagnostic.span.end < start) continue;
    const repair = REPAIRS.get(diagnostic.code);
    if (repair === undefined) continue;
    for (const action of repair({ ...deps, diagnostic })) {
      const key = `${action.title}
${JSON.stringify(action.edit)}`;
      if (!actions.has(key)) actions.set(key, action);
    }
  }
  return [...actions.values()];
}
