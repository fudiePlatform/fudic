/**
 * The texts of a `.fudapi`, as messages (SDD-74 §4.5): what `fudic translate` extracts and what
 * the module of a locale writes translated. One walk serves both, so the two can never disagree
 * on what a message is or what it is called.
 *
 * What is a text: a rule's under a form field or in a `summary`, a `require`'s, a field's
 * `range`, and the `detail` of a `fails` of a function or a middleware. Its context is the path of its
 * declaration — `personForm.age.min` — so the same words in two places can be said two ways.
 * Its `{n}` are its holes, named as the rule's parameter.
 */

import { span, type Span } from '@fudic/diagnostics';
import { messageKey, type CompiledMessage } from '@fudic/i18n';
import type { ApiFile, FormMember, ParseResult, RuleUse, StringLiteral, SummaryBlock } from './ast.js';
import { parseApi } from './parse.js';

/** One translatable text of a `.fudapi`: the `Message` of SDD-58, from a `.fudapi`. */
export interface ApiMessage {
  /** `messageKey(context, source)`. */
  readonly key: string;
  readonly context: string;
  /** ICU-escaped, holes as `{name}`. */
  readonly source: string;
  /** Each `{name}` of the text, and what fills it: the arguments of the rule, the type of a `range`. */
  readonly holes: readonly { readonly name: string; readonly expr: Span }[];
  readonly tags: 0;
  readonly origin: 'fudapi';
  readonly span: Span;
  readonly at: number;
}

/** How the module of one locale is written: a `LocaleCompile` of `@fudic/compiler` is one. */
export interface ApiLocale {
  /** The text for a message in the locale, or `undefined` when it is missing. */
  readonly translate: (message: ApiMessage) => CompiledMessage | undefined;
}

/** A text found by the walk, before it is keyed. */
interface Found {
  readonly text: StringLiteral;
  readonly context: string;
  /** What fills its holes. */
  readonly filler: Span;
}

const HOLE = /\{([A-Za-z_][A-Za-z0-9_]*)\}/gu;

/** Every text of `file`, in source order. */
function texts(file: ApiFile): readonly Found[] {
  const out: Found[] = [];
  const ruleText = (use: RuleUse, context: string): void => {
    if (use.text === undefined) return;
    const filler = use.args.length === 0 ? use.text.span : span(use.args[0]!.span.start, use.args[use.args.length - 1]!.span.end);
    out.push({ text: use.text, context: `${context}.${use.name.text}`, filler });
  };
  const summary = (block: SummaryBlock | undefined, context: string): void => {
    for (const item of block?.items ?? []) {
      if (item.kind === 'rule-use') ruleText(item, `${context}.summary`);
      else {
        for (const r of item.kind === 'when' ? item.rules : [item]) {
          if (r.text !== undefined) out.push({ text: r.text, context: `${context}.summary.${r.code.text}`, filler: r.text.span });
        }
      }
    }
  };
  const members = (fields: readonly FormMember[], context: string): void => {
    for (const m of fields) {
      const path = `${context}.${m.name.text}`;
      if (m.kind === 'form-group') {
        summary(m.summary, path);
        members(m.fields, path);
        continue;
      }
      for (const use of m.rules) ruleText(use, path);
      if (m.range !== undefined) out.push({ text: m.range, context: `${path}.range`, filler: m.type.span });
    }
  };
  for (const d of file.declarations) {
    if (d.kind === 'form') {
      summary(d.summary, d.name.text);
      members(d.fields, d.name.text);
    } else if (d.kind === 'middleware' || d.kind === 'fn') {
      for (const f of d.fails) {
        if (f.detail !== undefined) out.push({ text: f.detail, context: `${d.name.text}.${f.code.text}`, filler: f.detail.span });
      }
    }
  }
  return out.sort((a, b) => a.text.span.start - b.text.span.start);
}

/** `text` in ICU: what is not a `{name}` is quoted where ICU would read it as syntax. */
function icuOf(text: string): string {
  let out = '';
  let last = 0;
  for (const hole of text.matchAll(HOLE)) {
    out += escape(text.slice(last, hole.index)) + hole[0];
    last = hole.index + hole[0].length;
  }
  return out + escape(text.slice(last));
}

const escape = (text: string): string => text.replace(/'/gu, "''").replace(/[{}]|<(?=\/?\d)/gu, (c) => `'${c}'`);

/** The texts of `file` as messages, keyed and numbered as a `.fud`'s are. */
function messagesOf(file: ApiFile): readonly (ApiMessage & { readonly found: Found })[] {
  const ordinals = new Map<string, number>();
  return texts(file).map((found) => {
    const source = icuOf(found.text.text);
    const key = messageKey(found.context, source);
    if (!ordinals.has(key)) ordinals.set(key, ordinals.size);
    const holes = [...new Set([...found.text.text.matchAll(HOLE)].map((h) => h[1]!))].map((name) => ({ name, expr: found.filler }));
    return { key, context: found.context, source, holes, tags: 0, origin: 'fudapi', span: found.text.span, at: ordinals.get(key)!, found };
  });
}

/**
 * The messages of a `.fudapi`. `file` names it where a diagnostic is said; the context of a
 * message is its declaration's path, not the file's. Never throws.
 */
export function extractApiMessages(source: string, file: string): ParseResult<readonly ApiMessage[]> {
  const parsed = parseApi(source);
  return { value: messagesOf(parsed.value).map(({ found: _, ...message }) => message), diagnostics: parsed.diagnostics };
}

/**
 * What each text of `file` says in a locale: the translation as a template of `{name}`, as the
 * `.fudapi` writes it. A text with no translation, or with one that is more than words and its
 * holes, is not in the map: it stays as written (SDD-58 §4.10).
 */
export function localizedTexts(file: ApiFile, locale: ApiLocale): ReadonlyMap<StringLiteral, string> {
  const out = new Map<StringLiteral, string>();
  for (const message of messagesOf(file)) {
    const { found, ...plain } = message;
    const compiled = locale.translate(plain);
    const template = compiled === undefined ? undefined : templateOf(compiled, new Set(plain.holes.map((h) => h.name)));
    if (template !== undefined) out.set(found.text, template);
  }
  return out;
}

/** `compiled` as a `{name}` template, or `undefined` when it holds what a template cannot say. */
function templateOf(compiled: CompiledMessage, holes: ReadonlySet<string>): string | undefined {
  let out = '';
  for (const part of compiled) {
    if (typeof part === 'string') out += part;
    else if ('hole' in part && holes.has(part.hole)) out += `{${part.hole}}`;
    else return undefined;
  }
  return out;
}
