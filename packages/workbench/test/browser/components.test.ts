/**
 * Criterion 5 of BUG-48, end to end: one process is one project. A second component opens into
 * the same Vite and the same browser, its pages live at /<tag>/<slug>, a save reruns only the
 * components that read the file, and closing one takes its pages away.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFailure, type WorkbenchSession } from '../../src/types.js';
import { inbox, resultOf, runningOf, tempProject, type Inbox, type TempProject } from '../helpers/project.js';

const starts = vi.hoisted(() => ({ vite: 0, browser: 0 }));

vi.mock('../../src/vite.js', async (original) => {
  const real = await original<typeof import('../../src/vite.js')>();
  return {
    ...real,
    startVite: (input: Parameters<typeof real.startVite>[0]) => {
      starts.vite += 1;
      return real.startVite(input);
    },
  };
});

vi.mock('../../src/browser.js', async (original) => {
  const real = await original<typeof import('../../src/browser.js')>();
  return {
    ...real,
    launchBrowser: (...args: Parameters<typeof real.launchBrowser>) => {
      starts.browser += 1;
      return real.launchBrowser(...args);
    },
  };
});

const { openWorkbench } = await import('../../src/open.js');

const TABS = 'src/components/app-tabs.fud';
const FRAME = 'src/components/app-frame.fud';
const TABS_SPEC = 'component app-tabs\n\ncriterion empieza-en-a\n  then\n    text role:tabpanel "panel A"\n';
const FRAME_SPEC = 'component app-frame\n\ncriterion asignado\n  then\n    text app-frame "assigned words"\n';

let project: TempProject | undefined;
let session: WorkbenchSession | undefined;

afterEach(async () => {
  await session?.close();
  project?.remove();
  session = undefined;
  project = undefined;
  starts.vite = 0;
  starts.browser = 0;
});

async function opened(): Promise<{ s: WorkbenchSession; box: Inbox; origin: string }> {
  project = tempProject('two');
  project.write('src/components/app-tabs.fudspec', TABS_SPEC);
  project.write('src/components/app-frame.fudspec', FRAME_SPEC);
  const box = inbox();
  const answer = await openWorkbench(project.path(TABS), { onMessage: box.onMessage });
  if (isFailure(answer)) throw new Error(answer.diagnostic.message);
  session = answer;
  await box.next(resultOf('empieza-en-a'));
  return { s: answer, box, origin: new URL(answer.url).origin };
}

const html = { headers: { accept: 'text/html' } };

describe('one process, two components — criterion 5', () => {
  it('opens the second into the same Vite and browser, with its own shell and pages', async () => {
    const { s, box, origin } = await opened();
    expect([starts.vite, starts.browser]).toEqual([1, 1]);
    const frame = await s.open(project!.path(FRAME));
    expect(frame).toEqual({
      url: `${origin}/__bench/app-frame/`,
      tag: 'app-frame',
      component: project!.path(FRAME),
      criteria: 1,
    });
    expect([starts.vite, starts.browser]).toEqual([1, 1]);
    expect(await box.next(resultOf('asignado'))).toMatchObject({ tag: 'app-frame', verdict: 'pass' });
    expect((await fetch(`${origin}/app-frame/asignado`, html)).status).toBe(200);
    expect((await fetch(`${origin}/__bench/app-frame/`)).status).toBe(200);

    // Open again: the same answer, nothing reloaded.
    const from = box.messages.length;
    expect(await s.open(project!.path('src/components/app-frame.fudspec'))).toEqual(frame);
    await new Promise((done) => setTimeout(done, 300));
    expect(box.messages.slice(from)).toEqual([]);
  }, 120_000);

  it('a save reruns only the components that read the file', async () => {
    const { s, box } = await opened();
    await s.open(project!.path(FRAME));
    await box.next(resultOf('asignado'));

    let from = box.messages.length;
    project!.write(FRAME, `${project!.read(FRAME)}\n`);
    await box.next(runningOf('app-frame'), from);
    await box.next(resultOf('asignado'), from);
    await new Promise((done) => setTimeout(done, 500));
    expect(box.messages.slice(from).some(runningOf('app-tabs'))).toBe(false);

    // app-frame links app-slotted: saving it reruns app-frame, and app-tabs reads neither.
    from = box.messages.length;
    const slotted = 'src/components/app-slotted.fud';
    project!.write(slotted, `${project!.read(slotted)}\n`);
    expect((await box.next(runningOf('app-frame'), from)).trigger.file).toBe(project!.path(slotted));
    await box.next(resultOf('asignado'), from);
    await new Promise((done) => setTimeout(done, 500));
    expect(box.messages.slice(from).some(runningOf('app-tabs'))).toBe(false);
  }, 120_000);

  it('close takes the component\'s pages away and stops running it; the other lives on', async () => {
    const { s, box, origin } = await opened();
    await s.open(project!.path(FRAME));
    await box.next(resultOf('asignado'));
    s.closeComponent('app-frame');
    s.closeComponent('nobody');
    expect((await fetch(`${origin}/app-frame/asignado`, html)).status).toBe(404);
    expect((await fetch(`${origin}/app-tabs/empieza-en-a`, html)).status).toBe(200);

    const from = box.messages.length;
    project!.write(FRAME, `${project!.read(FRAME)}\n`);
    project!.write(TABS, `${project!.read(TABS)}\n`);
    await box.next(runningOf('app-tabs'), from);
    await new Promise((done) => setTimeout(done, 500));
    expect(box.messages.slice(from).some(runningOf('app-frame'))).toBe(false);
  }, 120_000);

  it('refuses a component of another project (FUD0977), and a file that is no component', async () => {
    const { s } = await opened();
    const other = tempProject('other');
    try {
      const foreign = await s.open(other.path(TABS));
      expect(isFailure(foreign) && foreign.diagnostic).toMatchObject({ code: 'FUD0977', severity: 'error' });
      project!.write('src/index.fud', '<!DOCTYPE html>\n<html><body></body></html>\n');
      const page = await s.open(project!.path('src/index.fud'));
      expect(isFailure(page) && page.diagnostic.code).toBe('FUD0970');
    } finally {
      other.remove();
    }
  }, 120_000);
});
