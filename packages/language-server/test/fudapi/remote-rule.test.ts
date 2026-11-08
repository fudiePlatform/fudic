/**
 * SDD-80 criterion 32 — a `runs remote` rule in the editor of a `.fudapi`, through the service
 * as Volar calls it: the values of `runs`, the lines a remote rule takes, the `rule remote`
 * snippet, and the hover over `remote` and `debounce`.
 */

import { describe, expect, it } from 'vitest';
import { validateApi } from '@fudic/api';
import { CancellationToken, type CompletionItem, type CompletionList, type Hover } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { apiCompletions } from '../../src/fudapi/completion.js';
import { createFudapiService } from '../../src/fudapi/service.js';
import { RequestStats } from '../../src/stats.js';
import { fakeServiceContext } from '../_lsp.js';
import { FILES, SRC, apiDocument, cursor, world } from './_api.js';

const URL = URI.file(`${SRC}/rules/people.fudapi`);
const NONE = CancellationToken.None;

/** What the service offers at the `|` of `marked`. */
async function items(marked: string): Promise<readonly CompletionItem[]> {
  const { text, offset } = cursor(marked);
  const { host, implementations, generated } = world({ files: FILES });
  const service = createFudapiService({ host, implementations, generated, stats: new RequestStats() }).create(fakeServiceContext({}));
  const doc = TextDocument.create(URL.toString(), 'fudapi', 1, text);
  const list = (await service.provideCompletionItems?.(doc, doc.positionAt(offset), { triggerKind: 1 }, NONE)) as CompletionList;
  return list.items;
}

const labels = async (marked: string): Promise<readonly string[]> => (await items(marked)).map((i) => i.label);

/** The service's hover at the `|` of `marked`. */
async function hover(marked: string): Promise<Hover | undefined> {
  const { text, offset } = cursor(marked);
  const { host, implementations, generated } = world({ files: FILES });
  const service = createFudapiService({ host, implementations, generated, stats: new RequestStats() }).create(fakeServiceContext({}));
  const doc = TextDocument.create(URL.toString(), 'fudapi', 1, text);
  return (await service.provideHover?.(doc, doc.positionAt(offset), NONE)) as Hover | undefined;
}

const value = (h: Hover | undefined): string => (h?.contents as { value: string } | undefined)?.value ?? '';

describe('a remote rule in the editor (SDD-80 criterion 32)', () => {
  it('after `runs`, `both`, `server` and `remote`, each with what it does', async () => {
    const found = await items('rule r\n  runs |');
    expect(found.map((i) => i.label)).toEqual(['both', 'server', 'remote']);
    expect(found.find((i) => i.label === 'remote')?.detail).toContain('asks the server while typing');
    expect(found.every((i) => i.detail !== undefined)).toBe(true);
  });

  it('a remote rule offers `debounce`, `use` and `skip`; a `both` one, none of them', async () => {
    expect(await labels('rule r\n  on field str\n  runs remote\n  |')).toEqual(['on', 'runs', 'async', 'debounce', 'use', 'skip', 'fails']);
    expect(await labels('rule r\n  on field str\n  runs both\n  |')).toEqual(['on', 'runs', 'async', 'fails']);
    // A rule with no `runs` yet runs `both`.
    expect(await labels('rule r\n  |')).toEqual(['on', 'runs', 'async', 'fails']);
    // And one still without its name, which declares nothing yet.
    expect(await labels('rule\n  |')).toEqual(['on', 'runs', 'async', 'fails']);
    // A `server` one runs on the server too: its middlewares, without `debounce` (§3.1).
    expect(await labels('rule r\n  runs server\n  |')).toEqual(['on', 'runs', 'async', 'use', 'skip', 'fails']);
  });

  it('after `use` in a rule, the middlewares; after `skip`, what it inherits', async () => {
    expect(await labels('rule r\n  runs remote\n  use |')).toContain('auth');
    expect(await labels('rule r\n  runs remote\n  skip |')).toEqual(['*']);
  });

  it('a remote rule offers `{detail}` in its texts, as a server one', async () => {
    const files = { [`${SRC}/rules/taken.fudapi`]: 'rule alias-taken\n  on field str\n  runs remote\n  fails alias-taken\n' };
    const { text, offset } = cursor('form f\n  alias  str = ""\n    alias-taken  "Taken: {|"');
    const { host } = world({ files: { ...FILES, ...files } });
    expect(apiCompletions(apiDocument(host, text), offset)?.items.map((i) => i.label)).toEqual(['detail']);
  });

  it('the `rule` snippet lists `remote`, and `rule remote` leaves the rule of criterion 1', async () => {
    const found = await items('|');
    expect(found.find((i) => i.label === 'rule')?.insertText).toContain('${3|both,server,remote|}');
    const remote = found.find((i) => i.label === 'rule remote')!;
    const expanded = remote.insertText!.replace(/\$\{\d+:([^}]*)\}/gu, '$1').replace(/\$\d+/gu, '');
    expect(expanded).toBe('rule name\n  on field str\n  runs remote\n  debounce 300\n  fails code');
    const { host } = world({ files: FILES });
    const doc = apiDocument(host, `${expanded}
`, `${SRC}/rules/r.fudapi`);
    expect([...doc.parseDiagnostics, ...validateApi(doc.source, doc.index, doc.context)].map((d) => d.message)).toEqual([]);
  });

  it('hovers `remote` and `debounce` with what they do; nothing on `both` or on the number', async () => {
    const text = 'rule r\n  on field str\n  runs re|mote\n  debounce 300\n  fails r\n';
    const remote = await hover(text);
    expect(value(remote)).toContain('/_fudic/rule/');
    expect(remote?.range).toEqual({ start: { line: 2, character: 7 }, end: { line: 2, character: 13 } });
    const debounce = await hover('rule r\n  on field str\n  runs remote\n  deb|ounce 300\n  fails r\n');
    expect(value(debounce)).toContain('Milliseconds');
    expect(await hover('rule r\n  on field str\n  runs remote\n  debounce 3|00\n  fails r\n')).toBeUndefined();
    expect(await hover('rule r\n  on field str\n  runs bo|th\n  fails r\n')).toBeUndefined();
  });
});
