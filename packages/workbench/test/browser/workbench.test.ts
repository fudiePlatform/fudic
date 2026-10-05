/**
 * Criteria 16 to 19 and 21, end to end: `openWorkbench` on a throwaway project, with a shell
 * listening on its WebSocket, and files saved under it as a person would.
 */

import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { launchBrowser } from '../../src/browser.js';
import { openWorkbench } from '../../src/open.js';
import { isFailure, type WorkbenchSession } from '../../src/types.js';
import { connectShell, isRunning, isSession, resultOf, tempProject, type Shell, type TempProject } from '../helpers/project.js';

const TABS = 'src/components/app-tabs.fud';
const TABS_SPEC = `component app-tabs

criterion cambia-de-pestana
  when
    click role:tab/"Tab B"
  then
    text role:tabpanel "panel B"
`;

let project: TempProject | undefined;
let session: WorkbenchSession | undefined;
let shell: Shell | undefined;

afterEach(async () => {
  shell?.close();
  await session?.close();
  project?.remove();
  shell = undefined;
  session = undefined;
  project = undefined;
});

async function open(p: TempProject, file: string): Promise<{ session: WorkbenchSession; shell: Shell }> {
  const opened = await openWorkbench(p.path(file));
  if (isFailure(opened)) throw new Error(opened.diagnostic.message);
  session = opened;
  shell = await connectShell(opened.url);
  return { session: opened, shell };
}

describe('criterion 16 — the fixture executed', () => {
  /** A component with one optional prop: it mounts with props and without. */
  const GREET = [
    '@code {',
    '  const { name = "nobody" } = props<{ name?: string }>();',
    '}',
    '',
    '<app-greet>',
    '  <template shadowrootmode="open">',
    '    <p>Hello @name</p>',
    '  </template>',
    '</app-greet>',
    '',
  ].join('\n');

  it('mounts with the values of the executed object', async () => {
    project = tempProject('fixture');
    project.write('src/components/app-greet.fud', GREET);
    project.write('src/components/app-greet.fixture.ts', "export default { uno: { name: ['big', 'world'].join(' ') } };\n");
    project.write(
      'src/components/app-greet.fudspec',
      'component app-greet\n\ncriterion saluda\n  given\n    props uno\n  then\n    text app-greet "Hello big world"\n',
    );
    const { session: s, shell: sh } = await open(project, 'src/components/app-greet.fud');
    expect(s).toMatchObject({ tag: 'app-greet', criteria: 1, component: project.path('src/components/app-greet.fud') });
    expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/__bench\/$/u);
    expect(await sh.next(resultOf('saluda'))).toMatchObject({ verdict: 'pass' });
  }, 60_000);

  it('a fixture that throws is FUD0973, its criteria with props in error, the others run', async () => {
    project = tempProject('fixture-throws');
    project.write('src/components/app-greet.fud', GREET);
    // Its keys read statically (the validator is happy); it is executing it that throws.
    project.write(
      'src/components/app-greet.fixture.ts',
      "const boom = (): string => {\n  throw new Error('the fixture broke');\n};\n\nexport default { uno: { name: boom() } };\n",
    );
    project.write(
      'src/components/app-greet.fudspec',
      'component app-greet\n\ncriterion con-props\n  given\n    props uno\n  then\n    visible app-greet\n\n' +
        'criterion desnudo\n  then\n    text app-greet "Hello nobody"\n',
    );
    const { shell: sh } = await open(project, 'src/components/app-greet.fudspec');
    const message = await sh.next(isSession);
    expect(message.diagnostics).toMatchObject([
      { code: 'FUD0973', severity: 'error', file: project.path('src/components/app-greet.fixture.ts') },
    ]);
    expect(message.diagnostics[0]!.message).toContain('the fixture broke');
    expect(await sh.next(resultOf('con-props'))).toMatchObject({
      verdict: 'error',
      steps: [],
      error: expect.stringContaining('the fixture broke') as unknown,
    });
    expect(await sh.next(resultOf('desnudo'))).toMatchObject({ verdict: 'pass' });
  }, 60_000);
});

describe('criterion 17 — a .fudspec that does not validate', () => {
  it('sends its diagnostics in the session and runs nothing', async () => {
    project = tempProject('invalid');
    project.write('src/components/app-tabs.fudspec', 'component app-tabs\n\ncriterion roto\n  then\n    no-such-term app-tabs\n');
    const { session: s, shell: sh } = await open(project, TABS);
    expect(s.criteria).toBe(0);
    const message = await sh.next(isSession);
    expect(message.criteria).toEqual([]);
    expect(message.diagnostics.length).toBeGreaterThan(0);
    expect(message.diagnostics[0]).toMatchObject({
      severity: 'error',
      file: project.path('src/components/app-tabs.fudspec'),
      line: 5,
    });
    await new Promise((done) => setTimeout(done, 1500));
    expect(sh.messages.filter((m) => m.type === 'result')).toEqual([]);
  }, 60_000);
});

describe('criterion 18 — red, save the fix, green', () => {
  it('a running and then a pass, touching nothing else', async () => {
    project = tempProject('red-green');
    const fixed = project.read(TABS);
    // The bug: the handler of B shows panel A.
    project.write(TABS, fixed.replace('active.set(1);', 'active.set(0);'));
    project.write('src/components/app-tabs.fudspec', TABS_SPEC);
    const { shell: sh } = await open(project, TABS);
    expect(await sh.next(resultOf('cambia-de-pestana'))).toMatchObject({
      verdict: 'fail',
      steps: [{ term: 'click' }, { term: 'text', pass: false, evidence: 'panel A' }],
    });

    const from = sh.messages.length;
    const saved = Date.now();
    project.write(TABS, fixed);
    const running = await sh.next(isRunning, from);
    expect(running.ids).toEqual(['cambia-de-pestana']);
    const after = sh.messages.indexOf(running);
    expect(await sh.next(resultOf('cambia-de-pestana'), after)).toMatchObject({ verdict: 'pass' });
    // Vite's full-reload, not the 10 s fallback, started the run.
    expect(Date.now() - saved).toBeLessThan(9_000);
  }, 90_000);
});

describe('criterion 19 — saving the .fudspec or a term', () => {
  it('a new criterion is a session with one more, its page served, without restarting', async () => {
    project = tempProject('new-criterion');
    project.write('src/components/app-tabs.fudspec', TABS_SPEC);
    const { session: s, shell: sh } = await open(project, TABS);
    await sh.next(resultOf('cambia-de-pestana'));
    const from = sh.messages.length;
    project.write(
      'src/components/app-tabs.fudspec',
      `${TABS_SPEC}\ncriterion empieza-en-a\n  then\n    text role:tabpanel "panel A"\n`,
    );
    const next = await sh.next(isSession, from);
    expect(next.criteria.map((c) => c.id)).toEqual(['cambia-de-pestana', 'empieza-en-a']);
    expect(next.criteria[1]).toEqual({
      id: 'empieza-en-a',
      route: '/empieza-en-a',
      steps: [{ block: 'then', text: 'role:tabpanel says "panel A"' }],
    });
    expect(await sh.next(resultOf('empieza-en-a'), from)).toMatchObject({ verdict: 'pass' });
    const origin = s.url.replace('/__bench/', '');
    const page = await fetch(`${origin}/empieza-en-a`, { headers: { accept: "text/html" } });
    expect(page.status).toBe(200);
  }, 90_000);

  it('a term saved runs again with the new term', async () => {
    project = tempProject('term');
    project.write('src/components/app-tabs.fudspec', TABS_SPEC);
    const { shell: sh } = await open(project, TABS);
    expect(await sh.next(resultOf('cambia-de-pestana'))).toMatchObject({
      verdict: 'pass',
      steps: [{}, { evidence: 'panel B' }],
    });
    const from = sh.messages.length;
    const term = project.read('fudic/terms/then/text.js');
    project.write('fudic/terms/then/text.js', term.replace('evidence: text }', 'evidence: `v2: ${text}` }'));
    expect(await sh.next(resultOf('cambia-de-pestana'), from)).toMatchObject({
      verdict: 'pass',
      steps: [{}, { evidence: 'v2: panel B' }],
    });
  }, 90_000);

  it('a .fudspec written after the workbench opened is picked up', async () => {
    project = tempProject('late-spec');
    const { session: s, shell: sh } = await open(project, TABS);
    expect(s.criteria).toBe(1);
    expect((await sh.next(isSession)).diagnostics).toMatchObject([{ code: 'FUD0972', severity: 'warning' }]);
    expect(await sh.next(resultOf('app-tabs'))).toMatchObject({ verdict: 'pass', steps: [] });
    const from = sh.messages.length;
    project.write('src/components/app-tabs.fudspec', TABS_SPEC);
    const next = await sh.next(isSession, from);
    expect(next.diagnostics).toEqual([]);
    expect(await sh.next(resultOf('cambia-de-pestana'), from)).toMatchObject({ verdict: 'pass' });
  }, 90_000);
});

describe('criterion 21 — one port: shell, its socket and Vite\'s HMR', () => {
  it('Vite\'s HMR connects on the workbench\'s port', async () => {
    project = tempProject('hmr');
    const { session: s } = await open(project, TABS);
    const hmr = new WebSocket(s.url.replace(/^http/u, 'ws').replace('/__bench/', '/'), 'vite-hmr');
    const first = await new Promise<string>((done, fail) => {
      hmr.addEventListener('message', (event) => done(String(event.data)));
      hmr.addEventListener('error', fail);
    });
    expect(JSON.parse(first)).toMatchObject({ type: 'connected' });
    hmr.close();
  }, 60_000);

  it('the shell paints one card per criterion, green or red', async () => {
    project = tempProject('shell');
    project.write(
      'src/components/app-tabs.fudspec',
      `${TABS_SPEC}\ncriterion falla\n  then\n    text role:tabpanel "panel Z"\n`,
    );
    const { session: s, shell: sh } = await open(project, TABS);
    await sh.next(resultOf('falla'));
    const browser = await launchBrowser();
    if (isFailure(browser)) throw new Error(browser.diagnostic.message);
    try {
      const page = await browser.newPage();
      expect(await page.goto(s.url)).toBe(200);
      await page.waitFor('() => document.querySelectorAll(".card[data-verdict=pass], .card[data-verdict=fail]").length === 2', null);
      const cards = await page.evaluate<string[][]>(
        '() => [...document.querySelectorAll(".card")].map((c) => [c.querySelector("h2").firstChild.textContent, c.dataset.verdict, new URL(c.querySelector("iframe").src).pathname])',
      );
      expect(cards).toEqual([
        ['cambia-de-pestana', 'pass', '/cambia-de-pestana'],
        ['falla', 'fail', '/falla'],
      ]);
      expect(await page.evaluate<string>('() => document.title')).toBe('Workbench · app-tabs');
    } finally {
      await browser.close();
    }
  }, 60_000);

  it('close is idempotent and leaves no workbench folder behind', async () => {
    project = tempProject('close');
    const { session: s } = await open(project, TABS);
    await Promise.all([s.close(), s.close()]);
    await s.close();
    expect(existsSync(project.path('node_modules/.fudic-bench'))).toBe(false);
  }, 60_000);
});
