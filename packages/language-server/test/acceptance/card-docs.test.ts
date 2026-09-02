/**
 * Where a component and its props may be documented (decision 107).
 *
 * A copied workspace rather than the shared fixtures, because what is measured here is a
 * component written in a particular STYLE, and the fixtures are the four documents the rest of
 * the suite counts.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { HoverRequest, type Hover } from 'vscode-languageserver-protocol/node';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

let harness: Harness;

/**
 * A component documented the way the author writes it: the component's own JSDoc above the
 * type, and each member's AFTER it — which is where `oxfmt` parks a doc written past the `;`,
 * so it is the position the formatter itself chooses.
 */
const APP_INPUT = `@code {
  /**
   * Un input de texto.
   * Con una segunda línea.
   */
  type Props = {
    id: number /**Id del componente*/;
    /**Name del componente*/
    name: string;
  };
  const { id, name } = props<Props>();
}

<app-input>
  <template shadowrootmode="open"><input id="@(String(id))" name="@name"></template>
</app-input>
`;

beforeAll(async () => {
  const root = copyWorkspace();
  writeFileSync(`${root}/components/app-input.fud`, APP_INPUT, 'utf8');
  harness = await startHarness({ root });
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

/** The card over the tag of `<app-input>` as it is written in a page. */
async function card(): Promise<string> {
  const source =
    `<link rel="layout" href="../layouts/_layout.fud">\n` +
    `<link rel="component" href="../components/app-input.fud">\n` +
    `<app-input .id="1" .name="x"></app-input>\n`;
  const { uri } = await harness.open('blog/[slug].fud', source);
  const hover = await harness.client.sendRequest(HoverRequest.type, {
    textDocument: { uri },
    position: harness.positionAt(source, source.indexOf('app-input .id') + 2),
  });
  const contents = (hover as Hover | null)?.contents;
  return typeof contents === 'object' && contents !== null && 'value' in contents
    ? String(contents.value)
    : '';
}

describe('the documentation on a card', () => {
  it('takes the component doc from the top level, never from a member', async () => {
    // The bug this replaces: with «the first JSDoc of the `@code`», a member's doc became the
    // component's description and the card introduced `<app-input>` as «Id del componente».
    const shown = await card();

    expect(shown).toContain('Un input de texto.\nCon una segunda línea.');
    expect(shown.split('**Props**')[0]).not.toContain('Id del componente');
  });

  it('reads a member doc written AFTER the member', async () => {
    // TypeScript does not attach this one — a JSDoc documents what follows it — and fudic does,
    // because it is where the formatter leaves it.
    expect(await card()).toContain('- `.id` — `number`\n  Id del componente');
  });

  it('reads a member doc written before it, which is TypeScript’s own way', async () => {
    expect(await card()).toContain('- `.name` — `string`\n  Name del componente');
  });
});
