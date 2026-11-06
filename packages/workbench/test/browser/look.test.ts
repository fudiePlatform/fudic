/**
 * SDD-78 §4.4, the bench's side of `fudic_look`, in Chrome: every case of a component's fixture
 * on its page, photographed; the asked ones only with `cases`; and what there is no look of — no
 * fixture, no cases, a case that is not there, a fixture that throws — said before any browser.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { lookInBrowser } from '../../src/paint.js';
import '../helpers/bench.js';
import { tempProject, type TempProject } from '../helpers/project.js';

const CARD = 'src/components/app-tag.fud';

const COMPONENT = `@code {
  const { label = "tag" } = props<{ label?: string }>();
}

<head>
  <style>
    span { display: inline-block; padding: 4px 8px; border: 1px solid black; }
  </style>
</head>

<app-tag>
  <template shadowrootmode="open">
    <span>@label</span>
  </template>
</app-tag>
`;

let project: TempProject;

beforeAll(() => {
  project = tempProject('look');
  project.write(CARD, COMPONENT);
  project.write('src/components/app-tag.fixture.ts', 'export default {\n  short: { label: "A" },\n  long: { label: "A much longer label" },\n};\n');
  project.write('src/components/app-bare.fud', '<app-bare>\n  <template shadowrootmode="open">\n    <p>bare</p>\n  </template>\n</app-bare>\n');
  project.write('src/components/app-empty.fud', '<app-empty>\n  <template shadowrootmode="open">\n    <p>empty</p>\n  </template>\n</app-empty>\n');
  project.write('src/components/app-empty.fixture.ts', 'export default {};\n');
  project.write('src/components/app-throws.fud', '<app-throws>\n  <template shadowrootmode="open">\n    <p>x</p>\n  </template>\n</app-throws>\n');
  project.write('src/components/app-throws.fixture.ts', "throw new Error('the fixture broke');\n");
});

afterAll(() => {
  project.remove();
});

describe('lookInBrowser', () => {
  it('every case of the fixture, in its order, each with a PNG of the host', async () => {
    const result = await lookInBrowser({ component: project.path(CARD) });
    if (!('kind' in result) || result.kind !== 'looked') throw new Error(JSON.stringify(result));
    expect(result.cases).toEqual(['short', 'long']);
    expect(result.painted.map((p) => p.name)).toEqual(['short', 'long']);
    const [short, long] = result.painted.map((p) => ('png' in p ? p.png : undefined));
    expect(short?.subarray(1, 4).toString('latin1')).toBe('PNG');
    // Two labels of different length: two different shots.
    expect(short?.equals(long!)).toBe(false);
  }, 120_000);

  it('with `cases`, only those are painted; the list is still every case', async () => {
    const result = await lookInBrowser({ component: project.path(CARD), cases: ['long'] });
    if (!('kind' in result) || result.kind !== 'looked') throw new Error(JSON.stringify(result));
    expect([result.cases, result.painted.map((p) => p.name)]).toEqual([['short', 'long'], ['long']]);
  }, 120_000);

  it('a case the fixture does not have, before any browser', async () => {
    expect(await lookInBrowser({ component: project.path(CARD), cases: ['short', 'nope'] })).toEqual({
      kind: 'no-case',
      name: 'nope',
      cases: ['short', 'long'],
    });
  }, 60_000);

  it('no fixture, a fixture without cases, and one that throws', async () => {
    expect(await lookInBrowser({ component: project.path('src/components/app-bare.fud') })).toEqual({ kind: 'no-fixture' });
    expect(await lookInBrowser({ component: project.path('src/components/app-empty.fud') })).toEqual({ kind: 'no-cases' });
    const threw = await lookInBrowser({ component: project.path('src/components/app-throws.fud') });
    expect(threw).toMatchObject({ kind: 'threw', message: expect.stringContaining('the fixture broke') });
  }, 60_000);

  it('a file that is no component: what the bench says of it', async () => {
    expect(await lookInBrowser({ component: project.path('src/components/nothing.txt') })).toMatchObject({ diagnostic: { code: 'FUD0970' } });
  });
});
