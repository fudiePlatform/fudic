/**
 * SDD-59 §6.1, §6.2 and §6.7.4–6, end to end: a project with `@fudic/terms` installed and no
 * `fudic/terms/` of its own runs its criteria with the stock vocabulary. The workbench does not
 * import the package: the session resolves it from the project, as it does for a user.
 */

import { mkdirSync, rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { openWorkbench } from '../../src/open.js';
import type { ResultMessage, SessionMessage } from '../../src/protocol.js';
import { isFailure, type WorkbenchSession } from '../../src/types.js';
import { inbox, isSession, resultOf, tempProject, type TempProject } from '../helpers/project.js';

let project: TempProject | undefined;
let session: WorkbenchSession | undefined;

afterEach(async () => {
  await session?.close();
  project?.remove();
  session = undefined;
  project = undefined;
});

const STYLE = '<head>\n  <style>\n    :host { display: block; }\n  </style>\n</head>\n\n';

/** A menu that opens with the key `x` and gives the focus to its first item. */
const MENU_LISTENS =
  '@code {\n  import { signal } from "@fudic/core";\n\n' +
  '  const open = signal(false);\n  let first: HTMLElement | null = null;\n\n' +
  '  function onKey(event: KeyboardEvent) {\n' +
  '    if (event.key !== "x") return;\n' +
  '    open.set(true);\n' +
  '    requestAnimationFrame(() => first?.focus());\n' +
  '  }\n}\n\n' +
  STYLE +
  '<ui-menu @keydown=@onKey>\n  <template shadowrootmode="open" shadowrootdelegatesfocus>\n' +
  '    <button>Menu</button>\n' +
  '    @if (open()) {\n' +
  '      <ul role="menu">\n' +
  '        <li role="menuitem" tabindex="-1" ref="@first">Primero</li>\n' +
  '        <li role="menuitem" tabindex="-1">Segundo</li>\n' +
  '      </ul>\n' +
  '    }\n  </template>\n</ui-menu>\n';

/** The same menu, deaf to the keyboard. */
const MENU_DEAF =
  STYLE +
  '<ui-menu>\n  <template shadowrootmode="open" shadowrootdelegatesfocus>\n' +
  '    <button>Menu</button>\n  </template>\n</ui-menu>\n';

const CARD_WITH_ICON =
  STYLE + '<ui-card>\n  <template shadowrootmode="open">\n    <slot name="icon"></slot>\n    <p>card</p>\n  </template>\n</ui-card>\n';

const CARD_WITHOUT_ICON = STYLE + '<ui-card>\n  <template shadowrootmode="open">\n    <p>card</p>\n  </template>\n</ui-card>\n';

const BUTTON = STYLE + '<ui-button>\n  <template shadowrootmode="open">\n    <button>OK</button>\n  </template>\n</ui-button>\n';

/** §6.1, as the SDD writes it. */
const MENU_SPEC =
  'component ui-menu\n\ncriterion abre-con-tecla\n  given\n    props base\n  when\n    press ui-menu "x"\n' +
  '  then\n    visible role:menu\n    focused role:menuitem/"Primero"\n';

/** §6.2, as the SDD writes it. */
const CARD_SPEC =
  'component ui-card\n\ncriterion icono-en-su-slot\n  given\n    props conIcono\n' +
  '  then\n    slotted role:img/"estrella" icon\n    visible role:img/"estrella"\n';

/** §3.4: the fixture gives the card its icon. */
const CARD_FIXTURE =
  "export default {\n  base: {},\n  conIcono: { $content: '<span slot=\"icon\" role=\"img\" aria-label=\"estrella\">★</span>' },\n};\n";

/** §6.7.4, as the SDD writes it. */
const BUTTON_SPEC = 'component ui-button\n\ncriterion renders\n  given\n    props base\n  then\n    visible ui-button\n';

const BASE_FIXTURE = 'export default { base: {} };\n';

/**
 * A fresh project with `@fudic/terms` (unless `terms` is false) and no `fudic/terms/`, the given
 * files, and `tag` open in a workbench; its session message, and the results of `ids`.
 */
async function open(
  tag: string,
  files: Record<string, string>,
  ids: readonly string[],
  options: { readonly terms?: boolean } = {},
): Promise<{ message: SessionMessage; results: ResultMessage[] }> {
  project = tempProject('stock-terms', options);
  rmSync(project.path('fudic'), { recursive: true, force: true });
  for (const [file, content] of Object.entries(files)) project.write(`src/components/${file}`, content);
  const box = inbox();
  const answer = await openWorkbench(project.path(`src/components/${tag}.fud`), { onMessage: box.onMessage });
  if (isFailure(answer)) throw new Error(answer.diagnostic.message);
  session = answer;
  const message = await box.next(isSession, 0, 60_000);
  const results = await Promise.all(ids.map((id) => box.next(resultOf(id), 0, 60_000)));
  return { message, results };
}

/** Each step as `term → pass | error`, with its layer and evidence. */
const steps = (result: ResultMessage) =>
  result.steps.map((s) => ('pass' in s ? [s.term, s.layer, s.pass, s.evidence] : [s.term, s.layer, 'error', s.error]));

describe('SDD-59 §6.1 — keyboard', () => {
  it('green with the menu that opens with x', async () => {
    const { results } = await open(
      'ui-menu',
      { 'ui-menu.fud': MENU_LISTENS, 'ui-menu.fudspec': MENU_SPEC, 'ui-menu.fixture.ts': BASE_FIXTURE },
      ['abre-con-tecla'],
    );
    expect(steps(results[0]!)).toEqual([
      ['press', 'framework', true, 'pressed x'],
      ['visible', 'framework', true, 'visible'],
      ['focused', 'framework', true, 'focused'],
    ]);
    expect(results[0]!.verdict).toBe('pass');
  }, 90_000);

  it('red, with evidence, when the menu does not listen to the key', async () => {
    const { results } = await open(
      'ui-menu',
      { 'ui-menu.fud': MENU_DEAF, 'ui-menu.fudspec': MENU_SPEC, 'ui-menu.fixture.ts': BASE_FIXTURE },
      ['abre-con-tecla'],
    );
    expect(results[0]!.verdict).toBe('fail');
    expect(steps(results[0]!)).toEqual([
      ['press', 'framework', true, 'pressed x'],
      ['visible', 'framework', false, 'hidden'],
      ['focused', 'framework', false, 'not there'],
    ]);
  }, 90_000);
});

describe('SDD-59 §6.2 — slots', () => {
  it('green with the card that declares icon, and the fixture conIcono', async () => {
    const { results } = await open(
      'ui-card',
      { 'ui-card.fud': CARD_WITH_ICON, 'ui-card.fudspec': CARD_SPEC, 'ui-card.fixture.ts': CARD_FIXTURE },
      ['icono-en-su-slot'],
    );
    expect(results[0]!.verdict).toBe('pass');
    expect(steps(results[0]!)).toEqual([
      ['slotted', 'framework', true, { expected: 'icon', actual: 'icon' }],
      ['visible', 'framework', true, 'visible'],
    ]);
  }, 90_000);

  it('red when the card does not declare icon, with actual none', async () => {
    const { results } = await open(
      'ui-card',
      { 'ui-card.fud': CARD_WITHOUT_ICON, 'ui-card.fudspec': CARD_SPEC, 'ui-card.fixture.ts': CARD_FIXTURE },
      ['icono-en-su-slot'],
    );
    expect(results[0]!.verdict).toBe('fail');
    expect(steps(results[0]!)[0]).toEqual(['slotted', 'framework', false, { expected: 'icon', actual: 'none' }]);
  }, 90_000);
});

describe('SDD-59 §6.7.4–6 — the layers', () => {
  const BUTTON_FILES = { 'ui-button.fud': BUTTON, 'ui-button.fudspec': BUTTON_SPEC, 'ui-button.fixture.ts': BASE_FIXTURE };

  it('4. with @fudic/terms and without fudic/terms/, renders is green with the stock visible', async () => {
    const { message, results } = await open('ui-button', BUTTON_FILES, ['renders']);
    expect(message.diagnostics).toEqual([]);
    expect(results[0]!.verdict).toBe('pass');
    expect(steps(results[0]!)).toEqual([['visible', 'framework', true, 'visible']]);
  }, 90_000);

  it('5. without @fudic/terms, visible is an unknown term, and nothing runs', async () => {
    const box = inbox();
    project = tempProject('stock-terms', { terms: false });
    rmSync(project.path('fudic'), { recursive: true, force: true });
    for (const [file, content] of Object.entries(BUTTON_FILES)) project.write(`src/components/${file}`, content);
    const answer = await openWorkbench(project.path('src/components/ui-button.fud'), { onMessage: box.onMessage });
    if (isFailure(answer)) throw new Error(answer.diagnostic.message);
    session = answer;
    const message = await box.next(isSession, 0, 60_000);
    expect(message.diagnostics).toEqual([
      expect.objectContaining({ code: 'FUD0940', severity: 'error', line: 7 }),
    ]);
    expect(message.diagnostics[0]!.message).toContain('visible');
    expect(message.criteria).toEqual([]);
  }, 90_000);

  it("6. the project's fudic/terms/then/visible.js replaces the stock one", async () => {
    project = tempProject('stock-terms');
    rmSync(project.path('fudic'), { recursive: true, force: true });
    mkdirSync(project.path('fudic/terms/then'), { recursive: true });
    project.write(
      'fudic/terms/then/visible.js',
      "export const meta = { name: 'visible', block: 'then', params: [{ name: 'target', type: 'element' }] };\n" +
        "export async function run() { return { pass: true, evidence: 'the project says so' }; }\n" +
        "export const selfTest = [{ args: { target: 'ui-button' }, expect: 'pass' }];\n",
    );
    for (const [file, content] of Object.entries(BUTTON_FILES)) project.write(`src/components/${file}`, content);
    const box = inbox();
    const answer = await openWorkbench(project.path('src/components/ui-button.fud'), { onMessage: box.onMessage });
    if (isFailure(answer)) throw new Error(answer.diagnostic.message);
    session = answer;
    const result = await box.next(resultOf('renders'), 0, 60_000);
    expect(steps(result)).toEqual([['visible', 'workspace', true, 'the project says so']]);
  }, 90_000);
});
