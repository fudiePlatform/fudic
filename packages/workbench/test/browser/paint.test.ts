/**
 * SDD-78 criteria 4 and 5, the bench's side, in Chrome: a component painted with a case of its
 * fixture reads in the browser as it reads in happy-dom — `- button "Save" [disabled]` is what
 * `outline` of `@fudic/testing` writes for that markup (outline-corpus.json, criterion 21 of
 * SDD-64) —, unless its CSS hides something, which only the browser sees. A prop that is not JSON
 * never reaches a page.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { paintCases, renderInBrowser } from '../../src/paint.js';
import { resolveTarget, type BenchTarget } from '../../src/target.js';
import { nodeTargetFs } from '../../src/open.js';
import { isFailure } from '../../src/types.js';
import '../helpers/bench.js';
import { tempProject, type TempProject } from '../helpers/project.js';

const SHY = 'src/components/app-shy.fud';

const COMPONENT = `@code {
  const { disabled = false, hidden = false } = props<{ disabled?: boolean; hidden?: boolean }>();
}

<head>
  <style>
    .gone { display: none; }
  </style>
</head>

<app-shy>
  <template shadowrootmode="open">
    <button disabled=@disabled class=@(hidden ? "gone" : "shown")>Save</button>
  </template>
</app-shy>
`;

const FIXTURE = `export default {
  disabled: { disabled: true },
  hidden: { disabled: true, hidden: true },
};
`;

let project: TempProject;

beforeAll(() => {
  project = tempProject('paint');
  project.write(SHY, COMPONENT);
  project.write('src/components/app-shy.fixture.ts', FIXTURE);
});

afterAll(() => {
  project.remove();
});

describe('criterion 4: the browser reads what happy-dom reads, unless CSS hides it', () => {
  it('a case with no hiding CSS: the outline happy-dom gives', async () => {
    const result = await renderInBrowser({ component: project.path(SHY), case: 'disabled' });
    expect(result).toEqual({ kind: 'rendered', outline: '- button "Save" [disabled]', errors: [] });
  }, 120_000);

  it('a case whose CSS has display: none: another outline, without the button', async () => {
    const result = await renderInBrowser({ component: project.path(SHY), case: 'hidden' });
    expect(result).toMatchObject({ kind: 'rendered' });
    const { outline } = result as { outline: string };
    expect(outline).not.toBe('- button "Save" [disabled]');
    expect(outline).not.toContain('button');
  }, 120_000);

  it('props on top of the case change what they change', async () => {
    const result = await renderInBrowser({ component: project.path(SHY), case: 'hidden', props: { hidden: false, disabled: false } });
    expect(result).toEqual({ kind: 'rendered', outline: '- button "Save"', errors: [] });
  }, 120_000);
});

describe('criterion 5: what cannot be painted', () => {
  it('a case the fixture has not: no-case, with the ones it has', async () => {
    expect(await renderInBrowser({ component: project.path(SHY), case: 'big' })).toEqual({ kind: 'no-case', cases: ['disabled', 'hidden'] });
  });

  it('a prop that is a function: not-json, naming it', async () => {
    expect(await renderInBrowser({ component: project.path(SHY), props: { onClick: () => undefined } as Record<string, unknown> })).toEqual({
      kind: 'not-json',
      prop: 'onClick',
    });
  }, 120_000);
});

describe('every case of the fixture, photographed', () => {
  it('a png of each host that has a size, none of one that has not', async () => {
    const target = resolveTarget(project.path(SHY), nodeTargetFs) as BenchTarget;
    expect(isFailure(target)).toBe(false);
    const painted = await paintCases({
      target,
      cases: [
        { name: 'disabled', values: { disabled: true } },
        { name: 'hidden', values: { disabled: true, hidden: true } },
      ],
      shoot: true,
    });
    expect(isFailure(painted)).toBe(false);
    const [shown, hidden] = painted as readonly { name: string; outline: string; png?: Buffer; errors: readonly string[] }[];
    expect(shown).toMatchObject({ name: 'disabled', outline: '- button "Save" [disabled]', errors: [] });
    // A PNG: its eight-byte signature.
    expect(shown!.png!.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(hidden!.name).toBe('hidden');
    expect(hidden!.png).toBeUndefined();
  }, 120_000);
});
