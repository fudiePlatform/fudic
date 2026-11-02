/**
 * SDD-72 criterion 46 — the value of a `delegate:` marker completes with the events it may serve.
 *
 * Asked the way an editor asks, through the whole server: what comes back is the list every
 * service contributed, merged. So the assertions are about that merged list — no `@click` from
 * the HTML service, no names of the scope — and not only about the plugin that owns the answer.
 *
 * Its own workspace: the component written here would change what every other suite's files see.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { CompletionRequest, type CompletionItem, type CompletionList } from 'vscode-languageserver-protocol/node';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

const TABLE = 'src/components/app-table.fud';

/** The table of SDD-72 §3.4, with `marker` as the checkbox's marker and `extra` after the table. */
const table = (marker: string, extra = ''): string => `@code {
  type Person = { id: number; name: string; active: boolean };
  const { personas = [] } = props<{ personas?: Person[] }>();
  function activar(p: Person, e: Event) { void p; void e; }
  function borrar(p: Person) { void p; }
  function nada() {}
}

<app-table>
  <template shadowrootmode="open">
    <table>
      <tbody @change=@activar(p, $event) @click=@borrar(p)>
        @foreach (const p of personas) key (p.id) {
          <tr>
            <td><input type="checkbox" ${marker} aria-label="Activo"></td>
            <td><button delegate:p="click">Borrar</button></td>
          </tr>
        }
      </tbody>
    </table>
    ${extra}
  </template>
</app-table>
`;

let harness: Harness;
let version = 1;

beforeAll(async () => {
  const root = copyWorkspace();
  writeFileSync(`${root}/${TABLE}`, table('delegate:p'), 'utf8');
  harness = await startHarness({ root });
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

/** Every item the server answers at the `|` of `marked`, merged from all its services. */
async function completeAt(marked: string): Promise<CompletionItem[]> {
  const text = marked.replace('|', '');
  const { uri } = await harness.open(TABLE);
  await harness.change(uri, text, ++version);
  const answer = (await harness.client.sendRequest(CompletionRequest.type, {
    textDocument: { uri },
    position: harness.positionAt(text, marked.indexOf('|')),
  })) as CompletionList | CompletionItem[] | null;
  if (answer === null) return [];
  return Array.isArray(answer) ? answer : answer.items;
}

const labels = (items: readonly CompletionItem[]): string[] => items.map((i) => i.label).sort();

describe('the value of a delegate: marker (criterion 46)', () => {
  it('offers the events of the handlers above that read the row, without @, and nothing else', async () => {
    const items = await completeAt(table('delegate:p="|"'));
    expect(labels(items)).toEqual(['change', 'click']);
    // The merged list, every service included: nothing spelled as a binding.
    expect(items.filter((i) => i.label.startsWith('@'))).toEqual([]);
  });

  it('replaces only the word being typed', async () => {
    const items = await completeAt(table('delegate:p="cha|"'));
    expect(labels(items)).toEqual(['change', 'click']);
    const edit = items.find((i) => i.label === 'change')!.textEdit as { newText: string; range: { start: { character: number }; end: { character: number } } };
    expect(edit.newText).toBe('change');
    expect(edit.range.end.character - edit.range.start.character).toBe('cha'.length);
  });

  it('leaves out what the value already lists', async () => {
    expect(labels(await completeAt(table('delegate:p="change |"')))).toEqual(['click']);
    expect(labels(await completeAt(table('delegate:p="| change"')))).toEqual(['click']);
  });

  it('is empty, and claimed, for a marker whose row no ancestor reads', async () => {
    // `q` is marked and nobody reads it: no event to offer, and nothing else may answer there.
    const unread = table('delegate:p', '<i delegate:q="|"></i>');
    expect(await completeAt(unread)).toEqual([]);
    const inLoop = table('delegate:p').replace('<td><button', '<td><b delegate:z="|"></b><button');
    expect(await completeAt(inLoop)).toEqual([]);
  });

  it('reads through constructs whose header the batch does not register: a @while, a @for', async () => {
    const inWhile = table('delegate:p="|"').replace(
      '<td><button',
      '<td>@while (false) { <i></i> }<button',
    );
    expect(labels(await completeAt(inWhile))).toEqual(['change', 'click']);
    const inFor = table('delegate:p="|"').replace(
      '<td><button',
      '<td>@for (let k = 0; k < 1; k++) { <i></i> }<button',
    );
    expect(labels(await completeAt(inFor))).toEqual(['change', 'click']);
  });

  it('a handler with no value yet, beside the readers, does not stop the list', async () => {
    const half = table('delegate:p="|"').replace('<table>', '<table @keydown=@()>');
    expect(labels(await completeAt(half))).toEqual(['change', 'click']);
  });

  it('every event once, even when two handlers of it read the row at different heights', async () => {
    const twice = table('delegate:p="|"').replace('<table>', '<table @click=@borrar(p)>');
    expect(labels(await completeAt(twice))).toEqual(['change', 'click']);
  });
});
