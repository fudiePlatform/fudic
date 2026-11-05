/**
 * `fudic_look` and `fudic_record { event: "look" }` (SDD-78 §4.4, §4.5; criteria 11–13). The
 * project is real — `fudic new` and a component with its fixture —, and so are its history, its
 * look hash and the shots on disk. The browser is the bench's to have: here its answer is given,
 * with PNGs that are bytes, so every verdict can be asked for.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BrowserLook, PaintedCase } from '@fudic/workbench';
import { Checks } from '../src/checks.js';
import type { Runners } from '../src/fudic.js';
import { LOOKS_DIR, lookDir, lookTool, type LookDeps } from '../src/look.js';
import { lookHashOf } from '../src/look-hash.js';
import { phasesOf, type Unit } from '../src/phases.js';
import { openProject } from '../src/project.js';
import { recordEvent } from '../src/record.js';
import type { Answer } from '../src/respond.js';
import { RunQueue } from '../src/runs.js';
import { stepOf } from '../src/status.js';
import { createServer } from '../src/server.js';
import { connect, newApp, tempDir } from './helpers.js';

/** When set, git has no user name: the person is the system's user. */
const who = vi.hoisted(() => ({ noGit: false }));
vi.mock('@fudic/history', async (original) => {
  const real = await original<typeof import('@fudic/history')>();
  return { ...real, git: async (cwd: string, args: readonly string[]) => (who.noGit ? undefined : real.git(cwd, args)) };
});

const PIECE = 'src/components/app-card/app-card.fud';
let app: Awaited<ReturnType<typeof newApp>>;
let checks: Checks;
const queue = new RunQueue();

beforeAll(async () => {
  app = await newApp();
  const from = fileURLToPath(new URL('../../../examples/basic/src/components/', import.meta.url));
  const to = join(app.root, 'src/components/app-card');
  mkdirSync(to, { recursive: true });
  for (const f of ['app-card.fud', 'app-card.fixture.ts']) copyFileSync(join(from, f), join(to, f));
  checks = new Checks(app.root);
}, 120_000);
afterAll(() => app.dispose());

const png = (text: string): Buffer => Buffer.from(text);
const shot = (name: string, bytes: string): PaintedCase => ({ name, outline: '', html: '', png: png(bytes), errors: [] });

/** A bench that answers `answer`, and remembers what it was asked. */
function bench(answer: BrowserLook): LookDeps & { asked: unknown[] } {
  const asked: unknown[] = [];
  const lookInBrowser: NonNullable<Runners['lookInBrowser']> = async (input) => {
    asked.push(input);
    return answer;
  };
  return { asked, runners: async () => ({ lookInBrowser }) };
}

const looked = (painted: readonly PaintedCase[], cases = painted.map((p) => p.name)): BrowserLook => ({ kind: 'looked', cases, painted });

const codes = (answer: Answer): readonly string[] => (answer.diagnostics ?? []).map((d) => d.code);
const cases = (answer: Answer): readonly Record<string, unknown>[] => answer.body['cases'] as Record<string, unknown>[];
const project = (): ReturnType<typeof openProject> => openProject(app.root);
const hashNow = (): string => lookHashOf(join(app.root, PIECE), app.root, app.root);
const unit = async (): Promise<Unit> => (await phasesOf(app.root, checks)).find((u) => u.piece === PIECE)!;

/** Rewrite the component's `.fud`: a change of how it looks. */
function restyle(from: string, to: string): void {
  const file = join(app.root, PIECE);
  writeFileSync(file, readFileSync(file, 'utf8').replace(from, to));
}

describe('what fudic_look refuses', () => {
  it('outside a fudic project: FUD1404', async () => {
    const dir = tempDir();
    try {
      expect(codes(await lookTool(openProject(dir.root), new Checks(dir.root), queue, { piece: 'x.fud' }, bench(looked([]))))).toEqual(['FUD1404']);
    } finally {
      dir.dispose();
    }
  });

  it('a path out of the project: FUD1400; a piece the project does not have: FUD1405', async () => {
    expect(codes(await lookTool(project(), checks, queue, { piece: '../x.fud' }, bench(looked([]))))).toEqual(['FUD1400']);
    const answer = await lookTool(project(), checks, queue, { piece: 'src/components/app-nope' }, bench(looked([])));
    expect([codes(answer), answer.failed]).toEqual([['FUD1405'], true]);
  });

  it('a route: FUD1426, before any browser (criterion 13)', async () => {
    const deps = bench(looked([]));
    const answer = await lookTool(project(), checks, queue, { piece: 'src/routes/index.fud' }, deps);
    expect(codes(answer)).toEqual(['FUD1426']);
    expect(deps.asked).toEqual([]);
  });

  it('without the bench installed: FUD1207', async () => {
    const answer = await lookTool(project(), checks, queue, { piece: PIECE }, { runners: async () => ({}) });
    expect(codes(answer)).toEqual(['FUD1207']);
  });

  it('what the bench says when it cannot open a browser, as it says it', async () => {
    const failure: BrowserLook = { diagnostic: { code: 'FUD1201', severity: 'error', message: 'no browser' } };
    expect(codes(await lookTool(project(), checks, queue, { piece: PIECE }, bench(failure)))).toEqual(['FUD1201']);
  });

  it('nothing to look at, a case that is not there, a fixture that threw', async () => {
    const run = (answer: BrowserLook): Promise<Answer> => lookTool(project(), checks, queue, { piece: PIECE }, bench(answer));
    const noFixture = await run({ kind: 'no-fixture' });
    expect([codes(noFixture), noFixture.diagnostics?.[0]?.message]).toEqual([['FUD1426'], `nothing to look at in ${PIECE}: it has no fixture`]);
    expect((await run({ kind: 'no-cases' })).diagnostics?.[0]?.message).toBe(`nothing to look at in ${PIECE}: its fixture has no cases`);
    const unknown = await run({ kind: 'no-case', name: 'nope', cases: ['a', 'b'] });
    expect([codes(unknown), unknown.diagnostics?.[0]?.message]).toEqual([['FUD1421'], 'the fixture of app-card has no case "nope"; its cases are: a, b']);
    expect(codes(await run({ kind: 'threw', message: 'boom' }))).toEqual(['FUD1420']);
  });
});

describe('a look, approved, and its change (criteria 11–13)', { timeout: 60_000 }, () => {
  it('fudic_record look before any fudic_look: FUD1427, and nothing written', async () => {
    const answer = await recordEvent(project(), checks, { piece: PIECE, event: 'look' });
    expect([codes(answer), answer.failed]).toEqual([['FUD1427'], true]);
    expect(existsSync(join(app.root, 'src/components/app-card/app-card.fudlog'))).toBe(false);
  });

  it('fudic_record look of a route: FUD1426', async () => {
    expect(codes(await recordEvent(project(), checks, { piece: 'src/routes/index.fud', event: 'look' }))).toEqual(['FUD1426']);
  });

  it('the first look: every case new, its shots in their folder, the images, and the view (criterion 11)', async () => {
    const deps = bench(looked([shot('titulo-largo', 'A1'), shot('destacada', 'B1'), shot('minima', 'C1')]));
    const answer = await lookTool(project(), checks, queue, { piece: 'src/components/app-card' }, deps);
    const hash = hashNow();
    expect(deps.asked).toEqual([{ component: expect.stringMatching(/app-card\.fud$/u) }]);
    expect(answer.body).toMatchObject({ piece: PIECE, look: 'none', hash });
    expect(cases(answer)).toEqual([
      { case: 'titulo-largo', criteria: [], verdict: 'new', after: `${LOOKS_DIR}/app-card/${hash}/titulo-largo.png` },
      { case: 'destacada', criteria: [], verdict: 'new', after: `${LOOKS_DIR}/app-card/${hash}/destacada.png` },
      { case: 'minima', criteria: [], verdict: 'new', after: `${LOOKS_DIR}/app-card/${hash}/minima.png` },
    ]);
    expect(readFileSync(join(lookDir(app.root, 'app-card', hash), 'destacada.png'), 'utf8')).toBe('B1');
    // No image goes to the model: the paths name them, and a chat that draws turns them into URLs.
    expect(answer).not.toHaveProperty('blocks');
    expect(answer.meta).toEqual({
      'fudic/view': {
        kind: 'look',
        cases: ['titulo-largo', 'destacada', 'minima'].map((name) => ({
          case: name,
          verdict: 'new',
          criteria: [],
          after: `${LOOKS_DIR}/app-card/${hash}/${name}.png`,
        })),
      },
    });
    expect(answer.next).toBe(
      'Show the user the before and after of app-card and ask whether they approve its look. Only if they do, call fudic_record { event: "look" }.',
    );
  });

  it('once the user approves it, the look is recorded and the phase is done (criterion 11)', async () => {
    const answer = await recordEvent(project(), checks, { piece: PIECE, event: 'look' });
    expect(answer.body).toEqual({ piece: PIECE, recorded: ['look'], hash: hashNow() });
    const history = readFileSync(join(app.root, 'src/components/app-card/app-card.fudlog'), 'utf8');
    expect(history).toMatch(new RegExp(`look\\s+by \\S+\\s+hash ${hashNow()}`, 'u'));
    expect((await unit()).look).toBe('valid');
  });

  it('the same pixels: every case same, no image, no paths', async () => {
    const answer = await lookTool(project(), checks, queue, { piece: PIECE }, bench(looked([shot('titulo-largo', 'A1'), shot('destacada', 'B1'), shot('minima', 'C1')])));
    expect(answer.body['look']).toBe('valid');
    expect(cases(answer)).toEqual(['titulo-largo', 'destacada', 'minima'].map((name) => ({ case: name, criteria: [], verdict: 'same' })));
  });

  it('a change of its CSS expires the look without a browser; the next look says what changed (criterion 12)', async () => {
    const before = hashNow();
    restyle('border: 1px solid var(--line);', 'border: 3px solid var(--line);');
    await checks.run();
    expect((await unit()).look).toBe('expired');
    expect(stepOf({ ...(await unit()), phase: 'look' })).toMatch(/^The look of app-card changed since it was approved\. Run fudic_look/u);

    const deps = bench(looked([shot('titulo-largo', 'A2'), shot('destacada', 'B1'), shot('nueva', 'D1')], ['titulo-largo', 'destacada', 'nueva']));
    const answer = await lookTool(project(), checks, queue, { piece: PIECE }, deps);
    const hash = hashNow();
    expect(hash).not.toBe(before);
    expect(answer.body).toMatchObject({ look: 'expired', hash });
    expect(cases(answer)).toEqual([
      { case: 'titulo-largo', criteria: [], verdict: 'changed', before: `${LOOKS_DIR}/app-card/${before}/titulo-largo.png`, after: `${LOOKS_DIR}/app-card/${hash}/titulo-largo.png` },
      { case: 'destacada', criteria: [], verdict: 'same' },
      { case: 'nueva', criteria: [], verdict: 'new', after: `${LOOKS_DIR}/app-card/${hash}/nueva.png` },
      { case: 'minima', criteria: [], verdict: 'gone', before: `${LOOKS_DIR}/app-card/${before}/minima.png` },
    ]);
    const view = (answer.meta?.['fudic/view'] as { cases: Record<string, unknown>[] }).cases;
    expect(view.map((c) => [c['case'], c['verdict'], 'before' in c, 'after' in c])).toEqual([
      ['titulo-largo', 'changed', true, true],
      ['destacada', 'same', true, true],
      ['nueva', 'new', false, true],
      ['minima', 'gone', true, false],
    ]);
    // The approved look's shots are kept: its line still names them.
    expect(existsSync(lookDir(app.root, 'app-card', before))).toBe(true);
  });

  it('`cases` compares only those: nothing is gone', async () => {
    const deps = bench(looked([shot('destacada', 'B1')], ['titulo-largo', 'destacada', 'minima']));
    const answer = await lookTool(project(), checks, queue, { piece: PIECE, cases: ['destacada'] }, deps);
    expect(deps.asked).toEqual([{ component: expect.any(String), cases: ['destacada'] }]);
    expect(cases(answer)).toEqual([{ case: 'destacada', criteria: [], verdict: 'same' }]);
  });

  it('a case that is no JSON, one that threw, one with errors in its page, one with nothing to photograph', async () => {
    const painted: PaintedCase[] = [
      { name: 'signal', notJson: 'count' },
      { name: 'broken', error: 'the page answered 500' },
      { name: 'noisy', outline: '', html: '', png: png('N'), errors: ['TypeError: x is undefined'] },
      { name: 'empty', outline: '', html: '', errors: [] },
      shot('destacada', 'B1'),
    ];
    const answer = await lookTool(project(), checks, queue, { piece: PIECE, cases: painted.map((p) => p.name) }, bench(looked(painted)));
    expect(codes(answer)).toEqual(['FUD1428', 'FUD1420', 'FUD1420', 'FUD1420']);
    expect(answer.diagnostics?.map((d) => d.message).slice(1)).toEqual([
      'app-card (broken) threw while rendering: the page answered 500',
      'app-card (noisy) threw while rendering: TypeError: x is undefined',
      'app-card (empty) threw while rendering: it drew nothing to photograph',
    ]);
    expect(cases(answer)).toEqual([{ case: 'destacada', criteria: [], verdict: 'same' }]);
    expect(answer.failed).toBeUndefined();
  });

  it('many changed cases: each named by its before and after', async () => {
    const names = ['a', 'b', 'c', 'd', 'e'];
    // First a look of these five, approved; then every one of them changed.
    await lookTool(project(), checks, queue, { piece: PIECE }, bench(looked(names.map((n) => shot(n, `${n}1`)))));
    expect((await recordEvent(project(), checks, { piece: PIECE, event: 'look' })).failed).toBeUndefined();
    restyle('border: 3px solid var(--line);', 'border: 4px solid var(--line);');
    await checks.run();
    const answer = await lookTool(project(), checks, queue, { piece: PIECE }, bench(looked(names.map((n) => shot(n, `${n}2`)))));
    // The earlier tests left other cases in the approved folder: those are gone, and carry no image.
    const five = cases(answer).filter((c) => names.includes(c['case'] as string));
    expect(five.every((c) => c['verdict'] === 'changed' && typeof c['before'] === 'string')).toBe(true);
  });

  it('the shots of the approved look are not on this disk: every case new, and next says why', async () => {
    rmSync(join(app.root, LOOKS_DIR), { recursive: true, force: true });
    const answer = await lookTool(project(), checks, queue, { piece: PIECE }, bench(looked([shot('a', 'a3')])));
    expect(cases(answer)).toEqual([{ case: 'a', criteria: [], verdict: 'new', after: `${LOOKS_DIR}/app-card/${hashNow()}/a.png` }]);
    expect(answer.next).toMatch(/^The shots of the last approved look are not on this disk, so every case is new\. Show the user/u);
  });

  it('the folders no look line names and that are not of now are swept when others are written', async () => {
    const stray = lookDir(app.root, 'app-card', 'ffffffffffff');
    mkdirSync(stray, { recursive: true });
    writeFileSync(join(stray, 'a.png'), 'x');
    await lookTool(project(), checks, queue, { piece: PIECE }, bench(looked([shot('a', 'a3')])));
    expect(existsSync(stray)).toBe(false);
    expect(existsSync(lookDir(app.root, 'app-card', hashNow()))).toBe(true);
  });

  it('the person of a look is the system user when git has no name for them', async () => {
    who.noGit = true;
    try {
      const answer = await recordEvent(project(), checks, { piece: PIECE, event: 'look' });
      expect(answer.body['recorded']).toEqual(['look']);
      const { userInfo } = await import('node:os');
      const history = readFileSync(join(app.root, 'src/components/app-card/app-card.fudlog'), 'utf8');
      const fields = history.trimEnd().split('\n').at(-1)!.split(/\s+/u).slice(2);
      expect(fields).toEqual(['look', 'by', userInfo().username.trim().replace(/\s+/gu, '-'), 'hash', hashNow()]);
    } finally {
      who.noGit = false;
    }
  });

  it('a reopened piece looks against nothing: its look before the reopening does not count', async () => {
    await recordEvent(project(), checks, { piece: PIECE, event: 'reopened', text: 'the client wants another prop' });
    expect((await unit()).look).toBe('none');
    const answer = await lookTool(project(), checks, queue, { piece: PIECE }, bench(looked([shot('a', 'a3')])));
    expect(answer.body['look']).toBe('none');
    expect(cases(answer)).toEqual([{ case: 'a', criteria: [], verdict: 'new', after: `${LOOKS_DIR}/app-card/${hashNow()}/a.png` }]);
  });
});

describe('the criteria of each case', () => {
  it('each case names the criteria of the .fudspec that mount it with props, in the answer and in the view', async () => {
    const spec = join(app.root, 'src/components/app-card/app-card.fudspec');
    // One with no name, one that mounts with a role, one with no case, and two that mount minima.
    writeFileSync(
      spec,
      [
        'component app-card',
        'criterion', '  given', '    props minima',
        'criterion uno', '  given', '    props minima', '    route /blog', '  then', '    visible app-card',
        'criterion dos', '  given', '    props role:button/"x"', '    props', '    props minima',
        'criterion tres', '  given', '    props destacada',
        '',
      ].join('\n'),
    );
    try {
      const answer = await lookTool(project(), checks, queue, { piece: PIECE, cases: ['minima', 'destacada', 'titulo-largo'] }, bench(looked([shot('minima', 'm'), shot('destacada', 'd'), shot('titulo-largo', 't')])));
      expect(cases(answer).map((c) => [c['case'], c['criteria']])).toEqual([
        ['minima', ['uno', 'dos']],
        ['destacada', ['tres']],
        ['titulo-largo', []],
      ]);
      const view = (answer.meta?.['fudic/view'] as { cases: Record<string, unknown>[] }).cases;
      expect(view.map((c) => c['criteria'])).toEqual([['uno', 'dos'], ['tres'], []]);
    } finally {
      rmSync(spec);
    }
  });
});

describe('with the bench of the project, in its browser', () => {
  it('a case photographed for real: a PNG in the folder of the hash of now', async () => {
    const answer = await lookTool(project(), checks, queue, { piece: PIECE, cases: ['minima'] });
    expect(codes(answer)).toEqual([]);
    const [minima] = cases(answer);
    expect(minima?.['case']).toBe('minima');
    const file = join(lookDir(app.root, 'app-card', hashNow()), 'minima.png');
    // The signature of a PNG: what the bench photographed is an image.
    expect(readFileSync(file).subarray(1, 4).toString('latin1')).toBe('PNG');
  }, 120_000);
});

describe('fudic_look through a client', () => {
  it('names the view in its _meta, and answers through respond: a route is FUD1426 with isError', async () => {
    const client = await connect(createServer({ project: project(), entry: 'stdio', checks }));
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === 'fudic_look')?._meta).toMatchObject({ ui: { resourceUri: 'ui://fudic/view.html' } });
    const result = await client.callTool({ name: 'fudic_look', arguments: { piece: 'src/routes/index.fud', cases: ['x'] } });
    expect(result.isError).toBe(true);
    expect((result.structuredContent as { diagnostics: { code: string }[] }).diagnostics.map((d) => d.code)).toEqual(['FUD1426']);
    await client.close();
  });
});

describe('the step of the look phase', () => {
  const base = { piece: PIECE, name: 'app-card', kind: 'component', phase: 'look' } as unknown as Unit;
  it('without a look, and with one that expired', () => {
    const step = `Run fudic_look { piece: "${PIECE}" } and show the user how app-card looks in each case. fudic_record look only after they approve it.`;
    expect(stepOf({ ...base, look: 'none' })).toBe(step);
    expect(stepOf({ ...base, look: 'expired' })).toBe(`The look of app-card changed since it was approved. ${step}`);
  });
});
