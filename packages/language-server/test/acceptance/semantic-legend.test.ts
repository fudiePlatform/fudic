/**
 * The semantic tokens the editor receives, decoded with the legend the editor was TOLD.
 *
 * The server announces its own legend (§3.2) while Volar encodes every token against the one it
 * reads off its capabilities object. When those were two objects the numbering disagreed: our
 * own `fud…` types lined up by accident of position and every standard one came out as its
 * neighbour — a variable read as a parameter, a snippet call as an enum member. Only a real
 * server over a real TypeScript shows it, so this goes over the wire.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SemanticTokensRequest } from 'vscode-languageserver-protocol/node';
import { startHarness, type Harness } from './_harness.js';

let harness: Harness;

beforeAll(async () => {
  harness = await startHarness();
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

/** Every token of `text` as `word type`, decoded with the legend of the initialize result. */
async function tokensOf(relative: string, text: string): Promise<string[]> {
  const { uri } = await harness.open(relative, text);
  const got = (await harness.client.sendRequest(SemanticTokensRequest.type, { textDocument: { uri } })) as {
    data: number[];
  };
  const { tokenTypes } = harness.capabilities.capabilities.semanticTokensProvider!.legend;
  const lines = text.split('\n');
  const out: string[] = [];
  let line = 0;
  let character = 0;
  for (let i = 0; i < got.data.length; i += 5) {
    const [deltaLine, deltaChar, length, type] = got.data.slice(i, i + 4) as [number, number, number, number];
    line += deltaLine;
    character = deltaLine === 0 ? character + deltaChar : deltaChar;
    out.push(`${lines[line]!.slice(character, character + length)} ${tokenTypes[type]!}`);
  }
  return out;
}

describe('the legend the editor decodes with is the one the tokens were numbered in', () => {
  it('paints a variable of the scope as a variable, TypeScript’s voice beside ours', async () => {
    const tokens = await tokensOf(
      'blog/legend.fud',
      '<link rel="layout" href="../layouts/_layout.fud">\n@code {\n  const cuenta = 1;\n}\n<p>@cuenta</p>\n',
    );

    expect(tokens).toContain('cuenta variable');
    expect(tokens).not.toContain('cuenta parameter');
    expect(tokens).toContain('@ fudAt');
  });
});
