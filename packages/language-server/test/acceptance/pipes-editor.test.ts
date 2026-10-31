/**
 * SDD-71 criterion 15, from the view: a `.fud` imports the `export default` of
 * `src/pipes/truncar.ts`. Ctrl+Click on `truncar` opens `pipe truncar` in `truncar.fudapi`, and
 * its hover carries that pipe as written and its documentation, under TypeScript's own.
 *
 * Its own workspace: the pipe written here would change the names every other suite's files see.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DefinitionRequest, HoverRequest, type Hover, type Location } from 'vscode-languageserver-protocol/node';
import { URI } from 'vscode-uri';
import { copyWorkspace, startHarness, type Harness } from './_harness.js';

const VIEW = 'src/components/post-card.fud';

const SOURCE = `@code {
  import truncar from '../pipes/truncar';
  import iniciales from '../pipes/iniciales';
  const corto = truncar({ max: 40 });
  const texto = 'fudic';
}

<post-card>
  <template shadowrootmode="open">
    <p>@(texto | corto)</p>
    <p>@(texto | iniciales)</p>
  </template>
</post-card>
`;

const TRUNCAR_API = `# Cuts a text at \`max\` characters and adds an ellipsis.
pipe truncar
  on str
  max u32
`;

const TRUNCAR_TS = `import { truncar } from 'fudic:pipes/truncar';

export default truncar.implement((value, { max }) => (value.length <= max ? value : \`\${value.slice(0, max)}…\`));
`;

const INICIALES_API = `pipe iniciales
  on str
`;

const INICIALES_TS = `import { iniciales } from 'fudic:pipes/iniciales';

export default iniciales.implement((value) => value.slice(0, 1));
`;

let harness: Harness;
let root: string;

beforeAll(async () => {
  root = copyWorkspace();
  mkdirSync(`${root}/src/pipes`, { recursive: true });
  writeFileSync(`${root}/src/pipes/truncar.fudapi`, TRUNCAR_API, 'utf8');
  writeFileSync(`${root}/src/pipes/truncar.ts`, TRUNCAR_TS, 'utf8');
  writeFileSync(`${root}/src/pipes/iniciales.fudapi`, INICIALES_API, 'utf8');
  writeFileSync(`${root}/src/pipes/iniciales.ts`, INICIALES_TS, 'utf8');
  writeFileSync(`${root}/${VIEW}`, SOURCE, 'utf8');
  harness = await startHarness({ root });
  await harness.open(VIEW);
}, 60_000);

afterAll(async () => {
  await harness.stop();
});

function positionOf(needle: string, delta: number): { line: number; character: number } {
  const text = readFileSync(`${root}/${VIEW}`, 'utf8');
  const at = text.indexOf(needle);
  expect(at, `${needle} is in the view`).toBeGreaterThan(-1);
  return harness.positionAt(text, at + delta);
}

/** Where Ctrl+Click on the `delta`-th character of `needle` goes: the file, and the line it lands on. */
async function definitionAt(needle: string, delta: number): Promise<{ file: string; text: string }[]> {
  const answer = (await harness.client.sendRequest(DefinitionRequest.type, {
    textDocument: { uri: URI.file(`${root}/${VIEW}`).toString() },
    position: positionOf(needle, delta),
  })) as Location[] | null;
  return (answer ?? []).map((link) => {
    const path = URI.parse(link.uri).fsPath.replace(/\\/gu, '/');
    const lines = readFileSync(path, 'utf8').split('\n');
    const { start } = link.range;
    return { file: path.slice(path.indexOf('/src/') + 1), text: (lines[start.line] ?? '').slice(start.character).trimEnd() };
  });
}

async function hoverAt(needle: string, delta: number): Promise<string> {
  const hover = (await harness.client.sendRequest(HoverRequest.type, {
    textDocument: { uri: URI.file(`${root}/${VIEW}`).toString() },
    position: positionOf(needle, delta),
  })) as Hover | null;
  const contents = hover?.contents;
  return typeof contents === 'object' && contents !== null && 'value' in contents ? String(contents.value) : '';
}

describe('criterion 15: a pipe the view imports', () => {
  it('Ctrl+Click on it opens its `pipe` in the .fudapi beside the implementation', async () => {
    expect(await definitionAt('= truncar({', 3)).toEqual([{ file: 'src/pipes/truncar.fudapi', text: 'pipe truncar' }]);
  });

  it('from the right of a `|` too, for a pipe without parameters', async () => {
    expect(await definitionAt('| iniciales)', 3)).toEqual([{ file: 'src/pipes/iniciales.fudapi', text: 'pipe iniciales' }]);
  });

  it('its hover shows the pipe as written and its documentation', async () => {
    const shown = await hoverAt('= truncar({', 3);
    expect(shown).toContain('```fudapi\npipe truncar\n  on str\n  max u32\n```');
    expect(shown).toContain('Cuts a text at `max` characters and adds an ellipsis.');
  });

  it('a name that is no pipe keeps TypeScript\'s hover and definition', async () => {
    expect(await hoverAt('const texto', 7)).not.toContain('```fudapi');
    const [target] = await definitionAt('| corto)', 3);
    expect(target?.file).toBe('src/components/post-card.fud');
  });
});
