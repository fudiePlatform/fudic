/**
 * `openWorkbench` when something gives way: no Chrome, a Chrome that dies under the run, a
 * session load that throws, a component deleted while open. Real Vite and real server; the
 * browser and the session loader are swapped where the failure has to be provoked.
 */

import { existsSync, rmSync } from 'node:fs';
import { FUD0975 } from '@fudic/diagnostics';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VIEWPORT, type BrowserLike } from '../../src/browser.js';
import { isFailure, type WorkbenchSession } from '../../src/types.js';
import { connectShell, isSession, resultOf, tempProject, type Shell, type TempProject } from '../helpers/project.js';

const control = vi.hoisted(() => ({
  browser: undefined as (() => Promise<unknown>) | undefined,
  loadThrows: false,
  loads: 0,
}));

vi.mock('../../src/browser.js', async (original) => {
  const real = await original<typeof import('../../src/browser.js')>();
  return { ...real, launchBrowser: () => (control.browser ?? real.launchBrowser)() };
});

vi.mock('../../src/session.js', async (original) => {
  const real = await original<typeof import('../../src/session.js')>();
  return {
    ...real,
    loadSession: (input: Parameters<typeof real.loadSession>[0]) => {
      control.loads += 1;
      if (control.loadThrows && control.loads > 1) return Promise.reject(new Error('the session broke\nstack'));
      return real.loadSession(input);
    },
  };
});

const { openWorkbench } = await import('../../src/open.js');

const TABS = 'src/components/app-tabs.fud';
const SPEC = 'component app-tabs\n\ncriterion a\n  then\n    visible role:tabpanel\n';

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
  control.browser = undefined;
  control.loadThrows = false;
  control.loads = 0;
});

async function open(file: string, options = {}): Promise<WorkbenchSession> {
  const opened = await openWorkbench(project!.path(file), options);
  if (isFailure(opened)) throw new Error(opened.diagnostic.message);
  session = opened;
  shell = await connectShell(opened.url);
  return opened;
}

describe('openWorkbench, failing', () => {
  it('answers FUD0970 for a page, before starting anything', async () => {
    project = tempProject('page');
    project.write('src/index.fud', '<!DOCTYPE html>\n<html><body></body></html>\n');
    const answer = await openWorkbench(project.path('src/index.fud'));
    expect(isFailure(answer) && answer.diagnostic.code).toBe('FUD0970');
    // The project has `@fudic/terms` in its node_modules; the workbench folder is what must not be there.
    expect(existsSync(project.path('node_modules/.fudic-bench'))).toBe(false);
  });

  it('without Chrome answers FUD0975, closes everything, and leaves no folder', async () => {
    project = tempProject('no-chrome');
    control.browser = async () => ({
      diagnostic: FUD0975({ tried: ['chrome'], reason: 'chrome: not found', install: 'npx playwright-core install chromium' }),
    });
    const answer = await openWorkbench(project.path(TABS));
    expect(isFailure(answer) && answer.diagnostic.code).toBe('FUD0975');
    expect(existsSync(project.path('node_modules/.fudic-bench'))).toBe(false);
  }, 60_000);

  it('a Chrome that dies under the run is a problem, not a crash', async () => {
    project = tempProject('dead-chrome');
    project.write('src/components/app-tabs.fudspec', SPEC);
    // It dies once the shell is listening: a problem is news, not state a late shell is sent.
    let die: () => void = () => undefined;
    const dying = new Promise<never>((_, reject) => {
      die = () => reject(new Error('Target page, context or browser has been closed\nmore'));
    });
    dying.catch(() => undefined);
    const dead: BrowserLike = { name: 'chrome', viewport: VIEWPORT, newPage: () => dying, close: async () => undefined };
    control.browser = async () => dead;
    await open(TABS);
    die();
    expect(await shell!.next((m) => m.type === 'problem')).toEqual({
      v: 2,
      type: 'problem',
      message: 'Target page, context or browser has been closed',
    });
  }, 60_000);

  it('a session load that throws on save is a problem, and the workbench lives on', async () => {
    project = tempProject('load-throws');
    project.write('src/components/app-tabs.fudspec', SPEC);
    control.loadThrows = true;
    await open(TABS);
    await shell!.next(resultOf('a'));
    const from = shell!.messages.length;
    project.write('src/components/app-tabs.fudspec', `${SPEC}\n`);
    expect(await shell!.next((m) => m.type === 'problem', from)).toMatchObject({ message: 'the session broke' });
    // It still runs, with the session it had.
    expect(await shell!.next(resultOf('a'), from)).toMatchObject({ verdict: 'pass' });
  }, 60_000);

  it('keeps the session target when the component disappears under it', async () => {
    project = tempProject('deleted');
    project.write('src/components/app-tabs.fudspec', SPEC);
    const s = await open(TABS);
    await shell!.next(resultOf('a'));
    rmSync(project.path(TABS));
    const from = shell!.messages.length;
    project.write('src/components/app-tabs.fudspec', `${SPEC}\ncriterion b\n  then\n    visible role:tabpanel\n`);
    const next = await shell!.next(isSession, from);
    expect(next.tag).toBe('app-tabs');
    expect(s.tag).toBe('app-tabs');
  }, 60_000);

  it('with keep, leaves the folder of pages on close', async () => {
    project = tempProject('keep');
    project.write('src/components/app-tabs.fudspec', SPEC);
    const s = await open(TABS, { keep: true });
    await shell!.next(resultOf('a'));
    await s.close();
    expect(existsSync(project.path(`node_modules/.fudic-bench/${process.pid}/routes/app-tabs/a.fud`))).toBe(true);
  }, 60_000);
});
