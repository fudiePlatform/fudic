/**
 * BUG-59 — the names a `.fud` takes from its `<link rel="server">`, in the editor. Ctrl+Click on
 * one opens where the `.fudapi` declares it: a function, a form — in the file that declares it,
 * which a function's `form` only names — and `data`, at the `load`; a field of `data`, at its
 * line. A form's fields and a function's arguments are typed by `@fudic/forms` and `@fudic/http`,
 * which this workspace does not install: `generatedDefinition`'s unit tests cover them. And a
 * `task(` or a `form:=` offers the functions of that contract, not every name in scope.
 *
 * Its own workspace: the contracts written here would change the names every other suite's
 * files see.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CompletionRequest, CompletionTriggerKind, DefinitionRequest, type CompletionList, type Location } from 'vscode-languageserver-protocol/node';
import { URI } from 'vscode-uri';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

const CARD = 'src/components/user-card.fud';
const SLUG = 'src/blog/[slug].fud';

const SOURCE = `<link rel="server" href="./user-card.fudapi">

@code {
  const go = () => save({ name: "" });
  const lost = ghost;
  const running = task(sa);
  const plain = sa;
  const typed = task();
}

<user-card>
  <template shadowrootmode="open">
    <form control=@personForm form:=@save @submit=@go></form>
    <form control=@personForm form:=@sa></form>
    <form control=@personForm form:=@></form>
    <form control=@personForm form:=></form>
  </template>
</user-card>
`;

const CONTRACT = `put save
  form personForm
  -> str

put other
  form ghost

get find
  q  str
  -> str
`;

const FORM = `form personForm
  name  str = ""
`;

let harness: Harness;
let root: string;

beforeAll(async () => {
  root = copyWorkspace();
  mkdirSync(`${root}/src/forms`, { recursive: true });
  writeFileSync(`${root}/${CARD}`, SOURCE, 'utf8');
  writeFileSync(`${root}/src/components/user-card.fudapi`, CONTRACT, 'utf8');
  writeFileSync(`${root}/src/forms/person.fudapi`, FORM, 'utf8');
  harness = await startHarness({ root });
  await harness.open(CARD);
  await harness.open(SLUG);
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

/** Where Ctrl+Click on the `delta`-th character of `needle` goes: the file, and the first line of the declaration. */
async function definitionAt(relative: string, needle: string, delta: number): Promise<{ file: string; text: string }[]> {
  const text = readFileSync(`${root}/${relative}`, 'utf8');
  const at = text.indexOf(needle);
  expect(at, `${needle} is in ${relative}`).toBeGreaterThan(-1);
  const answer = (await harness.client.sendRequest(DefinitionRequest.type, {
    textDocument: { uri: URI.file(`${root}/${relative}`).toString() },
    position: harness.positionAt(text, at + delta),
  })) as Location[] | null;

  return (answer ?? []).map((link) => {
    const path = URI.parse(link.uri).fsPath.replace(/\\/gu, '/');
    const lines = readFileSync(path, 'utf8').split('\n');
    const { start } = link.range;
    return { file: path.slice(path.indexOf('/src/') + 1), text: (lines[start.line] ?? '').slice(start.character).trimEnd() };
  });
}

describe('BUG-59 — a contract name opens its .fudapi', () => {
  it('a function, from the view and from @code', async () => {
    const declared = { file: 'src/components/user-card.fudapi', text: 'put save' };
    expect(await definitionAt(CARD, 'save({', 1)).toEqual([declared]);
    expect(await definitionAt(CARD, 'form:=@save', 8)).toEqual([declared]);
  });

  it('a form, in the file that declares it', async () => {
    expect(await definitionAt(CARD, 'control=@personForm', 10)).toEqual([{ file: 'src/forms/person.fudapi', text: 'form personForm' }]);
  });

  it('a form the project does not declare goes nowhere, as before', async () => {
    expect(await definitionAt(CARD, 'ghost;', 1)).toEqual([]);
  });

  it('data, at the load of the route; and its field, at its line', async () => {
    expect(await definitionAt(SLUG, '@data.title', 2)).toEqual([{ file: 'src/blog/[slug].fudapi', text: 'load' }]);
    expect(await definitionAt(SLUG, '@data.title', 7)).toEqual([{ file: 'src/blog/[slug].fudapi', text: 'title  str' }]);
  });
});

/** The labels offered at the `|` of `needle`, or right after it; typed with `trigger` when given. */
async function labelsAfter(relative: string, needle: string, trigger?: string): Promise<readonly string[]> {
  const text = readFileSync(`${root}/${relative}`, 'utf8');
  const [before = '', after = ''] = needle.split('|');
  const at = text.indexOf(`${before}${after}`);
  expect(at, `${needle} is in ${relative}`).toBeGreaterThan(-1);
  const answer = (await harness.client.sendRequest(CompletionRequest.type, {
    textDocument: { uri: URI.file(`${root}/${relative}`).toString() },
    position: harness.positionAt(text, at + before.length),
    ...(trigger === undefined ? {} : { context: { triggerKind: CompletionTriggerKind.TriggerCharacter, triggerCharacter: trigger } }),
  })) as CompletionList | null;
  return (answer?.items ?? []).map((item) => item.label);
}

describe('BUG-59 — task( and form:= offer the functions of the contract', () => {
  it('only them, as the first argument of a task(, typed or asked for', async () => {
    expect([...(await labelsAfter(CARD, 'task(sa'))].sort()).toEqual(['find', 'other', 'save']);
    expect([...(await labelsAfter(CARD, 'typed = task(', '('))].sort()).toEqual(['find', 'other', 'save']);
  });

  it('only them, behind their @, as the value of a form:=', async () => {
    for (const needle of ['form:=@sa|></form>', 'form:=@|></form>', 'form:=|></form>']) {
      expect([...(await labelsAfter(CARD, needle))].sort()).toEqual(['@find', '@other', '@save']);
    }
  });

  it('anywhere else, the scope as before', async () => {
    expect(await labelsAfter(CARD, 'const plain = sa')).toEqual(expect.arrayContaining(['save', 'go', 'personForm']));
  });
});
