/**
 * Completion in a `.fudapi` (SDD-60 §4.9). What fits under the cursor is decided by the line's
 * parent and by the word being typed, never guessed: at column 0 the declarations; as the first
 * word of an indented line, what its parent takes; after a keyword, what that keyword takes.
 *
 * It reads the lines as typed, not the tree: half a line is exactly what completion is asked
 * about. The tree and the index answer only what the text cannot: the type of a field, the
 * fields of a form, the parameters of a rule or a middleware, what a function inherits.
 */

import {
  DECLARATION_KEYWORDS,
  typeText,
  type ApiIndex,
  type ChainDecl,
  type FnDecl,
  type FormDecl,
  type FormMember,
  type LoadDecl,
  type RuleDecl,
} from '@fudic/api';
import { CompletionItemKind, type CompletionItem, type CompletionList } from 'vscode-languageserver-protocol';
import type { ApiDocument } from './document.js';

const PRIMITIVES = ['str', 'bool', 'date', 'uuid', 'u8', 'i8', 'u16', 'i16', 'u32', 'i32', 'f32', 'f64'];
const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete']);
const MODES = ['ssg', 'ssr', 'sw'];
const POLICIES = ['cache-first', 'network-first', 'stale-while-revalidate', 'network-only'];
const EXPRESSION = ['and', 'or', 'not', 'contains', 'valid', 'empty', 'length'];

/** What a line hangs from, by its parents. */
type Context =
  | 'fn'
  | 'load'
  | 'chain'
  | 'type'
  | 'form'
  | 'group'
  | 'field'
  | 'summary'
  | 'when'
  | 'rule'
  | 'middleware'
  | 'adds'
  | 'use-args'
  | 'none';

/** The words a line of each context can start with. */
const CHILDREN: Readonly<Record<Context, readonly string[]>> = {
  fn: ['use', 'skip', 'form', 'invalidates', 'compress', 'fails', 'query', '->'],
  load: ['use', 'skip', 'fails'],
  chain: ['use', 'skip', 'compress'],
  type: [],
  form: ['validate-on', 'validity', 'catches', 'summary'],
  group: ['validate-on', 'validity', 'summary'],
  field: ['validate-on', 'validity', 'range'],
  summary: ['require', 'when'],
  when: ['require'],
  rule: ['on', 'runs', 'async', 'fails'],
  middleware: ['client', 'server', 'adds', 'fails'],
  adds: [],
  'use-args': [],
  none: [],
};

/** Contexts whose lines may be `<name>  <type>`. */
const TYPED: ReadonlySet<Context> = new Set(['fn', 'load', 'type', 'form', 'group', 'rule', 'middleware', 'adds']);

/** One line above the cursor's, as typed. */
interface Line {
  readonly start: number;
  readonly indent: number;
  readonly words: readonly string[];
}

const item = (label: string, kind: CompletionItemKind, detail?: string): CompletionItem => ({
  label,
  kind,
  ...(detail !== undefined ? { detail } : {}),
});
const list = (items: readonly CompletionItem[]): CompletionList => ({ isIncomplete: false, items: [...items] });
const keywords = (words: readonly string[]): CompletionItem[] => words.map((w) => item(w, CompletionItemKind.Keyword));

export function apiCompletions(doc: ApiDocument, offset: number): CompletionList | undefined {
  const text = doc.text;
  const lineStart = Math.max(text.lastIndexOf('\n', offset - 1), text.lastIndexOf('\r', offset - 1)) + 1;
  const before = text.slice(lineStart, offset);
  const indent = /^ */u.exec(before)![0].length;
  const words = before.slice(indent).split(/\s+/u);
  const typing = words.length - 1;
  const chain = parents(text, lineStart, indent);
  const context = contextOf(chain);

  if (quotes(before) % 2 === 1) return placeholders(doc, before, words[0]!, context);
  if (/(?:^|\s)#/u.test(before)) return undefined;

  if (indent === 0) {
    if (typing === 0) return list(keywords(DECLARATION_KEYWORDS));
    if (words[0] !== 'load') return undefined;
    return list(keywords(words[typing - 1] === 'page' ? ['never', 'persist'] : [...MODES, 'ttl', ...POLICIES, 'page']));
  }
  if (typing === 0) return list(firstWord(doc, offset, chain, context));
  return argument(doc, offset, words, typing, chain, context);
}

/** How many unescaped double quotes `text` has: an odd number puts the cursor in a string. */
function quotes(text: string): number {
  return (text.replace(/\\["\\]/gu, '').match(/"/gu) ?? []).length;
}

/** The lines the cursor's line hangs from, nearest first, up to its declaration. */
function parents(text: string, lineStart: number, indent: number): readonly Line[] {
  const out: Line[] = [];
  let want = indent;
  let end = lineStart - 1;
  while (want > 0 && end > 0) {
    const start = Math.max(text.lastIndexOf('\n', end - 1), text.lastIndexOf('\r', end - 1)) + 1;
    const line = text.slice(start, end).replace(/\r$/u, '');
    end = start - 1;
    const own = /^ */u.exec(line)![0].length;
    const body = line.slice(own);
    if (body === '' || body.startsWith('#') || own >= want) continue;
    out.push({ start: start + own, indent: own, words: body.split(/\s+/u) });
    want = own;
  }
  return out;
}

/** The context of a line, from its parents. */
function contextOf(chain: readonly Line[]): Context {
  const parent = chain[0];
  const root = chain[chain.length - 1];
  if (parent === undefined || root === undefined || root.indent !== 0) return 'none';
  const head = root.words[0]!;
  if (parent.words[0] === 'use') return 'use-args';
  if (parent === root) {
    if (VERBS.has(head)) return 'fn';
    if (head === 'load' || head === 'chain' || head === 'type' || head === 'form' || head === 'rule' || head === 'middleware') {
      return head;
    }
    return 'none';
  }
  if (head === 'middleware') return parent.words[0] === 'adds' ? 'adds' : 'none';
  if (head !== 'form') return 'none';
  if (parent.words[0] === 'summary') return 'summary';
  if (parent.words[0] === 'when') return 'when';
  return parent.words[1] === 'group' ? 'group' : 'field';
}

/** The first word of an indented line: what its parent takes. */
function firstWord(doc: ApiDocument, offset: number, chain: readonly Line[], context: Context): CompletionItem[] {
  const items = keywords(CHILDREN[context]);
  if (context === 'field') {
    const field = fieldAt(formAt(doc, offset), chain[0]!.start);
    if (field !== undefined) items.push(...rules(doc.index.rulesFor(field.type).map((r) => r.decl)));
  } else if (context === 'summary') {
    const target = chain.some((l) => l.words[1] === 'group') ? 'group' : 'form';
    items.push(...rules(doc.index.all('rule').map((r) => r.decl).filter((r) => r.on?.target.text === target)));
  } else if (context === 'use-args') {
    const mw = doc.index.lookup('middleware', chain[0]!.words[chain[0]!.words.length - 1]!);
    for (const p of mw?.decl.params ?? []) items.push(item(p.name.text, CompletionItemKind.Property, typeText(p.type)));
  }
  return items;
}

function rules(decls: readonly RuleDecl[]): CompletionItem[] {
  return decls.map((r) =>
    item(r.name.text, CompletionItemKind.Function, r.params.map((p) => `${p.name.text} ${typeText(p.type)}`).join(' ')),
  );
}

/** What fits after the first word of an indented line. */
function argument(
  doc: ApiDocument,
  offset: number,
  words: readonly string[],
  typing: number,
  chain: readonly Line[],
  context: Context,
): CompletionList | undefined {
  const head = words[0]!;
  const index = doc.index;
  switch (head) {
    case 'use':
      return list(
        index.all('middleware').map((m) =>
          item(m.decl.name.text, CompletionItemKind.Function, m.decl.adds?.fields.map((f) => `${f.name.text}: ${typeText(f.type)}`).join(', ')),
        ),
      );
    case 'skip': {
      const level = levelAt(doc, offset);
      const inherited = level === undefined ? [] : index.inherited(doc.source, level);
      return list([...inherited.map((m) => item(m, CompletionItemKind.Function)), item('*', CompletionItemKind.Keyword)]);
    }
    case 'form':
      return context === 'fn' ? list(index.all('form').map((f) => item(f.decl.name.text, CompletionItemKind.Variable))) : undefined;
    case 'runs':
      return list(keywords(['both', 'server']));
    case 'on':
      return typing === 1
        ? list(keywords(['field', 'group', 'form']))
        : words[1] === 'field'
          ? list([...types(index), item('*', CompletionItemKind.Keyword), item('*[]', CompletionItemKind.Keyword)])
          : undefined;
    case 'validate-on':
      return list(keywords(['submit', 'blur', 'input']));
    case 'validity':
      return list(keywords(['rules', 'interacted']));
    case 'compress':
      return typing === 1 ? list(keywords(['gzip', 'deflate', 'deflate-raw', 'off'])) : undefined;
    case 'query':
      return typing === 2 ? list(types(index)) : undefined;
    case '->':
      return list(types(index));
    case 'require':
    case 'when':
      return typing >= (head === 'require' ? 2 : 1) ? list([...paths(doc, offset, chain), ...keywords(EXPRESSION)]) : undefined;
  }
  if (context === 'field' || context === 'summary') return ruleArgument(index, head, typing);
  if (typing === 1 && TYPED.has(context) && !CHILDREN[context].includes(head)) {
    const extra = context === 'form' || context === 'group' ? [item('group', CompletionItemKind.Keyword)] : [];
    const pattern = context === 'rule' ? [item('pattern', CompletionItemKind.Keyword)] : [];
    return list([...types(index), ...extra, ...pattern]);
  }
  return undefined;
}

/** The primitives, then the project's types and enums. */
function types(index: ApiIndex): CompletionItem[] {
  return [
    ...PRIMITIVES.map((p) => item(p, CompletionItemKind.TypeParameter)),
    ...index
      .all('type')
      .map((t) => item(t.decl.name.text, t.decl.kind === 'enum' ? CompletionItemKind.Enum : CompletionItemKind.Class)),
  ];
}

/** After a rule's name: what its next parameter takes, when it is a closed list. */
function ruleArgument(index: ApiIndex, name: string, typing: number): CompletionList | undefined {
  const param = index.lookup('rule', name)?.decl.params[typing - 1]?.type;
  if (param?.kind !== 'named') return undefined;
  if (param.name.text === 'pattern') return list(index.all('pattern').map((p) => item(p.decl.name.text, CompletionItemKind.Constant)));
  const declared = index.lookup('type', param.name.text)?.decl;
  return declared?.kind === 'enum' ? list(declared.members.map((m) => item(m.text, CompletionItemKind.EnumMember))) : undefined;
}

/** Inside a text, after `{`: what the rule of the line fills in. */
function placeholders(doc: ApiDocument, before: string, head: string, context: Context): CompletionList | undefined {
  if (!/\{[A-Za-z_]*$/u.test(before)) return undefined;
  let offered: string[] = [];
  if (head === 'range') offered = ['min', 'max'];
  else if (context === 'field' || context === 'summary') {
    const rule = doc.index.lookup('rule', head)?.decl;
    offered = rule === undefined ? [] : rule.fails.flatMap((f) => f.params.map((p) => p.text));
    if (rule?.runs?.value.text === 'server') offered.push('detail');
  }
  return list(offered.map((o) => item(o, CompletionItemKind.Variable)));
}

/** The form whose block the cursor is in: the last one that starts before it. */
function formAt(doc: ApiDocument, offset: number): FormDecl | undefined {
  return doc.source.file.declarations
    .filter((d): d is FormDecl => d.kind === 'form' && d.span.start <= offset)
    .at(-1);
}

/** The field of a form whose line starts at `start`. */
function fieldAt(form: FormDecl | undefined, start: number): Extract<FormMember, { kind: 'form-field' }> | undefined {
  const find = (members: readonly FormMember[]): Extract<FormMember, { kind: 'form-field' }> | undefined => {
    for (const m of members) {
      if (m.kind === 'form-field' && m.span.start === start) return m;
      if (m.kind === 'form-group') {
        const inner = find(m.fields);
        if (inner !== undefined) return inner;
      }
    }
    return undefined;
  };
  return form === undefined ? undefined : find(form.fields);
}

/** The field paths a `require` or `when` can read: of the group whose `summary` it is in, or of the form. */
function paths(doc: ApiDocument, offset: number, chain: readonly Line[]): CompletionItem[] {
  const form = formAt(doc, offset);
  if (form === undefined) return [];
  const group = chain.find((l) => l.words[1] === 'group');
  let scope: readonly FormMember[] = form.fields;
  if (group !== undefined) {
    const found = form.fields.find((m) => m.kind === 'form-group' && m.span.start === group.start);
    scope = found?.kind === 'form-group' ? found.fields : [];
  }
  const out: CompletionItem[] = [];
  const walk = (members: readonly FormMember[], prefix: string): void => {
    for (const m of members) {
      const path = `${prefix}${m.name.text}`;
      out.push(item(path, CompletionItemKind.Field, m.kind === 'form-group' ? 'group' : typeText(m.type)));
      if (m.kind === 'form-group') walk(m.fields, `${path}.`);
    }
  };
  walk(scope, '');
  return out;
}

/** The function, `load` or `chain` whose block the cursor is in. */
function levelAt(doc: ApiDocument, offset: number): FnDecl | LoadDecl | ChainDecl | undefined {
  return doc.source.file.declarations
    .filter((d): d is FnDecl | LoadDecl | ChainDecl => (d.kind === 'fn' || d.kind === 'load' || d.kind === 'chain') && d.span.start <= offset)
    .at(-1);
}
