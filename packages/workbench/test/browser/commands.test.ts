/**
 * Criteria 8, 9 and 10 of BUG-48, end to end on a throwaway project: what a result carries (shots,
 * marks, the verdict before), and what the commands do to the runs — the same
 * controller whether they come from a shell's socket or from stdin.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { openWorkbench } from '../../src/open.js';
import type { ResultMessage } from '../../src/protocol.js';
import { isFailure, type WorkbenchSession } from '../../src/types.js';
import {
  connectShell,
  inbox,
  isCancelled,
  isSession,
  isState,
  resultOf,
  runningOf,
  tempProject,
  type Inbox,
  type Shell,
  type TempProject,
} from '../helpers/project.js';

const TABS = 'src/components/app-tabs.fud';

/**
 * A `when` that keeps asking the page for as long as it is told: a run long enough to cancel,
 * and one that ends as soon as its page closes, as any term working on the page does.
 */
const WAIT =
  "export const meta = { name: 'wait', block: 'when', params: [{ name: 'ms', type: 'number' }] };\n" +
  'export async function run(ctx, { ms }) {\n' +
  '  for (const end = Date.now() + ms; Date.now() < end; ) {\n' +
  "    await ctx.locate('app-tabs').isVisible();\n" +
  '    await new Promise((done) => setTimeout(done, 50));\n' +
  '  }\n' +
  '  return { pass: true, evidence: `${ms} ms` };\n}\n' +
  'export const selfTest = [];\n';

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

async function open(spec: string): Promise<{ s: WorkbenchSession; box: Inbox }> {
  project = tempProject('commands');
  project.write('fudic/terms/when/wait.js', WAIT);
  project.write('src/components/app-tabs.fudspec', `component app-tabs\n\n${spec}`);
  const box = inbox();
  const answer = await openWorkbench(project.path(TABS), { onMessage: box.onMessage });
  if (isFailure(answer)) throw new Error(answer.diagnostic.message);
  session = answer;
  return { s: answer, box };
}

/** Width and height of a PNG, from its IHDR chunk. */
function size(png: Buffer): { width: number; height: number } {
  expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

const all = async (box: Inbox, ids: readonly string[], from = 0): Promise<ResultMessage[]> =>
  Promise.all(ids.map((id) => box.next(resultOf(id), from, 60_000)));

describe('shots and marks — criterion 8', () => {
  it('a criterion with a when publishes before and after, both served as PNG, and its box falls inside after', async () => {
    const { s, box } = await open(
      'criterion cambia\n  when\n    click role:tab/"Tab B"\n  then\n    visible app-tabs\n    text role:tabpanel "panel B"\n',
    );
    // The session says the size every page opens at: the room the shell keeps for a shot.
    expect((await box.next(isSession)).viewport).toEqual({ width: 1280, height: 720, scale: 1 });
    const result = await box.next(resultOf('cambia'), 0, 60_000);
    expect(result.verdict).toBe('pass');
    const origin = new URL(s.url).origin;
    const shots: Record<string, { width: number; height: number }> = {};
    for (const kind of ['before', 'after'] as const) {
      const shot = result.shots[kind]!;
      expect(shot.url).toMatch(new RegExp(`^/__bench/app-tabs/shot/cambia/\\d+-${kind}\\.png$`, 'u'));
      const res = await fetch(origin + shot.url);
      expect(res.headers.get('content-type')).toBe('image/png');
      shots[kind] = size(Buffer.from(await res.arrayBuffer()));
      // At scale 1 the PNG is the element's CSS box, give or take the rounding of a fraction.
      expect(Math.abs(shot.width - shots[kind].width)).toBeLessThanOrEqual(1);
      expect(Math.abs(shot.height - shots[kind].height)).toBeLessThanOrEqual(1);
    }
    const after = shots['after']!;
    expect(result.marks.map((m) => [m.step, m.ref])).toEqual([
      [0, 'role:tab/"Tab B"'],
      [1, 'app-tabs'],
      [2, 'role:tabpanel'],
    ]);
    // The mounted element is the after shot: its box is the whole picture.
    const host = result.marks.find((m) => m.ref === 'app-tabs')!.box;
    expect([host.x, host.y]).toEqual([0, 0]);
    // A device pixel ratio above 1 makes the PNG larger than the CSS box: never smaller.
    expect(host.width).toBeLessThanOrEqual(after.width + 1);
    expect(host.height).toBeLessThanOrEqual(after.height + 1);
    expect(result.marks.find((m) => m.step === 2)!.box.width).toBeGreaterThan(0);
  }, 90_000);

  it('a criterion without a when has only the after shot', async () => {
    const { box } = await open('criterion mira\n  then\n    visible app-tabs\n');
    expect(Object.keys((await box.next(resultOf('mira'), 0, 60_000)).shots)).toEqual(['after']);
  }, 90_000);
});

describe('was — criterion 9', () => {
  it('a given route says the component was mounted alone; the second run carries the first verdict', async () => {
    const { s, box } = await open('criterion ruta\n  given\n    route /blog\n  then\n    visible app-tabs\n');
    const first = await box.next(resultOf('ruta'), 0, 60_000);
    expect(first.steps[0]).toEqual({ block: 'given', term: 'route', layer: 'workspace', args: ['/blog'], pass: true, evidence: 'mounted alone, not at /blog' });
    expect('was' in first).toBe(false);
    const from = box.messages.length;
    s.command({ v: 2, type: 'run', tag: 'app-tabs' });
    expect(await box.next(resultOf('ruta'), from, 60_000)).toMatchObject({ verdict: 'pass', was: 'pass' });
  }, 90_000);
});

const TWO =
  'criterion verde\n  then\n    text role:tabpanel "panel A"\n\n' + 'criterion rojo\n  then\n    text role:tabpanel "panel Z"\n';

describe('commands — criterion 10', () => {
  it('run with ids runs only those; with failing, the ones not in pass; and failing with none does nothing', async () => {
    const { s, box } = await open(TWO);
    await all(box, ['verde', 'rojo']);
    let from = box.messages.length;
    s.command({ v: 2, type: 'run', tag: 'app-tabs', ids: ['verde'] });
    expect((await box.next(runningOf('app-tabs'), from)).ids).toEqual(['verde']);
    expect((await box.next(runningOf('app-tabs'), from)).trigger.file).toBeNull();
    await box.next(resultOf('verde'), from, 60_000);

    from = box.messages.length;
    s.command({ v: 2, type: 'run', tag: 'app-tabs', failing: true });
    expect((await box.next(runningOf('app-tabs'), from)).ids).toEqual(['rojo']);
    await box.next(resultOf('rojo'), from, 60_000);

    // Fixed: nothing is failing any more.
    project!.write('src/components/app-tabs.fudspec', `component app-tabs\n\n${TWO.replace('panel Z', 'panel A')}`);
    from = box.messages.length;
    await all(box, ['verde', 'rojo'], from);
    from = box.messages.length;
    s.command({ v: 2, type: 'run', tag: 'app-tabs', failing: true });
    s.command({ v: 2, type: 'run', tag: 'nobody' });
    await new Promise((done) => setTimeout(done, 500));
    expect(box.messages.slice(from)).toEqual([]);
  }, 120_000);

  it('a save runs the failing ones first', async () => {
    const { box } = await open(TWO);
    await all(box, ['verde', 'rojo']);
    const from = box.messages.length;
    project!.write(TABS, `${project!.read(TABS)}\n`);
    expect((await box.next(runningOf('app-tabs'), from)).ids).toEqual(['rojo', 'verde']);
  }, 120_000);

  it('pin makes a save run only the pinned one; unpinned, it runs them all', async () => {
    const { s, box } = await open(TWO);
    await all(box, ['verde', 'rojo']);
    let from = box.messages.length;
    s.command({ v: 2, type: 'pin', tag: 'app-tabs', id: 'verde' });
    expect(await box.next(isState, from)).toEqual({ v: 2, type: 'state', tag: 'app-tabs', paused: false, pinned: 'verde', pending: 0 });
    project!.write(TABS, `${project!.read(TABS)}\n`);
    expect((await box.next(runningOf('app-tabs'), from)).ids).toEqual(['verde']);
    await box.next(resultOf('verde'), from, 60_000);

    from = box.messages.length;
    s.command({ v: 2, type: 'pin', tag: 'app-tabs', id: null });
    project!.write(TABS, `${project!.read(TABS)}\n`);
    expect((await box.next(runningOf('app-tabs'), from)).ids).toEqual(['rojo', 'verde']);
  }, 120_000);

  it('pinned, Run all and Run failing reach the pinned one alone; naming ids runs those', async () => {
    const { s, box } = await open(TWO);
    await all(box, ['verde', 'rojo']);
    let from = box.messages.length;
    s.command({ v: 2, type: 'pin', tag: 'app-tabs', id: 'verde' });
    await box.next(isState, from);

    from = box.messages.length;
    s.command({ v: 2, type: 'run', tag: 'app-tabs' });
    expect((await box.next(runningOf('app-tabs'), from)).ids).toEqual(['verde']);
    await box.next(resultOf('verde'), from, 60_000);

    // The pinned one passes: failing has nothing to run, though rojo fails.
    from = box.messages.length;
    s.command({ v: 2, type: 'run', tag: 'app-tabs', failing: true });
    await new Promise((done) => setTimeout(done, 500));
    expect(box.messages.slice(from)).toEqual([]);

    s.command({ v: 2, type: 'run', tag: 'app-tabs', ids: ['rojo'] });
    expect((await box.next(runningOf('app-tabs'), from)).ids).toEqual(['rojo']);
    await box.next(resultOf('rojo'), from, 60_000);

    from = box.messages.length;
    s.command({ v: 2, type: 'pin', tag: 'app-tabs', id: 'rojo' });
    await box.next(isState, from);
    s.command({ v: 2, type: 'run', tag: 'app-tabs', failing: true });
    expect((await box.next(runningOf('app-tabs'), from)).ids).toEqual(['rojo']);
  }, 120_000);

  it('pause counts the saves in pending and runs nothing; resume runs once, reloading if one asked for it', async () => {
    const { s, box } = await open(TWO);
    await all(box, ['verde', 'rojo']);
    const from = box.messages.length;
    s.command({ v: 2, type: 'pause', tag: 'app-tabs', paused: true });
    expect(await box.next(isState, from)).toMatchObject({ paused: true, pending: 0 });
    project!.write(TABS, `${project!.read(TABS)}\n`);
    await box.next((m): m is never => m.type === 'state' && m.pending === 1, from);
    project!.write('src/components/app-tabs.fudspec', `component app-tabs\n\n${TWO}\n`);
    await box.next((m): m is never => m.type === 'state' && m.pending === 2, from);
    expect(box.messages.slice(from).some(runningOf('app-tabs'))).toBe(false);

    const resumed = box.messages.length;
    s.command({ v: 2, type: 'pause', tag: 'app-tabs', paused: false });
    expect(await box.next(isState, resumed)).toMatchObject({ paused: false, pending: 0 });
    // The .fudspec was among the saves: the session is loaded again before the run.
    await box.next((m): m is never => m.type === 'session', resumed);
    await box.next(runningOf('app-tabs'), resumed);
    await all(box, ['verde', 'rojo'], resumed);
    await new Promise((done) => setTimeout(done, 500));
    expect(box.messages.slice(resumed).filter(runningOf('app-tabs'))).toHaveLength(1);

    // Paused with nothing saved: resuming runs nothing.
    const quiet = box.messages.length;
    s.command({ v: 2, type: 'pause', tag: 'app-tabs', paused: true });
    s.command({ v: 2, type: 'pause', tag: 'app-tabs', paused: false });
    await new Promise((done) => setTimeout(done, 500));
    expect(box.messages.slice(quiet).map((m) => m.type)).toEqual(['state', 'state']);
  }, 120_000);

  it('cancel publishes cancelled with the criteria it stopped, and their results never come', async () => {
    const { s, box } = await open(
      'criterion lento\n  when\n    wait 20000\n  then\n    visible app-tabs\n\n' +
        'criterion lento-dos\n  when\n    wait 20000\n  then\n    visible app-tabs\n',
    );
    expect((await box.next((m): m is Extract<typeof m, { type: 'session' }> => m.type === 'session')).diagnostics).toEqual([]);
    // Right after `running`, as Esc in the shell would: the pages may still be opening.
    await box.next(runningOf('app-tabs'));
    s.command({ v: 2, type: 'cancel', tag: 'app-tabs' });
    expect((await box.next(isCancelled, 0, 10_000)).ids.slice().sort()).toEqual(['lento', 'lento-dos']);
    expect(box.messages.some((m) => m.type === 'result')).toBe(false);
    // Nothing running: a cancel does nothing.
    s.command({ v: 2, type: 'cancel', tag: 'app-tabs' });
  }, 90_000);

  it('the same commands arrive through a shell\'s socket', async () => {
    const { s, box } = await open(TWO);
    await all(box, ['verde', 'rojo']);
    shell = await connectShell(s.url);
    const from = box.messages.length;
    shell.send({ v: 2, type: 'run', tag: 'app-tabs', ids: ['rojo'] });
    expect((await box.next(runningOf('app-tabs'), from)).ids).toEqual(['rojo']);
    shell.send({ v: 2, type: 'pin', tag: 'whatever', id: 'rojo' });
    expect(await box.next(isState, from)).toMatchObject({ tag: 'app-tabs', pinned: 'rojo' });
  }, 120_000);
});
