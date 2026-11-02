/**
 * The snippets of a `.fudapi` (SDD-75 §3.1). The service gives them, not a static
 * `contributes.snippets`: the file hangs on its indentation, and only completion knows what the
 * line under the cursor hangs from. A snippet takes the place of the keyword of its name, so a
 * context offers `post` once.
 *
 * Bodies are written for a line at column 0; the line where one is accepted lends its indentation
 * to every line after the first, and the client is told to leave them as they are.
 */

import { typeText, type RuleDecl } from '@fudic/api';
import { CompletionItemKind, InsertTextFormat, InsertTextMode, type CompletionItem } from 'vscode-languageserver-protocol';

/** A snippet's body and its one-line `detail`. */
interface Snippet {
  readonly body: string;
  readonly detail: string;
}

const fn = (verb: string): Snippet => ({
  body: `${verb} \${1:name}\n  \${2:arg}  \${3:str}$0`,
  detail: `${verb.toUpperCase()} function`,
});

/** The declarations, at column 0. */
const ROOT: Readonly<Record<string, Snippet>> = {
  get: fn('get'),
  post: fn('post'),
  put: fn('put'),
  patch: fn('patch'),
  delete: fn('delete'),
  load: { body: 'load ${1|ssr,ssg,isr|}\n  ${2:field}  ${3:str}$0', detail: 'The data of the page' },
  form: { body: 'form ${1:name}\n\n  ${2:field}  ${3:str} = ${4:""}\n    required  "${5:Write it.}"$0', detail: 'A form and its rules' },
  type: { body: 'type ${1:Name}\n  ${2:field}  ${3:str}$0', detail: 'A type' },
  enum: { body: 'enum ${1:Name}\n  ${2:value}$0', detail: 'An enum' },
  rule: { body: 'rule ${1:name}\n  on field ${2:str}\n  runs ${3|both,server|}\n  fails ${4:code}$0', detail: 'A validation rule' },
  middleware: { body: 'middleware ${1:name}\n  fails ${2:code} ${3:401} "${4:detail}"$0', detail: 'A middleware' },
  pattern: { body: 'pattern ${1:name} "${2:regex}"$0', detail: 'A named pattern' },
  pipe: { body: 'pipe ${1:name}\n  on ${2:str}$0', detail: 'A pipe' },
  chain: { body: 'chain\n  use ${1:log}$0', detail: 'The middlewares of every function below' },
};

/** The lines of a function. */
const FN: Readonly<Record<string, Snippet>> = {
  use: { body: 'use ${1}', detail: 'Run middlewares' },
  invalidates: { body: 'invalidates /${1}', detail: 'Pages whose data this call changes' },
  catches: { body: 'catches ${1:409}', detail: 'Statuses that stay with the caller' },
  fails: { body: 'fails ${1:code} ${2:409} "${3:text}"', detail: 'A failure, with its status and text' },
  query: { body: 'query ${1:name}  ${2:str}', detail: 'A query parameter' },
  '->': { body: '-> ${1:Type}', detail: 'What it returns' },
  form: { body: 'form ${1}', detail: 'The form it receives' },
};

/** The lines of a form, or of a group inside one. */
const FORM: Readonly<Record<string, Snippet>> = {
  catches: { body: 'catches ${1:400 409 422}', detail: 'Statuses that stay with the form' },
  summary: { body: 'summary\n  ${1}', detail: 'Rules over the whole form' },
  'validate-on': { body: 'validate-on ${1|submit,blur,input|}', detail: 'When its rules run' },
};

/** The snippets of each place a line can be, by the name of its context. */
export const SNIPPETS: Readonly<Record<'root' | 'fn' | 'form', Readonly<Record<string, Snippet>>>> = { root: ROOT, fn: FN, form: FORM };

/** `body` as an item for a line indented by `indent`, labelled `label`. */
function snippet(label: string, { body, detail }: Snippet, indent: number): CompletionItem {
  return {
    label,
    kind: CompletionItemKind.Snippet,
    detail,
    insertText: body.replace(/\n(?=[^\n])/gu, `\n${' '.repeat(indent)}`),
    insertTextFormat: InsertTextFormat.Snippet,
    // The indentation is already in the text: the client adding its own would double it.
    insertTextMode: InsertTextMode.asIs,
  };
}

/** Each keyword as its snippet in `table` when it has one, as a bare keyword when not. */
export function withSnippets(words: readonly string[], table: Readonly<Record<string, Snippet>>, indent: number): CompletionItem[] {
  return words.map((w) => {
    const found = table[w];
    return found === undefined ? { label: w, kind: CompletionItemKind.Keyword } : snippet(w, found, indent);
  });
}

/**
 * A rule under a field of a form: its name, a tabstop per parameter — empty for a `pattern`, which
 * completion fills with the patterns — and its text.
 */
export function ruleSnippet(rule: RuleDecl, indent: number): CompletionItem {
  const params = rule.params.map((p, i) => {
    const pattern = p.type.kind === 'named' && p.type.name.text === 'pattern';
    return pattern ? `\${${i + 1}}` : `\${${i + 1}:${p.name.text}}`;
  });
  const body = `${[rule.name.text, ...params].join(' ')}  "\${${params.length + 1}:text}"`;
  const detail = rule.params.map((p) => `${p.name.text} ${typeText(p.type)}`).join(' ');
  return snippet(rule.name.text, { body, detail }, indent);
}
