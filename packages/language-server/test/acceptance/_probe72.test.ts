import { afterAll, beforeAll, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { CompletionRequest, type CompletionItem, type CompletionList } from 'vscode-languageserver-protocol/node';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

let harness: Harness;
const T = 'src/components/app-table.fud';
const src = `@code {
  type Person = { id: number; name: string; active: boolean };
  const { personas = [] } = props<{ personas?: Person[] }>();
  function activar(p: Person, e: Event) { void p; void e; }
  function borrar(p: Person) { void p; }
  function nada() {}
}

<app-table>
  <template shadowrootmode="open">
    <table @click=@borrar(p)>
      <tbody @change=@activar(p, $event) @click=@borrar(p)>
        @foreach (const p of personas) key (p.id) {
          <tr>
            <td><input type="checkbox" delegate:p="|" aria-label="Activo"></td>
            <td><button delegate:p="click">Borrar</button></td>
          </tr>
        }
      </tbody>
    </table>
${'    '}
  </template>
</app-table>
`;

beforeAll(async () => {
  const root = copyWorkspace();
  writeFileSync(`${root}/${T}`, src.replace('|', ''), 'utf8');
  harness = await startHarness({ root });
}, 60000);
afterAll(async () => {
  await harness.stop();
});

it('probe', async () => {
  const text = src.replace('|', '');
  const { uri } = await harness.open(T);
  await harness.change(uri, text, 2);
  const a = (await harness.client.sendRequest(CompletionRequest.type, {
    textDocument: { uri },
    position: harness.positionAt(text, src.indexOf('|')),
  })) as CompletionList | CompletionItem[];
  for (const i of Array.isArray(a) ? a : a.items) {
    console.log('ITEM', JSON.stringify({ l: i.label, d: i.detail, s: i.sortText, ld: i.labelDetails, k: i.kind, te: i.textEdit }));
  }
});
